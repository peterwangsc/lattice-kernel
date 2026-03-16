import Database from "better-sqlite3";
import type { AuditEvent } from "@lattice-kernel/schemas";
import type { AuditSink, AuditQueryFilter, AuditQueryResult } from "@lattice-kernel/audit";

export interface SqliteAuditSinkConfig {
  dbPath: string;
}

export function createSqliteAuditSink(
  config: SqliteAuditSinkConfig,
): AuditSink {
  const db = new Database(config.dbPath);
  db.pragma("journal_mode = WAL");

  // Schema versioning
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      component TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const currentVersion = db.prepare(
    "SELECT version FROM schema_version WHERE component = 'audit'"
  ).get() as { version: number } | undefined;
  if (!currentVersion) {
    db.prepare(
      "INSERT INTO schema_version (component, version, updated_at) VALUES ('audit', 1, ?)"
    ).run(new Date().toISOString());
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_events (
      event_id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      request_id TEXT NOT NULL,
      scope_tenant TEXT,
      scope_app TEXT,
      scope_user TEXT,
      scope_session TEXT,
      trust_level TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      actor TEXT NOT NULL,
      model_id TEXT,
      route TEXT,
      policy_decisions TEXT NOT NULL,
      input TEXT,
      output TEXT,
      error TEXT,
      duration_ms REAL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_type ON audit_events(type);
    CREATE INDEX IF NOT EXISTS idx_audit_request ON audit_events(request_id);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor);
  `);

  const insertEvent = db.prepare(`
    INSERT OR REPLACE INTO audit_events (event_id, type, request_id,
      scope_tenant, scope_app, scope_user, scope_session,
      trust_level, timestamp, actor, model_id, route,
      policy_decisions, input, output, error, duration_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  function rowToEvent(row: Record<string, unknown>): AuditEvent {
    return {
      eventId: row.event_id as string,
      type: row.type as AuditEvent["type"],
      requestId: row.request_id as string,
      scope: {
        tenantId: row.scope_tenant as string | undefined,
        appId: row.scope_app as string | undefined,
        userId: row.scope_user as string | undefined,
        sessionId: row.scope_session as string | undefined,
      },
      trustLevel: row.trust_level as AuditEvent["trustLevel"],
      timestamp: row.timestamp as string,
      actor: row.actor as string,
      modelId: (row.model_id as string) || undefined,
      route: (row.route as string) || undefined,
      policyDecisions: JSON.parse(row.policy_decisions as string),
      input: row.input ? JSON.parse(row.input as string) : undefined,
      output: row.output ? JSON.parse(row.output as string) : undefined,
      error: (row.error as string) || undefined,
      durationMs: row.duration_ms as number | undefined,
    };
  }

  return {
    async emit(event: AuditEvent): Promise<void> {
      const scope = event.scope as Record<string, unknown>;
      insertEvent.run(
        event.eventId,
        event.type,
        event.requestId,
        (scope.tenantId as string) ?? null,
        (scope.appId as string) ?? null,
        (scope.userId as string) ?? null,
        (scope.sessionId as string) ?? null,
        event.trustLevel,
        event.timestamp,
        event.actor,
        event.modelId ?? null,
        event.route ?? null,
        JSON.stringify(event.policyDecisions),
        event.input ? JSON.stringify(event.input) : null,
        event.output ? JSON.stringify(event.output) : null,
        event.error ?? null,
        event.durationMs ?? null,
      );
    },

    async query(filter: AuditQueryFilter): Promise<AuditQueryResult> {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (filter.requestId) {
        conditions.push("request_id = ?");
        params.push(filter.requestId);
      }
      if (filter.type) {
        conditions.push("type = ?");
        params.push(filter.type);
      }
      if (filter.actor) {
        conditions.push("actor = ?");
        params.push(filter.actor);
      }
      if (filter.modelId) {
        conditions.push("model_id = ?");
        params.push(filter.modelId);
      }
      if (filter.scope) {
        if (filter.scope.tenantId) {
          conditions.push("scope_tenant = ?");
          params.push(filter.scope.tenantId);
        }
        if (filter.scope.appId) {
          conditions.push("scope_app = ?");
          params.push(filter.scope.appId);
        }
      }
      if (filter.since) {
        conditions.push("timestamp >= ?");
        params.push(filter.since);
      }
      if (filter.until) {
        conditions.push("timestamp <= ?");
        params.push(filter.until);
      }
      if (filter.hasError !== undefined) {
        conditions.push(filter.hasError ? "error IS NOT NULL" : "error IS NULL");
      }

      const where =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      // Count total
      const countSql = `SELECT COUNT(*) as cnt FROM audit_events ${where}`;
      const totalRow = db.prepare(countSql).get(...params) as { cnt: number };
      const total = totalRow.cnt;

      const offset = filter.offset ?? 0;
      const limit = filter.limit ?? total;

      const sql = `SELECT * FROM audit_events ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
      const rows = db.prepare(sql).all(...params, limit, offset) as Record<string, unknown>[];

      return {
        events: rows.map(rowToEvent),
        total,
        hasMore: offset + limit < total,
        offset,
        limit,
      };
    },

    async flush(): Promise<void> {
      // SQLite writes are synchronous — nothing to flush
    },
  };
}
