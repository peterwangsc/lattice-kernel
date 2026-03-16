import { describe, it, expect } from "vitest";
import { createRetryAdapter } from "../retry-adapter.js";
import type { BackendAdapter } from "@lattice-kernel/schemas";

function createMockAdapter(
  overrides: Partial<BackendAdapter> = {},
): BackendAdapter {
  return {
    providerId: "test",
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
    async infer(request) {
      return {
        output: `ok: ${request.input}`,
        modelId: request.modelId,
        durationMs: 1,
      };
    },
    async embed() {
      return { embedding: [0.1], modelId: "m", dimensions: 1 };
    },
    async estimate() {
      return {};
    },
    async healthCheck() {
      return true;
    },
    ...overrides,
  };
}

describe("RetryAdapter", () => {
  it("passes through on success", async () => {
    const adapter = createRetryAdapter(createMockAdapter());
    const result = await adapter.infer({ modelId: "m", input: "hello" });
    expect(result.output).toBe("ok: hello");
  });

  it("retries on retryable error then succeeds", async () => {
    let callCount = 0;
    const adapter = createRetryAdapter(
      createMockAdapter({
        async infer(request) {
          callCount++;
          if (callCount < 3) {
            throw new Error("503 Service Unavailable");
          }
          return {
            output: `ok: ${request.input}`,
            modelId: request.modelId,
            durationMs: 1,
          };
        },
      }),
      { baseDelayMs: 1, maxDelayMs: 5 }, // Fast for tests
    );

    const result = await adapter.infer({ modelId: "m", input: "test" });
    expect(result.output).toBe("ok: test");
    expect(callCount).toBe(3);
  });

  it("throws after max retries exhausted", async () => {
    const adapter = createRetryAdapter(
      createMockAdapter({
        async infer() {
          throw new Error("503 Service Unavailable");
        },
      }),
      { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 5 },
    );

    await expect(
      adapter.infer({ modelId: "m", input: "test" }),
    ).rejects.toThrow("503");
  });

  it("does not retry non-retryable errors", async () => {
    let callCount = 0;
    const adapter = createRetryAdapter(
      createMockAdapter({
        async infer() {
          callCount++;
          throw new Error("400 Bad Request");
        },
      }),
      { maxRetries: 3, baseDelayMs: 1 },
    );

    await expect(
      adapter.infer({ modelId: "m", input: "test" }),
    ).rejects.toThrow("400");
    expect(callCount).toBe(1); // No retries for 400
  });

  it("retries 429 rate limit errors", async () => {
    let callCount = 0;
    const adapter = createRetryAdapter(
      createMockAdapter({
        async infer(request) {
          callCount++;
          if (callCount === 1) {
            throw new Error("429 Too Many Requests");
          }
          return {
            output: "ok",
            modelId: request.modelId,
            durationMs: 1,
          };
        },
      }),
      { baseDelayMs: 1 },
    );

    const result = await adapter.infer({ modelId: "m", input: "test" });
    expect(result.output).toBe("ok");
    expect(callCount).toBe(2);
  });

  it("retries embed operations", async () => {
    let callCount = 0;
    const adapter = createRetryAdapter(
      createMockAdapter({
        async embed() {
          callCount++;
          if (callCount === 1) {
            throw new Error("500 Internal Server Error");
          }
          return { embedding: [0.5], modelId: "m", dimensions: 1 };
        },
      }),
      { baseDelayMs: 1 },
    );

    const result = await adapter.embed({ modelId: "m", content: "test" });
    expect(result.embedding).toEqual([0.5]);
    expect(callCount).toBe(2);
  });

  it("supports custom retryable error predicate", async () => {
    let callCount = 0;
    const adapter = createRetryAdapter(
      createMockAdapter({
        async infer(request) {
          callCount++;
          if (callCount === 1) {
            throw new Error("CUSTOM_TRANSIENT_ERROR");
          }
          return {
            output: "ok",
            modelId: request.modelId,
            durationMs: 1,
          };
        },
      }),
      {
        baseDelayMs: 1,
        retryableErrors: (err) => err.message.includes("CUSTOM_TRANSIENT"),
      },
    );

    const result = await adapter.infer({ modelId: "m", input: "test" });
    expect(result.output).toBe("ok");
    expect(callCount).toBe(2);
  });

  it("preserves providerId from inner adapter", () => {
    const adapter = createRetryAdapter(
      createMockAdapter({ providerId: "my-provider" } as Partial<BackendAdapter> & { providerId: string }),
    );
    expect(adapter.providerId).toBe("my-provider");
  });

  it("does not wrap streaming (passes through)", () => {
    const inner = createMockAdapter();
    // No inferStream on mock — verify retryAdapter also has none
    const adapter = createRetryAdapter(inner);
    expect(adapter.inferStream).toBeUndefined();
  });
});
