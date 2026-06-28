import type { AuthProvider, AuthTokens } from '@collectio/shared';
import { AuthNetworkError } from '@collectio/shared';

const REFRESH_THRESHOLD_MS = 300_000; // 5 minutes
const MAX_RETRIES = 5;

export class TokenRefresher {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private expiresAt = 0;
  private _needsReauth = false;
  private backoffCounter = 0;
  private backoffUntil: number | null = null;
  private pendingRefresh: Promise<string | null> | null = null;

  constructor(private readonly authProvider: AuthProvider) {}

  get needsReauth(): boolean {
    return this._needsReauth;
  }

  async getAccessToken(): Promise<string | null> {
    if (this.accessToken === null) {
      return null;
    }

    if (this._needsReauth) {
      return null;
    }

    if (this.expiresAt - Date.now() >= REFRESH_THRESHOLD_MS) {
      return this.accessToken;
    }

    if (this.backoffUntil !== null && Date.now() < this.backoffUntil) {
      return null;
    }

    return this.doRefresh();
  }

  setTokens(tokens: AuthTokens): void {
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    this.expiresAt = tokens.expiresAt;

    if (this._needsReauth) {
      console.info(
        'TokenRefresher: re-authenticated — needsReauth cleared',
      );
    }

    this._needsReauth = false;
    this.backoffCounter = 0;
    this.backoffUntil = null;
    this.pendingRefresh = null;
  }

  /**
   * Force-refresh the access token regardless of expiry.
   *
   * Unlike getAccessToken(), this always calls refreshAccessToken
   * on the AuthProvider — it does not check freshness or backoff.
   * Used by GoogleDriveProvider when it receives an HTTP 401 with
   * a token that may still appear valid.
   */
  async forceRefreshAccessToken(): Promise<string | null> {
    if (this.refreshToken === null) {
      return null;
    }

    try {
      const result =
        await this.authProvider.refreshAccessToken(this.refreshToken);

      this.accessToken = result.accessToken;
      this.expiresAt = result.expiresAt;
      this.backoffCounter = 0;
      this.backoffUntil = null;
      this._needsReauth = false;

      console.debug('TokenRefresher: forced refresh successful');
      return this.accessToken;
    } catch (error) {
      console.warn(
        `TokenRefresher: forced refresh failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      this._needsReauth = true;
      return null;
    }
  }

  clear(): void {
    this.accessToken = null;
    this.refreshToken = null;
    this.expiresAt = 0;
    this._needsReauth = false;
    this.backoffCounter = 0;
    this.backoffUntil = null;
    this.pendingRefresh = null;

    console.debug('TokenRefresher: state cleared');
  }

  private async doRefresh(): Promise<string | null> {
    if (this.pendingRefresh !== null) {
      return this.pendingRefresh;
    }

    if (this.refreshToken === null) {
      return null;
    }

    this.pendingRefresh = this.executeRefresh();

    try {
      return await this.pendingRefresh;
    } finally {
      this.pendingRefresh = null;
    }
  }

  private async executeRefresh(): Promise<string | null> {
    try {
      const result =
        await this.authProvider.refreshAccessToken(this.refreshToken!);

      this.accessToken = result.accessToken;
      this.expiresAt = result.expiresAt;
      this.backoffCounter = 0;
      this.backoffUntil = null;
      this._needsReauth = false;

      console.debug('TokenRefresher: refresh successful');

      return this.accessToken;
    } catch (error) {
      if (error instanceof AuthNetworkError) {
        this.backoffCounter++;
        console.warn(
          `TokenRefresher: refresh failed (attempt ${this.backoffCounter}/${MAX_RETRIES}): ${error.message}`,
        );

        if (this.backoffCounter >= MAX_RETRIES) {
          this._needsReauth = true;
          console.warn(
            'TokenRefresher: token refresh permanently failed — needsReauth set',
          );
          return null;
        }

        const delay = 1000 * Math.pow(2, this.backoffCounter - 1);
        this.backoffUntil = Date.now() + delay;
        return null;
      }

      throw error;
    }
  }
}
