import Database from "better-sqlite3";
import type { MemoryItem, ScopeRef, TrustLevel, Checkpoint } from "@lattice-kernel/schemas";
import { PolicyDeniedError, ApprovalRequiredError, CheckpointNotFoundError } from "@lattice-kernel/schemas";
import type { MemoryStore, MemoryWriteInput, RetrieveOptions, VerifyResult } from "@lattice-kernel/memory";
import { cosineSimilarity, textOverlapScore } from "@lattice-kernel/memory";
import type { PolicyEngine } from "@lattice-kernel/policy-engine";
import type { AuditSink } from "@lattice-kernel/audit";

export type EmbedFunction = (content: string) => Promise<number[]>;

export interface SqliteMemoryStoreConfig {
  dbPath: string;
  policyEngine: PolicyEngine;
  auditSink: AuditSink;
  embed?: EmbedFunction;
}

const TRUST_ORDER: TrustLevel[] = [
  "quarantined",
  "untrusted_model_generated",
  "untrusted_external",
  "trusted_user_implicit",
  "trusted_user_explicit",
  "trusted_admin",
  "trusted_system",
];

function trustRank(level: TrustLevel): number {
  return TRUST_ORDER.indexOf(level);
}

let idCounter = 0;

function simpleHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

export function createSqliteMemoryStore(
  config: SqliteMemoryStoreConfig,
): MemoryStore {
  const { policyEngine, auditSink, embed } = config;
  const db = new Database(config.dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma("journal_mode = WAL");

  // Schema versioning for future migrations
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      component TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const currentVersion = db.prepare(
    "SELECT version FROM schema_version WHERE component = 'memory'"
  ).get() as { version: number } | undefined;
  if (!currentVersion) {
    db.prepare(
      "INSERT INTO schema_version (component, version, updated_at) VALUES ('memory', 1, ?)"
    ).run(new Date().toISOString());
  }

  // Create tables (v1 schema)
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_items (
      id TEXT PRIMARY KEY,
      scope_tenant TEXT,
      scope_app TEXT,
      scope_user TEXT,
      scope_session TEXT,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT NOT NULL,
      provenance TEXT NOT NULL,
      classification TEXT NOT NULL,
      trust_level TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT,
      retention_policy TEXT,
      subject_refs TEXT NOT NULL,
      tags TEXT NOT NULL,
      hash TEXT NOT NULL,
      embedding TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_memory_scope
      ON memory_items(scope_tenant, scope_app, scope_user, scope_session);
    CREATE INDEX IF NOT EXISTS idx_memory_type ON memory_items(type);
    CREATE INDEX IF NOT EXISTS idx_memory_expires ON memory_items(expires_at);

    CREATE TABLE IF NOT EXISTS memory_checkpoints (
      id TEXT PRIMARY KEY,
      target TEXT NOT NULL,
      target_ref TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL,
      description TEXT,
      hash TEXT NOT NULL,
      snapshot TEXT NOT NULL
    );
  `);

  // Prepared statements
  const insertItem = db.prepare(`
    INSERT INTO memory_items (id, scope_tenant, scope_app, scope_user, scope_session,
      type, content, source, provenance, classification, trust_level,
      created_at, expires_at, retention_policy, subject_refs, tags, hash, embedding)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const selectById = db.prepare("SELECT * FROM memory_items WHERE id = ?");
  const deleteById = db.prepare("DELETE FROM memory_items WHERE id = ?");
  const countAll = db.prepare("SELECT COUNT(*) as cnt FROM memory_items");
  const selectExpired = db.prepare(
    "SELECT id, scope_tenant, scope_app, scope_user, scope_session, trust_level FROM memory_items WHERE expires_at IS NOT NULL AND expires_at <= ?",
  );
  const deleteExpired = db.prepare(
    "DELETE FROM memory_items WHERE expires_at IS NOT NULL AND expires_at <= ?",
  );

  function rowToItem(row: Record<string, unknown>): MemoryItem {
    return {
      id: row.id as string,
      scope: {
        tenantId: row.scope_tenant as string | undefined,
        appId: row.scope_app as string | undefined,
        userId: row.scope_user as string | undefined,
        sessionId: row.scope_session as string | undefined,
      },
      type: row.type as MemoryItem["type"],
      content: row.content as string,
      source: row.source as string,
      provenance: JSON.parse(row.provenance as string),
      classification: row.classification as string,
      trustLevel: row.trust_level as TrustLevel,
      createdAt: row.created_at as string,
      expiresAt: (row.expires_at as string) || undefined,
      retentionPolicy: (row.retention_policy as string) || undefined,
      subjectRefs: JSON.parse(row.subject_refs as string),
      tags: JSON.parse(row.tags as string),
      hash: row.hash as string,
    };
  }

  function parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return 0;
    const value = parseInt(match[1]!, 10);
    switch (match[2]!) {
      case "s": return value * 1000;
      case "m": return value * 60 * 1000;
      case "h": return value * 60 * 60 * 1000;
      case "d": return value * 24 * 60 * 60 * 1000;
      default: return 0;
    }
  }

  return {
    async write(input: MemoryWriteInput): Promise<MemoryItem> {
      const decision = policyEngine.evaluate({
        operation: "canRemember",
        scope: input.scope,
        trustLevel: input.trustLevel,
      });

      if (!decision.allowed) {
        throw new PolicyDeniedError("memory write", decision.reason, decision.matchedRules);
      }
      if (decision.requiresApproval) {
        throw new ApprovalRequiredError("memory write", decision.matchedRules);
      }

      const id = `mem_${Date.now()}_${++idCounter}`;
      const now = new Date().toISOString();
      const hash = simpleHash(input.content + id);

      let expiresAt = input.expiresAt;
      if (!expiresAt && input.retentionPolicy) {
        const ms = parseDuration(input.retentionPolicy);
        if (ms > 0) expiresAt = new Date(Date.now() + ms).toISOString();
      }

      // Generate embedding if embed function provided
      let embeddingJson: string | null = null;
      if (embed) {
        try {
          const vec = await embed(input.content);
          embeddingJson = JSON.stringify(vec);
        } catch {
          // Embedding failure is non-fatal
        }
      }

      insertItem.run(
        id,
        input.scope.tenantId ?? null,
        input.scope.appId ?? null,
        input.scope.userId ?? null,
        input.scope.sessionId ?? null,
        input.type,
        input.content,
        input.source,
        JSON.stringify(input.provenance),
        input.classification,
        input.trustLevel,
        now,
        expiresAt ?? null,
        input.retentionPolicy ?? null,
        JSON.stringify(input.subjectRefs ?? []),
        JSON.stringify(input.tags ?? []),
        hash,
        embeddingJson,
      );

      const item: MemoryItem = {
        id,
        scope: input.scope,
        type: input.type,
        content: input.content,
        source: input.source,
        provenance: input.provenance,
        classification: input.classification,
        trustLevel: input.trustLevel,
        createdAt: now,
        expiresAt,
        retentionPolicy: input.retentionPolicy,
        subjectRefs: input.subjectRefs ?? [],
        tags: input.tags ?? [],
        hash,
      };

      await auditSink.emit({
        eventId: `evt_${id}`,
        type: "memory_write",
        requestId: id,
        scope: input.scope,
        trustLevel: input.trustLevel,
        timestamp: now,
        actor: input.source,
        policyDecisions: decision.matchedRules,
      });

      return item;
    },

    async retrieve(
      query: string,
      scope: ScopeRef,
      options: RetrieveOptions = {},
    ): Promise<MemoryItem[]> {
      const { topK = 10, types, minTrustLevel } = options;

      // Build WHERE clause
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (scope.tenantId) {
        conditions.push("scope_tenant = ?");
        params.push(scope.tenantId);
      }
      if (scope.appId) {
        conditions.push("scope_app = ?");
        params.push(scope.appId);
      }
      if (scope.userId) {
        conditions.push("scope_user = ?");
        params.push(scope.userId);
      }
      if (scope.sessionId) {
        conditions.push("scope_session = ?");
        params.push(scope.sessionId);
      }
      if (types && types.length > 0) {
        conditions.push(`type IN (${types.map(() => "?").join(",")})`);
        params.push(...types);
      }

      // Exclude expired
      conditions.push("(expires_at IS NULL OR expires_at > ?)");
      params.push(new Date().toISOString());

      const where =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const sql = `SELECT * FROM memory_items ${where} ORDER BY created_at DESC`;

      const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
      let results = rows.map(rowToItem);

      // Trust filtering
      if (minTrustLevel) {
        const minRank = trustRank(minTrustLevel);
        results = results.filter((item) => trustRank(item.trustLevel) >= minRank);
      }

      // Rank by embedding similarity if available, else text overlap
      if (embed) {
        try {
          const queryEmbedding = await embed(query);
          // Build embedding map from rows
          const embeddingMap = new Map<string, number[]>();
          for (const row of rows) {
            if (row.embedding) {
              embeddingMap.set(row.id as string, JSON.parse(row.embedding as string));
            }
          }

          if (embeddingMap.size > 0) {
            results.sort((a, b) => {
              const embA = embeddingMap.get(a.id);
              const embB = embeddingMap.get(b.id);
              const scoreA = embA ? cosineSimilarity(queryEmbedding, embA) : 0;
              const scoreB = embB ? cosineSimilarity(queryEmbedding, embB) : 0;
              return scoreB - scoreA;
            });
            return results.slice(0, topK);
          }
        } catch {
          // Fall through to text scoring
        }
      }

      // Fallback: text overlap scoring
      results.sort((a, b) => {
        const scoreA = textOverlapScore(query, a.content);
        const scoreB = textOverlapScore(query, b.content);
        return scoreB - scoreA;
      });

      return results.slice(0, topK);
    },

    async get(id: string): Promise<MemoryItem | undefined> {
      const row = selectById.get(id) as Record<string, unknown> | undefined;
      return row ? rowToItem(row) : undefined;
    },

    async delete(id: string): Promise<void> {
      deleteById.run(id);
    },

    async expireStale(): Promise<number> {
      const now = new Date().toISOString();
      const expired = selectExpired.all(now) as Record<string, unknown>[];

      for (const row of expired) {
        await auditSink.emit({
          eventId: `evt_exp_${row.id}`,
          type: "memory_expire",
          requestId: `meme_${Date.now()}`,
          scope: {
            tenantId: row.scope_tenant as string | undefined,
            appId: row.scope_app as string | undefined,
            userId: row.scope_user as string | undefined,
            sessionId: row.scope_session as string | undefined,
          },
          trustLevel: (row.trust_level as TrustLevel) ?? "trusted_system",
          timestamp: now,
          actor: "system",
          policyDecisions: [],
        });
      }

      const result = deleteExpired.run(now);
      return result.changes;
    },

    count(): number {
      const row = countAll.get() as { cnt: number };
      return row.cnt;
    },

    stats() {
      const total = (countAll.get() as { cnt: number }).cnt;
      const cpCount = (db.prepare("SELECT COUNT(*) as cnt FROM memory_checkpoints").get() as { cnt: number }).cnt;

      const typeRows = db.prepare("SELECT type, COUNT(*) as cnt FROM memory_items GROUP BY type").all() as Array<{ type: string; cnt: number }>;
      const itemsByType: Record<string, number> = {};
      for (const r of typeRows) itemsByType[r.type] = r.cnt;

      const tenantRows = db.prepare("SELECT COALESCE(scope_tenant, 'unknown') as tenant, COUNT(*) as cnt FROM memory_items GROUP BY scope_tenant").all() as Array<{ tenant: string; cnt: number }>;
      const itemsByTenant: Record<string, number> = {};
      for (const r of tenantRows) itemsByTenant[r.tenant] = r.cnt;

      return { totalItems: total, checkpointCount: cpCount, itemsByType, itemsByTenant };
    },

    async checkpoint(description?: string): Promise<Checkpoint> {
      const cpId = `cp_${Date.now()}_${++idCounter}`;
      const now = new Date().toISOString();

      // Snapshot all items
      const allItems = (
        db.prepare("SELECT * FROM memory_items").all() as Record<string, unknown>[]
      ).map(rowToItem);

      const contentHash = simpleHash(
        allItems.map((i) => i.hash).join(",") + cpId,
      );

      const meta: Checkpoint = {
        checkpointId: cpId,
        target: "memory",
        targetRef: "sqlite-memory-store",
        createdAt: now,
        createdBy: "system",
        description,
        hash: contentHash,
      };

      db.prepare(
        "INSERT INTO memory_checkpoints (id, target, target_ref, created_at, created_by, description, hash, snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        cpId,
        meta.target,
        meta.targetRef,
        meta.createdAt,
        meta.createdBy,
        meta.description ?? null,
        meta.hash,
        JSON.stringify(allItems),
      );

      return meta;
    },

    async rollback(checkpointId: string): Promise<void> {
      const row = db
        .prepare("SELECT * FROM memory_checkpoints WHERE id = ?")
        .get(checkpointId) as Record<string, unknown> | undefined;

      if (!row) {
        throw new CheckpointNotFoundError(checkpointId);
      }

      const items = JSON.parse(row.snapshot as string) as MemoryItem[];

      // Replace all items
      const tx = db.transaction(() => {
        db.prepare("DELETE FROM memory_items").run();
        for (const item of items) {
          insertItem.run(
            item.id,
            item.scope.tenantId ?? null,
            item.scope.appId ?? null,
            item.scope.userId ?? null,
            item.scope.sessionId ?? null,
            item.type,
            item.content,
            item.source,
            JSON.stringify(item.provenance),
            item.classification,
            item.trustLevel,
            item.createdAt,
            item.expiresAt ?? null,
            item.retentionPolicy ?? null,
            JSON.stringify(item.subjectRefs),
            JSON.stringify(item.tags),
            item.hash,
            null, // embedding lost on rollback
          );
        }
      });
      tx();
    },

    listCheckpoints(): Checkpoint[] {
      const rows = db
        .prepare(
          "SELECT id, target, target_ref, created_at, created_by, description, hash FROM memory_checkpoints ORDER BY created_at DESC",
        )
        .all() as Record<string, unknown>[];

      return rows.map((r) => ({
        checkpointId: r.id as string,
        target: r.target as Checkpoint["target"],
        targetRef: r.target_ref as string,
        createdAt: r.created_at as string,
        createdBy: r.created_by as string,
        description: (r.description as string) || undefined,
        hash: r.hash as string,
      }));
    },

    async verify(itemId: string): Promise<VerifyResult> {
      const item = await this.get(itemId);
      if (!item) {
        return {
          valid: false,
          target: itemId,
          expectedHash: "",
          actualHash: "",
          error: "Item not found",
        };
      }
      const actualHash = simpleHash(item.content + item.id);
      return {
        valid: actualHash === item.hash,
        target: itemId,
        expectedHash: item.hash,
        actualHash,
      };
    },

    async verifyCheckpoint(checkpointId: string): Promise<VerifyResult> {
      const row = db
        .prepare("SELECT hash, snapshot FROM memory_checkpoints WHERE id = ?")
        .get(checkpointId) as { hash: string; snapshot: string } | undefined;

      if (!row) {
        return {
          valid: false,
          target: checkpointId,
          expectedHash: "",
          actualHash: "",
          error: "Checkpoint not found",
        };
      }

      const items = JSON.parse(row.snapshot) as MemoryItem[];
      const actualHash = simpleHash(
        items.map((i) => i.hash).join(",") + checkpointId,
      );

      return {
        valid: actualHash === row.hash,
        target: checkpointId,
        expectedHash: row.hash,
        actualHash,
      };
    },
  };
}
