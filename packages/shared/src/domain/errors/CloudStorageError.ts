/**
 * Error thrown when a cloud storage operation fails.
 *
 * Discriminated by `code` so the sync engine (E-10) can handle
 * specific failure modes: retry on rate limit, abort on auth failure, etc.
 */

export type CloudStorageErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'NOT_FOUND'
  | 'NETWORK'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'UPLOAD_FAILED';

export class CloudStorageError extends Error {
  override readonly name = 'CloudStorageError';
  readonly code: CloudStorageErrorCode;
  readonly statusCode?: number;

  constructor(
    code: CloudStorageErrorCode,
    message: string,
    options?: { statusCode?: number; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.code = code;
    this.statusCode = options?.statusCode;
  }
}
