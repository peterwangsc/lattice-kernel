import Database from "better-sqlite3";
import type { PolicyRule } from "@lattice-kernel/schemas";
import type { PolicyEngine } from "@lattice-kernel/policy-engine";

export interface SqlitePolicyStoreConfig {
  dbPath: string;
}

export interface PolicyStore {
  /** Load all rules from SQLite into the policy engine. */
  loadInto(engine: PolicyEngine): void;
  /** Save a rule to SQLite and add to engine. */
  save(engine: PolicyEngine, rule: PolicyRule): void;
  /** Remove a rule from SQLite and engine. */
  remove(engine: PolicyEngine, ruleId: string): void;
  /** List all persisted rules. */
  list(): PolicyRule[];
}

export function createSqlitePolicyStore(
  config: SqlitePolicyStoreConfig,
): PolicyStore {
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
    "SELECT version FROM schema_version WHERE component = 'policy'"
  ).get() as { version: number } | undefined;
  if (!currentVersion) {
    db.prepare(
      "INSERT INTO schema_version (component, version, updated_at) VALUES ('policy', 1, ?)"
    ).run(new Date().toISOString());
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS policy_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      permissions TEXT NOT NULL,
      scope_pattern TEXT,
      model_pattern TEXT,
      tool_pattern TEXT,
      effect TEXT NOT NULL,
      priority INTEGER NOT NULL
    );
  `);

  const insertRule = db.prepare(`
    INSERT OR REPLACE INTO policy_rules
      (id, name, description, permissions, scope_pattern, model_pattern, tool_pattern, effect, priority)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const deleteRule = db.prepare("DELETE FROM policy_rules WHERE id = ?");
  const selectAll = db.prepare("SELECT * FROM policy_rules ORDER BY priority DESC");

  function rowToRule(row: Record<string, unknown>): PolicyRule {
    return {
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string) || undefined,
      permissions: JSON.parse(row.permissions as string),
      scopePattern: (row.scope_pattern as string) || undefined,
      modelPattern: (row.model_pattern as string) || undefined,
      toolPattern: (row.tool_pattern as string) || undefined,
      effect: row.effect as PolicyRule["effect"],
      priority: row.priority as number,
    };
  }

  return {
    loadInto(engine: PolicyEngine): void {
      const rows = selectAll.all() as Record<string, unknown>[];
      for (const row of rows) {
        engine.addRule(rowToRule(row));
      }
    },

    save(engine: PolicyEngine, rule: PolicyRule): void {
      insertRule.run(
        rule.id,
        rule.name,
        rule.description ?? null,
        JSON.stringify(rule.permissions),
        rule.scopePattern ?? null,
        rule.modelPattern ?? null,
        rule.toolPattern ?? null,
        rule.effect,
        rule.priority,
      );
      engine.addRule(rule);
    },

    remove(engine: PolicyEngine, ruleId: string): void {
      deleteRule.run(ruleId);
      engine.removeRule(ruleId);
    },

    list(): PolicyRule[] {
      const rows = selectAll.all() as Record<string, unknown>[];
      return rows.map(rowToRule);
    },
  };
}
