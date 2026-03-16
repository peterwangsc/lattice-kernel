import type { ScopeRef, ExecutionPreference } from "@lattice-kernel/schemas";

export interface RuntimeConfig {
  adapters: Map<string, unknown>;
  policyEngine: unknown;
  memoryStore: unknown;
  auditSink: unknown;
}

export interface InferOptions {
  input: string;
  model?: string;
  executionPreference?: ExecutionPreference;
  memoryScope?: ScopeRef;
  trustLevel?: string;
}

export interface InferResult {
  requestId: string;
  output: string;
  model: string;
  route: string;
  durationMs: number;
}

export interface Runtime {
  infer(options: InferOptions): Promise<InferResult>;
}
