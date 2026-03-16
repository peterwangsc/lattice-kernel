import type {
  BackendAdapter,
  BackendCapabilities,
  InferRequest,
  InferResponse,
  InferStreamChunk,
  EmbedRequest,
  EmbedResponse,
  CostEstimate,
  ModelDescriptor,
} from "@lattice-kernel/schemas";

export interface RateLimiterConfig {
  /** Maximum requests per window. */
  maxRequests: number;
  /** Window duration in milliseconds. */
  windowMs: number;
}

/**
 * Token bucket rate limiter wrapping a BackendAdapter.
 * Queues requests when the rate limit is reached and
 * processes them as capacity becomes available.
 */
export function createRateLimitedAdapter(
  inner: BackendAdapter,
  config: RateLimiterConfig,
): BackendAdapter {
  const { maxRequests, windowMs } = config;
  const timestamps: number[] = [];

  function pruneOld(): void {
    const cutoff = Date.now() - windowMs;
    while (timestamps.length > 0 && timestamps[0]! < cutoff) {
      timestamps.shift();
    }
  }

  async function waitForCapacity(): Promise<void> {
    pruneOld();
    if (timestamps.length < maxRequests) {
      timestamps.push(Date.now());
      return;
    }

    // Calculate wait time until oldest request expires
    const oldestTs = timestamps[0]!;
    const waitMs = oldestTs + windowMs - Date.now() + 1;
    if (waitMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    }
    pruneOld();
    timestamps.push(Date.now());
  }

  return {
    providerId: inner.providerId,

    getCapabilities(): Promise<BackendCapabilities> {
      return inner.getCapabilities();
    },

    listModels(): Promise<ModelDescriptor[]> {
      return inner.listModels();
    },

    async infer(request: InferRequest): Promise<InferResponse> {
      await waitForCapacity();
      return inner.infer(request);
    },

    inferStream: inner.inferStream
      ? async function* (
          request: InferRequest,
        ): AsyncIterable<InferStreamChunk> {
          await waitForCapacity();
          yield* inner.inferStream!(request);
        }
      : undefined,

    async embed(request: EmbedRequest): Promise<EmbedResponse> {
      await waitForCapacity();
      return inner.embed(request);
    },

    async estimate(request: InferRequest): Promise<CostEstimate> {
      return inner.estimate(request);
    },

    async healthCheck(): Promise<boolean> {
      return inner.healthCheck();
    },
  };
}
