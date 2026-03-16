import type { MemoryItem, MemoryType, ScopeRef } from "@lattice-kernel/schemas";

export interface MemoryStore {
  write(item: Omit<MemoryItem, "id" | "createdAt" | "hash">): Promise<MemoryItem>;
  retrieve(query: string, scope: ScopeRef, options?: RetrieveOptions): Promise<MemoryItem[]>;
  delete(id: string): Promise<void>;
}

export interface RetrieveOptions {
  topK?: number;
  types?: MemoryType[];
  minTrustLevel?: string;
}
