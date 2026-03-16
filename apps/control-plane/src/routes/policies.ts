import type { PolicyEngine } from "@lattice-kernel/policy-engine";
import type { PolicyRule } from "@lattice-kernel/schemas";
import type { PolicyStore } from "@lattice-kernel/storage";
import type { Router } from "../router.js";
import { json, readBody } from "../router.js";

export function registerPolicyRoutes(
  router: Router,
  policyEngine: PolicyEngine,
  policyStore?: PolicyStore,
): void {
  // List all policy rules
  router.get("/api/v1/policies", async (_req, res) => {
    const rules = policyEngine.listRules();
    json(res, 200, { rules, count: rules.length });
  });

  // Add or update a policy rule (persisted when store available)
  router.post("/api/v1/policies", async (req, res) => {
    try {
      const body = await readBody(req);
      const rule = JSON.parse(body) as PolicyRule;

      if (!rule.id || !rule.name || !rule.effect) {
        json(res, 400, { error: "Missing required fields: id, name, effect" });
        return;
      }

      if (policyStore) {
        policyStore.save(policyEngine, rule);
      } else {
        policyEngine.addRule(rule);
      }

      json(res, 201, {
        rule,
        message: "Rule added",
        persisted: policyStore !== undefined,
      });
    } catch (err) {
      json(res, 400, {
        error: err instanceof Error ? err.message : "Invalid request",
      });
    }
  });

  // Delete a policy rule (persisted when store available)
  router.delete("/api/v1/policies/:ruleId", async (_req, res, params) => {
    if (policyStore) {
      policyStore.remove(policyEngine, params.ruleId!);
    } else {
      policyEngine.removeRule(params.ruleId!);
    }
    json(res, 200, {
      message: "Rule removed",
      ruleId: params.ruleId,
      persisted: policyStore !== undefined,
    });
  });
}
