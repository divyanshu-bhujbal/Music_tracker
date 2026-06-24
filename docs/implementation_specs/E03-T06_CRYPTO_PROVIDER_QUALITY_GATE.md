# E03 T06 — CryptoProvider Unit Tests (Quality Gate)

> **Epic:** E-03 Security Primitives
> **Depends on:** E03 T01–T05 (all implementations)
> **Blocks:** (quality gate — must pass before proceeding to E-04)
> **Predecessor specs:** All E03 specs (T01–T05)

---

## 1. Goal

Final quality gate for the E03 epic. Verify all existing unit tests from T01–T05 pass, add cross-platform integration tests (CF-10: Electron encrypt → Capacitor decrypt, CF-11: Capacitor encrypt → Electron decrypt), and add performance benchmarks (CF-12: 5MB encrypt/decrypt, 10 iterations, mean <500ms).

After this task, the entire `CryptoProvider` system (Argon2id + AES-GCM + Encrypted File Format) is validated on both platforms with confirmed cross-platform compatibility.

---

## 2. Scope

- Run and verify all existing T01–T05 tests pass (CF-01 through CF-09)
- Create cross-platform integration test file for CF-10 and CF-11
- Add CF-12 performance benchmarks to existing per-provider test files
- Document mock strategy for `argon2-wasm` in Jest if WASM loading fails
- Ensure `pnpm typecheck` and `pnpm lint` pass across all packages
- Ensure full test suite (`pnpm test`) passes with zero failures

---

## 3. Out of Scope

- New `CryptoProvider` features or implementations — T01–T05
- Rewriting existing tests — they were written in T01–T05 and should pass as-is
- Device-level testing (real Android device, real Electron app) — spike E-00b already validated
- CI configuration changes — E01 already configured CI
- Duplicating CF-01 through CF-09 — these are covered by existing tests; this task only verifies they pass

---

## 4. Files To Create

| # | File | Purpose |
|---|------|---------|
| 1 | `packages/platform/src/__tests__/cross-platform-crypto.test.ts` | CF-10 and CF-11: cross-platform encryption/decryption determinism tests |

---

## 5. Files To Modify

| # | File | Change |
|---|------|--------|
| 1 | `packages/platform/src/electron/__tests__/NodeCryptoProvider.test.ts` | Add CF-12 performance benchmark for Electron |
| 2 | `packages/platform/src/capacitor/__tests__/WebCryptoProvider.test.ts` | Add CF-12 performance benchmark for Capacitor |

---

## 6. Interfaces

**No new interfaces defined.** All tests use existing components:

| Component | Imported from | Used in |
|-----------|--------------|---------|
| `NodeCryptoProvider` | `../electron/NodeCryptoProvider.js` | CF-10, CF-11, CF-12 (Electron) |
| `WebCryptoProvider` | `../capacitor/WebCryptoProvider.js` | CF-10, CF-11, CF-12 (Capacitor) |
| `EncryptedFileFormat` | `@collectio/shared` | CF-10, CF-11 |
| `EncryptedData` | `@collectio/shared` | CF-10, CF-11 (type verification) |
| `AuthenticationError` | `@collectio/shared` | error assertions |

---

## 7. Data Flow

### Cross-Platform Test Flow (CF-10, CF-11)

```
CF-10: Electron pack → Capacitor unpack

  ┌─────────────────────────────────┐
  │ NodeCryptoProvider (Electron)   │
  │  ├─ generateSalt() → salt       │
  │  ├─ deriveKey(pw, salt) → key   │
  │  └─ EncryptedFileFormat.pack(..) │
  │     └─ file bytes               │
  └──────────────┬──────────────────┘
                 │ file bytes
                 ▼
  ┌─────────────────────────────────┐
  │ WebCryptoProvider (Capacitor)   │
  │  ├─ deriveKey(pw, salt) → key'  │  ← must equal Electron key
  │  └─ EncryptedFileFormat.unpack()│
  │     └─ { database, salt }       │
  └──────────────┬──────────────────┘
                 │
                 ▼
  Verify: database === original (byte-for-byte)
  Verify: key' === key (same password + same salt = same key)
  Verify: salt === original salt

CF-11: Capacitor pack → Electron unpack
  (same flow, roles reversed)
```

### Performance Benchmark Flow (CF-12)

```
For each provider (NodeCryptoProvider, WebCryptoProvider):
  │
  ├─ Generate: 5MB Uint8Array of test data
  ├─ Generate: 32-byte key
  │
  ├─ Loop 10 iterations:
  │   ├─ t0 = performance.now()
  │   ├─ encrypted = await provider.encryptDatabase(data, key)
  │   ├─ decrypted = await provider.decryptDatabase(encrypted, key)
  │   ├─ t1 = performance.now()
  │   ├─ Verify decrypted === data
  │   └─ Record duration = t1 - t0
  │
  └─ Assert: mean(durations) < 500ms
```

---

## 8. State Changes

**None.** Tests do not modify application state.

---

## 9. Database Changes

**None.** Tests operate entirely in memory.

---

## 10. Error Handling

**Test-level error handling only.** No production error classes affected.

| Condition | Test Behavior |
|-----------|---------------|
| Existing test fails | Investigation required — indicates regression in T01–T05 |
| CF-10 fails | Cross-platform determinism broken — likely `TextEncoder` issue (Rule 5.1) or AES parameter mismatch |
| CF-11 fails | Same as CF-10, reversed direction |
| CF-12 exceeds 500ms threshold | Warning only in CI; failure on developer machine. Investigate performance regression. |
| `argon2-wasm` fails to load in Jest | See mock strategy in Section 14 |

---

## 11. Logging Requirements

**None.** Test output uses standard Jest reporting. No secrets or key material in test output.

---

## 12. Security Requirements

| Rule | Requirement |
|------|-------------|
| S-01 | Test keys and passwords are hardcoded test values — never production secrets |
| S-02 | No cryptographic material is logged during test runs |
| S-03 | Test fixtures use fixed known values, not randomly-generated material that could mask determinism bugs |

---

## 13. Acceptance Criteria

| ID | Criterion | Verification |
|----|-----------|-------------|
| AC-01 | All T01 tests pass (NodeCryptoProvider.deriveKey/generateSalt) | `pnpm --filter @collectio/platform test -- --testPathPattern="NodeCryptoProvider"` |
| AC-02 | All T02 tests pass (WebCryptoProvider.deriveKey/generateSalt) | `pnpm --filter @collectio/platform test -- --testPathPattern="WebCryptoProvider"` |
| AC-03 | All T03 tests pass (NodeCryptoProvider AES-GCM) | Covered by AC-01 (same file) |
| AC-04 | All T04 tests pass (WebCryptoProvider AES-GCM) | Covered by AC-02 (same file) |
| AC-05 | All T05 tests pass (EncryptedFileFormat pack/unpack) | `pnpm --filter @collectio/shared test -- --testPathPattern="EncryptedFileFormat"` |
| AC-06 | CF-10: Electron pack → Capacitor unpack → original database byte-for-byte | 1KB test database; verify database + salt match |
| AC-07 | CF-11: Capacitor pack → Electron unpack → original database byte-for-byte | 1KB test database; verify database + salt match |
| AC-08 | CF-10/CF-11 verify derived keys match (same password + salt = same key across platforms) | Byte comparison of derived keys |
| AC-09 | CF-12 (Electron): 5MB encrypt+decrypt mean <500ms over 10 iterations | Timing assertion |
| AC-10 | CF-12 (Capacitor): 5MB encrypt+decrypt mean <500ms over 10 iterations | Timing assertion |
| AC-11 | Full test suite passes: `pnpm test` with zero failures | Run from repository root |
| AC-12 | `tsc --noEmit` passes across all packages | `pnpm typecheck` |
| AC-13 | `pnpm lint` passes with zero warnings | Run from root |

---

## 14. Test Cases

### Existing Test Inventory (CF-01 through CF-09)

These are already covered. This task verifies they pass — no new tests needed.

| CF ID | Description | Covered By |
|-------|-------------|------------|
| CF-01 | Round-trip: empty database | T05 UP-03 |
| CF-02 | Round-trip: 1KB database | T05 UP-01, T03 DE-01, T04 DE-01 |
| CF-03 | Round-trip: 5MB database | T03 DE-11 (Electron), T05 PK-07 (file format) |
| CF-04 | Wrong password → `AuthenticationError` | T03 DE-03, T04 DE-03, T05 UP-10 |
| CF-05 | Tampered ciphertext → `AuthenticationError` | T03 DE-04, T04 DE-04, T05 UP-11 |
| CF-06 | Wrong magic bytes → `FormatError` | T05 UP-04, UP-05 |
| CF-07 | Unsupported version → `VersionError` | T05 UP-06, UP-07 |
| CF-08 | Deterministic key derivation | T01 DK-01, T02 DK-01 |
| CF-09 | Different salts → different ciphertext | T03 EN-05, T04 EN-05 |

---

### New Test Cases — Cross-Platform (CF-10, CF-11)

**File:** `packages/platform/src/__tests__/cross-platform-crypto.test.ts`

#### Mock Strategy for `argon2-wasm`

The cross-platform test creates instances of both `NodeCryptoProvider` and `WebCryptoProvider`. `NodeCryptoProvider` uses native `argon2` npm which works in Node.js Jest. `WebCryptoProvider` imports `argon2-wasm` which is a WASM module.

**Attempt real WASM first.** If `import argon2 from 'argon2-wasm'` succeeds in Jest and `argon2.default.hash(...)` resolves correctly, use the real module. If it fails (throws at import time or hash rejects), apply a fallback:

**Fallback mock:** Create a Jest module mock for `argon2-wasm` at the top of the test file. The mock delegates to Node.js's native `argon2` package with the same parameter mapping (Rule 5.1: UTF-8 encode password, convert `{ pass, salt, time, mem, parallelism, hashLen, type }` to `argon2.hash(password, { salt, raw: true, type, timeCost, memoryCost, parallelism, hashLength })`). This ensures `WebCryptoProvider.deriveKey()` returns correct results even with a mock.

If the real WASM module works, document it. If the fallback mock is used, document that CF-10/CF-11 test Argon2id determinism via the mock + native comparison (which is functionally identical to testing both real implementations since the parameter mapping is verified).

**Test environment note:** Node.js 20+ has built-in WASM support via V8, so `argon2-wasm` may load and execute natively. The fallback exists as a safeguard.

#### Test Structure

```
describe('Cross-Platform Crypto')
  ├── describe('CF-10: Electron pack → Capacitor unpack')
  │   ├── CF-10-01: Round-trip with 1KB database
  │   ├── CF-10-02: Derived keys match between platforms
  │   ├── CF-10-03: Salt returned by unpack matches original
  │   ├── CF-10-04: Empty database round-trip
  │   └── CF-10-05: Wrong password → AuthenticationError on Capacitor side
  │
  └── describe('CF-11: Capacitor pack → Electron unpack')
      ├── CF-11-01: Round-trip with 1KB database
      ├── CF-11-02: Derived keys match between platforms
      ├── CF-11-03: Salt returned by unpack matches original
      ├── CF-11-04: Empty database round-trip
      └── CF-11-05: Wrong password → AuthenticationError on Electron side
```

#### Test Cases Detail

##### CF-10: Electron Pack → Capacitor Unpack

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| CF-10-01 | 1KB round-trip | 1. Electron `deriveKey(pw, salt)` → key<br>2. Electron `EncryptedFileFormat.pack(db, key, salt)` → file<br>3. Capacitor `EncryptedFileFormat.unpack(file, key)` → `{ database, salt }` | `database` equals original byte-for-byte |
| CF-10-02 | Key determinism | 1. Electron `deriveKey(pw, salt)` → keyE<br>2. Capacitor `deriveKey(pw, salt)` → keyC | `keyE` equals `keyC` byte-for-byte |
| CF-10-03 | Salt recovery | `unpack(pack(db, key, salt), key).salt` | Equals original `salt` |
| CF-10-04 | Empty database | Same as CF-10-01 with 0-byte db | `database` is 0 bytes |
| CF-10-05 | Wrong password | Pack with key A, attempt Capacitor unpack with key B | Throws `AuthenticationError` |

##### CF-11: Capacitor Pack → Electron Unpack

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| CF-11-01 | 1KB round-trip | 1. Capacitor `deriveKey(pw, salt)` → key<br>2. Capacitor `EncryptedFileFormat.pack(db, key, salt)` → file<br>3. Electron `EncryptedFileFormat.unpack(file, key)` → `{ database, salt }` | `database` equals original byte-for-byte |
| CF-11-02 | Key determinism | 1. Capacitor `deriveKey(pw, salt)` → keyC<br>2. Electron `deriveKey(pw, salt)` → keyE | `keyC` equals `keyE` byte-for-byte |
| CF-11-03 | Salt recovery | `unpack(pack(db, key, salt), key).salt` | Equals original `salt` |
| CF-11-04 | Empty database | Same as CF-11-01 with 0-byte db | `database` is 0 bytes |
| CF-11-05 | Wrong password | Pack with key A, attempt Electron unpack with key B | Throws `AuthenticationError` |

**Test fixture:**
- Password: `"test-password-跨平台"` (includes ASCII + Unicode to verify Rule 5.1)
- Salt: 32 bytes of known pattern (e.g., bytes 0x00..0x1F)
- Database: 1KB of known pattern bytes

---

### New Test Cases — Performance (CF-12)

Added to existing test files (see Section 5).

#### CF-12 Placement

| Platform | File | Test Name |
|----------|------|-----------|
| Electron | `packages/platform/src/electron/__tests__/NodeCryptoProvider.test.ts` | `describe('CF-12: Performance benchmark (Electron)')` |
| Capacitor | `packages/platform/src/capacitor/__tests__/WebCryptoProvider.test.ts` | `describe('CF-12: Performance benchmark (Capacitor)')` |

#### Test Structure (same for both files)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| CF-12-01 | 5MB encrypt + decrypt (10 iterations) | 1. Create 5MB `Uint8Array`<br>2. Generate 32-byte key<br>3. Loop 10×: encrypt → decrypt → verify<br>4. Record per-iteration durations<br>5. Compute mean | Mean < 500ms; each iteration returns correct plaintext |
| CF-12-02 | Single encrypt (5MB) | Encrypt 5MB once | Verify output is valid `EncryptedData` with correct field sizes |

**Note:** Use `performance.now()` for timing. Configure Jest timeout to at least 30 seconds for the 10-iteration benchmark (10 iterations × up to 500ms each + overhead). Use `jest.setTimeout(30000)` in a `beforeAll` block.

---

## 15. Definition of Done

- [ ] All existing T01 tests pass (NodeCryptoProvider: deriveKey, generateSalt, encryptDatabase, decryptDatabase)
- [ ] All existing T02 tests pass (WebCryptoProvider: deriveKey, generateSalt, encryptDatabase, decryptDatabase)
- [ ] All existing T05 tests pass (EncryptedFileFormat: pack, unpack, error conditions)
- [ ] Cross-platform test file created at `packages/platform/src/__tests__/cross-platform-crypto.test.ts`
- [ ] CF-10-01 through CF-10-05 pass (Electron pack → Capacitor unpack)
- [ ] CF-11-01 through CF-11-05 pass (Capacitor pack → Electron unpack)
- [ ] CF-10-02 and CF-11-02 confirm key determinism across platforms
- [ ] `argon2-wasm` mock strategy documented at top of cross-platform test file (whether real WASM or fallback mock is used)
- [ ] CF-12-01 added to `NodeCryptoProvider.test.ts` and `WebCryptoProvider.test.ts`
- [ ] CF-12-01 mean < 500ms on development machine for both platforms
- [ ] CF-12-02 passes (validates output shape, not performance)
- [ ] `pnpm test` passes with zero failures across all packages
- [ ] `pnpm typecheck` passes with zero errors
- [ ] `pnpm lint` passes with zero warnings
- [ ] No duplicate tests — CF-01 through CF-09 verified via existing tests, not rewritten
- [ ] No secrets or production key material in any test file
- [ ] Git diff shows only the files listed in Sections 4–5
