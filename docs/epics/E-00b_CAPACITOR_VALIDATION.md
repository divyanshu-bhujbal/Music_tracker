# E-00b: Capacitor Validation Spike

**Phase:** 0b | **Type:** Validation | **Depends On:** E-00 (COMPLETED) | **Blocks:** E-01+

---

## Overview

**Purpose:** Validate that Capacitor + React (web) on Android can support all critical platform features before committing to Option D (Electron + Capacitor). Each spike task produces a minimal proof-of-concept — not production code — that answers a single yes/no question.

**Background:** E-00 validated Electron on Windows (6/7 RNW-specific tasks passed; the RNW ecosystem was rejected for a different reason). The Capacitor ecosystem has not yet been validated. This spike gates the final architecture decision.

**Deliverables:** 7 working spike modules + decision gate record.
**Success gate:** All 7 tasks pass → commit to Electron + Capacitor. Any critical failure → reconsider Option C (Electron + React Native monorepo).

---

## Files Produced

| File | Purpose |
|------|---------|
| `src/__spike__/Spike0b1_SQLite.ts` | SQLite CRUD + FK enforcement test module |
| `src/__spike__/Spike0b1_Runner.tsx` | SQLite test runner component |
| `src/__spike__/Spike0b1_Types.ts` | SQLite result types |
| `src/__spike__/Spike0b2_Argon2.ts` | Argon2id WASM derivation test module |
| `src/__spike__/Spike0b2_Runner.tsx` | Argon2 test runner component |
| `src/__spike__/Spike0b2_Types.ts` | Argon2 result + perf types |
| `src/__spike__/Spike0b3_AES.ts` | AES-256-GCM via SubtleCrypto module |
| `src/__spike__/Spike0b3_Runner.tsx` | AES test runner component |
| `src/__spike__/Spike0b3_Types.ts` | Crypto error + format types |
| `src/__spike__/Spike0b4_OAuth.ts` | PKCE OAuth flow via @capacitor/browser |
| `src/__spike__/Spike0b4_Runner.tsx` | OAuth test runner component |
| `src/__spike__/Spike0b4_Types.ts` | OAuth state + token types |
| `src/__spike__/Spike0b5_Storage.ts` | Secure storage store/retrieve/delete module |
| `src/__spike__/Spike0b5_Runner.tsx` | Storage test runner component |
| `src/__spike__/Spike0b5_Types.ts` | Storage result + error types |
| `src/__spike__/Spike0b6_Render.ts` | React web app table rendering test |
| `src/__spike__/Spike0b6_Runner.tsx` | Render test runner + 10k row perf |
| `src/__spike__/Spike0b7_Virtual.ts` | Virtualized list rendering test |
| `src/__spike__/Spike0b7_Runner.tsx` | Virtual list test runner |
| `SPIKE_DECISION.md` | Updated with E-00b outcome |

---

## Interfaces (Conceptual)

### CryptoProvider

```
deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array>
encrypt(plaintext: Uint8Array, key: Uint8Array): Promise<{ciphertext: Uint8Array, nonce: Uint8Array, tag: Uint8Array}>
decrypt(ciphertext: Uint8Array, key: Uint8Array, nonce: Uint8Array, tag: Uint8Array): Promise<Uint8Array>
```

### AuthProvider

```
signIn(): Promise<{accessToken: string, refreshToken: string, expiresAt: number}>
getStoredTokens(): Promise<{accessToken: string, refreshToken: string, expiresAt: number} | null>
```

### SecureStorageProvider

```
store(key: string, value: string): Promise<void>
retrieve(key: string): Promise<string | null>
delete(key: string): Promise<void>
clear(): Promise<void>
```

### DatabaseConnection (async interface)

```
open(dbPath: string): Promise<void>
execute(sql: string, params?: any[]): Promise<void>
query<T>(sql: string, params?: any[]): Promise<T[]>
transaction<T>(fn: () => Promise<T>): Promise<T>
close(): Promise<void>
```

---

## T-00b.1 — SQLite via Capacitor Plugin on Android

**Question:** Can `@capacitor-community/sqlite` perform CRUD operations and enforce foreign keys in a Capacitor + React web app on a physical Android device?

### Requirements

- Use `@capacitor-community/sqlite` (community Capacitor plugin — wraps `android.database.sqlite`)
- Run on a physical Android device (API 26+), not an emulator
- If the package fails, document and attempt `capacitor-sqlite` as alternative
- If both fail, document as spike failure

### Test Cases

| ID | Test | Expected Result |
|----|------|-----------------|
| SQ-01 | Open database connection | Connection object returned, no exception |
| SQ-02 | `CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT NOT NULL)` | Table created |
| SQ-03 | `INSERT INTO test (value) VALUES ('hello')` | 1 row inserted |
| SQ-04 | `SELECT * FROM test` | Returns row with value = 'hello' |
| SQ-05 | `UPDATE test SET value = 'world' WHERE id = 1` | 1 row updated |
| SQ-06 | `DELETE FROM test WHERE id = 1` | 1 row deleted; SELECT returns empty |
| SQ-07 | Multi-statement transaction: `BEGIN; INSERT ...; INSERT ...; COMMIT` | Both rows committed atomically |
| SQ-08 | Multi-statement transaction with rollback: `BEGIN; INSERT ...; ROLLBACK` | No rows persisted |
| SQ-09 | `PRAGMA foreign_keys = ON; CREATE TABLE parent (id INTEGER PK); CREATE TABLE child (id INTEGER PK, parent_id INTEGER REFERENCES parent(id)); INSERT INTO child VALUES (1, 999)` | FK violation → insertion rejected — **CRITICAL TEST** |
| SQ-10 | `PRAGMA foreign_keys = ON; INSERT INTO parent VALUES (1); INSERT INTO child VALUES (1, 1)` | Insertion succeeds |
| SQ-11 | Kill app process, relaunch, `SELECT * FROM test` | Previously committed data persists |
| SQ-12 | `PRAGMA integrity_check` | Returns "ok" |

### Acceptance Criteria

1. All 12 test cases pass on a physical Android device
2. SQ-09 (FK violation) is critical — must reject, not silently insert orphan
3. Test results display on-screen in the WebView
4. If package works → document installation and Capacitor config steps
5. If package fails → document exact error and attempt alternative

---

## T-00b.2 — Argon2id Key Derivation (WASM) on Android

**Question:** Can Argon2id key derivation via WASM run in a Capacitor WebView and complete within 3 seconds on a mid-range Android device?

### Requirements

- Parameters: memory=64MB, iterations=3, parallelism=4, outputLen=32
- Use `argon2-wasm` npm package loaded in the WebView's JavaScript engine
- Run on physical Android device (not emulator)
- Fallback: `argon2-browser` package if `argon2-wasm` fails

### Test Cases

| ID | Test | Expected Result |
|----|------|-----------------|
| AR-01 | Derive key from known password + known salt | Output is exactly 32 bytes |
| AR-02 | Same (password, salt) → same key | Identical Uint8Array on consecutive calls |
| AR-03 | Different password → different key | Output differs from AR-02 |
| AR-04 | Different salt → different key | Output differs from AR-02 |
| AR-05 | Empty password (length 0) | Key derived successfully |
| AR-06 | Very long password (256 characters) | Key derived successfully |
| AR-07 | Performance: 10 iterations, measure mean + p99 | Mean < 3 seconds, p99 < 4 seconds |
| AR-08 | Memory: 64MB allocation confirmed in WebView | No out-of-memory crash on 2GB RAM device |

### Acceptance Criteria

1. WASM Argon2id produces a 32-byte key from password + salt
2. Mean derivation time under 3 seconds on mid-range 2022 Android device (≥2GB RAM)
3. Determinism verified: same inputs → same key
4. Cross-platform determinism: same (password, salt) produces same key as Electron's native `argon2` npm package (verify against E-00 spike results)
5. WASM binary size documented; load time measured separately from derivation time
6. If >5 seconds: test PBKDF2 via SubtleCrypto as fallback; document security tradeoff

---

## T-00b.3 — AES-256-GCM via SubtleCrypto on Android WebView

**Question:** Can AES-256-GCM symmetric encryption function correctly via the Web Crypto API (`SubtleCrypto`) in a Capacitor WebView?

### Requirements

- Use `crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plaintext)` in the WebView
- The key parameter is a `CryptoKey` imported from the Argon2id-derived raw bytes
- Only encrypt/decrypt of arbitrary bytes needed — not the full file format

### Test Cases

| ID | Test | Expected Result |
|----|------|-----------------|
| AE-01 | Encrypt 0-byte buffer | Produces nonce (12 bytes), tag (attached to ciphertext by SubtleCrypto), ciphertext (empty) |
| AE-02 | Encrypt 1KB buffer with 256-bit key (imported as CryptoKey) | Produces valid ciphertext |
| AE-03 | Decrypt ciphertext with same (key, nonce) | Returns original 1KB buffer byte-for-byte |
| AE-04 | Decrypt with wrong key | Throws OperationError |
| AE-05 | Decrypt with modified (tampered) ciphertext | Throws OperationError |
| AE-06 | Decrypt with modified nonce | Throws OperationError |
| AE-07 | Encrypt 5MB buffer | Ciphertext produced successfully |
| AE-08 | Decrypt 5MB ciphertext | Returns original 5MB buffer byte-for-byte |
| AE-09 | Two encryptions of same plaintext with same key | Different ciphertext (random nonce) |
| AE-10 | Performance: encrypt + decrypt 5MB, 10 iterations | Mean time each <500ms |
| AE-11 | Cross-platform: encrypt with SubtleCrypto, decrypt with Node.js `crypto` (verified against E-00 Electron results) | Same plaintext byte-for-byte |

### Acceptance Criteria

1. Round-trip encrypt/decrypt works for 0-byte, 1KB, and 5MB payloads
2. AE-11 is critical: SubtleCrypto and Node.js crypto must produce byte-identical results (verifies cross-platform sync compatibility)
3. Errors are distinguishable: "wrong key" vs "corrupted data" vs "implementation error"
4. Performance: 5MB encrypt + decrypt <500ms each on device

---

## T-00b.4 — Secure Storage on Android Keystore

**Question:** Can `@capacitor/secure-storage` store, retrieve, and delete values in Android Keystore, and survive app restart?

### Requirements

- Use `@capacitor/secure-storage` Capacitor plugin
- Store a derived AES key (base64-encoded string) and an OAuth refresh token
- Data must survive app kill + relaunch (not just background)

### Test Cases

| ID | Test | Expected Result |
|----|------|-----------------|
| KC-01 | Store a string value under a named key | No error returned |
| KC-02 | Retrieve the stored value | Returns the exact string stored in KC-01 |
| KC-03 | Retrieve a key that was never stored | Returns `null` (not an error) |
| KC-04 | Overwrite an existing key with new value | Retrieve returns the new value |
| KC-05 | Delete a stored key | Retrieve returns `null` |
| KC-06 | Delete a key that doesn't exist | No error (idempotent) |
| KC-07 | Store a long string (256+ characters, simulating a derived key) | Stored and retrieved correctly |
| KC-08 | Store a string with special characters | Stored and retrieved exactly |
| KC-09 | Store value, kill-and-relaunch app via Android task manager, retrieve | Value persists across app restart — **CRITICAL** |
| KC-10 | Store multiple keys simultaneously | All keys independently retrievable |

### Acceptance Criteria

1. All 10 test cases pass on physical Android device
2. KC-09 is critical: data MUST survive app kill (not just background)
3. If `@capacitor/secure-storage` fails: test `@capacitor/preferences` with encryption flag as fallback

---

## T-00b.5 — Google OAuth PKCE Flow via @capacitor/browser

**Question:** Can a Google OAuth 2.0 PKCE flow complete successfully in a Capacitor + React web app on Android?

### Requirements

- Scope: `https://www.googleapis.com/auth/drive.appdata`
- Custom URI scheme: `collectio://oauth`
- Use `@capacitor/browser` to open the system browser for the Google consent screen
- Use `App.addListener('appUrlOpen')` to receive the redirect back to the app
- No client secret stored anywhere

### PKCE Flow Steps

1. Generate a cryptographically random `code_verifier` (43-128 characters, per RFC 7636)
2. Compute `code_challenge = BASE64URL(SHA-256(code_verifier))`
3. Construct Google authorization URL with: `client_id`, `redirect_uri=collectio://oauth`, `response_type=code`, `code_challenge`, `code_challenge_method=S256`, `scope=https://www.googleapis.com/auth/drive.appdata`, `access_type=offline`
4. Open system browser via `@capacitor/browser`
5. User grants consent → browser redirects to `collectio://oauth?code=...` → `App.addListener('appUrlOpen')` fires
6. Exchange authorization code for tokens at `https://oauth2.googleapis.com/token`
7. Parse response: `access_token`, `refresh_token`, `expires_in`

### Test Cases

| ID | Test | Expected Result |
|----|------|-----------------|
| OA-01 | Generate code_verifier | String with 43-128 characters, only unreserved chars |
| OA-02 | Compute code_challenge from code_verifier | Correct BASE64URL(SHA-256) per RFC 7636 |
| OA-03 | Open authorization URL in system browser via @capacitor/browser | Browser opens, displays Google consent screen |
| OA-04 | User grants consent → browser redirects → app receives code | App receives code via appUrlOpen event |
| OA-05 | Exchange authorization code for tokens | Response contains valid `access_token`, `refresh_token`, `expires_in` |
| OA-06 | Verify token scopes | Token has `drive.appdata` scope |
| OA-07 | Refresh an expired access token with refresh_token | New access_token returned |
| OA-08 | `code_verifier` not persisted after exchange | Memory only; no disk persistence |
| OA-09 | User cancels consent screen | AuthCancelledError thrown; app functional |

### Acceptance Criteria

1. Full OAuth PKCE flow completes on Android device
2. Received access token is valid and scoped to `drive.appdata`
3. Refresh token is received and storable
4. Custom URI scheme `collectio://` is registered and deep linking functions in Capacitor
5. No client secret stored anywhere
6. Document the Google Cloud Console setup and Capacitor URI scheme config

---

## T-00b.6 — React Web App Rendering in Android WebView

**Question:** Can a React web app render and scroll a table of 10,000 rows within 200ms in a Capacitor WebView?

### Requirements

- React 18+ web app with a basic table component
- 10,000 rows with synthetic data (song name, artist, language, album, date)
- Render in Capacitor WebView on a physical Android device
- Measure initial render time and scroll smoothness

### Test Cases

| ID | Test | Expected Result |
|----|------|-----------------|
| RD-01 | Render a table header + 10k rows | Initial render completes; measured time logged |
| RD-02 | Scroll through 5,000 rows with touch gesture | Smooth scrolling; no visible jank |
| RD-03 | Tap a row → event fires | Click handler executes; identifies correct row |
| RD-04 | Type in a search input above the table | Input receives focus; keyboard appears |
| RD-05 | Memory usage after rendering 10k rows | Logged; no crash |
| RD-06 | Initial render time (from app launch to table visible) | <3 seconds for cold start (NFR-PERF-04) |
| RD-07 | Table re-render on data update | Changed rows reflect in <100ms |

### Acceptance Criteria

1. 10k rows render without crash
2. Scrolling is smooth (manual test — no objective measure required)
3. Click/tap events on rows fire correctly
4. App cold-start to usable table <3 seconds on mid-range device

---

## T-00b.7 — Virtualized Row Rendering with @tanstack/react-virtual

**Question:** Can `@tanstack/react-virtual` render a virtualized table of 10,000 rows with smooth scrolling in a Capacitor WebView?

### Requirements

- Use `@tanstack/react-virtual` v3+ for row virtualization
- Only visible rows (~20-30) are in the DOM at any time
- Must meet NFR-PERF-01: table is scrollable within 200ms for 10,000 rows

### Test Cases

| ID | Test | Expected Result |
|----|------|-----------------|
| VR-01 | Render virtualized table with 10k rows | Only ~20-30 DOM nodes; measured count verified |
| VR-02 | Scroll to row 5,000 | Smooth; correct row data displayed |
| VR-03 | Jump to row 9,980 (near end) | Instant (virtualized — no linear scan) |
| VR-04 | Initial render time for 10k rows | <200ms (NFR-PERF-01) |
| VR-05 | Re-render on data change | <100ms; only changed rows re-render |
| VR-06 | Dynamic row heights (if table supports wrapping text) | Correct row positioning; no overlapping |
| VR-07 | Memory usage with virtualization vs without | Substantially lower (logged) |

### Acceptance Criteria

1. 10k rows render with only ~20-30 DOM nodes
2. Initial render <200ms (NFR-PERF-01)
3. Scrolling is smooth; no visible DOM updates
4. Row data is correct at all scroll positions
5. If `@tanstack/react-virtual` fails: test `react-window` as alternative

---

## Decision Gate

| Outcome | Action |
|---------|--------|
| All 7 tasks pass | Commit to Option D (Electron + Capacitor). Begin E-01. |
| SQ-09 (FK enforcement) fails | Attempt alternative Capacitor SQLite package or write a custom plugin. If unfixable: escalate to Option C. |
| AR-07 (Argon2id WASM perf) fails | Test with 32MB / 4 iterations. If still fails: test PBKDF2. If unacceptable: escalate to Option C. |
| AE-11 (cross-platform compatibility) fails | Root-cause the divergence. If unfixable: this is a critical blocker for sync. Escalate to Option C. |
| Any 2+ critical tasks fail | Escalate to Option C (Electron + React Native monorepo). |

## Spike Execution Order

All tasks require a minimal Capacitor + React project (prerequisite):

```
Day 1:      Capacitor + React scaffold setup
Day 1-2:    T-00b.1 (SQLite) + T-00b.5 (Storage) — parallel
Day 2-3:    T-00b.2 (Argon2id WASM)
Day 3:      T-00b.3 (AES SubtleCrypto) — depends on T-00b.2
Day 3-4:    T-00b.4 (OAuth)
Day 4:      T-00b.6 (Rendering) + T-00b.7 (Virtualization) — parallel
Day 5:      Compile decision record
```

## Decision Output

Update `SPIKE_DECISION.md` with:
- E-00b per-task pass/fail summary
- Per-task notes on packages used, workarounds applied, performance data
- Final decision: COMMIT to Option D or ESCALATE to Option C
- If COMMIT: list of packages to install for E-01, known Capacitor config values
- If ESCALATE: brief transition plan to React Native for Android

## Spike Artifacts to Retain for Production

| Artifact | Used By |
|----------|---------|
| Capacitor SQLite test module | E-02 (production DB setup) |
| Argon2id WASM test module | E-03 (key derivation on Android) |
| AES-GCM SubtleCrypto test module | E-03 (encryption on Android) |
| OAuth PKCE test module | E-04 (AuthProvider on Android) |
| Secure storage test module | E-04 (storage on Android) |
| Rendering + virtualization tests | E-15 (UI shell performance benchmarks) |
| Capacitor + React scaffold | Becomes the `apps/capacitor/` project entry |
