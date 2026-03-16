import { describe, it, expect, beforeEach } from "vitest";
import { createRuntime } from "../runtime.js";
import { createPolicyEngine } from "@lattice-kernel/policy-engine";
import { createMemoryAuditSink } from "@lattice-kernel/audit";
import type { BackendAdapter, PolicyRule, InferStreamChunk } from "@lattice-kernel/schemas";
import type { Runtime, ToolAdapter } from "../types.js";

function createMockAdapter(
  overrides: Partial<BackendAdapter> & { providerId: string },
): BackendAdapter {
  return {
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
          id: "mock-model",
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
        output: `mock response to: ${request.input}`,
        modelId: request.modelId,
        tokensUsed: 10,
        durationMs: 1,
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
      return { estimatedLatencyMs: 5, estimatedCost: 0 };
    },
    async healthCheck() {
      return true;
    },
    ...overrides,
  };
}

describe("Runtime", () => {
  let runtime: Runtime;
  let auditSink: ReturnType<typeof createMemoryAuditSink>;

  beforeEach(() => {
    const policyEngine = createPolicyEngine({ defaultDeny: false });
    auditSink = createMemoryAuditSink();
    const adapter = createMockAdapter({ providerId: "test-local" });
    runtime = createRuntime({
      adapters: [adapter],
      policyEngine,
      auditSink,
    });
  });

  describe("infer", () => {
    it("returns inference result with metadata", async () => {
      const result = await runtime.infer({
        input: "hello world",
        trustLevel: "trusted_user_explicit",
      });

      expect(result.requestId).toBeTruthy();
      expect(result.output).toContain("hello world");
      expect(result.route).toBe("test-local");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.policyDecision.allowed).toBe(true);
    });

    it("emits audit event on successful infer", async () => {
      await runtime.infer({
        input: "test",
        trustLevel: "trusted_user_explicit",
      });

      const events = await auditSink.query({ type: "infer" });
      expect(events).toHaveLength(1);
      expect(events[0]!.route).toBe("test-local");
      expect(events[0]!.error).toBeUndefined();
    });

    it("throws and audits when policy denies", async () => {
      const policyEngine = createPolicyEngine({ defaultDeny: true });
      const deniedRuntime = createRuntime({
        adapters: [createMockAdapter({ providerId: "test" })],
        policyEngine,
        auditSink,
      });

      await expect(
        deniedRuntime.infer({
          input: "blocked",
          trustLevel: "trusted_user_explicit",
        }),
      ).rejects.toThrow("Policy denied");

      const events = await auditSink.query({ type: "infer" });
      expect(events).toHaveLength(1);
      expect(events[0]!.error).toBeTruthy();
    });

    it("passes model and options to adapter", async () => {
      const result = await runtime.infer({
        input: "test",
        model: "my-model",
        trustLevel: "trusted_user_explicit",
        maxTokens: 100,
        temperature: 0.5,
      });

      expect(result.model).toBe("my-model");
    });

    it("throws when no adapters configured", async () => {
      const policyEngine = createPolicyEngine({ defaultDeny: false });
      const emptyRuntime = createRuntime({
        adapters: [],
        policyEngine,
        auditSink,
      });

      await expect(
        emptyRuntime.infer({
          input: "test",
          trustLevel: "trusted_user_explicit",
        }),
      ).rejects.toThrow("No adapters configured");
    });
  });

  describe("route selection", () => {
    it("selects local adapter when preference is local", async () => {
      const localAdapter = createMockAdapter({ providerId: "local-1" });
      const cloudAdapter = createMockAdapter({
        providerId: "cloud-1",
        async getCapabilities() {
          return {
            supportsLocalExecution: false,
            supportsCloudExecution: true,
            supportsAdaptation: false,
            supportedFormats: [],
          };
        },
      });

      const policyEngine = createPolicyEngine({ defaultDeny: false });
      const rt = createRuntime({
        adapters: [cloudAdapter, localAdapter],
        policyEngine,
        auditSink,
      });

      const result = await rt.infer({
        input: "test",
        executionPreference: "local",
        trustLevel: "trusted_user_explicit",
      });
      expect(result.route).toBe("local-1");
    });

    it("selects cloud adapter when preference is cloud", async () => {
      const localAdapter = createMockAdapter({ providerId: "local-1" });
      const cloudAdapter = createMockAdapter({
        providerId: "cloud-1",
        async getCapabilities() {
          return {
            supportsLocalExecution: false,
            supportsCloudExecution: true,
            supportsAdaptation: false,
            supportedFormats: [],
          };
        },
      });

      const policyEngine = createPolicyEngine({ defaultDeny: false });
      const rt = createRuntime({
        adapters: [localAdapter, cloudAdapter],
        policyEngine,
        auditSink,
      });

      const result = await rt.infer({
        input: "test",
        executionPreference: "cloud",
        trustLevel: "trusted_user_explicit",
      });
      expect(result.route).toBe("cloud-1");
    });

    it("falls back to first healthy adapter on auto", async () => {
      const unhealthy = createMockAdapter({
        providerId: "unhealthy",
        async healthCheck() {
          return false;
        },
        async getCapabilities() {
          return {
            supportsLocalExecution: false,
            supportsCloudExecution: false,
            supportsAdaptation: false,
            supportedFormats: [],
          };
        },
      });
      const healthy = createMockAdapter({ providerId: "healthy" });

      const policyEngine = createPolicyEngine({ defaultDeny: false });
      const rt = createRuntime({
        adapters: [unhealthy, healthy],
        policyEngine,
        auditSink,
      });

      const result = await rt.infer({
        input: "test",
        executionPreference: "auto",
        trustLevel: "trusted_user_explicit",
      });
      expect(result.route).toBe("healthy");
    });

    it("routes to correct adapter based on model ID via registry", async () => {
      const adapter1 = createMockAdapter({
        providerId: "adapter-a",
        async listModels() {
          return [
            {
              id: "model-a",
              version: "1.0",
              provider: "a",
              format: "mock",
              capabilities: {
                supportsEmbedding: false,
                supportsToolCalling: false,
                supportsAdaptation: false,
                supportsMultimodal: false,
              },
              executionTargets: ["cpu"],
              policyTags: [],
            },
          ];
        },
      });
      const adapter2 = createMockAdapter({
        providerId: "adapter-b",
        async listModels() {
          return [
            {
              id: "model-b",
              version: "1.0",
              provider: "b",
              format: "mock",
              capabilities: {
                supportsEmbedding: false,
                supportsToolCalling: false,
                supportsAdaptation: false,
                supportsMultimodal: false,
              },
              executionTargets: ["cloud"],
              policyTags: [],
            },
          ];
        },
      });

      const policyEngine = createPolicyEngine({ defaultDeny: false });
      const rt = createRuntime({
        adapters: [adapter1, adapter2],
        policyEngine,
        auditSink,
      });

      // model-b should route to adapter-b
      const result = await rt.infer({
        input: "test",
        model: "model-b",
        trustLevel: "trusted_user_explicit",
      });
      expect(result.route).toBe("adapter-b");
    });
  });

  describe("embed", () => {
    it("returns embedding result", async () => {
      const result = await runtime.embed({
        content: "test content",
        trustLevel: "trusted_user_explicit",
      });

      expect(result.requestId).toBeTruthy();
      expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(result.dimensions).toBe(3);
    });

    it("emits audit event for embed", async () => {
      await runtime.embed({
        content: "test",
        trustLevel: "trusted_user_explicit",
      });

      const events = await auditSink.query({ type: "embed" });
      expect(events).toHaveLength(1);
    });

    it("throws when policy denies embed", async () => {
      const policyEngine = createPolicyEngine({ defaultDeny: true });
      const deniedRuntime = createRuntime({
        adapters: [createMockAdapter({ providerId: "test" })],
        policyEngine,
        auditSink,
      });

      await expect(
        deniedRuntime.embed({
          content: "test",
          trustLevel: "trusted_user_explicit",
        }),
      ).rejects.toThrow("Policy denied");
    });
  });

  describe("listAvailableModels", () => {
    it("aggregates models from all adapters", async () => {
      const a1 = createMockAdapter({ providerId: "a1" });
      const a2 = createMockAdapter({ providerId: "a2" });

      const policyEngine = createPolicyEngine({ defaultDeny: false });
      const rt = createRuntime({
        adapters: [a1, a2],
        policyEngine,
        auditSink,
      });

      const models = await rt.listAvailableModels();
      expect(models).toEqual(["mock-model", "mock-model"]);
    });
  });

  describe("healthCheck", () => {
    it("returns health status per adapter", async () => {
      const healthy = createMockAdapter({ providerId: "ok" });
      const unhealthy = createMockAdapter({
        providerId: "down",
        async healthCheck() {
          return false;
        },
      });

      const policyEngine = createPolicyEngine({ defaultDeny: false });
      const rt = createRuntime({
        adapters: [healthy, unhealthy],
        policyEngine,
        auditSink,
      });

      const status = await rt.healthCheck();
      expect(status).toEqual({ ok: true, down: false });
    });
  });

  describe("plan", () => {
    it("creates a plan in draft status", async () => {
      const plan = await runtime.plan({
        goal: "Send weekly report email",
        trustLevel: "trusted_user_explicit",
        availableTools: ["email-send"],
      });

      expect(plan.planId).toBeTruthy();
      expect(plan.intent).toBe("Send weekly report email");
      expect(plan.status).toBe("draft");
      expect(plan.steps.length).toBeGreaterThan(0);
    });

    it("accepts pre-built steps", async () => {
      const plan = await runtime.plan({
        goal: "Complex workflow",
        trustLevel: "trusted_user_explicit",
        steps: [
          {
            id: "s1",
            description: "Fetch data",
            requiredTools: ["api-call"],
            dependencies: [],
            riskFlags: [],
            requiresApproval: false,
          },
          {
            id: "s2",
            description: "Process data",
            requiredTools: [],
            dependencies: ["s1"],
            riskFlags: [],
            requiresApproval: false,
          },
        ],
      });

      expect(plan.steps).toHaveLength(2);
      expect(plan.steps[1]!.dependencies).toContain("s1");
    });

    it("emits audit event", async () => {
      await runtime.plan({
        goal: "test",
        trustLevel: "trusted_user_explicit",
      });

      const events = await auditSink.query({ type: "plan" });
      expect(events).toHaveLength(1);
    });

    it("throws when policy denies planning", async () => {
      const policyEngine = createPolicyEngine({ defaultDeny: true });
      const deniedRuntime = createRuntime({
        adapters: [createMockAdapter({ providerId: "test" })],
        policyEngine,
        auditSink,
      });

      await expect(
        deniedRuntime.plan({
          goal: "test",
          trustLevel: "trusted_user_explicit",
        }),
      ).rejects.toThrow("Policy denied plan");
    });
  });

  describe("act", () => {
    function createToolRuntime(tool: ToolAdapter, rules: PolicyRule[] = []): Runtime {
      const policyEngine = createPolicyEngine({ defaultDeny: false });
      for (const rule of rules) {
        policyEngine.addRule(rule);
      }
      return createRuntime({
        adapters: [createMockAdapter({ providerId: "test" })],
        policyEngine,
        auditSink,
        tools: [tool],
      });
    }

    it("executes a tool and returns action result", async () => {
      const tool: ToolAdapter = {
        toolId: "calculator",
        async execute(input) {
          const a = input.a as number;
          const b = input.b as number;
          return { result: a + b };
        },
      };

      const rt = createToolRuntime(tool);
      const result = await rt.act({
        tool: "calculator",
        input: { a: 2, b: 3 },
        trustLevel: "trusted_user_explicit",
      });

      expect(result.action.tool).toBe("calculator");
      expect(result.action.result).toEqual({ result: 5 });
      expect(result.policyDecision.allowed).toBe(true);
    });

    it("emits audit event for action", async () => {
      const tool: ToolAdapter = {
        toolId: "noop",
        async execute() {
          return {};
        },
      };

      const rt = createToolRuntime(tool);
      await rt.act({
        tool: "noop",
        input: {},
        trustLevel: "trusted_user_explicit",
      });

      const events = await auditSink.query({ type: "act" });
      expect(events).toHaveLength(1);
    });

    it("throws when tool not found", async () => {
      await expect(
        runtime.act({
          tool: "nonexistent",
          input: {},
          trustLevel: "trusted_user_explicit",
        }),
      ).rejects.toThrow("Tool not found");
    });

    it("throws when policy denies action", async () => {
      const policyEngine = createPolicyEngine({ defaultDeny: true });
      const rt = createRuntime({
        adapters: [createMockAdapter({ providerId: "test" })],
        policyEngine,
        auditSink,
        tools: [{ toolId: "test", async execute() { return {}; } }],
      });

      await expect(
        rt.act({
          tool: "test",
          input: {},
          trustLevel: "trusted_user_explicit",
        }),
      ).rejects.toThrow("Policy denied action");
    });

    it("includes plan reference in action when provided", async () => {
      const tool: ToolAdapter = {
        toolId: "email",
        async execute() {
          return { sent: true };
        },
      };

      const rt = createToolRuntime(tool);
      const result = await rt.act({
        tool: "email",
        input: { to: "user@example.com" },
        trustLevel: "trusted_user_explicit",
        planRef: "plan_123",
      });

      expect(result.action.planRef).toBe("plan_123");
    });
  });

  describe("inferStream", () => {
    it("streams response as chunks (fallback from non-streaming adapter)", async () => {
      const result = await runtime.inferStream({
        input: "hello",
        trustLevel: "trusted_user_explicit",
      });

      expect(result.requestId).toBeTruthy();
      expect(result.route).toBe("test-local");

      const chunks: InferStreamChunk[] = [];
      for await (const chunk of result.stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks.some((c) => c.type === "text_delta")).toBe(true);
      expect(chunks.some((c) => c.type === "done")).toBe(true);

      const textChunk = chunks.find((c) => c.type === "text_delta");
      expect(textChunk!.text).toContain("hello");
    });

    it("uses native streaming when adapter supports it", async () => {
      const streamingAdapter = createMockAdapter({
        providerId: "streaming",
        async *inferStream(request) {
          yield { type: "text_delta" as const, text: "Hello " };
          yield { type: "text_delta" as const, text: "World" };
          yield {
            type: "usage" as const,
            tokensUsed: 5,
            modelId: request.modelId,
          };
          yield { type: "done" as const };
        },
      });

      const policyEngine = createPolicyEngine({ defaultDeny: false });
      const rt = createRuntime({
        adapters: [streamingAdapter],
        policyEngine,
        auditSink,
      });

      const result = await rt.inferStream({
        input: "test",
        trustLevel: "trusted_user_explicit",
      });

      const chunks: InferStreamChunk[] = [];
      for await (const chunk of result.stream) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(4);
      expect(chunks[0]!.text).toBe("Hello ");
      expect(chunks[1]!.text).toBe("World");
      expect(chunks[2]!.tokensUsed).toBe(5);
      expect(chunks[3]!.type).toBe("done");
    });

    it("emits audit event after streaming completes", async () => {
      const result = await runtime.inferStream({
        input: "test",
        trustLevel: "trusted_user_explicit",
      });

      // Consume the stream
      for await (const _chunk of result.stream) {
        // drain
      }

      const events = await auditSink.query({ type: "infer" });
      expect(events.length).toBeGreaterThan(0);
    });

    it("throws when policy denies streaming", async () => {
      const policyEngine = createPolicyEngine({ defaultDeny: true });
      const deniedRuntime = createRuntime({
        adapters: [createMockAdapter({ providerId: "test" })],
        policyEngine,
        auditSink,
      });

      await expect(
        deniedRuntime.inferStream({
          input: "test",
          trustLevel: "trusted_user_explicit",
        }),
      ).rejects.toThrow("Policy denied");
    });
  });
});
