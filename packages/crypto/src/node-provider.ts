import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import type { CryptoProvider } from "./types.js";

const AES_ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export interface NodeCryptoProviderConfig {
  /** 32-byte encryption key. If not provided, a random key is generated (ephemeral). */
  encryptionKey?: Buffer;
}

export function createNodeCryptoProvider(
  config: NodeCryptoProviderConfig = {},
): CryptoProvider {
  const key = config.encryptionKey ?? randomBytes(32);

  return {
    async encrypt(plaintext: Uint8Array): Promise<Uint8Array> {
      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv(AES_ALGORITHM, key, iv);

      const encrypted = Buffer.concat([
        cipher.update(plaintext),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      // Layout: [iv (12)] [authTag (16)] [ciphertext (...)]
      const result = new Uint8Array(
        IV_LENGTH + AUTH_TAG_LENGTH + encrypted.length,
      );
      result.set(iv, 0);
      result.set(authTag, IV_LENGTH);
      result.set(encrypted, IV_LENGTH + AUTH_TAG_LENGTH);
      return result;
    },

    async decrypt(ciphertext: Uint8Array): Promise<Uint8Array> {
      if (ciphertext.length < IV_LENGTH + AUTH_TAG_LENGTH) {
        throw new Error("Ciphertext too short");
      }

      const iv = ciphertext.slice(0, IV_LENGTH);
      const authTag = ciphertext.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
      const encrypted = ciphertext.slice(IV_LENGTH + AUTH_TAG_LENGTH);

      const decipher = createDecipheriv(AES_ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);
      return new Uint8Array(decrypted);
    },

    async hash(data: Uint8Array): Promise<string> {
      return createHash("sha256").update(data).digest("hex");
    },

    async hashString(data: string): Promise<string> {
      return createHash("sha256").update(data, "utf8").digest("hex");
    },

    async verify(
      _data: Uint8Array,
      _signature: string,
      _publicKey: string,
    ): Promise<boolean> {
      // Signature verification will be implemented when we add
      // model signing support. Placeholder returns false (safe default).
      return false;
    },
  };
}
