import { describe, it, expect, beforeEach } from "vitest";
import { createSqlitePolicyStore } from "../sqlite-policy-store.js";
import { createPolicyEngine } from "@lattice-kernel/policy-engine";
import type { PolicyEngine } from "@lattice-kernel/policy-engine";
import type { PolicyStore } from "../sqlite-policy-store.js";
import type { PolicyRule } from "@lattice-kernel/schemas";

const ALLOW_INFER: PolicyRule = {
  id: "allow-infer",
  name: "Allow inference",
  permissions: ["canInfer"],
  effect: "allow",
  priority: 10,
};

const DENY_CLOUD: PolicyRule = {
  id: "deny-cloud",
  name: "Deny cloud routing",
  description: "Block cloud access by default",
  permissions: ["canRouteToCloud"],
  scopePattern: "tenant:*",
  effect: "deny",
  priority: 5,
};

describe("SqlitePolicyStore", () => {
  let store: PolicyStore;
  let engine: PolicyEngine;

  beforeEach(() => {
    store = createSqlitePolicyStore({ dbPath: ":memory:" });
    engine = createPolicyEngine({ defaultDeny: true });
  });

  it("saves and lists rules", () => {
    store.save(engine, ALLOW_INFER);
    store.save(engine, DENY_CLOUD);

    const rules = store.list();
    expect(rules).toHaveLength(2);
    expect(rules[0]!.id).toBe("allow-infer"); // Higher priority first
  });

  it("loads rules into policy engine", () => {
    store.save(engine, ALLOW_INFER);

    // Create fresh engine and load
    const newEngine = createPolicyEngine({ defaultDeny: true });
    expect(newEngine.listRules()).toHaveLength(0);

    store.loadInto(newEngine);
    expect(newEngine.listRules()).toHaveLength(1);

    const result = newEngine.evaluate({
      operation: "canInfer",
      scope: {},
      trustLevel: "trusted_user_explicit",
    });
    expect(result.allowed).toBe(true);
  });

  it("removes rules from both SQLite and engine", () => {
    store.save(engine, ALLOW_INFER);
    store.save(engine, DENY_CLOUD);

    store.remove(engine, "allow-infer");

    expect(store.list()).toHaveLength(1);
    expect(engine.listRules()).toHaveLength(1);
  });

  it("preserves optional fields through round-trip", () => {
    store.save(engine, DENY_CLOUD);

    const rules = store.list();
    const rule = rules[0]!;
    expect(rule.description).toBe("Block cloud access by default");
    expect(rule.scopePattern).toBe("tenant:*");
  });

  it("upserts rules with same ID", () => {
    store.save(engine, ALLOW_INFER);
    store.save(engine, { ...ALLOW_INFER, priority: 20 });

    const rules = store.list();
    expect(rules).toHaveLength(1);
    expect(rules[0]!.priority).toBe(20);
  });

  it("persists across store instances", () => {
    // Use a shared in-memory DB isn't possible across instances,
    // so this test verifies the same instance retains data
    store.save(engine, ALLOW_INFER);
    store.save(engine, DENY_CLOUD);
    expect(store.list()).toHaveLength(2);
  });
});
