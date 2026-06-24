# E03 T02 — Implement Argon2id via argon2-wasm (Capacitor)

> **Epic:** E-03 Security Primitives
> **Depends on:** E-01 (Project Infrastructure), E-02 (Database Layer), E03 T01 (`CryptoProvider` interface)
> **Blocks:** E03 T-03.4 (AES-GCM Capacitor), E03 T-03.5 (Encrypted File Format), E03 T-03.6 (CryptoProvider Tests)
> **Parallel with:** E03 T-01 (Argon2id Electron)
> **Predecessor spec:** E03-T01_IMPLEMENT_ARGON2ID_ELECTRON.md (defines the shared `CryptoProvider` interface)

---

## 1. Goal

Implement the `deriveKey` and `generateSalt` methods of `CryptoProvider` for Capacitor Android using the `argon2-wasm` WebAssembly package. This is the Capacitor counterpart to E03 T01 (which implements the same interface for Electron via the native `argon2` npm package).

Both implementations must produce byte-identical output given the same (password, salt) inputs — cross-platform determinism is mandatory for sync to function.

---

## 2. Scope

- Implement `deriveKey` and `generateSalt` in `packages/platform/src/capacitor/WebCryptoProvider.ts`
- Create `argon2-wasm.d.ts` type declarations (PK-02: package has no built-in types)
- Stub `encryptDatabase` and `decryptDatabase` with "not yet implemented" errors (AES-GCM deferred to E03 T-03.4 — same file)
- Export `WebCryptoProvider` from `@collectio/platform` capacitor barrel
- Unit tests for `deriveKey` and `generateSalt`

---

## 3. Out of Scope

- `encryptDatabase` / `decryptDatabase` implementation — deferred to E03 T-03.4 (same file)
- `CryptoProvider` interface definition — created by E03 T01 in `packages/shared/src/domain/interfaces/`
- Electron `NodeCryptoProvider` — E03 T01
- Encrypted file format (`EncryptedFileFormat.ts`) — E03 T-03.5
- Cross-platform integration tests (CF-10, CF-11) — E03 T-03.6
- `AuthenticationError` custom error class — E03 T-03.4 (not needed for Argon2id-only methods)
- SubtleCrypto AES-GCM usage — E03 T-03.4
- `toArrayBuffer()` helper (Rule 5.2) — not needed until AES-GCM in T-03.4
- GCM tag handling (Rule 5.4) — not needed until AES-GCM in T-03.4
- Device-level testing — spike E-00b already validated on physical Android device
- Vite configuration changes — `argon2-wasm` is already installed; Vite handles WASM bundling natively

---

## 4. Files To Create

| # | File | Purpose |
|---|------|---------|
| 1 | `packages/platform/src/capacitor/argon2-wasm.d.ts` | TypeScript declarations for `argon2-wasm` |
| 2 | `packages/platform/src/capacitor/WebCryptoProvider.ts` | Capacitor implementation of `CryptoProvider` |
| 3 | `packages/platform/src/capacitor/__tests__/WebCryptoProvider.test.ts` | Unit tests |

---

## 5. Files To Modify

| # | File | Change |
|---|------|--------|
| 1 | `packages/platform/src/capacitor/index.ts` | Add `export { WebCryptoProvider } from './WebCryptoProvider.js'` |

---

## 6. Interfaces

### 6.1 `CryptoProvider` (prerequisite — defined by E03 T01)

**Location:** `packages/shared/src/domain/interfaces/CryptoProvider.ts`

This file is created by E03 T01. E03 T02 imports and implements it. Do NOT create this file if it already exists.

| Method | Signature | Description |
|--------|-----------|-------------|
| `deriveKey` | `(password: string, salt: Uint8Array): Promise<Uint8Array>` | Derive a 32-byte AES-256 key from password + salt using Argon2id. Parameters: 64MB memory, 3 iterations, 4 parallelism. |
| `generateSalt` | `(): Uint8Array` | Generate a 32-byte cryptographically random salt. Synchronous. |
| `encryptDatabase` | `(db: Uint8Array, key: Uint8Array): Promise<Uint8Array>` | Encrypt plaintext database bytes with AES-256-GCM. **Stubbed in this task.** |
| `decryptDatabase` | `(encrypted: Uint8Array, key: Uint8Array): Promise<Uint8Array>` | Decrypt encrypted database bytes with AES-256-GCM. **Stubbed in this task.** |

### 6.2 `argon2-wasm.d.ts` (new)

**Location:** `packages/platform/src/capacitor/argon2-wasm.d.ts`

Declares the `argon2-wasm` module for TypeScript. The package has no built-in declarations (PK-02, Rule 11.3).

**Module shape (from spike E-00b):**

- Default export: function that accepts `Argon2Options` and returns `Promise<Argon2Result>`
- Named exports: none relevant; the module is consumed via default import
- `Argon2Options` shape: `{ pass: Uint8Array; salt: Uint8Array; time: number; mem: number; parallelism: number; hashLen: number; type: number }`
- `Argon2Result` shape: `{ hash: Uint8Array; hashHex: string; encoded: string }`
- Type constants: `type: 0` (Argon2d), `type: 1` (Argon2i), `type: 2` (Argon2id)

The `.d.ts` must use `declare module 'argon2-wasm'` syntax per Rule 11.3.

---

## 7. Data Flow

```
WebCryptoProvider.deriveKey(password, salt)
  │
  ├─ Validate: password is non-empty string
  ├─ Validate: salt is exactly 32 bytes
  │
  ├─ Encode: passBytes = new TextEncoder().encode(password)   ← CRITICAL (Rule 5.1)
  │
  ├─ Call: argon2.default.hash({
  │     pass: passBytes,         // Uint8Array — NOT string
  │     salt: salt,              // Uint8Array
  │     type: 2,                // Argon2id
  │     time: 3,
  │     mem: 65536,             // 64 MB
  │     parallelism: 4,
  │     hashLen: 32,            // 32 bytes = 256 bits
  │   })
  │
  ├─ Receive: { hash: Uint8Array, hashHex: string, encoded: string }
  │
  └─ Return: result.hash (raw 32-byte Uint8Array)

WebCryptoProvider.generateSalt()
  │
  ├─ Create: new Uint8Array(32)
  │
  ├─ Fill: crypto.getRandomValues(buffer)  ← Web Crypto API (synchronous)
  │
  └─ Return: Uint8Array (32 random bytes)
```

### Key Design Details

1. **Rule 5.1 is mandatory:** Password MUST be encoded as UTF-8 bytes via `new TextEncoder().encode(password)` BEFORE passing to `argon2.default.hash()`. The spike confirmed that without this, Unicode passwords produce different keys on Capacitor vs Electron — breaking cross-platform sync. This is the #1 implementation requirement.

2. **API shape differs from Electron:** `argon2-wasm` uses `argon2.default.hash({ pass, salt, time, mem, parallelism, hashLen, type })` — a single options object. Electron's `argon2` npm uses `argon2.hash(password, { salt, raw, type, timeCost, memoryCost, parallelism, hashLength })` — separate password + options. Same parameters, different calling convention.

3. **Return type differs from Electron:** `argon2-wasm` returns `{ hash: Uint8Array, hashHex: string, encoded: string }` — extract `.hash` for the raw key. Electron's `argon2` with `raw: true` returns `Buffer` directly.

4. **`crypto.getRandomValues()` is synchronous:** No Promise needed for `generateSalt()`. The interface declares `(): Uint8Array` (no Promise). Matches the architecture exactly.

5. **32-byte salt is well under 64KB limit:** Rule 5.3 (chunked `getRandomValues`) does NOT apply — 32 bytes << 65,536 bytes. No chunking needed.

6. **`encryptDatabase` / `decryptDatabase` stubs:** Throw `Error` with message referencing E03 T-03.4. Do NOT leave unimplemented (TypeScript would reject the class). Do NOT silently succeed.

7. **WASM load behavior:** `argon2-wasm` bundles the WASM binary as base64 in JavaScript. No separate `.wasm` file to resolve at runtime. Vite handles this natively; the `fs`/`path` externalization warnings documented in PK-02 are expected and harmless.

---

## 8. State Changes

**None.** `WebCryptoProvider` is stateless — no persistent state, no connection, no cache. Each call is independent.

---

## 9. Database Changes

**None.** Argon2id key derivation does not involve SQLite.

---

## 10. Error Handling

| Condition | Behavior |
|-----------|----------|
| Password is empty string `""` | Allowed — Argon2id can hash empty passwords. `TextEncoder().encode("")` produces zero-length `Uint8Array`. Produces a valid 32-byte key. |
| Salt is not exactly 32 bytes | Throw `TypeError` with message describing expected vs actual length |
| `argon2.default.hash()` rejects (WASM error, OOM, etc.) | Let the Promise rejection propagate. Do not catch and wrap. |
| `crypto.getRandomValues()` throws (extremely rare) | Let the exception propagate. Do not catch. |
| Calling `encryptDatabase()` (stub) | Throw `Error('encryptDatabase not yet implemented — see E03 T03.4')` |
| Calling `decryptDatabase()` (stub) | Throw `Error('decryptDatabase not yet implemented — see E03 T03.4')` |

### Why no custom error class

`AuthenticationError` is only needed for AES-GCM auth tag failures. Argon2id derivation succeeds for any password — it never "fails" on bad input. The `AuthenticationError` class will be defined in E03 T-03.4 alongside AES-GCM.

---

## 11. Logging Requirements

**None.** `WebCryptoProvider` performs no logging. The derived key and salt must NEVER be logged (Rule 12.1, Rule 12.2).

---

## 12. Security Requirements

| Rule | Requirement | Source |
|------|-------------|--------|
| S-01 | Master password is NEVER stored. Only the derived key is stored. | FR-AUTH-06, Rule 12.1 |
| S-02 | Derived key and salt are NEVER logged. | Rule 12.2 |
| S-03 | Salt is 32 bytes from `crypto.getRandomValues()` (CSPRNG). | NIST SP 800-132 |
| S-04 | Argon2id parameters: 64MB memory, 3 iterations, 4 parallelism, 32-byte output. Match spike-validated values and constitution Section 12. | E-00b Spike |
| S-05 | Password encoded as UTF-8 bytes via `TextEncoder` before passing to `argon2-wasm`. **CRITICAL for cross-platform determinism.** | Rule 5.1, Spike AR-CROSS |
| S-06 | `deriveKey` returns raw bytes only (the `.hash` field of the result object). Never return `hashHex` or `encoded` — those are formatted strings, not raw key material. | Constitution Section 12 |
| S-07 | `crypto.getRandomValues()` is the correct CSPRNG for WebView context. Do NOT use `Math.random()`. | Web Crypto API spec |

---

## 13. Acceptance Criteria

| ID | Criterion | Verification |
|----|-----------|-------------|
| AC-01 | Same (password, salt) → identical 32-byte key on repeat calls | Two calls with same inputs produce byte-identical `Uint8Array` |
| AC-02 | Different password → different key | Keys differ when password differs |
| AC-03 | Different salt → different key | Keys differ when salt differs |
| AC-04 | Output is exactly 32 bytes | `key.length === 32` |
| AC-05 | `generateSalt()` produces 32 random bytes | Length = 32; two consecutive calls produce different values |
| AC-06 | Password is UTF-8 encoded via `TextEncoder` before hash | Code inspection: `new TextEncoder().encode(password)` present before argon2 call |
| AC-07 | `deriveKey` extracts `.hash` field from result object (not `.hashHex` or `.encoded`) | Code inspection: `result.hash` is the return value |
| AC-08 | `encryptDatabase()` throws descriptive "not yet implemented" error | E03 T-03.4 will replace the stub |
| AC-09 | `decryptDatabase()` throws descriptive "not yet implemented" error | E03 T-03.4 will replace the stub |
| AC-10 | `tsc --noEmit` passes with zero errors in `packages/platform` | Run `pnpm typecheck` from root |
| AC-11 | `pnpm lint` passes with zero warnings | Run from root |
| AC-12 | `WebCryptoProvider` is exported from `packages/platform/src/capacitor/index.ts` | Importable as `import { WebCryptoProvider } from '@collectio/platform'` |

### Cross-platform determinism (CRITICAL)

The ultimate verification that Capacitor and Electron produce identical keys is the CF-10/CF-11 integration tests in E03 T-03.6. This task's unit tests cannot verify cross-platform determinism directly (they run in Node.js Jest, not Capacitor WebView). However, the implementation MUST follow the exact API pattern validated in the spike (Rule 5.1, `TextEncoder`, parameter values) — any deviation will cause CF-10/CF-11 to fail.

---

## 14. Test Cases

**Test file:** `packages/platform/src/capacitor/__tests__/WebCryptoProvider.test.ts`

Tests run in Node.js environment via Jest (`testEnvironment: 'node'` — same as `BetterSqlite3Connection.test.ts`).

### Test Environment Note

`argon2-wasm` is a WebAssembly module. In the Capacitor WebView, it loads and executes natively. In Jest's Node.js environment:

- **Option A (preferred):** The WASM binary may execute successfully in Node.js V8 (Node.js has built-in WASM support since v8). If it works, no mocking needed.
- **Option B (fallback):** If WASM fails to load in Jest, mock `argon2-wasm` with a stub that uses Node.js's native `argon2` package or a hand-crafted argon2 function for unit tests. The mock must return the same object shape as the real module: `{ default: { hash: (opts) => Promise<{ hash: Uint8Array }> } }`.

The implementation should attempt Option A first. If `argon2-wasm` can `import` and `hash()` successfully in Jest without errors, use the real module. If not, implement Option B with a clear comment explaining the mock.

### Test Structure

Follows existing convention: `describe('WebCryptoProvider')`, `beforeEach` creates instance, individual `describe` blocks per method (`deriveKey`, `generateSalt`, `encryptDatabase`, `decryptDatabase`).

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
| DK-07 | Password is UTF-8 encoded via TextEncoder | Spy/mock verifies `TextEncoder` usage; or: test with Unicode password (e.g., "パスワード") and verify no throw | Returns valid 32-byte key |
| DK-08 | Salt not 32 bytes → rejects | salt of 16 bytes | Throws `TypeError` |
| DK-09 | Salt not 32 bytes (too large) | salt of 64 bytes | Throws `TypeError` |

#### `generateSalt`

| ID | Test | Input | Expected |
|----|------|-------|----------|
| GS-01 | Returns 32 bytes | none | `salt.length === 32` |
| GS-02 | Returns `Uint8Array` | none | `salt instanceof Uint8Array` |
| GS-03 | Two consecutive calls return different values | none | Salts differ (byte comparison) |
| GS-04 | Multiple calls produce unique values | 100 calls | All 100 salts are unique |

#### `encryptDatabase` (stub)

| ID | Test | Input | Expected |
|----|------|-------|----------|
| ED-STUB-01 | Throws not-implemented error | any inputs | Throws `Error` with message containing "not yet implemented" and "E03 T03.4" |

#### `decryptDatabase` (stub)

| ID | Test | Input | Expected |
|----|------|-------|----------|
| DD-STUB-01 | Throws not-implemented error | any inputs | Throws `Error` with message containing "not yet implemented" and "E03 T03.4" |

---

## 15. Definition of Done

- [ ] `CryptoProvider` interface exists in `packages/shared/src/domain/interfaces/CryptoProvider.ts` (prerequisite from T01 — verify, do not re-create)
- [ ] `argon2-wasm.d.ts` created with `declare module 'argon2-wasm'` and correct type shapes
- [ ] `WebCryptoProvider.ts` created with `deriveKey` and `generateSalt` fully implemented
- [ ] Rule 5.1 enforced: `new TextEncoder().encode(password)` present in `deriveKey`
- [ ] `deriveKey` extracts `.hash` from result object (not `.hashHex` or `.encoded`)
- [ ] `encryptDatabase` and `decryptDatabase` stubbed with descriptive errors referencing E03 T-03.4
- [ ] `WebCryptoProvider` exported from `packages/platform/src/capacitor/index.ts`
- [ ] Test file created at `packages/platform/src/capacitor/__tests__/WebCryptoProvider.test.ts`
- [ ] All 14 test cases pass (DK-01 through DD-STUB-01)
- [ ] `tsc --noEmit` passes with zero errors in `packages/platform`
- [ ] `pnpm lint` passes with zero warnings
- [ ] `packages/platform` Jest suite passes (including existing `CapacitorSqliteConnection` tests and new `WebCryptoProvider` tests)
- [ ] `packages/platform` Jest suite does NOT import or require Capacitor native plugins (`@capacitor-community/sqlite`, `capacitor-secure-storage-plugin`) — `WebCryptoProvider` uses only `argon2-wasm` and `crypto.getRandomValues()`
- [ ] No secrets or key material in test fixtures or log output
- [ ] Git diff shows only the 3 new files and 1 modified file listed in Sections 4–5
