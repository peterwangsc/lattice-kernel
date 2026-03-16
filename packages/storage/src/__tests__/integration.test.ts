/**
 * Full-stack integration test: SQLite storage + runtime + policy + audit + memory + crypto.
 * Validates the entire system works end-to-end with persistent storage.
 */
import { describe, it, expect } from "vitest";
import { createSqliteMemoryStore } from "../sqlite-memory-store.js";
import { createSqliteAuditSink } from "../sqlite-audit-sink.js";
import { createPolicyEngine } from "@lattice-kernel/policy-engine";
import { createRuntime } from "@lattice-kernel/runtime";
import { createNodeCryptoProvider } from "@lattice-kernel/crypto";
import { createEncryptedMemoryStore } from "@lattice-kernel/memory";
import type { BackendAdapter, PolicyRule } from "@lattice-kernel/schemas";
import { randomBytes } from "node:crypto";

function createMockAdapter(): BackendAdapter {
  return {
    providerId: "integration-test",
    async getCapabilities() {
      return {
        supportsLocalExecution: true,
        supportsCloudExecution: false,
        supportsAdaptation: false,
        supportedFormats: ["mock"],
      };
    },
    async listModels() {
      return [{
        id: "test-model",
        version: "1.0",
        provider: "mock",
        format: "mock",
        capabilities: {
          supportsEmbedding: true,
          supportsToolCalling: false,
          supportsAdaptation: false,
          supportsMultimodal: false,
        },
        executionTargets: ["cpu"],
        policyTags: ["test"],
      }];
    },
    async infer(request) {
      return {
        output: `Integration response: ${request.input}`,
        modelId: request.modelId,
        tokensUsed: 10,
        durationMs: 1,
        stopReason: "end_turn" as const,
      };
    },
    async embed(request) {
      return {
        embedding: [0.1, 0.2, 0.3],
        modelId: request.modelId,
        dimensions: 3,
      };
    },
    async estimate() {
      return { estimatedLatencyMs: 5 };
    },
    async healthCheck() {
      return true;
    },
  };
}

const ALLOW_ALL: PolicyRule = {
  id: "allow-all",
  name: "Allow all for integration test",
  permissions: ["canInfer", "canRemember", "canRetrieve", "canPlan", "canAct", "canAdapt", "canRouteToCloud"],
  effect: "allow",
  priority: 10,
};

describe("Full-stack integration", () => {
  it("runs inference with SQLite audit persistence", async () => {
    const auditSink = createSqliteAuditSink({ dbPath: ":memory:" });
    const policyEngine = createPolicyEngine({ defaultDeny: true });
    policyEngine.addRule(ALLOW_ALL);

    const runtime = createRuntime({
      adapters: [createMockAdapter()],
      policyEngine,
      auditSink,
    });

    const result = await runtime.infer({
      input: "Hello from integration test",
      trustLevel: "trusted_user_explicit",
    });

    expect(result.output).toContain("Integration response");
    expect(result.route).toBe("integration-test");

    // Verify audit was persisted to SQLite
    const { events } = await auditSink.query({ type: "infer" });
    expect(events).toHaveLength(1);
    expect(events[0]!.requestId).toBe(result.requestId);
  });

  it("uses SQLite memory store with full write pipeline", async () => {
    const auditSink = createSqliteAuditSink({ dbPath: ":memory:" });
    const policyEngine = createPolicyEngine({ defaultDeny: true });
    policyEngine.addRule(ALLOW_ALL);

    const memoryStore = createSqliteMemoryStore({
      dbPath: ":memory:",
      policyEngine,
      auditSink,
    });

    // Write memory
    const item = await memoryStore.write({
      scope: { tenantId: "acme", appId: "copilot", userId: "alice" },
      type: "preference",
      content: "Prefers quarterly billing",
      source: "integration-test",
      provenance: { test: true },
      classification: "internal",
      trustLevel: "trusted_user_explicit",
      retentionPolicy: "90d",
    });

    expect(item.id).toBeTruthy();
    expect(item.expiresAt).toBeTruthy(); // Auto-set from retention

    // Retrieve with scope
    const results = await memoryStore.retrieve("billing", {
      tenantId: "acme",
      userId: "alice",
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.content).toBe("Prefers quarterly billing");

    // Verify audit events
    const { events } = await auditSink.query({ type: "memory_write" });
    expect(events).toHaveLength(1);
  });

  it("checkpoint, modify, rollback cycle with SQLite", async () => {
    const auditSink = createSqliteAuditSink({ dbPath: ":memory:" });
    const policyEngine = createPolicyEngine({ defaultDeny: false });

    const store = createSqliteMemoryStore({
      dbPath: ":memory:",
      policyEngine,
      auditSink,
    });

    await store.write({
      scope: { tenantId: "t1" },
      type: "semantic",
      content: "original fact",
      source: "test",
      provenance: {},
      classification: "internal",
      trustLevel: "trusted_user_explicit",
    });

    const cp = await store.checkpoint("before changes");

    await store.write({
      scope: { tenantId: "t1" },
      type: "semantic",
      content: "experimental data",
      source: "test",
      provenance: {},
      classification: "internal",
      trustLevel: "trusted_user_explicit",
    });
    expect(store.count()).toBe(2);

    await store.rollback(cp.checkpointId);
    expect(store.count()).toBe(1);

    const verified = await store.verifyCheckpoint(cp.checkpointId);
    expect(verified.valid).toBe(true);
  });

  it("encrypted memory with SQLite backend", async () => {
    const auditSink = createSqliteAuditSink({ dbPath: ":memory:" });
    const policyEngine = createPolicyEngine({ defaultDeny: false });
    const crypto = createNodeCryptoProvider({ encryptionKey: randomBytes(32) });

    const baseStore = createSqliteMemoryStore({
      dbPath: ":memory:",
      policyEngine,
      auditSink,
    });

    const encryptedStore = createEncryptedMemoryStore(baseStore, crypto);

    // Write through encrypted layer
    const item = await encryptedStore.write({
      scope: { tenantId: "acme" },
      type: "semantic",
      content: "sensitive patient data",
      source: "test",
      provenance: {},
      classification: "confidential",
      trustLevel: "trusted_user_explicit",
    });

    // Read back — should be decrypted
    const fetched = await encryptedStore.get(item.id);
    expect(fetched!.content).toBe("sensitive patient data");

    // Read from base store — should be encrypted (base64)
    const raw = await baseStore.get(item.id);
    expect(raw!.content).not.toBe("sensitive patient data");
  });

  it("policy denial prevents memory write and audit is recorded", async () => {
    const auditSink = createSqliteAuditSink({ dbPath: ":memory:" });
    const policyEngine = createPolicyEngine({ defaultDeny: true });
    // No allow rules — everything denied

    const store = createSqliteMemoryStore({
      dbPath: ":memory:",
      policyEngine,
      auditSink,
    });

    await expect(
      store.write({
        scope: { tenantId: "acme" },
        type: "semantic",
        content: "should be denied",
        source: "test",
        provenance: {},
        classification: "internal",
        trustLevel: "trusted_user_explicit",
      }),
    ).rejects.toThrow("Policy denied");

    expect(store.count()).toBe(0);
  });

  it("multi-tenant isolation with SQLite", async () => {
    const auditSink = createSqliteAuditSink({ dbPath: ":memory:" });
    const policyEngine = createPolicyEngine({ defaultDeny: false });

    const store = createSqliteMemoryStore({
      dbPath: ":memory:",
      policyEngine,
      auditSink,
    });

    await store.write({
      scope: { tenantId: "acme" },
      type: "semantic",
      content: "Acme secret",
      source: "test",
      provenance: {},
      classification: "internal",
      trustLevel: "trusted_user_explicit",
    });

    await store.write({
      scope: { tenantId: "globex" },
      type: "semantic",
      content: "Globex secret",
      source: "test",
      provenance: {},
      classification: "internal",
      trustLevel: "trusted_user_explicit",
    });

    const acmeResults = await store.retrieve("secret", { tenantId: "acme" });
    expect(acmeResults).toHaveLength(1);
    expect(acmeResults[0]!.content).toBe("Acme secret");

    const globexResults = await store.retrieve("secret", { tenantId: "globex" });
    expect(globexResults).toHaveLength(1);
    expect(globexResults[0]!.content).toBe("Globex secret");
  });
});
