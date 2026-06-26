# E-04 T-01 — Implement ElectronAuthProvider

**Parent Epic:** E-04: Platform Services
**Type:** Production Implementation (Platform Services Layer — Electron)
**Criticality:** FOUNDATION — the `AuthProvider` interface is the only contract through which the application obtains and manages Google OAuth credentials for Google Drive sync. Without it, the Sync Engine cannot authenticate to cloud storage. `ElectronAuthProvider` is the Electron (Windows) implementation of this contract.

---

## 1. Goal

Implement `ElectronAuthProvider` — the `AuthProvider` interface implementation for the Electron (Windows) platform. This provider executes the Google OAuth 2.0 PKCE flow: generates a `code_verifier`, computes a `code_challenge` via SHA-256, opens the system browser via `electron.shell.openExternal`, receives the auth code via a custom `collectio://` protocol handler registered with `app.setAsDefaultProtocolClient`, exchanges the code for tokens using `google-auth-library`'s OAuth2 client, and delegates token persistence to the injected `SecureStorageProvider`. The provider also handles token refresh and sign-out.

---

## 2. Scope

| In Scope | Rationale |
|---|---|
| `AuthProvider` interface definition in `packages/shared/src/domain/interfaces/` | The contract mandated by 01_ARCHITECTURE.md §4 — must exist before any implementation |
| `ElectronAuthProvider` class in `packages/platform/src/electron/` | Electron-specific PKCE implementation |
| PKCE code_verifier generation (32 random bytes, base64url-encoded) and code_challenge computation (SHA-256 hash of code_verifier, base64url-encoded) | Per T-04.1 requirements and Rule 6.5 security constraint |
| `electron.shell.openExternal(authUrl)` for system browser | Electron-specific API — opens the user's default browser for OAuth consent |
| Custom protocol `collectio://` registration via `app.setAsDefaultProtocolClient` | Receives OAuth redirect back into Electron |
| Auth code extraction from `app.on('open-url')` event URL | Parses `code` query parameter from redirect |
| Token exchange via `google-auth-library`'s `OAuth2Client.getToken(code)` | Uses `google-auth-library@10.7.0` (already installed) |
| Token persistence via injected `SecureStorageProvider` | Delegates to `ElectronStorageProvider` (T-04.3) following Rule 6.5 |
| `refreshAccessToken()` using `OAuth2Client.refreshAccessToken()` | Proactive token refresh — used by `TokenRefresher` (T-04.5) |
| `signOut()` clearing stored tokens | No remote revocation per FR-AUTH cert |
| `getStoredTokens()` retrieving cached credentials | Returns null if not authenticated |
| OAuth configuration injection via constructor options | Client ID, redirect URI, scopes — not hardcoded (Rule 13.1) |
| Error classes: `AuthCancelledError`, `AuthNetworkError` | Distinct error types for cancel vs network failure |
| Barrel re-export from `packages/platform/src/electron/index.ts` | Makes class importable |
| Interface re-export from `packages/shared/src/domain/interfaces/index.ts` and `packages/shared/src/index.ts` | Makes `AuthProvider` type importable via `@collectio/shared` |

---

## 3. Out of Scope

| Out of Scope | Why | Where It Belongs |
|---|---|---|
| `SecureStorageProvider` interface definition | Separate interface — must exist before T-04.1 can store tokens | E-04 T-04.3 |
| `ElectronStorageProvider` implementation | Separate task; T-04.1 depends on it | E-04 T-04.3 |
| `CapacitorAuthProvider` implementation | Separate platform implementation | E-04 T-04.2 |
| `TokenRefresher` (shared proactive refresh) | Consumes `AuthProvider.refreshAccessToken()` | E-04 T-04.5 |
| Dependency injection wiring into `apps/electron/src/di.ts` | DI container setup is a dedicated task | E-04 T-04.8 |
| Context bridge wiring in `preload.ts` | Auth tokens must never be exposed to the renderer directly — interface methods are invoked from main process via IPC, not exposed via contextBridge | E-04 T-04.8 |
| `GoogleDriveProvider` implementation | Separate provider; consumes access token from `AuthProvider` | E-04 (shared) |
| Google Cloud Console OAuth client setup | Developer task — creates "Desktop app" client with loopback redirect OR custom protocol | Developer manual step |
| SHA-1 fingerprint and Android OAuth setup | Capacitor-only concern | E-04 T-04.2 |
| Multiple-account support | Out of scope for V1 per FR-AUTH-10 | Future |
| Password change flow | Out of scope for V1 per MR-01 | Future |

---

## 4. Files To Create

| # | File | Purpose | Responsibility |
|---|------|---------|---------------|
| 1 | `packages/shared/src/domain/interfaces/AuthProvider.ts` | `AuthProvider` interface contract | Defines the 4-method interface mandated by 01_ARCHITECTURE.md §4: `signIn()`, `refreshAccessToken()`, `signOut()`, `getStoredTokens()`. Also defines the `AuthTokens` type and `OAuthConfig` interface for constructor injection. Lives in `packages/shared/src/domain/` — pure TypeScript, zero platform code. |
| 2 | `packages/shared/src/domain/errors/AuthCancelledError.ts` | Error class for user-cancelled OAuth flow | Extends `Error` with `name = 'AuthCancelledError'`. Distinguishes cancellation from failure — the Sync Engine can treat cancellation as "no auth, retry later" vs failure as "alert user." |
| 3 | `packages/shared/src/domain/errors/AuthNetworkError.ts` | Error class for network failures during OAuth | Extends `Error` with `name = 'AuthNetworkError'`. Includes optional `statusCode` and `cause` for diagnostics. |
| 4 | `packages/platform/src/electron/ElectronAuthProvider.ts` | `AuthProvider` Electron implementation | Implements PKCE flow using `electron.shell`, `app` events, and `google-auth-library`. Constructor receives `SecureStorageProvider`, `OAuthConfig`, and optional `NodeCryptoProvider` (for SHA-256). Handles all state transitions in the OAuth flow. |
| 5 | `packages/platform/src/electron/__tests__/ElectronAuthProvider.test.ts` | Unit tests for ElectronAuthProvider | Tests PKCE generation, token exchange mock, storage delegation, error paths. Uses Jest mocks for electron APIs and google-auth-library. |

---

## 5. Files To Modify

| # | File | Change | Reason |
|---|------|--------|--------|
| 1 | `packages/shared/src/domain/interfaces/index.ts` | Add `export type { AuthProvider } from './AuthProvider.js';` and `export type { AuthTokens, OAuthConfig } from './AuthProvider.js';` | Barrel re-export |
| 2 | `packages/shared/src/domain/errors/index.ts` | Add `export { AuthCancelledError } from './AuthCancelledError.js';` and `export { AuthNetworkError } from './AuthNetworkError.js';` | Barrel re-export |
| 3 | `packages/shared/src/index.ts` | Add exports for `AuthProvider`, `AuthTokens`, `OAuthConfig`, `AuthCancelledError`, `AuthNetworkError` | Makes types importable via `@collectio/shared` |
| 4 | `packages/platform/src/electron/index.ts` | Add `export { ElectronAuthProvider } from './ElectronAuthProvider.js';` | Barrel re-export |
| 5 | `apps/electron/src/main.ts` | Add `app.setAsDefaultProtocolClient('collectio')` in `app.on('ready')`; register `app.on('open-url')` handler | Custom protocol registration required for OAuth redirect |

---

## 6. Interfaces

### 6.1 `AuthProvider` (NEW — `packages/shared/src/domain/interfaces/AuthProvider.ts`)

Mandated by 01_ARCHITECTURE.md §4. The contract between the application (Sync Engine, DI container) and any OAuth implementation.

```
interface AuthProvider {
  signIn(): Promise<AuthTokens>
  refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: number }>
  signOut(): Promise<void>
  getStoredTokens(): Promise<AuthTokens | null>
}

interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number     // Unix epoch milliseconds
}

interface OAuthConfig {
  clientId: string
  redirectUri: string
  scopes: string[]      // e.g., ['https://www.googleapis.com/auth/drive.appdata']
}
```

### 6.2 `SecureStorageProvider` (Pre-existing — defined in E-04 T-04.3)

From 01_ARCHITECTURE.md §4. `ElectronAuthProvider` consumes this interface — it must be available before this task can function. The T-04.3 implementation (`ElectronStorageProvider`) is injected.

```
interface SecureStorageProvider {
  store(key: string, value: string): Promise<void>
  retrieve(key: string): Promise<string | null>
  delete(key: string): Promise<void>
  clear(): Promise<void>
}
```

### 6.3 `CryptoProvider` (Pre-existing — E-03 T-03.1)

Already exists in `packages/shared/src/domain/interfaces/CryptoProvider.ts`. Used by `ElectronAuthProvider` only for SHA-256 hashing of the `code_verifier` to produce the `code_challenge`. The `deriveKey()` and `encryptDatabase()`/`decryptDatabase()` methods are not used by this task.

```
interface CryptoProvider {
  deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array>
  generateSalt(): Uint8Array
  encryptDatabase(db: Uint8Array, key: Uint8Array): Promise<EncryptedData>
  decryptDatabase(data: EncryptedData, key: Uint8Array): Promise<Uint8Array>
}
```

### 6.4 `ElectronAuthProvider` Public API

```
class ElectronAuthProvider implements AuthProvider {
  constructor(
    storage: SecureStorageProvider,
    config: OAuthConfig,
  )

  // Initiates the OAuth PKCE flow. Returns AuthTokens on success.
  // Throws AuthCancelledError if user closes the browser without consenting.
  // Throws AuthNetworkError if network fails during token exchange.
  async signIn(): Promise<AuthTokens>

  // Exchanges a refresh token for a new access token.
  // Throws AuthNetworkError on network failure.
  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: number }>

  // Clears stored tokens. Does not revoke tokens remotely (V1 limitation).
  async signOut(): Promise<void>

  // Returns stored tokens or null if not authenticated.
  async getStoredTokens(): Promise<AuthTokens | null>
}
```

---

## 7. Data Flow

### 7.1 PKCE Flow — Full signIn() Sequence

```
1.  CALLER invokes electronAuthProvider.signIn()

2.  GENERATE code_verifier:
    - crypto.randomBytes(32) → 32 random bytes
    - base64url-encode (RFC 4648 §5) → code_verifier string
    - Store code_verifier in memory (NOT in storage per Rule 6.5 / Rule 12.3)

3.  COMPUTE code_challenge:
    - SHA-256 hash of code_verifier bytes
    - base64url-encode → code_challenge string

4.  CONSTRUCT auth URL:
    - https://accounts.google.com/o/oauth2/v2/auth
      ?client_id={config.clientId}
      &redirect_uri={config.redirectUri}
      &response_type=code
      &scope={config.scopes joined by space}
      &code_challenge={code_challenge}
      &code_challenge_method=S256
      &prompt=consent              ← Rule 6.4 (ensures refresh token)
      &access_type=offline

5.  REGISTER open-url handler:
    - app.on('open-url', handler) — receives Electron's open-url event
    - Handler extracts `code` query parameter from URL
    - Resolves a pending Promise with the code

6.  OPEN system browser:
    - electron.shell.openExternal(authUrl)
    - If openExternal fails → throw AuthNetworkError('Failed to open browser')

7.  USER CONSENTS in browser:
    - Google redirects to config.redirectUri (e.g., collectio://oauth/callback)
    - OS routes to Electron app via registered protocol
    - app.on('open-url') fires → extract code

8.  EXCHANGE code for tokens:
    - Create OAuth2Client instance from google-auth-library
    - oauth2Client.getToken(code) → { tokens: { access_token, refresh_token, expiry_date } }
    - If network error → throw AuthNetworkError
    - If Google returns error (invalid_grant, etc.) → throw AuthNetworkError with status

9.  PERSIST tokens:
    - storage.store('auth_access_token', accessToken)
    - storage.store('auth_refresh_token', refreshToken)
    - storage.store('auth_expires_at', String(expiresAt))

10. NULLIFY code_verifier:
    - Set in-memory variable to null (Rule 12.3)

11. REMOVE open-url handler:
    - app.off('open-url', handler)

12. RETURN AuthTokens:
    - { accessToken, refreshToken, expiresAt }
```

### 7.2 Token Refresh Flow

```
1.  CALLER invokes electronAuthProvider.refreshAccessToken(refreshToken)

2.  CREATE OAuth2Client with stored credentials
3.  CALL oauth2Client.refreshAccessToken()
    - If success → extract new { access_token, expiry_date }
    - If failure → throw AuthNetworkError

4.  UPDATE stored access token:
    - storage.store('auth_access_token', newAccessToken)
    - storage.store('auth_expires_at', String(newExpiresAt))
    - DO NOT overwrite refresh token (Google may rotate; if so, update)

5.  RETURN { accessToken, expiresAt }
```

### 7.3 Sign-Out Flow

```
1.  CALLER invokes electronAuthProvider.signOut()

2.  DELETE stored tokens:
    - storage.delete('auth_access_token')
    - storage.delete('auth_refresh_token')
    - storage.delete('auth_expires_at')

3.  DO NOT revoke token remotely (V1 limitation per MR-03)
```

### 7.4 getStoredTokens() Flow

```
1.  CALLER invokes electronAuthProvider.getStoredTokens()

2.  RETRIEVE from storage:
    - accessToken = storage.retrieve('auth_access_token')
    - refreshToken = storage.retrieve('auth_refresh_token')
    - expiresAt = storage.retrieve('auth_expires_at')

3.  IF any is null → return null

4.  RETURN { accessToken, refreshToken, expiresAt: Number(expiresAt) }
```

---

## 8. State Changes

### 8.1 Storage State

| Operation | Keys Affected | Effect |
|---|---|---|
| `signIn()` success | `auth_access_token`, `auth_refresh_token`, `auth_expires_at` | All three keys written to `SecureStorageProvider` |
| `refreshAccessToken()` success | `auth_access_token`, `auth_expires_at` (possibly `auth_refresh_token` if Google rotated) | Access token and expiry updated; refresh token may be updated if Google rotates it |
| `signOut()` | `auth_access_token`, `auth_refresh_token`, `auth_expires_at` | All three keys deleted from `SecureStorageProvider` |
| `getStoredTokens()` | None (read-only) | No mutation |

### 8.2 In-Memory State

| Operation | Variable | Transition |
|---|---|---|
| `signIn()` start | `code_verifier` | `null` → 32 random bytes (base64url) |
| `signIn()` token exchange complete | `code_verifier` | base64url string → `null` (Rule 12.3) |
| `signIn()` user cancels | `code_verifier` | base64url string → `null` (must nullify even on cancel) |

### 8.3 OAuth2Client State

The `google-auth-library` `OAuth2Client` instance is created per-operation (not long-lived). No instance-level state persists across calls.

---

## 9. Database Changes

**None.** `ElectronAuthProvider` stores tokens exclusively via `SecureStorageProvider` (platform secure storage — Electron's `safeStorage`-encrypted `electron-store`, backed by DPAPI). No SQLite tables are modified. This follows the constitution's security model: authentication credentials never enter the SQLite database (NFR-SEC-01, NFR-SEC-02).

---

## 10. Error Handling

### 10.1 Error Types

| Error Class | File | When Thrown | Sync Engine Behavior |
|---|---|---|---|
| `AuthCancelledError` | `packages/shared/src/domain/errors/AuthCancelledError.ts` | User closes browser without consenting OR `app.on('open-url')` handler times out without receiving a code | Retry later; no alert |
| `AuthNetworkError` | `packages/shared/src/domain/errors/AuthNetworkError.ts` | Network drops during token exchange (`google-auth-library` throws), `refreshAccessToken()` fails, `openExternal()` fails | Retry with backoff; warning indicator |
| `TypeError` | _(built-in)_ | `OAuthConfig.clientId` or `OAuthConfig.scopes` is empty/missing | Fail fast; configuration error — app must not start |

### 10.2 Error Boundaries

```
signIn():
  ├─ openExternal() fails → throw AuthNetworkError('Failed to open browser')
  ├─ User closes browser without redirect → throw AuthCancelledError()
  ├─ Token exchange network error → throw AuthNetworkError('Token exchange failed', { cause })
  ├─ Token exchange Google error (invalid_grant) → throw AuthNetworkError('Token exchange rejected')
  └─ storage.store() fails → propagate error (DI misconfiguration)

refreshAccessToken():
  ├─ Network error → throw AuthNetworkError('Token refresh failed', { cause })
  ├─ Google rejects refresh → throw AuthNetworkError('Token refresh rejected')
  └─ storage.store() fails → propagate error

signOut():
  └─ storage.delete() fails with "does not exist" → swallow (idempotent per Rule 7.1)

getStoredTokens():
  └─ storage.retrieve() fails → return null (safe default)
```

### 10.3 code_verifier Nullification Guarantee

`code_verifier` must be nullified in **all** exit paths from `signIn()`:
- Success path: after token exchange + storage persistence
- Cancellation path: when `AuthCancelledError` is thrown
- Failure path: when `AuthNetworkError` is thrown
- Use `try/finally` to guarantee nullification (Rule 12.3)

---

## 11. Logging Requirements

| Event | Level | What To Log | What NOT To Log (Rule 12.2) |
|---|---|---|---|
| `signIn()` started | INFO | `"OAuth sign-in initiated"` | Never log `code_verifier`, `code_challenge`, `authUrl` (contains client_id) |
| Browser opened | DEBUG | `"Browser opened for OAuth"` | Never log the full auth URL |
| Auth code received | INFO | `"Authorization code received"` | Never log the auth `code` value |
| Token exchange completed | INFO | `"Token exchange successful"` | Never log `access_token`, `refresh_token`, `expiry_date` |
| Token exchange failed | ERROR | `"Token exchange failed: {error.message}"` | Never log the raw error if it contains tokens |
| Token refresh completed | INFO | `"Token refresh successful"` | Never log tokens |
| Token refresh failed | ERROR | `"Token refresh failed: {error.message}"` | Never log tokens |
| Sign-out completed | INFO | `"User signed out"` | — |
| Cancelled | INFO | `"OAuth flow cancelled by user"` | — |
| Protocol handler error | WARN | `"Protocol handler error: {error.message}"` | Never log the full redirect URL (contains code) |

All logging uses `console.log` / `console.error`. No external logging library at this stage.

---

## 12. Security Requirements

| # | Requirement | Source | Implementation |
|---|-------------|--------|----------------|
| S-01 | Never store the master password | Rule 12.1, NFR-SEC-01 | `ElectronAuthProvider` does not handle the master password at all — it only manages OAuth tokens |
| S-02 | Never log access_token, refresh_token, code_verifier | Rule 12.2, Rule 6.5 | All logging statements exclude credential values; only status messages logged |
| S-03 | Nullify code_verifier after token exchange | Rule 12.3, Rule 6.5 | `try/finally` block in `signIn()` sets `code_verifier = null` on all exit paths |
| S-04 | Use PKCE (S256) | NFR-SEC-04 | `code_challenge = BASE64URL(SHA-256(code_verifier))` |
| S-05 | No client secret stored | T-04.1 acceptance criteria | PKCE flow does not use a client secret; nothing to store |
| S-06 | Scope limited to `drive.appdata` | NFR-SEC-05 | The `scopes` array in `OAuthConfig` is injected — caller must include only `drive.appdata` scope |
| S-07 | Tokens stored in platform secure storage, not SQLite | NFR-SEC-02 | All tokens persisted via `SecureStorageProvider` (backed by `safeStorage` + DPAPI on Windows) |
| S-08 | `prompt=consent` in auth URL | Rule 6.4 | Ensures refresh token is returned on every authorization |
| S-09 | `access_type=offline` in auth URL | Google OAuth spec | Required to receive a refresh token |
| S-10 | No token exposure to renderer process | Rule 13.4, Rule 15.3 | `ElectronAuthProvider` runs in the main process only; tokens are never exposed through `contextBridge` |

---

## 13. Acceptance Criteria

| # | Criterion | Verification Method |
|---|-----------|-------------------|
| AC-01 | Full OAuth PKCE flow completes on Electron | Manual test: run `signIn()` → browser opens → user consents → tokens returned |
| AC-02 | Access token is usable for Google Drive API calls | Use returned `accessToken` in a `GET https://www.googleapis.com/drive/v3/files` request → 200 OK |
| AC-03 | Refresh token is stored and survives app restart | Call `getStoredTokens()` → kill app → relaunch → call `getStoredTokens()` → same tokens returned |
| AC-04 | Sign out clears all tokens | Call `signOut()` → call `getStoredTokens()` → returns `null` |
| AC-05 | Cancelled flow throws `AuthCancelledError` | Call `signIn()` → close browser without consenting → `AuthCancelledError` thrown |
| AC-06 | Network failure throws `AuthNetworkError` | Disconnect network before token exchange → `AuthNetworkError` thrown |
| AC-07 | No client secret anywhere in source or storage | Grep entire codebase for `client_secret`, `clientSecret`, `CLIENT_SECRET` — zero matches |
| AC-08 | `code_verifier` nullified after all exit paths | Code review: `try/finally` block confirms nullification |
| AC-09 | `prompt=consent` present in auth URL | Code review: inspect auth URL construction |
| AC-10 | `access_type=offline` present in auth URL | Code review: inspect auth URL construction |
| AC-11 | Storage keys use consistent naming convention | Code review: keys are `auth_access_token`, `auth_refresh_token`, `auth_expires_at` |
| AC-12 | `tsc --noEmit` passes with zero errors in all packages | Run `pnpm typecheck` from root |
| AC-13 | `pnpm lint` passes with zero errors | Run `pnpm lint` from root |

---

## 14. Test Cases

### 14.1 Unit Tests (`packages/platform/src/electron/__tests__/ElectronAuthProvider.test.ts`)

Mock all external dependencies: `electron`, `google-auth-library`, `SecureStorageProvider`. No real OAuth server involved.

| # | Test | Input | Expected Result |
|---|------|-------|----------------|
| UT-01 | **PKCE code_verifier generation** | Call internal `generateCodeVerifier()` | Returns string matching `[A-Za-z0-9_-]{43}` (32 raw bytes → 43 base64url chars) |
| UT-02 | **PKCE code_challenge computation** | Call internal `computeCodeChallenge(verifier)` | Returns base64url-encoded SHA-256 — verify against known vector |
| UT-03 | **Auth URL construction** | Call internal `buildAuthUrl(config, codeChallenge)` | URL contains: `client_id`, `redirect_uri`, `scope`, `code_challenge`, `code_challenge_method=S256`, `prompt=consent`, `access_type=offline`, `response_type=code` |
| UT-04 | **signIn() success path** | `secureStorage.store()` resolves, `OAuth2Client.getToken()` returns mock tokens | Returns `AuthTokens` with correct shape; `storage.store()` called 3 times with correct keys |
| UT-05 | **signIn() cancelled** | Browser opened; no `open-url` event fired; timeout expires | Throws `AuthCancelledError`; `code_verifier` nullified |
| UT-06 | **signIn() token exchange network error** | `OAuth2Client.getToken()` rejects with network error | Throws `AuthNetworkError`; `code_verifier` nullified |
| UT-07 | **signIn() token exchange Google error** | `OAuth2Client.getToken()` rejects with `invalid_grant` | Throws `AuthNetworkError` with status info; `code_verifier` nullified |
| UT-08 | **signIn() openExternal fails** | `electron.shell.openExternal()` throws | Throws `AuthNetworkError('Failed to open browser')` |
| UT-09 | **refreshAccessToken() success** | `OAuth2Client.refreshAccessToken()` returns new access token | Returns `{ accessToken, expiresAt }`; `storage.store()` called for access token and expiry |
| UT-10 | **refreshAccessToken() failure** | `OAuth2Client.refreshAccessToken()` rejects | Throws `AuthNetworkError` |
| UT-11 | **signOut() clears tokens** | Tokens stored; call `signOut()` | `storage.delete()` called for all 3 keys |
| UT-12 | **signOut() idempotent — missing keys** | `storage.delete()` throws "does not exist" | Error swallowed (Rule 7.1); no exception thrown |
| UT-13 | **getStoredTokens() returns stored tokens** | `storage.retrieve()` returns values for all 3 keys | Returns `AuthTokens` with correct shape |
| UT-14 | **getStoredTokens() returns null — missing keys** | `storage.retrieve()` returns null for `auth_access_token` | Returns `null` |
| UT-15 | **getStoredTokens() returns null — partial keys** | `storage.retrieve()` returns access token but null refresh token | Returns `null` |

### 14.2 Integration Tests (Manual — per T-04.6)

| # | Test | Environment | Expected Result |
|---|------|------------|----------------|
| IT-01 | Full OAuth flow completes | Real Electron app with Google Cloud Console client | Access token usable for Drive API; refresh token stored |
| IT-02 | Token survival across restart | Kill Electron app, relaunch, call `getStoredTokens()` | Same tokens returned |
| IT-03 | Refresh access token | Call `refreshAccessToken()` with stored refresh token | New access token obtained, different from previous |
| IT-04 | Sign out clears tokens | Call `signOut()`, verify via `getStoredTokens()` | Returns `null` |
| IT-05 | Cancelled consent | Open OAuth, close browser tab | `AuthCancelledError` thrown |
| IT-06 | Verify `drive.appdata` scope | Inspect received token's scope | Scope is `https://www.googleapis.com/auth/drive.appdata` |

---

## 15. Definition Of Done

- [ ] `AuthProvider` interface defined in `packages/shared/src/domain/interfaces/AuthProvider.ts`
- [ ] `AuthTokens` and `OAuthConfig` types defined alongside `AuthProvider`
- [ ] `AuthCancelledError` class defined in `packages/shared/src/domain/errors/AuthCancelledError.ts`
- [ ] `AuthNetworkError` class defined in `packages/shared/src/domain/errors/AuthNetworkError.ts`
- [ ] All new types re-exported from `packages/shared/src/domain/interfaces/index.ts`, `packages/shared/src/domain/errors/index.ts`, and `packages/shared/src/index.ts`
- [ ] `ElectronAuthProvider` class implemented in `packages/platform/src/electron/ElectronAuthProvider.ts`
- [ ] `ElectronAuthProvider` implements `AuthProvider` interface exactly (TypeScript `implements AuthProvider`)
- [ ] Constructor accepts `SecureStorageProvider` and `OAuthConfig` (injected; no hardcoded config)
- [ ] PKCE flow: `code_verifier` generated, `code_challenge` computed via SHA-256, auth URL includes `prompt=consent` + `access_type=offline`
- [ ] `app.setAsDefaultProtocolClient('collectio')` registered in `apps/electron/src/main.ts`
- [ ] `app.on('open-url')` handler registered before `openExternal()` is called
- [ ] Token exchange uses `google-auth-library`'s `OAuth2Client.getToken()`
- [ ] Token persistence delegates to injected `SecureStorageProvider`
- [ ] `signOut()` deletes all 3 storage keys
- [ ] `code_verifier` nullified in `finally` block (all exit paths)
- [ ] All 15 unit tests pass
- [ ] Barrel re-export added to `packages/platform/src/electron/index.ts`
- [ ] `pnpm typecheck` passes with zero errors in all packages
- [ ] `pnpm lint` passes with zero errors
- [ ] No `client_secret` or `clientSecret` anywhere in source or config
- [ ] No hardcoded OAuth client ID — injected via `OAuthConfig`
- [ ] No platform conditionals in shared package (Rule 13.1)
- [ ] No import of `@capacitor/*`, `capacitor-*`, or renderer code in `ElectronAuthProvider.ts`
- [ ] All Electron main-process code uses `fileURLToPath` + `dirname` pattern if path resolution is needed (Rules 15.2, 15.2b)
- [ ] File uses `.ts` extension (no JSX — Rule 11.6)

---

## Appendix A: Storage Key Convention

Per AC-11, `ElectronAuthProvider` uses these keys with `SecureStorageProvider`:

| Key | Value Type | Description |
|-----|-----------|-------------|
| `auth_access_token` | `string` | OAuth 2.0 access token (Bearer token for Drive API) |
| `auth_refresh_token` | `string` | OAuth 2.0 refresh token (long-lived) |
| `auth_expires_at` | `string` | Unix epoch milliseconds as string (e.g., `"1719000000000"`) |

These keys are consumed by `TokenRefresher` (T-04.5) and `GoogleDriveProvider`.

## Appendix B: Dependency Map

```
T-01.5 (Electron app infrastructure) ─── DONE
T-03.1 (NodeCryptoProvider) ──────────── DONE ── SHA-256 for code_challenge
T-04.3 (ElectronStorageProvider) ─────── BLOCKING ── token persistence

T-04.1 (ElectronAuthProvider) ────────── THIS TASK
    │
    ├── BLOCKS ── T-04.5 (TokenRefresher)
    ├── BLOCKS ── T-04.8 (DI Setup)
    └── BLOCKS ── E-09 (Sync Engine)
```

## Appendix C: Platform-Specific Decisions

| Decision | Details |
|---|---|
| **OAuth redirect mechanism** | `app.setAsDefaultProtocolClient('collectio')` registers a custom protocol on Windows. A "Desktop app" client type in Google Cloud Console with `http://localhost` loopback redirect is the alternative — either approach is architecturally valid. The custom protocol approach is preferred because it works without finding a free port. |
| **Google Cloud Console client type** | "Desktop app" type with `http://localhost` OR custom protocol via `collectio://`. AD-03 concluded that Android uses a different client type — this task uses the Electron-specific client. |
| **Token exchange library** | `google-auth-library@10.7.0` (already installed in `packages/platform/package.json`). Handles OAuth2 token exchange, refresh, and credential management. |
| **Browser opening** | `electron.shell.openExternal(authUrl)` — opens the system default browser (Rule 15.3 compatibility: this runs in the main process, not the renderer). |

## Appendix D: Architectural Traceability

| Architecture Requirement | Where Addressed |
|---|---|
| `AuthProvider` interface contract (01_ARCHITECTURE.md §4) | §6.1 — `AuthProvider` interface file |
| Platform-specific code isolated behind interfaces (Rule 13.1) | §4 — `ElectronAuthProvider` in `packages/platform/src/electron/`, interface in `packages/shared/` |
| Domain layer is pure TypeScript (Rule 13.2) | §4 — `AuthProvider.ts` in `packages/shared/src/domain/interfaces/` — no platform imports |
| Renderer never imports platform code (Rule 13.4) | §3 — DI wiring is T-04.8; tokens never exposed via contextBridge |
| PKCE OAuth flow (NFR-SEC-04) | §7.1 — full PKCE sequence |
| No client secret stored (NFR-SEC-04) | §12 S-05 — PKCE removes need for client secret |
| Master password never stored (NFR-SEC-01) | §12 S-01 — ElectronAuthProvider does not handle passwords |
| `prompt=consent` mandatory (Rule 6.4) | §7.1 step 4 |
| Never log tokens (Rule 6.5, Rule 12.2) | §11 |
| Nullify code_verifier (Rule 12.3) | §7.1 step 10, §10.3 |
| `contextIsolation: true` (Rule 15.3) | §3 — auth runs in main process; renderer isolated |
| No `vite-plugin-electron-renderer` (Rule 15.4) | §3 — auth never runs in renderer |
| Electron Node 20.16.0 (Rule 15.2b) | §3 — `google-auth-library@10.7.0` supports Node 18+ |

## Appendix E: Error Class Template

Both `AuthCancelledError` and `AuthNetworkError` must follow the same pattern as existing error classes (`AuthenticationError`, `FormatError`, `VersionError`):

```
export class AuthCancelledError extends Error {
  override readonly name = 'AuthCancelledError';

  constructor(message = 'OAuth flow was cancelled by the user') {
    super(message);
  }
}

export class AuthNetworkError extends Error {
  override readonly name = 'AuthNetworkError';
  readonly statusCode?: number;
  readonly cause?: unknown;

  constructor(message: string, options?: { statusCode?: number; cause?: unknown }) {
    super(message);
    this.statusCode = options?.statusCode;
    this.cause = options?.cause;
  }
}
```
