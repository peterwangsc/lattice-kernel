import type { PolicyEngine, PolicyEvaluationContext } from "./types.js";
import type { PolicyDecision, PolicyRule } from "@lattice-kernel/schemas";

export interface PolicyEngineOptions {
  /** When no rules match, default to deny (secure by default). */
  defaultDeny?: boolean;
}

export function createPolicyEngine(
  options: PolicyEngineOptions = {},
): PolicyEngine {
  const { defaultDeny = true } = options;
  const rules: PolicyRule[] = [];

  function sortedRules(): PolicyRule[] {
    return [...rules].sort((a, b) => b.priority - a.priority);
  }

  return {
    evaluate(context: PolicyEvaluationContext): PolicyDecision {
      const matched = sortedRules().filter((rule) =>
        ruleMatchesContext(rule, context),
      );

      if (matched.length === 0) {
        return {
          allowed: !defaultDeny,
          requiresApproval: false,
          matchedRules: [],
          reason: defaultDeny
            ? "No matching rules — default deny"
            : "No matching rules — default allow",
        };
      }

      // Deny rules take absolute precedence
      const denyRules = matched.filter((r) => r.effect === "deny");
      if (denyRules.length > 0) {
        return {
          allowed: false,
          requiresApproval: false,
          matchedRules: denyRules.map((r) => r.id),
          reason: `Denied by rule: ${denyRules[0]!.name}`,
        };
      }

      // Approval rules take precedence over allow
      const approvalRules = matched.filter(
        (r) => r.effect === "require_approval",
      );
      if (approvalRules.length > 0) {
        return {
          allowed: true,
          requiresApproval: true,
          matchedRules: approvalRules.map((r) => r.id),
          reason: `Requires approval per rule: ${approvalRules[0]!.name}`,
        };
      }

      // Remaining are allow rules
      const allowRules = matched.filter((r) => r.effect === "allow");
      return {
        allowed: true,
        requiresApproval: false,
        matchedRules: allowRules.map((r) => r.id),
        reason: `Allowed by rule: ${allowRules[0]!.name}`,
      };
    },

    addRule(rule: PolicyRule): void {
      const existing = rules.findIndex((r) => r.id === rule.id);
      if (existing !== -1) {
        rules[existing] = rule;
      } else {
        rules.push(rule);
      }
    },

    removeRule(ruleId: string): void {
      const index = rules.findIndex((r) => r.id === ruleId);
      if (index !== -1) rules.splice(index, 1);
    },

    listRules(): PolicyRule[] {
      return sortedRules();
    },
  };
}

function ruleMatchesContext(
  rule: PolicyRule,
  context: PolicyEvaluationContext,
): boolean {
  // Check if the rule covers the requested operation
  if (!rule.permissions.includes(context.operation)) {
    return false;
  }

  // Check scope pattern (simple glob: "tenant:*" matches any tenant)
  if (rule.scopePattern) {
    const scopeString = scopeToString(context.scope);
    if (!globMatch(rule.scopePattern, scopeString)) {
      return false;
    }
  }

  // Check model pattern
  if (rule.modelPattern && context.modelId) {
    if (!globMatch(rule.modelPattern, context.modelId)) {
      return false;
    }
  }

  // Check tool pattern
  if (rule.toolPattern && context.tool) {
    if (!globMatch(rule.toolPattern, context.tool)) {
      return false;
    }
  }

  return true;
}

function scopeToString(scope: Record<string, unknown>): string {
  const parts: string[] = [];
  if (scope.tenantId) parts.push(`tenant:${scope.tenantId}`);
  if (scope.appId) parts.push(`app:${scope.appId}`);
  if (scope.userId) parts.push(`user:${scope.userId}`);
  if (scope.sessionId) parts.push(`session:${scope.sessionId}`);
  return parts.join("/");
}

/**
 * Simple glob matching: supports * as wildcard for any characters.
 */
function globMatch(pattern: string, value: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(value);
}
