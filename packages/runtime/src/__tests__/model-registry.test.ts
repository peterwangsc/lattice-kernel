import { describe, it, expect, beforeEach } from "vitest";
import { createModelRegistry } from "../model-registry.js";
import type { BackendAdapter, ModelDescriptor } from "@lattice-kernel/schemas";
import type { ModelRegistry } from "../model-registry.js";

function createMockAdapterWithModels(
  providerId: string,
  models: ModelDescriptor[],
): BackendAdapter {
  return {
    providerId,
    async getCapabilities() {
      return {
        supportsLocalExecution: providerId.includes("local"),
        supportsCloudExecution: providerId.includes("cloud"),
        supportsAdaptation: false,
        supportedFormats: ["mock"],
      };
    },
    async listModels() {
      return models;
    },
    async infer() {
      return { output: "mock", modelId: "mock", durationMs: 0 };
    },
    async embed() {
      return { embedding: [0], modelId: "mock", dimensions: 1 };
    },
    async estimate() {
      return {};
    },
    async healthCheck() {
      return true;
    },
  };
}

function makeModel(overrides: Partial<ModelDescriptor> & { id: string }): ModelDescriptor {
  return {
    version: "1.0",
    provider: "test",
    format: "mock",
    capabilities: {
      supportsEmbedding: false,
      supportsToolCalling: false,
      supportsAdaptation: false,
      supportsMultimodal: false,
    },
    executionTargets: ["cpu"],
    policyTags: [],
    ...overrides,
  };
}

describe("ModelRegistry", () => {
  let registry: ModelRegistry;
  let localAdapter: BackendAdapter;
  let cloudAdapter: BackendAdapter;

  beforeEach(async () => {
    localAdapter = createMockAdapterWithModels("local", [
      makeModel({
        id: "local-small",
        policyTags: ["fast", "local"],
        capabilities: {
          supportsEmbedding: true,
          supportsToolCalling: false,
          supportsAdaptation: false,
          supportsMultimodal: false,
        },
      }),
      makeModel({
        id: "local-large",
        policyTags: ["local"],
        capabilities: {
          supportsEmbedding: true,
          supportsToolCalling: true,
          supportsAdaptation: false,
          supportsMultimodal: false,
        },
      }),
    ]);

    cloudAdapter = createMockAdapterWithModels("cloud", [
      makeModel({
        id: "cloud-gpt",
        provider: "openai",
        policyTags: ["cloud", "general"],
        capabilities: {
          supportsEmbedding: true,
          supportsToolCalling: true,
          supportsAdaptation: false,
          supportsMultimodal: true,
        },
      }),
    ]);

    registry = createModelRegistry([localAdapter, cloudAdapter]);
    await registry.refresh();
  });

  describe("listModels", () => {
    it("aggregates models from all adapters", () => {
      const models = registry.listModels();
      expect(models).toHaveLength(3);
    });

    it("associates models with their adapter", () => {
      const entry = registry.getModel("cloud-gpt");
      expect(entry).toBeDefined();
      expect(entry!.adapter.providerId).toBe("cloud");
    });
  });

  describe("getModel", () => {
    it("returns entry for existing model", () => {
      const entry = registry.getModel("local-small");
      expect(entry).toBeDefined();
      expect(entry!.model.id).toBe("local-small");
    });

    it("returns undefined for unknown model", () => {
      expect(registry.getModel("nonexistent")).toBeUndefined();
    });
  });

  describe("findByCapability", () => {
    it("finds models supporting embedding", () => {
      const models = registry.findByCapability("supportsEmbedding");
      expect(models).toHaveLength(3);
    });

    it("finds models supporting tool calling", () => {
      const models = registry.findByCapability("supportsToolCalling");
      expect(models).toHaveLength(2);
      expect(models.map((e) => e.model.id).sort()).toEqual([
        "cloud-gpt",
        "local-large",
      ]);
    });

    it("finds models supporting multimodal", () => {
      const models = registry.findByCapability("supportsMultimodal");
      expect(models).toHaveLength(1);
      expect(models[0]!.model.id).toBe("cloud-gpt");
    });
  });

  describe("findByTag", () => {
    it("finds models by policy tag", () => {
      const fast = registry.findByTag("fast");
      expect(fast).toHaveLength(1);
      expect(fast[0]!.model.id).toBe("local-small");
    });

    it("finds local models", () => {
      const local = registry.findByTag("local");
      expect(local).toHaveLength(2);
    });

    it("returns empty for unknown tag", () => {
      expect(registry.findByTag("nonexistent")).toHaveLength(0);
    });
  });

  describe("getAdapterForModel", () => {
    it("returns the adapter backing a model", () => {
      const adapter = registry.getAdapterForModel("local-small");
      expect(adapter).toBeDefined();
      expect(adapter!.providerId).toBe("local");
    });

    it("returns undefined for unknown model", () => {
      expect(registry.getAdapterForModel("unknown")).toBeUndefined();
    });
  });

  describe("refresh", () => {
    it("re-scans adapters for models", async () => {
      expect(registry.listModels()).toHaveLength(3);

      // Simulate adapter losing a model
      const emptyAdapter = createMockAdapterWithModels("local", []);
      const newRegistry = createModelRegistry([emptyAdapter, cloudAdapter]);
      await newRegistry.refresh();

      expect(newRegistry.listModels()).toHaveLength(1);
    });
  });

  describe("first-adapter-wins", () => {
    it("uses the first adapter when model IDs conflict", async () => {
      const adapter1 = createMockAdapterWithModels("adapter-1", [
        makeModel({ id: "shared-model", provider: "first" }),
      ]);
      const adapter2 = createMockAdapterWithModels("adapter-2", [
        makeModel({ id: "shared-model", provider: "second" }),
      ]);

      const r = createModelRegistry([adapter1, adapter2]);
      await r.refresh();

      const entry = r.getModel("shared-model");
      expect(entry!.model.provider).toBe("first");
      expect(entry!.adapter.providerId).toBe("adapter-1");
    });
  });
});
