import type { PolicyDecision } from "@lattice-kernel/schemas";
import type { PolicyEngine, PolicyEvaluationContext } from "@lattice-kernel/policy-engine";

export interface DecisionExplanation {
  operation: string;
  decision: PolicyDecision;
  context: PolicyEvaluationContext;
  reasoning: string[];
}

/**
 * Explains why a policy decision was made. Useful for debugging
 * policy denials and understanding route selection.
 *
 * Returns human-readable reasoning steps.
 */
export function explainPolicyDecision(
  engine: PolicyEngine,
  context: PolicyEvaluationContext,
): DecisionExplanation {
  const decision = engine.evaluate(context);
  const reasoning: string[] = [];
  const rules = engine.listRules();

  reasoning.push(`Evaluating operation: ${context.operation}`);
  reasoning.push(`Trust level: ${context.trustLevel}`);
  if (context.modelId) reasoning.push(`Model: ${context.modelId}`);
  if (context.tool) reasoning.push(`Tool: ${context.tool}`);

  const scopeStr = Object.entries(context.scope)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  if (scopeStr) reasoning.push(`Scope: ${scopeStr}`);

  reasoning.push(`Total rules evaluated: ${rules.length}`);

  if (decision.matchedRules.length === 0) {
    reasoning.push(
      decision.allowed
        ? "No rules matched — default allow is active"
        : "No rules matched — default deny is active (secure by default)"
    );
  } else {
    for (const ruleId of decision.matchedRules) {
      const rule = rules.find((r) => r.id === ruleId);
      if (rule) {
        reasoning.push(
          `Rule "${rule.name}" (${rule.id}) matched: effect=${rule.effect}, priority=${rule.priority}`
        );
      }
    }
  }

  if (decision.requiresApproval) {
    reasoning.push("Result: REQUIRES APPROVAL — operation needs explicit approval before proceeding");
  } else if (decision.allowed) {
    reasoning.push("Result: ALLOWED");
  } else {
    reasoning.push(`Result: DENIED — ${decision.reason ?? "policy denied"}`);
  }

  return {
    operation: context.operation,
    decision,
    context,
    reasoning,
  };
}
