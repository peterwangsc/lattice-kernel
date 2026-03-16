import type {
  ScopeRef,
  ExecutionPreference,
  BackendAdapter,
  TrustLevel,
  InferResponse,
  EmbedResponse,
  PolicyDecision,
} from "@lattice-kernel/schemas";
import type { PolicyEngine } from "@lattice-kernel/policy-engine";
import type { AuditSink } from "@lattice-kernel/audit";

export interface RuntimeConfig {
  adapters: BackendAdapter[];
  policyEngine: PolicyEngine;
  auditSink: AuditSink;
}

export interface InferOptions {
  input: string;
  model?: string;
  executionPreference?: ExecutionPreference;
  memoryScope?: ScopeRef;
  trustLevel: TrustLevel;
  maxTokens?: number;
  temperature?: number;
}

export interface InferResult {
  requestId: string;
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

export interface Runtime {
  infer(options: InferOptions): Promise<InferResult>;
  embed(options: EmbedOptions): Promise<EmbedResult>;
  listAvailableModels(): Promise<string[]>;
  healthCheck(): Promise<Record<string, boolean>>;
}
