import type { PolicyDecision, PolicyRule } from "@lattice-kernel/schemas";

export interface PolicyEngine {
  evaluate(context: PolicyEvaluationContext): PolicyDecision;
  addRule(rule: PolicyRule): void;
  removeRule(ruleId: string): void;
}

export interface PolicyEvaluationContext {
  operation: string;
  scope: Record<string, string | undefined>;
  modelId?: string;
  tool?: string;
  trustLevel: string;
}
