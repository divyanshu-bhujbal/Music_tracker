/**
 * Structured output of an AES-256-GCM encryption operation.
 *
 * Represents the three components produced by GCM encryption:
 * - ciphertext: the encrypted database bytes
 * - nonce: 12-byte initialization vector (NIST SP 800-38D recommends 96-bit nonce)
 * - tag: 16-byte GCM authentication tag
 */
export interface EncryptedData {
  /** Encrypted database bytes (variable length, same as plaintext for GCM) */
  ciphertext: Uint8Array;
  /** 12-byte initialization vector / nonce (unique per encryption) */
  nonce: Uint8Array;
  /** 16-byte GCM authentication tag (verifies integrity and authenticity) */
  tag: Uint8Array;
}
