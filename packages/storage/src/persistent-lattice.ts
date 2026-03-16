import { createSqliteMemoryStore } from "./sqlite-memory-store.js";
import { createSqliteAuditSink } from "./sqlite-audit-sink.js";
import { createPolicyEngine } from "@lattice-kernel/policy-engine";
import { createRuntime } from "@lattice-kernel/runtime";
import type { BackendAdapter, PolicyRule, TrustLevel, ScopeRef } from "@lattice-kernel/schemas";
import type { ToolAdapter } from "@lattice-kernel/runtime";
import type { Runtime } from "@lattice-kernel/runtime";
import type { MemoryStore } from "@lattice-kernel/memory";
import type { PolicyEngine } from "@lattice-kernel/policy-engine";
import type { AuditSink } from "@lattice-kernel/audit";

export interface PersistentLatticeConfig {
  /** Path to SQLite database file. */
  dbPath: string;
  adapters: BackendAdapter[];
  tools?: ToolAdapter[];
  policyRules?: PolicyRule[];
  defaultDeny?: boolean;
  defaultTrustLevel?: TrustLevel;
  defaultScope?: ScopeRef;
}

export interface PersistentLattice {
  runtime: Runtime;
  memoryStore: MemoryStore;
  policyEngine: PolicyEngine;
  auditSink: AuditSink;
  defaultTrustLevel: TrustLevel;
  defaultScope: ScopeRef;
}

/**
 * Creates a fully-wired Lattice runtime backed by SQLite for persistence.
 * One-line setup for production use with durable memory and audit logs.
 *
 * ```ts
 * const lattice = createPersistentLattice({
 *   dbPath: "./my-app.db",
 *   adapters: [createAnthropicAdapter({ apiKey })],
 *   policyRules: [allowInferRule],
 * });
 * ```
 */
export function createPersistentLattice(
  config: PersistentLatticeConfig,
): PersistentLattice {
  const defaultTrustLevel = config.defaultTrustLevel ?? "trusted_user_explicit";
  const defaultScope = config.defaultScope ?? {};

  const policyEngine = createPolicyEngine({
    defaultDeny: config.defaultDeny ?? true,
  });
  for (const rule of config.policyRules ?? []) {
    policyEngine.addRule(rule);
  }

  const auditSink = createSqliteAuditSink({ dbPath: config.dbPath });

  const memoryStore = createSqliteMemoryStore({
    dbPath: config.dbPath,
    policyEngine,
    auditSink,
  });

  const runtime = createRuntime({
    adapters: config.adapters,
    policyEngine,
    auditSink,
    tools: config.tools,
  });

  return {
    runtime,
    memoryStore,
    policyEngine,
    auditSink,
    defaultTrustLevel,
    defaultScope,
  };
}
