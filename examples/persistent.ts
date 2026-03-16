/**
 * Lattice Kernel — Persistent Storage Example
 *
 * Shows how to use SQLite-backed storage so memory and audit
 * logs survive process restarts.
 *
 * Run: npx tsx examples/persistent.ts
 * (after pnpm install && pnpm build)
 */

import { createPersistentLattice } from "@lattice-kernel/storage";
import type { BackendAdapter } from "@lattice-kernel/schemas";

// Mock adapter (replace with createAnthropicAdapter or createOpenAIAdapter)
const mockAdapter: BackendAdapter = {
  providerId: "mock",
  async getCapabilities() {
    return {
      supportsLocalExecution: true,
      supportsCloudExecution: false,
      supportsAdaptation: false,
      supportedFormats: [],
    };
  },
  async listModels() { return []; },
  async infer(req) {
    return { output: `Echo: ${req.input}`, modelId: "mock", durationMs: 1 };
  },
  async embed() {
    return { embedding: [0.1, 0.2, 0.3], modelId: "mock", dimensions: 3 };
  },
  async estimate() { return {}; },
  async healthCheck() { return true; },
};

async function main() {
  // Create a persistent Lattice backed by SQLite
  const { runtime, memoryStore, policyEngine, auditSink } =
    createPersistentLattice({
      dbPath: "./example-data.db",
      adapters: [mockAdapter],
      policyRules: [
        {
          id: "allow-all",
          name: "Allow all",
          permissions: ["canInfer", "canRemember", "canRetrieve"],
          effect: "allow",
          priority: 10,
        },
      ],
    });

  // Write memory (persisted to SQLite)
  await memoryStore.write({
    scope: { tenantId: "demo" },
    type: "preference",
    content: "User prefers dark mode",
    source: "example",
    provenance: {},
    classification: "internal",
    trustLevel: "trusted_user_explicit",
    retentionPolicy: "90d",
  });

  // Retrieve (reads from SQLite)
  const items = await memoryStore.retrieve("dark mode", { tenantId: "demo" });
  console.log("Retrieved:", items.map((i) => i.content));
  console.log("Total items:", memoryStore.count());
  console.log("Stats:", memoryStore.stats());

  // Inference
  const result = await runtime.infer({
    input: "Hello from persistent example!",
    trustLevel: "trusted_user_explicit",
  });
  console.log("Infer:", result.output);

  // Audit persists too
  const auditResult = await auditSink.query({ type: "infer", limit: 5 });
  console.log("Audit events:", auditResult.total);

  console.log("\nData saved to ./example-data.db");
  console.log("Run again to see persisted data accumulate!");
}

main().catch(console.error);
