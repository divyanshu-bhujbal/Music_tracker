/**
 * Error thrown when the encrypted file's format version byte is unsupported.
 * In V1, only version 0x01 is accepted. This enables forward compatibility —
 * future versions can use different encryption schemes without breaking V1.
 */
export class VersionError extends Error {
  override readonly name = 'VersionError';

  constructor(message: string) {
    super(message);
  }
}
