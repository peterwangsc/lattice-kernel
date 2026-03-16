import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryStore } from "../memory-store.js";
import { createPolicyEngine } from "@lattice-kernel/policy-engine";
import { createMemoryAuditSink } from "@lattice-kernel/audit";
import type { MemoryStore, MemoryWriteInput } from "../types.js";

function makeInput(overrides: Partial<MemoryWriteInput> = {}): MemoryWriteInput {
  return {
    scope: { tenantId: "t1", appId: "a1" },
    type: "semantic",
    content: "test memory content",
    source: "test",
    provenance: { origin: "unit-test" },
    classification: "internal",
    trustLevel: "trusted_user_explicit",
    ...overrides,
  };
}

describe("MemoryStore", () => {
  let store: MemoryStore;

  beforeEach(() => {
    const policyEngine = createPolicyEngine({ defaultDeny: false });
    const auditSink = createMemoryAuditSink();
    store = createMemoryStore({ policyEngine, auditSink });
  });

  describe("write", () => {
    it("writes and returns a MemoryItem with generated fields", async () => {
      const item = await store.write(makeInput());
      expect(item.id).toBeTruthy();
      expect(item.createdAt).toBeTruthy();
      expect(item.hash).toBeTruthy();
      expect(item.content).toBe("test memory content");
    });

    it("denies write when policy denies", async () => {
      const policyEngine = createPolicyEngine({ defaultDeny: true });
      const auditSink = createMemoryAuditSink();
      const restrictedStore = createMemoryStore({ policyEngine, auditSink });

      await expect(restrictedStore.write(makeInput())).rejects.toThrow(
        "Policy denied",
      );
    });
  });

  describe("retrieve", () => {
    it("retrieves items by scope", async () => {
      await store.write(
        makeInput({ scope: { tenantId: "t1" }, content: "alpha" }),
      );
      await store.write(
        makeInput({ scope: { tenantId: "t2" }, content: "beta" }),
      );

      const results = await store.retrieve("alpha", { tenantId: "t1" });
      expect(results).toHaveLength(1);
      expect(results[0]!.content).toBe("alpha");
    });

    it("filters by memory type", async () => {
      await store.write(makeInput({ type: "semantic", content: "fact" }));
      await store.write(makeInput({ type: "preference", content: "pref" }));

      const results = await store.retrieve("fact", {}, { types: ["semantic"] });
      expect(results).toHaveLength(1);
      expect(results[0]!.type).toBe("semantic");
    });

    it("filters by trust level", async () => {
      await store.write(
        makeInput({
          trustLevel: "untrusted_model_generated",
          content: "untrusted",
        }),
      );
      await store.write(
        makeInput({
          trustLevel: "trusted_user_explicit",
          content: "trusted",
        }),
      );

      const results = await store.retrieve("content", {}, {
        minTrustLevel: "trusted_user_explicit",
      });
      expect(results).toHaveLength(1);
      expect(results[0]!.content).toBe("trusted");
    });

    it("excludes expired items", async () => {
      await store.write(
        makeInput({
          content: "expired",
          expiresAt: "2000-01-01T00:00:00.000Z",
        }),
      );
      await store.write(makeInput({ content: "active" }));

      const results = await store.retrieve("content", {});
      expect(results).toHaveLength(1);
      expect(results[0]!.content).toBe("active");
    });

    it("ranks by text relevance", async () => {
      await store.write(makeInput({ content: "the cat sat on the mat" }));
      await store.write(makeInput({ content: "quarterly billing preference" }));
      await store.write(
        makeInput({ content: "billing is done quarterly each quarter" }),
      );

      const results = await store.retrieve("quarterly billing", {});
      // Item with both terms should rank first
      expect(results[0]!.content).toContain("billing");
      expect(results[0]!.content).toContain("quarterly");
    });

    it("respects topK", async () => {
      for (let i = 0; i < 20; i++) {
        await store.write(makeInput({ content: `item ${i}` }));
      }

      const results = await store.retrieve("item", {}, { topK: 5 });
      expect(results).toHaveLength(5);
    });
  });

  describe("get and delete", () => {
    it("gets an item by id", async () => {
      const item = await store.write(makeInput());
      const fetched = await store.get(item.id);
      expect(fetched).toEqual(item);
    });

    it("returns undefined for missing id", async () => {
      const result = await store.get("nonexistent");
      expect(result).toBeUndefined();
    });

    it("deletes an item", async () => {
      const item = await store.write(makeInput());
      await store.delete(item.id);
      expect(await store.get(item.id)).toBeUndefined();
      expect(store.count()).toBe(0);
    });
  });

  describe("expireStale", () => {
    it("removes expired items and returns count", async () => {
      await store.write(
        makeInput({ expiresAt: "2000-01-01T00:00:00.000Z" }),
      );
      await store.write(
        makeInput({ expiresAt: "2000-01-02T00:00:00.000Z" }),
      );
      await store.write(makeInput());

      const expired = await store.expireStale();
      expect(expired).toBe(2);
      expect(store.count()).toBe(1);
    });
  });
});
