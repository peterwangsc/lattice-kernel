import { describe, it, expect } from "vitest";
import { createPolicyEngine } from "../engine.js";
import type { PolicyRule } from "@lattice-kernel/schemas";

function makeRule(overrides: Partial<PolicyRule> & { id: string }): PolicyRule {
  return {
    name: overrides.id,
    permissions: ["canInfer"],
    effect: "allow",
    priority: 0,
    ...overrides,
  };
}

describe("PolicyEngine", () => {
  describe("default behavior", () => {
    it("denies by default when no rules match (defaultDeny=true)", () => {
      const engine = createPolicyEngine({ defaultDeny: true });
      const result = engine.evaluate({
        operation: "canInfer",
        scope: {},
        trustLevel: "trusted_user_explicit",
      });
      expect(result.allowed).toBe(false);
      expect(result.matchedRules).toEqual([]);
    });

    it("allows by default when defaultDeny=false", () => {
      const engine = createPolicyEngine({ defaultDeny: false });
      const result = engine.evaluate({
        operation: "canInfer",
        scope: {},
        trustLevel: "trusted_user_explicit",
      });
      expect(result.allowed).toBe(true);
    });
  });

  describe("rule matching", () => {
    it("matches rules by permission", () => {
      const engine = createPolicyEngine();
      engine.addRule(
        makeRule({
          id: "allow-infer",
          permissions: ["canInfer"],
          effect: "allow",
          priority: 1,
        }),
      );

      const allowed = engine.evaluate({
        operation: "canInfer",
        scope: {},
        trustLevel: "trusted_user_explicit",
      });
      expect(allowed.allowed).toBe(true);

      const denied = engine.evaluate({
        operation: "canRemember",
        scope: {},
        trustLevel: "trusted_user_explicit",
      });
      expect(denied.allowed).toBe(false);
    });

    it("matches rules by model pattern", () => {
      const engine = createPolicyEngine();
      engine.addRule(
        makeRule({
          id: "allow-gpt",
          permissions: ["canInfer"],
          modelPattern: "gpt-*",
          effect: "allow",
          priority: 1,
        }),
      );

      const result = engine.evaluate({
        operation: "canInfer",
        scope: {},
        modelId: "gpt-4",
        trustLevel: "trusted_user_explicit",
      });
      expect(result.allowed).toBe(true);
      expect(result.matchedRules).toContain("allow-gpt");
    });
  });

  describe("priority and precedence", () => {
    it("deny takes precedence over allow regardless of priority", () => {
      const engine = createPolicyEngine();
      engine.addRule(
        makeRule({
          id: "allow",
          effect: "allow",
          priority: 100,
        }),
      );
      engine.addRule(
        makeRule({
          id: "deny",
          effect: "deny",
          priority: 1,
        }),
      );

      const result = engine.evaluate({
        operation: "canInfer",
        scope: {},
        trustLevel: "trusted_user_explicit",
      });
      expect(result.allowed).toBe(false);
      expect(result.matchedRules).toContain("deny");
    });

    it("require_approval takes precedence over allow", () => {
      const engine = createPolicyEngine();
      engine.addRule(
        makeRule({
          id: "allow",
          effect: "allow",
          priority: 100,
        }),
      );
      engine.addRule(
        makeRule({
          id: "approval",
          effect: "require_approval",
          priority: 1,
        }),
      );

      const result = engine.evaluate({
        operation: "canInfer",
        scope: {},
        trustLevel: "trusted_user_explicit",
      });
      expect(result.allowed).toBe(true);
      expect(result.requiresApproval).toBe(true);
    });
  });

  describe("rule management", () => {
    it("upserts rules by id", () => {
      const engine = createPolicyEngine();
      engine.addRule(
        makeRule({ id: "r1", effect: "deny", priority: 1 }),
      );
      engine.addRule(
        makeRule({ id: "r1", effect: "allow", priority: 1 }),
      );

      expect(engine.listRules()).toHaveLength(1);
      const result = engine.evaluate({
        operation: "canInfer",
        scope: {},
        trustLevel: "trusted_user_explicit",
      });
      expect(result.allowed).toBe(true);
    });

    it("removes rules by id", () => {
      const engine = createPolicyEngine();
      engine.addRule(
        makeRule({ id: "r1", effect: "allow", priority: 1 }),
      );
      engine.removeRule("r1");

      expect(engine.listRules()).toHaveLength(0);
    });

    it("listRules returns sorted by priority descending", () => {
      const engine = createPolicyEngine();
      engine.addRule(makeRule({ id: "low", priority: 1 }));
      engine.addRule(makeRule({ id: "high", priority: 100 }));
      engine.addRule(makeRule({ id: "mid", priority: 50 }));

      const rules = engine.listRules();
      expect(rules.map((r) => r.id)).toEqual(["high", "mid", "low"]);
    });
  });
});
