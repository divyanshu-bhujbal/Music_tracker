# E03 T05 — Implement Encrypted File Format (Shared)

> **Epic:** E-03 Security Primitives
> **Depends on:** E03 T01–T04 (all `CryptoProvider` implementations)
> **Blocks:** E03 T-03.6 (CryptoProvider integration tests), E-09 (Cloud Storage), E-10 (Sync Engine)
> **Predecessor specs:** E03-T03_IMPLEMENT_AES_GCM_ELECTRON.md (defines `EncryptedData`, `AuthenticationError`, updated `CryptoProvider`)

---

## 1. Goal

Implement `EncryptedFileFormat` — a class in the shared data layer that assembles and disassembles the constitution's binary file layout. This is the format used for the encrypted database file stored on Google Drive. It bridges the `CryptoProvider` interface (which encrypts/decrypts) and the cloud storage layer (which uploads/downloads opaque bytes).

Introduce `FormatError` (bad magic bytes) and `VersionError` (unsupported format version).

---

## 2. Scope

- `EncryptedFileFormat` class with `pack()` and `unpack()` methods
- Constructor receives `CryptoProvider` via dependency injection
- Binary file layout per constitution:
  - Bytes 0–3: Magic `0x434D4442` ("CMDB")
  - Byte 4: Format version `0x01`
  - Bytes 5–36: Argon2id salt (32 bytes)
  - Bytes 37–48: AES-GCM nonce (12 bytes)
  - Bytes 49–64: AES-GCM authentication tag (16 bytes)
  - Bytes 65+: AES-256-GCM ciphertext (variable)
- `FormatError` and `VersionError` error classes
- Barrel export for domain errors
- Unit tests for pack/unpack and all error conditions

---

## 3. Out of Scope

- `CryptoProvider` interface or implementations — E03 T01–T04
- `EncryptedData` type — E03 T03
- `AuthenticationError` — E03 T03
- Key derivation — handled by caller before calling `pack`/`unpack`
- Google Drive upload/download — E-09
- Sync engine integration — E-10
- Streaming/chunked file processing — V1 uses in-memory only
- Encrypted file format version negotiation or migration — V1 only supports 0x01

---

## 4. Files To Create

| # | File | Purpose |
|---|------|---------|
| 1 | `packages/shared/src/data/database/EncryptedFileFormat.ts` | Main implementation — `pack()` and `unpack()` |
| 2 | `packages/shared/src/data/database/__tests__/EncryptedFileFormat.test.ts` | Unit tests |
| 3 | `packages/shared/src/domain/errors/FormatError.ts` | Wrong magic bytes error |
| 4 | `packages/shared/src/domain/errors/VersionError.ts` | Unsupported format version error |
| 5 | `packages/shared/src/domain/errors/index.ts` | Barrel export for all domain errors |

---

## 5. Files To Modify

| # | File | Change |
|---|------|--------|
| 1 | `packages/shared/src/index.ts` | Add exports for `EncryptedFileFormat`, `FormatError`, `VersionError` |

---

## 6. Interfaces

### 6.1 `EncryptedFileFormat` class (new)

**Location:** `packages/shared/src/data/database/EncryptedFileFormat.ts`

**Constructor:** `(cryptoProvider: CryptoProvider)` — receives a `CryptoProvider` implementation via dependency injection. Stored as a private field. The class never knows which platform (Electron vs Capacitor) the provider belongs to.

**Public API:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `pack` | `(database: Uint8Array, key: Uint8Array, salt: Uint8Array): Promise<Uint8Array>` | Encrypt the database using the provided key, embed salt + nonce + tag in the header, return the complete file as a `Uint8Array` ready for cloud upload. |
| `unpack` | `(encrypted: Uint8Array, key: Uint8Array): Promise<{ database: Uint8Array; salt: Uint8Array }>` | Parse the header, validate magic/version, extract salt/nonce/tag, decrypt the ciphertext, return the plaintext database and salt. |

**Internal constants (module-level):**

| Constant | Value | Description |
|----------|-------|-------------|
| `MAGIC_BYTES` | `[0x43, 0x4D, 0x44, 0x42]` | "CMDB" — Collectio Managed Database |
| `FORMAT_VERSION` | `0x01` | Current file format version |
| `HEADER_SIZE` | `65` | Total header size in bytes (4 + 1 + 32 + 12 + 16) |
| `MAGIC_OFFSET` | `0` | Offset of magic bytes |
| `MAGIC_LENGTH` | `4` | Length of magic bytes |
| `VERSION_OFFSET` | `4` | Offset of version byte |
| `SALT_OFFSET` | `5` | Offset of salt |
| `SALT_LENGTH` | `32` | Length of salt |
| `NONCE_OFFSET` | `37` | Offset of nonce |
| `NONCE_LENGTH` | `12` | Length of nonce |
| `TAG_OFFSET` | `49` | Offset of auth tag |
| `TAG_LENGTH` | `16` | Length of auth tag |
| `CIPHERTEXT_OFFSET` | `65` | Offset of ciphertext |

### 6.2 `FormatError` (new)

**Location:** `packages/shared/src/domain/errors/FormatError.ts`

Extends native `Error`. Thrown by `unpack()` when the first 4 bytes of the file do not match `MAGIC_BYTES`. This indicates the file is not a Collectio encrypted database — it could be random bytes, a different file format, or a corrupted download.

| Property | Type | Description |
|----------|------|-------------|
| `name` | `'FormatError'` | Error name for `instanceof` checks |
| `message` | `string` | Includes the expected magic and what was received |

### 6.3 `VersionError` (new)

**Location:** `packages/shared/src/domain/errors/VersionError.ts`

Extends native `Error`. Thrown by `unpack()` when byte 4 contains an unsupported format version (anything other than `0x01` in V1). This provides forward compatibility — future versions can use different encryption schemes or layouts without breaking V1.

| Property | Type | Description |
|----------|------|-------------|
| `name` | `'VersionError'` | Error name for `instanceof` checks |
| `message` | `string` | Includes the expected version and the version found in the file |

### 6.4 Domain Errors Barrel (new)

**Location:** `packages/shared/src/domain/errors/index.ts`

Re-exports `AuthenticationError` (from T03), `FormatError`, and `VersionError`.

---

## 7. Data Flow

```
PACK:

EncryptedFileFormat.pack(database, key, salt)
  │
  ├─ Validate: salt.length === 32
  │
  ├─ Encrypt: result = await this.cryptoProvider.encryptDatabase(database, key)
  │             result: { ciphertext: Uint8Array, nonce: Uint8Array, tag: Uint8Array }
  │
  ├─ Validate: result.nonce.length === 12
  ├─ Validate: result.tag.length === 16
  │
  ├─ Build header (65 bytes):
  │     [0..3]   = MAGIC_BYTES           (4 bytes)
  │     [4]      = FORMAT_VERSION         (1 byte)
  │     [5..36]  = salt                   (32 bytes)
  │     [37..48] = result.nonce           (12 bytes)
  │     [49..64] = result.tag             (16 bytes)
  │
  ├─ Allocate: new Uint8Array(65 + result.ciphertext.length)
  │
  ├─ Copy: header into [0..64]
  ├─ Copy: result.ciphertext into [65..]
  │
  └─ Return: complete file as Uint8Array

UNPACK:

EncryptedFileFormat.unpack(encrypted, key)
  │
  ├─ Validate: encrypted.length >= 65
  │
  ├─ Read magic: encrypted[0..3]
  │     └─ Mismatch → throw new FormatError(...)
  │
  ├─ Read version: encrypted[4]
  │     └─ !== 0x01 → throw new VersionError(...)
  │
  ├─ Extract header fields:
  │     salt       = encrypted.slice(5, 37)      // 32 bytes
  │     nonce      = encrypted.slice(37, 49)     // 12 bytes
  │     tag        = encrypted.slice(49, 65)     // 16 bytes
  │     ciphertext = encrypted.slice(65)          // variable
  │
  ├─ Decrypt: database = await this.cryptoProvider.decryptDatabase(
  │               { ciphertext, nonce, tag },
  │               key
  │             )
  │     └─ Auth failure → AuthenticationError propagated (not caught)
  │
  └─ Return: { database, salt }
```

### Key Design Details

1. **Platform-agnostic:** Uses only `Uint8Array` — never `Buffer`. Byte manipulation via `Uint8Array.set()`, `Uint8Array.slice()`, and array indexing (e.g., `encrypted[4]` for the version byte). Magic bytes are stored as a `Uint8Array` constant.

2. **No key derivation in this layer:** `pack` receives the already-derived key (32 raw bytes). `unpack` receives the key and returns the salt — the caller (auth/setup flow) is responsible for key derivation before calling either method.

3. **Error propagation:** `AuthenticationError` from `decryptDatabase` passes through `unpack` without wrapping. The caller can distinguish `FormatError` (bad file), `VersionError` (unsupported version), and `AuthenticationError` (wrong key / tampered data) via `instanceof`.

4. **Single allocation in `pack`:** The header and ciphertext are copied into a single `Uint8Array` in one allocation. No intermediate concatenation or copying — `new Uint8Array(65 + ciphertext.length)` then two `set()` calls. This is a deliberate performance choice.

5. **`unpack` returns salt:** The caller stores the salt locally (in `app_metadata.kdf_salt`) to enable the credential restore flow (FR-AUTH-08): re-derive the key from password + salt without re-downloading the cloud file.

6. **Cross-platform consistency:** The fixed byte layout ensures that an Electron-produced encrypted file is identical in structure to a Capacitor-produced one. The cross-platform AC tests (CF-10, CF-11 in T-03.6) verify this.

---

## 8. State Changes

**None.** `EncryptedFileFormat` is stateless beyond the injected `CryptoProvider` reference. Each `pack`/`unpack` call is independent.

---

## 9. Database Changes

**None.** The encrypted file format operates on byte arrays. The `kdf_salt` key in `app_metadata` is set by the auth/setup flow (E-04), not by this module.

---

## 10. Error Handling

| Condition | Behavior |
|-----------|----------|
| `pack`: salt is not exactly 32 bytes | Throw `TypeError('Salt must be exactly 32 bytes')` |
| `pack`: `encryptDatabase` rejects (crypto failure) | Let the Promise rejection propagate — do not catch |
| `pack`: `encryptDatabase` returns nonce not 12 bytes | Throw `Error` — indicates CryptoProvider implementation bug |
| `pack`: `encryptDatabase` returns tag not 16 bytes | Throw `Error` — indicates CryptoProvider implementation bug |
| `unpack`: file is shorter than 65 bytes | Throw `FormatError('File too short: expected at least 65 bytes, got N')` |
| `unpack`: magic bytes mismatch | Throw `FormatError` with expected vs actual bytes |
| `unpack`: version byte is not 0x01 | Throw `VersionError` with expected vs actual version |
| `unpack`: `decryptDatabase` rejects with `AuthenticationError` | Let it propagate — do not catch or wrap |
| `unpack`: `decryptDatabase` rejects with other error | Let it propagate |

### Error class hierarchy

All three file format errors extend `Error` directly — they do not extend `DatabaseError` (which is for SQLite errors, not file format errors). They live in `domain/errors/` alongside `AuthenticationError`.

### Distinguishing error types

Callers use `instanceof` to distinguish the three error types:
- `FormatError` → retry download (possible corruption)
- `VersionError` → app update required (newer format)
- `AuthenticationError` → wrong password (prompt user to re-enter)

---

## 11. Logging Requirements

**None.** No logging performed. The derived key, salt, nonce, tag, and ciphertext must NEVER be logged (Rule 12.2).

---

## 12. Security Requirements

| Rule | Requirement | Source |
|------|-------------|--------|
| S-01 | Salt is stored in the file header (bytes 5–36), not secret. | Constitution 14.1 — `kdf_salt` is hex-encoded in local storage |
| S-02 | AES key is NEVER written to the file. Only the salt (KDF input) is stored, not the derived key. | FR-AUTH-06 |
| S-03 | Magic bytes provide a basic integrity check — random data unlikely to match "CMDB". | Constitution Section 16 |
| S-04 | Format version byte enables future cryptographic agility without breaking V1. | Constitution Section 16.4 |
| S-05 | File format is deterministic — same inputs produce byte-identical output across platforms. | Constitution Section 16; T-03.6 CF-10/CF-11 |
| S-06 | Byte manipulation uses `Uint8Array` (no `Buffer`) — no Node.js dependency in shared code. | Rule 13.2 |

---

## 13. Acceptance Criteria

| ID | Criterion | Verification |
|----|-----------|-------------|
| AC-01 | Round-trip: `unpack(pack(db, key, salt), key)` returns original `db` byte-for-byte | 1KB test data |
| AC-02 | Round-trip returns correct salt | `unpack(...).salt` equals the original salt passed to `pack()` |
| AC-03 | Empty database round-trip | 0-byte database → pack → 65-byte file (header only) → unpack → 0 bytes |
| AC-04 | Large database round-trip | 5MB database → pack → unpack → byte-identical |
| AC-05 | Packed file has correct size: `HEADER_SIZE + database.length` | Verify file length for known database sizes |
| AC-06 | Magic bytes at correct position (offset 0–3) | File[0..3] = [0x43, 0x4D, 0x44, 0x42] |
| AC-07 | Version byte at correct position (offset 4) | File[4] = 0x01 |
| AC-08 | Salt at correct position (offset 5–36) | File.slice(5, 37) equals original salt |
| AC-09 | Nonce at correct position (offset 37–48) | File.slice(37, 49) equals encrypt result nonce |
| AC-10 | Tag at correct position (offset 49–64) | File.slice(49, 65) equals encrypt result tag |
| AC-11 | Ciphertext at correct position (offset 65+) | File.slice(65) equals encrypt result ciphertext |
| AC-12 | Wrong magic bytes → `FormatError` | Modify bytes 0–3 → unpack throws `FormatError` |
| AC-13 | Unsupported version → `VersionError` | Set byte 4 to 0x02 → unpack throws `VersionError` |
| AC-14 | File too short → error | 64-byte file → unpack throws `FormatError` |
| AC-15 | Wrong key → `AuthenticationError` | Pack with key A, unpack with key B → throws |
| AC-16 | Tampered ciphertext → `AuthenticationError` | Modify byte 80 (ciphertext region) → unpack throws |
| AC-17 | Two packs with same inputs produce identical output | `pack(db, key, salt)` called twice → byte-identical files |
| AC-18 | `tsc --noEmit` passes with zero errors in `packages/shared` | Run `pnpm typecheck` |
| AC-19 | `pnpm lint` passes with zero warnings | Run from root |

---

## 14. Test Cases

**Test file:** `packages/shared/src/data/database/__tests__/EncryptedFileFormat.test.ts`

### Test Environment

Jest running in Node.js. Requires a `CryptoProvider` mock — the test verifies file format layout, not actual encryption. The mock returns controlled `{ ciphertext, nonce, tag }` values so byte offsets can be verified precisely.

### Mock Strategy

Create a mock `CryptoProvider` that returns known, fixed values:
- `encryptDatabase`: returns `{ ciphertext: <fixed bytes>, nonce: <12 fixed bytes>, tag: <16 fixed bytes> }`
- `decryptDatabase`: returns the original plaintext (or throws `AuthenticationError` on specific test inputs)
- `deriveKey` / `generateSalt`: not called by `EncryptedFileFormat` — can throw if accidentally called

### Test Structure

```
describe('EncryptedFileFormat')
  ├── constructor
  │     no tests needed (trivial DI assignment)
  │
  ├── pack()
  │   ├── EN-01: Constructs file with correct structure
  │   ├── EN-02: Header contains correct magic bytes
  │   ├── EN-03: Header contains correct version byte
  │   ├── EN-04: Header contains correct salt at offset 5
  │   ├── EN-05: Header contains nonce at correct position
  │   ├── EN-06: Header contains tag at correct position
  │   ├── EN-07: Ciphertext at correct position (offset 65)
  │   ├── EN-08: File size = 65 + database.length
  │   ├── EN-09: Empty database produces 65-byte file
  │   ├── EN-10: Deterministic output (same inputs → same file)
  │   ├── EN-11: Salt not 32 bytes → TypeError
  │   ├── EN-12: encryptDatabase rejects → propagates error
  │
  ├── unpack()
  │   ├── DE-01: Round-trip returns original database
  │   ├── DE-02: Round-trip returns correct salt
  │   ├── DE-03: Empty database round-trip
  │   ├── DE-04: Wrong magic bytes → FormatError
  │   ├── DE-05: Unsupported version (0x02) → VersionError
  │   ├── DE-06: Unsupported version (0x00) → VersionError
  │   ├── DE-07: File too short (64 bytes) → FormatError
  │   ├── DE-08: File too short (0 bytes) → FormatError
  │   ├── DE-09: Wrong key → AuthenticationError propagated
  │   ├── DE-10: Tampered ciphertext → AuthenticationError propagated
  │   ├── DE-11: decryptDatabase rejects (non-auth) → propagated
  │
  └── Integration (with mock)
      ├── IT-01: 1KB round-trip preserves all bytes
      └── IT-02: 5MB round-trip preserves all bytes
```

### Test Cases Detail

#### `pack`

| ID | Test | Input | Expected |
|----|------|-------|----------|
| PK-01 | Correct magic bytes | 100-byte db, fixed key, fixed salt | output[0]=0x43, output[1]=0x4D, output[2]=0x44, output[3]=0x42 |
| PK-02 | Correct version byte | any valid inputs | output[4] === 0x01 |
| PK-03 | Salt at correct position | salt = known pattern (e.g., sequential 0..31) | output.slice(5, 37) equals salt |
| PK-04 | Nonce at correct position | mock returns known nonce | output.slice(37, 49) equals mock nonce |
| PK-05 | Tag at correct position | mock returns known tag | output.slice(49, 65) equals mock tag |
| PK-06 | Ciphertext at correct position | mock returns known ciphertext | output.slice(65) equals mock ciphertext |
| PK-07 | File size calculation | db of length N | output.length === 65 + N |
| PK-08 | Empty database | empty Uint8Array | output.length === 65 |
| PK-09 | Deterministic output | same inputs twice | output1 byte-identical to output2 |
| PK-10 | Salt length validation | 31-byte salt | Throws TypeError |
| PK-11 | Salt length validation | 33-byte salt | Throws TypeError |
| PK-12 | CryptoProvider error propagation | mock `encryptDatabase` rejects | Rejection propagates |

#### `unpack`

| ID | Test | Input | Expected |
|----|------|-------|----------|
| UP-01 | Round-trip: database matches | pack result, correct key | `result.database` byte-identical to original |
| UP-02 | Round-trip: salt matches | pack result, correct key | `result.salt` byte-identical to original salt |
| UP-03 | Empty database round-trip | packed empty db, correct key | `result.database` is 0 bytes |
| UP-04 | FormatError on wrong magic | modify bytes 0-3 of valid file | Throws `FormatError` |
| UP-05 | FormatError on all zeros | 65+ zero bytes | Throws `FormatError` |
| UP-06 | VersionError on 0x02 | set byte 4 to 0x02 in valid file | Throws `VersionError` |
| UP-07 | VersionError on 0x00 | set byte 4 to 0x00 in valid file | Throws `VersionError` |
| UP-08 | FormatError on 64-byte file | truncated file | Throws `FormatError` |
| UP-09 | FormatError on 0-byte file | empty file | Throws `FormatError` |
| UP-10 | AuthenticationError on wrong key | pack with key A, unpack with key B | Throws `AuthenticationError` |
| UP-11 | AuthenticationError on tampered ciphertext | modify byte at offset 100 | Throws `AuthenticationError` |
| UP-12 | CryptoProvider non-auth error propagates | mock `decryptDatabase` throws `Error` | Same `Error` propagates |

---

## 15. Definition of Done

- [ ] `EncryptedFileFormat` class created at `packages/shared/src/data/database/EncryptedFileFormat.ts`
- [ ] Constructor accepts `CryptoProvider` via dependency injection
- [ ] `pack()` calls `cryptoProvider.encryptDatabase()`, builds header, returns complete file
- [ ] `unpack()` validates magic/version, extracts header fields, calls `cryptoProvider.decryptDatabase()`, returns `{ database, salt }`
- [ ] All byte offsets defined as named module-level constants (not magic numbers)
- [ ] `FormatError` created at `packages/shared/src/domain/errors/FormatError.ts`
- [ ] `VersionError` created at `packages/shared/src/domain/errors/VersionError.ts`
- [ ] `packages/shared/src/domain/errors/index.ts` barrel exports `AuthenticationError`, `FormatError`, `VersionError`
- [ ] `EncryptedFileFormat`, `FormatError`, `VersionError` exported from `packages/shared/src/index.ts`
- [ ] No `Buffer` usage — `Uint8Array` only (shared code must be platform-agnostic)
- [ ] No crypto logic in file format — delegates entirely to injected `CryptoProvider`
- [ ] Test file created at `packages/shared/src/data/database/__tests__/EncryptedFileFormat.test.ts`
- [ ] All 24 test cases pass (PK-01 through UP-12)
- [ ] Mock `CryptoProvider` returns controlled values for precise byte offset verification
- [ ] AC-04 (5MB round-trip) passes
- [ ] `tsc --noEmit` passes with zero errors in `packages/shared`
- [ ] `pnpm lint` passes with zero warnings
- [ ] `pnpm --filter @collectio/shared test` passes with zero failures
- [ ] No secrets or key material in test fixtures
- [ ] Git diff shows only the files listed in Sections 4–5
