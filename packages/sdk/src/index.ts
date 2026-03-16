export { Lattice, createLattice } from "./client.js";
export type {
  LatticeConfig,
  InferOptions,
  RememberOptions,
  RetrieveOptions,
  PlanOptions,
  ActOptions,
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
  Checkpoint,
  Plan,
  PlanStep,
  Action,
} from "@lattice-kernel/schemas";

// Re-export ToolAdapter from runtime
export type { ToolAdapter, ActResult } from "@lattice-kernel/runtime";
