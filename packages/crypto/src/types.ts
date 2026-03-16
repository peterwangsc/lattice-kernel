export interface CryptoProvider {
  encrypt(plaintext: Uint8Array): Promise<Uint8Array>;
  decrypt(ciphertext: Uint8Array): Promise<Uint8Array>;
  hash(data: Uint8Array): Promise<string>;
  hashString(data: string): Promise<string>;
  verify(data: Uint8Array, signature: string, publicKey: string): Promise<boolean>;
}
