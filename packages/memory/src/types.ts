import type { MemoryItem, MemoryType, ScopeRef, TrustLevel, Checkpoint } from "@lattice-kernel/schemas";
import type { PolicyEngine } from "@lattice-kernel/policy-engine";
import type { AuditSink } from "@lattice-kernel/audit";
import type { CryptoProvider } from "@lattice-kernel/crypto";

export interface MemoryStore {
  write(input: MemoryWriteInput): Promise<MemoryItem>;
  retrieve(query: string, scope: ScopeRef, options?: RetrieveOptions): Promise<MemoryItem[]>;
  get(id: string): Promise<MemoryItem | undefined>;
  delete(id: string): Promise<void>;
  expireStale(): Promise<number>;
  count(): number;
  checkpoint(description?: string): Promise<Checkpoint>;
  rollback(checkpointId: string): Promise<void>;
  listCheckpoints(): Checkpoint[];
  verify(itemId: string): Promise<VerifyResult>;
  verifyCheckpoint(checkpointId: string): Promise<VerifyResult>;
}

export interface VerifyResult {
  valid: boolean;
  target: string;
  expectedHash: string;
  actualHash: string;
  error?: string;
}

export interface MemoryWriteInput {
  scope: ScopeRef;
  type: MemoryType;
  content: string;
  source: string;
  provenance: Record<string, unknown>;
  classification: string;
  trustLevel: TrustLevel;
  expiresAt?: string;
  retentionPolicy?: string;
  subjectRefs?: string[];
  tags?: string[];
}

export interface RetrieveOptions {
  topK?: number;
  types?: MemoryType[];
  minTrustLevel?: TrustLevel;
}

export interface MemoryStoreConfig {
  policyEngine: PolicyEngine;
  auditSink: AuditSink;
  crypto?: CryptoProvider;
  maxItems?: number;
}
