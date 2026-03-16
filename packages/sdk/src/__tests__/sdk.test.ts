import { describe, it, expect } from "vitest";
import { createLattice } from "../client.js";
import type { BackendAdapter, PolicyRule } from "@lattice-kernel/schemas";
import type { ToolAdapter } from "@lattice-kernel/runtime";

function createMockAdapter(): BackendAdapter {
  return {
    providerId: "mock",
    async getCapabilities() {
      return {
        supportsLocalExecution: true,
        supportsCloudExecution: false,
        supportsAdaptation: false,
        supportedFormats: ["mock"],
      };
    },
    async listModels() {
      return [
        {
          id: "mock-model-v1",
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
          policyTags: [],
        },
      ];
    },
    async infer(request) {
      return {
        output: `Response to: ${request.input}`,
        modelId: request.modelId,
        tokensUsed: 5,
        durationMs: 1,
      };
    },
    async embed(request) {
      // Simple deterministic embedding for testing
      const sum = [...request.content].reduce((a, c) => a + c.charCodeAt(0), 0);
      return {
        embedding: [sum / 1000, (sum % 100) / 100, 0.5],
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

const ALLOW_ALL_RULE: PolicyRule = {
  id: "allow-all",
  name: "Allow all operations",
  permissions: [
    "canInfer",
    "canRetrieve",
    "canRemember",
    "canAdapt",
    "canPlan",
    "canAct",
    "canRouteToCloud",
  ],
  effect: "allow",
  priority: 1,
};

describe("Lattice SDK", () => {
  describe("createLattice", () => {
    it("creates a Lattice instance", () => {
      const lattice = createLattice({
        adapters: [createMockAdapter()],
        policyRules: [ALLOW_ALL_RULE],
      });
      expect(lattice).toBeDefined();
    });
  });

  describe("infer", () => {
    it("runs inference through the full pipeline", async () => {
      const lattice = createLattice({
        adapters: [createMockAdapter()],
        policyRules: [ALLOW_ALL_RULE],
      });

      const result = await lattice.infer("What is the weather?");
      expect(result.output).toContain("What is the weather?");
      expect(result.requestId).toBeTruthy();
      expect(result.route).toBe("mock");
    });

    it("uses default trust level and scope", async () => {
      const lattice = createLattice({
        adapters: [createMockAdapter()],
        defaultTrustLevel: "trusted_admin",
        defaultScope: { tenantId: "acme", appId: "assistant" },
        policyRules: [ALLOW_ALL_RULE],
      });

      const result = await lattice.infer("test");
      expect(result.policyDecision.allowed).toBe(true);
    });

    it("respects policy denial", async () => {
      const lattice = createLattice({
        adapters: [createMockAdapter()],
        defaultDeny: true,
        // No allow rules
      });

      await expect(lattice.infer("test")).rejects.toThrow("Policy denied");
    });
  });

  describe("embed", () => {
    it("generates embeddings", async () => {
      const lattice = createLattice({
        adapters: [createMockAdapter()],
        policyRules: [ALLOW_ALL_RULE],
      });

      const result = await lattice.embed("test content");
      expect(result.embedding).toHaveLength(3);
      expect(result.dimensions).toBe(3);
    });
  });

  describe("remember and retrieve", () => {
    it("stores and retrieves memories", async () => {
      const lattice = createLattice({
        adapters: [createMockAdapter()],
        policyRules: [ALLOW_ALL_RULE],
        defaultScope: { tenantId: "acme", userId: "user1" },
      });

      await lattice.remember("Customer prefers quarterly billing");
      await lattice.remember("Customer's timezone is PST");

      const results = await lattice.retrieve("billing");
      expect(results).toHaveLength(2);
      expect(results[0]!.content).toContain("billing");
    });

    it("scopes memory retrieval", async () => {
      const lattice = createLattice({
        adapters: [createMockAdapter()],
        policyRules: [ALLOW_ALL_RULE],
      });

      await lattice.remember("Acme fact", {
        scope: { tenantId: "acme" },
      });
      await lattice.remember("Beta fact", {
        scope: { tenantId: "beta" },
      });

      const acmeResults = await lattice.retrieve("fact", {
        scope: { tenantId: "acme" },
      });
      expect(acmeResults).toHaveLength(1);
      expect(acmeResults[0]!.content).toBe("Acme fact");
    });

    it("filters by memory type", async () => {
      const lattice = createLattice({
        adapters: [createMockAdapter()],
        policyRules: [ALLOW_ALL_RULE],
      });

      await lattice.remember("user likes dark mode", { type: "preference" });
      await lattice.remember("the sky is blue", { type: "semantic" });

      const prefs = await lattice.retrieve("user", {
        types: ["preference"],
      });
      expect(prefs).toHaveLength(1);
      expect(prefs[0]!.type).toBe("preference");
    });
  });

  describe("policy management", () => {
    it("allows adding and removing policy rules at runtime", async () => {
      const lattice = createLattice({
        adapters: [createMockAdapter()],
        defaultDeny: true,
      });

      // Initially denied
      await expect(lattice.infer("test")).rejects.toThrow("Policy denied");

      // Add allow rule
      lattice.addPolicyRule(ALLOW_ALL_RULE);
      const result = await lattice.infer("test");
      expect(result.output).toBeTruthy();

      // Remove allow rule — back to denied
      lattice.removePolicyRule("allow-all");
      await expect(lattice.infer("test")).rejects.toThrow("Policy denied");
    });
  });

  describe("listModels", () => {
    it("returns available models from adapters", async () => {
      const lattice = createLattice({
        adapters: [createMockAdapter()],
        policyRules: [ALLOW_ALL_RULE],
      });

      const models = await lattice.listModels();
      expect(models).toContain("mock-model-v1");
    });
  });

  describe("healthCheck", () => {
    it("returns adapter health status", async () => {
      const lattice = createLattice({
        adapters: [createMockAdapter()],
        policyRules: [ALLOW_ALL_RULE],
      });

      const status = await lattice.healthCheck();
      expect(status.mock).toBe(true);
    });
  });

  describe("checkpoint and rollback", () => {
    it("checkpoints and rolls back memory state", async () => {
      const lattice = createLattice({
        adapters: [createMockAdapter()],
        policyRules: [ALLOW_ALL_RULE],
      });

      await lattice.remember("original fact");
      const cp = await lattice.checkpoint("before experiment");

      await lattice.remember("experimental fact");
      let results = await lattice.retrieve("fact");
      expect(results).toHaveLength(2);

      await lattice.rollback(cp.checkpointId);
      results = await lattice.retrieve("fact");
      expect(results).toHaveLength(1);
      expect(results[0]!.content).toBe("original fact");
    });

    it("lists checkpoints", async () => {
      const lattice = createLattice({
        adapters: [createMockAdapter()],
        policyRules: [ALLOW_ALL_RULE],
      });

      await lattice.checkpoint("first");
      await lattice.checkpoint("second");

      const cps = lattice.listCheckpoints();
      expect(cps).toHaveLength(2);
    });
  });

  describe("plan", () => {
    it("creates a plan from a goal", async () => {
      const lattice = createLattice({
        adapters: [createMockAdapter()],
        policyRules: [ALLOW_ALL_RULE],
      });

      const plan = await lattice.plan("Send a report to the team");
      expect(plan.planId).toBeTruthy();
      expect(plan.intent).toBe("Send a report to the team");
      expect(plan.status).toBe("draft");
    });

    it("accepts custom steps", async () => {
      const lattice = createLattice({
        adapters: [createMockAdapter()],
        policyRules: [ALLOW_ALL_RULE],
      });

      const plan = await lattice.plan("Multi-step workflow", {
        steps: [
          {
            id: "s1",
            description: "Gather data",
            requiredTools: [],
            dependencies: [],
            riskFlags: [],
            requiresApproval: false,
          },
        ],
      });
      expect(plan.steps).toHaveLength(1);
    });
  });

  describe("act", () => {
    it("executes a tool through the SDK", async () => {
      const calculator: ToolAdapter = {
        toolId: "calc",
        async execute(input) {
          return { sum: (input.a as number) + (input.b as number) };
        },
      };

      const lattice = createLattice({
        adapters: [createMockAdapter()],
        tools: [calculator],
        policyRules: [ALLOW_ALL_RULE],
      });

      const result = await lattice.act("calc", { input: { a: 10, b: 20 } });
      expect(result.action.result).toEqual({ sum: 30 });
      expect(result.action.tool).toBe("calc");
    });

    it("throws when policy denies action", async () => {
      const lattice = createLattice({
        adapters: [createMockAdapter()],
        tools: [{ toolId: "t", async execute() { return {}; } }],
        defaultDeny: true,
      });

      await expect(lattice.act("t")).rejects.toThrow("Policy denied");
    });
  });
});
