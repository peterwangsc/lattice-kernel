import type { BackendAdapter, ModelDescriptor } from "@lattice-kernel/schemas";

export interface ModelRegistryEntry {
  model: ModelDescriptor;
  adapter: BackendAdapter;
}

export interface ModelRegistry {
  refresh(): Promise<void>;
  getModel(modelId: string): ModelRegistryEntry | undefined;
  listModels(): ModelRegistryEntry[];
  findByCapability(capability: keyof ModelDescriptor["capabilities"]): ModelRegistryEntry[];
  findByTag(tag: string): ModelRegistryEntry[];
  getAdapterForModel(modelId: string): BackendAdapter | undefined;
}

export function createModelRegistry(
  adapters: BackendAdapter[],
): ModelRegistry {
  const entries = new Map<string, ModelRegistryEntry>();

  async function refresh(): Promise<void> {
    entries.clear();
    for (const adapter of adapters) {
      const models = await adapter.listModels();
      for (const model of models) {
        // First adapter to register a model ID wins
        if (!entries.has(model.id)) {
          entries.set(model.id, { model, adapter });
        }
      }
    }
  }

  return {
    refresh,

    getModel(modelId: string): ModelRegistryEntry | undefined {
      return entries.get(modelId);
    },

    listModels(): ModelRegistryEntry[] {
      return [...entries.values()];
    },

    findByCapability(
      capability: keyof ModelDescriptor["capabilities"],
    ): ModelRegistryEntry[] {
      return [...entries.values()].filter(
        (e) => e.model.capabilities[capability],
      );
    },

    findByTag(tag: string): ModelRegistryEntry[] {
      return [...entries.values()].filter((e) =>
        e.model.policyTags.includes(tag),
      );
    },

    getAdapterForModel(modelId: string): BackendAdapter | undefined {
      return entries.get(modelId)?.adapter;
    },
  };
}
