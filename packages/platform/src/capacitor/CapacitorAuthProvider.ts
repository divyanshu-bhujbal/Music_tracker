import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import type { AuthProvider, AuthTokens, OAuthConfig, SecureStorageProvider } from '@collectio/shared';
import { AuthCancelledError, AuthNetworkError } from '@collectio/shared';

const STORAGE_KEY_ACCESS_TOKEN = 'auth_access_token';
const STORAGE_KEY_REFRESH_TOKEN = 'auth_refresh_token';
const STORAGE_KEY_EXPIRES_AT = 'auth_expires_at';

const CODE_VERIFIER_BYTES = 32;
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export function base64urlEncode(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export class CapacitorAuthProvider implements AuthProvider {
  private readonly storage: SecureStorageProvider;
  private readonly config: OAuthConfig;

  constructor(storage: SecureStorageProvider, config: OAuthConfig) {
    this.storage = storage;
    this.config = config;
  }

  async signIn(): Promise<AuthTokens> {
    let codeVerifier: string | null = null;
    let listenerHandle: { remove(): Promise<void> } | null = null;

    try {
      codeVerifier = this.generateCodeVerifier();
      const codeChallenge = await this.computeCodeChallenge(codeVerifier);
      const authUrl = this.buildAuthUrl(codeChallenge);

      const authCode = await new Promise<string>((resolve, reject) => {
        let settled = false;

        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new AuthCancelledError('OAuth flow timed out'));
        }, SIGN_IN_TIMEOUT_MS);

        // Rule 6.3: Register listener BEFORE Browser.open()
        App.addListener('appUrlOpen', (data: { url: string }) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);

          try {
            const parsedUrl = new URL(data.url);
            const code = parsedUrl.searchParams.get('code');

            if (code) {
              resolve(code);
            } else {
              const error = parsedUrl.searchParams.get('error');
              reject(error === 'access_denied'
                ? new AuthCancelledError('User denied access')
                : new AuthCancelledError('No authorization code in redirect'));
            }
          } catch {
            reject(new AuthCancelledError('Invalid redirect URL'));
          }
        }).then((handle) => {
          listenerHandle = handle;
        });

        Browser.open({ url: authUrl }).then(
          () => { console.log('Browser opened for OAuth'); },
          () => {
            if (!settled) {
              settled = true;
              clearTimeout(timeout);
              reject(new AuthNetworkError('Failed to open browser'));
            }
          },
        );
      });

      // Exchange code for tokens via fetch (no google-auth-library — not available in WebView)
      const tokenResponse = await this.exchangeCodeForTokens(authCode, codeVerifier);

      await this.storage.store(STORAGE_KEY_ACCESS_TOKEN, tokenResponse.accessToken);
      await this.storage.store(STORAGE_KEY_REFRESH_TOKEN, tokenResponse.refreshToken);
      await this.storage.store(STORAGE_KEY_EXPIRES_AT, String(tokenResponse.expiresAt));

      console.log('Token exchange successful');
      return tokenResponse;
    } catch (error) {
      if (error instanceof AuthNetworkError || error instanceof AuthCancelledError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Token exchange failed: ${message}`);
      throw new AuthNetworkError('Token exchange failed', { cause: error });
    } finally {
      codeVerifier = null;

      // Remove listener to prevent leaks (handle may be null if listener registration failed)
      const handle = listenerHandle as { remove(): Promise<void> } | null;
      void handle?.remove().catch(() => { /* swallow cleanup errors */ });

      // Close browser tab (best-effort cleanup)
      Browser.close().catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`Failed to close browser: ${msg}`);
      });
    }
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; expiresAt: number }> {
    try {
      const params = new URLSearchParams({
        client_id: this.config.clientId,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      });

      const response = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (!response.ok) {
        let errorBody: string;
        try {
          errorBody = await response.text();
        } catch {
          errorBody = 'Unable to read error response';
        }
        throw new AuthNetworkError(
          `Token refresh failed with status ${response.status}`,
          { statusCode: response.status, cause: errorBody },
        );
      }

      const data = await response.json() as {
        access_token?: string;
        expires_in?: number;
        refresh_token?: string;
      };

      if (!data.access_token || !data.expires_in) {
        throw new AuthNetworkError('Token refresh returned incomplete credentials');
      }

      const accessToken = data.access_token;
      const expiresAt = Date.now() + (data.expires_in * 1000);

      await this.storage.store(STORAGE_KEY_ACCESS_TOKEN, accessToken);
      await this.storage.store(STORAGE_KEY_EXPIRES_AT, String(expiresAt));

      if (data.refresh_token) {
        await this.storage.store(STORAGE_KEY_REFRESH_TOKEN, data.refresh_token);
      }

      console.log('Token refresh successful');
      return { accessToken, expiresAt };
    } catch (error) {
      if (error instanceof AuthNetworkError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Token refresh failed: ${message}`);
      throw new AuthNetworkError('Token refresh failed', { cause: error });
    }
  }

  async signOut(): Promise<void> {
    await this.safeDelete(STORAGE_KEY_ACCESS_TOKEN);
    await this.safeDelete(STORAGE_KEY_REFRESH_TOKEN);
    await this.safeDelete(STORAGE_KEY_EXPIRES_AT);
    console.log('User signed out');
  }

  async getStoredTokens(): Promise<AuthTokens | null> {
    const accessToken = await this.storage.retrieve(STORAGE_KEY_ACCESS_TOKEN);
    const refreshToken = await this.storage.retrieve(STORAGE_KEY_REFRESH_TOKEN);
    const expiresAtStr = await this.storage.retrieve(STORAGE_KEY_EXPIRES_AT);

    if (!accessToken || !refreshToken || !expiresAtStr) {
      return null;
    }

    return {
      accessToken,
      refreshToken,
      expiresAt: Number(expiresAtStr),
    };
  }

  private generateCodeVerifier(): string {
    const bytes = new Uint8Array(CODE_VERIFIER_BYTES);
    crypto.getRandomValues(bytes);
    return base64urlEncode(bytes);
  }

  private async computeCodeChallenge(verifier: string): Promise<string> {
    const verifierBytes = new TextEncoder().encode(verifier);
    const hashBuffer = await crypto.subtle.digest('SHA-256', verifierBytes);
    const hashBytes = new Uint8Array(hashBuffer);
    return base64urlEncode(hashBytes);
  }

  private buildAuthUrl(codeChallenge: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: this.config.scopes.join(' '),
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'consent',
      access_type: 'offline',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  private async exchangeCodeForTokens(
    code: string,
    codeVerifier: string,
  ): Promise<AuthTokens> {
    const params = new URLSearchParams({
      code,
      client_id: this.config.clientId,
      code_verifier: codeVerifier,
      redirect_uri: this.config.redirectUri,
      grant_type: 'authorization_code',
    });

    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      let errorBody: string;
      try {
        errorBody = await response.text();
      } catch {
        errorBody = 'Unable to read error response';
      }
      throw new AuthNetworkError(
        `Token exchange failed with status ${response.status}`,
        { statusCode: response.status, cause: errorBody },
      );
    }

    const data = await response.json() as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };

    if (!data.access_token || !data.refresh_token || !data.expires_in) {
      throw new AuthNetworkError('Token response missing required fields');
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in * 1000),
    };
  }

  private async safeDelete(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('does not exist')) {
        throw error;
      }
    }
  }
}
