/**
 * Cryptographic operations interface.
 *
 * Defines the two Argon2id key-derivation methods (deriveKey, generateSalt)
 * and two AES-256-GCM encryption methods (encryptDatabase, decryptDatabase).
 *
 * The Electron implementation uses Node.js native crypto and the `argon2` npm
 * package. The Capacitor implementation uses Web Crypto API (SubtleCrypto)
 * and `argon2-wasm`.
 *
 * Both implementations MUST produce byte-identical deriveKey output given the
 * same (password, salt) inputs — cross-platform determinism is mandatory for sync.
 */
export interface CryptoProvider {
  /**
   * Derive a 32-byte AES-256 key from a password and salt using Argon2id.
   *
   * Parameters: 64 MB memory, 3 iterations, 4 parallelism, 32-byte output.
   *
   * @param password - The user's master password. May be empty string.
   * @param salt - A 32-byte salt from generateSalt().
   * @returns A 32-byte Uint8Array containing the derived key.
   * @throws {TypeError} If salt is not exactly 32 bytes.
   */
  deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array>;

  /**
   * Generate a 32-byte cryptographically random salt.
   *
   * Synchronous (no async I/O needed), but returns Uint8Array to match
   * the async interface convention.
   *
   * @returns A 32-byte Uint8Array containing random salt bytes.
   */
  generateSalt(): Uint8Array;

  /**
   * Encrypt a plaintext database byte array with AES-256-GCM.
   *
   * Returns ciphertext + nonce + authentication tag concatenated.
   *
   * @param db - The plaintext database bytes.
   * @param key - A 32-byte AES-256 key from deriveKey().
   * @returns Encrypted bytes (ciphertext + nonce + tag).
   */
  encryptDatabase(db: Uint8Array, key: Uint8Array): Promise<Uint8Array>;

  /**
   * Decrypt an encrypted database byte array with AES-256-GCM.
   *
   * The input must contain ciphertext + nonce + authentication tag
   * as produced by encryptDatabase().
   *
   * @param encrypted - The encrypted bytes (ciphertext + nonce + tag).
   * @param key - A 32-byte AES-256 key from deriveKey().
   * @returns The plaintext database bytes.
   */
  decryptDatabase(encrypted: Uint8Array, key: Uint8Array): Promise<Uint8Array>;
}
