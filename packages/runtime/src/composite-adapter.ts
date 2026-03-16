import { NoAdaptersError } from "@lattice-kernel/schemas";
import type {
  BackendAdapter,
  BackendCapabilities,
  InferRequest,
  InferResponse,
  EmbedRequest,
  EmbedResponse,
  CostEstimate,
  ModelDescriptor,
} from "@lattice-kernel/schemas";

export interface CompositeAdapterConfig {
  /** Adapters in priority order — first healthy adapter wins. */
  adapters: BackendAdapter[];
  /** Custom provider ID for the composite. */
  providerId?: string;
}

/**
 * A composite adapter that implements the local-first principle:
 * tries adapters in priority order, falling back to the next when
 * one is unhealthy or throws an error.
 *
 * Typical usage: [localAdapter, cloudAdapter] — tries local first,
 * falls back to cloud when local is unavailable.
 */
export function createCompositeAdapter(
  config: CompositeAdapterConfig,
): BackendAdapter {
  const { adapters } = config;
  const providerId = config.providerId ?? "composite";

  if (adapters.length === 0) {
    throw new NoAdaptersError();
  }

  async function selectHealthy(): Promise<BackendAdapter> {
    for (const adapter of adapters) {
      if (await adapter.healthCheck()) {
        return adapter;
      }
    }
    // All unhealthy — return primary anyway (it will throw a more useful error)
    return adapters[0]!;
  }

  async function tryInOrder<T>(
    fn: (adapter: BackendAdapter) => Promise<T>,
  ): Promise<{ result: T; adapter: BackendAdapter }> {
    let lastError: Error | undefined;

    for (const adapter of adapters) {
      try {
        const result = await fn(adapter);
        return { result, adapter };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw lastError ?? new Error("All adapters failed");
  }

  return {
    providerId,

    async getCapabilities(): Promise<BackendCapabilities> {
      // Merge capabilities from all adapters
      const allCaps = await Promise.all(
        adapters.map((a) => a.getCapabilities()),
      );
      return {
        supportsLocalExecution: allCaps.some((c) => c.supportsLocalExecution),
        supportsCloudExecution: allCaps.some((c) => c.supportsCloudExecution),
        supportsAdaptation: allCaps.some((c) => c.supportsAdaptation),
        supportedFormats: [
          ...new Set(allCaps.flatMap((c) => c.supportedFormats)),
        ],
      };
    },

    async listModels(): Promise<ModelDescriptor[]> {
      const seen = new Set<string>();
      const models: ModelDescriptor[] = [];
      for (const adapter of adapters) {
        for (const model of await adapter.listModels()) {
          if (!seen.has(model.id)) {
            seen.add(model.id);
            models.push(model);
          }
        }
      }
      return models;
    },

    async infer(request: InferRequest): Promise<InferResponse> {
      const { result } = await tryInOrder((a) => a.infer(request));
      return result;
    },

    async embed(request: EmbedRequest): Promise<EmbedResponse> {
      const { result } = await tryInOrder((a) => a.embed(request));
      return result;
    },

    async estimate(request: InferRequest): Promise<CostEstimate> {
      const adapter = await selectHealthy();
      return adapter.estimate(request);
    },

    async healthCheck(): Promise<boolean> {
      for (const adapter of adapters) {
        if (await adapter.healthCheck()) {
          return true;
        }
      }
      return false;
    },
  };
}
