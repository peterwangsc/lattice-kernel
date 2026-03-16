import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryStore } from "../memory-store.js";
import { createPolicyEngine } from "@lattice-kernel/policy-engine";
import { createMemoryAuditSink } from "@lattice-kernel/audit";
import { createNodeCryptoProvider } from "@lattice-kernel/crypto";
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

    it("uses SHA-256 hash when crypto provider is supplied", async () => {
      const policyEngine = createPolicyEngine({ defaultDeny: false });
      const auditSink = createMemoryAuditSink();
      const crypto = createNodeCryptoProvider();
      const cryptoStore = createMemoryStore({ policyEngine, auditSink, crypto });

      const item = await cryptoStore.write(makeInput());
      // SHA-256 hex is 64 characters
      expect(item.hash).toHaveLength(64);
    });

    it("uses simple hash when no crypto provider", async () => {
      const item = await store.write(makeInput());
      // simpleHash is 8 characters
      expect(item.hash.length).toBeLessThan(64);
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

  describe("checkpoint and rollback", () => {
    it("creates a checkpoint with metadata", async () => {
      await store.write(makeInput({ content: "fact 1" }));
      const cp = await store.checkpoint("before changes");

      expect(cp.checkpointId).toBeTruthy();
      expect(cp.target).toBe("memory");
      expect(cp.description).toBe("before changes");
      expect(cp.hash).toBeTruthy();
      expect(cp.createdAt).toBeTruthy();
    });

    it("rollback restores state to checkpoint", async () => {
      await store.write(makeInput({ content: "original" }));
      expect(store.count()).toBe(1);

      const cp = await store.checkpoint();

      // Make changes after checkpoint
      await store.write(makeInput({ content: "added after" }));
      await store.write(makeInput({ content: "also added" }));
      expect(store.count()).toBe(3);

      // Rollback
      await store.rollback(cp.checkpointId);
      expect(store.count()).toBe(1);

      const results = await store.retrieve("original", {});
      expect(results).toHaveLength(1);
      expect(results[0]!.content).toBe("original");
    });

    it("rollback after delete restores deleted items", async () => {
      const item = await store.write(makeInput({ content: "keep me" }));
      const cp = await store.checkpoint();

      await store.delete(item.id);
      expect(store.count()).toBe(0);

      await store.rollback(cp.checkpointId);
      expect(store.count()).toBe(1);
      expect(await store.get(item.id)).toBeDefined();
    });

    it("throws on rollback to nonexistent checkpoint", async () => {
      await expect(store.rollback("nonexistent")).rejects.toThrow(
        "Checkpoint not found",
      );
    });

    it("listCheckpoints returns checkpoints newest first", async () => {
      await store.checkpoint("first");
      await store.checkpoint("second");
      await store.checkpoint("third");

      const cps = store.listCheckpoints();
      expect(cps).toHaveLength(3);
      expect(cps[0]!.description).toBe("third");
      expect(cps[2]!.description).toBe("first");
    });

    it("can rollback multiple times to same checkpoint", async () => {
      await store.write(makeInput({ content: "base" }));
      const cp = await store.checkpoint();

      // First mutation + rollback
      await store.write(makeInput({ content: "extra1" }));
      await store.rollback(cp.checkpointId);
      expect(store.count()).toBe(1);

      // Second mutation + rollback
      await store.write(makeInput({ content: "extra2" }));
      await store.write(makeInput({ content: "extra3" }));
      await store.rollback(cp.checkpointId);
      expect(store.count()).toBe(1);
    });
  });
});
