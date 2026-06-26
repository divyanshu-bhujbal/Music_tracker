# E-04 T-05 — Implement TokenRefresher (Shared)

**Parent Epic:** E-04: Platform Services
**Type:** Production Implementation (Platform Services Layer — Shared)
**Criticality:** FOUNDATION — `TokenRefresher` is the single mechanism through which the application obtains a valid access token for Google Drive API calls. Without it, the Sync Engine (E-10) and `GoogleDriveProvider` (E-09) have no way to ensure a non-expired token before each API call.

---

## 1. Goal

Implement `TokenRefresher` — a shared, platform-agnostic class that wraps `AuthProvider.refreshAccessToken()` with:

- **In-memory token cache** — avoids hitting `SecureStorageProvider` on every access token check
- **Proactive refresh** — if the access token has ≤5 minutes remaining, refresh before returning
- **Coalesced concurrent calls** — multiple simultaneous `getAccessToken()` calls produce exactly one refresh
- **Exponential backoff on repeated failure** — 1s, 2s, 4s, 8s, 16s, 32s delay between retry attempts across calls (5 max attempts; permanently fail on 6th)
- **`needsReauth` flag** — set `true` when all retries exhausted; read by consumers to prompt user re-authentication
- **Resettable state** — `setTokens()` clears `needsReauth` and resets backoff on fresh sign-in

The class is stateless with respect to persistence — it delegates all token persistence to `AuthProvider`. It holds in-memory state for the current access token, refresh token, expiry, and failure tracking. It is designed as a singleton injected via DI (E-04 T-04.8), consumed by `GoogleDriveProvider` (E-09), the Sync Engine (E-10), and any future component that needs a Drive API access token.

---

## 2. Scope

| In Scope | Rationale |
|---|---|
| `TokenRefresher` class in `packages/platform/src/shared/` | Shared platform code — works identically on Electron and Capacitor |
| `getAccessToken()`: cached-valid → return; near-expiry → refresh → return new; refresh fails → set `needsReauth`, return `null` | Core method consumed by GoogleDriveProvider and Sync Engine |
| `setTokens(tokens: AuthTokens)`: seed or update in-memory cache | Called after sign-in and app startup (from `AuthProvider.getStoredTokens()`) |
| `clear()`: nullify all in-memory state (does NOT clear SecureStorage) | Called on sign-out; TokenRefresher loses ability to refresh until `setTokens()` is called again |
| `needsReauth` read-only property: exposes whether user must re-authenticate | Consumed by Sync Engine state machine (WARNING state), sidebar status, and GoogleDriveProvider |
| Proactive refresh window: 5 minutes before `expiresAt` | Ensures token never expires mid-API-call |
| Concurrency coalescing: only one refresh in flight at a time | Prevents double-exchange of refresh token (Google may rotate it) |
| Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s between retry attempts; max 5 retries | Graceful degradation; prevents thundering-herd on Google's token endpoint |
| `AuthTokens` type reused from `@collectio/shared` | No duplicate type definition |
| `AuthNetworkError` catch-and-handle | Specific error class for refresh failures; other errors propagate |
| Barrel export from `packages/platform/src/shared/index.ts` | Makes class importable |
| Unit tests in `packages/platform/src/shared/__tests__/` | Jest with mocked `AuthProvider` |

---

## 3. Out of Scope

| Out of Scope | Why | Where It Belongs |
|---|---|---|
| `AuthProvider` interface definition | Already exists in `packages/shared/src/domain/interfaces/AuthProvider.ts` | E-04 T-04.1 |
| `ElectronAuthProvider` / `CapacitorAuthProvider` implementations | Already implemented; TokenRefresher consumes them through the `AuthProvider` interface | E-04 T-04.1, T-04.2 |
| Token persistence to SecureStorage | Delegated to `AuthProvider.refreshAccessToken()` which already persists | E-04 T-04.1, T-04.2 |
| `GoogleDriveProvider` implementation | Separate provider; consumes `TokenRefresher.getAccessToken()` | E-09 |
| Sync Engine token integration | Separate epic; consumes `TokenRefresher` for Drive API auth | E-10 |
| Dependency injection wiring | DI container setup is a dedicated task | E-04 T-04.8 |
| `CodeVerifier` generation or OAuth PKCE flow | Handled by `AuthProvider.signIn()` | E-04 T-04.1, T-04.2 |
| Token revocation (remote sign-out) | Out of scope for V1 per MR-03 | N/A |
| Multiple Google account support | Out of scope for V1 per FR-AUTH-10 | Future |
| Any Electron or Capacitor platform API | Pure TypeScript — no platform imports | N/A |

---

## 4. Files To Create

| # | File | Purpose | Responsibility |
|---|---|---|---|
| 1 | `packages/platform/src/shared/TokenRefresher.ts` | Main class — in-memory token cache, proactive refresh, backoff, concurrency coalescing | Accepts `AuthProvider` via constructor. Provides `getAccessToken()`, `setTokens()`, `clear()`, `needsReauth`. Pure TypeScript — zero platform imports. |
| 2 | `packages/platform/src/shared/__tests__/TokenRefresher.test.ts` | Unit tests — 18 test cases covering all paths | Jest with mocked `AuthProvider`. No real OAuth server, no native modules. |

---

## 5. Files To Modify

| # | File | Action | Detail |
|---|---|---|---|
| 1 | `packages/platform/src/shared/index.ts` | **Edit** | Replace `export {};` with `export { TokenRefresher } from './TokenRefresher.js';` |

---

## 6. Interfaces

### 6.1 Consumed Interface: `AuthProvider` (prerequisite — already exists)

**Location:** `packages/shared/src/domain/interfaces/AuthProvider.ts`

```
interface AuthProvider {
  signIn(): Promise<AuthTokens>;
  refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: number }>;
  signOut(): Promise<void>;
  getStoredTokens(): Promise<AuthTokens | null>;
}
```

TokenRefresher calls:
- `refreshAccessToken(refreshToken)` — single method; returns new `{ accessToken, expiresAt }`
- Does NOT call `signIn()`, `signOut()`, or `getStoredTokens()` (these are called externally by DI/app startup code)

### 6.2 Consumed Type: `AuthTokens` (prerequisite — already exists)

**Location:** `packages/shared/src/domain/interfaces/AuthProvider.ts`

```
interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;  // Unix epoch milliseconds
}
```

### 6.3 Consumed Error: `AuthNetworkError` (prerequisite — already exists)

**Location:** `packages/shared/src/domain/errors/AuthNetworkError.ts`

TokenRefresher catches this error from `AuthProvider.refreshAccessToken()`. All other errors propagate uncaught.

### 6.4 TokenRefresher Public API

```
class TokenRefresher {
  constructor(authProvider: AuthProvider);

  // Returns a valid access token or null if unable to obtain one.
  // If token is valid (>5 min remaining): returns cached token without refresh.
  // If token is near-expiry or expired: attempts refresh via AuthProvider.
  // If refresh succeeds: caches new token, resets backoff, returns new access token.
  // If refresh fails: applies backoff, sets needsReauth after max retries, returns null.
  getAccessToken(): Promise<string | null>;

  // Seed or update the in-memory token cache. Resets needsReauth to false
  // and clears backoff state. Called after sign-in and app startup.
  setTokens(tokens: AuthTokens): void;

  // Clear all in-memory state. Does NOT clear SecureStorage.
  // Called on sign-out. After clear(), getAccessToken() returns null.
  clear(): void;

  // True when all refresh retries have been exhausted. False after setTokens().
  // Consumers use this to display re-authentication prompts and disable sync.
  get needsReauth(): boolean;
}
```

---

## 7. Data Flow

### 7.1 App Startup / Post-Sign-In Seeding

```
1.  CALLER (app startup or sign-in flow) obtains AuthTokens:
    - Startup: await authProvider.getStoredTokens()
    - Sign-in: tokens = await authProvider.signIn()

2.  CALLER invokes tokenRefresher.setTokens(tokens)
    - In-memory accessToken, refreshToken, expiresAt ← tokens
    - needsReauth ← false
    - backoff counter ← 0
    - backoff timer ← null
    - pending refresh promise ← null

3.  CALLER can now invoke tokenRefresher.getAccessToken() at any time
```

### 7.2 getAccessToken() — Normal Path (Token Valid)

```
1.  CALLER invokes tokenRefresher.getAccessToken()

2.  CHECK in-memory cache:
    - If accessToken is null → return null (not seeded)
    - If needsReauth is true AND backoff timer hasn't elapsed → return null

3.  CHECK expiry:
    - expiresAt - Date.now() > 300,000ms (5 min) → return cached accessToken

4.  Token is near-expiry or expired → PROCEED TO REFRESH (see §7.3)
```

### 7.3 getAccessToken() — Refresh Path

```
1.  CHECK for in-flight refresh:
    - If a pending refresh Promise exists → await it and return its result
    - This coalesces concurrent calls into a single refresh

2.  SET pending refresh Promise = (async () => { ... })()

3.  ATTEMPT refresh:
    - CALL authProvider.refreshAccessToken(refreshToken)
    - ON SUCCESS:
        a. accessToken, expiresAt ← result
        b. If Google rotated the refresh token, it's already persisted by AuthProvider
        c. backoff counter ← 0
        d. backoff timer ← null
        e. needsReauth ← false
        f. pending refresh ← null
        g. RETURN accessToken
    - ON AuthNetworkError:
        a. backoff counter++
        b. IF backoff counter > 5:
             needsReauth ← true
             pending refresh ← null
             RETURN null
        c. ELSE:
             SET backoff delay = 1000ms * 2^(counter-1)  (1s, 2s, 4s, 8s, 16s)
             SET backoff timer = Date.now() + delay
             pending refresh ← null
             RETURN null
    - ON other Error:
        a. pending refresh ← null
        b. THROW (unexpected error — propagate to caller)

4.  Next getAccessToken() call:
    - If backoff timer elapsed → retry refresh (go to step 2)
    - If within backoff window → return null without retry
    - If needsReauth → return null permanently until setTokens()
```

### 7.4 clear() Path

```
1.  CALLER invokes tokenRefresher.clear()

2.  NULLIFY all in-memory state:
    - accessToken ← null
    - refreshToken ← null
    - expiresAt ← 0
    - needsReauth ← false
    - backoff counter ← 0
    - backoff timer ← null
    - pending refresh ← null

3.  NO SecureStorage modification — caller must separately call authProvider.signOut()
```

### 7.5 setTokens() Path

```
1.  CALLER invokes tokenRefresher.setTokens(tokens)

2.  SET in-memory state:
    - accessToken ← tokens.accessToken
    - refreshToken ← tokens.refreshToken
    - expiresAt ← tokens.expiresAt

3.  RESET failure state:
    - needsReauth ← false
    - backoff counter ← 0
    - backoff timer ← null
    - pending refresh ← null
```

---

## 8. State Changes

### 8.1 In-Memory State Table

| Field | Type | Initial | After `setTokens()` | After refresh success | After refresh failure (<5 retries) | After refresh failure (≥5 retries) | After `clear()` |
|---|---|---|---|---|---|---|---|
| `accessToken` | `string \| null` | `null` | tokens.accessToken | new accessToken | unchanged (stale) | unchanged (stale) | `null` |
| `refreshToken` | `string \| null` | `null` | tokens.refreshToken | unchanged | unchanged | unchanged | `null` |
| `expiresAt` | `number` | `0` | tokens.expiresAt | new expiresAt | unchanged (stale) | unchanged (stale) | `0` |
| `needsReauth` | `boolean` | `false` | `false` | `false` | `false` | `true` | `false` |
| `backoffCounter` | `number` | `0` | `0` | `0` | incremented | `6` | `0` |
| `backoffUntil` | `number \| null` | `null` | `null` | `null` | `Date.now() + delay` | `null` | `null` |
| `pendingRefresh` | `Promise<string \| null> \| null` | `null` | `null` | `null` (resolved) | `null` (rejected) | `null` (rejected) | `null` |

### 8.2 Storage State

**None.** TokenRefresher does not read from or write to `SecureStorageProvider`. All token persistence is handled by `AuthProvider.refreshAccessToken()` internally (which writes to `SecureStorageProvider` via storage keys `auth_access_token`, `auth_refresh_token`, `auth_expires_at`).

### 8.3 Backoff Sequence

| Attempt | Delay Before Next Attempt | Effect |
|---|---|---|
| 1st failure | 1s | `needsReauth` still `false`; retry allowed after 1s |
| 2nd failure | 2s | `needsReauth` still `false`; retry allowed after 2s |
| 3rd failure | 4s | `needsReauth` still `false` |
| 4th failure | 8s | `needsReauth` still `false` |
| 5th failure | 16s | `needsReauth` still `false`; last retry window |
| 6th failure | — | `needsReauth` → `true`; permanent failure until `setTokens()` |

---

## 9. Database Changes

**None.** TokenRefresher stores no data in SQLite. All token state is in-memory. Token persistence is delegated to `AuthProvider` → `SecureStorageProvider` (platform secure storage), never the application database (NFR-SEC-01, NFR-SEC-02).

---

## 10. Error Handling

### 10.1 Error Types

| Error | When Thrown | TokenRefresher Behavior |
|---|---|---|
| `AuthNetworkError` | `AuthProvider.refreshAccessToken()` fails (network, Google rejects token) | Catch, increment backoff, set `needsReauth` after 5 retries, return `null` |
| `TypeError` / unexpected | Constructor receives non-conforming `AuthProvider` | Fail fast — app must not start with misconfigured DI |
| Any other `Error` | Unexpected runtime failure in `refreshAccessToken()` | Propagate to caller (do not catch) |

### 10.2 Error Boundaries

```
getAccessToken():
  └─ refreshAccessToken() call:
       ├─ AuthNetworkError → handled (backoff logic, see §7.3)
       └─ Other Error → propagate (caller handles)
```

### 10.3 Defensive Checks

| Check | When | Behavior |
|---|---|---|
| `accessToken` is `null` and `needsReauth` is `false` | `getAccessToken()` called before `setTokens()` | Return `null` — not an error, just unseeded |
| `refreshToken` is `null` | `getAccessToken()` attempts refresh | Return `null` — cannot refresh without a refresh token |
| `needsReauth` is `true` and `setTokens()` called | Explicit re-seed | Reset all failure state; re-enable |
| Concurrent `getAccessToken()` calls | During in-flight refresh | Coalesce — both await same pending Promise |
| `Date.now()` clock skew | Expiry comparison | Token may appear valid when actually expired (or vice versa). 5-minute buffer mitigates but does not eliminate. |
| `clear()` called during in-flight refresh | Race between sign-out and refresh | Pending refresh Promise continues but result is discarded (in-memory state already nullified) |

---

## 11. Logging Requirements

| Event | Level | Message | Rationale |
|---|---|---|---|
| Refresh success | `debug` | `"TokenRefresher: refresh successful"` | Diagnostic for sync troubleshooting; never includes token values (Rule 12.2) |
| Refresh failure (with retries remaining) | `warn` | `"TokenRefresher: refresh failed (attempt N/5): <error message>"` | Visibility into transient failures; error message stripped of secrets |
| Refresh failure (max retries, needsReauth set) | `warn` | `"TokenRefresher: token refresh permanently failed — needsReauth set"` | User-visible consequence; must be logged |
| `setTokens()` called while `needsReauth` was `true` | `info` | `"TokenRefresher: re-authenticated — needsReauth cleared"` | Signals recovery path |
| `clear()` called | `debug` | `"TokenRefresher: state cleared"` | Lifecycle tracking |

**Prohibited from logging:** `accessToken`, `refreshToken`, `expiresAt`, the token value itself (Rule 12.2). Truncated previews (first 10 chars) are acceptable for diagnostics per Rule 12.2.

---

## 12. Security Requirements

| # | Requirement | Source | How Enforced |
|---|---|---|---|
| 1 | Never log access token or refresh token values | Rule 6.5, Rule 12.2 | Code review of all `console.*` calls; zero token values in log messages |
| 2 | Never persist tokens outside SecureStorageProvider | Rule 12.1, NFR-SEC-01 | TokenRefresher only stores tokens in-memory; all persistence delegated to AuthProvider → SecureStorageProvider |
| 3 | In-memory tokens nullified on `clear()` | Rule 6.5 | All fields set to `null`/`0`/`false` |
| 4 | No platform conditionals in TokenRefresher | Rule 13.1 | Pure TypeScript; zero `if (platform === '...')`, zero platform imports |
| 5 | No `electron`, `node:*`, or `@capacitor/*` imports | Rule 13.4 | Enforced via grep; class only imports from `@collectio/shared` |
| 6 | Constructor accepts `AuthProvider` via injection — no hardcoded config | Rule 13.1, AC pattern | `constructor(authProvider: AuthProvider)` |
| 7 | `refreshToken` must be non-null before attempting refresh | Defensive | Check in `getAccessToken()` before calling `refreshAccessToken()` |

---

## 13. Acceptance Criteria

| # | Criterion | Verification |
|---|---|---|
| AC-01 | Token valid (>5 min remaining) → `getAccessToken()` returns cached token without calling `refreshAccessToken()` | Unit test: seed with far-future token, call `getAccessToken()`, verify `refreshAccessToken()` was NOT called |
| AC-02 | Token near-expiry (≤5 min remaining) → `getAccessToken()` triggers refresh and returns new token | Unit test: seed with soon-expiring token, mock refresh success, verify new token returned |
| AC-03 | Token already expired → `getAccessToken()` triggers refresh and returns new token | Unit test: seed with expired token, mock refresh success, verify new token returned |
| AC-04 | Refresh success → caches new access token and expiry | Unit test: refresh succeeds; subsequent `getAccessToken()` returns new token without second refresh |
| AC-05 | Refresh success → resets `needsReauth` to `false` | Unit test: set `needsReauth` via forced failures, then successful refresh, verify `needsReauth` is `false` |
| AC-06 | Refresh failure → returns `null`, does NOT set `needsReauth` on first failure | Unit test: first refresh failure, verify returns `null`, `needsReauth` is `false` |
| AC-07 | 5 consecutive refresh failures → `needsReauth` becomes `true` | Unit test: 5 failures, verify `needsReauth` is `true` |
| AC-08 | `needsReauth` is `true` → `getAccessToken()` returns `null` without attempting refresh | Unit test: force `needsReauth = true`, call `getAccessToken()`, verify `refreshAccessToken()` NOT called |
| AC-09 | Backoff delay enforced between retries | Unit test: 1st failure, immediate `getAccessToken()` returns `null` (within 1s window), wait 1s+, retry succeeds |
| AC-10 | Concurrent `getAccessToken()` calls coalesce to single refresh | Unit test: 3 simultaneous `getAccessToken()` calls during near-expiry, verify `refreshAccessToken()` called exactly once, all 3 return same token |
| AC-11 | `setTokens()` resets `needsReauth` and backoff state | Unit test: force `needsReauth = true`, call `setTokens()`, verify `needsReauth` is `false`, next `getAccessToken()` works |
| AC-12 | `clear()` nullifies all state; subsequent `getAccessToken()` returns `null` | Unit test: seed with valid token, call `clear()`, verify `getAccessToken()` returns `null` |
| AC-13 | `getAccessToken()` before `setTokens()` returns `null` (no auth error) | Unit test: construct, call `getAccessToken()` immediately, verify returns `null` (not an error) |
| AC-14 | Unexpected error from `refreshAccessToken()` (not `AuthNetworkError`) propagates | Unit test: mock `refreshAccessToken()` to throw `TypeError`, verify `getAccessToken()` rejects with `TypeError` |
| AC-15 | TypeScript compiles clean across all packages | `pnpm typecheck` returns zero errors |
| AC-16 | All unit tests pass | `pnpm --filter @collectio/platform test -- TokenRefresher` |
| AC-17 | Lint passes | `pnpm lint` returns zero errors |
| AC-18 | No `electron`, `node:*`, or `@capacitor/*` imports | grep verification |
| AC-19 | No token values in `console.*` calls | Code review |
| AC-20 | `TokenRefresher` exported from `packages/platform/src/shared/index.ts` | Barrel export present |

---

## 14. Test Cases

### 14.1 Unit Tests (`packages/platform/src/shared/__tests__/TokenRefresher.test.ts`)

**Mock Strategy:** Create a mock `AuthProvider` object with `jest.fn()` for `refreshAccessToken()`. No real OAuth server. No Electron or Capacitor imports. Must work with `jsdom` test environment (pure TypeScript). Use `jest.useFakeTimers()` for backoff timing tests.

| # | Test | Input | Expected Result |
|---|---|---|---|
| UT-01 | **Token valid (>5 min remaining) — returns cached** | `setTokens({ accessToken: 'at', refreshToken: 'rt', expiresAt: Date.now() + 600_000 })`; call `getAccessToken()` | Returns `'at'`; `refreshAccessToken()` never called |
| UT-02 | **Token exactly at 5-minute boundary — returns cached (no refresh)** | `expiresAt: Date.now() + 300_000` | Returns `'at'`; `refreshAccessToken()` never called (boundary: > 300000 is valid, ≤ 300000 is near-expiry) |
| UT-03 | **Token near-expiry (≤5 min) — triggers refresh, returns new** | `expiresAt: Date.now() + 120_000`; mock refresh returns `{ accessToken: 'new-at', expiresAt: Date.now() + 3600_000 }` | Returns `'new-at'`; `refreshAccessToken()` called with `'rt'` |
| UT-04 | **Token already expired — triggers refresh, returns new** | `expiresAt: Date.now() - 1000`; mock refresh returns `{ accessToken: 'new-at', expiresAt: Date.now() + 3600_000 }` | Returns `'new-at'`; `refreshAccessToken()` called |
| UT-05 | **Refresh success caches new token** | Trigger refresh (UT-03 scenario); then call `getAccessToken()` again while new token still valid | Second call returns `'new-at'`; `refreshAccessToken()` called exactly once total |
| UT-06 | **Refresh success resets `needsReauth`** | Force 5 failures → `needsReauth` is `true`; then mock refresh to succeed; call `getAccessToken()` | `needsReauth` becomes `false`; returns new token |
| UT-07 | **First refresh failure — returns null, `needsReauth` stays `false`** | Mock `refreshAccessToken()` to throw `AuthNetworkError`; `expiresAt: Date.now() - 1000` | Returns `null`; `needsReauth` is `false` |
| UT-08 | **5 consecutive failures — `needsReauth` becomes `true`** | Mock `refreshAccessToken()` always throws `AuthNetworkError`; call `getAccessToken()` 5 times | 5th call returns `null`; `needsReauth` is `true` |
| UT-09 | **`needsReauth` prevents further refresh attempts** | Force `needsReauth = true` (UT-08); call `getAccessToken()` again | Returns `null`; `refreshAccessToken()` NOT called |
| UT-10 | **Backoff window enforced** | 1st refresh failure; immediately (0ms later) call `getAccessToken()` again | Returns `null` without calling `refreshAccessToken()` (within 1s backoff window) |
| UT-11 | **Backoff window elapsed — retry allowed** | 1st refresh failure; advance fake timers by 1500ms; call `getAccessToken()` | `refreshAccessToken()` called (retry); backoff window elapsed |
| UT-12 | **Exponential backoff progression** | Fail 3 times sequentially (waiting out each backoff window) | Verify delays are 1s, 2s, 4s (actual values tested via fake timers) |
| UT-13 | **Backoff reset on success** | Fail once, then succeed, then fail again → first failure after success should be backoff tier 1 (1s), not tier 2 | Backoff counter reset to 0 after success |
| UT-14 | **Concurrent calls coalesce — single refresh** | Seed near-expiry token; call `getAccessToken()` 3 times simultaneously (before first resolves); mock refresh takes 100ms | All 3 return same `'new-at'`; `refreshAccessToken()` called exactly **ONCE** |
| UT-15 | **`setTokens()` resets all failure state** | Force 5 failures → `needsReauth = true`; call `setTokens({ accessToken: 'fresh', refreshToken: 'rt2', expiresAt: Date.now() + 3600_000 })` | `needsReauth` is `false`; backoff counter is `0`; next `getAccessToken()` returns `'fresh'` without refresh |
| UT-16 | **`clear()` nullifies state** | Seed valid token; call `clear()`; call `getAccessToken()` | Returns `null`; no error thrown |
| UT-17 | **`getAccessToken()` before `setTokens()` returns `null`** | Construct TokenRefresher; call `getAccessToken()` immediately | Returns `null` (not an error, not a throw) |
| UT-18 | **Unexpected error propagates** | Mock `refreshAccessToken()` to throw `TypeError('boom')` | `getAccessToken()` rejects with `TypeError` (not caught by TokenRefresher) |
| UT-19 | **`setTokens()` with expired token triggers immediate refresh** | `setTokens({ accessToken: 'expired', refreshToken: 'rt', expiresAt: Date.now() - 1 })`; call `getAccessToken()` | Triggers refresh (token already expired); `refreshAccessToken()` called |
| UT-20 | **Refresh returns rotated refresh token — transparent to TokenRefresher** | Mock refresh returns new token; `AuthProvider` handles persistence internally | TokenRefresher uses the returned `accessToken` but does NOT track the new `refreshToken` — deferred to `AuthProvider` (TokenRefresher never calls `getStoredTokens()`) — **NOTE**: see §17.3 |

---

## 15. Definition Of Done

| # | Criterion | How Verified |
|---|---|---|
| DOD-01 | `TokenRefresher.ts` created in `packages/platform/src/shared/` | File exists |
| DOD-02 | `TokenRefresher` class has public API: `getAccessToken()`, `setTokens()`, `clear()`, `needsReauth` | TypeScript compilation |
| DOD-03 | Constructor accepts `AuthProvider` (injected, not hardcoded) | Code review |
| DOD-04 | Proactive refresh threshold is 5 minutes (300,000ms) | Code review; constant defined; UT-02 verifies boundary |
| DOD-05 | Concurrency coalescing: at most one in-flight `refreshAccessToken()` | UT-14 verifies |
| DOD-06 | Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s delays; max 5 retries | UT-12 verifies sequence |
| DOD-07 | `needsReauth` set after 6th failure (5 retries exhausted) | UT-08 verifies |
| DOD-08 | `needsReauth` cleared on `setTokens()` | UT-15 verifies |
| DOD-09 | All in-memory state nullified on `clear()` | UT-16 verifies |
| DOD-10 | `AuthNetworkError` caught; other errors propagate | UT-07, UT-18 verify |
| DOD-11 | All 20 unit tests pass | `pnpm --filter @collectio/platform test -- TokenRefresher` |
| DOD-12 | Zero `console.*` calls that include token values | Code review (Rule 12.2) |
| DOD-13 | Zero `electron`, `node:*`, or `@capacitor/*` imports | grep verification |
| DOD-14 | Zero platform conditionals (`if (platform === ...)`) | grep `platform ===` returns zero |
| DOD-15 | `TokenRefresher` exported from `packages/platform/src/shared/index.ts` | Barrel export present |
| DOD-16 | TypeScript compiles clean across all packages | `pnpm typecheck` returns zero errors |
| DOD-17 | Lint passes across all packages | `pnpm lint` returns zero errors |
| DOD-18 | Existing tests in `packages/platform` still pass | `pnpm --filter @collectio/platform test` |
| DOD-19 | File uses `.ts` extension (no JSX — Rule 11.6) | File extension check |
| DOD-20 | Test file in `packages/platform/src/shared/__tests__/TokenRefresher.test.ts` | File exists |

---

## 16. Appendix A: Dependency Map

```
E-04 T-04.1 (ElectronAuthProvider) ──────── DONE ──── Provides AuthProvider.refreshAccessToken()
E-04 T-04.2 (CapacitorAuthProvider) ─────── DONE ──── Provides AuthProvider.refreshAccessToken()
E-03 T-03.1 through T-03.6 (CryptoProvider) ── DONE ──── Indirect (AuthProvider uses SecureStorageProvider)
E-04 T-04.3 (ElectronStorageProvider) ───── DONE ──── Indirect (token persistence)
E-04 T-04.4 (CapacitorStorageProvider) ──── DONE ──── Indirect (token persistence)

E-04 T-04.5 (TokenRefresher) ────────────── THIS TASK
    │
    ├── BLOCKS ── E-09 (Cloud Storage Layer — GoogleDriveProvider)
    ├── BLOCKS ── E-10 (Sync Engine — token lifecycle)
    └── BLOCKS ── E-04 T-04.8 (DI Setup — must register singleton)
```

---

## 17. Appendix B: Architectural Traceability

| Architecture Requirement | Where Addressed |
|---|---|
| `AuthProvider` interface contract (01_ARCHITECTURE.md §4) | §6.1 — TokenRefresher consumes only `AuthProvider` |
| Platform Services layer — shared code works on both platforms (01_ARCHITECTURE.md §4) | §2 — `packages/platform/src/shared/`, pure TypeScript |
| No platform conditionals (Rule 13.1) | §12 S-04 — zero `if (platform === ...)` |
| Platform-specific code isolated behind interfaces (Rule 13.1) | §2 — TokenRefresher calls `AuthProvider` interface only |
| Never log tokens (Rule 6.5, Rule 12.2) | §11, §12 S-01 |
| Never persist tokens outside SecureStorage (Rule 12.1, NFR-SEC-01) | §8.2, §9 — in-memory only; persistence delegated |
| Sync State Machine — `needsReauth` triggers WARNING state (03_SYNC_STATE_MACHINE.md §10, §12) | §10.2 — `needsReauth` exposed for Sync Engine consumption |
| Sync State Machine — HTTP 401 retry with token refresh (03_SYNC_STATE_MACHINE.md §12) | §7.3 — `getAccessToken()` called before each Drive API request |
| OAuth tokens grant Drive access — must not leak (FR-AUTH cert) | §12 S-01, S-02, S-03 |

---

## 18. Appendix C: Platform-Specific Decisions

| Decision | Details |
|---|---|
| **No platform code** | TokenRefresher is pure TypeScript. Both `ElectronAuthProvider.refreshAccessToken()` and `CapacitorAuthProvider.refreshAccessToken()` implement the same `AuthProvider` interface — TokenRefresher calls it without knowing which platform is underneath. |
| **Singleton lifecycle** | TokenRefresher is designed as a singleton per app session (one instance, injected via DI). The state table in §8.1 assumes a single long-lived instance. If multiple instances were created, they would independently track token state and potentially double-refresh. |
| **Token rotation by Google** | Google may issue a new `refresh_token` on each refresh. Both `ElectronAuthProvider` and `CapacitorAuthProvider` already handle this — they persist the rotated refresh token to `SecureStorageProvider`. TokenRefresher does NOT read the new `refresh_token` back; it relies on the in-memory `refreshToken` from the initial `setTokens()` call. If Google rotates the refresh token, the in-memory copy becomes stale. This is acceptable for V1 because: (a) TokenRefresher is re-seeded on app restart via `AuthProvider.getStoredTokens()`, and (b) the `refreshAccessToken()` method on both providers persists the new refresh token to `SecureStorageProvider`, so the next app restart picks it up. |
| **Clock skew tolerance** | The 5-minute buffer absorbs minor clock skew. However, an access token that is actually expired but appears valid (due to device clock being behind) will cause a 401 error on the Drive API call — the caller (GoogleDriveProvider) must handle 401 by retrying after a forced refresh via `setTokens()` + `getAccessToken()`. |

---

## 19. Appendix D: Error Class Reference

TokenRefresher imports these error classes from `@collectio/shared`:

- `AuthNetworkError` (`packages/shared/src/domain/errors/AuthNetworkError.ts`) — thrown by `AuthProvider.refreshAccessToken()` on network failure or Google rejection. Has optional `statusCode` and `cause` fields.
- `AuthCancelledError` (`packages/shared/src/domain/errors/AuthCancelledError.ts`) — NOT handled by TokenRefresher (only thrown by `signIn()`, which TokenRefresher never calls).

No new error classes are introduced by this task.

---

## 20. Appendix E: Accessibility and Usage Notes for Sync Engine

The Sync Engine (E-10) and GoogleDriveProvider (E-09) interact with TokenRefresher as follows:

```
// Before any Drive API call:
const accessToken = await tokenRefresher.getAccessToken();
if (!accessToken) {
  if (tokenRefresher.needsReauth) {
    // Display "Sign in required" prompt to user
    // Set Sync State Machine to WARNING
    // Do NOT attempt Drive API call
    return;
  }
  // Token refresh failed but still retrying (backoff active)
  // Skip this sync cycle — retry later
  return;
}
// Proceed with Drive API call using accessToken
```

This pattern ensures:
1. No Drive API call is made without a valid token
2. The user is prompted to re-authenticate when `needsReauth` is set
3. Transient failures do not trigger user prompts
4. Backoff prevents hammering Google's token endpoint
