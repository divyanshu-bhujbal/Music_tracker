/**
 * Error thrown when the user closes the browser without completing
 * the OAuth consent flow, or when the open-url handler times out
 * without receiving an authorization code.
 *
 * The Sync Engine treats this as "no auth, retry later" — no alert
 * is shown to the user.
 */
export class AuthCancelledError extends Error {
  override readonly name = 'AuthCancelledError';

  constructor(message = 'OAuth flow was cancelled by the user') {
    super(message);
  }
}
