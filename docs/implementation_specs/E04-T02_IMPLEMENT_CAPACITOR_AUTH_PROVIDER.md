# E-04 T-02 — Implement CapacitorAuthProvider

**Parent Epic:** E-04: Platform Services
**Type:** Production Implementation (Platform Services Layer — Capacitor)
**Criticality:** FOUNDATION — the `AuthProvider` interface is the only contract through which the application obtains and manages Google OAuth credentials for Google Drive sync. Without it, the Sync Engine cannot authenticate to cloud storage. `CapacitorAuthProvider` is the Capacitor (Android) implementation of this contract.

---

## 1. Goal

Implement `CapacitorAuthProvider` — the `AuthProvider` interface implementation for the Capacitor (Android) platform. This provider executes the Google OAuth 2.0 PKCE flow: generates a `code_verifier` via `crypto.getRandomValues`, computes a `code_challenge` via `crypto.subtle.digest('SHA-256')`, opens the system browser via `@capacitor/browser`'s `Browser.open`, receives the auth code via `@capacitor/app`'s `App.addListener('appUrlOpen')`, exchanges the code for tokens via `fetch` to `https://oauth2.googleapis.com/token`, and delegates token persistence to the injected `SecureStorageProvider`. The provider also handles token refresh (via `fetch`) and sign-out.

---

## 2. Scope

| In Scope | Rationale |
|---|---|
| `CapacitorAuthProvider` class in `packages/platform/src/capacitor/` | Capacitor-specific PKCE implementation |
| PKCE code_verifier generation via `crypto.getRandomValues` + `base64urlEncode` | Web Crypto API; no `node:crypto` — must not import any Node.js API |
| PKCE code_challenge computation via `crypto.subtle.digest('SHA-256')` + `base64urlEncode` | Web Crypto API — cross-platform parity with Electron's SHA-256 output |
| System browser launch via `@capacitor/browser`'s `Browser.open({ url })` | Per spike validation (T-00b.5) — opens Android system browser |
| Auth code reception via `@capacitor/app`'s `App.addListener('appUrlOpen')` | Receives OAuth redirect `com.collectio.app://?code=...` |
| Listener registered BEFORE `Browser.open()` | Rule 6.3 race condition prevention |
| Token exchange via `fetch` to `https://oauth2.googleapis.com/token` | No `google-auth-library` — that is a Node.js package unavailable in Capacitor WebView |
| Token persistence via injected `SecureStorageProvider` | Delegates to `CapacitorStorageProvider` (T-04.4); same interface contract as Electron |
| `refreshAccessToken()` via `fetch` to token endpoint with `grant_type=refresh_token` | Proactive token refresh — used by `TokenRefresher` (T-04.5) |
| `signOut()` clearing stored tokens | No remote revocation per V1 limitation |
| `getStoredTokens()` retrieving cached credentials | Returns null if not authenticated |
| OAuth configuration injection via constructor options | Client ID, redirect URI, scopes — injected, not hardcoded (Rule 13.1) |
| PKCE helper functions: `generateCodeVerifier`, `computeCodeChallenge`, `buildAuthUrl` | Shared logic pattern from ElectronAuthProvider; implemented with Web APIs |
| Error handling: `AuthCancelledError`, `AuthNetworkError` | Same error types as ElectronAuthProvider |
| Barrel re-export from `packages/platform/src/capacitor/index.ts` | Makes class importable |
| Browser close after redirect received | `Browser.close()` cleanup per T-00b.5 findings |

---

## 3. Out of Scope

| Out of Scope | Why | Where It Belongs |
|---|---|---|
| `SecureStorageProvider` interface canonicalization | Currently defined locally in `ElectronAuthProvider.ts`; CapacitorAuthProvider duplicates it with same TODO comment until T-04.3/T-04.4 | E-04 T-04.3 |
| `CapacitorStorageProvider` implementation | Separate task; T-04.2 depends on it only via constructor injection — the storage is provided, not created | E-04 T-04.4 |
| `ElectronAuthProvider` modifications | Separate platform; no changes needed | E-04 T-04.1 |
| `TokenRefresher` (shared proactive refresh) | Consumes `AuthProvider.refreshAccessToken()` | E-04 T-04.5 |
| Dependency injection wiring into `apps/capacitor/src/di.ts` | DI container setup is a dedicated task | E-04 T-04.8 |
| `GoogleDriveProvider` implementation | Separate provider; consumes access token from `AuthProvider` | E-09 |
| Google Cloud Console "Android" OAuth client setup | Developer task — creates "Android" client type with package name `com.collectio.app` and SHA-1 fingerprint | Developer manual step (see RC-06) |
| SHA-256 cross-platform determinism verification | The algorithm is SHA-256 + base64url — a well-specified algorithm; validation test is included, formal cross-platform test suite is in E-03 | AR-CROSS infrastructure from spike |
| `Browser.close()` for cancelled flows | Browser cleanup on cancellation handled by `appUrlOpen` error path | This task |
| Multiple-account support | Out of scope for V1 per FR-AUTH-10 | Future |
| Password change flow | Out of scope for V1 per MR-01 | Future |

---

## 4. Files To Create

| # | File | Purpose | Responsibility |
|---|---|---|---|
| 1 | `packages/platform/src/capacitor/CapacitorAuthProvider.ts` | `AuthProvider` Capacitor implementation | Implements PKCE flow using `@capacitor/browser`, `@capacitor/app`, and `fetch`. Constructor receives `SecureStorageProvider` and `OAuthConfig`. Uses Web Crypto API for all cryptographic operations. Handles OAuth lifecycle: sign-in, token refresh, sign-out, token retrieval. |
| 2 | `packages/platform/src/capacitor/__tests__/CapacitorAuthProvider.test.ts` | Unit tests for CapacitorAuthProvider | Tests PKCE generation, `appUrlOpen` event handling, token exchange mock, storage delegation, error paths. Uses Jest mocks for `@capacitor/browser`, `@capacitor/app`, `fetch`, and `SecureStorageProvider`. |

---

## 5. Files To Modify

| # | File | Change | Reason |
|---|---|---|---|
| 1 | `packages/platform/src/capacitor/index.ts` | Add `export { CapacitorAuthProvider } from './CapacitorAuthProvider.js';` | Barrel re-export for platform package consumers |

---

## 6. Interfaces

### 6.1 `AuthProvider` (Pre-existing — `packages/shared/src/domain/interfaces/AuthProvider.ts`)

The contract defined in 01_ARCHITECTURE.md §4. `CapacitorAuthProvider` must implement all 4 methods identically to `ElectronAuthProvider` — only the internal mechanics differ.

```
interface AuthProvider {
  signIn(): Promise<AuthTokens>
  refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: number }>
  signOut(): Promise<void>
  getStoredTokens(): Promise<AuthTokens | null>
}
```

### 6.2 `AuthTokens` and `OAuthConfig` (Pre-existing — same file)

```
interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number     // Unix epoch milliseconds
}

interface OAuthConfig {
  clientId: string
  redirectUri: string    // "com.collectio.app://" for Android (Rule 6.2)
  scopes: string[]       // e.g., ['https://www.googleapis.com/auth/drive.appdata']
}
```

### 6.3 `SecureStorageProvider` (Pre-existing — duplicated locally until T-04.3/T-04.4 canonicalize)

Same local interface definition as `ElectronAuthProvider.ts` with identical TODO comment. The interface is duplicated, not imported, to avoid a spurious dependency on the electron platform package.

```
interface SecureStorageProvider {
  store(key: string, value: string): Promise<void>
  retrieve(key: string): Promise<string | null>
  delete(key: string): Promise<void>
  clear(): Promise<void>
}
```

### 6.4 `CapacitorAuthProvider` Public API

```
class CapacitorAuthProvider implements AuthProvider {
  constructor(
    storage: SecureStorageProvider,
    config: OAuthConfig,
  )

  // Initiates the OAuth PKCE flow. Opens system browser via @capacitor/browser.
  // Receives redirect via @capacitor/app addListener('appUrlOpen').
  // Exchanges code for tokens via fetch to Google's token endpoint.
  // Throws AuthCancelledError if user closes browser without consenting.
  // Throws AuthNetworkError if network fails during token exchange.
  async signIn(): Promise<AuthTokens>

  // Exchanges a refresh token for a new access token via fetch.
  // Throws AuthNetworkError on network failure.
  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: number }>

  // Clears stored tokens. Does not revoke tokens remotely (V1 limitation).
  async signOut(): Promise<void>

  // Returns stored tokens or null if not authenticated.
  async getStoredTokens(): Promise<AuthTokens | null>
}
```

### 6.5 Exported Helper Functions

```
// Base64url encoding (RFC 4648 §5) — required for PKCE.
// Uses platform-appropriate APIs: TextEncoder instead of Buffer.
function base64urlEncode(data: Uint8Array): string

// Not exported by default, but must be importable by tests.
```

---

## 7. Data Flow

### 7.1 PKCE Flow — Full signIn() Sequence

```
1.  CALLER invokes capacitorAuthProvider.signIn()

2.  GENERATE code_verifier:
    - crypto.getRandomValues(new Uint8Array(32)) → 32 random bytes
    - base64url-encode → code_verifier string
    - Declare as `let codeVerifier: string | null` (must be reassignable for nullification)
    - Store in memory ONLY (Rule 6.5, Rule 12.3)

3.  COMPUTE code_challenge:
    - new TextEncoder().encode(code_verifier) → UTF-8 bytes
    - crypto.subtle.digest('SHA-256', verifierBytes) → 32-byte hash
    - new Uint8Array(hashBuffer) + base64url-encode → code_challenge string

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

5.  REGISTER appUrlOpen listener FIRST (Rule 6.3):
    - App.addListener('appUrlOpen', handler)
    - Handler MUST be registered BEFORE Browser.open() — race condition prevention
    - Handler extracts `code` query parameter from incoming URL
    - Resolves a pending Promise with the code
    - If error param present ('access_denied') → reject AuthCancelledError

6.  OPEN system browser:
    - Browser.open({ url: authUrl })
    - If Browser.open fails → throw AuthNetworkError

7.  USER CONSENTS in browser:
    - Google redirects to config.redirectUri (com.collectio.app://?code=...)
    - Android intent system routes to Capacitor app via AndroidManifest intent filter (RC-04)
    - App.addListener('appUrlOpen', (data) => ...) fires with `data.url`
    - Extract code from query parameters

8.  CLOSE browser:
    - Browser.close() — clean up the browser tab

9.  EXCHANGE code for tokens:
    - POST https://oauth2.googleapis.com/token
      Headers: Content-Type: application/x-www-form-urlencoded
      Body (URLSearchParams):
        code={code}
        client_id={config.clientId}
        code_verifier={codeVerifier}
        redirect_uri={config.redirectUri}
        grant_type=authorization_code
    - If network error → throw AuthNetworkError
    - If Google returns error (invalid_grant, etc.) → throw AuthNetworkError
    - Parse response JSON → { access_token, refresh_token, expires_in }
    - Compute expiresAt = Date.now() + (expires_in * 1000)
    - Note: `client_secret` is NEVER included (per acceptance criteria)

10. PERSIST tokens:
    - storage.store('auth_access_token', accessToken)
    - storage.store('auth_refresh_token', refreshToken)
    - storage.store('auth_expires_at', String(expiresAt))

11. NULLIFY code_verifier (Rule 12.3):
    - FINALLY block (executes on all paths: success, cancel, failure)
    - Set `codeVerifier = null`

12. REMOVE appUrlOpen listener:
    - Remove the listener in finally to prevent leaks

13. RETURN AuthTokens:
    - { accessToken, refreshToken, expiresAt }
```

### 7.2 Token Refresh Flow

```
1.  CALLER invokes capacitorAuthProvider.refreshAccessToken(refreshToken)

2.  POST to Google token endpoint:
    - POST https://oauth2.googleapis.com/token
      Headers: Content-Type: application/x-www-form-urlencoded
      Body (URLSearchParams):
        client_id={config.clientId}
        refresh_token={refreshToken}
        grant_type=refresh_token
    - Note: `client_secret` is NEVER included
    - Note: `redirect_uri` is NOT required for refresh_token grant type

3.  PARSE response:
    - If success → { access_token, expires_in } (optionally { refresh_token } if rotated)
    - If HTTP status !2xx → parse error JSON → throw AuthNetworkError

4.  COMPUTE expiresAt:
    - expiresAt = Date.now() + (expires_in * 1000)

5.  UPDATE stored tokens:
    - storage.store('auth_access_token', newAccessToken)
    - storage.store('auth_expires_at', String(expiresAt))
    - If response includes new refresh_token → storage.store('auth_refresh_token', newRefreshToken)

6.  RETURN { accessToken, expiresAt }
```

### 7.3 Sign-Out Flow

```
1.  CALLER invokes capacitorAuthProvider.signOut()

2.  DELETE stored tokens:
    - storage.delete('auth_access_token')
    - storage.delete('auth_refresh_token')
    - storage.delete('auth_expires_at')
    - Use safeDelete pattern: wrap each in try/catch; swallow "does not exist" errors
      (Rule 7.1 — idempotent delete for Android Keystore)

3.  DO NOT revoke token remotely (V1 limitation per MR-03)
```

### 7.4 getStoredTokens() Flow

```
1.  CALLER invokes capacitorAuthProvider.getStoredTokens()

2.  RETRIEVE from storage:
    - accessToken = storage.retrieve('auth_access_token')
    - refreshToken = storage.retrieve('auth_refresh_token')
    - expiresAtStr = storage.retrieve('auth_expires_at')

3.  IF any is null → return null

4.  RETURN { accessToken, refreshToken, expiresAt: Number(expiresAtStr) }
```

---

## 8. State Changes

### 8.1 Storage State

| Operation | Keys Affected | Effect |
|---|---|---|
| `signIn()` success | `auth_access_token`, `auth_refresh_token`, `auth_expires_at` | All three keys written to `SecureStorageProvider` |
| `refreshAccessToken()` success | `auth_access_token`, `auth_expires_at` (possibly `auth_refresh_token` if Google rotated) | Access token and expiry updated; refresh token may be rotated |
| `signOut()` | `auth_access_token`, `auth_refresh_token`, `auth_expires_at` | All three keys deleted via idempotent delete (Rule 7.1) |
| `getStoredTokens()` | None (read-only) | No mutation |

### 8.2 In-Memory State

| Operation | Variable | Transition |
|---|---|---|
| `signIn()` start | `codeVerifier` | `null` → 32 random bytes (base64url string) |
| `signIn()` finally block | `codeVerifier` | base64url string → `null` (Rule 12.3 — all exit paths) |
| `signIn()` (any exit) | `appUrlOpen` listener | Registered → Removed in `finally` |

### 8.3 Browser State

| Operation | Browser Tab | Capability |
|---|---|---|
| `signIn()` — browser opens | System browser shows Google consent | `Browser.open()` |
| `signIn()` — redirect received | Browser tab closed | `Browser.close()` |
| `signIn()` — user cancels in browser | Browser tab closed | `Browser.close()` in error path |
| `signIn()` — timeout | Browser tab closed | `Browser.close()` in timeout handler |

---

## 9. Database Changes

**None.** `CapacitorAuthProvider` stores tokens exclusively via `SecureStorageProvider` (backed by Android Keystore via `capacitor-secure-storage-plugin`). No SQLite tables are modified. This follows the constitution's security model: authentication credentials never enter the SQLite database (NFR-SEC-01, NFR-SEC-02).

---

## 10. Error Handling

### 10.1 Error Classes (Pre-existing)

| Error Class | File | When Thrown |
|---|---|---|
| `AuthCancelledError` | `shared/src/domain/errors/AuthCancelledError.ts` | User closes browser without consenting; timeout waiting for redirect; error param = `access_denied` in redirect |
| `AuthNetworkError` | `shared/src/domain/errors/AuthNetworkError.ts` | Browser fails to open; `fetch` to token endpoint fails (network error, non-2xx); token response incomplete |

### 10.2 Error Scenarios

| Scenario | Error Thrown | Handling |
|---|---|---|
| `Browser.open()` rejects | `AuthNetworkError` | Wrap in try/catch; throw with message "Failed to open browser" |
| OAuth flow times out (5 minutes) | `AuthCancelledError` | `setTimeout(5 * 60 * 1000)` fires; clean up listener and browser |
| User denies consent (error=access_denied in redirect) | `AuthCancelledError` | Parse `error` param from redirect URL |
| Redirect URL has no `code` and no `error` param | `AuthCancelledError` | Malformed redirect — reject with "No authorization code in redirect" |
| `fetch` to token endpoint throws (network offline) | `AuthNetworkError` | Wrap in try/catch; include original error as `cause` |
| Token endpoint returns non-2xx status | `AuthNetworkError` | Parse error response body; include status code |
| Token response missing required fields | `AuthNetworkError` | Validate `access_token`, `refresh_token`, `expires_in` presence |
| `Browser.close()` fails | **Swallowed** | Log warning; do not propagate — cleanup failure must not crash signIn() |
| Storage operations fail | **Propagated** | Do not catch; let caller handle |

### 10.3 Cleanup Guarantees

- `codeVerifier` is nullified in `finally` block — runs on **all** exit paths (success, cancel, network failure, timeout)
- `appUrlOpen` listener is removed in `finally` block — prevents memory leak
- `Browser.close()` is called in `finally` block — prevents orphaned browser tab
- `safeDelete` wraps storage.delete() in try/catch per Rule 7.1

---

## 11. Logging Requirements

| Event | Level | Message | Rationale |
|---|---|---|---|
| Browser opened for OAuth | `console.log` | `"Browser opened for OAuth"` | Diagnostics — confirms flow started |
| Token exchange successful | `console.log` | `"Token exchange successful"` | Confirms flow completed |
| Token exchange failed | `console.error` | `"Token exchange failed: {message}"` | Includes error message; NOT the tokens (Rule 12.2) |
| Token refresh successful | `console.log` | `"Token refresh successful"` | Confirms background refresh |
| Token refresh failed | `console.error` | `"Token refresh failed: {message}"` | Includes error message only |
| User signed out | `console.log` | `"User signed out"` | Diagnostics |
| Browser close warning | `console.warn` | `"Failed to close browser: {message}"` | Non-critical cleanup failure |

**Prohibited from logging:** `access_token`, `refresh_token`, `code_verifier`, `code` (authorization code), derived AES keys, master password (Rule 12.2).

---

## 12. Security Requirements

| # | Requirement | Source | How Enforced |
|---|---|---|---|
| 1 | No `client_secret` in production code | T-04.2 acceptance criteria, FR-AUTH-09 | Token exchange body does not include `client_secret` field; grep enforcement |
| 2 | `code_verifier` nullified after token exchange | Rule 12.3, MJ-1 | Declared as `let`; set to `null` in `finally` block |
| 3 | Never log raw OAuth tokens | Rule 6.5, Rule 12.2 | Log statements only include success/failure messages; grep enforcement |
| 4 | No `client_secret` stored in secure storage | T-04.2 acceptance criteria | Only `auth_access_token`, `auth_refresh_token`, `auth_expires_at` stored |
| 5 | `code_verifier` never persisted | Rule 6.5 | Only stored in `let` variable scoped to `signIn()`; removed in `finally` |
| 6 | Tokens stored via Android Keystore | NFR-SEC-02, PK-03 | Delegated to `SecureStorageProvider` backed by `capacitor-secure-storage-plugin` |
| 7 | `prompt=consent` in auth URL | Rule 6.4 | Hardcoded in `buildAuthUrl()` as `prompt: 'consent'` |
| 8 | `access_type=offline` in auth URL | Ensures refresh token issuance | Hardcoded in `buildAuthUrl()` as `access_type: 'offline'` |
| 9 | `redirect_uri` uses package name scheme | Rule 6.2 | `config.redirectUri` is `com.collectio.app://` — injected via constructor |
| 10 | Platform isolation — no Capacitor imports in shared | Rule 13.4 | CapacitorAuthProvider lives in `packages/platform/src/capacitor/` — zero cross-contamination |

---

## 13. Acceptance Criteria

| # | Criterion | Verification |
|---|---|---|
| AC-01 | Full OAuth PKCE flow completes on Capacitor | Manual test on physical Android device or emulator with test Google account |
| AC-02 | Access token is usable for Drive API calls | Use token to call `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder` — returns 200 |
| AC-03 | Refresh token is stored and survives app restart | Sign in → kill app → relaunch → `getStoredTokens()` returns non-null |
| AC-04 | `signOut()` clears all stored tokens | Sign in → sign out → `getStoredTokens()` returns null |
| AC-05 | Cancelled flow throws `AuthCancelledError` | Start sign in → close browser without consenting → promise rejects with `AuthCancelledError` |
| AC-06 | Network failure throws `AuthNetworkError` | Start sign in → disable network → token exchange fails → promise rejects with `AuthNetworkError` |
| AC-07 | No `client_secret` in source code | `grep client_secret packages/platform/src/capacitor/CapacitorAuthProvider.ts` returns zero matches |
| AC-08 | `code_verifier` nullified in all exit paths | Review `finally` block covers all Promise resolution paths; code review |
| AC-09 | `appUrlOpen` listener registered BEFORE `Browser.open()` | Code order: listener registration then browser open (Rule 6.3) |
| AC-10 | `prompt=consent` present in auth URL | Inspect `buildAuthUrl()` output; contains `prompt=consent` |
| AC-11 | TypeScript compiles clean | `pnpm --filter @collectio/platform tsc --noEmit` returns zero errors |
| AC-12 | All unit tests pass | `pnpm --filter @collectio/platform test` returns zero failures |
| AC-13 | Lint passes | `pnpm lint` returns zero errors |
| AC-14 | No platform import contamination | `grep "from 'electron'" packages/platform/src/capacitor/CapacitorAuthProvider.ts` returns zero matches |
| AC-15 | No Node.js API usage in CapacitorAuthProvider | `grep "from 'node:" packages/platform/src/capacitor/CapacitorAuthProvider.ts` returns zero matches |
| AC-16 | `Browser.close()` called after redirect received | Code review: close after promise resolves/rejects |

---

## 14. Test Cases

### 14.1 Unit Tests (`CapacitorAuthProvider.test.ts`)

| # | Test | What It Validates |
|---|---|---|
| UT-01 | `signIn()` generates code_verifier of correct length and character set | PKCE verifier: 43 base64url chars (32 bytes) |
| UT-02 | `signIn()` computes code_challenge as SHA-256 of verifier | Challenge: correct base64url of SHA-256 hash |
| UT-03 | `signIn()` constructs correct auth URL | URL includes all required params: client_id, redirect_uri, response_type=code, scope, code_challenge, code_challenge_method=S256, prompt=consent, access_type=offline |
| UT-04 | `signIn()` success path returns `AuthTokens` and stores all three keys | Mock `App.addListener` to fire with auth code; mock `fetch` to return valid token response; verify `storage.store` called with access_token, refresh_token, expires_at |
| UT-05 | `signIn()` registers `appUrlOpen` listener BEFORE `Browser.open()` | Verify mock call order: `addListener` called before `Browser.open` |
| UT-06 | `signIn()` closes browser on success | Verify `Browser.close()` called after auth code received |
| UT-07 | `signIn()` rejects `AuthCancelledError` when `error=access_denied` in redirect | Mock `appUrlOpen` with error param → promise rejects with `AuthCancelledError` |
| UT-08 | `signIn()` rejects `AuthCancelledError` on redirect without code or error | Mock `appUrlOpen` with no query params → promise rejects with `AuthCancelledError` |
| UT-09 | `signIn()` rejects `AuthCancelledError` on timeout | Don't fire `appUrlOpen`; advance timer past 5 minutes → promise rejects with `AuthCancelledError` |
| UT-10 | `signIn()` rejects `AuthNetworkError` when `Browser.open()` fails | Mock `Browser.open` to reject → promise rejects with `AuthNetworkError` |
| UT-11 | `signIn()` rejects `AuthNetworkError` when token exchange `fetch` fails | Mock `appUrlOpen` with code; mock `fetch` to reject → promise rejects with `AuthNetworkError` |
| UT-12 | `signIn()` rejects `AuthNetworkError` when token response missing `refresh_token` | Mock `fetch` to return 200 with `{ access_token, expires_in }` but no `refresh_token` → promise rejects with `AuthNetworkError` |
| UT-13 | `signIn()` nullifies `code_verifier` in `finally` on success | Verify `codeVerifier` is null in finally block |
| UT-14 | `signIn()` nullifies `code_verifier` in `finally` on cancellation | Mock timeout; verify `codeVerifier` is null in finally block |
| UT-15 | `signIn()` removes `appUrlOpen` listener in `finally` | Verify listener removed on all exit paths |
| UT-16 | `signIn()` does NOT include `client_secret` in token exchange body | Inspect `fetch` call body; no `client_secret` key |
| UT-17 | `signIn()` uses `TextEncoder` for password encoding (not present for sign-in, but tests SHA-256 is compatible) | Cross-platform: SHA-256 of known string matches expected base64 |
| UT-18 | `refreshAccessToken()` returns new access token and expiry | Mock `fetch` to return valid refresh response; verify storage updated |
| UT-19 | `refreshAccessToken()` updates stored refresh token if Google rotates it | Mock `fetch` to return new `refresh_token` → verify storage.store called with new refresh token |
| UT-20 | `refreshAccessToken()` rejects `AuthNetworkError` on network failure | Mock `fetch` to reject → promise rejects with `AuthNetworkError` |
| UT-21 | `refreshAccessToken()` does NOT include `client_secret` | Inspect `fetch` call body |
| UT-22 | `signOut()` deletes all three storage keys | Verify `storage.delete` called for each key |
| UT-23 | `signOut()` swallows "does not exist" errors on delete | Mock `storage.delete` to throw "Item with given key does not exist" → signOut does not throw (Rule 7.1) |
| UT-24 | `getStoredTokens()` returns tokens when all three stored | Mock `storage.retrieve` to return values → returns `AuthTokens` |
| UT-25 | `getStoredTokens()` returns null when access_token missing | Mock `storage.retrieve('auth_access_token')` to return null → returns null |
| UT-26 | `getStoredTokens()` returns null when refresh_token missing | Mock `storage.retrieve('auth_refresh_token')` to return null → returns null |
| UT-27 | `getStoredTokens()` returns null when expires_at missing | Mock `storage.retrieve('auth_expires_at')` to return null → returns null |
| UT-28 | `computeCodeChallenge()` produces deterministic output | Test vector: known verifier → expected SHA-256 base64url challenge (cross-check with ElectronAuthProvider test vector) |
| UT-29 | `buildAuthUrl()` produces valid URL | Parse output; verify all required params present; `redirect_uri` matches config |
| UT-30 | `signIn()` handles `appUrlOpen` with malformed URL gracefully | Mock `appUrlOpen` with invalid URL → promise rejects with appropriate error |

### 14.2 Integration Tests (T-04.7 — separate spec, listed for completeness)

| # | Test | Environment |
|---|---|---|
| IT-01 | Full OAuth flow with test Google account | Physical Android device |
| IT-02 | Store tokens → kill app → relaunch → tokens survive | Physical Android device |
| IT-03 | Refresh access token → new token obtained | Physical Android device |
| IT-04 | Sign out → tokens cleared | Physical Android device |
| IT-05 | Verified URI scheme deep link receives auth code correctly | Physical Android device |

---

## 15. Definition Of Done

| # | Criterion | How Verified |
|---|---|---|
| DOD-01 | Source file `CapacitorAuthProvider.ts` created in `packages/platform/src/capacitor/` | File exists |
| DOD-02 | `CapacitorAuthProvider` implements `AuthProvider` interface | `implements AuthProvider` compiles |
| DOD-03 | `CapacitorAuthProvider` exported from `packages/platform/src/capacitor/index.ts` | Barrel export present |
| DOD-04 | All 30 unit tests pass | `pnpm --filter @collectio/platform test -- CapacitorAuthProvider` |
| DOD-05 | TypeScript compiles clean across all packages | `pnpm typecheck` returns zero errors |
| DOD-06 | Lint passes across all packages | `pnpm lint` returns zero errors |
| DOD-07 | Zero `client_secret` or `clientSecret` in CapacitorAuthProvider source | `grep` returns zero matches |
| DOD-08 | Zero `electron` imports in CapacitorAuthProvider source | `grep "from 'electron'"` returns zero matches |
| DOD-09 | Zero `node:` imports in CapacitorAuthProvider source | `grep "from 'node:"` returns zero matches |
| DOD-10 | Zero `google-auth-library` imports in CapacitorAuthProvider source | `grep "google-auth-library"` returns zero matches |
| DOD-11 | `code_verifier` declared as `let` with null initial value | Code review |
| DOD-12 | `try/finally` wraps entire `signIn()` flow; `codeVerifier = null` in `finally` | Code review |
| DOD-13 | `appUrlOpen` listener removed in `finally` | Code review |
| DOD-14 | `Browser.close()` called in `finally` | Code review |
| DOD-15 | `storage.delete` wrapped in `safeDelete` pattern (swallow "does not exist") | Code review; matches Rule 7.1 |
| DOD-16 | `prompt=consent` hardcoded in `buildAuthUrl()` | Code review; matches Rule 6.4 |
| DOD-17 | `access_type=offline` hardcoded in `buildAuthUrl()` | Code review |
| DOD-18 | No raw token values in `console.log`/`console.error` calls | Code review; matches Rule 12.2 |
| DOD-19 | `SecureStorageProvider` interface duplicated locally with TODO comment | Code review; matches MN-1 fix |
| DOD-20 | `base64urlEncode` function uses `TextEncoder` / `Uint8Array` (not `Buffer`) | Code review; Web-API-only |
| DOD-21 | SHA-256 uses `crypto.subtle.digest('SHA-256', ...)` (not `node:crypto`) | Code review; Web-API-only |
| DOD-22 | No `import.meta.dirname` or bare `__dirname` usage | grep verification (Rule 15.2) — not expected in this file but verify |
| DOD-23 | No import of `@capacitor/*` in shared/electron packages | grep verification (Rule 13.4) — not expected but verify no leakage |

