import type { MemoryItem, ScopeRef, Checkpoint } from "@lattice-kernel/schemas";
import type { MemoryStore, MemoryWriteInput, RetrieveOptions, VerifyResult, MemoryStats } from "./types.js";
import { cosineSimilarity } from "./vector-scorer.js";

/**
 * A function that generates embeddings from text content.
 * Implement this using an adapter's embed method or a local model.
 */
export type EmbedFunction = (content: string) => Promise<number[]>;

/**
 * Wraps a MemoryStore to generate embeddings at write time and
 * use cosine similarity for retrieval ranking.
 *
 * Stores embeddings in an in-memory index keyed by item ID.
 * The underlying store still handles persistence, scope filtering,
 * etc. — this wrapper only adds embedding-based ranking.
 */
export function createEmbeddingMemoryStore(
  inner: MemoryStore,
  embed: EmbedFunction,
): MemoryStore {
  const embeddings = new Map<string, number[]>();

  return {
    async write(input: MemoryWriteInput): Promise<MemoryItem> {
      const item = await inner.write(input);

      // Generate and store embedding
      try {
        const embedding = await embed(input.content);
        embeddings.set(item.id, embedding);
      } catch {
        // Embedding failure is non-fatal — item is still stored
      }

      return item;
    },

    async retrieve(
      query: string,
      scope: ScopeRef,
      options?: RetrieveOptions,
    ): Promise<MemoryItem[]> {
      // Get candidates from inner store (handles scope/type/trust/expiry filtering)
      const candidates = await inner.retrieve(query, scope, {
        ...options,
        topK: undefined, // Get all candidates, we'll re-rank
      });

      // If we have embeddings, re-rank by cosine similarity
      if (embeddings.size > 0) {
        let queryEmbedding: number[] | null = null;
        try {
          queryEmbedding = await embed(query);
        } catch {
          // Fall back to inner store's text-based ranking
          return candidates.slice(0, options?.topK ?? 10);
        }

        if (queryEmbedding) {
          const scored = candidates.map((item) => {
            const itemEmbedding = embeddings.get(item.id);
            const score = itemEmbedding
              ? cosineSimilarity(queryEmbedding, itemEmbedding)
              : 0;
            return { item, score };
          });

          scored.sort((a, b) => b.score - a.score);
          return scored
            .slice(0, options?.topK ?? 10)
            .map((s) => s.item);
        }
      }

      return candidates.slice(0, options?.topK ?? 10);
    },

    async get(id: string): Promise<MemoryItem | undefined> {
      return inner.get(id);
    },

    async delete(id: string): Promise<void> {
      embeddings.delete(id);
      return inner.delete(id);
    },

    async expireStale(): Promise<number> {
      return inner.expireStale();
    },

    count(): number {
      return inner.count();
    },

    async checkpoint(description?: string): Promise<Checkpoint> {
      return inner.checkpoint(description);
    },

    async rollback(checkpointId: string): Promise<void> {
      return inner.rollback(checkpointId);
    },

    listCheckpoints(): Checkpoint[] {
      return inner.listCheckpoints();
    },

    stats(): MemoryStats {
      return inner.stats();
    },

    async verify(itemId: string): Promise<VerifyResult> {
      return inner.verify(itemId);
    },

    async verifyCheckpoint(checkpointId: string): Promise<VerifyResult> {
      return inner.verifyCheckpoint(checkpointId);
    },
  };
}
