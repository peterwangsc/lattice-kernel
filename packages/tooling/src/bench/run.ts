/**
 * Lattice Kernel Benchmark Suite
 *
 * Measures performance of core operations:
 * - Policy evaluation
 * - Memory write/read
 * - Runtime inference (mock adapter)
 * - Audit event emission
 * - Checkpoint/rollback
 * - Crypto operations
 */

import { createBenchmarkSuite, formatResults } from "./framework.js";
import { createPolicyEngine } from "@lattice-kernel/policy-engine";
import { createMemoryAuditSink } from "@lattice-kernel/audit";
import { createMemoryStore } from "@lattice-kernel/memory";
import { createRuntime } from "@lattice-kernel/runtime";
import { createNodeCryptoProvider } from "@lattice-kernel/crypto";
import type { BackendAdapter } from "@lattice-kernel/schemas";

function createMockAdapter(): BackendAdapter {
  return {
    providerId: "bench-mock",
    async getCapabilities() {
      return { supportsLocalExecution: true, supportsCloudExecution: false, supportsAdaptation: false, supportedFormats: [] };
    },
    async listModels() { return []; },
    async infer(req) {
      return { output: `response: ${req.input.slice(0, 20)}`, modelId: req.modelId, durationMs: 0 };
    },
    async embed() { return { embedding: [0.1, 0.2], modelId: "m", dimensions: 2 }; },
    async estimate() { return {}; },
    async healthCheck() { return true; },
  };
}

async function main() {
  console.log("Lattice Kernel Benchmark Suite\n");

  const suite = createBenchmarkSuite();
  const iterations = 5000;

  // --- Policy Engine ---
  const policyEngine = createPolicyEngine({ defaultDeny: false });
  policyEngine.addRule({
    id: "allow-all", name: "allow", permissions: ["canInfer", "canRemember", "canRetrieve"],
    effect: "allow", priority: 10,
  });

  suite.add("policy: evaluate (allow)", () => {
    policyEngine.evaluate({
      operation: "canInfer", scope: { tenantId: "acme" }, trustLevel: "trusted_user_explicit",
    });
  });

  // --- Audit ---
  const auditSink = createMemoryAuditSink({ maxEvents: 100000 });

  suite.add("audit: emit event", async () => {
    await auditSink.emit({
      eventId: `evt_${Date.now()}`, type: "infer", requestId: `req_${Date.now()}`,
      scope: { tenantId: "acme" }, trustLevel: "trusted_user_explicit",
      timestamp: new Date().toISOString(), actor: "bench", policyDecisions: [],
    });
  });

  // --- Memory Store ---
  const memoryStore = createMemoryStore({ policyEngine, auditSink });
  let memWriteCounter = 0;

  suite.add("memory: write", async () => {
    await memoryStore.write({
      scope: { tenantId: "acme", appId: "bench" }, type: "semantic",
      content: `benchmark item ${memWriteCounter++}`, source: "bench",
      provenance: {}, classification: "internal", trustLevel: "trusted_user_explicit",
    });
  });

  // Pre-populate for reads
  for (let i = 0; i < 100; i++) {
    await memoryStore.write({
      scope: { tenantId: "acme", appId: "bench" }, type: "semantic",
      content: `pre-populated item ${i} with searchable content`, source: "bench",
      provenance: {}, classification: "internal", trustLevel: "trusted_user_explicit",
    });
  }

  suite.add("memory: retrieve (topK=10)", async () => {
    await memoryStore.retrieve("searchable content", { tenantId: "acme" }, { topK: 10 });
  });

  // --- Runtime Inference ---
  const runtime = createRuntime({
    adapters: [createMockAdapter()], policyEngine, auditSink,
  });

  suite.add("runtime: infer (mock)", async () => {
    await runtime.infer({ input: "benchmark test query", trustLevel: "trusted_user_explicit" });
  });

  // --- Crypto ---
  const crypto = createNodeCryptoProvider();
  const testData = new TextEncoder().encode("benchmark test data for hashing");

  suite.add("crypto: SHA-256 hash", async () => {
    await crypto.hash(testData);
  });

  suite.add("crypto: AES-256-GCM encrypt", async () => {
    await crypto.encrypt(testData);
  });

  // --- Checkpoint ---
  const cpStore = createMemoryStore({ policyEngine, auditSink });
  for (let i = 0; i < 50; i++) {
    await cpStore.write({
      scope: { tenantId: "acme" }, type: "semantic", content: `cp item ${i}`,
      source: "bench", provenance: {}, classification: "internal",
      trustLevel: "trusted_user_explicit",
    });
  }

  suite.add("memory: checkpoint (50 items)", async () => {
    await cpStore.checkpoint("bench");
  });

  // Run
  const results = await suite.run(iterations);
  console.log(formatResults(results));
}

main().catch(console.error);
