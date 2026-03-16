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

export interface RetryConfig {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryableErrors?: (error: Error) => boolean;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 10_000;

function defaultRetryable(error: Error): boolean {
  const msg = error.message.toLowerCase();
  // Retry on rate limits, server errors, network errors
  return (
    msg.includes("429") ||
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("network")
  );
}

function computeDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  // Exponential backoff with jitter
  const exponential = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * baseDelayMs;
  return Math.min(exponential + jitter, maxDelayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps a BackendAdapter with retry logic for transient failures.
 * Uses exponential backoff with jitter. Only retries operations
 * that are safe to retry (infer, embed, estimate, healthCheck).
 */
export function createRetryAdapter(
  inner: BackendAdapter,
  config: RetryConfig = {},
): BackendAdapter {
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = config.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = config.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const isRetryable = config.retryableErrors ?? defaultRetryable;

  async function withRetry<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < maxRetries && isRetryable(lastError)) {
          const delay = computeDelay(attempt, baseDelayMs, maxDelayMs);
          await sleep(delay);
          continue;
        }

        throw lastError;
      }
    }

    throw lastError;
  }

  return {
    providerId: inner.providerId,

    getCapabilities(): Promise<BackendCapabilities> {
      return inner.getCapabilities();
    },

    listModels(): Promise<ModelDescriptor[]> {
      return inner.listModels();
    },

    infer(request: InferRequest): Promise<InferResponse> {
      return withRetry(() => inner.infer(request));
    },

    // Streaming is not retried — once the stream starts, retry would
    // require buffering and re-emitting, which breaks the streaming contract.
    // The caller should handle stream errors at a higher level.
    inferStream: inner.inferStream
      ? (request: InferRequest): AsyncIterable<InferStreamChunk> => {
          return inner.inferStream!(request);
        }
      : undefined,

    embed(request: EmbedRequest): Promise<EmbedResponse> {
      return withRetry(() => inner.embed(request));
    },

    estimate(request: InferRequest): Promise<CostEstimate> {
      return withRetry(() => inner.estimate(request));
    },

    healthCheck(): Promise<boolean> {
      return withRetry(() => inner.healthCheck());
    },
  };
}
