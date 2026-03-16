import type { Permission, PolicyDecision, PolicyRule } from "@lattice-kernel/schemas";
import type { TrustLevel, ScopeRef } from "@lattice-kernel/schemas";

export interface PolicyEngine {
  evaluate(context: PolicyEvaluationContext): PolicyDecision;
  addRule(rule: PolicyRule): void;
  removeRule(ruleId: string): void;
  listRules(): PolicyRule[];
}

export interface PolicyEvaluationContext {
  operation: Permission;
  scope: ScopeRef;
  modelId?: string;
  tool?: string;
  trustLevel: TrustLevel;
}
