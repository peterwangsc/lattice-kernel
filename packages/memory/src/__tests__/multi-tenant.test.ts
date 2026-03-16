import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryStore } from "../memory-store.js";
import { createPolicyEngine } from "@lattice-kernel/policy-engine";
import { createMemoryAuditSink } from "@lattice-kernel/audit";
import type { MemoryStore, MemoryWriteInput } from "../types.js";

function makeInput(overrides: Partial<MemoryWriteInput> = {}): MemoryWriteInput {
  return {
    scope: {},
    type: "semantic",
    content: "default content",
    source: "test",
    provenance: {},
    classification: "internal",
    trustLevel: "trusted_user_explicit",
    ...overrides,
  };
}

describe("Multi-tenant memory isolation", () => {
  let store: MemoryStore;

  beforeEach(() => {
    const policyEngine = createPolicyEngine({ defaultDeny: false });
    const auditSink = createMemoryAuditSink();
    store = createMemoryStore({ policyEngine, auditSink });
  });

  describe("tenant isolation", () => {
    it("items from one tenant are not visible to another", async () => {
      await store.write(
        makeInput({ scope: { tenantId: "acme" }, content: "Acme secret" }),
      );
      await store.write(
        makeInput({ scope: { tenantId: "globex" }, content: "Globex secret" }),
      );

      const acmeResults = await store.retrieve("secret", { tenantId: "acme" });
      expect(acmeResults).toHaveLength(1);
      expect(acmeResults[0]!.content).toBe("Acme secret");

      const globexResults = await store.retrieve("secret", {
        tenantId: "globex",
      });
      expect(globexResults).toHaveLength(1);
      expect(globexResults[0]!.content).toBe("Globex secret");
    });

    it("empty scope retrieves all items (no tenant filter)", async () => {
      await store.write(
        makeInput({ scope: { tenantId: "acme" }, content: "Acme data" }),
      );
      await store.write(
        makeInput({ scope: { tenantId: "globex" }, content: "Globex data" }),
      );

      const all = await store.retrieve("data", {});
      expect(all).toHaveLength(2);
    });
  });

  describe("app isolation within tenant", () => {
    it("items scoped to one app are not visible to another", async () => {
      const tenant = "acme";
      await store.write(
        makeInput({
          scope: { tenantId: tenant, appId: "copilot" },
          content: "Copilot memory",
        }),
      );
      await store.write(
        makeInput({
          scope: { tenantId: tenant, appId: "search" },
          content: "Search memory",
        }),
      );

      const copilotResults = await store.retrieve("memory", {
        tenantId: tenant,
        appId: "copilot",
      });
      expect(copilotResults).toHaveLength(1);
      expect(copilotResults[0]!.content).toBe("Copilot memory");

      const searchResults = await store.retrieve("memory", {
        tenantId: tenant,
        appId: "search",
      });
      expect(searchResults).toHaveLength(1);
      expect(searchResults[0]!.content).toBe("Search memory");
    });

    it("tenant-scoped query sees all apps within tenant", async () => {
      const tenant = "acme";
      await store.write(
        makeInput({
          scope: { tenantId: tenant, appId: "copilot" },
          content: "app1",
        }),
      );
      await store.write(
        makeInput({
          scope: { tenantId: tenant, appId: "search" },
          content: "app2",
        }),
      );

      const tenantResults = await store.retrieve("app", {
        tenantId: tenant,
      });
      expect(tenantResults).toHaveLength(2);
    });
  });

  describe("user isolation within app", () => {
    it("user-scoped items are isolated", async () => {
      const base = { tenantId: "acme", appId: "copilot" };
      await store.write(
        makeInput({
          scope: { ...base, userId: "alice" },
          content: "Alice preference",
        }),
      );
      await store.write(
        makeInput({
          scope: { ...base, userId: "bob" },
          content: "Bob preference",
        }),
      );

      const aliceResults = await store.retrieve("preference", {
        ...base,
        userId: "alice",
      });
      expect(aliceResults).toHaveLength(1);
      expect(aliceResults[0]!.content).toBe("Alice preference");
    });

    it("app-scoped query sees all users", async () => {
      const base = { tenantId: "acme", appId: "copilot" };
      await store.write(
        makeInput({
          scope: { ...base, userId: "alice" },
          content: "item1",
        }),
      );
      await store.write(
        makeInput({
          scope: { ...base, userId: "bob" },
          content: "item2",
        }),
      );

      const appResults = await store.retrieve("item", base);
      expect(appResults).toHaveLength(2);
    });
  });

  describe("session isolation", () => {
    it("session-scoped items are isolated within user", async () => {
      const base = { tenantId: "acme", appId: "copilot", userId: "alice" };
      await store.write(
        makeInput({
          scope: { ...base, sessionId: "s1" },
          content: "Session 1 context",
          type: "session",
        }),
      );
      await store.write(
        makeInput({
          scope: { ...base, sessionId: "s2" },
          content: "Session 2 context",
          type: "session",
        }),
      );

      const s1Results = await store.retrieve("context", {
        ...base,
        sessionId: "s1",
      });
      expect(s1Results).toHaveLength(1);
      expect(s1Results[0]!.content).toBe("Session 1 context");
    });
  });

  describe("cross-tenant leakage prevention", () => {
    it("cannot retrieve items by partially matching scope", async () => {
      await store.write(
        makeInput({
          scope: { tenantId: "acme", appId: "copilot" },
          content: "Acme copilot data",
        }),
      );

      // Query with different tenant but same app should find nothing
      const results = await store.retrieve("data", {
        tenantId: "globex",
        appId: "copilot",
      });
      expect(results).toHaveLength(0);
    });

    it("checkpoint and rollback are store-wide (not tenant-scoped)", async () => {
      await store.write(
        makeInput({ scope: { tenantId: "acme" }, content: "Acme" }),
      );
      await store.write(
        makeInput({ scope: { tenantId: "globex" }, content: "Globex" }),
      );
      const cp = await store.checkpoint();

      await store.write(
        makeInput({ scope: { tenantId: "acme" }, content: "Acme new" }),
      );
      expect(store.count()).toBe(3);

      await store.rollback(cp.checkpointId);
      expect(store.count()).toBe(2);
    });
  });
});
