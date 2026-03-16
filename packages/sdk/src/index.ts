export { Lattice, createLattice } from "./client.js";
export type {
  LatticeConfig,
  InferOptions,
  RememberOptions,
  RetrieveOptions,
} from "./client.js";

// Re-export commonly needed types from schemas
export type {
  BackendAdapter,
  ScopeRef,
  TrustLevel,
  ExecutionPreference,
  PolicyRule,
  MemoryItem,
  MemoryType,
} from "@lattice-kernel/schemas";
