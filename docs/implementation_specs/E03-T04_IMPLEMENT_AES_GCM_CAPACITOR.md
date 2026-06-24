# E03 T04 — Implement AES-256-GCM via SubtleCrypto (Capacitor)

> **Epic:** E-03 Security Primitives
> **Depends on:** E03 T02 (Argon2id Capacitor), E03 T03 (AES-GCM Electron — defines shared types)
> **Blocks:** E03 T-03.5 (Encrypted File Format), E03 T-03.6 (CryptoProvider Tests)
> **Parallel with:** E03 T-03 (AES-GCM Electron)
> **Predecessor specs:** E03-T02_IMPLEMENT_ARGON2ID_CAPACITOR.md, E03-T03_IMPLEMENT_AES_GCM_ELECTRON.md
> **Modifies file created by:** E03 T02

---

## 1. Goal

Replace the AES-GCM stubs in `WebCryptoProvider.ts` (created in E03 T02) with real `encryptDatabase` and `decryptDatabase` implementations using the Web Crypto API (`crypto.subtle`). Uses the shared `EncryptedData` type and `AuthenticationError` class defined by E03 T03.

After this task, `WebCryptoProvider` implements the complete `CryptoProvider` interface — all four methods functional on Capacitor.

---

## 2. Scope

- Replace `encryptDatabase` stub with real AES-256-GCM encryption using `crypto.subtle.encrypt()`
- Replace `decryptDatabase` stub with real AES-256-GCM decryption using `crypto.subtle.decrypt()`
- Implement `toArrayBuffer()` helper locally (required by Rule 5.2 for SubtleCrypto type compatibility)
- Handle SubtleCrypto's tag-appended format: extract tag on encrypt, recombine on decrypt
- Import raw AES key as `CryptoKey` via `crypto.subtle.importKey()` on each call
- Add AES-GCM test cases to existing `WebCryptoProvider.test.ts`

---

## 3. Out of Scope

- `deriveKey` / `generateSalt` — already implemented in E03 T02; no changes
- `EncryptedData` type definition — created by E03 T03
- `AuthenticationError` class — created by E03 T03
- `CryptoProvider` interface updates — done by E03 T03
- `toArrayBuffer()` shared helper — defined locally in this file; NOT exported to shared package
- Electron `NodeCryptoProvider` AES-GCM — E03 T03
- Encrypted file format — E03 T-03.5
- Cross-platform integration tests (CF-10, CF-11) — E03 T-03.6
- Cryptographic key caching — V1 imports a new `CryptoKey` per call

---

## 4. Files To Create

**None.** All types and errors needed by this task were created by E03 T03 in `packages/shared/`.

---

## 5. Files To Modify

| # | File | Change |
|---|------|--------|
| 1 | `packages/platform/src/capacitor/WebCryptoProvider.ts` | Replace `encryptDatabase` and `decryptDatabase` stub implementations with real SubtleCrypto logic; add local `toArrayBuffer()` helper |
| 2 | `packages/platform/src/capacitor/__tests__/WebCryptoProvider.test.ts` | Add AES-GCM test cases; remove ED-STUB-01 and DD-STUB-01 stub tests |

---

## 6. Interfaces

### 6.1 `CryptoProvider` (prerequisite — updated by E03 T03)

**Location:** `packages/shared/src/domain/interfaces/CryptoProvider.ts`

This task implements the interface as updated by E03 T03. No changes to the interface itself.

| Method | Signature | Description |
|--------|-----------|-------------|
| `encryptDatabase` | `(db: Uint8Array, key: Uint8Array): Promise<EncryptedData>` | Encrypt plaintext database bytes with AES-256-GCM. Generates random 12-byte nonce internally. Returns ciphertext, nonce, and auth tag as structured `EncryptedData`. |
| `decryptDatabase` | `(data: EncryptedData, key: Uint8Array): Promise<Uint8Array>` | Decrypt using provided ciphertext, nonce, and tag. Throws `AuthenticationError` if key is wrong or data is tampered. |

### 6.2 `EncryptedData` (prerequisite — defined by E03 T03)

**Location:** `packages/shared/src/domain/types/EncryptedData.ts`

| Field | Type | Length | Description |
|-------|------|--------|-------------|
| `ciphertext` | `Uint8Array` | Variable | Encrypted database bytes |
| `nonce` | `Uint8Array` | 12 bytes | Initialization vector |
| `tag` | `Uint8Array` | 16 bytes | GCM authentication tag |

### 6.3 `toArrayBuffer()` helper (local — NOT exported)

Defined as a module-level function in `WebCryptoProvider.ts`. Not exported to shared because Electron tests use Node.js Buffer (which is already `ArrayBuffer` compatible) — the helper is only needed in Capacitor's SubtleCrypto context.

Exact implementation per Rule 5.2 (07_AGENT_RULES.md:324-329):
- Input: `Uint8Array`
- Output: `ArrayBuffer`
- Uses `view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)` with `as ArrayBuffer` cast

**Why not in shared:** The `shared` package must remain platform-agnostic (Rule 13.2). This helper is Capacitor-specific — it exists solely to satisfy TypeScript's `Uint8Array.buffer` vs `ArrayBuffer` type mismatch in SubtleCrypto API calls. Electron's Node.js crypto accepts `Buffer` natively.

---

## 7. Data Flow

```
ENCRYPT:

WebCryptoProvider.encryptDatabase(db, key)
  │
  ├─ Validate: key is exactly 32 bytes
  │
  ├─ Generate nonce:
  │     buffer = new Uint8Array(12)
  │     crypto.getRandomValues(buffer)
  │
  ├─ Import key:
  │     cryptoKey = await crypto.subtle.importKey(
  │       'raw',
  │       toArrayBuffer(key),          ← Rule 5.2
  │       { name: 'AES-GCM' },
  │       false,                        // not extractable
  │       ['encrypt']
  │     )
  │
  ├─ Encrypt:
  │     combined = await crypto.subtle.encrypt(
  │       { name: 'AES-GCM', iv: nonce },
  │       cryptoKey,
  │       toArrayBuffer(db)            ← Rule 5.2
  │     )
  │     // combined = ciphertext || tag (16 bytes appended)
  │
  ├─ Split result:
  │     resultBytes = new Uint8Array(combined)
  │     tag         = resultBytes.slice(-16)      ← Rule 5.4
  │     ciphertext  = resultBytes.slice(0, -16)   ← Rule 5.4
  │
  └─ Return: { ciphertext, nonce, tag }

DECRYPT:

WebCryptoProvider.decryptDatabase(data, key)
  │
  ├─ Validate: data.nonce is exactly 12 bytes
  ├─ Validate: data.tag is exactly 16 bytes
  ├─ Validate: key is exactly 32 bytes
  │
  ├─ Recombine ciphertext + tag:
  │     combined = new Uint8Array(data.ciphertext.length + 16)
  │     combined.set(data.ciphertext, 0)         ← Rule 5.4
  │     combined.set(data.tag, data.ciphertext.length)  ← Rule 5.4
  │
  ├─ Import key:
  │     cryptoKey = await crypto.subtle.importKey(
  │       'raw',
  │       toArrayBuffer(key),          ← Rule 5.2
  │       { name: 'AES-GCM' },
  │       false,
  │       ['decrypt']                  ← NOTE: 'decrypt', not 'encrypt'
  │     )
  │
  ├─ Decrypt:
  │     plaintext = await crypto.subtle.decrypt(
  │       { name: 'AES-GCM', iv: toArrayBuffer(data.nonce) },  ← Rule 5.2
  │       cryptoKey,
  │       toArrayBuffer(combined)      ← Rule 5.2
  │     )
  │
  └─ Return: new Uint8Array(plaintext)

AUTH FAILURE:
  crypto.subtle.decrypt() rejects with DOMException
  ├─ Catch → throw new AuthenticationError('Decryption failed: authentication tag mismatch')
```

### Key Design Details

1. **`crypto.subtle` methods are async:** All return native Promises — no `Promise.resolve()` wrapping needed (unlike T03's Node.js crypto which is synchronous). This matches AD-01 naturally.

2. **`toArrayBuffer()` is used 5 times:** Every `Uint8Array` passed to a `crypto.subtle.*` method must go through this helper. The 5 call sites are: key import (×2 for encrypt/decrypt), plaintext encrypt, nonce decrypt, combined ciphertext decrypt. Missing any one causes a TypeScript compilation error.

3. **Tag splitting (Rule 5.4):** This is the INVERSE of Node.js crypto. SubtleCrypto appends the 16-byte tag to the ciphertext automatically. Must:
   - **Encrypt:** extract last 16 bytes as tag, preceding bytes as ciphertext
   - **Decrypt:** recombine `ciphertext || tag` into single buffer before calling `decrypt()`

4. **`CryptoKey` per call:** Each `encryptDatabase`/`decryptDatabase` call imports a new `CryptoKey` via `importKey()`. No caching. `importKey()` is sub-millisecond — caching adds complexity for negligible gain in V1.

5. **Key usage mismatch:** `importKey()` must specify `['encrypt']` for encryption and `['decrypt']` for decryption. Using the wrong usage throws `InvalidAccessError`. This is a common SubtleCrypto pitfall.

6. **Nonce type:** `crypto.subtle.encrypt()` parameter is named `iv` (initialization vector), not `nonce`. The value is the same — 12 random bytes.

7. **Empty plaintext:** SubtleCrypto correctly handles zero-length input. The returned `ArrayBuffer` contains only the 16-byte tag. `ciphertext` will be empty (`length === 0`). Must handle gracefully — `resultBytes.slice(0, -16)` on a 16-byte buffer returns empty `Uint8Array`.

8. **`crypto.getRandomValues()` is synchronous:** Unlike `crypto.subtle.*`, this is synchronous Web Crypto API call. No `await` needed.

---

## 8. State Changes

**None.** `WebCryptoProvider` is stateless. Each call is independent. `CryptoKey` objects are ephemeral (garbage-collected after each call).

---

## 9. Database Changes

**None.** AES-256-GCM encryption operates on byte arrays, not SQLite.

---

## 10. Error Handling

| Condition | Behavior |
|-----------|----------|
| Key is not exactly 32 bytes | Throw `TypeError` with message describing expected vs actual length |
| Nonce is not exactly 12 bytes (decrypt) | Throw `TypeError` |
| Tag is not exactly 16 bytes (decrypt) | Throw `TypeError` |
| `crypto.subtle.encrypt()` rejects (extremely rare) | Let the Promise rejection propagate |
| `crypto.subtle.decrypt()` rejects with auth failure | Catch → throw `new AuthenticationError('Decryption failed: authentication tag mismatch')` |
| `crypto.subtle.importKey()` rejects (wrong algorithm, wrong usage) | Let propagate — indicates programming error, not user error |
| `crypto.getRandomValues()` throws (entropy exhaustion) | Let propagate — extremely rare, indicates platform failure |

### Distinguishing auth failures from other SubtleCrypto errors

`crypto.subtle.decrypt()` may reject for multiple reasons. The catch block should wrap ALL rejections from `decrypt()` as `AuthenticationError` because in AES-256-GCM, the only expected failure mode at the decrypt step is auth tag verification failure. Other failures (wrong algorithm, corrupted key handle) indicate a programming error and should not occur in production. This matches the T03 pattern.

---

## 11. Logging Requirements

**None.** The AES key, nonce, tag, and ciphertext must NEVER be logged (Rule 12.2).

---

## 12. Security Requirements

| Rule | Requirement | Source |
|------|-------------|--------|
| S-01 | AES key is NEVER logged or persisted. | Rule 12.1, Rule 12.2 |
| S-02 | Nonce is 12 random bytes from `crypto.getRandomValues()` (CSPRNG). | NIST SP 800-38D Section 8 |
| S-03 | Nonce is NEVER reused with the same key. Each `encryptDatabase` call generates a fresh random nonce. | GCM security model |
| S-04 | AES-256 key is exactly 32 bytes — enforced by input validation. | AES-256 specification |
| S-05 | `CryptoKey` is non-extractable: `importKey(..., false, ...)`. Prevents JavaScript code from extracting the raw key bytes from a `CryptoKey` object. | Web Crypto API best practice |
| S-06 | `crypto.subtle.decrypt()` rejection produces `AuthenticationError` — callers can distinguish auth failures. | Constitution Section 12 |
| S-07 | `toArrayBuffer()` used for ALL SubtleCrypto inputs — avoids type coercion bugs that could expose key material. | Rule 5.2 |
| S-08 | Empty plaintext handled securely — GCM still produces valid tag for zero-length data. | AES-GCM specification |

---

## 13. Acceptance Criteria

| ID | Criterion | Verification |
|----|-----------|-------------|
| AC-01 | Round-trip: encrypt → decrypt returns original byte-for-byte | 1KB test data, same key, encrypt → decrypt → identical |
| AC-02 | Empty database round-trip | 0-byte plaintext → encrypt → decrypt → 0-byte result |
| AC-03 | Wrong key → `AuthenticationError` | Encrypt with key A, decrypt with key B → throws `AuthenticationError` |
| AC-04 | Tampered ciphertext → `AuthenticationError` | Modify one byte in ciphertext after encrypt → decrypt throws |
| AC-05 | Modified nonce → `AuthenticationError` | Change one byte in nonce → decrypt throws |
| AC-06 | Modified tag → `AuthenticationError` | Change one byte in tag → decrypt throws |
| AC-07 | Encrypted output contains all three fields | `encryptDatabase` returns object with `ciphertext`, `nonce`, `tag` — all `Uint8Array` |
| AC-08 | Nonce is exactly 12 bytes | `data.nonce.length === 12` |
| AC-09 | Tag is exactly 16 bytes | `data.tag.length === 16` |
| AC-10 | Two encryptions produce different nonces | Two calls → `nonce1 !== nonce2` (byte comparison) |
| AC-11 | Key validation: rejects key of wrong length | Key of 16 or 64 bytes → throws `TypeError` |
| AC-12 | `AuthenticationError` is thrown (not generic Error) on auth failure | `err instanceof AuthenticationError` is true |
| AC-13 | `toArrayBuffer()` is present in the file and used for all `crypto.subtle.*` calls | Code inspection |
| AC-14 | `tsc --noEmit` passes with zero errors in `packages/platform` | Run `pnpm typecheck` |
| AC-15 | `pnpm lint` passes with zero warnings | Run from root |

---

## 14. Test Cases

**Test file:** `packages/platform/src/capacitor/__tests__/WebCryptoProvider.test.ts`

This file already exists from E03 T02. AES-GCM test cases are added. The ED-STUB-01 and DD-STUB-01 tests are removed (stubs no longer exist).

### Test Environment

Jest `testEnvironment: 'node'` per platform package config. Node.js 20+ provides `crypto.subtle` natively (since Node 19, stable in Node 20). No mocking needed — the real Web Crypto API is available in the test environment. This is the same API that runs in Capacitor WebView.

**Important:** The `crypto` global in Node.js exposes both `crypto.randomBytes()` (Node-specific) and `crypto.subtle` (Web standard). The `WebCryptoProvider` must use `crypto.subtle` (Web API) and `crypto.getRandomValues()` (Web API) — NOT `crypto.randomBytes()` (Node API). The tests verify this by running against the real implementation.

### New Test Cases (added to existing file)

#### `encryptDatabase`

| ID | Test | Input | Expected |
|----|------|-------|----------|
| EN-01 | Returns `EncryptedData` with all three fields | 1KB data, valid 32-byte key | Result has `ciphertext`, `nonce`, `tag` — all `Uint8Array` |
| EN-02 | Nonce is 12 bytes | any valid input | `result.nonce.length === 12` |
| EN-03 | Tag is 16 bytes | any valid input | `result.tag.length === 16` |
| EN-04 | Two calls produce different nonces | same data + key, two calls | `nonce1 !== nonce2` (byte comparison) |
| EN-05 | Two calls produce different ciphertexts (due to different nonces) | same data + key, two calls | `ciphertext1 !== ciphertext2` |
| EN-06 | Empty plaintext succeeds | empty `Uint8Array`, valid key | Returns valid `EncryptedData`; ciphertext empty but nonce and tag present |
| EN-07 | Key not 32 bytes → rejects | 16-byte key | Throws `TypeError` |
| EN-08 | Key not 32 bytes → rejects (too long) | 64-byte key | Throws `TypeError` |

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
| DE-10 | AuthenticationError has correct name | Trigger auth failure | `err.name === 'AuthenticationError'` |

#### Existing Tests Preserved (from T02)

All `deriveKey` and `generateSalt` tests (DK-01 through DK-09, GS-01 through GS-04) remain unchanged and must continue to pass.

Removed: ED-STUB-01, DD-STUB-01 (stubs no longer exist).

---

## 15. Definition of Done

- [ ] `encryptDatabase` stub replaced with real SubtleCrypto implementation
- [ ] `decryptDatabase` stub replaced with real SubtleCrypto implementation
- [ ] `deriveKey` and `generateSalt` unchanged from E03 T02 — all existing tests still pass
- [ ] `toArrayBuffer()` helper defined as module-level function in `WebCryptoProvider.ts`
- [ ] All `crypto.subtle.*` method calls use `toArrayBuffer()` for `Uint8Array` inputs (5 call sites verified)
- [ ] Tag splitting implemented per Rule 5.4: extract last 16 bytes on encrypt, recombine on decrypt
- [ ] `crypto.subtle.importKey()` passes `false` (non-extractable) and correct `['encrypt']`/`['decrypt']` usage
- [ ] `encryptDatabase` validates key length (32 bytes exactly)
- [ ] `decryptDatabase` validates key (32 bytes), nonce (12 bytes), and tag (16 bytes)
- [ ] Auth tag mismatch throws `AuthenticationError` (not generic Error)
- [ ] Nonce generated via `crypto.getRandomValues()` — NOT `crypto.randomBytes()` (Node API)
- [ ] All 18 new AES-GCM test cases pass (EN-01 through DE-10)
- [ ] All existing T02 tests (deriveKey, generateSalt) still pass
- [ ] `tsc --noEmit` passes with zero errors in `packages/platform`
- [ ] `pnpm lint` passes with zero warnings
- [ ] `pnpm --filter @collectio/platform test` passes with zero failures
- [ ] No secrets or key material in test fixtures or log output
- [ ] Git diff shows only the 2 modified files listed in Section 5
