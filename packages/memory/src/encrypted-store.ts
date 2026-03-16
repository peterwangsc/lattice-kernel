import type { MemoryItem, ScopeRef, Checkpoint } from "@lattice-kernel/schemas";
import type { CryptoProvider } from "@lattice-kernel/crypto";
import type { MemoryStore, MemoryWriteInput, RetrieveOptions, VerifyResult, MemoryStats } from "./types.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Wraps a MemoryStore to encrypt content at rest and decrypt on read.
 * Uses the CryptoProvider for AES-256-GCM encryption.
 *
 * The content field is encrypted before storage and decrypted on retrieval.
 * Other fields (scope, type, tags, etc.) remain in plaintext for querying.
 * The hash is computed on the plaintext content before encryption.
 */
export function createEncryptedMemoryStore(
  inner: MemoryStore,
  crypto: CryptoProvider,
): MemoryStore {
  async function encryptContent(content: string): Promise<string> {
    const plaintext = encoder.encode(content);
    const ciphertext = await crypto.encrypt(plaintext);
    return Buffer.from(ciphertext).toString("base64");
  }

  async function decryptContent(encoded: string): Promise<string> {
    const ciphertext = new Uint8Array(Buffer.from(encoded, "base64"));
    const plaintext = await crypto.decrypt(ciphertext);
    return decoder.decode(plaintext);
  }

  async function decryptItem(item: MemoryItem): Promise<MemoryItem> {
    return {
      ...item,
      content: await decryptContent(item.content),
    };
  }

  return {
    async write(input: MemoryWriteInput): Promise<MemoryItem> {
      const encryptedContent = await encryptContent(input.content);
      const item = await inner.write({
        ...input,
        content: encryptedContent,
      });

      // Return decrypted view to caller
      return { ...item, content: input.content };
    },

    async retrieve(
      query: string,
      scope: ScopeRef,
      options?: RetrieveOptions,
    ): Promise<MemoryItem[]> {
      // Note: text-based search operates on encrypted content, which won't match.
      // For encrypted stores, use scope/type/trust filters, not text queries.
      const results = await inner.retrieve(query, scope, options);
      return Promise.all(results.map(decryptItem));
    },

    async get(id: string): Promise<MemoryItem | undefined> {
      const item = await inner.get(id);
      if (!item) return undefined;
      return decryptItem(item);
    },

    async delete(id: string): Promise<void> {
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
