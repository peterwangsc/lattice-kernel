import type {
  ScopeRef,
  ExecutionPreference,
  BackendAdapter,
  TrustLevel,
  InferResponse,
  EmbedResponse,
  PolicyDecision,
  Plan,
  PlanStep,
  Action,
  InferStreamChunk,
  Message,
  ToolDefinition,
  RequestContext,
} from "@lattice-kernel/schemas";
import type { PolicyEngine } from "@lattice-kernel/policy-engine";
import type { AuditSink } from "@lattice-kernel/audit";

export interface ToolAdapter {
  readonly toolId: string;
  execute(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface RuntimeConfig {
  adapters: BackendAdapter[];
  policyEngine: PolicyEngine;
  auditSink: AuditSink;
  tools?: ToolAdapter[];
}

export interface InferOptions {
  input: string;
  messages?: Message[];
  systemPrompt?: string;
  tools?: ToolDefinition[];
  model?: string;
  executionPreference?: ExecutionPreference;
  memoryScope?: ScopeRef;
  trustLevel: TrustLevel;
  maxTokens?: number;
  temperature?: number;
  maxLatencyMs?: number;
  maxCost?: number;
  context?: RequestContext;
}

export interface InferResult {
  requestId: string;
  traceId?: string;
  spanId?: string;
  output: string;
  model: string;
  route: string;
  durationMs: number;
  policyDecision: PolicyDecision;
  adapterResponse: InferResponse;
}

export interface EmbedOptions {
  content: string;
  model?: string;
  trustLevel: TrustLevel;
}

export interface EmbedResult {
  requestId: string;
  embedding: number[];
  model: string;
  dimensions: number;
  durationMs: number;
  adapterResponse: EmbedResponse;
}

export interface PlanOptions {
  goal: string;
  scope?: ScopeRef;
  trustLevel: TrustLevel;
  availableTools?: string[];
  steps?: PlanStep[];
}

export interface ActOptions {
  tool: string;
  input: Record<string, unknown>;
  scope?: ScopeRef;
  trustLevel: TrustLevel;
  planRef?: string;
}

export interface ActResult {
  action: Action;
  policyDecision: PolicyDecision;
}

export interface InferStreamResult {
  requestId: string;
  stream: AsyncIterable<InferStreamChunk>;
  route: string;
  policyDecision: PolicyDecision;
}

export interface Runtime {
  infer(options: InferOptions): Promise<InferResult>;
  inferStream(options: InferOptions): Promise<InferStreamResult>;
  embed(options: EmbedOptions): Promise<EmbedResult>;
  plan(options: PlanOptions): Promise<Plan>;
  act(options: ActOptions): Promise<ActResult>;
  listAvailableModels(): Promise<string[]>;
  healthCheck(): Promise<Record<string, boolean>>;
}
