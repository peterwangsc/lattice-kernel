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
  InferStreamChunk,
  Message,
  ToolDefinition,
  ToolUseRequest,
} from "@lattice-kernel/schemas";

// Re-export structured errors
export {
  LatticeError,
  PolicyDeniedError,
  ApprovalRequiredError,
  AdapterError,
  ToolNotFoundError,
  CheckpointNotFoundError,
  NoAdaptersError,
} from "@lattice-kernel/schemas";

// Re-export from runtime
export type { ToolAdapter, ActResult, InferStreamResult } from "@lattice-kernel/runtime";
export type {
  Conversation,
  ConversationManager,
  ConversationManagerConfig,
  ToolLoopConfig,
  ToolLoopResult,
  ToolExecution,
  RetryConfig,
  RateLimiterConfig,
  CompositeAdapterConfig,
  ModelRegistry,
  ModelRegistryEntry,
  PromptTemplate,
  PromptTemplateConfig,
  PromptLibrary,
} from "@lattice-kernel/runtime";
export {
  createConversationManager,
  createCompositeAdapter,
  createRetryAdapter,
  createRateLimitedAdapter,
  createModelRegistry,
  createPromptTemplate,
  createPromptLibrary,
  createRequestContext,
  createChildContext,
  runToolLoop,
  explainPolicyDecision,
} from "@lattice-kernel/runtime";
export type { DecisionExplanation } from "@lattice-kernel/runtime";
