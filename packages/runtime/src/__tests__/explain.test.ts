import { describe, it, expect } from "vitest";
import { explainPolicyDecision } from "../explain.js";
import { createPolicyEngine } from "@lattice-kernel/policy-engine";

describe("explainPolicyDecision", () => {
  it("explains an allowed decision", () => {
    const engine = createPolicyEngine({ defaultDeny: true });
    engine.addRule({
      id: "allow-infer",
      name: "Allow inference for trusted users",
      permissions: ["canInfer"],
      effect: "allow",
      priority: 10,
    });

    const explanation = explainPolicyDecision(engine, {
      operation: "canInfer",
      scope: { tenantId: "acme" },
      trustLevel: "trusted_user_explicit",
    });

    expect(explanation.decision.allowed).toBe(true);
    expect(explanation.reasoning).toContain("Result: ALLOWED");
    expect(explanation.reasoning.some((r) => r.includes("Allow inference"))).toBe(true);
    expect(explanation.reasoning.some((r) => r.includes("Scope: tenantId=acme"))).toBe(true);
  });

  it("explains a denied decision", () => {
    const engine = createPolicyEngine({ defaultDeny: true });

    const explanation = explainPolicyDecision(engine, {
      operation: "canInfer",
      scope: {},
      trustLevel: "trusted_user_explicit",
    });

    expect(explanation.decision.allowed).toBe(false);
    expect(explanation.reasoning.some((r) => r.includes("default deny"))).toBe(true);
    expect(explanation.reasoning.some((r) => r.includes("DENIED"))).toBe(true);
  });

  it("explains a deny rule taking precedence", () => {
    const engine = createPolicyEngine({ defaultDeny: false });
    engine.addRule({
      id: "allow",
      name: "Allow",
      permissions: ["canInfer"],
      effect: "allow",
      priority: 1,
    });
    engine.addRule({
      id: "deny",
      name: "Block cloud",
      permissions: ["canInfer"],
      effect: "deny",
      priority: 5,
    });

    const explanation = explainPolicyDecision(engine, {
      operation: "canInfer",
      scope: {},
      trustLevel: "trusted_user_explicit",
    });

    expect(explanation.decision.allowed).toBe(false);
    expect(explanation.reasoning.some((r) => r.includes("Block cloud"))).toBe(true);
  });

  it("explains approval required", () => {
    const engine = createPolicyEngine({ defaultDeny: true });
    engine.addRule({
      id: "approve",
      name: "Needs approval",
      permissions: ["canAct"],
      effect: "require_approval",
      priority: 10,
    });

    const explanation = explainPolicyDecision(engine, {
      operation: "canAct",
      scope: {},
      tool: "email-send",
      trustLevel: "trusted_user_explicit",
    });

    expect(explanation.decision.requiresApproval).toBe(true);
    expect(explanation.reasoning.some((r) => r.includes("REQUIRES APPROVAL"))).toBe(true);
    expect(explanation.reasoning.some((r) => r.includes("Tool: email-send"))).toBe(true);
  });

  it("includes all context in reasoning", () => {
    const engine = createPolicyEngine({ defaultDeny: false });
    const explanation = explainPolicyDecision(engine, {
      operation: "canInfer",
      scope: { tenantId: "acme", appId: "copilot" },
      modelId: "claude-sonnet",
      trustLevel: "trusted_admin",
    });

    expect(explanation.reasoning.some((r) => r.includes("Trust level: trusted_admin"))).toBe(true);
    expect(explanation.reasoning.some((r) => r.includes("Model: claude-sonnet"))).toBe(true);
    expect(explanation.reasoning.some((r) => r.includes("tenantId=acme"))).toBe(true);
  });
});
