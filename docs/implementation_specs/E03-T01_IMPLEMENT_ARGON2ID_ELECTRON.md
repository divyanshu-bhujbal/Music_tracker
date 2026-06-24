# E03 T01 — Implement Argon2id via argon2 npm (Electron)

> **Epic:** E-03 Security Primitives
> **Depends on:** E-01 (Project Infrastructure), E-02 (Database Layer)
> **Blocks:** E03 T-03.3 (AES-GCM Electron), E03 T-03.5 (Encrypted File Format), E03 T-03.6 (CryptoProvider Tests)
> **Parallel with:** E03 T-03.2 (Argon2id Capacitor)

---

## 1. Goal

Implement the `deriveKey` and `generateSalt` methods of `CryptoProvider` for Electron using the native `argon2` npm package. These are the two Argon2id methods. The AES-256-GCM methods (`encryptDatabase`, `decryptDatabase`) are deferred to E03 T-03.3 (same file, later task).

The implementation must produce byte-identical output to the Capacitor `WebCryptoProvider` (E03 T-03.2) given the same (password, salt) inputs — cross-platform determinism is mandatory for sync.

---

## 2. Scope

- Define the full `CryptoProvider` interface (`deriveKey`, `generateSalt`, `encryptDatabase`, `decryptDatabase`) in `packages/shared/src/domain/interfaces/`
- Implement `deriveKey` and `generateSalt` in `packages/platform/src/electron/NodeCryptoProvider.ts`
- Stub `encryptDatabase` and `decryptDatabase` with clear "not yet implemented" errors until E03 T-03.3
- Export `CryptoProvider` from `@collectio/shared`
- Export `NodeCryptoProvider` from `@collectio/platform` electron barrel
- Unit tests for `deriveKey` and `generateSalt`

---

## 3. Out of Scope

- `encryptDatabase` / `decryptDatabase` implementation — deferred to E03 T-03.3 (same file)
- Capacitor `WebCryptoProvider` — E03 T-03.2
- Encrypted file format (`EncryptedFileFormat.ts`) — E03 T-03.5
- Cross-platform integration tests (CF-10, CF-11) — E03 T-03.6
- `AuthenticationError` custom error class — E03 T-03.3 (not needed for Argon2id-only methods)
- Integration with `SecureStorageProvider` — E-04
- Integration with sync engine — E-10

---

## 4. Files To Create

| # | File | Purpose |
|---|------|---------|
| 1 | `packages/shared/src/domain/interfaces/CryptoProvider.ts` | Interface contract |
| 2 | `packages/shared/src/domain/interfaces/index.ts` | Barrel export for all domain interfaces |
| 3 | `packages/platform/src/electron/NodeCryptoProvider.ts` | Electron implementation |
| 4 | `packages/platform/src/electron/__tests__/NodeCryptoProvider.test.ts` | Unit tests |

---

## 5. Files To Modify

| # | File | Change |
|---|------|--------|
| 1 | `packages/shared/src/index.ts` | Add `export type { CryptoProvider } from './domain/interfaces/CryptoProvider.js'` |
| 2 | `packages/platform/src/electron/index.ts` | Add `export { NodeCryptoProvider } from './NodeCryptoProvider.js'` |

---

## 6. Interfaces

### 6.1 `CryptoProvider` (new)

**Location:** `packages/shared/src/domain/interfaces/CryptoProvider.ts`

**Note:** This file defines the full interface per the constitution (01_ARCHITECTURE.md Section 4). The Electron implementation in this task only implements `deriveKey` and `generateSalt`. The remaining methods are stubbed and will be implemented in E03 T-03.3.

| Method | Signature | Description |
|--------|-----------|-------------|
| `deriveKey` | `(password: string, salt: Uint8Array): Promise<Uint8Array>` | Derive a 32-byte AES-256 key from password + salt using Argon2id. Parameters: 64MB memory, 3 iterations, 4 parallelism. |
| `generateSalt` | `(): Uint8Array` | Generate a 32-byte cryptographically random salt. Synchronous (no async I/O needed). |
| `encryptDatabase` | `(db: Uint8Array, key: Uint8Array): Promise<Uint8Array>` | Encrypt plaintext database bytes with AES-256-GCM. Returns ciphertext + nonce + tag. |
| `decryptDatabase` | `(encrypted: Uint8Array, key: Uint8Array): Promise<Uint8Array>` | Decrypt encrypted database bytes with AES-256-GCM. Returns plaintext database. |

### 6.2 Domain Interfaces Barrel (new)

**Location:** `packages/shared/src/domain/interfaces/index.ts`

Re-exports `CryptoProvider`. Future interfaces (`SecureStorageProvider`, `AuthProvider`, `CloudStorageProvider`, `CategoryDefinition`) will be added here later.

---

## 7. Data Flow

```
NodeCryptoProvider.deriveKey(password, salt)
  │
  ├─ Validate: password is non-empty string
  ├─ Validate: salt is exactly 32 bytes
  │
  ├─ Call: argon2.hash(password, {
  │     salt: Buffer.from(salt),
  │     raw: true,
  │     type: argon2id (2),
  │     timeCost: 3,
  │     memoryCost: 65536,    // 64 MB
  │     parallelism: 4,
  │     hashLength: 32,       // 32 bytes = 256 bits
  │   })
  │
  ├─ Receive: Promise<Buffer> — raw 32-byte hash
  │
  └─ Return: Buffer → Uint8Array (wrapped in Promise)

NodeCryptoProvider.generateSalt()
  │
  ├─ Call: crypto.randomBytes(32)
  │
  └─ Return: Buffer → Uint8Array (synchronous; no Promise wrapper needed, but must match async interface)
```

### Key Design Details

1. **`argon2.hash()` is async** — returns `Promise<Buffer>`. No Promise.resolve() wrapper needed (unlike `better-sqlite3` which is synchronous). This is a true async operation.

2. **Salt as `Buffer`:** `argon2.hash()` expects `Buffer` for the `salt` option. Convert `Uint8Array` salt to `Buffer` via `Buffer.from(salt)`.

3. **Raw output:** `raw: true` returns raw 32 bytes. Without `raw: true`, the function returns a formatted Argon2id hash string — NOT what we want for key derivation.

4. **Constant pool:** `crypto.randomBytes()` returns `Buffer`. Convert to `Uint8Array` for interface conformance.

5. **`encryptDatabase` / `decryptDatabase` stubs:** Throw a descriptive error referencing that these will be implemented in E03 T-03.3. Do NOT leave them unimplemented (TypeScript would reject). Do NOT silently succeed with no-op behavior.

---

## 8. State Changes

**None.** `NodeCryptoProvider` is stateless — it holds no persistent state, no connection, no cache. Each call is independent.

---

## 9. Database Changes

**None.** Argon2id key derivation does not involve SQLite. The `kdf_salt` key in `app_metadata` is read/written by the setup/auth flow (E-04), not by this module.

---

## 10. Error Handling

| Condition | Behavior |
|-----------|----------|
| Password is empty string `""` | Allowed — Argon2id can hash empty passwords. Produces a valid key. |
| Salt is not exactly 32 bytes | Throw `TypeError` with message describing expected vs actual length |
| Salt is `Uint8Array` of correct length but wrong type passed (e.g., `Array`) | This is a TypeScript compile-time error; no runtime guard needed |
| `argon2.hash()` rejects (OOM, native addon crash, etc.) | Let the Promise rejection propagate. Do not catch and wrap. |
| `crypto.randomBytes()` fails (extremely rare — system entropy exhausted) | Let the exception propagate. Do not catch. |
| Calling `encryptDatabase()` (not yet implemented) | Throw `Error('encryptDatabase not yet implemented — see E03 T03.3')` |
| Calling `decryptDatabase()` (not yet implemented) | Throw `Error('decryptDatabase not yet implemented — see E03 T03.3')` |

### Why no custom error class for T-03.1 (counter-note)

`AuthenticationError` is part of `CryptoProvider` per constitution but is only needed for AES-GCM auth tag failures (wrong key, tampered data). Argon2id derivation produces a key from any password — it never "fails" on bad input (unless salt is invalid). The `AuthenticationError` class will be defined in E03 T-03.3 alongside AES-GCM.

---

## 11. Logging Requirements

**None.** `NodeCryptoProvider` performs no logging. The derived key and salt values must NEVER be logged (Rule 12.1, Rule 12.2).

The only exception: if the implementation includes a DEBUG-level diagnostic log indicating "Argon2id derivation started/completed" with NO parameter values, this is acceptable but not required.

---

## 12. Security Requirements

| Rule | Requirement | Source |
|------|-------------|--------|
| S-01 | Master password is NEVER stored. Only the derived key is stored. | FR-AUTH-06, Rule 12.1 |
| S-02 | Derived key and salt are NEVER logged. | Rule 12.2 |
| S-03 | Salt is 32 bytes from a CSPRNG (`crypto.randomBytes`). NIST SP 800-132 recommends salt >= 128 bits. | Constitution 14.1 (`kdf_salt` = 32 bytes) |
| S-04 | Argon2id parameters (64MB, 3 iterations, 4 parallelism, 32-byte output) match the spike-validated values and constitution Section 12 security table. | E-00b Spike |
| S-05 | Password is passed to `argon2.hash()` as a JavaScript string. `argon2` npm converts strings to UTF-8 internally — this matches the expected behavior. | Rule 5.1 (explicit UTF-8 encoding) |
| S-06 | `deriveKey` output is raw bytes (`raw: true`), not an encoded hash string. The encoded format includes the salt and parameters, which would re-derive incorrectly if passed to AES. | Constitution Section 12 |

### Note on Rule 5.1 (explicit UTF-8 encoding)

Rule 5.1 requires `new TextEncoder().encode(password)` for `argon2-wasm` (Capacitor) to ensure cross-platform determinism. For Electron's native `argon2` npm package, passing the password as a JavaScript string is correct — the native addon uses UTF-8 encoding internally. This matches the spike finding: "ASCII passwords: byte-identical between WASM and native."

---

## 13. Acceptance Criteria

| ID | Criterion | Verification |
|----|-----------|-------------|
| AC-01 | Same (password, salt) → identical 32-byte key on repeat calls | Two calls with same inputs produce byte-identical `Uint8Array` |
| AC-02 | Different password → different key | Keys differ when password differs |
| AC-03 | Different salt → different key | Keys differ when salt differs |
| AC-04 | Completes in <500ms on mid-range Windows hardware | Timing test with `performance.now()` |
| AC-05 | `generateSalt()` produces 32 random bytes | Length = 32; two consecutive calls produce different values |
| AC-06 | Output verified against known Argon2id test vector (RFC 9106) | Compare raw output to reference implementation |
| AC-07 | `encryptDatabase()` throws descriptive "not yet implemented" error | E03 T-03.3 will replace the stub |
| AC-08 | `decryptDatabase()` throws descriptive "not yet implemented" error | E03 T-03.3 will replace the stub |
| AC-09 | `tsc --noEmit` passes with zero errors in `packages/shared` and `packages/platform` | Run `pnpm typecheck` from root |
| AC-10 | `pnpm lint` passes with zero warnings | Run from root |

### RFC 9106 Test Vector (reference)

The Argon2id RFC 9106 Section 4 includes test vectors. Use the "Argon2id, version 19, t=1, m=16, p=1" vector for deterministic validation with different parameters than production. The production parameters (t=3, m=65536, p=4) are too slow for unit tests — test the parameter mapping with a fast vector, then test production parameters in a dedicated timing test.

---

## 14. Test Cases

**Test file:** `packages/platform/src/electron/__tests__/NodeCryptoProvider.test.ts`

Tests run in Node.js environment via Jest (same as `BetterSqlite3Connection.test.ts`). The `argon2` native addon is available in this environment.

### Test Structure

Follows existing convention: `jest.mock()` at top if needed, `describe('NodeCryptoProvider')`, `beforeEach` creates instance, individual `describe` blocks per method.

### Test Cases

#### `deriveKey`

| ID | Test | Input | Expected |
|----|------|-------|----------|
| DK-01 | Determinism: same inputs produce same output | password="test", salt=predefined 32 bytes | Two calls return identical `Uint8Array` |
| DK-02 | Different password produces different key | pw1="alpha", pw2="beta", same salt | Keys differ |
| DK-03 | Different salt produces different key | same password, two different 32-byte salts | Keys differ |
| DK-04 | Output is exactly 32 bytes | any valid inputs | `key.length === 32` |
| DK-05 | Output is `Uint8Array` instance | any valid inputs | `key instanceof Uint8Array` |
| DK-06 | Empty password is accepted | password="", valid salt | Returns 32-byte key without error |
| DK-07 | RFC 9106 test vector | password="password", salt=known vector, t=1, m=16, p=1, hashLen=32 | Raw output matches known expected bytes |
| DK-08 | Salt not 32 bytes → rejects | salt of 16 bytes or 64 bytes | Throws `TypeError` |
| DK-09 | Performance: completes under 500ms | production params (t=3, m=65536, p=4, hashLen=32) | `deriveKey(...)` resolves within 500ms |

#### `generateSalt`

| ID | Test | Input | Expected |
|----|------|-------|----------|
| GS-01 | Returns 32 bytes | none | `salt.length === 32` |
| GS-02 | Returns `Uint8Array` | none | `salt instanceof Uint8Array` |
| GS-03 | Two consecutive calls return different values | none | `salt1 !== salt2` (byte comparison) |
| GS-04 | Multiple calls produce unique values | 100 calls | All 100 salts are unique |

#### `encryptDatabase` (stub)

| ID | Test | Input | Expected |
|----|------|-------|----------|
| ED-STUB-01 | Throws not-implemented error | any inputs | Throws `Error` with message containing "not yet implemented" |

#### `decryptDatabase` (stub)

| ID | Test | Input | Expected |
|----|------|-------|----------|
| DD-STUB-01 | Throws not-implemented error | any inputs | Throws `Error` with message containing "not yet implemented" |

### Test Environment Configuration

- Jest environment: `node` (default for platform package — see `jest.config.ts`)
- The `argon2` npm package does NOT need to be mocked — it is a native addon available in Node.js test environment
- The `NodeCryptoProvider` uses `crypto` from Node.js built-in — no mocking needed
- Use `import { hash, argon2id } from 'argon2'` — the package has built-in TypeScript declarations

---

## 15. Definition of Done

- [ ] `CryptoProvider` interface defined in `packages/shared/src/domain/interfaces/CryptoProvider.ts`
- [ ] `packages/shared/src/domain/interfaces/index.ts` barrel exports `CryptoProvider`
- [ ] `CryptoProvider` exported from `packages/shared/src/index.ts`
- [ ] `NodeCryptoProvider.ts` created with `deriveKey` and `generateSalt` fully implemented
- [ ] `encryptDatabase` and `decryptDatabase` stubbed with descriptive errors
- [ ] `NodeCryptoProvider` exported from `packages/platform/src/electron/index.ts`
- [ ] Test file created at `packages/platform/src/electron/__tests__/NodeCryptoProvider.test.ts`
- [ ] All 14 test cases pass (DK-01 through DD-STUB-01)
- [ ] AC-04 (performance <500ms) passes on the development machine
- [ ] AC-07 (RFC 9106 vector) verified
- [ ] `pnpm typecheck` passes with zero errors across all packages
- [ ] `pnpm lint` passes with zero warnings
- [ ] `packages/platform` Jest suite passes: `pnpm --filter @collectio/platform test`
- [ ] No secrets or key material in test fixtures or log output
- [ ] Git diff shows only the 4 new files and 2 modified files listed in Sections 4–5
