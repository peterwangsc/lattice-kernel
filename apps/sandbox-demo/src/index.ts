/**
 * Lattice Kernel Sandbox Demo
 *
 * Demonstrates the core SDK API: infer, remember, retrieve, plan,
 * checkpoint, and rollback. Uses a mock adapter since no real
 * inference backend is wired up yet.
 */

import { createLattice } from "@lattice-kernel/sdk";
import type { BackendAdapter, PolicyRule } from "@lattice-kernel/schemas";

// --- Mock adapter (simulates a local model) ---

function createDemoAdapter(): BackendAdapter {
  return {
    providerId: "demo-local",
    async getCapabilities() {
      return {
        supportsLocalExecution: true,
        supportsCloudExecution: false,
        supportsAdaptation: false,
        supportedFormats: ["demo"],
      };
    },
    async listModels() {
      return [
        {
          id: "demo-assistant-v1",
          version: "1.0.0",
          provider: "demo",
          format: "demo",
          capabilities: {
            supportsEmbedding: true,
            supportsToolCalling: true,
            supportsAdaptation: false,
            supportsMultimodal: false,
          },
          executionTargets: ["cpu"],
          policyTags: ["general"],
        },
      ];
    },
    async infer(request) {
      // Simulated responses based on input
      const input = request.input.toLowerCase();
      let output: string;
      if (input.includes("summarize")) {
        output =
          "Based on recent interactions, the customer prefers quarterly billing and email communication. They have expressed interest in upgrading their plan.";
      } else if (input.includes("next steps")) {
        output =
          "Recommended next steps: 1) Send billing summary email, 2) Schedule follow-up call, 3) Prepare upgrade proposal.";
      } else {
        output = `Processed: ${request.input}`;
      }
      return { output, modelId: request.modelId, tokensUsed: 42, durationMs: 15 };
    },
    async embed(request) {
      const sum = [...request.content].reduce((a, c) => a + c.charCodeAt(0), 0);
      return {
        embedding: [sum / 1000, (sum % 100) / 100, 0.5],
        modelId: request.modelId,
        dimensions: 3,
      };
    },
    async estimate() {
      return { estimatedLatencyMs: 20, estimatedCost: 0 };
    },
    async healthCheck() {
      return true;
    },
  };
}

// --- Policy rules ---

const ENTERPRISE_POLICY: PolicyRule[] = [
  {
    id: "allow-inference",
    name: "Allow inference for trusted users",
    permissions: ["canInfer", "canPlan"],
    effect: "allow",
    priority: 10,
  },
  {
    id: "allow-memory",
    name: "Allow memory operations",
    permissions: ["canRemember", "canRetrieve"],
    effect: "allow",
    priority: 10,
  },
  {
    id: "deny-cloud-default",
    name: "Deny cloud routing by default",
    permissions: ["canRouteToCloud"],
    effect: "deny",
    priority: 5,
  },
];

// --- Demo ---

async function main() {
  console.log("=== Lattice Kernel Sandbox Demo ===\n");

  // 1. Create the runtime
  const lattice = createLattice({
    adapters: [createDemoAdapter()],
    policyRules: ENTERPRISE_POLICY,
    defaultTrustLevel: "trusted_user_explicit",
    defaultScope: { tenantId: "acme-corp", appId: "copilot", userId: "user-42" },
  });

  // 2. Check health
  const health = await lattice.healthCheck();
  console.log("Health check:", health);

  // 3. List models
  const models = await lattice.listModels();
  console.log("Available models:", models);

  // 4. Run inference (matches spec section 25 pseudocode)
  console.log("\n--- Inference ---");
  const result = await lattice.infer(
    "Summarize the last customer interaction and suggest next steps.",
    { model: "demo-assistant-v1" },
  );
  console.log(`Output: ${result.output}`);
  console.log(`Route: ${result.route} | Duration: ${result.durationMs}ms`);

  // 5. Remember facts (matches spec section 25)
  console.log("\n--- Memory ---");
  await lattice.remember(
    "Customer prefers quarterly billing and email communication.",
    {
      type: "preference",
      provenance: { source: "explicit_user_statement", requestId: result.requestId },
    },
  );
  await lattice.remember("Customer timezone is America/Los_Angeles (PST).", {
    type: "preference",
  });
  await lattice.remember(
    "Last interaction was about upgrading from Basic to Pro plan.",
    { type: "episodic" },
  );
  console.log("Stored 3 memory items");

  // 6. Retrieve relevant memory
  const memories = await lattice.retrieve("billing preferences");
  console.log(`Retrieved ${memories.length} relevant memories:`);
  for (const mem of memories) {
    console.log(`  [${mem.type}] ${mem.content}`);
  }

  // 7. Checkpoint
  console.log("\n--- Checkpoint ---");
  const cp = await lattice.checkpoint("after initial memory setup");
  console.log(`Checkpoint created: ${cp.checkpointId}`);

  // 8. Add experimental memory, then rollback
  await lattice.remember("EXPERIMENTAL: Customer wants to cancel.", {
    type: "semantic",
  });
  console.log("Added experimental memory (total items visible)");

  const beforeRollback = await lattice.retrieve("experimental cancel", {
    types: ["semantic"],
  });
  console.log(
    `Before rollback: ${beforeRollback.length} semantic item(s) matching "cancel"`,
  );

  await lattice.rollback(cp.checkpointId);
  console.log("Rolled back to checkpoint");

  const afterRollback = await lattice.retrieve("experimental cancel", {
    types: ["semantic"],
  });
  console.log(
    `After rollback: ${afterRollback.length} semantic item(s) matching "cancel"`,
  );

  // 9. Dynamic policy
  console.log("\n--- Dynamic Policy ---");
  lattice.addPolicyRule({
    id: "allow-act",
    name: "Allow actions for trusted users",
    permissions: ["canAct"],
    effect: "allow",
    priority: 10,
  });
  console.log("Added action permission rule");

  // 10. Summary
  console.log("\n=== Demo Complete ===");
  console.log("All core verbs demonstrated: infer, remember, retrieve, checkpoint, rollback");
}

main().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
