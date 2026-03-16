import type { PolicyEngine, PolicyEvaluationContext } from "./types.js";
import type { PolicyDecision, PolicyRule } from "@lattice-kernel/schemas";

export function createPolicyEngine(): PolicyEngine {
  const rules: PolicyRule[] = [];

  return {
    evaluate(_context: PolicyEvaluationContext): PolicyDecision {
      return {
        allowed: true,
        requiresApproval: false,
        matchedRules: [],
        reason: "No rules configured — default allow",
      };
    },
    addRule(rule: PolicyRule): void {
      rules.push(rule);
    },
    removeRule(ruleId: string): void {
      const index = rules.findIndex((r) => r.id === ruleId);
      if (index !== -1) rules.splice(index, 1);
    },
  };
}
