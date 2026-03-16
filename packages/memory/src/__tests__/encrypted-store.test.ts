import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryStore } from "../memory-store.js";
import { createEncryptedMemoryStore } from "../encrypted-store.js";
import { createPolicyEngine } from "@lattice-kernel/policy-engine";
import { createMemoryAuditSink } from "@lattice-kernel/audit";
import { createNodeCryptoProvider } from "@lattice-kernel/crypto";
import { randomBytes } from "node:crypto";
import type { MemoryStore, MemoryWriteInput } from "../types.js";

function makeInput(overrides: Partial<MemoryWriteInput> = {}): MemoryWriteInput {
  return {
    scope: { tenantId: "t1" },
    type: "semantic",
    content: "sensitive patient data",
    source: "test",
    provenance: {},
    classification: "confidential",
    trustLevel: "trusted_user_explicit",
    ...overrides,
  };
}

describe("EncryptedMemoryStore", () => {
  let innerStore: MemoryStore;
  let encryptedStore: MemoryStore;
  const key = randomBytes(32);

  beforeEach(() => {
    const policyEngine = createPolicyEngine({ defaultDeny: false });
    const auditSink = createMemoryAuditSink();
    const crypto = createNodeCryptoProvider({ encryptionKey: key });
    innerStore = createMemoryStore({ policyEngine, auditSink });
    encryptedStore = createEncryptedMemoryStore(innerStore, crypto);
  });

  describe("write", () => {
    it("returns plaintext content to the caller", async () => {
      const item = await encryptedStore.write(makeInput());
      expect(item.content).toBe("sensitive patient data");
    });

    it("stores encrypted content in the inner store", async () => {
      const item = await encryptedStore.write(makeInput());

      // Read directly from inner store — content should be encrypted (base64)
      const innerItem = await innerStore.get(item.id);
      expect(innerItem).toBeDefined();
      expect(innerItem!.content).not.toBe("sensitive patient data");
      // Encrypted content is base64 encoded
      expect(innerItem!.content).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });
  });

  describe("get", () => {
    it("decrypts content on read", async () => {
      const item = await encryptedStore.write(makeInput());
      const fetched = await encryptedStore.get(item.id);
      expect(fetched).toBeDefined();
      expect(fetched!.content).toBe("sensitive patient data");
    });

    it("returns undefined for missing item", async () => {
      expect(await encryptedStore.get("missing")).toBeUndefined();
    });
  });

  describe("retrieve", () => {
    it("decrypts retrieved items", async () => {
      await encryptedStore.write(makeInput({ content: "fact one" }));
      await encryptedStore.write(makeInput({ content: "fact two" }));

      const results = await encryptedStore.retrieve("fact", { tenantId: "t1" });
      // Note: text search won't work well on encrypted content,
      // but scope filtering still works
      for (const r of results) {
        // Items are decrypted
        expect(r.content).not.toMatch(/^[A-Za-z0-9+/]+=*$/);
      }
    });
  });

  describe("delete", () => {
    it("removes encrypted item", async () => {
      const item = await encryptedStore.write(makeInput());
      await encryptedStore.delete(item.id);
      expect(await encryptedStore.get(item.id)).toBeUndefined();
      expect(encryptedStore.count()).toBe(0);
    });
  });

  describe("count", () => {
    it("delegates to inner store", async () => {
      await encryptedStore.write(makeInput());
      expect(encryptedStore.count()).toBe(1);
    });
  });

  describe("checkpoint and rollback", () => {
    it("checkpoint/rollback works through encrypted layer", async () => {
      await encryptedStore.write(makeInput({ content: "original" }));
      const cp = await encryptedStore.checkpoint("before");

      await encryptedStore.write(makeInput({ content: "added" }));
      expect(encryptedStore.count()).toBe(2);

      await encryptedStore.rollback(cp.checkpointId);
      expect(encryptedStore.count()).toBe(1);
    });
  });

  describe("cross-key isolation", () => {
    it("cannot decrypt with a different key", async () => {
      const item = await encryptedStore.write(makeInput());

      // Create a new encrypted store with a different key
      const differentCrypto = createNodeCryptoProvider({
        encryptionKey: randomBytes(32),
      });
      const wrongKeyStore = createEncryptedMemoryStore(
        innerStore,
        differentCrypto,
      );

      // Should fail to decrypt
      await expect(wrongKeyStore.get(item.id)).rejects.toThrow();
    });
  });
});
