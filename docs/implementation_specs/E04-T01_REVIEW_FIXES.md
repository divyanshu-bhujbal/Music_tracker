# E04-T01 Review Fixes

## CR-1 (Critical): `app.on('open-url')` is macOS-only — OAuth redirect will not work on Windows

### Root Cause

`app.on('open-url')` is documented by Electron as **macOS only**. On Windows (the target platform), when Google OAuth redirects to `collectio://oauth/callback?code=...`:
- If `app.requestSingleInstanceLock()` is NOT set: a second Electron process spawns with the URL in `process.argv`. The `open-url` event never fires on Windows.
- If `app.requestSingleInstanceLock()` IS set: the `second-instance` event fires on the first instance. `open-url` still never fires.

The `waitForAuthCode()` Promise always times out after 5 minutes and throws `AuthCancelledError`. The OAuth PKCE flow cannot complete.

**AD-03** (06_IMPLEMENTATION_DECISIONS.md) already records the decision that Electron uses a "Desktop app" client type with `http://localhost` loopback redirect. The custom protocol approach was chosen in the task spec but is architecturally invalid for Windows.

### Fix Approach

Switch from custom protocol (`collectio://`) to **loopback HTTP server** approach (`http://localhost:<random_port>`):

1. Start a temporary HTTP server on `http://localhost` with an available random port
2. Construct the auth URL with `redirect_uri=http://localhost:<port>`
3. Open the system browser via `shell.openExternal(authUrl)`
4. When the HTTP server receives the GET callback, extract the `code` query parameter
5. Respond with a "Success" HTML page, resolve the Promise, close the server

This eliminates the need for `app.setAsDefaultProtocolClient`, `app.on('open-url')`, and any Windows-specific protocol handling. It also aligns with AD-03 and Google's documented "Desktop app" OAuth flow.

### Fix: `apps/electron/src/main.ts`

**Remove the `setAsDefaultProtocolClient` call:**

**Current (line 44):**
```ts
app.setAsDefaultProtocolClient('collectio');
```

**Replace with:** (remove the line entirely — no replacement needed)

---

### Fix: `packages/platform/src/electron/ElectronAuthProvider.ts`

**1. Add `http` and `net` imports (top of file):**

After the existing imports, add:
```ts
import { createServer } from 'node:http';
import type { Server } from 'node:http';
```

**2. Replace `waitForAuthCode()` method (lines 170-216) with a loopback-based implementation:**

**Current:**
```ts
private waitForAuthCode(authUrl: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let settled = false;

      const handler = (_event: Electron.Event, url: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        app.off('open-url', handler);

        try {
          const parsedUrl = new URL(url);
          const code = parsedUrl.searchParams.get('code');
          if (code) {
            resolve(code);
          } else {
            reject(new AuthCancelledError('No authorization code in redirect'));
          }
        } catch {
          reject(new AuthCancelledError('Invalid redirect URL'));
        }
      };

      app.on('open-url', handler);

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        app.off('open-url', handler);
        reject(new AuthCancelledError('OAuth flow timed out'));
      }, SIGN_IN_TIMEOUT_MS);

      shell.openExternal(authUrl).then(
        () => {
          console.log('Browser opened for OAuth');
        },
        () => {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            app.off('open-url', handler);
            reject(new AuthNetworkError('Failed to open browser'));
          }
        },
      );
    });
  }
```

**Replace with:**
```ts
private async waitForAuthCode(): Promise<string> {
    const codeVerifier = this.generateCodeVerifier();
    const port = await this.findAvailablePort();
    const redirectUri = `http://localhost:${port}`;
    const codeChallenge = this.computeCodeChallenge(codeVerifier);
    const authUrl = this.buildAuthUrl(codeChallenge, redirectUri);

    return new Promise<string>((resolve, reject) => {
      let settled = false;
      let server: Server | null = null;

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
            if (error === 'access_denied') {
              reject(new AuthCancelledError('User denied access'));
            } else {
              reject(new AuthCancelledError('No authorization code in redirect'));
            }
          }
        } catch {
          try { res.writeHead(400); res.end(); } catch { /* ignore */ }
          server?.close();
          reject(new AuthCancelledError('Invalid redirect URL'));
        }
      });

      server.listen(port, '127.0.0.1', () => {
        shell.openExternal(authUrl).then(
          () => {
            console.log('Browser opened for OAuth');
          },
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

      server.on('error', (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          server?.close();
          reject(new AuthNetworkError('Failed to start local server', { cause: err }));
        }
      });
    });
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
```

**3. Update `signIn()` to use the new method signature:**

After the refactor, `signIn()` no longer needs to call `this.waitForAuthCode(authUrl)` — the method becomes `this.waitForAuthCode()` and handles its own code_verifier generation, port discovery, URL construction, and browser opening. The `buildAuthUrl()` method needs to accept a `redirectUri` parameter.

Update `buildAuthUrl()` signature:
```ts
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
```

Update `signIn()` to use `buildAuthUrl` with the dynamic redirect URI:
```ts
async signIn(): Promise<AuthTokens> {
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.computeCodeChallenge(codeVerifier);

    const port = await this.findAvailablePort();
    const redirectUri = `http://localhost:${port}`;
    const authUrl = this.buildAuthUrl(codeChallenge, redirectUri);

    let server: ReturnType<typeof createServer> | null = null;

    try {
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

      // Token exchange
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
    }
  }
```

**4. Remove unused `app` import:**

Remove `import { app, shell } from 'electron';` → `import { shell } from 'electron';`

---

### Fix: `packages/platform/src/electron/__tests__/ElectronAuthProvider.test.ts`

The tests need to be updated to mock `node:http`'s `createServer` and `Server` instead of `app.on('open-url')`.

**1. Remove the `electron` `app` mock (lines 3-11) and replace the `open-url` handler pattern with an HTTP server mock:**

Replace the electron mock:
```ts
jest.mock('electron', () => ({
  app: {
    on: jest.fn(),
    off: jest.fn(),
  },
  shell: {
    openExternal: jest.fn(),
  },
}));
```

With:
```ts
jest.mock('electron', () => ({
  shell: {
    openExternal: jest.fn(),
  },
}));
```

**2. Add `node:http` mock:**

```ts
let mockServerHandlers: Array<(req: { url?: string }, res: { writeHead: jest.Mock; end: jest.Mock }) => void> = [];
let mockServerError: ((err: Error) => void) | null = null;
let mockServerClose: jest.Mock;
let mockListenCallback: (() => void) | null = null;

jest.mock('node:http', () => {
  mockServerClose = jest.fn().mockImplementation((cb?: () => void) => { if (cb) cb(); return mockServer as any; });
  const mockServer = {
    listen: jest.fn().mockImplementation((_port: number, _host: string, cb: () => void) => {
      mockListenCallback = cb;
      setTimeout(() => cb(), 0);
      return mockServer;
    }),
    close: mockServerClose,
    on: jest.fn().mockImplementation((event: string, handler: (...args: any[]) => void) => {
      if (event === 'error') {
        mockServerError = handler;
      }
      return mockServer;
    }),
  };

  return {
    createServer: jest.fn().mockImplementation((handler: (req: { url?: string }, res: { writeHead: jest.Mock; end: jest.Mock }) => void) => {
      mockServerHandlers.push(handler);
      return mockServer;
    }),
  };
});
```

**3. Update `beforeEach` to reset HTTP mocks:**

```ts
beforeEach(() => {
  jest.clearAllMocks();
  mockServerHandlers = [];
  mockServerError = null;
  mockListenCallback = null;
  storage = createMockStorage();
  provider = new ElectronAuthProvider(storage, DEFAULT_CONFIG);
  mockShell.openExternal.mockResolvedValue(undefined as never);
});
```

**4. Update UT-04 (`signIn()` success path):**

Instead of manually triggering `openUrlHandler`, trigger the HTTP server's request handler:

```ts
it('returns AuthTokens and stores all three keys', async () => {
  // The first createServer() call is for findAvailablePort (port discovery)
  // When its listen callback fires, it closes itself and calls the second createServer()
  // The second createServer() is the auth callback server

  const mockTokens = {
    access_token: 'access-123',
    refresh_token: 'refresh-456',
    expiry_date: 1719000000000,
  };

  const mockGetToken = jest.fn().mockResolvedValue({ tokens: mockTokens });
  (OAuth2Client as unknown as jest.Mock).mockImplementation(() => ({
    getToken: mockGetToken,
    refreshAccessToken: jest.fn(),
    setCredentials: jest.fn(),
  }));

  const signInPromise = provider.signIn();

  // Let the port discovery server spin up and close
  await new Promise<void>((r) => setTimeout(r, 50));

  // Trigger the auth callback server with a code
  const authHandler = mockServerHandlers[mockServerHandlers.length - 1];
  const mockRes = { writeHead: jest.fn(), end: jest.fn() };
  authHandler({ url: '/?code=auth-code-abc' }, mockRes as any);

  const tokens = await signInPromise;

  expect(tokens).toEqual({
    accessToken: 'access-123',
    refreshToken: 'refresh-456',
    expiresAt: 1719000000000,
  });

  expect(storage.store).toHaveBeenCalledTimes(3);
  expect(storage.store).toHaveBeenCalledWith('auth_access_token', 'access-123');
  expect(storage.store).toHaveBeenCalledWith('auth_refresh_token', 'refresh-456');
  expect(storage.store).toHaveBeenCalledWith('auth_expires_at', '1719000000000');

  expect(mockRes.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
  expect(mockRes.end).toHaveBeenCalled();
  expect(mockServerClose).toHaveBeenCalled();
});
```

**5. Update all other `signIn()` tests** to use the HTTP handler pattern instead of `openUrlHandler`, and remove references to `mockApp`/`openUrlHandler`/`app.on`/`app.off`.

**6. Remove `mockApp` and `openUrlHandler` variables** — no longer needed.

**7. Update existing test descriptions** where needed (remove "mockApp" references in type annotations).

---

## MJ-1 (Major): Missing `try/finally` for `code_verifier` nullification

### Root Cause

The task spec (§10.3) and Rule 12.3 require `code_verifier` to be nullified in all exit paths from `signIn()` via `try/finally`. The current implementation:
- Declares `codeVerifier` as `const` — cannot be reassigned
- Places `waitForAuthCode()` outside the `try` block — if it throws, `code_verifier` is never nullified
- Has no `finally` block

### Fix: `packages/platform/src/electron/ElectronAuthProvider.ts`

In `signIn()`, change the variable declaration and wrap the entire flow:

```ts
async signIn(): Promise<AuthTokens> {
    let codeVerifier: string | null = null;

    try {
      codeVerifier = this.generateCodeVerifier();
      const codeChallenge = this.computeCodeChallenge(codeVerifier);
      const authUrl = this.buildAuthUrl(codeChallenge);

      const authCode = await this.waitForAuthCode(authUrl);

      // ... rest of token exchange ...
    } catch (error) {
      // ... existing error handling ...
    } finally {
      codeVerifier = null;
    }
  }
```

Note: After CR-1 is applied and the method is restructured, the `let codeVerifier: string | null = null` declaration and `finally { codeVerifier = null; }` must be retained in the new `signIn()` structure.

---

## MN-1 (Minor): `SecureStorageProvider` interface duplicated locally

### Fix: `packages/platform/src/electron/ElectronAuthProvider.ts`

Add a TODO comment above the local interface definition:

```ts
// TODO T-04.3: Replace with canonical import from @collectio/shared
// when ElectronStorageProvider (T-04.3) defines it in packages/shared/src/domain/interfaces/
export interface SecureStorageProvider {
  store(key: string, value: string): Promise<void>;
  retrieve(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}
```

---

## MN-2 (Minor): `AuthNetworkError` does not declare `cause` property on the class

### Fix: `packages/shared/src/domain/errors/AuthNetworkError.ts`

Add the `cause` property declaration to match the spec template (Appendix E):

```ts
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
```

---

## MN-3 (Minor): `base64urlEncode` duplicated in test file

### Fix: `packages/platform/src/electron/ElectronAuthProvider.ts`

Export `base64urlEncode` from the production module (prepend `export`):

```ts
export function base64urlEncode(data: Buffer | Uint8Array): string {
  const base64 = Buffer.from(data).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
```

### Fix: `packages/platform/src/electron/__tests__/ElectronAuthProvider.test.ts`

Replace the local `base64urlEncode` function with an import:

```ts
import { base64urlEncode } from '../ElectronAuthProvider.js';
```

Remove the local function definition (lines 59-62).

---

## MN-4 (Minor): New error exports not covered by barrel export test

### Fix: `packages/shared/src/domain/errors/__tests__/errors.index.test.ts`

Add test cases for the new error types:

After the existing `it('exports VersionError', ...)` block (line 20), add:

```ts
it('exports AuthCancelledError', () => {
    const err = new AuthCancelledError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AuthCancelledError');
  });

  it('exports AuthNetworkError', () => {
    const err = new AuthNetworkError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AuthNetworkError');
  });
```

Update the import line:
```ts
import {
  AuthenticationError,
  FormatError,
  VersionError,
  AuthCancelledError,
  AuthNetworkError,
} from '../index.js';
```

---

## Verification After All Fixes

```sh
pnpm typecheck
pnpm lint
pnpm --filter @collectio/platform test
pnpm --filter @collectio/shared test
```

### Verification Checklist

- [ ] CR-1: `app.setAsDefaultProtocolClient('collectio')` removed from `main.ts`
- [ ] CR-1: `app` import removed from `ElectronAuthProvider.ts` (only `shell` remains)
- [ ] CR-1: Loopback HTTP server receives OAuth callback on `http://localhost:<port>`
- [ ] CR-1: `findAvailablePort()` returns a valid free port
- [ ] CR-1: All 15 unit tests pass with HTTP server mocks
- [ ] MJ-1: `codeVerifier` declared as `let` with `null` initial value
- [ ] MJ-1: `try/finally` wraps entire `signIn()` flow; `codeVerifier = null` in `finally`
- [ ] MN-1: TODO comment present above `SecureStorageProvider` interface
- [ ] MN-2: `cause` property declared on `AuthNetworkError`
- [ ] MN-3: `base64urlEncode` exported from `ElectronAuthProvider.ts`, imported in test
- [ ] MN-4: `AuthCancelledError` and `AuthNetworkError` tested in `errors.index.test.ts`
- [ ] `pnpm typecheck` passes with zero errors
- [ ] `pnpm lint` passes with zero errors
- [ ] No `client_secret` or `clientSecret` in source
- [ ] No import of `@capacitor/*` in `ElectronAuthProvider.ts`
- [ ] No `import.meta.dirname` or bare `__dirname` in any modified file
