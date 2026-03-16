import { describe, it, expect } from "vitest";
import { createNodeCryptoProvider } from "../node-provider.js";
import { randomBytes } from "node:crypto";

describe("NodeCryptoProvider", () => {
  describe("hash", () => {
    it("produces consistent SHA-256 hex digest", async () => {
      const provider = createNodeCryptoProvider();
      const data = new TextEncoder().encode("hello world");

      const hash1 = await provider.hash(data);
      const hash2 = await provider.hash(data);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex = 64 chars
    });

    it("produces different hashes for different inputs", async () => {
      const provider = createNodeCryptoProvider();
      const a = await provider.hash(new TextEncoder().encode("a"));
      const b = await provider.hash(new TextEncoder().encode("b"));
      expect(a).not.toBe(b);
    });
  });

  describe("hashString", () => {
    it("hashes string content", async () => {
      const provider = createNodeCryptoProvider();
      const hash = await provider.hashString("hello world");
      expect(hash).toHaveLength(64);
    });

    it("matches hash of equivalent bytes", async () => {
      const provider = createNodeCryptoProvider();
      const fromString = await provider.hashString("test");
      const fromBytes = await provider.hash(new TextEncoder().encode("test"));
      expect(fromString).toBe(fromBytes);
    });
  });

  describe("encrypt/decrypt", () => {
    it("round-trips data through encrypt then decrypt", async () => {
      const key = randomBytes(32);
      const provider = createNodeCryptoProvider({ encryptionKey: key });
      const plaintext = new TextEncoder().encode(
        "sensitive memory content",
      );

      const ciphertext = await provider.encrypt(plaintext);
      const decrypted = await provider.decrypt(ciphertext);

      expect(new TextDecoder().decode(decrypted)).toBe(
        "sensitive memory content",
      );
    });

    it("produces different ciphertext each time (random IV)", async () => {
      const key = randomBytes(32);
      const provider = createNodeCryptoProvider({ encryptionKey: key });
      const plaintext = new TextEncoder().encode("same input");

      const ct1 = await provider.encrypt(plaintext);
      const ct2 = await provider.encrypt(plaintext);

      // IVs differ, so ciphertext should differ
      expect(Buffer.from(ct1).equals(Buffer.from(ct2))).toBe(false);
    });

    it("fails to decrypt with wrong key", async () => {
      const provider1 = createNodeCryptoProvider({
        encryptionKey: randomBytes(32),
      });
      const provider2 = createNodeCryptoProvider({
        encryptionKey: randomBytes(32),
      });

      const ciphertext = await provider1.encrypt(
        new TextEncoder().encode("secret"),
      );

      await expect(provider2.decrypt(ciphertext)).rejects.toThrow();
    });

    it("fails on truncated ciphertext", async () => {
      const provider = createNodeCryptoProvider();
      const short = new Uint8Array(10);
      await expect(provider.decrypt(short)).rejects.toThrow(
        "Ciphertext too short",
      );
    });

    it("handles empty plaintext", async () => {
      const key = randomBytes(32);
      const provider = createNodeCryptoProvider({ encryptionKey: key });
      const plaintext = new Uint8Array(0);

      const ciphertext = await provider.encrypt(plaintext);
      const decrypted = await provider.decrypt(ciphertext);

      expect(decrypted).toEqual(new Uint8Array(0));
    });

    it("handles large data", async () => {
      const key = randomBytes(32);
      const provider = createNodeCryptoProvider({ encryptionKey: key });
      const plaintext = randomBytes(1024 * 100); // 100KB

      const ciphertext = await provider.encrypt(plaintext);
      const decrypted = await provider.decrypt(ciphertext);

      expect(Buffer.from(decrypted).equals(plaintext)).toBe(true);
    });
  });

  describe("verify", () => {
    it("returns false (placeholder implementation)", async () => {
      const provider = createNodeCryptoProvider();
      const result = await provider.verify(
        new Uint8Array(0),
        "sig",
        "key",
      );
      expect(result).toBe(false);
    });
  });
});
