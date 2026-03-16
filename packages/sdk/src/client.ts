import type {
  BackendAdapter,
  ScopeRef,
  TrustLevel,
  ExecutionPreference,
  PolicyRule,
  MemoryType,
  Plan,
  PlanStep,
} from "@lattice-kernel/schemas";
import { createRuntime } from "@lattice-kernel/runtime";
import type {
  Runtime,
  InferResult,
  EmbedResult,
  ToolAdapter,
  ActResult,
} from "@lattice-kernel/runtime";
import { createPolicyEngine } from "@lattice-kernel/policy-engine";
import type { PolicyEngine } from "@lattice-kernel/policy-engine";
import { createMemoryAuditSink } from "@lattice-kernel/audit";
import type { AuditSink } from "@lattice-kernel/audit";
import { createMemoryStore } from "@lattice-kernel/memory";
import type { MemoryStore, MemoryWriteInput } from "@lattice-kernel/memory";
import type { MemoryItem, Checkpoint } from "@lattice-kernel/schemas";

export interface LatticeConfig {
  adapters: BackendAdapter[];
  tools?: ToolAdapter[];
  defaultTrustLevel?: TrustLevel;
  defaultScope?: ScopeRef;
  policyRules?: PolicyRule[];
  defaultDeny?: boolean;
}

export interface InferOptions {
  model?: string;
  executionPreference?: ExecutionPreference;
  scope?: ScopeRef;
  trustLevel?: TrustLevel;
  maxTokens?: number;
  temperature?: number;
}

export interface RememberOptions {
  scope?: ScopeRef;
  type?: MemoryType;
  classification?: string;
  trustLevel?: TrustLevel;
  retention?: string;
  provenance?: Record<string, unknown>;
}

export interface RetrieveOptions {
  scope?: ScopeRef;
  topK?: number;
  types?: MemoryType[];
  minTrustLevel?: TrustLevel;
}

export interface PlanOptions {
  scope?: ScopeRef;
  trustLevel?: TrustLevel;
  availableTools?: string[];
  steps?: PlanStep[];
}

export interface ActOptions {
  input?: Record<string, unknown>;
  scope?: ScopeRef;
  trustLevel?: TrustLevel;
  planRef?: string;
}

export class Lattice {
  private readonly runtime: Runtime;
  private readonly policyEngine: PolicyEngine;
  private readonly auditSink: AuditSink;
  private readonly memoryStore: MemoryStore;
  private readonly defaultTrustLevel: TrustLevel;
  private readonly defaultScope: ScopeRef;

  constructor(config: LatticeConfig) {
    this.defaultTrustLevel = config.defaultTrustLevel ?? "trusted_user_explicit";
    this.defaultScope = config.defaultScope ?? {};

    this.policyEngine = createPolicyEngine({
      defaultDeny: config.defaultDeny ?? true,
    });

    for (const rule of config.policyRules ?? []) {
      this.policyEngine.addRule(rule);
    }

    this.auditSink = createMemoryAuditSink();

    this.memoryStore = createMemoryStore({
      policyEngine: this.policyEngine,
      auditSink: this.auditSink,
    });

    this.runtime = createRuntime({
      adapters: config.adapters,
      policyEngine: this.policyEngine,
      auditSink: this.auditSink,
      tools: config.tools,
    });
  }

  async infer(input: string, options: InferOptions = {}): Promise<InferResult> {
    return this.runtime.infer({
      input,
      model: options.model,
      executionPreference: options.executionPreference,
      memoryScope: options.scope ?? this.defaultScope,
      trustLevel: options.trustLevel ?? this.defaultTrustLevel,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
    });
  }

  async embed(content: string, options: { model?: string; trustLevel?: TrustLevel } = {}): Promise<EmbedResult> {
    return this.runtime.embed({
      content,
      model: options.model,
      trustLevel: options.trustLevel ?? this.defaultTrustLevel,
    });
  }

  async remember(content: string, options: RememberOptions = {}): Promise<MemoryItem> {
    const input: MemoryWriteInput = {
      scope: options.scope ?? this.defaultScope,
      type: options.type ?? "semantic",
      content,
      source: "sdk",
      provenance: options.provenance ?? {},
      classification: options.classification ?? "internal",
      trustLevel: options.trustLevel ?? this.defaultTrustLevel,
      retentionPolicy: options.retention,
    };
    return this.memoryStore.write(input);
  }

  async retrieve(query: string, options: RetrieveOptions = {}): Promise<MemoryItem[]> {
    return this.memoryStore.retrieve(
      query,
      options.scope ?? this.defaultScope,
      {
        topK: options.topK,
        types: options.types,
        minTrustLevel: options.minTrustLevel,
      },
    );
  }

  async plan(goal: string, options: PlanOptions = {}): Promise<Plan> {
    return this.runtime.plan({
      goal,
      scope: options.scope ?? this.defaultScope,
      trustLevel: options.trustLevel ?? this.defaultTrustLevel,
      availableTools: options.availableTools,
      steps: options.steps,
    });
  }

  async act(tool: string, options: ActOptions = {}): Promise<ActResult> {
    return this.runtime.act({
      tool,
      input: options.input ?? {},
      scope: options.scope ?? this.defaultScope,
      trustLevel: options.trustLevel ?? this.defaultTrustLevel,
      planRef: options.planRef,
    });
  }

  async listModels(): Promise<string[]> {
    return this.runtime.listAvailableModels();
  }

  async healthCheck(): Promise<Record<string, boolean>> {
    return this.runtime.healthCheck();
  }

  addPolicyRule(rule: PolicyRule): void {
    this.policyEngine.addRule(rule);
  }

  removePolicyRule(ruleId: string): void {
    this.policyEngine.removeRule(ruleId);
  }

  async checkpoint(description?: string): Promise<Checkpoint> {
    return this.memoryStore.checkpoint(description);
  }

  async rollback(checkpointId: string): Promise<void> {
    return this.memoryStore.rollback(checkpointId);
  }

  listCheckpoints(): Checkpoint[] {
    return this.memoryStore.listCheckpoints();
  }
}

export function createLattice(config: LatticeConfig): Lattice {
  return new Lattice(config);
}
