/**
 * Error thrown when AES-256-GCM decryption fails due to authentication tag
 * mismatch. This indicates the wrong key was used or the ciphertext was tampered
 * with.
 *
 * Distinct from DatabaseError — this is a crypto-layer error, not a database error.
 */
export class AuthenticationError extends Error {
  override readonly name = 'AuthenticationError';

  constructor(message: string) {
    super(message);
  }
}
