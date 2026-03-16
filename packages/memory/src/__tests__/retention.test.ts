import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMemoryStore } from "../memory-store.js";
import { createPolicyEngine } from "@lattice-kernel/policy-engine";
import { createMemoryAuditSink } from "@lattice-kernel/audit";
import type { MemoryStore, MemoryWriteInput } from "../types.js";

function makeInput(overrides: Partial<MemoryWriteInput> = {}): MemoryWriteInput {
  return {
    scope: { tenantId: "t1" },
    type: "semantic",
    content: "test content",
    source: "test",
    provenance: {},
    classification: "internal",
    trustLevel: "trusted_user_explicit",
    ...overrides,
  };
}

describe("Retention enforcement", () => {
  let store: MemoryStore;

  beforeEach(() => {
    const policyEngine = createPolicyEngine({ defaultDeny: false });
    const auditSink = createMemoryAuditSink();
    store = createMemoryStore({ policyEngine, auditSink });
  });

  describe("retentionPolicy auto-expiration", () => {
    it("sets expiresAt from retentionPolicy duration", async () => {
      const before = Date.now();
      const item = await store.write(
        makeInput({ retentionPolicy: "30d" }),
      );

      expect(item.expiresAt).toBeDefined();
      const expiresMs = new Date(item.expiresAt!).getTime();
      const expectedMs = before + 30 * 24 * 60 * 60 * 1000;
      // Allow 1 second of tolerance
      expect(Math.abs(expiresMs - expectedMs)).toBeLessThan(1000);
    });

    it("handles hours retention", async () => {
      const before = Date.now();
      const item = await store.write(
        makeInput({ retentionPolicy: "2h" }),
      );

      const expiresMs = new Date(item.expiresAt!).getTime();
      const expectedMs = before + 2 * 60 * 60 * 1000;
      expect(Math.abs(expiresMs - expectedMs)).toBeLessThan(1000);
    });

    it("handles minutes retention", async () => {
      const before = Date.now();
      const item = await store.write(
        makeInput({ retentionPolicy: "30m" }),
      );

      const expiresMs = new Date(item.expiresAt!).getTime();
      const expectedMs = before + 30 * 60 * 1000;
      expect(Math.abs(expiresMs - expectedMs)).toBeLessThan(1000);
    });

    it("handles seconds retention", async () => {
      const before = Date.now();
      const item = await store.write(
        makeInput({ retentionPolicy: "60s" }),
      );

      const expiresMs = new Date(item.expiresAt!).getTime();
      const expectedMs = before + 60 * 1000;
      expect(Math.abs(expiresMs - expectedMs)).toBeLessThan(1000);
    });

    it("explicit expiresAt takes precedence over retentionPolicy", async () => {
      const explicit = "2030-01-01T00:00:00.000Z";
      const item = await store.write(
        makeInput({
          retentionPolicy: "30d",
          expiresAt: explicit,
        }),
      );

      expect(item.expiresAt).toBe(explicit);
    });

    it("no retention results in no expiration", async () => {
      const item = await store.write(makeInput());
      expect(item.expiresAt).toBeUndefined();
    });
  });

  describe("expireStale with retention-derived expiration", () => {
    it("expires items whose retention period has passed", async () => {
      vi.useFakeTimers();
      const startTime = new Date("2026-01-01T00:00:00.000Z");
      vi.setSystemTime(startTime);

      // Recreate store with fake timers active
      const policyEngine = createPolicyEngine({ defaultDeny: false });
      const auditSink = createMemoryAuditSink();
      const timedStore = createMemoryStore({ policyEngine, auditSink });

      await timedStore.write(
        makeInput({ retentionPolicy: "1s", content: "short-lived" }),
      );
      await timedStore.write(makeInput({ content: "permanent" }));
      expect(timedStore.count()).toBe(2);

      // Advance time past retention
      vi.setSystemTime(new Date(startTime.getTime() + 2000));
      const expired = await timedStore.expireStale();

      expect(expired).toBe(1);
      expect(timedStore.count()).toBe(1);

      vi.useRealTimers();
    });
  });
});
