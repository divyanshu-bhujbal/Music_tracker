# E-04 T-07 — Integration Tests: Capacitor Auth + Storage

**Parent Epic:** E-04: Platform Services
**Type:** Quality Gate (Manual Verification — Android Device)
**Criticality:** VERIFICATION — validates that `CapacitorAuthProvider` and `CapacitorStorageProvider` interoperate correctly on a physical Android device against a real Google OAuth endpoint. This is the first and only end-to-end OAuth PKCE verification on Capacitor Android. The E-00b spike never completed the full PKCE flow (KI-01) — this task resolves that known issue. Without passing results, there is no evidence the Android authentication pipeline works before proceeding to DI setup (T-04.8), `GoogleDriveProvider` (E-09), and `SyncEngine` (E-10).

**Important:** This is a **manual** integration test that runs inside the Capacitor WebView on a physical Android device — it is NOT a Jest test and cannot run in an emulator (Android Keystore + OAuth browser interaction require real hardware). It follows the established `__verify__` renderer pattern (see `capacitor-sqlite-verify.ts` + `VerifyRunner.tsx`). A React component orchestrates the tests and renders PASS/FAIL results in the WebView UI. The tester must interact with the system browser for OAuth consent and manually kill/relaunch the app for persistence tests.

---

## 1. Goal

Produce a manual integration test suite at `packages/platform/src/capacitor/__verify__/` that exercises `CapacitorAuthProvider` (T-04.2) and `CapacitorStorageProvider` (T-04.4) together in the real Capacitor WebView runtime on a physical Android device. Tests walk the tester through 5 integration test cases via a React UI that renders instructions, captures results, and displays a PASS/FAIL summary. This proves the full Capacitor OAuth PKCE flow (`@capacitor/browser` → `appUrlOpen` deep link → `fetch()` token exchange), Android Keystore-backed token persistence, app-kill survival, token refresh, and sign-out work end-to-end.

---

## 2. Scope

| In Scope | Rationale |
|---|---|
| `runAuthVerify()` function in `packages/platform/src/capacitor/__verify__/capacitor-auth-verify.ts` | Follows `__verify__` runner pattern (`export async function runVerify(...): Promise<VerifyReport>`) |
| `TestResult`, `VerifyReport`, `AuthTestConfig` types in `capacitor-auth-types.ts` | Shared types shared between verify function and React component |
| `AuthVerifyRunner` React component in `packages/platform/src/capacitor/__verify__/AuthVerifyRunner.tsx` | Renders test instructions, calls `runAuthVerify()`, displays results table, offers "Copy JSON Report" button; follows `VerifyRunner.tsx` pattern |
| 5 integration test cases from T-04.7 epic spec | IT-01 through IT-05 |
| Real `CapacitorAuthProvider` instance (not mocked) | Validates real `@capacitor/browser` OAuth flow, `appUrlOpen` deep link, and `fetch()` token exchange against Google's servers |
| Real `CapacitorStorageProvider` instance (not mocked) | Validates real Android Keystore via `capacitor-secure-storage-plugin` |
| Real `OAuthConfig` injected via `AuthTestConfig` (not hardcoded) | Client ID, redirect URI, scopes provided by the test config |
| Manual browser interaction prompt (IT-01, IT-05) | Tester must consent/cancel in the system browser; the React UI displays instructions and waits |
| Manual app-kill step (IT-02) | Tester must force-stop and relaunch the app; test resumes from stored token state |
| Results rendered in React UI table | PASS/FAIL/ERROR with color coding; matching `VerifyRunner.tsx` visual style |
| `window.__authVerifyReport` for programmatic access | Follows `window.__verifyReport` pattern; enables Copy JSON functionality |

---

## 3. Out of Scope

| Out of Scope | Why | Where It Belongs |
|---|---|---|
| Mocked unit tests for `CapacitorAuthProvider` | Already covered by 21 unit tests in `CapacitorAuthProvider.test.ts` | E-04 T-04.2 |
| Mocked unit tests for `CapacitorStorageProvider` | Already covered by 18 unit tests in `CapacitorStorageProvider.test.ts` | E-04 T-04.4 |
| `TokenRefresher` integration testing | `TokenRefresher` is a shared class; tested with mocked `AuthProvider` | E-04 T-04.5 |
| Electron integration testing | Separate task; different platform, different OAuth flow | E-04 T-04.6 |
| Automated E2E testing (Playwright, Appium, Maestro) | No Capacitor E2E framework configured; manual only for V1 per FR-07 | E-16 (future) |
| Google Cloud Console OAuth client creation | Developer prerequisite | Developer manual step (RC-06) |
| SHA-1 fingerprint extraction from debug keystore | Developer prerequisite | Developer manual step |
| CI integration | Cannot run in CI — requires physical device + manual browser interaction | N/A |
| Scope verification via tokeninfo endpoint | Not listed in T-04.7 epic spec; can be added as a future enhancement | Future |
| Filesystem report write | Capacitor Filesystem plugin not installed; report rendered in UI + copied to clipboard | `window.__authVerifyReport` |
| Android emulator execution | Android Keystore unavailable; OAuth browser interaction unreliable | Physical device only |

---

## 4. Files To Create

| # | File | Purpose | Responsibility |
|---|---|---|---|
| 1 | `packages/platform/src/capacitor/__verify__/capacitor-auth-verify.ts` | Core verification logic — exports `runAuthVerify(config)`. Instantiates real `CapacitorStorageProvider` and `CapacitorAuthProvider`. Runs 5 sequential test cases. Each produces a `TestResult`. Returns a `VerifyReport`. | Imported by `AuthVerifyRunner.tsx`. Runs inside Capacitor WebView; accesses `@capacitor/browser`, `@capacitor/app`, `capacitor-secure-storage-plugin` directly. |
| 2 | `packages/platform/src/capacitor/__verify__/capacitor-auth-types.ts` | Type definitions: `TestResult`, `VerifyReport`, `AuthTestConfig` | Pure TypeScript interfaces — no runtime code |
| 3 | `packages/platform/src/capacitor/__verify__/AuthVerifyRunner.tsx` | React component: renders test UI, calls `runAuthVerify()` on mount, displays results table with PASS/FAIL/ERROR color coding, shows instructions for manual steps | Follows `VerifyRunner.tsx` visual pattern. Uses `useEffect` + `useRef` to ensure single execution. |

---

## 5. Files To Modify

| # | File | Action | Detail |
|---|---|---|---|
| 1 | `apps/capacitor/src/index.tsx` | **Edit** | Replace `<VerifyRunner />` import+render with `<AuthVerifyRunner />` (temporarily — for running auth integration tests). The production app will later render the real UI shell after DI setup (E-04 T-04.8). |
| 2 | `packages/platform/package.json` | **Edit** | Add `exports` entries for new `__verify__` files to match existing pattern: `"./capacitor/__verify__/capacitor-auth-verify": "./src/capacitor/__verify__/capacitor-auth-verify.ts"`, `"./capacitor/__verify__/capacitor-auth-types": "./src/capacitor/__verify__/capacitor-auth-types.ts"`, `"./capacitor/__verify__/AuthVerifyRunner": "./src/capacitor/__verify__/AuthVerifyRunner.tsx"` |

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

All four methods are exercised by the integration tests:
- IT-01 uses `signIn()`
- IT-02 uses `getStoredTokens()`
- IT-03 uses `refreshAccessToken()` + `getStoredTokens()`
- IT-04 uses `signOut()` + `getStoredTokens()`
- IT-05 exercises `signIn()` error path (cancellation)

### 6.2 Consumed: `SecureStorageProvider` (prerequisite — already exists)

**Location:** `packages/shared/src/domain/interfaces/SecureStorageProvider.ts`

Used indirectly through `CapacitorAuthProvider` (which injects it). Not called directly by the test script.

### 6.3 Consumed Types from `@collectio/shared`

| Type | Usage |
|---|---|
| `AuthTokens` | Return type of `signIn()`, `getStoredTokens()` |
| `OAuthConfig` | Injected into `CapacitorAuthProvider` constructor; provided by test config |
| `AuthCancelledError` | Caught in IT-05; verified thrown on user cancellation |
| `AuthNetworkError` | Caught in error paths; test verifies correct error types |

### 6.4 Defined by This Task: `capacitor-auth-types.ts`

```
type Status = 'PASS' | 'FAIL' | 'ERROR' | 'SKIP';

interface TestResult {
  id: string;            // e.g. 'IT-01'
  description: string;   // e.g. 'Full OAuth PKCE flow on Android device'
  status: Status;
  expected: string;      // Expected behavior
  actual: string;        // Actual behavior (presence checks only — no token values)
  durationMs: number;
  error?: string;        // Stack trace if ERROR/FAIL
}

interface VerifyReport {
  taskId: 'E-04-T-04.7';
  platform: 'capacitor-android';
  packageName: '@collectio/platform';
  capacitorVersion: string;        // From Capacitor.getPlatform() / runtime
  webViewUserAgent: string;        // navigator.userAgent
  tests: TestResult[];
  passed: number;
  failed: number;
  errored: number;
  skipped: number;
  criticalFailed: boolean;         // true if IT-01 fails (blocks all downstream tests)
  timestamp: string;               // ISO 8601
}

interface AuthTestConfig {
  oauth: OAuthConfig;              // { clientId, redirectUri, scopes }
}
```

### 6.5 Exported Functions and Components

**`capacitor-auth-verify.ts`:**
```
export async function runAuthVerify(config: AuthTestConfig): Promise<VerifyReport>;
```

**`AuthVerifyRunner.tsx`:**
```
export function AuthVerifyRunner(): JSX.Element;
```
Renders the test UI. Calls `runAuthVerify()` on mount. No props — config is defined as a constant within the component or imported from a config module.

---

## 7. Data Flow

### 7.1 Test Runner Invocation (WebView Startup)

```
1.  APP launches → React root renders <AuthVerifyRunner />

2.  AuthVerifyRunner mounts:
    a. useEffect fires (guarded by useRef to prevent double-execution in StrictMode)
    b. CONSTRUCT AuthTestConfig with OAuth config (client ID, redirect URI, scopes)
       └─ OAuth config MUST be defined in-code (Capacitor has no env vars in WebView)
       └─ redirectUri = 'com.collectio.app://' (Rule 6.2)
       └─ clientId = hardcoded test client ID (config constant at top of file)
       └─ scopes = ['https://www.googleapis.com/auth/drive.appdata']
    c. SET running state = true (render "Running 5 auth tests..." message)
    d. CALL runAuthVerify(config)
    e. ON resolve: setReport(report), setRunning(false)
    f. ON reject: log error, setRunning(false), render error state
    g. STORE report on window.__authVerifyReport

3.  Results rendered in table with PASS/FAIL/ERROR styling
```

### 7.2 Test Case IT-01: Full OAuth PKCE Flow on Android

```
1.  PRE-RUN: Clean any existing tokens from previous runs
    └─ Call storage.clear() to wipe Android Keystore entries

2.  CREATE CapacitorStorageProvider instance (real plugin)
3.  CREATE CapacitorAuthProvider(storage, oauthConfig)

4.  DISPLAY instruction to user: "Opening browser for Google sign-in. Please consent."

5.  CALL provider.signIn()
    └─ Internal: generate code_verifier (crypto.getRandomValues)
    └─ Internal: compute code_challenge (SubtleCrypto SHA-256)
    └─ Internal: build auth URL with client_id, redirect_uri=com.collectio.app://,
       scope=drive.appdata, prompt=consent, access_type=offline
    └─ Internal: App.addListener('appUrlOpen', handler) — Rule 6.3
    └─ Internal: Browser.open({ url: authUrl }) — opens system browser

6.  TESTER'S ACTION on device:
    a. Google sign-in page appears in system browser
    b. Select test Google account
    c. Consent to "See and manage files in your Google Drive App Data folder"
    d. Google redirects to com.collectio.app://?code=...
    e. Android intent system routes to app via AndroidManifest intent filter (RC-04)
    f. App.addListener('appUrlOpen') fires → extracts auth code

7.  SCRIPT continues after redirect:
    └─ Internal: fetch() to https://oauth2.googleapis.com/token with code, client_id,
       code_verifier, redirect_uri, grant_type=authorization_code
    └─ Internal: parse JSON response → access_token, refresh_token, expires_in
    └─ Internal: storage.store() for all 3 keys (auth_access_token, auth_refresh_token,
       auth_expires_at)
    └─ Return AuthTokens

8.  VERIFY:
    a. AuthTokens returned (not null)
    b. accessToken is a non-empty string
    c. refreshToken is a non-empty string
    d. expiresAt > Date.now()

9.  RECORD TestResult: PASS or FAIL with details
```

### 7.3 Test Case IT-02: Token Survival Across App Kill

```
1.  PRE-REQ: IT-01 must have completed (tokens stored in Android Keystore)

2.  VERIFY tokens accessible:
    a. Call provider.getStoredTokens()
    b. Verify returns non-null AuthTokens
    c. Verify accessToken, refreshToken are non-empty

3.  DISPLAY instruction: "Kill the app now (swipe from recents or Settings > Force Stop),
    then relaunch it."

4.  TESTER'S ACTION:
    a. Swipe app from recent apps (OR Settings > Apps > Collectio > Force Stop)
    b. Re-launch the app from launcher

5.  APP RESTARTS → React re-mounts → AuthVerifyRunner re-renders
    └─ The test must detect this is a "resume after IT-02" scenario

6.  ON RELAUNCH:
    a. Create NEW CapacitorStorageProvider instance (fresh — same Keystore backend)
    b. Create NEW CapacitorAuthProvider(newStorage, oauthConfig)
    c. Call newProvider.getStoredTokens()

7.  VERIFY:
    a. Returns non-null AuthTokens
    b. accessToken matches IT-01's accessToken (server-side token unchanged)
    c. refreshToken matches IT-01's refreshToken
    d. expiresAt matches IT-01's expiresAt
    └─ Confirms Android Keystore persisted data across app kill (KC-09)

8.  RECORD TestResult: PASS/FAIL
```

### 7.4 Test Case IT-03: Refresh Access Token

```
1.  PRE-REQ: IT-01 must have completed (valid refresh token in Keystore)

2.  CALL provider.getStoredTokens() to get current tokens

3.  CALL provider.refreshAccessToken(refreshToken)

4.  VERIFY:
    a. Returns { accessToken, expiresAt }
    b. accessToken is a non-empty string
    c. new accessToken is DIFFERENT from IT-01's accessToken (Google issues fresh token)
    d. expiresAt > Date.now()

5.  CALL provider.getStoredTokens()
    └─ Verify stored access token was updated to new value
    └─ Verify stored expiry was updated

6.  RECORD TestResult: PASS/FAIL
```

### 7.5 Test Case IT-04: Sign Out Clears Tokens

```
1.  PRE-REQ: IT-01 must have completed (tokens stored)

2.  CALL provider.signOut()
    └─ Internal: storage.delete() for all 3 keys (wrapped in safeDelete with Rule 7.1)

3.  CALL provider.getStoredTokens()

4.  VERIFY returns null (all keys deleted)

5.  VERIFY individual retrieves return null:
    - storage.retrieve('auth_access_token') → null
    - storage.retrieve('auth_refresh_token') → null
    - storage.retrieve('auth_expires_at') → null

6.  RECORD TestResult: PASS/FAIL
```

### 7.6 Test Case IT-05: Verified URI Scheme Deep Link Receives Auth Code

```
1.  PRE-REQ: Clean storage (no tokens); IT-04 should have cleaned up

2.  DISPLAY instruction: "Opening browser for OAuth. When you see the Google consent screen,
    look for the redirect happening via com.collectio.app:// scheme."

3.  CALL provider.signIn()
    └─ Internal: App.addListener('appUrlOpen', handler) registered (Rule 6.3)
    └─ Internal: Browser.open({ url: authUrl })

4.  TESTER'S ACTION:
    a. Browser opens with Google consent screen
    b. CONSENT (do NOT cancel — this is the deep link test, not the cancel test)

5.  VERIFY deep link flow:
    a. Google redirects to com.collectio.app://?code=...
    b. Android intent system routes to app (AndroidManifest intent filter verified)
    c. App.addListener('appUrlOpen') fires
    d. Auth code extracted from URL searchParams.get('code')
    e. Code is a non-empty string
    f. Token exchange completes successfully

6.  ALSO VERIFY error path deep link (sub-test):
    a. Create FRESH CapacitorAuthProvider
    b. Call signIn() again
    c. TESTER clicks "Cancel" on Google consent screen
    d. Google redirects to com.collectio.app://?error=access_denied
    e. App.addListener('appUrlOpen') fires with error param
    f. signIn() rejects with AuthCancelledError('User denied access')

7.  RECORD TestResult: PASS/FAIL for both sub-tests
```

---

## 8. State Changes

### 8.1 Android Keystore State Per Test Case

| Test Case | Keys Written | Keys Read | Keys Deleted |
|---|---|---|---|
| IT-01 (before) | — | — | All (cleanup via `clear()`) |
| IT-01 (sign in) | `auth_access_token`, `auth_refresh_token`, `auth_expires_at` | — | — |
| IT-02 (before kill) | — | `auth_access_token`, `auth_refresh_token`, `auth_expires_at` | — |
| IT-02 (after relaunch) | — | `auth_access_token`, `auth_refresh_token`, `auth_expires_at` | — |
| IT-03 (refresh) | `auth_access_token` (updated), `auth_expires_at` (updated) | `auth_refresh_token` | — |
| IT-04 (sign out) | — | — | `auth_access_token`, `auth_refresh_token`, `auth_expires_at` |
| IT-05 (deep link) | `auth_access_token`, `auth_refresh_token`, `auth_expires_at` | — | — |

### 8.2 Test Execution Order

Tests must run sequentially due to token state dependencies:

```
IT-01 (sign in) → tokens stored
    ├── IT-02 (app kill survival)   ← depends on IT-01; requires manual kill/relaunch
    ├── IT-03 (token refresh)       ← depends on IT-01
    ├── IT-04 (sign out)            ← depends on IT-01; RUNS LAST (clears tokens)
    └── IT-05 (deep link verify)    ← depends on IT-04 having cleaned up; creates fresh tokens

Recommended order: IT-01 → IT-02 → IT-03 → IT-04 → IT-05
```

### 8.3 App Relaunch Detection (IT-02)

IT-02 is unique — it requires the tester to kill and relaunch the app. The test script must detect the relaunch:

**Strategy:** Before IT-02 runs (pre-kill), store a flag in sessionStorage (NOT Keystore — sessionStorage is wiped on app kill):

```
1. Before IT-02 kill prompt:
   sessionStorage.setItem('auth-test-phase', 'it-02-post-kill')
   storage.retrieve all 3 keys and cache expected values in sessionStorage

2. After app relaunch:
   On AuthVerifyRunner mount, check sessionStorage.getItem('auth-test-phase')
   If === 'it-02-post-kill': resume IT-02 verification
   If null: start IT-01 (first run)
```

### 8.4 Test Resumption After Relaunch

The `AuthVerifyRunner` component must handle three startup scenarios:

| Scenario | sessionStorage `auth-test-phase` | Behavior |
|---|---|---|
| First run | `null` | Start from IT-01 |
| Post-kill resume | `'it-02-post-kill'` | Resume IT-02 verification, then continue to IT-03 |
| Subsequent runs | `'completed'` (set after all tests pass) | Display completed report; allow re-run via button |

---

## 9. Database Changes

**None.** This task does not touch SQLite. All token state is stored in Android Keystore via `capacitor-secure-storage-plugin`, not the application database. No migration, no schema change.

---

## 10. Error Handling

### 10.1 Error Types Produced by Tests

| Scenario | `TestResult.status` | Behaviour |
|---|---|---|
| Test passes all verifications | `'PASS'` | Continue to next test |
| Test outcome does not match expected | `'FAIL'` | Record expected vs. actual; continue to next test |
| Test throws unexpected error | `'ERROR'` | Record error message + optional stack; continue to next test |
| Pre-requisite test failed → cannot run | `'SKIP'` | Skip dependent test; record which prerequisite failed |
| IT-01 fails (critical) | `'FAIL'` | Set `criticalFailed = true` in report; skip all dependent tests |

### 10.2 Test Execution Resilience

```
runAuthVerify():
  ├─ IT-01: wrapped in try/catch
  │    ├─ PASS → next test; criticalFailed = false
  │    ├─ FAIL → next test (SKIP all dependent: IT-02, IT-03, IT-04); criticalFailed = true
  │    └─ ERROR → next test (SKIP all dependent); criticalFailed = true
  ├─ IT-02: if IT-01 FAIL/ERROR → SKIP; else try/catch
  │    ├─ PASS → next test
  │    ├─ FAIL → next test (IT-03 still runnable — IT-02 failure doesn't block refresh)
  │    └─ ERROR → next test
  ├─ IT-03: if IT-01 FAIL/ERROR → SKIP; else try/catch
  ├─ IT-04: if IT-01 FAIL/ERROR → SKIP; else try/catch
  ├─ IT-05: independent — always runs (only needs clean storage)
  └─ REPORT always returned (even if all tests fail)
```

### 10.3 User Guidance for Manual Steps

The `AuthVerifyRunner` must render clear instructions before each manual step:

| Test | Manual Action | UI Instruction |
|---|---|---|
| IT-01 | Consent in browser | "Opening browser for Google sign-in. Please select your test account and consent to access." |
| IT-02 (pre-kill) | Verify tokens stored | "Tokens stored successfully. Now kill the app (swipe from recents or Settings > Force Stop) and relaunch." |
| IT-02 (post-kill) | Verify tokens survive | "App relaunched. Verifying tokens survived app kill..." |
| IT-05 | Consent in browser | "Opening browser for OAuth. Please consent. This verifies the com.collectio.app:// deep link." |
| IT-05 (cancel) | Cancel in browser | "Opening browser again. Please click CANCEL on the Google consent screen." |

---

## 11. Logging Requirements

| Event | Level | Message | Rationale |
|---|---|---|---|
| Test start | `info` | `"=== E-04 T-04.7: Capacitor Auth + Storage Integration Tests ==="` | Banner |
| Test case start | `info` | `"[IT-01] Starting: Full OAuth PKCE flow on Android"` | Per-test tracking |
| Test case pass | `info` | `"[IT-01] PASS (3.2s) — Full OAuth PKCE flow"` | Duration visible |
| Test case fail | `warn` | `"[IT-03] FAIL (0.8s) — Refresh expected new access token, got same token"` | Expected vs. actual in message |
| Test case error | `error` | `"[IT-02] ERROR — TypeError: ..."` | Stack trace for debugging |
| Test case skip | `info` | `"[IT-02] SKIP — IT-01 prerequisite did not pass"` | Dependency visibility |
| Browser opened | `debug` | `"[IT-01] Browser opened for OAuth consent"` | Diagnostic |
| Deep link received | `debug` | `"[IT-01] Deep link received via appUrlOpen"` | Diagnostic; never log URL query params (may contain code) |
| Token exchange result | `debug` | `"[IT-01] Token exchange: success (access token present: yes, refresh token present: yes)"` | Presence only; no token values |
| Report summary | `info` | `"Result: 4/5 passed. 1 failed. 0 skipped. 0 errors."` | Final summary |

**Prohibited from logging:** `access_token`, `refresh_token`, `code_verifier`, `code_challenge`, full `appUrlOpen` URL (contains auth code), token endpoint response body (Rule 12.2, Rule 6.5). Token presence checks (e.g., "access token present: yes") are acceptable.

---

## 12. Security Requirements

| # | Requirement | Source | How Enforced |
|---|---|---|---|
| 1 | Never log access token or refresh token values | Rule 6.5, Rule 12.2 | Code review of `console.*` and report `actual` fields; use presence checks only |
| 2 | `code_verifier` nullified after token exchange | Rule 12.3 | Handled by `CapacitorAuthProvider.signIn()` (already implemented with `finally` block) |
| 3 | Never store `code_verifier` in `localStorage`, `sessionStorage`, or `IndexedDB` | Rule 6.5 | Test script stores only `auth-test-phase` flag in sessionStorage (no secrets); `code_verifier` handled by `CapacitorAuthProvider` |
| 4 | OAuth client ID configurable (not hardcoded in verify function) | Rule 13.1 | `runAuthVerify(config: AuthTestConfig)` accepts `OAuthConfig` from caller |
| 5 | No `client_secret` anywhere | NFR-SEC-04 | PKCE flow does not use client secret; grep verification |
| 6 | Report `actual` fields do not contain tokens | Rule 12.2 | Presence checks only ("access token present: yes") |
| 7 | Android Keystore verified working | NFR-SEC-02, PK-03 | IT-02 verifies data survives app kill |
| 8 | `com.collectio.app://` deep link verified | Rule 6.2 | IT-05 verifies deep link routes to app correctly |
| 9 | `prompt=consent` in auth URL | Rule 6.4 | Verified by `CapacitorAuthProvider.buildAuthUrl()` — already implemented |
| 10 | No `electron` or `node:*` imports in verify scripts | Rule 13.4 | Grep verification |

---

## 13. Acceptance Criteria

| # | Criterion | Verification |
|---|---|---|
| AC-01 | `capacitor-auth-verify.ts` created at `packages/platform/src/capacitor/__verify__/` | File exists |
| AC-02 | `capacitor-auth-types.ts` created at same path | File exists |
| AC-03 | `AuthVerifyRunner.tsx` created at same path | File exists |
| AC-04 | Script exports `runAuthVerify(config: AuthTestConfig): Promise<VerifyReport>` | TypeScript compilation |
| AC-05 | Script does NOT use `describe`, `it`, `test`, `expect` or Jest globals | grep verification |
| AC-06 | `AuthVerifyRunner` follows `VerifyRunner.tsx` visual pattern (table, status colors, copy button) | Visual inspection; code review |
| AC-07 | IT-01: Full OAuth PKCE flow completes on Android device with real Google account | Manual run; tokens returned, stored in Keystore |
| AC-08 | IT-02: Tokens survive app kill (swipe from recents) and relaunch | Manual run; `getStoredTokens()` returns same tokens |
| AC-09 | IT-03: `refreshAccessToken()` returns new access token with updated expiry | Manual run; token differs from IT-01, expiry updated |
| AC-10 | IT-04: `signOut()` clears all 3 Keystore keys; `getStoredTokens()` returns `null` | Manual run |
| AC-11 | IT-05: `appUrlOpen` fires after Google redirect; auth code extracted; `AuthCancelledError` on cancel | Manual run; both sub-tests pass |
| AC-12 | Report rendered in React UI with PASS/FAIL/ERROR color coding | Visual verification on device |
| AC-13 | `window.__authVerifyReport` accessible (for copy-to-clipboard) | Dev console verification |
| AC-14 | IT-02 app-kill resume via `sessionStorage` flag works correctly | Manual run; relaunch continues from IT-02 |
| AC-15 | `criticalFailed` set to `true` if IT-01 fails | Code review; IT-01 failure → dependent tests skipped |
| AC-16 | `apps/capacitor/src/index.tsx` renders `AuthVerifyRunner` instead of `VerifyRunner` | Code review |
| AC-17 | `packages/platform/package.json` exports new `__verify__` files | File exists; imports resolve |
| AC-18 | TypeScript compiles clean across all packages | `pnpm typecheck` returns zero errors |
| AC-19 | Lint passes | `pnpm lint` returns zero errors |
| AC-20 | No token values in `console.log` or report `actual` fields | Code review (Rule 12.2) |
| AC-21 | No `client_secret` or `clientSecret` in any file | grep verification |
| AC-22 | No `electron` or `node:*` imports in verify scripts | grep verification |
| AC-23 | `AuthVerifyRunner.tsx` uses `.tsx` extension (Rule 11.6) | File extension check |
| AC-24 | `capacitor-auth-verify.ts` uses `.ts` extension (no JSX) | File extension check |
| AC-25 | Manual run: all 5 tests pass on physical Android device with real Google account | Actual on-device execution |

---

## 14. Test Cases (What the Script Exercises)

### 14.1 IT-01: Full OAuth PKCE Flow on Android Device

| Property | Detail |
|---|---|
| **ID** | `IT-01` |
| **Description** | Full OAuth PKCE flow completes and returns valid tokens on Capacitor Android |
| **Pre-conditions** | Clean Keystore (no existing tokens); Google Cloud Console "Android" OAuth client configured with package name `com.collectio.app` and SHA-1 fingerprint |
| **Manual step** | Tester consents in system browser |
| **Expected** | Returns `AuthTokens` with non-empty `accessToken`, `refreshToken`, and `expiresAt > Date.now()`; tokens stored in Android Keystore |
| **Failure modes** | Token exchange error (network/Google reject) → `AuthNetworkError`; timeout (5 min) → `AuthCancelledError`; intent filter misconfiguration → browser never returns to app |

### 14.2 IT-02: Token Survival Across App Kill

| Property | Detail |
|---|---|
| **ID** | `IT-02` |
| **Description** | Tokens persist across app kill and relaunch (Android Keystore survives) |
| **Pre-conditions** | IT-01 passed (tokens stored via `capacitor-secure-storage-plugin`) |
| **Manual step** | Tester kills app (swipe from recents OR Settings > Force Stop) and relaunches |
| **Expected** | New `CapacitorStorageProvider` instance returns matching tokens via `getStoredTokens()` after relaunch |
| **Failure modes** | Keystore cleared by aggressive OEM (KC-09) → tokens lost; `capacitor-secure-storage-plugin` `get()` error → returns `null` |

### 14.3 IT-03: Refresh Access Token

| Property | Detail |
|---|---|
| **ID** | `IT-03` |
| **Description** | Access token is refreshed successfully via `fetch()` to Google's token endpoint |
| **Pre-conditions** | IT-01 passed (valid refresh token in Keystore) |
| **Steps** | 1. `getStoredTokens()` → 2. `refreshAccessToken(refreshToken)` → 3. `getStoredTokens()` again |
| **Expected** | Returns new `accessToken` (different from IT-01); `expiresAt` updated; storage keys updated; if Google rotates refresh token, new one stored |
| **Failure modes** | Google rejects refresh token → `AuthNetworkError`; `fetch()` network failure → error |

### 14.4 IT-04: Sign Out Clears Tokens

| Property | Detail |
|---|---|
| **ID** | `IT-04` |
| **Description** | Sign out deletes all stored tokens from Android Keystore |
| **Pre-conditions** | IT-01 passed (tokens stored) |
| **Steps** | 1. `signOut()` → 2. `getStoredTokens()` → 3. Individual `storage.retrieve()` for each key |
| **Expected** | `getStoredTokens()` returns `null`; all 3 individual retrieves return `null`; `safeDelete` handles "does not exist" errors idempotently (Rule 7.1) |
| **Failure modes** | `capacitor-secure-storage-plugin.remove()` fails with non-idempotent error → `delete()` propagates error |

### 14.5 IT-05: Verified URI Scheme Deep Link Receives Auth Code

| Property | Detail |
|---|---|
| **ID** | `IT-05` |
| **Description** | `com.collectio.app://` deep link correctly delivers OAuth authorization code to `appUrlOpen` listener |
| **Pre-conditions** | Clean Keystore (IT-04 completed) |
| **Manual step** | (a) Tester consents in browser → verify deep link with auth code; (b) Tester clicks Cancel in browser → verify error deep link |
| **Expected (sub-a)** | `App.addListener('appUrlOpen')` fires; URL contains `code` param; auth code extracted; token exchange succeeds |
| **Expected (sub-b)** | `App.addListener('appUrlOpen')` fires; URL contains `error=access_denied`; `signIn()` rejects with `AuthCancelledError` |
| **Failure modes** | Intent filter missing from `AndroidManifest.xml` → browser redirects to "URL not recognized"; `allowNavigation` missing → WebView blocks deep link; redirect arrives before listener registered → race condition (Rule 6.3 mitigates) |

---

## 15. Definition Of Done

| # | Criterion | How Verified |
|---|---|---|
| DOD-01 | `capacitor-auth-verify.ts` created at `packages/platform/src/capacitor/__verify__/` | File exists |
| DOD-02 | `capacitor-auth-types.ts` created at same path | File exists |
| DOD-03 | `AuthVerifyRunner.tsx` created at same path | File exists |
| DOD-04 | `runAuthVerify(config)` exported and returns `Promise<VerifyReport>` | TypeScript compilation |
| DOD-05 | `AuthVerifyRunner` renders test table with PASS/FAIL/ERROR colors matching `VerifyRunner.tsx` style | Visual inspection |
| DOD-06 | All 5 test cases implemented in sequential order with dependency checks | Code review |
| DOD-07 | Each test case wrapped in try/catch; failure in one does not crash the runner | Code review |
| DOD-08 | IT-01 failure sets `criticalFailed = true` and skips IT-02, IT-03, IT-04 | Code review |
| DOD-09 | IT-02 uses sessionStorage for app-kill resume detection | Code review |
| DOD-10 | IT-05 includes both consent-success and cancel-error sub-tests | Code review |
| DOD-11 | Manual instructions rendered in UI before IT-01, IT-02, IT-05 manual steps | Code review |
| DOD-12 | `window.__authVerifyReport` set after test completion | Dev console verification |
| DOD-13 | Copy JSON Report button present and functional | Click test on device |
| DOD-14 | Script does NOT import Jest globals (`describe`, `it`, `expect`) | grep verification |
| DOD-15 | `apps/capacitor/src/index.tsx` renders `<AuthVerifyRunner />` | Code review |
| DOD-16 | `packages/platform/package.json` exports 3 new `__verify__` paths | File check; import resolution |
| DOD-17 | `pnpm typecheck` passes with zero errors across all packages | CLI |
| DOD-18 | `pnpm lint` passes with zero errors across all packages | CLI |
| DOD-19 | Zero `console.*` calls that include token values | Code review (Rule 12.2) |
| DOD-20 | Zero `client_secret` or `clientSecret` in any file | grep verification |
| DOD-21 | Zero `electron` or `node:*` imports in any of the 3 new files | grep verification |
| DOD-22 | `AuthVerifyRunner.tsx` uses `.tsx` extension; other files use `.ts` | File extension check (Rule 11.6) |
| DOD-23 | Manual run on physical Android device: all 5 tests pass with real Google account | On-device execution |
| DOD-24 | Manual run: tokens survive Settings > Force Stop (not just swipe from recents) | On-device verification (IT-02) |
| DOD-25 | Existing Jest tests in platform package still pass | `pnpm --filter @collectio/platform test` |
| DOD-26 | `capacitor-sqlite-verify` remain importable and compilable (not broken by index.tsx swap) | Build check |

---

## Appendix A: Dependency Map

```
E-04 T-04.2 (CapacitorAuthProvider) ── DONE ── The SUT for IT-01 through IT-05
E-04 T-04.4 (CapacitorStorageProvider) ── DONE ── Android Keystore; app-kill survival (IT-02)
E-01 T-01.6 (Capacitor app scaffold) ── DONE ── apps/capacitor/ with Android project
E-02 T-02.5/T-02.6 (Capacitor SQLite verification) ── DONE ── Established __verify__ pattern

E-04 T-04.7 (Integration Tests: Capacitor Auth + Storage) ── THIS TASK
    │
    └── QUALITY GATE ── must pass before proceeding to T-04.8 (DI Setup) and E-09 (GoogleDriveProvider)
```

## Appendix B: Architectural Traceability

| Architecture Requirement | Where Addressed |
|---|---|
| `AuthProvider` interface exercised end-to-end on Capacitor (01_ARCHITECTURE.md §4) | IT-01 through IT-05 exercise all 4 `AuthProvider` methods |
| `SecureStorageProvider` validated with real Android Keystore (01_ARCHITECTURE.md §4) | IT-02 validates Keystore survives app kill; IT-04 validates `delete()` idempotency |
| PKCE OAuth flow verified on Capacitor (NFR-SEC-04) | IT-01 performs full Browser.open → appUrlOpen → fetch() token exchange |
| "Android" OAuth client type with `com.collectio.app://` redirect (Rule 6.1, Rule 6.2) | IT-05 verifies deep link delivers auth code via `com.collectio.app://` scheme |
| `appUrlOpen` listener before `Browser.open()` (Rule 6.3) | IT-01 and IT-05 exercise the listener-first ordering |
| `prompt=consent` in auth URL (Rule 6.4) | Implicitly verified — refresh token is always returned (IT-01 validates `refreshToken` is non-null) |
| Platform-specific code isolation (Rule 13.1) | Test script only imports Capacitor providers; no Electron or cross-platform code |
| Never log tokens (Rule 6.5, Rule 12.2) | §11, §12 S-01 |
| Never persist `code_verifier` (Rule 12.3) | Handled by `CapacitorAuthProvider.finally` block |
| `AndroidManifest.xml` intent filter (RC-04) | IT-05 verifies deep link routing works |
| `capacitor.config.ts` `allowNavigation` (RC-03) | IT-05 verifies WebView allows `com.collectio.app://*` navigation |
| `MainActivity.java` plugin registration (RC-05) | IT-01 verifies `capacitor-secure-storage-plugin` is registered and functional |
| No automated E2E on Android (FR-07) | This is a manual test — aligns with FR-07 limitation |

## Appendix C: Prerequisites Before Running

Before this integration test can be executed, the developer must:

1. **Create a Google Cloud Console OAuth 2.0 client for Android:**
   - Application type: **"Android"** (Rule 6.1)
   - Package name: `com.collectio.app` (must match `appId` in `capacitor.config.ts:4`)
   - SHA-1 certificate fingerprint from debug keystore:
     ```powershell
     keytool -keystore %USERPROFILE%\.android\debug.keystore -list -v
     ```
   - Download the client configuration (client ID)

2. **Set the client ID in the test config:**
   Update the `OAuthConfig` constant in `AuthVerifyRunner.tsx` (or a shared config module):
   ```typescript
   const TEST_CONFIG: AuthTestConfig = {
     oauth: {
       clientId: '<android-client-id>.apps.googleusercontent.com',
       redirectUri: 'com.collectio.app://',
       scopes: ['https://www.googleapis.com/auth/drive.appdata'],
     },
   };
   ```

3. **Verify `AndroidManifest.xml` has the OAuth intent filter** (RC-04 — should already be present):
   ```xml
   <data android:scheme="com.collectio.app" android:host="" />
   ```

4. **Verify `MainActivity.java` registers `SecureStoragePluginPlugin`** (RC-05 — should already be present from E04 T04)

5. **Build and deploy to physical Android device:**
   ```powershell
   pnpm --filter @collectio/capacitor-app build
   pnpm --filter @collectio/capacitor-app cap:sync
   pnpm --filter @collectio/capacitor-app cap:open
   ```

6. **Have a test Google account available** with no sensitive Drive data (the app accesses `drive.appdata` — the app's own hidden folder, but use a test account for safety).

## Appendix D: Why `__verify__/` Not `__tests__/`

The Capacitor verification pattern uses `packages/platform/src/capacitor/__verify__/` — not `__tests__/`. This is deliberate:

| Reason | Detail |
|---|---|
| **Jest avoidance** | Jest's `testMatch` is `**/__tests__/**/*.test.ts`. Files in `__verify__/` are never picked up by Jest — no `testPathIgnorePatterns` needed. |
| **Established convention** | `capacitor-sqlite-verify.ts`, `capacitor-sqlite-types.ts`, and `VerifyRunner.tsx` all live in `__verify__/`. The auth tests follow the same pattern for discoverability. |
| **Runtime context** | These scripts run inside Capacitor WebView, not Node.js/Jest. They use real Capacitor plugins (`@capacitor/browser`, `capacitor-secure-storage-plugin`). Jest cannot load these. |
| **Export convention** | These are not test files that run automatically — they export functions (`runVerify`, `runAuthVerify`) that are called by React components. |

This deviates from the epic's `__tests__/capacitor-auth.test.ts` path but aligns with the established codebase convention.

## Appendix E: Known Issue Resolution

This task resolves **KI-01**: "OAuth PKCE Flow Not Fully Verified End-to-End" (06_IMPLEMENTATION_DECISIONS.md §6). The E-00b spike implemented but never completed the OAuth PKCE flow. A passing run of all 5 integration tests on a physical Android device closes this known issue for the Capacitor platform.

The Electron equivalent (E-04 T-04.6) closes KI-01 for the Electron platform.
