/**
 * OAuth authentication tokens returned by the sign-in flow.
 */
export interface AuthTokens {
  /** OAuth 2.0 access token (Bearer token for Drive API) */
  accessToken: string;
  /** OAuth 2.0 refresh token (long-lived) */
  refreshToken: string;
  /** Access token expiry as Unix epoch milliseconds */
  expiresAt: number;
}

/**
 * Configuration for the OAuth 2.0 PKCE flow.
 * Injected via constructor — never hardcoded.
 */
export interface OAuthConfig {
  /** Google OAuth 2.0 client ID */
  clientId: string;
  /** Redirect URI for the OAuth flow (e.g., collectio://oauth/callback) */
  redirectUri: string;
  /** OAuth scopes (e.g., ['https://www.googleapis.com/auth/drive.appdata']) */
  scopes: string[];
}

/**
 * Authentication provider interface.
 *
 * Defines the contract between the application (Sync Engine, DI container)
 * and any OAuth implementation. Each platform provides its own implementation:
 * - Electron: ElectronAuthProvider (system browser + custom protocol)
 * - Capacitor: CapacitorAuthProvider (Browser plugin + appUrlOpen)
 *
 * The provider manages Google OAuth 2.0 PKCE flow for Google Drive access.
 * It does NOT handle the master password — that is a separate concern
 * (CryptoProvider.deriveKey).
 */
export interface AuthProvider {
  /**
   * Initiate the OAuth PKCE sign-in flow.
   *
   * Opens the system browser for Google consent. On success, returns
   * AuthTokens. On user cancellation, throws AuthCancelledError.
   * On network failure, throws AuthNetworkError.
   */
  signIn(): Promise<AuthTokens>;

  /**
   * Exchange a refresh token for a new access token.
   *
   * @param refreshToken - The stored refresh token.
   * @returns New access token and expiry time.
   * @throws {AuthNetworkError} If the refresh fails.
   */
  refreshAccessToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; expiresAt: number }>;

  /**
   * Clear stored tokens. Does not revoke tokens remotely (V1 limitation).
   */
  signOut(): Promise<void>;

  /**
   * Retrieve stored OAuth tokens, or null if not authenticated.
   */
  getStoredTokens(): Promise<AuthTokens | null>;
}
