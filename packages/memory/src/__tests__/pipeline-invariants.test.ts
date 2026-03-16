/**
 * Memory write pipeline invariant tests (spec section 12.3)
 *
 * Verifies the pipeline guarantees:
 * 1. Policy check before any write
 * 2. Approval gate blocks when required
 * 3. Hash is generated for integrity
 * 4. Audit event is emitted for every write
 * 5. Scope isolation is maintained
 * 6. Retention policy auto-sets expiration
 * 7. Verify checks integrity after write
 */
import { describe, it, expect } from "vitest";
import { createMemoryStore } from "../memory-store.js";
import { createPolicyEngine } from "@lattice-kernel/policy-engine";
import { createMemoryAuditSink } from "@lattice-kernel/audit";
import type { MemoryWriteInput } from "../types.js";
import {
  PolicyDeniedError,
  ApprovalRequiredError,
} from "@lattice-kernel/schemas";

function makeInput(overrides: Partial<MemoryWriteInput> = {}): MemoryWriteInput {
  return {
    scope: { tenantId: "t1" },
    type: "semantic",
    content: "invariant test content",
    source: "test",
    provenance: { test: true },
    classification: "internal",
    trustLevel: "trusted_user_explicit",
    ...overrides,
  };
}

describe("Memory pipeline invariants (spec 12.3)", () => {
  describe("1. Policy check before write", () => {
    it("denies write when policy denies canRemember", async () => {
      const engine = createPolicyEngine({ defaultDeny: true });
      const audit = createMemoryAuditSink();
      const store = createMemoryStore({ policyEngine: engine, auditSink: audit });

      try {
        await store.write(makeInput());
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(PolicyDeniedError);
        expect((err as PolicyDeniedError).code).toBe("POLICY_DENIED");
      }
      // No item written
      expect(store.count()).toBe(0);
    });

    it("allows write when policy allows canRemember", async () => {
      const engine = createPolicyEngine({ defaultDeny: true });
      engine.addRule({
        id: "allow-remember",
        name: "allow",
        permissions: ["canRemember"],
        effect: "allow",
        priority: 1,
      });
      const audit = createMemoryAuditSink();
      const store = createMemoryStore({ policyEngine: engine, auditSink: audit });

      const item = await store.write(makeInput());
      expect(item.id).toBeTruthy();
    });
  });

  describe("2. Approval gate blocks when required", () => {
    it("throws ApprovalRequiredError when policy requires approval", async () => {
      const engine = createPolicyEngine({ defaultDeny: true });
      engine.addRule({
        id: "approve-remember",
        name: "approval needed",
        permissions: ["canRemember"],
        effect: "require_approval",
        priority: 1,
      });
      const audit = createMemoryAuditSink();
      const store = createMemoryStore({ policyEngine: engine, auditSink: audit });

      try {
        await store.write(makeInput());
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ApprovalRequiredError);
        expect((err as ApprovalRequiredError).code).toBe("APPROVAL_REQUIRED");
      }
      expect(store.count()).toBe(0);
    });
  });

  describe("3. Hash integrity", () => {
    it("every written item has a non-empty hash", async () => {
      const engine = createPolicyEngine({ defaultDeny: false });
      const audit = createMemoryAuditSink();
      const store = createMemoryStore({ policyEngine: engine, auditSink: audit });

      const item = await store.write(makeInput());
      expect(item.hash).toBeTruthy();
      expect(item.hash.length).toBeGreaterThan(0);
    });

    it("hash is verifiable after write", async () => {
      const engine = createPolicyEngine({ defaultDeny: false });
      const audit = createMemoryAuditSink();
      const store = createMemoryStore({ policyEngine: engine, auditSink: audit });

      const item = await store.write(makeInput());
      const result = await store.verify(item.id);
      expect(result.valid).toBe(true);
      expect(result.expectedHash).toBe(result.actualHash);
    });
  });

  describe("4. Audit emission", () => {
    it("emits memory_write audit event for every write", async () => {
      const engine = createPolicyEngine({ defaultDeny: false });
      const audit = createMemoryAuditSink();
      const store = createMemoryStore({ policyEngine: engine, auditSink: audit });

      await store.write(makeInput());
      await store.write(makeInput({ content: "second" }));

      const { events } = await audit.query({ type: "memory_write" });
      expect(events).toHaveLength(2);
    });

    it("audit event references correct scope and trust level", async () => {
      const engine = createPolicyEngine({ defaultDeny: false });
      const audit = createMemoryAuditSink();
      const store = createMemoryStore({ policyEngine: engine, auditSink: audit });

      await store.write(makeInput({
        scope: { tenantId: "acme", appId: "copilot" },
        trustLevel: "trusted_admin",
      }));

      const { events } = await audit.query({ type: "memory_write" });
      const evt = events[0]!;
      expect(evt.trustLevel).toBe("trusted_admin");
      expect((evt.scope as Record<string, unknown>).tenantId).toBe("acme");
    });
  });

  describe("5. Scope isolation", () => {
    it("items only visible within their scope", async () => {
      const engine = createPolicyEngine({ defaultDeny: false });
      const audit = createMemoryAuditSink();
      const store = createMemoryStore({ policyEngine: engine, auditSink: audit });

      await store.write(makeInput({ scope: { tenantId: "a" }, content: "secret A" }));
      await store.write(makeInput({ scope: { tenantId: "b" }, content: "secret B" }));

      const aResults = await store.retrieve("secret", { tenantId: "a" });
      expect(aResults).toHaveLength(1);
      expect(aResults[0]!.content).toBe("secret A");
    });
  });

  describe("6. Retention auto-expiration", () => {
    it("retentionPolicy sets expiresAt automatically", async () => {
      const engine = createPolicyEngine({ defaultDeny: false });
      const audit = createMemoryAuditSink();
      const store = createMemoryStore({ policyEngine: engine, auditSink: audit });

      const item = await store.write(makeInput({ retentionPolicy: "30d" }));
      expect(item.expiresAt).toBeTruthy();

      const expiresMs = new Date(item.expiresAt!).getTime();
      const expectedMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
      expect(Math.abs(expiresMs - expectedMs)).toBeLessThan(1000);
    });
  });

  describe("7. Checkpoint/rollback state safety", () => {
    it("rollback restores exact prior state", async () => {
      const engine = createPolicyEngine({ defaultDeny: false });
      const audit = createMemoryAuditSink();
      const store = createMemoryStore({ policyEngine: engine, auditSink: audit });

      const item1 = await store.write(makeInput({ content: "original" }));
      const cp = await store.checkpoint("safe point");

      await store.write(makeInput({ content: "experimental" }));
      expect(store.count()).toBe(2);

      await store.rollback(cp.checkpointId);
      expect(store.count()).toBe(1);
      expect(await store.get(item1.id)).toBeDefined();
    });

    it("checkpoint integrity is verifiable", async () => {
      const engine = createPolicyEngine({ defaultDeny: false });
      const audit = createMemoryAuditSink();
      const store = createMemoryStore({ policyEngine: engine, auditSink: audit });

      await store.write(makeInput());
      const cp = await store.checkpoint();

      const result = await store.verifyCheckpoint(cp.checkpointId);
      expect(result.valid).toBe(true);
    });
  });
});
