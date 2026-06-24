/**
 * Error thrown when the encrypted file's magic bytes do not match "CMDB".
 * Indicates the file is not a Collectio encrypted database — could be
 * random bytes, a different file format, or a corrupted download.
 */
export class FormatError extends Error {
  override readonly name = 'FormatError';

  constructor(message: string) {
    super(message);
  }
}
