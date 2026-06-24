# E03 T03 — Implement AES-256-GCM via Node.js crypto (Electron)

> **Epic:** E-03 Security Primitives
> **Depends on:** E03 T01 (Argon2id Electron — provides `NodeCryptoProvider` class and AES stubs)
> **Blocks:** E03 T-03.5 (Encrypted File Format), E03 T-03.6 (CryptoProvider Tests)
> **Parallel with:** E03 T-03.4 (AES-GCM Capacitor)
> **Predecessor spec:** E03-T01_IMPLEMENT_ARGON2ID_ELECTRON.md
> **Modifies file created by:** E03 T01

---

## 1. Goal

Replace the AES-GCM stubs in `NodeCryptoProvider.ts` (created in E03 T01) with real `encryptDatabase` and `decryptDatabase` implementations using Node.js built-in `crypto` module. Introduce the `EncryptedData` structured type and the `AuthenticationError` class.

After this task, `NodeCryptoProvider` implements the complete `CryptoProvider` interface — all four methods functional on Electron.

---

## 2. Scope

- Replace `encryptDatabase` stub with real AES-256-GCM encryption using `crypto.createCipheriv`
- Replace `decryptDatabase` stub with real AES-256-GCM decryption using `crypto.createDecipheriv`
- Define `EncryptedData` type (`{ ciphertext: Uint8Array; nonce: Uint8Array; tag: Uint8Array }`) in the shared domain layer
- Update `CryptoProvider` interface signatures to use `EncryptedData` instead of bare `Uint8Array`
- Define `AuthenticationError` class
- Add AES-GCM test cases to existing `NodeCryptoProvider.test.ts`
- Export `EncryptedData` and `AuthenticationError` from `@collectio/shared`

---

## 3. Out of Scope

- `deriveKey` / `generateSalt` — already implemented in E03 T01; no changes
- Capacitor `WebCryptoProvider` AES-GCM — E03 T-03.4
- Encrypted file format (`EncryptedFileFormat.ts`) — E03 T-03.5
- Cross-platform integration tests (CF-10, CF-11) — E03 T-03.6
- Streaming/chunked encryption — V1 uses in-memory encryption only; entire database fits in RAM
- Secure erasure of key material from memory — out of scope for V1

---

## 4. Files To Create

| # | File | Purpose |
|---|------|---------|
| 1 | `packages/shared/src/domain/types/EncryptedData.ts` | Structured type for encryption output |
| 2 | `packages/shared/src/domain/types/index.ts` | Barrel export for domain types |
| 3 | `packages/shared/src/domain/errors/AuthenticationError.ts` | Error class for auth tag failures |

---

## 5. Files To Modify

| # | File | Change |
|---|------|--------|
| 1 | `packages/shared/src/domain/interfaces/CryptoProvider.ts` | Update `encryptDatabase` return type to `Promise<EncryptedData>`; update `decryptDatabase` param to accept `EncryptedData` |
| 2 | `packages/shared/src/index.ts` | Add exports for `EncryptedData`, `AuthenticationError` |
| 3 | `packages/platform/src/electron/NodeCryptoProvider.ts` | Replace `encryptDatabase` and `decryptDatabase` stub implementations with real AES-256-GCM logic |
| 4 | `packages/platform/src/electron/__tests__/NodeCryptoProvider.test.ts` | Add AES-GCM test cases; remove ED-STUB-01 and DD-STUB-01 stub tests |

---

## 6. Interfaces

### 6.1 `EncryptedData` (new)

**Location:** `packages/shared/src/domain/types/EncryptedData.ts`

Plain TypeScript type (not a class). No methods. Represents the output of an AES-256-GCM encryption operation.

| Field | Type | Length | Description |
|-------|------|--------|-------------|
| `ciphertext` | `Uint8Array` | Variable | Encrypted database bytes |
| `nonce` | `Uint8Array` | 12 bytes | Initialization vector / nonce |
| `tag` | `Uint8Array` | 16 bytes | GCM authentication tag |

### 6.2 `CryptoProvider` (modified)

**Location:** `packages/shared/src/domain/interfaces/CryptoProvider.ts`

**Change from E03 T01:** `encryptDatabase` return type changed from `Promise<Uint8Array>` to `Promise<EncryptedData>`. `decryptDatabase` first parameter changed from `Uint8Array` to `EncryptedData`.

**Rationale for deviation from architecture doc (01_ARCHITECTURE.md Section 4):** The architecture doc's initial `Uint8Array` signatures were a high-level sketch. The encrypted file format (E03 T-03.5) stores nonce and tag separately from ciphertext in the file header (bytes 37-64). The `CryptoProvider` must expose these as distinct fields so the file format layer can place them at the correct byte offsets. Both Electron (Node.js `getAuthTag()`) and Capacitor (SubtleCrypto appended tag) natively produce these components — the structured type abstracts the platform difference.

| Method | Signature | Description |
|--------|-----------|-------------|
| `deriveKey` | `(password: string, salt: Uint8Array): Promise<Uint8Array>` | (unchanged from T01) |
| `generateSalt` | `(): Uint8Array` | (unchanged from T01) |
| `encryptDatabase` | `(db: Uint8Array, key: Uint8Array): Promise<EncryptedData>` | Encrypt plaintext database bytes with AES-256-GCM. Generates random 12-byte nonce internally. Returns ciphertext, nonce, and auth tag. |
| `decryptDatabase` | `(data: EncryptedData, key: Uint8Array): Promise<Uint8Array>` | Decrypt using provided ciphertext, nonce, and tag. Throws `AuthenticationError` if key is wrong or data is tampered. |

### 6.3 `AuthenticationError` (new)

**Location:** `packages/shared/src/domain/errors/AuthenticationError.ts`

Extends native `Error`. No extra fields needed in V1. Distinct from `DatabaseError` — this is a crypto-layer error, not a database error.

| Property | Type | Description |
|----------|------|-------------|
| `name` | `'AuthenticationError'` | Error name for instanceof checks |
| `message` | `string` | Descriptive message (e.g., "Decryption failed: authentication tag mismatch") |

**Why not in `DatabaseError.ts`:** The existing `DatabaseError`, `ConstraintError`, `ConnectionError` hierarchy is for SQLite-level errors. `AuthenticationError` is a cryptographic error that occurs at the `CryptoProvider` layer — a different concern. It has its own file in `domain/errors/`.

### 6.4 Domain Types Barrel (new)

**Location:** `packages/shared/src/domain/types/index.ts`

Re-exports `EncryptedData`. Future domain types (value objects, result types) added here.

---

## 7. Data Flow

```
NodeCryptoProvider.encryptDatabase(db, key)
  │
  ├─ Validate: db is Uint8Array (allow empty)
  ├─ Validate: key is exactly 32 bytes
  │
  ├─ Generate: nonce = crypto.randomBytes(12)
  │
  ├─ Create: cipher = crypto.createCipheriv('aes-256-gcm', key, nonce)
  │
  ├─ Encrypt: encrypted = Buffer.concat([
  │     cipher.update(db),
  │     cipher.final(),
  │   ])
  │
  ├─ Extract: tag = cipher.getAuthTag()  // 16 bytes
  │
  └─ Return: { ciphertext: Uint8Array, nonce: Uint8Array, tag: Uint8Array }
       └─ All wrapped in Promise.resolve() (Node.js crypto is synchronous)

NodeCryptoProvider.decryptDatabase(data, key)
  │
  ├─ Validate: data.ciphertext is Uint8Array (allow empty)
  ├─ Validate: data.nonce is exactly 12 bytes
  ├─ Validate: data.tag is exactly 16 bytes
  ├─ Validate: key is exactly 32 bytes
  │
  ├─ Create: decipher = crypto.createDecipheriv('aes-256-gcm', key, data.nonce)
  │
  ├─ Set tag: decipher.setAuthTag(data.tag)  ← MUST be called before update()
  │
  ├─ Decrypt: plaintext = Buffer.concat([
  │     decipher.update(data.ciphertext),
  │     decipher.final(),  // ← THROWS if tag mismatch
  │   ])
  │
  └─ Return: Uint8Array (plaintext database bytes)
       └─ Wrapped in Promise.resolve()

AUTHENTICATION FAILURE:
  decipher.final() throws "Unsupported state or unable to authenticate data"
  ├─ Catch the error
  └─ Throw new AuthenticationError('Decryption failed: authentication tag mismatch')
```

### Key Design Details

1. **Synchronous crypto, async interface:** Node.js `crypto.createCipheriv`/`createDecipheriv` are synchronous. All return values wrapped in `Promise.resolve()` to conform to `CryptoProvider` async interface (AD-01). Same pattern as `BetterSqlite3Connection`.

2. **`setAuthTag()` MUST be called before `update()`:** Node.js GCM decipher requires the auth tag to be set before any data is processed. Calling it after `update()` throws. This is documented in Node.js docs and is a common pitfall.

3. **Nonce generation:** 12 random bytes via `crypto.randomBytes(12)`. NIST SP 800-38D recommends 96-bit (12-byte) nonce for GCM. Other lengths degrade security. The nonce is generated inside `encryptDatabase` — the caller never provides it.

4. **Buffer ↔ Uint8Array:** Node.js `crypto` APIs return `Buffer` (which extends `Uint8Array`). For the return type, `Buffer` is assignable to `Uint8Array` — no explicit conversion needed. For `key` and `nonce` inputs, `Uint8Array` is accepted by `createCipheriv`/`createDecipheriv` (they accept `Buffer | Uint8Array` in Node 20 types).

5. **Empty plaintext support:** AES-GCM can encrypt zero-length data. `cipher.update(Buffer.alloc(0))` + `cipher.final()` returns just the tag (no ciphertext). Must handle gracefully.

6. **Error wrapping:** `decipher.final()` throws a generic `Error` on auth tag failure. The catch block wraps it in `AuthenticationError` so callers can distinguish auth failures from other error types.

7. **Cross-platform note (Rule 5.4):** Node.js returns tag separately (`getAuthTag()`). Capacitor's SubtleCrypto appends tag to ciphertext. By using the `EncryptedData` structured type, both platforms return `{ ciphertext, nonce, tag }` — the platform difference is abstracted behind the interface.

---

## 8. State Changes

**None.** `NodeCryptoProvider` is stateless. Each `encryptDatabase`/`decryptDatabase` call is independent.

---

## 9. Database Changes

**None.** AES-256-GCM encryption operates on byte arrays, not SQLite databases.

---

## 10. Error Handling

| Condition | Behavior |
|-----------|----------|
| Key is not exactly 32 bytes | Throw `TypeError` with message describing expected vs actual length |
| Nonce is not exactly 12 bytes (decrypt) | Throw `TypeError` |
| Tag is not exactly 16 bytes (decrypt) | Throw `TypeError` |
| `cipher.final()` throws (encrypt — extremely rare) | Let propagate. This indicates a Node.js crypto bug or memory corruption. |
| `decipher.final()` throws due to auth tag mismatch (wrong key or tampered data) | Catch → throw `new AuthenticationError('Decryption failed: authentication tag mismatch')` |
| `decipher.setAuthTag()` called with wrong-sized tag | Node.js crypto throws — let propagate as-is (input validation catches this earlier) |
| `decipher.update()` / `decipher.final()` throws for non-auth reasons | Let propagate. Do NOT wrap as `AuthenticationError` — only tag mismatch is auth failure. |

### Distinguishing auth failures from other crypto errors

`decipher.final()` may throw for multiple reasons. The catch block should wrap ALL `decipher.final()` errors as `AuthenticationError` because in AES-256-GCM, the only expected failure mode for `final()` is auth tag verification failure. Other failures (corrupted internal state, wrong algorithm) indicate a programming error and should not occur in production.

---

## 11. Logging Requirements

**None.** No logging performed. The AES key, nonce, tag, and ciphertext must NEVER be logged (Rule 12.2).

---

## 12. Security Requirements

| Rule | Requirement | Source |
|------|-------------|--------|
| S-01 | AES key is NEVER logged or stored outside `SecureStorageProvider`. | Rule 12.1, Rule 12.2 |
| S-02 | Nonce is 12 random bytes from `crypto.randomBytes()` (CSPRNG). NIST SP 800-38D recommends 96-bit nonce for GCM. | NIST SP 800-38D Section 8 |
| S-03 | GCM authentication tag is 16 bytes (128 bits). Standard GCM tag length — provides sufficient forgery resistance. | NIST SP 800-38D |
| S-04 | Nonce is NEVER reused with the same key. Each `encryptDatabase` call generates a fresh random nonce. | GCM security model requires unique (key, nonce) pairs |
| S-05 | AES-256 key is exactly 32 bytes — enforced by input validation. | AES-256 specification |
| S-06 | `decipher.setAuthTag()` is called BEFORE `decipher.update()` — ensures tag is verified before any plaintext is exposed. | Node.js GCM API requirements |
| S-07 | `decipher.final()` rejection produces `AuthenticationError` — callers can distinguish auth failure from other errors. | Constitution Section 12 |
| S-08 | Empty plaintext is securely handled — GCM still produces a valid tag for zero-length data. | AES-GCM specification |

---

## 13. Acceptance Criteria

| ID | Criterion | Verification |
|----|-----------|-------------|
| AC-01 | Round-trip: encrypt → decrypt returns original byte-for-byte | 1KB test data, same key, encrypt → decrypt → identical |
| AC-02 | Empty database round-trip | 0-byte plaintext → encrypt → decrypt → 0-byte result |
| AC-03 | Wrong key → `AuthenticationError` | Encrypt with key A, decrypt with key B → throws |
| AC-04 | Tampered ciphertext → `AuthenticationError` | Modify one byte in ciphertext after encrypt → decrypt throws |
| AC-05 | Modified nonce → `AuthenticationError` | Change one byte in nonce → decrypt throws |
| AC-06 | Encrypted output contains all three fields | `encryptDatabase` returns object with `ciphertext`, `nonce`, `tag` — all `Uint8Array` |
| AC-07 | Nonce is exactly 12 bytes | `data.nonce.length === 12` |
| AC-08 | Tag is exactly 16 bytes | `data.tag.length === 16` |
| AC-09 | Two encryptions with same key produce different nonces | Two calls → `nonce1 !== nonce2` (byte comparison) |
| AC-10 | Key validation: rejects key of wrong length | Key of 16 or 64 bytes → throws `TypeError` |
| AC-11 | Performance: 5MB encrypt <500ms | Timing test with `performance.now()` on development machine |
| AC-12 | Performance: 5MB decrypt <500ms | Timing test |
| AC-13 | `tsc --noEmit` passes with zero errors in `packages/shared` and `packages/platform` | Run `pnpm typecheck` |
| AC-14 | `pnpm lint` passes with zero warnings | Run from root |

---

## 14. Test Cases

**Test file:** `packages/platform/src/electron/__tests__/NodeCryptoProvider.test.ts`

This file already exists from E03 T01. AES-GCM test cases are added to it. The ED-STUB-01 and DD-STUB-01 tests are removed (stubs no longer exist).

### Test Environment

- Jest `testEnvironment: 'node'` — `crypto` built-in available, no mocking needed
- Fixed test key: 32-byte `Uint8Array` (e.g., all zeros or a known pattern)
- Test fixtures: small data buffers (1KB, empty, edge cases)

### New Test Cases (added to existing file)

#### `encryptDatabase`

| ID | Test | Input | Expected |
|----|------|-------|----------|
| EN-01 | Returns `EncryptedData` with all three fields | 1KB data, valid key | Result has `ciphertext`, `nonce`, `tag` — all `Uint8Array` |
| EN-02 | Nonce is 12 bytes | any valid input | `result.nonce.length === 12` |
| EN-03 | Tag is 16 bytes | any valid input | `result.tag.length === 16` |
| EN-04 | Two calls produce different nonces | same data + key, two calls | `nonce1` !== `nonce2` (byte comparison) |
| EN-05 | Two calls produce different ciphertexts (due to different nonces) | same data + key, two calls | `ciphertext1` !== `ciphertext2` |
| EN-06 | Empty plaintext succeeds | empty `Uint8Array`, valid key | Returns valid `EncryptedData`; ciphertext may be empty but nonce and tag present |
| EN-07 | Key not 32 bytes → rejects | 16-byte key | Throws `TypeError` |
| EN-08 | Key not 32 bytes → rejects (too long) | 64-byte key | Throws `TypeError` |
| EN-09 | Ciphertext length differs from plaintext length | 1KB plaintext | Ciphertext length equals plaintext length (GCM is a stream cipher — no padding) |

#### `decryptDatabase`

| ID | Test | Input | Expected |
|----|------|-------|----------|
| DE-01 | Round-trip: encrypt → decrypt | Encrypt then decrypt with same key | Decrypted equals original byte-for-byte |
| DE-02 | Empty round-trip | Encrypt empty, decrypt | Decrypted is empty `Uint8Array` |
| DE-03 | Wrong key → `AuthenticationError` | Encrypt with key A, decrypt with key B | Throws `AuthenticationError` |
| DE-04 | Tampered ciphertext → `AuthenticationError` | Encrypt, modify one byte in ciphertext, decrypt | Throws `AuthenticationError` |
| DE-05 | Modified nonce → `AuthenticationError` | Encrypt, change one byte in nonce, decrypt | Throws `AuthenticationError` |
| DE-06 | Modified tag → `AuthenticationError` | Encrypt, change one byte in tag, decrypt | Throws `AuthenticationError` |
| DE-07 | Nonce not 12 bytes → rejects | Crafted `EncryptedData` with 8-byte nonce | Throws `TypeError` |
| DE-08 | Tag not 16 bytes → rejects | Crafted `EncryptedData` with 8-byte tag | Throws `TypeError` |
| DE-09 | Key not 32 bytes → rejects | Valid encrypted data, 16-byte key | Throws `TypeError` |
| DE-10 | AuthenticationError is instanceof Error | Trigger auth failure | `err instanceof Error` is true; `err.name === 'AuthenticationError'` |
| DE-11 | Large data round-trip (performance) | 5MB plaintext | Decrypted equals original; operation <500ms |

#### Existing Tests Preserved (from T01)

All `deriveKey` and `generateSalt` tests (DK-01 through DK-09, GS-01 through GS-04) remain unchanged and must continue to pass.

Removed: ED-STUB-01, DD-STUB-01 (stubs no longer exist).

---

## 15. Definition of Done

- [ ] `EncryptedData` type defined in `packages/shared/src/domain/types/EncryptedData.ts`
- [ ] `packages/shared/src/domain/types/index.ts` barrel exports `EncryptedData`
- [ ] `AuthenticationError` class defined in `packages/shared/src/domain/errors/AuthenticationError.ts`
- [ ] `CryptoProvider` interface updated: `encryptDatabase` returns `Promise<EncryptedData>`, `decryptDatabase` accepts `EncryptedData`
- [ ] `EncryptedData` and `AuthenticationError` exported from `packages/shared/src/index.ts`
- [ ] `NodeCryptoProvider.encryptDatabase` fully implemented (replaces stub)
- [ ] `NodeCryptoProvider.decryptDatabase` fully implemented (replaces stub)
- [ ] `deriveKey` and `generateSalt` unchanged from E03 T01 — all existing tests still pass
- [ ] `encryptDatabase` validates key length (32 bytes exactly)
- [ ] `decryptDatabase` validates key (32 bytes), nonce (12 bytes), and tag (16 bytes)
- [ ] `decipher.setAuthTag()` called BEFORE `decipher.update()` in decrypt
- [ ] Auth tag mismatch throws `AuthenticationError` (not generic Error)
- [ ] Both `encryptDatabase` and `decryptDatabase` return `Promise` (async interface — AD-01)
- [ ] All existing T01 tests (deriveKey, generateSalt) still pass
- [ ] All 20 new AES-GCM test cases pass (EN-01 through DE-11)
- [ ] AC-11/AC-12 performance (<500ms for 5MB) passes on development machine
- [ ] `tsc --noEmit` passes with zero errors across all packages
- [ ] `pnpm lint` passes with zero warnings
- [ ] `pnpm --filter @collectio/platform test` passes with zero failures
- [ ] No secrets or key material in test fixtures or log output
- [ ] Git diff shows only the files listed in Sections 4–5
