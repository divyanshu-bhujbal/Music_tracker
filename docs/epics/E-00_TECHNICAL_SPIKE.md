# E-00: Technical Spike

**Phase:** 0 (Weeks 1–2) | **Type:** Validation | **Depends On:** — | **Blocks:** Everything

---

## Overview

**Purpose:** Validate that React Native for Windows (RNW) can support all critical platform features before committing to Option A (React Native + RNW). Each spike task produces a minimal proof-of-concept — not production code — that answers a single yes/no question.

**Duration:** 2 weeks  
**Deliverables:** 7 working spike modules + `SPIKE_DECISION.md`  
**Success gate:** All 7 tasks pass → proceed with Option A. Any failure → escalate to Option C.

---

## Files Produced

| File | Purpose |
|------|---------|
| `src/__spike__/Spike01_SQLite.ts` | SQLite read/write/FK test module |
| `src/__spike__/Spike01_Runner.tsx` | SQLite test runner component |
| `src/__spike__/Spike01_Types.ts` | SQLite result types |
| `src/__spike__/Spike02_Argon2.ts` | Argon2id derivation test module |
| `src/__spike__/Spike02_Runner.tsx` | Argon2 test runner component |
| `src/__spike__/Spike02_Types.ts` | Argon2 result + perf types |
| `src/__spike__/Spike03_AES.ts` | AES-256-GCM encrypt/decrypt module |
| `src/__spike__/Spike03_Runner.tsx` | AES test runner component |
| `src/__spike__/Spike03_Types.ts` | Crypto error + format types |
| `src/__spike__/Spike04_OAuth.ts` | Google OAuth PKCE flow module |
| `src/__spike__/Spike04_Runner.tsx` | OAuth test runner component |
| `src/__spike__/Spike04_Types.ts` | OAuth state + token types |
| `src/__spike__/Spike05_Keychain.ts` | Keychain store/retrieve/delete module |
| `src/__spike__/Spike05_Runner.tsx` | Keychain test runner component |
| `src/__spike__/Spike05_Types.ts` | Storage result + error types |
| `src/__spike__/Spike06_Device.ts` | Device table FK enforcement module |
| `src/__spike__/Spike06_Runner.tsx` | Device test runner component |
| `src/__spike__/Spike06_Types.ts` | Device entity type |
| `src/__spike__/Spike07_Drive.ts` | Google Drive REST API module |
| `src/__spike__/Spike07_Runner.tsx` | Drive test runner component |
| `src/__spike__/Spike07_Types.ts` | Drive file metadata + error types |
| `SPIKE_DECISION.md` | Formal pass/fail record + architecture decision |

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

### CloudStorageProvider

```
upload(data: Uint8Array, fileName: string): Promise<{fileId: string, modifiedTime: string}>
download(fileId: string): Promise<{data: Uint8Array, modifiedTime: string}>
list(): Promise<Array<{fileId: string, name: string, modifiedTime: string}>>
delete(fileId: string): Promise<void>
```

---

## T-00.1 — SQLite Validation on Windows

**Question:** Can a SQLite native module read, write, and enforce foreign keys in a React Native for Windows app?

### Requirements

- Use `react-native-sqlite-storage` (documented Windows support)
- Fallback: `@op-engineering/op-sqlite` if the primary package fails to install/link on Windows
- If both fail, document as a spike failure — consider Option C escalation

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
| SQ-09 | `PRAGMA foreign_keys = ON; INSERT INTO child VALUES (1, 999)` — FK violation | Insertion rejected |
| SQ-10 | `PRAGMA foreign_keys = ON; INSERT INTO parent; INSERT INTO child` — valid FK | Insertion succeeds |
| SQ-11 | Close connection, reopen, `SELECT * FROM test` | Previously committed data persists |
| SQ-12 | `PRAGMA integrity_check` | Returns "ok" |

### Acceptance Criteria

1. All 12 test cases pass on Windows
2. Test results display on-screen (green check / red X per test)
3. Performance: each individual SQL operation completes in <50ms (measured and logged)
4. If package works → document installation and linking steps
5. If package fails → document exact error, attempt number, and alternative decision

---

## T-00.2 — Argon2id Key Derivation on Windows

**Question:** Can Argon2id key derivation run on Windows with the required parameters and complete within 3 seconds?

### Requirements

- Parameters: memory=64MB, iterations=3, parallelism=4, output=32 bytes
- Approach priority:
  1. `react-native-argon2` native module (build and link on Windows)
  2. WASM via `argon2-browser` or equivalent
  3. Pure JavaScript argon2 (expected to exceed time budget — benchmark anyway)
  4. PBKDF2 via `react-native-quick-crypto` as Windows-only fallback (document security tradeoff)

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
| AR-08 | Memory: 64MB allocation confirmed | No out-of-memory error on test hardware |

### Acceptance Criteria

1. At least one implementation approach produces a 32-byte key from password + salt
2. Mean derivation time under 3 seconds for 10 consecutive runs on mid-range Windows hardware (≥8GB RAM, 2020+ CPU)
3. Determinism verified: same inputs → same key
4. If WASM fallback needed: WASM binary size documented; load time measured separately
5. If PBKDF2 is the only option: document the security tradeoff
6. If all approaches fail or exceed 5 seconds → spike task failed, escalate

---

## T-00.3 — AES-256-GCM Encrypt/Decrypt on Windows

**Question:** Can AES-256-GCM symmetric encryption function correctly in a React Native for Windows environment?

### Requirements

- Use `react-native-quick-crypto` if it builds on Windows
- Fallback: Node.js `crypto` or `SubtleCrypto` Web API (if available in RNW's JS engine)
- Only encrypt/decrypt needed — not the full file format header parsing (that is T-03.4)

### Encrypted File Format (Constitution Section 16.3)

```
Byte offset  Length  Contents
0            4       Magic bytes: 0x434D4442 ("CMDB")
4            1       Format version: 0x01
5            32      Argon2id salt
37           12      AES-GCM nonce
49           16      AES-GCM authentication tag
65           N       AES-256-GCM ciphertext
```

### Test Cases

| ID | Test | Expected Result |
|----|------|-----------------|
| AE-01 | Encrypt 0-byte buffer | Produces nonce (12 bytes), tag (16 bytes), ciphertext (empty) |
| AE-02 | Encrypt 1KB buffer with 256-bit key | Produces valid ciphertext |
| AE-03 | Decrypt ciphertext with same (key, nonce, tag) | Returns original 1KB buffer byte-for-byte |
| AE-04 | Decrypt with wrong key | Throws AuthenticationError |
| AE-05 | Decrypt with modified (tampered) ciphertext | Throws AuthenticationError |
| AE-06 | Decrypt with modified nonce | Throws AuthenticationError |
| AE-07 | Decrypt with modified authentication tag | Throws AuthenticationError |
| AE-08 | Encrypt 5MB buffer | Ciphertext produced successfully |
| AE-09 | Decrypt 5MB ciphertext | Returns original 5MB buffer byte-for-byte |
| AE-10 | Two encryptions of same plaintext with same key | Different ciphertext (random nonce) |
| AE-11 | Performance: encrypt + decrypt 5MB, 10 iterations | Mean time for each operation <500ms |

### Acceptance Criteria

1. Round-trip encrypt/decrypt works for 0-byte, 1KB, and 5MB payloads
2. GCM authentication tag correctly rejects tampered ciphertext
3. Errors are typed: distinguishable between "wrong key", "corrupted data", and "implementation error"
4. Performance: 5MB encrypt + decrypt <500ms each on mid-range hardware
5. Document which approach was used and any limitations

---

## T-00.4 — Google OAuth PKCE Browser Flow on Windows

**Question:** Can Google OAuth 2.0 with PKCE complete successfully in a React Native for Windows app?

### Requirements

- Custom PKCE flow — no `@react-native-google-signin/google-signin` (no Windows support)
- Scope: `https://www.googleapis.com/auth/drive.appdata`
- Custom URI scheme: `collectio://oauth`
- No client secret stored anywhere

### PKCE Flow Steps

1. Generate a cryptographically random `code_verifier` (43-128 characters, per RFC 7636)
2. Compute `code_challenge = BASE64URL(SHA-256(code_verifier))`
3. Construct Google authorization URL with parameters:
   - `client_id`, `redirect_uri=collectio://oauth`, `response_type=code`
   - `code_challenge`, `code_challenge_method=S256`
   - `scope=https://www.googleapis.com/auth/drive.appdata`
   - `access_type=offline` (to receive refresh token)
4. Open system browser to the authorization URL via `Linking.openURL()`
5. Register custom URI scheme in RNW manifest — receive authorization code via deep link
6. Exchange authorization code for tokens at `https://oauth2.googleapis.com/token`:
   - POST with `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `code_verifier`
7. Parse response: `access_token`, `refresh_token`, `expires_in`

### Custom URI Scheme Registration (Windows-specific)

The spike must verify:
- `collectio://` URI scheme can be registered in `Package.appxmanifest`
- When the browser redirects to `collectio://oauth?code=...`, the app receives the deep link
- The deep link event provides the authorization code for step 6

### Test Cases

| ID | Test | Expected Result |
|----|------|-----------------|
| OA-01 | Generate code_verifier | String with 43-128 characters, only unreserved chars |
| OA-02 | Compute code_challenge from code_verifier | Correct BASE64URL(SHA-256) per RFC 7636 |
| OA-03 | Open authorization URL in system browser | Browser opens, displays Google consent screen |
| OA-04 | User grants consent → browser redirects to `collectio://oauth?code=...` | App receives deep link event with authorization code |
| OA-05 | Exchange authorization code for tokens | Response contains valid `access_token`, `refresh_token`, `expires_in` |
| OA-06 | Verify token scopes | Token has `drive.appdata` scope |
| OA-07 | Refresh an expired access token with refresh_token | New access_token returned |
| OA-08 | `code_verifier` not stored on disk after exchange | Memory only; no persistence |
| OA-09 | User cancels consent screen | AuthCancelledError thrown |

### Acceptance Criteria

1. Full OAuth PKCE flow completes on Windows: browser opens → user consents → app receives code → tokens obtained
2. Received access token is valid and scoped to `drive.appdata`
3. Refresh token is received
4. Custom URI scheme `collectio://` registered and deep linking functions
5. No client secret stored anywhere
6. Document the Google Cloud Console setup steps required

---

## T-00.5 — Keychain Read/Write on Windows Credential Manager

**Question:** Can `react-native-keychain` store and retrieve values in Windows Credential Manager?

### Requirements

- Use `react-native-keychain` (supports Windows Credential Manager)
- Service name: `com.collectio.secure-storage`
- Data must survive app restart and development rebuild

### Test Cases

| ID | Test | Expected Result |
|----|------|-----------------|
| KC-01 | Store a string value under a named key | No error returned |
| KC-02 | Retrieve the stored value | Returns the exact string stored in KC-01 |
| KC-03 | Retrieve a key that was never stored | Returns `null` or `undefined` (not an error) |
| KC-04 | Overwrite an existing key with new value | Retrieve returns the new value |
| KC-05 | Delete a stored key | Retrieve returns `null` |
| KC-06 | Delete a key that doesn't exist | No error (idempotent) |
| KC-07 | Store a long string (256+ characters) | Stored and retrieved correctly |
| KC-08 | Store a string with special characters (unicode, newlines, JSON) | Stored and retrieved exactly |
| KC-09 | Store value, kill-and-relaunch app, retrieve | Value persists across app restart |
| KC-10 | Store multiple keys simultaneously | All keys independently retrievable |

### Acceptance Criteria

1. `react-native-keychain` successfully writes to and reads from Windows Credential Manager
2. Data survives app restart (KC-09 passes)
3. Data survives relaunch of the development build
4. If `react-native-keychain` fails: attempt `react-native-windows-keychain` alternative
5. If no keychain package works: attempt direct Windows Credential Manager API via custom native module
6. If all approaches fail → spike task failed, escalate

---

## T-00.6 — Device Row Insertion + FK Enforcement

**Question:** Can a device row be inserted and do foreign key constraints function as required by the constitution's setup prerequisite?

### Requirements

- Create the exact `devices` and `sync_log` schema from constitution Section 14.1
- Enable foreign keys before testing
- Verify FK constraints reject invalid references

### Schema

```
devices
  id            TEXT (UUID v4) PRIMARY KEY
  name          TEXT NOT NULL
  platform      TEXT NOT NULL ('ANDROID' | 'WINDOWS')
  registered_at TEXT (ISO-8601 datetime) NOT NULL
  last_seen_at  TEXT (ISO-8601 datetime) NOT NULL

sync_log
  id               INTEGER PRIMARY KEY AUTOINCREMENT
  device_id        TEXT REFERENCES devices(id)
  started_at       TEXT NOT NULL
  completed_at     TEXT NULLABLE
  direction        TEXT ('UPLOAD' | 'DOWNLOAD' | 'MERGE')
  status           TEXT ('SUCCESS' | 'FAILURE' | 'IN_PROGRESS')
  records_affected INTEGER
  error_message    TEXT NULLABLE
```

### Test Cases

| ID | Test | Expected Result |
|----|------|-----------------|
| DV-01 | `INSERT INTO devices` with valid data | 1 row inserted |
| DV-02 | `SELECT * FROM devices WHERE platform = 'WINDOWS'` | DV-01 row returned with all fields |
| DV-03 | `INSERT INTO devices` with `platform = NULL` | Rejected with error (NOT NULL violation) |
| DV-04 | `INSERT INTO devices` with `name = NULL` | Rejected with error |
| DV-05 | `INSERT INTO devices` with non-UUID id format | Should succeed (TEXT column, app validates UUID) |
| DV-06 | `INSERT INTO sync_log` with valid `device_id` | Insert succeeds |
| DV-07 | `INSERT INTO sync_log` with `device_id = 'nonexistent-id'` | Rejected — **CRITICAL TEST** |
| DV-08 | `DELETE FROM devices WHERE id = X` (while sync_log references X) | Rejected (FK violation with existing references) |
| DV-09 | `PRAGMA foreign_keys` | Returns 1 (enabled) |
| DV-10 | Query all datetime columns | Values stored in ISO-8601 format, readable |

### Acceptance Criteria

1. All 10 test cases pass on Windows
2. DV-07 (FK violation rejection) is the critical test — must reject, not silently insert orphaned row
3. FK enforcement is verifiably enabled, not a per-connection setting that can be accidentally omitted
4. UUID v4 values stored and retrieved correctly as TEXT
5. ISO-8601 datetime strings stored correctly

---

## T-00.7 — Google Drive REST API Upload/Download

**Question:** Can the app upload and download a file to Google Drive using the `drive.appdata` scope?

### Requirements

- Uses the access token obtained from T-00.4
- Authorization: `Bearer {access_token}` header on all requests
- Test file: known content (JSON blob with timestamp + random value, or binary sequence)

### API Endpoints

| Operation | Method | URL |
|-----------|--------|-----|
| Upload | POST (multipart) | `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart` |
| Upload (overwrite) | PATCH | `https://www.googleapis.com/upload/drive/v3/files/{fileId}?uploadType=media` |
| Download | GET | `https://www.googleapis.com/drive/v3/files/{fileId}?alt=media` |
| List | GET | `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder` |
| Delete | DELETE | `https://www.googleapis.com/drive/v3/files/{fileId}` |

### Test Cases

| ID | Test | Expected Result |
|----|------|-----------------|
| DR-01 | Upload a test file to appdata folder | Returns `fileId` and `modifiedTime` |
| DR-02 | List files in appdata folder | DR-01 file appears in list |
| DR-03 | Download the uploaded file | Returns byte-for-byte identical content |
| DR-04 | Overwrite (re-upload) same file | modifiedTime updates; fileId unchanged |
| DR-05 | Download after overwrite | Returns new content, not old |
| DR-06 | Delete file | Successful; list no longer shows file |
| DR-07 | Upload with `parents = [appDataFolder]` metadata | File in appdata scope, not visible in main Drive |
| DR-08 | Upload a 5MB file | Upload and download succeed (simulates full DB) |
| DR-09 | Upload with invalid/expired access token | Receives 401 Unauthorized |
| DR-10 | Attempt to list with `spaces=drive` (main Drive) | Returns empty or scoped to appdata only |

### Acceptance Criteria

1. All 10 test cases pass
2. DR-03: byte-for-byte verification of uploaded → downloaded content
3. DR-07: file NOT visible in the user's main Google Drive (privacy boundary)
4. Performance: 5MB upload <30 seconds on broadband; download <15 seconds
5. Document the Drive API quota limits observed during testing

---

## Prerequisite: Minimal RNW Scaffold

Before any spike task begins, a bare-minimum React Native + RNW project must exist.

| Property | Detail |
|----------|--------|
| **Files produced** | Standard RN bare workflow + RNW template project |
| **Requirements** | React Native 0.76+ (latest stable); `react-native-windows` 0.76+; TypeScript enabled; `npx react-native run-windows` launches a blank screen |
| **Acceptance criteria** | App compiles and launches on Windows; `App.tsx` renders without errors; no native module link errors |

---

## Execution Order

```
Day 1-2:   Scaffold setup (prerequisite)
Day 2-4:   T-00.1 (SQLite) ──────────────────────────┐
           T-00.5 (Keychain) ─────────────────────────┤ parallel
Day 4-6:   T-00.6 (Device FK) ←── depends on T-00.1   │
           T-00.2 (Argon2) ────────────────────────────┤ parallel
Day 6-8:   T-00.3 (AES) ←── depends on T-00.2         │
           T-00.4 (OAuth) ─────────────────────────────┤ parallel
Day 8-10:  T-00.7 (Drive) ←── depends on T-00.4
Day 10:    Compile decision document
```

**Day 11-14:** Buffer for remediation. If any critical task remains failed by end of week 2, escalate to Option C.

---

## Decision Gate

| Outcome | Action |
|---------|--------|
| All 7 tasks pass | Commit to Option A (React Native + RNW). Begin Phase 1 (E-01). |
| 1-2 non-critical failures with viable remediation | Document remediation plan. Re-evaluate after remediation. |
| Any critical task fails irrecoverably | Escalate to Option C (Electron + React Native monorepo). |

---

## Decision Outputs

### SPIKE_DECISION.md

Formal record produced after all tasks complete:

- Per-task pass/fail summary with notes
- For any failure: root cause analysis, attempted remediation, effort estimate to fix
- Final decision: **COMMIT to Option A** or **ESCALATE to Option C**
- If Option C: brief transition plan (Electron + RN monorepo setup tasks)

### Spike Artifacts to Retain for Production

| Artifact | Used By |
|----------|---------|
| SQLite spike module | T-02.1 (production SQLite setup) |
| Argon2 spike module | T-03.1 / T-03.2 (key derivation) |
| AES-GCM spike module | T-03.3 / T-03.4 (encryption pipeline) |
| OAuth spike module | Production base for `GoogleAuthProviderWindows` |
| Keychain spike module | T-04.3 (Windows secure storage) |
| Device table spike | T-02.4 (migration 001) |
| Drive API spike | Production base for `GoogleDriveProvider` |
| RNW scaffold | Becomes the project root |

### Collected Data for E-01 Planning

Document the exact steps, commands, and configurations needed for:
1. Installing and linking each native package on Windows
2. Any workarounds or patches applied
3. Build system requirements (Visual Studio version, Windows SDK version, .NET version)
4. Known limitations discovered during the spike

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| `react-native-sqlite-storage` fails on Windows | Medium | High | Attempt `@op-engineering/op-sqlite`; document failure |
| Argon2id WASM not performant enough | Medium | High | Test PBKDF2 as Windows-only fallback; document security tradeoff |
| Custom URI scheme deep linking fails on Windows | Medium | Critical | Verify RNW manifest configuration; test with `Linking` API |
| `react-native-keychain` doesn't support Windows Credential Manager | Low | High | Attempt direct Credential Manager API via C++ native module |
| Google OAuth PKCE browser flow blocked by Windows security | Low | Critical | Verify redirect URI registration; test on non-domain-joined machine |
| All approaches fail → Option C necessary | Low | Critical | Phase 0 is designed to detect this early — week 2 is the buffer |
