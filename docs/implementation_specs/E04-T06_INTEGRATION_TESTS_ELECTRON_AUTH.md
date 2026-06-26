# E-04 T-06 — Integration Tests: Electron Auth + Storage

**Parent Epic:** E-04: Platform Services
**Type:** Quality Gate (Manual Verification Script)
**Criticality:** VERIFICATION — validates that `ElectronAuthProvider` and `ElectronStorageProvider` interoperate correctly in the real Electron runtime against a real Google OAuth endpoint. This is the first and only end-to-end OAuth PKCE verification on the Electron platform. Without it, there is no evidence that the authentication pipeline works before proceeding to DI setup (T-04.8), `GoogleDriveProvider` (E-09), and `SyncEngine` (E-10).

**Important:** This is a **manual** integration test script that runs inside the Electron main process — it is NOT a Jest test. It follows the established `__verify__` runner pattern (see `better-sqlite3-verify.ts`). It requires a real Google Cloud Console OAuth client, a real Google account, real browser interaction, and real network access.

---

## 1. Goal

Produce a manual integration test script at `packages/platform/src/electron/__tests__/electron-auth.test.ts` that exercises `ElectronAuthProvider` (T-04.1) and `ElectronStorageProvider` (T-04.3) together in the real Electron runtime, walking the tester through 6 integration test cases. Each test produces a PASS/FAIL/ERROR result logged to console and written to a JSON report file. This proves that the full OAuth PKCE loopback flow, token persistence, token refresh, sign-out, and scope validation work end-to-end on Windows Electron.

---

## 2. Scope

| In Scope | Rationale |
|---|---|
| Integration test script at `packages/platform/src/electron/__tests__/electron-auth.test.ts` | Epic-specified file path |
| `runAuthVerify()` function exported from the test file | Follows `__verify__` runner pattern (`export function runVerify(...)`) |
| `TestResult` and `VerifyReport` types defined inline or imported | Structured test output matching the `__verify__` convention |
| 6 integration test cases from T-04.6 epic spec | IT-01 through IT-06 |
| Real `ElectronAuthProvider` instance (not mocked) | Validates real `google-auth-library` token exchange against Google's servers |
| Real `ElectronStorageProvider` instance (not mocked) | Validates real DPAPI encryption/decryption via `safeStorage` |
| Real `OAuthConfig` injected from caller (not hardcoded) | Client ID, redirect URI, scopes provided by the caller in `main.ts` |
| Console logging of pass/fail per test case | Visible in Electron dev console or terminal |
| JSON report written to `userData` directory | Persisted evidence of test results |
| Real browser interaction via `shell.openExternal` | Tester must manually consent in browser; test waits for loopback callback |
| Jest exclusion via `testPathIgnorePatterns` in `jest.config.ts` | Prevents Jest from attempting to run this non-Jest script |

---

## 3. Out of Scope

| Out of Scope | Why | Where It Belongs |
|---|---|---|
| Mocked unit tests for `ElectronAuthProvider` | Already covered by 15 unit tests in `ElectronAuthProvider.test.ts` | E-04 T-04.1 |
| Mocked unit tests for `ElectronStorageProvider` | Already covered by unit tests in `ElectronStorageProvider.test.ts` | E-04 T-04.3 |
| `TokenRefresher` integration testing | `TokenRefresher` is a shared class; its tests are unit-only (mock `AuthProvider`) | E-04 T-04.5 |
| Capacitor integration testing | Separate task | E-04 T-04.7 |
| Automated E2E testing (Playwright, etc.) | No Electron E2E framework configured; manual only for V1 | E-16 (future) |
| Google Cloud Console OAuth client creation | Developer prerequisite — must be done before running this script | Developer manual step |
| CI integration | Manual tests cannot run in CI | N/A |
| `TokenRefresher` usage within these tests | `TokenRefresher` is E-04 T-05; not needed for raw auth + storage validation | E-04 T-05 |
| Google Drive API calls to verify token | IT-06 verifies scope via token introspection, not a full Drive API call | E-09 (GoogleDriveProvider) |

---

## 4. Files To Create

| # | File | Purpose | Responsibility |
|---|---|---|---|
| 1 | `packages/platform/src/electron/__tests__/electron-auth.test.ts` | Manual integration test script — tests `ElectronAuthProvider` + `ElectronStorageProvider` against real Google OAuth. Exports `runAuthVerify(config)` function. NOT a Jest test. | Accepts `OAuthConfig` and `userDataPath`. Instantiates real `ElectronStorageProvider` and `ElectronAuthProvider`. Runs 6 sequential test cases, each producing a `TestResult`. Returns a `VerifyReport`. |
| 2 | `packages/platform/src/electron/__tests__/electron-auth-types.ts` | Type definitions for `TestResult`, `VerifyReport`, `AuthTestConfig` | Pure TypeScript interfaces — no runtime code |

---

## 5. Files To Modify

| # | File | Action | Detail |
|---|---|---|---|
| 1 | `packages/platform/jest.config.ts` | **Edit** | Add `testPathIgnorePatterns: ['<rootDir>/src/electron/__tests__/electron-auth.test.ts']` to prevent Jest from picking up this manual-only script |
| 2 | `apps/electron/src/main.ts` | **Edit** | Add optional import + invocation of `runAuthVerify()` after the existing `better-sqlite3-verify.ts` invocation (guarded behind an env var or CLI flag, e.g., `VERIFY_AUTH=true`) |
| 3 | `packages/platform/src/electron/index.ts` | **Edit** (optional) | May export `runAuthVerify` if it needs to be importable via `@collectio/platform`. Otherwise imported directly by `main.ts` using a relative path. |

---

## 6. Interfaces

### 6.1 Consumed: `AuthProvider` (prerequisite — already exists)

**Location:** `packages/shared/src/domain/interfaces/AuthProvider.ts`

```
signIn(): Promise<AuthTokens>
refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: number }>
signOut(): Promise<void>
getStoredTokens(): Promise<AuthTokens | null>
```

### 6.2 Consumed: `SecureStorageProvider` (prerequisite — already exists)

**Location:** `packages/shared/src/domain/interfaces/SecureStorageProvider.ts`

```
store(key: string, value: string): Promise<void>
retrieve(key: string): Promise<string | null>
delete(key: string): Promise<void>
clear(): Promise<void>
```

### 6.3 Consumed Types from `@collectio/shared`

| Type | Usage |
|---|---|
| `AuthTokens` | Return type of `signIn()`, `getStoredTokens()` |
| `OAuthConfig` | Injected into `ElectronAuthProvider` constructor; provided by caller |
| `AuthCancelledError` | Caught in IT-05; verified thrown on user cancellation |
| `AuthNetworkError` | Caught in error paths; test verifies correct error types |

### 6.4 Defined by This Task: `electron-auth-types.ts`

```
interface TestResult {
  id: string;            // e.g. 'IT-01'
  description: string;   // e.g. 'Full OAuth flow with test Google account'
  status: 'PASS' | 'FAIL' | 'ERROR' | 'SKIP';
  expected: string;      // Expected behavior
  actual: string;        // Actual behavior
  durationMs: number;
  error?: string;        // Stack trace if ERROR/FALL
}

interface VerifyReport {
  taskId: 'E-04-T-04.6';
  platform: 'electron-windows';
  packageName: '@collectio/platform';
  electronVersion: string;
  nodeVersion: string;
  tests: TestResult[];
  passed: number;
  failed: number;
  errored: number;
  skipped: number;
  timestamp: string;
}

interface AuthTestConfig {
  oauth: OAuthConfig;       // { clientId, redirectUri, scopes }
  userDataPath: string;     // For JSON report output
}
```

### 6.5 Exported Function

```
export async function runAuthVerify(config: AuthTestConfig): Promise<VerifyReport>;
```

---

## 7. Data Flow

### 7.1 Test Runner Invocation (from `main.ts`)

```
1.  APP starts → app.on('ready') fires

2.  EXISTING verify step completes (better-sqlite3-verify)

3.  IF env flag set (process.env.VERIFY_AUTH === 'true'):
    a. CONSTRUCT AuthTestConfig:
       - clientId from env (GOOGLE_CLIENT_ID)
       - redirectUri = 'http://localhost' (loopback host; port chosen dynamically by signIn)
       - scopes = ['https://www.googleapis.com/auth/drive.appdata']
       - userDataPath = app.getPath('userData')
    b. CALL runAuthVerify(config)
    c. LOG report summary to console
    d. WRITE report JSON to userDataPath/reports/auth-verify-<timestamp>.json

4.  CREATE browser window (normal app startup continues)
```

### 7.2 Test Case IT-01: Full OAuth Flow

```
1.  CREATE ElectronStorageProvider instance (no encryption mock — real DPAPI)
2.  CREATE ElectronAuthProvider(storage, oauthConfig)
    └─ storage.retrieve() returns null for all keys (clean state)

3.  CALL provider.signIn()
    └─ Internal: generate code_verifier, compute code_challenge
    └─ Internal: find free port, start loopback HTTP server
    └─ Internal: openExternal(authUrl) → opens system browser

4.  TESTER'S ACTION: In the opened browser:
    a. Select Google account
    b. Consent to drive.appdata scope
    c. Google redirects to http://localhost:<port>?code=...

5.  SCRIPT waits for loopback callback (up to 5 min timeout)
    └─ On callback: extract auth code from URL
    └─ Exchange code for tokens via google-auth-library OAuth2Client.getToken()
    └─ Return AuthTokens { accessToken, refreshToken, expiresAt }

6.  VERIFY:
    a. AuthTokens returned (not null)
    b. accessToken is a non-empty string
    c. refreshToken is a non-empty string
    d. expiresAt > Date.now() (token is in the future)

7.  RECORD TestResult: PASS or FAIL with details
```

### 7.3 Test Case IT-02: Token Survival Across Restart

```
1.  PRE-REQ: IT-01 must have completed (tokens stored)

2.  CALL provider.getStoredTokens()
    └─ Internal: storage.retrieve('auth_access_token')
    └─ Internal: storage.retrieve('auth_refresh_token')
    └─ Internal: storage.retrieve('auth_expires_at')

3.  VERIFY:
    a. Returns non-null AuthTokens
    b. accessToken matches the value from IT-01 (or is a valid JWT)
    c. refreshToken matches the value from IT-01
    d. expiresAt is a valid future timestamp

4.  SIMULATE APP RESTART (same process, different instances):
    a. Create NEW ElectronStorageProvider instance (same userData directory)
    b. Create NEW ElectronAuthProvider(newStorage, oauthConfig)
    c. Call newProvider.getStoredTokens()
    └─ Verifies that electron-store + DPAPI correctly persist and decrypt

5.  VERIFY new instance returns same tokens

6.  RECORD TestResult: PASS/FAIL
```

### 7.4 Test Case IT-03: Refresh Access Token

```
1.  PRE-REQ: IT-01 must have completed

2.  CALL provider.getStoredTokens() to get refreshToken

3.  CALL provider.refreshAccessToken(refreshToken)

4.  VERIFY:
    a. Returns { accessToken, expiresAt }
    b. accessToken is different from IT-01's accessToken (Google issues new one)
    c. expiresAt > Date.now()

5.  CALL provider.getStoredTokens()
    └─ Verify stored access token was updated
    └─ Verify stored expiry was updated

6.  RECORD TestResult: PASS/FAIL
```

### 7.5 Test Case IT-04: Sign Out Clears Tokens

```
1.  PRE-REQ: IT-01 must have completed (tokens stored)

2.  CALL provider.signOut()
    └─ Internal: storage.delete() for all 3 keys

3.  CALL provider.getStoredTokens()

4.  VERIFY returns null (all keys deleted)

5.  VERIFY storage.retrieve() returns null for each key individually:
    - auth_access_token → null
    - auth_refresh_token → null
    - auth_expires_at → null

6.  RECORD TestResult: PASS/FAIL
```

### 7.6 Test Case IT-05: Cancelled Consent → AuthCancelledError

```
1.  CREATE fresh ElectronAuthProvider(storage, oauthConfig)

2.  CALL provider.signIn()
    └─ Browser opens with Google consent screen

3.  TESTER'S ACTION: Close the browser tab WITHOUT consenting
    └─ (OR click "Cancel" on Google's consent screen)

4.  VERIFY signIn() throws AuthCancelledError
    └─ Error name is 'AuthCancelledError'
    └─ Error message indicates cancellation or timeout

5.  VERIFY no tokens were stored during failed flow:
    └─ storage.retrieve('auth_access_token') → null

6.  RECORD TestResult: PASS/FAIL
```

### 7.7 Test Case IT-06: Verify drive.appdata Scope

```
1.  PRE-REQ: IT-01 must have completed (valid access token)

2.  EXTRACT access token from getStoredTokens()

3.  CALL https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=<token>
    └─ Using fetch() (available in Node 18+)

4.  PARSE response:
    └─ Look for scope field

5.  VERIFY:
    a. scope includes 'https://www.googleapis.com/auth/drive.appdata'
    b. scope does NOT include broader Drive scopes (drive, drive.file, etc.)
       └─ This confirms the app was configured with the minimal scope

6.  RECORD TestResult: PASS/FAIL
```

---

## 8. State Changes

### 8.1 SecureStorage State Per Test Case

| Test Case | Keys Written | Keys Read | Keys Deleted |
|---|---|---|---|
| IT-01 | `auth_access_token`, `auth_refresh_token`, `auth_expires_at` | — (null initially) | — |
| IT-02 | — | `auth_access_token`, `auth_refresh_token`, `auth_expires_at` | — |
| IT-03 | `auth_access_token` (updated), `auth_expires_at` (updated) | `auth_refresh_token` | — |
| IT-04 | — | — | `auth_access_token`, `auth_refresh_token`, `auth_expires_at` |
| IT-05 | — (none on cancel) | — | — |
| IT-06 | — | — | — |

### 8.2 Test Execution Order

Tests must run sequentially (NOT parallel) due to token state dependencies:

```
IT-01 (sign in) → tokens stored
    ├── IT-02 (restart survival)  ← depends on IT-01 tokens
    ├── IT-03 (refresh)           ← depends on IT-01 tokens
    ├── IT-04 (sign out)          ← depends on IT-01 tokens; clears tokens after
    └── IT-06 (scope verify)      ← depends on IT-01 tokens; runs BEFORE IT-04

IT-05 (cancelled consent) — independent; can run anytime
```

Recommended execution order: IT-01 → IT-02 → IT-03 → IT-06 → IT-04 → IT-05

### 8.3 Token State Between Tests

After IT-04 (sign out), all subsequent tests that need tokens must re-run IT-01 first. The script should be designed to run all tests in one session with explicit ordering.

---

## 9. Database Changes

**None.** This task does not touch SQLite. All token state is stored in `electron-store` (DPAPI-encrypted JSON file in `userData`), not the application database. No migration, no schema change.

---

## 10. Error Handling

### 10.1 Error Types Produced by Tests

| Scenario | `TestResult.status` | Behaviour |
|---|---|---|
| Test passes all verifications | `'PASS'` | Continue to next test |
| Test outcome does not match expected | `'FAIL'` | Record failure detail; continue to next test |
| Test throws unexpected error (script bug) | `'ERROR'` | Record error + stack; continue to next test |
| Pre-requisite test failed → cannot run | `'SKIP'` | Skip dependent test; record which test it depends on |

### 10.2 Test Execution Resilience

```
runAuthVerify():
  ├─ Each test wrapped in try/catch
  │    ├─ PASS → next test
  │    ├─ FAIL → next test (recorded as FAIL)
  │    └─ ERROR → next test (recorded as ERROR)
  ├─ Dependent tests (IT-02 through IT-06) check if IT-01 passed
  │    └─ If IT-01 FAIL/ERROR → SKIP dependent tests
  └─ Always write report JSON (even if all tests fail)
```

### 10.3 User Guidance for IT-05 (Manual Cancellation)

The script must log clear instructions:

```
=== IT-05: Cancelled Consent ===
When the browser opens, please CLOSE THE TAB (do not consent).
The script expects an AuthCancelledError. You have 5 minutes.
```

---

## 11. Logging Requirements

| Event | Level | Message | Rationale |
|---|---|---|---|
| Test start | `info` | `"=== E-04 T-04.6: Electron Auth + Storage Integration Tests ==="` | Banner for test session identification |
| Test case start | `info` | `"[IT-01] Starting: Full OAuth flow"` | Per-test tracking |
| Test case pass | `info` | `"[IT-01] PASS (2.3s) — Full OAuth flow"` | Duration included for timing visibility |
| Test case fail | `warn` | `"[IT-02] FAIL (0.1s) — Token survival: expected tokens, got null"` | Expected vs actual in message |
| Test case error | `error` | `"[IT-03] ERROR — TypeError: ..."` | Full error message |
| Test case skip | `info` | `"[IT-02] SKIP — IT-01 prerequisite did not pass"` | Dependency chain visible |
| Report summary | `info` | `"Result: 4/6 passed. 1 failed. 1 skipped. 0 errors."` | Final summary |
| Report path | `info` | `"Report written to: C:\Users\...\Collectio\reports\auth-verify-2026-06-26T...json"` | Report location |
| OAuth URL generated | `debug` | `"[IT-01] Opening browser for OAuth at: https://accounts.google.com/o/oauth2/v2/auth?...[truncated]"` | Diagnostic; never includes client secret (none exists for PKCE) |

**Prohibited from logging:** `access_token`, `refresh_token`, `code_verifier`, `code_challenge`, full OAuth URLs with `code_challenge` query param (Rule 12.2). Token presence checks (e.g., "access token present: yes") are acceptable.

---

## 12. Security Requirements

| # | Requirement | Source | How Enforced |
|---|---|---|---|
| 1 | Never log access token or refresh token values | Rule 6.5, Rule 12.2 | Code review of all `console.*` and report `actual` fields; test result messages use presence checks only |
| 2 | `code_verifier` nullified after token exchange | Rule 12.3 | Handled by `ElectronAuthProvider.signIn()` (already implemented with `finally` block) |
| 3 | OAuth client ID injected via config, not hardcoded | Rule 13.1 | `runAuthVerify(config)` accepts `OAuthConfig` from caller |
| 4 | No `client_secret` anywhere | NFR-SEC-04 | PKCE flow does not use client secret; grep verification |
| 5 | JSON report does not contain tokens | Rule 12.2 | Report `actual` field logs presence/absence, not values; token introspection response logged scopes only, not token |
| 6 | `safeStorage` encryption verified | NFR-SEC-02 | IT-02 implicitly verifies DPAPI works (decrypt works after simulated restart) |
| 7 | `electron-store` data is not plaintext | T-04.3 AC-5 | Optional: after IT-01, inspect `userData/config.json` to verify it contains base64 (not plaintext) tokens |

---

## 13. Acceptance Criteria

| # | Criterion | Verification |
|---|---|---|
| AC-01 | `electron-auth.test.ts` created at `packages/platform/src/electron/__tests__/` | File exists |
| AC-02 | `electron-auth-types.ts` created at same path | File exists |
| AC-03 | Script exports `runAuthVerify(config: AuthTestConfig): Promise<VerifyReport>` | TypeScript compilation |
| AC-04 | Script does NOT use `describe`, `it`, `test`, `expect`, or any Jest globals | grep verification; this is NOT a Jest test |
| AC-05 | Jest config excludes `electron-auth.test.ts` via `testPathIgnorePatterns` | `pnpm --filter @collectio/platform test` does NOT execute this file |
| AC-06 | IT-01: Full OAuth flow completes and returns valid tokens | Manual run with real Google account |
| AC-07 | IT-02: `getStoredTokens()` returns same tokens after creating NEW `ElectronStorageProvider` instance (simulated restart) | Manual run |
| AC-08 | IT-03: `refreshAccessToken()` returns new access token with updated expiry | Manual run; token differs from IT-01 |
| AC-09 | IT-04: `signOut()` clears all 3 storage keys; `getStoredTokens()` returns `null` | Manual run |
| AC-10 | IT-05: Closing browser without consent throws `AuthCancelledError` | Manual run; tester closes browser tab |
| AC-11 | IT-06: `tokeninfo` endpoint confirms scope matches `drive.appdata` | Manual run; verify no broader scopes |
| AC-12 | JSON report written to `userData` directory after test run | File exists at reported path |
| AC-13 | TypeScript compiles clean across all packages | `pnpm typecheck` returns zero errors |
| AC-14 | Lint passes | `pnpm lint` returns zero errors |
| AC-15 | No token values in `console.log` or report `actual` fields | Code review (Rule 12.2) |
| AC-16 | No `client_secret` or `clientSecret` in any file | grep verification |
| AC-17 | Script runs to completion without crashing (even if tests fail) | Manual run; report always generated |
| AC-18 | Zero `@capacitor/*` imports in script | grep verification; Electron-only test |
| AC-19 | Script uses `fileURLToPath` + `dirname` pattern if path resolution needed | Code review (Rule 15.2b) |
| AC-20 | `main.ts` imports updated (optional — script can be invoked standalone) | Verify import compiles if added |

---

## 14. Test Cases (What the Script Exercises)

### 14.1 IT-01: Full OAuth Flow

| Property | Detail |
|---|---|
| **ID** | `IT-01` |
| **Description** | Full OAuth PKCE flow completes and returns valid tokens |
| **Pre-conditions** | Clean storage (no existing tokens); OAuth client configured in Google Cloud Console |
| **Steps** | 1. Create `ElectronStorageProvider` → 2. Create `ElectronAuthProvider` → 3. Call `signIn()` → 4. Tester consents in browser → 5. Script receives callback → 6. Script exchanges code for tokens |
| **Expected** | Returns `AuthTokens` with non-empty `accessToken`, `refreshToken`, and `expiresAt > Date.now()` |
| **Failure modes** | Token exchange error (network/Google reject) → `AuthNetworkError`; timeout (5 min) → `AuthCancelledError` |

### 14.2 IT-02: Token Survival Across Restart

| Property | Detail |
|---|---|
| **ID** | `IT-02` |
| **Description** | Tokens persist across simulated app restart |
| **Pre-conditions** | IT-01 passed (tokens stored via `ElectronStorageProvider`) |
| **Steps** | 1. Call `getStoredTokens()` on IT-01's provider → 2. Create NEW `ElectronStorageProvider` instance → 3. Create NEW `ElectronAuthProvider` with new storage → 4. Call `getStoredTokens()` on new provider |
| **Expected** | Both calls return matching `AuthTokens`; new instance successfully decrypts DPAPI-protected values |
| **Failure modes** | `safeStorage` decryption fails → `null`; `electron-store` file missing → `null` |

### 14.3 IT-03: Refresh Access Token

| Property | Detail |
|---|---|
| **ID** | `IT-03` |
| **Description** | Access token is refreshed successfully |
| **Pre-conditions** | IT-01 passed (valid refresh token in storage) |
| **Steps** | 1. Call `getStoredTokens()` → 2. Call `refreshAccessToken(refreshToken)` → 3. Call `getStoredTokens()` again |
| **Expected** | Returns new `accessToken` (different from IT-01); `expiresAt` updated; storage keys updated |
| **Failure modes** | Google rejects refresh token → `AuthNetworkError` |

### 14.4 IT-04: Sign Out Clears Tokens

| Property | Detail |
|---|---|
| **ID** | `IT-04` |
| **Description** | Sign out deletes all stored tokens |
| **Pre-conditions** | IT-01 passed (tokens stored) |
| **Steps** | 1. Call `signOut()` → 2. Call `getStoredTokens()` → 3. Call `storage.retrieve()` for each key individually |
| **Expected** | `getStoredTokens()` returns `null`; all 3 individual retrieves return `null` |
| **Failure modes** | `electron-store.delete()` fails silently → partial deletion |

### 14.5 IT-05: Cancelled Consent

| Property | Detail |
|---|---|
| **ID** | `IT-05` |
| **Description** | User cancellation throws `AuthCancelledError` |
| **Pre-conditions** | Clean storage; no active tokens |
| **Steps** | 1. Create fresh `ElectronAuthProvider` → 2. Call `signIn()` → 3. Tester closes browser tab without consenting (or clicks Cancel) |
| **Expected** | `signIn()` rejects with `AuthCancelledError`; `error.name === 'AuthCancelledError'`; no tokens stored |
| **Failure modes** | Tester accidentally consents → test FAIL (token returned instead of error); network error → `AuthNetworkError` (not `AuthCancelledError`) |

### 14.6 IT-06: Verify drive.appdata Scope

| Property | Detail |
|---|---|
| **ID** | `IT-06` |
| **Description** | Received access token has correct minimal scope |
| **Pre-conditions** | IT-01 passed (valid access token) |
| **Steps** | 1. Call `getStoredTokens()` → 2. `fetch('https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=TOKEN')` → 3. Parse response |
| **Expected** | Response contains `scope` field including `https://www.googleapis.com/auth/drive.appdata`; does NOT include broader scopes (`drive`, `drive.file`, `drive.readonly`) |
| **Failure modes** | Token expired (401) → refresh first; network failure → test ERROR |

---

## 15. Definition Of Done

| # | Criterion | How Verified |
|---|---|---|
| DOD-01 | `electron-auth.test.ts` created at `packages/platform/src/electron/__tests__/` | File exists |
| DOD-02 | `electron-auth-types.ts` created at same path | File exists |
| DOD-03 | Script exports `runAuthVerify(config: AuthTestConfig): Promise<VerifyReport>` | TypeScript compilation |
| DOD-04 | Script does NOT import Jest globals (`describe`, `it`, `expect`, etc.) | grep verification |
| DOD-05 | Script uses `__verify__` runner pattern (returns `VerifyReport`, logs results) | Code review |
| DOD-06 | All 6 test cases implemented in sequential order with dependency checks | Code review |
| DOD-07 | Each test case wrapped in try/catch; failure in one does not crash the script | Code review |
| DOD-08 | JSON report written to `userData` directory with timestamp in filename | Manual verification after run |
| DOD-09 | Jest `testPathIgnorePatterns` excludes `electron-auth.test.ts` | `pnpm test` in platform package does not execute this file |
| DOD-10 | `pnpm typecheck` passes with zero errors across all packages | CLI |
| DOD-11 | `pnpm lint` passes with zero errors across all packages | CLI |
| DOD-12 | Zero `console.*` calls that include token values | Code review (Rule 12.2) |
| DOD-13 | Zero `client_secret` or `clientSecret` in any file | grep verification |
| DOD-14 | Zero `@capacitor/*` imports in test script | grep verification |
| DOD-15 | OAuth `clientId` injected via `AuthTestConfig`, not hardcoded | Code review |
| DOD-16 | Test instructions logged to console before IT-05 (manual cancellation step) | Code review |
| DOD-17 | Manual run produces valid JSON report | Run script with real Google account; inspect report file |
| DOD-18 | Manual run: all 6 tests pass with real Google account | Actual execution on Windows Electron |
| DOD-19 | Existing Jest tests in platform package still pass | `pnpm --filter @collectio/platform test` |
| DOD-20 | Script file uses `.ts` extension (no JSX — Rule 11.6) | File extension check |

---

## Appendix A: Dependency Map

```
E-04 T-04.1 (ElectronAuthProvider) ── DONE ── The SUT for IT-01 through IT-06
E-04 T-04.3 (ElectronStorageProvider) ── DONE ── Token persistence; new instances for IT-02 restart simulation
E-01 T-01.5 (Electron app scaffold) ── DONE ── main.ts is where the verify runner is invoked

E-04 T-04.6 (Integration Tests: Electron Auth + Storage) ── THIS TASK
    │
    └── QUALITY GATE ── must pass before proceeding to T-04.8 (DI Setup) and E-09 (GoogleDriveProvider)
```

## Appendix B: Architectural Traceability

| Architecture Requirement | Where Addressed |
|---|---|
| `AuthProvider` interface exercised end-to-end (01_ARCHITECTURE.md §4) | IT-01 through IT-04 exercise all `AuthProvider` methods |
| `SecureStorageProvider` validated with real DPAPI (01_ARCHITECTURE.md §4) | IT-02 simulates restart; validates `electron-store` + `safeStorage` |
| PKCE OAuth flow verified on Electron (NFR-SEC-04) | IT-01 performs full loopback-based PKCE flow |
| No `client_secret` (NFR-SEC-04) | PKCE flow; grep verification |
| `drive.appdata` scope is minimal (FR-AUTH cert) | IT-06 verifies scope via tokeninfo endpoint |
| Platform-specific code isolated (Rule 13.1) | Test script only imports Electron providers; no cross-platform code |
| Never log tokens (Rule 6.5, Rule 12.2) | §11, §12 S-01 |
| `contextIsolation: true` (Rule 15.3) | Script runs in main process; renderer not involved |
| Electron Node 20.16.0 (Rule 15.2b) | Script uses Node.js `fetch`, `createServer` — compatible with Node 20 |

## Appendix C: Prerequisites Before Running

Before this integration test script can be executed, the developer must:

1. **Create a Google Cloud Console OAuth 2.0 client:**
   - Application type: **"Desktop app"**
   - Redirect URI: `http://localhost` (no port — Google permits any port on `localhost` for Desktop app type)
   - Scopes: `https://www.googleapis.com/auth/drive.appdata` (app data folder only)
   - Download the client configuration (client ID)

2. **Set environment variables:**
   ```powershell
   $env:VERIFY_AUTH = "true"
   $env:GOOGLE_CLIENT_ID = "<your-client-id>.apps.googleusercontent.com"
   ```

3. **Have a test Google account available:**
   - This account will grant `drive.appdata` access to the app
   - The account's Drive app data folder will be used (no user files accessible)

4. **Run the Electron app:**
   ```powershell
   pnpm --filter @collectio/electron-app dev
   ```

## Appendix D: Jest Exclusion Rationale

This file is placed at `__tests__/electron-auth.test.ts` per the epic specification. However, it is NOT a Jest test — it is a manual Electron runtime verification script. It must be excluded from Jest via `testPathIgnorePatterns`:

```typescript
// packages/platform/jest.config.ts addition:
testPathIgnorePatterns: [
  '<rootDir>/src/electron/__tests__/electron-auth.test.ts',
],
```

This prevents `pnpm test` from failing with "Cannot find module 'electron'" errors when Jest tries to execute this file under the `node` test environment (which lacks Electron's built-in modules).
