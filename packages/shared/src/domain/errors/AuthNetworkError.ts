/**
 * Error thrown when a network failure occurs during OAuth token exchange,
 * token refresh, or when the browser fails to open.
 *
 * The Sync Engine treats this as a retryable error with backoff.
 */
export class AuthNetworkError extends Error {
  override readonly name = 'AuthNetworkError';
  readonly statusCode?: number;
  readonly cause?: unknown;

  constructor(
    message: string,
    options?: { statusCode?: number; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.statusCode = options?.statusCode;
    this.cause = options?.cause;
  }
}
