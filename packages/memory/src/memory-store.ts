import type { MemoryItem, ScopeRef, TrustLevel, Checkpoint } from "@lattice-kernel/schemas";
import type { MemoryStore, MemoryStoreConfig, MemoryWriteInput, RetrieveOptions, VerifyResult } from "./types.js";

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

/**
 * Parse a duration string like "30s", "5m", "2h", "180d" into milliseconds.
 */
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return 0;
  const value = parseInt(match[1]!, 10);
  const unit = match[2]!;
  switch (unit) {
    case "s": return value * 1000;
    case "m": return value * 60 * 1000;
    case "h": return value * 60 * 60 * 1000;
    case "d": return value * 24 * 60 * 60 * 1000;
    default: return 0;
  }
}

function computeExpiresAt(
  retentionPolicy: string | undefined,
  explicitExpiresAt: string | undefined,
): string | undefined {
  if (explicitExpiresAt) return explicitExpiresAt;
  if (!retentionPolicy) return undefined;
  const durationMs = parseDuration(retentionPolicy);
  if (durationMs <= 0) return undefined;
  return new Date(Date.now() + durationMs).toISOString();
}

function simpleHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

/**
 * In-memory MemoryStore implementation.
 * Implements the write pipeline from spec section 12.3:
 * 1. candidate proposed → 2. classify → 3. attach provenance →
 * 4. apply policy → 5. approval check → 6. generate hash →
 * 7. persist → 8. emit audit event
 */
export function createMemoryStore(config: MemoryStoreConfig): MemoryStore {
  const { policyEngine, auditSink, crypto, maxItems = 100_000 } = config;
  const items = new Map<string, MemoryItem>();
  const checkpoints = new Map<string, { snapshot: Map<string, MemoryItem>; meta: Checkpoint }>();

  async function computeHash(content: string): Promise<string> {
    if (crypto) {
      return crypto.hashString(content);
    }
    return simpleHash(content);
  }

  return {
    async write(input: MemoryWriteInput): Promise<MemoryItem> {
      // Step 4: Policy check
      const decision = policyEngine.evaluate({
        operation: "canRemember",
        scope: input.scope,
        trustLevel: input.trustLevel,
      });

      if (!decision.allowed) {
        await auditSink.emit({
          eventId: `evt_mem_${Date.now()}`,
          type: "memory_write",
          requestId: `memw_${Date.now()}_${++idCounter}`,
          scope: input.scope,
          trustLevel: input.trustLevel,
          timestamp: new Date().toISOString(),
          actor: input.source,
          policyDecisions: decision.matchedRules,
          error: decision.reason ?? "Policy denied memory write",
        });
        throw new Error(
          `Policy denied memory write: ${decision.reason ?? "no reason"}`,
        );
      }

      // Step 5: Approval check (logged if required)
      if (decision.requiresApproval) {
        await auditSink.emit({
          eventId: `evt_mem_${Date.now()}`,
          type: "memory_write",
          requestId: `memw_${Date.now()}_${++idCounter}`,
          scope: input.scope,
          trustLevel: input.trustLevel,
          timestamp: new Date().toISOString(),
          actor: input.source,
          policyDecisions: decision.matchedRules,
          error: "Memory write requires approval — not yet implemented",
        });
        throw new Error("Memory write requires approval");
      }

      // Steps 6-7: Generate hash and persist
      const id = `mem_${Date.now()}_${++idCounter}`;
      const now = new Date().toISOString();
      const hash = await computeHash(input.content + id);

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
        expiresAt: computeExpiresAt(input.retentionPolicy, input.expiresAt),
        retentionPolicy: input.retentionPolicy,
        subjectRefs: input.subjectRefs ?? [],
        tags: input.tags ?? [],
        hash,
      };

      items.set(id, item);

      // Enforce max items
      if (items.size > maxItems) {
        const oldest = items.keys().next().value;
        if (oldest !== undefined) items.delete(oldest);
      }

      // Step 8: Audit event
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
      const minRank = minTrustLevel ? trustRank(minTrustLevel) : 0;

      let results = [...items.values()];

      // Filter by scope
      results = results.filter((item) => scopeContains(item.scope, scope));

      // Filter by type
      if (types && types.length > 0) {
        results = results.filter((item) => types.includes(item.type));
      }

      // Filter by trust
      if (minTrustLevel) {
        results = results.filter(
          (item) => trustRank(item.trustLevel) >= minRank,
        );
      }

      // Filter expired
      const now = new Date().toISOString();
      results = results.filter(
        (item) => !item.expiresAt || item.expiresAt > now,
      );

      // Simple text relevance: items containing query terms rank higher
      const queryTerms = query.toLowerCase().split(/\s+/);
      results.sort((a, b) => {
        const scoreA = queryTerms.filter((t) =>
          a.content.toLowerCase().includes(t),
        ).length;
        const scoreB = queryTerms.filter((t) =>
          b.content.toLowerCase().includes(t),
        ).length;
        if (scoreB !== scoreA) return scoreB - scoreA;
        // Tie-break: higher trust first, then newer first
        const trustDiff = trustRank(b.trustLevel) - trustRank(a.trustLevel);
        if (trustDiff !== 0) return trustDiff;
        return b.createdAt.localeCompare(a.createdAt);
      });

      return results.slice(0, topK);
    },

    async get(id: string): Promise<MemoryItem | undefined> {
      return items.get(id);
    },

    async delete(id: string): Promise<void> {
      const item = items.get(id);
      if (!item) return;
      items.delete(id);

      await auditSink.emit({
        eventId: `evt_del_${id}`,
        type: "memory_delete",
        requestId: `memd_${Date.now()}`,
        scope: item.scope,
        trustLevel: item.trustLevel,
        timestamp: new Date().toISOString(),
        actor: "system",
        policyDecisions: [],
      });
    },

    async expireStale(): Promise<number> {
      const now = new Date().toISOString();
      let expired = 0;

      for (const [id, item] of items) {
        if (item.expiresAt && item.expiresAt <= now) {
          items.delete(id);
          expired++;

          await auditSink.emit({
            eventId: `evt_exp_${id}`,
            type: "memory_expire",
            requestId: `meme_${Date.now()}`,
            scope: item.scope,
            trustLevel: item.trustLevel,
            timestamp: now,
            actor: "system",
            policyDecisions: [],
          });
        }
      }

      return expired;
    },

    count(): number {
      return items.size;
    },

    async checkpoint(description?: string): Promise<Checkpoint> {
      const cpId = `cp_${Date.now()}_${++idCounter}`;
      const now = new Date().toISOString();

      // Deep clone the current items map
      const snapshot = new Map<string, MemoryItem>();
      for (const [id, item] of items) {
        snapshot.set(id, { ...item });
      }

      // Hash the snapshot content for integrity
      const contentHash = await computeHash(
        [...snapshot.values()].map((i) => i.hash).join(",") + cpId,
      );

      const meta: Checkpoint = {
        checkpointId: cpId,
        target: "memory",
        targetRef: "memory-store",
        createdAt: now,
        createdBy: "system",
        description,
        hash: contentHash,
      };

      checkpoints.set(cpId, { snapshot, meta });

      await auditSink.emit({
        eventId: `evt_${cpId}`,
        type: "checkpoint",
        requestId: cpId,
        scope: {},
        trustLevel: "trusted_system",
        timestamp: now,
        actor: "system",
        policyDecisions: [],
      });

      return meta;
    },

    async rollback(checkpointId: string): Promise<void> {
      const cp = checkpoints.get(checkpointId);
      if (!cp) {
        throw new Error(`Checkpoint not found: ${checkpointId}`);
      }

      // Restore state from snapshot
      items.clear();
      for (const [id, item] of cp.snapshot) {
        items.set(id, { ...item });
      }

      await auditSink.emit({
        eventId: `evt_rb_${checkpointId}`,
        type: "rollback",
        requestId: `rb_${Date.now()}`,
        scope: {},
        trustLevel: "trusted_system",
        timestamp: new Date().toISOString(),
        actor: "system",
        policyDecisions: [],
      });
    },

    listCheckpoints(): Checkpoint[] {
      return [...checkpoints.values()]
        .map((cp) => cp.meta)
        .sort((a, b) => {
          const timeCmp = b.createdAt.localeCompare(a.createdAt);
          if (timeCmp !== 0) return timeCmp;
          return b.checkpointId.localeCompare(a.checkpointId);
        });
    },

    async verify(itemId: string): Promise<VerifyResult> {
      const item = items.get(itemId);
      if (!item) {
        return {
          valid: false,
          target: itemId,
          expectedHash: "",
          actualHash: "",
          error: "Item not found",
        };
      }

      const actualHash = await computeHash(item.content + item.id);
      return {
        valid: actualHash === item.hash,
        target: itemId,
        expectedHash: item.hash,
        actualHash,
      };
    },

    async verifyCheckpoint(checkpointId: string): Promise<VerifyResult> {
      const cp = checkpoints.get(checkpointId);
      if (!cp) {
        return {
          valid: false,
          target: checkpointId,
          expectedHash: "",
          actualHash: "",
          error: "Checkpoint not found",
        };
      }

      const actualHash = await computeHash(
        [...cp.snapshot.values()].map((i) => i.hash).join(",") + checkpointId,
      );
      return {
        valid: actualHash === cp.meta.hash,
        target: checkpointId,
        expectedHash: cp.meta.hash,
        actualHash,
      };
    },
  };
}

function scopeContains(
  itemScope: Record<string, unknown>,
  queryScope: Record<string, unknown>,
): boolean {
  for (const [key, value] of Object.entries(queryScope)) {
    if (value !== undefined && itemScope[key] !== value) {
      return false;
    }
  }
  return true;
}
