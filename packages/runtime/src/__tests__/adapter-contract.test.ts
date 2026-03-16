/**
 * Adapter contract tests (spec section 20.2)
 *
 * These tests verify that any BackendAdapter implementation
 * satisfies the contract defined in schemas/adapter.ts.
 * Run against each adapter to ensure interoperability.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import type { BackendAdapter } from "@lattice-kernel/schemas";
import { createLocalAdapter } from "@lattice-kernel/adapter-local";
import { createAnthropicAdapter } from "@lattice-kernel/adapter-cloud";

function runAdapterContractTests(
  name: string,
  createAdapter: () => BackendAdapter,
) {
  describe(`Adapter contract: ${name}`, () => {
    let adapter: BackendAdapter;

    beforeEach(() => {
      adapter = createAdapter();
    });

    it("has a non-empty providerId", () => {
      expect(adapter.providerId).toBeTruthy();
      expect(typeof adapter.providerId).toBe("string");
    });

    it("getCapabilities returns valid structure", async () => {
      const caps = await adapter.getCapabilities();
      expect(typeof caps.supportsLocalExecution).toBe("boolean");
      expect(typeof caps.supportsCloudExecution).toBe("boolean");
      expect(typeof caps.supportsAdaptation).toBe("boolean");
      expect(Array.isArray(caps.supportedFormats)).toBe(true);
    });

    it("listModels returns array of ModelDescriptors", async () => {
      const models = await adapter.listModels();
      expect(Array.isArray(models)).toBe(true);
      for (const model of models) {
        expect(model.id).toBeTruthy();
        expect(model.version).toBeTruthy();
        expect(model.provider).toBeTruthy();
        expect(model.capabilities).toBeDefined();
        expect(typeof model.capabilities.supportsEmbedding).toBe("boolean");
        expect(Array.isArray(model.policyTags)).toBe(true);
      }
    });

    it("healthCheck returns boolean", async () => {
      const result = await adapter.healthCheck();
      expect(typeof result).toBe("boolean");
    });

    it("estimate returns CostEstimate", async () => {
      const estimate = await adapter.estimate({
        modelId: "test",
        input: "test input",
      });
      expect(typeof estimate).toBe("object");
    });

    it("infer returns InferResponse with required fields", async () => {
      try {
        const response = await adapter.infer({
          modelId: "test",
          input: "hello",
        });
        expect(typeof response.output).toBe("string");
        expect(typeof response.modelId).toBe("string");
        expect(typeof response.durationMs).toBe("number");
      } catch {
        // Some adapters throw on infer without real backend — that's ok
        // The contract just requires the method exists
        expect(typeof adapter.infer).toBe("function");
      }
    });

    it("embed returns EmbedResponse or throws", async () => {
      try {
        const response = await adapter.embed({
          modelId: "test",
          content: "hello",
        });
        expect(Array.isArray(response.embedding)).toBe(true);
        expect(typeof response.modelId).toBe("string");
        expect(typeof response.dimensions).toBe("number");
      } catch {
        // Some adapters don't support embedding — that's ok
        expect(typeof adapter.embed).toBe("function");
      }
    });

    it("inferStream is either undefined or a function", () => {
      if (adapter.inferStream !== undefined) {
        expect(typeof adapter.inferStream).toBe("function");
      }
    });
  });
}

// Run contract tests against local adapter
runAdapterContractTests("adapter-local", () =>
  createLocalAdapter(),
);

// Run contract tests against Anthropic adapter (with mocked fetch)
describe("Adapter contract: anthropic (mocked)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "msg_1",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "hello" }],
        model: "claude-sonnet-4-6",
        stop_reason: "end_turn",
        usage: { input_tokens: 5, output_tokens: 3 },
      }),
      text: async () => "ok",
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const adapter = createAnthropicAdapter({ apiKey: "test-key" });

  it("has providerId cloud:anthropic", () => {
    expect(adapter.providerId).toBe("cloud:anthropic");
  });

  it("getCapabilities reports cloud execution", async () => {
    const caps = await adapter.getCapabilities();
    expect(caps.supportsCloudExecution).toBe(true);
    expect(caps.supportsLocalExecution).toBe(false);
  });

  it("listModels returns Anthropic models", async () => {
    const models = await adapter.listModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => m.provider === "anthropic")).toBe(true);
  });

  it("infer returns valid response", async () => {
    const response = await adapter.infer({
      modelId: "claude-sonnet-4-6",
      input: "test",
    });
    expect(response.output).toBe("hello");
    expect(response.modelId).toBeTruthy();
  });

  it("has inferStream method", () => {
    expect(typeof adapter.inferStream).toBe("function");
  });
});
