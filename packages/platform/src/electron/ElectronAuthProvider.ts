import { randomBytes, createHash } from 'node:crypto';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { shell } from 'electron';
import { OAuth2Client } from 'google-auth-library';
import type { AuthProvider, AuthTokens, OAuthConfig } from '@collectio/shared';
import { AuthCancelledError, AuthNetworkError } from '@collectio/shared';

// TODO T-04.3: Replace with canonical import from @collectio/shared
// when ElectronStorageProvider (T-04.3) defines it in packages/shared/src/domain/interfaces/
export interface SecureStorageProvider {
  store(key: string, value: string): Promise<void>;
  retrieve(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

const STORAGE_KEY_ACCESS_TOKEN = 'auth_access_token';
const STORAGE_KEY_REFRESH_TOKEN = 'auth_refresh_token';
const STORAGE_KEY_EXPIRES_AT = 'auth_expires_at';

const CODE_VERIFIER_BYTES = 32;
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;

export function base64urlEncode(data: Buffer | Uint8Array): string {
  const base64 = Buffer.from(data).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export class ElectronAuthProvider implements AuthProvider {
  private readonly storage: SecureStorageProvider;
  private readonly config: OAuthConfig;

  constructor(storage: SecureStorageProvider, config: OAuthConfig) {
    this.storage = storage;
    this.config = config;
  }

  async signIn(): Promise<AuthTokens> {
    let codeVerifier: string | null = null;

    try {
      codeVerifier = this.generateCodeVerifier();
      const codeChallenge = this.computeCodeChallenge(codeVerifier);

      const port = await this.findAvailablePort();
      const redirectUri = `http://localhost:${port}`;
      const authUrl = this.buildAuthUrl(codeChallenge, redirectUri);

      let server: Server | null = null;

      const authCode = await new Promise<string>((resolve, reject) => {
        let settled = false;

        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          server?.close();
          reject(new AuthCancelledError('OAuth flow timed out'));
        }, SIGN_IN_TIMEOUT_MS);

        server = createServer((req, res) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);

          try {
            const parsedUrl = new URL(req.url ?? '', redirectUri);
            const code = parsedUrl.searchParams.get('code');

            if (code) {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end('<html><body><h1>Authentication successful</h1><p>You may close this window.</p></body></html>');
              server?.close();
              resolve(code);
            } else {
              const error = parsedUrl.searchParams.get('error');
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end('<html><body><h1>Authentication failed</h1></body></html>');
              server?.close();
              reject(error === 'access_denied'
                ? new AuthCancelledError('User denied access')
                : new AuthCancelledError('No authorization code in redirect'));
            }
          } catch {
            try { res.writeHead(400); res.end(); } catch { /* ignore */ }
            server?.close();
            reject(new AuthCancelledError('Invalid redirect URL'));
          }
        });

        server.on('error', (err) => {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            server?.close();
            reject(new AuthNetworkError('Failed to start local server', { cause: err }));
          }
        });

        server.listen(port, '127.0.0.1', () => {
          shell.openExternal(authUrl).then(
            () => { console.log('Browser opened for OAuth'); },
            () => {
              if (!settled) {
                settled = true;
                clearTimeout(timeout);
                server?.close();
                reject(new AuthNetworkError('Failed to open browser'));
              }
            },
          );
        });
      });

      const oAuth2Client = new OAuth2Client(
        this.config.clientId,
        undefined,
        redirectUri,
      );

      const tokenResponse = await oAuth2Client.getToken({
        code: authCode,
        codeVerifier,
      });
      const tokens = tokenResponse.tokens;

      if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
        throw new AuthNetworkError('Token exchange returned incomplete tokens');
      }

      const result: AuthTokens = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expiry_date,
      };

      await this.storage.store(STORAGE_KEY_ACCESS_TOKEN, result.accessToken);
      await this.storage.store(STORAGE_KEY_REFRESH_TOKEN, result.refreshToken);
      await this.storage.store(STORAGE_KEY_EXPIRES_AT, String(result.expiresAt));

      console.log('Token exchange successful');
      return result;
    } catch (error) {
      if (error instanceof AuthNetworkError || error instanceof AuthCancelledError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Token exchange failed: ${message}`);
      throw new AuthNetworkError('Token exchange failed', { cause: error });
    } finally {
      codeVerifier = null;
    }
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; expiresAt: number }> {
    try {
      const oAuth2Client = new OAuth2Client(
        this.config.clientId,
        undefined,
        this.config.redirectUri,
      );
      oAuth2Client.setCredentials({ refresh_token: refreshToken });

      const response = await oAuth2Client.refreshAccessToken();
      const credentials = response.credentials;

      if (!credentials.access_token || !credentials.expiry_date) {
        throw new AuthNetworkError('Token refresh returned incomplete credentials');
      }

      const accessToken = credentials.access_token;
      const expiresAt = credentials.expiry_date;

      await this.storage.store(STORAGE_KEY_ACCESS_TOKEN, accessToken);
      await this.storage.store(STORAGE_KEY_EXPIRES_AT, String(expiresAt));

      if (credentials.refresh_token) {
        await this.storage.store(STORAGE_KEY_REFRESH_TOKEN, credentials.refresh_token);
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
    const bytes = randomBytes(CODE_VERIFIER_BYTES);
    return base64urlEncode(bytes);
  }

  private computeCodeChallenge(verifier: string): string {
    const hash = createHash('sha256').update(verifier).digest();
    return base64urlEncode(hash);
  }

  private buildAuthUrl(codeChallenge: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: this.config.scopes.join(' '),
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'consent',
      access_type: 'offline',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  private findAvailablePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const srv = createServer();
      srv.listen(0, '127.0.0.1', () => {
        const address = srv.address();
        srv.close(() => {
          if (address && typeof address === 'object') {
            resolve(address.port);
          } else {
            reject(new AuthNetworkError('Could not find available port'));
          }
        });
      });
      srv.on('error', reject);
    });
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
