import { describe, it, expect, vi } from "vitest";
import { createRateLimitedAdapter } from "../rate-limiter.js";
import type { BackendAdapter } from "@lattice-kernel/schemas";

function createMockAdapter(): BackendAdapter {
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
  };
}

describe("RateLimitedAdapter", () => {
  it("allows requests within rate limit", async () => {
    const adapter = createRateLimitedAdapter(createMockAdapter(), {
      maxRequests: 5,
      windowMs: 1000,
    });

    // 5 requests should all succeed immediately
    for (let i = 0; i < 5; i++) {
      const result = await adapter.infer({ modelId: "m", input: `req ${i}` });
      expect(result.output).toBe(`ok: req ${i}`);
    }
  });

  it("delays requests that exceed rate limit", async () => {
    vi.useFakeTimers();

    const adapter = createRateLimitedAdapter(createMockAdapter(), {
      maxRequests: 2,
      windowMs: 100,
    });

    // First 2 should be immediate
    await adapter.infer({ modelId: "m", input: "1" });
    await adapter.infer({ modelId: "m", input: "2" });

    // Third should be delayed
    const thirdPromise = adapter.infer({ modelId: "m", input: "3" });
    let resolved = false;
    thirdPromise.then(() => {
      resolved = true;
    });

    // Should not be resolved yet
    await vi.advanceTimersByTimeAsync(50);
    expect(resolved).toBe(false);

    // Should resolve after window expires
    await vi.advanceTimersByTimeAsync(60);
    expect(resolved).toBe(true);

    vi.useRealTimers();
  });

  it("preserves providerId", () => {
    const adapter = createRateLimitedAdapter(
      { ...createMockAdapter(), providerId: "my-provider" },
      { maxRequests: 10, windowMs: 1000 },
    );
    expect(adapter.providerId).toBe("my-provider");
  });

  it("does not rate limit estimate and healthCheck", async () => {
    const adapter = createRateLimitedAdapter(createMockAdapter(), {
      maxRequests: 1,
      windowMs: 10000,
    });

    // Use up the rate limit
    await adapter.infer({ modelId: "m", input: "test" });

    // These should still work without waiting
    const estimate = await adapter.estimate({
      modelId: "m",
      input: "test",
    });
    expect(estimate).toBeDefined();

    const healthy = await adapter.healthCheck();
    expect(healthy).toBe(true);
  });

  it("rate limits embed operations", async () => {
    vi.useFakeTimers();

    const adapter = createRateLimitedAdapter(createMockAdapter(), {
      maxRequests: 1,
      windowMs: 100,
    });

    await adapter.embed({ modelId: "m", content: "first" });

    const secondPromise = adapter.embed({ modelId: "m", content: "second" });
    let resolved = false;
    secondPromise.then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(50);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(60);
    expect(resolved).toBe(true);

    vi.useRealTimers();
  });
});
