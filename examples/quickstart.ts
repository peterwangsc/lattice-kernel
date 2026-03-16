/**
 * Lattice Kernel — Quick Start Example
 *
 * This shows the minimal code to get inference, memory, and
 * policy working with a mock adapter. Replace the mock adapter
 * with createAnthropicAdapter for real LLM inference.
 *
 * Run: npx tsx examples/quickstart.ts
 * (after pnpm install && pnpm build)
 */

import { createLattice } from "@lattice-kernel/sdk";
import type { BackendAdapter } from "@lattice-kernel/sdk";

// 1. Create a simple mock adapter (replace with a real adapter)
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
  async listModels() {
    return [];
  },
  async infer(req) {
    return {
      output: `Echo: ${req.input}`,
      modelId: "mock",
      durationMs: 1,
    };
  },
  async embed() {
    return { embedding: [0.1, 0.2, 0.3], modelId: "mock", dimensions: 3 };
  },
  async estimate() {
    return {};
  },
  async healthCheck() {
    return true;
  },
};

// 2. Create the Lattice instance
const lattice = createLattice({
  adapters: [mockAdapter],
  policyRules: [
    {
      id: "allow-all",
      name: "Allow all operations",
      permissions: [
        "canInfer",
        "canRemember",
        "canRetrieve",
        "canPlan",
        "canAct",
      ],
      effect: "allow",
      priority: 10,
    },
  ],
  defaultScope: { tenantId: "demo", appId: "quickstart" },
});

// 3. Use it
async function main() {
  // Inference
  const result = await lattice.infer("Hello, Lattice!");
  console.log("Infer:", result.output);

  // Remember something
  await lattice.remember("User prefers dark mode.", {
    type: "preference",
    retention: "30d",
  });

  // Retrieve memories
  const memories = await lattice.retrieve("dark mode");
  console.log("Memories:", memories.map((m) => m.content));

  // Checkpoint and rollback
  const cp = await lattice.checkpoint("before experiment");
  await lattice.remember("Temporary note");
  console.log("Before rollback:", (await lattice.retrieve("note")).length, "items");

  await lattice.rollback(cp.checkpointId);
  console.log("After rollback:", (await lattice.retrieve("note")).length, "items");

  // Health check
  console.log("Health:", await lattice.healthCheck());

  console.log("\nDone! Replace mockAdapter with a real adapter to use LLMs.");
}

main().catch(console.error);
