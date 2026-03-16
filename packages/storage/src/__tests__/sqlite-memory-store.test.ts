import { describe, it, expect, beforeEach } from "vitest";
import { createSqliteMemoryStore } from "../sqlite-memory-store.js";
import { createPolicyEngine } from "@lattice-kernel/policy-engine";
import { createMemoryAuditSink } from "@lattice-kernel/audit";
import type { MemoryStore, MemoryWriteInput } from "@lattice-kernel/memory";
import { unlinkSync } from "node:fs";

const DB_PATH = ":memory:";

function makeInput(overrides: Partial<MemoryWriteInput> = {}): MemoryWriteInput {
  return {
    scope: { tenantId: "t1", appId: "a1" },
    type: "semantic",
    content: "test content",
    source: "test",
    provenance: { origin: "unit-test" },
    classification: "internal",
    trustLevel: "trusted_user_explicit",
    ...overrides,
  };
}

describe("SqliteMemoryStore", () => {
  let store: MemoryStore;

  beforeEach(() => {
    const policyEngine = createPolicyEngine({ defaultDeny: false });
    const auditSink = createMemoryAuditSink();
    store = createSqliteMemoryStore({
      dbPath: DB_PATH,
      policyEngine,
      auditSink,
    });
  });

  describe("write and get", () => {
    it("writes and retrieves a memory item", async () => {
      const item = await store.write(makeInput({ content: "hello world" }));
      expect(item.id).toBeTruthy();
      expect(item.hash).toBeTruthy();

      const fetched = await store.get(item.id);
      expect(fetched).toBeDefined();
      expect(fetched!.content).toBe("hello world");
      expect(fetched!.scope.tenantId).toBe("t1");
      expect(fetched!.provenance).toEqual({ origin: "unit-test" });
    });

    it("returns undefined for missing item", async () => {
      expect(await store.get("nonexistent")).toBeUndefined();
    });
  });

  describe("retrieve", () => {
    it("filters by scope", async () => {
      await store.write(makeInput({ scope: { tenantId: "acme" }, content: "acme data" }));
      await store.write(makeInput({ scope: { tenantId: "beta" }, content: "beta data" }));

      const results = await store.retrieve("data", { tenantId: "acme" });
      expect(results).toHaveLength(1);
      expect(results[0]!.content).toBe("acme data");
    });

    it("filters by type", async () => {
      await store.write(makeInput({ type: "semantic", content: "fact" }));
      await store.write(makeInput({ type: "preference", content: "pref" }));

      const results = await store.retrieve("", {}, { types: ["preference"] });
      expect(results).toHaveLength(1);
      expect(results[0]!.type).toBe("preference");
    });

    it("excludes expired items", async () => {
      await store.write(
        makeInput({ content: "expired", expiresAt: "2000-01-01T00:00:00.000Z" }),
      );
      await store.write(makeInput({ content: "active" }));

      const results = await store.retrieve("content", {});
      expect(results).toHaveLength(1);
      expect(results[0]!.content).toBe("active");
    });

    it("respects topK", async () => {
      for (let i = 0; i < 10; i++) {
        await store.write(makeInput({ content: `item ${i}` }));
      }
      const results = await store.retrieve("item", {}, { topK: 3 });
      expect(results).toHaveLength(3);
    });

    it("ranks by text relevance", async () => {
      await store.write(makeInput({ content: "the cat sat" }));
      await store.write(makeInput({ content: "billing quarterly" }));
      await store.write(makeInput({ content: "billing done quarterly" }));

      const results = await store.retrieve("quarterly billing", {});
      expect(results[0]!.content).toContain("billing");
      expect(results[0]!.content).toContain("quarterly");
    });
  });

  describe("delete", () => {
    it("removes an item", async () => {
      const item = await store.write(makeInput());
      await store.delete(item.id);
      expect(await store.get(item.id)).toBeUndefined();
    });
  });

  describe("count", () => {
    it("returns total items", async () => {
      await store.write(makeInput({ content: "a" }));
      await store.write(makeInput({ content: "b" }));
      expect(store.count()).toBe(2);
    });
  });

  describe("expireStale", () => {
    it("removes expired items", async () => {
      await store.write(
        makeInput({ expiresAt: "2000-01-01T00:00:00.000Z" }),
      );
      await store.write(makeInput());

      const expired = await store.expireStale();
      expect(expired).toBe(1);
      expect(store.count()).toBe(1);
    });
  });

  describe("checkpoint and rollback", () => {
    it("checkpoints and rolls back", async () => {
      await store.write(makeInput({ content: "original" }));
      const cp = await store.checkpoint("test");

      await store.write(makeInput({ content: "added" }));
      expect(store.count()).toBe(2);

      await store.rollback(cp.checkpointId);
      expect(store.count()).toBe(1);

      const results = await store.retrieve("original", {});
      expect(results).toHaveLength(1);
    });

    it("lists checkpoints", async () => {
      await store.checkpoint("first");
      await store.checkpoint("second");
      const cps = store.listCheckpoints();
      expect(cps).toHaveLength(2);
    });

    it("throws on invalid checkpoint", async () => {
      await expect(store.rollback("bad")).rejects.toThrow("not found");
    });
  });

  describe("verify", () => {
    it("verifies a valid item", async () => {
      const item = await store.write(makeInput());
      const result = await store.verify(item.id);
      expect(result.valid).toBe(true);
    });

    it("verifies a valid checkpoint", async () => {
      await store.write(makeInput());
      const cp = await store.checkpoint();
      const result = await store.verifyCheckpoint(cp.checkpointId);
      expect(result.valid).toBe(true);
    });
  });

  describe("persistence", () => {
    it("survives across store instances with file-based DB", () => {
      const tmpPath = `/tmp/lattice-test-${Date.now()}.db`;
      try {
        const policyEngine = createPolicyEngine({ defaultDeny: false });
        const auditSink = createMemoryAuditSink();

        // Write with first instance
        const store1 = createSqliteMemoryStore({
          dbPath: tmpPath,
          policyEngine,
          auditSink,
        });
        store1.write(makeInput({ content: "persisted" }));

        // Read with second instance
        const store2 = createSqliteMemoryStore({
          dbPath: tmpPath,
          policyEngine,
          auditSink,
        });
        expect(store2.count()).toBe(1);
      } finally {
        try { unlinkSync(tmpPath); } catch { /* ignore */ }
        try { unlinkSync(tmpPath + "-wal"); } catch { /* ignore */ }
        try { unlinkSync(tmpPath + "-shm"); } catch { /* ignore */ }
      }
    });
  });
});
