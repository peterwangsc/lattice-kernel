import { describe, it, expect } from "vitest";
import { createCompositeAdapter } from "../composite-adapter.js";
import type { BackendAdapter } from "@lattice-kernel/schemas";

function createMockAdapter(
  overrides: Partial<BackendAdapter> & { providerId: string },
): BackendAdapter {
  return {
    async getCapabilities() {
      return {
        supportsLocalExecution: false,
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
        output: `${overrides.providerId}: ${request.input}`,
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

describe("CompositeAdapter", () => {
  it("throws if no adapters provided", () => {
    expect(() => createCompositeAdapter({ adapters: [] })).toThrow(
      "at least one",
    );
  });

  describe("infer", () => {
    it("uses first adapter when healthy", async () => {
      const primary = createMockAdapter({ providerId: "local" });
      const fallback = createMockAdapter({ providerId: "cloud" });
      const composite = createCompositeAdapter({
        adapters: [primary, fallback],
      });

      const result = await composite.infer({ modelId: "m", input: "test" });
      expect(result.output).toContain("local");
    });

    it("falls back to second when first throws", async () => {
      const broken = createMockAdapter({
        providerId: "broken",
        async infer() {
          throw new Error("local model crashed");
        },
      });
      const fallback = createMockAdapter({ providerId: "cloud" });
      const composite = createCompositeAdapter({
        adapters: [broken, fallback],
      });

      const result = await composite.infer({ modelId: "m", input: "test" });
      expect(result.output).toContain("cloud");
    });

    it("throws last error when all adapters fail", async () => {
      const broken1 = createMockAdapter({
        providerId: "a",
        async infer() {
          throw new Error("a failed");
        },
      });
      const broken2 = createMockAdapter({
        providerId: "b",
        async infer() {
          throw new Error("b failed");
        },
      });
      const composite = createCompositeAdapter({
        adapters: [broken1, broken2],
      });

      await expect(
        composite.infer({ modelId: "m", input: "test" }),
      ).rejects.toThrow("b failed");
    });
  });

  describe("embed", () => {
    it("falls back on embed failure", async () => {
      const noEmbed = createMockAdapter({
        providerId: "local",
        async embed() {
          throw new Error("no embedding support");
        },
      });
      const withEmbed = createMockAdapter({
        providerId: "cloud",
        async embed() {
          return { embedding: [0.5, 0.6], modelId: "emb", dimensions: 2 };
        },
      });
      const composite = createCompositeAdapter({
        adapters: [noEmbed, withEmbed],
      });

      const result = await composite.embed({ modelId: "emb", content: "test" });
      expect(result.dimensions).toBe(2);
    });
  });

  describe("healthCheck", () => {
    it("returns true if any adapter is healthy", async () => {
      const unhealthy = createMockAdapter({
        providerId: "down",
        async healthCheck() {
          return false;
        },
      });
      const healthy = createMockAdapter({ providerId: "up" });
      const composite = createCompositeAdapter({
        adapters: [unhealthy, healthy],
      });

      expect(await composite.healthCheck()).toBe(true);
    });

    it("returns false when all adapters are unhealthy", async () => {
      const down1 = createMockAdapter({
        providerId: "a",
        async healthCheck() {
          return false;
        },
      });
      const down2 = createMockAdapter({
        providerId: "b",
        async healthCheck() {
          return false;
        },
      });
      const composite = createCompositeAdapter({
        adapters: [down1, down2],
      });

      expect(await composite.healthCheck()).toBe(false);
    });
  });

  describe("getCapabilities", () => {
    it("merges capabilities from all adapters", async () => {
      const local = createMockAdapter({
        providerId: "local",
        async getCapabilities() {
          return {
            supportsLocalExecution: true,
            supportsCloudExecution: false,
            supportsAdaptation: false,
            supportedFormats: ["gguf"],
          };
        },
      });
      const cloud = createMockAdapter({
        providerId: "cloud",
        async getCapabilities() {
          return {
            supportsLocalExecution: false,
            supportsCloudExecution: true,
            supportsAdaptation: false,
            supportedFormats: ["api"],
          };
        },
      });
      const composite = createCompositeAdapter({
        adapters: [local, cloud],
      });

      const caps = await composite.getCapabilities();
      expect(caps.supportsLocalExecution).toBe(true);
      expect(caps.supportsCloudExecution).toBe(true);
      expect(caps.supportedFormats).toEqual(
        expect.arrayContaining(["gguf", "api"]),
      );
    });
  });

  describe("listModels", () => {
    it("deduplicates models by ID (first adapter wins)", async () => {
      const a1 = createMockAdapter({
        providerId: "local",
        async listModels() {
          return [
            {
              id: "shared",
              version: "1.0",
              provider: "local",
              format: "gguf",
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
      const a2 = createMockAdapter({
        providerId: "cloud",
        async listModels() {
          return [
            {
              id: "shared",
              version: "2.0",
              provider: "cloud",
              format: "api",
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
      const composite = createCompositeAdapter({ adapters: [a1, a2] });

      const models = await composite.listModels();
      expect(models).toHaveLength(1);
      expect(models[0]!.provider).toBe("local");
    });
  });

  describe("providerId", () => {
    it("defaults to 'composite'", () => {
      const composite = createCompositeAdapter({
        adapters: [createMockAdapter({ providerId: "a" })],
      });
      expect(composite.providerId).toBe("composite");
    });

    it("uses custom providerId", () => {
      const composite = createCompositeAdapter({
        adapters: [createMockAdapter({ providerId: "a" })],
        providerId: "local-first",
      });
      expect(composite.providerId).toBe("local-first");
    });
  });
});
