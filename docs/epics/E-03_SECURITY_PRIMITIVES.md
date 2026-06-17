# E-03: Security Primitives

**Phase:** 1 | **Type:** Foundation | **Depends On:** E-01 | **Blocks:** E-04, E-09, E-10

---

## Overview

**Purpose:** Implement the Argon2id key derivation and AES-256-GCM encryption/decryption pipeline on both platforms via the `CryptoProvider` interface. The encrypted file format is identical on both platforms — cross-platform determinism is critical for sync.

**Key architectural change from original:** Electron uses native Node.js addons (`argon2` npm, `crypto` built-in). Capacitor uses WASM (`argon2-wasm`) and the Web Crypto API (`SubtleCrypto`). Both must produce byte-identical outputs given the same inputs.

### Component Mapping Table

| Original (Option A) | Revised (Option D) | Change |
|---------------------|-------------------|--------|
| `react-native-argon2` (Android native) | `argon2` npm package (Electron native addon) | Different packages; same algorithm |
| Argon2id WASM on Windows (fallback) | `argon2-wasm` in Capacitor WebView (Android) | WASM moves from Windows fallback to Android primary |
| `react-native-quick-crypto` | Node.js `crypto` (Electron) + `SubtleCrypto` (Capacitor) | Two different API surfaces; same underlying AES-GCM algorithm |
| `CryptoProvider` interface | `CryptoProvider` interface | Interface unchanged |
| Encrypted file format (0x434D4442) | Encrypted file format (0x434D4442) | Format unchanged |

---

## Tasks

### T-03.1 — Implement Argon2id via argon2 npm (Electron)

| Property | Detail |
|----------|--------|
| **Depends on** | T-01.5 |
| **Blocks** | T-03.5, T-03.6 |

**Files produced:**
- `packages/platform/src/electron/NodeCryptoProvider.ts`

**Requirements:**
- Install `argon2` npm package in `packages/platform`
- Implement `deriveKey(password, salt)` using `argon2.hash()` with `type: argon2id`, `memoryCost: 65536` (64MB), `timeCost: 3`, `parallelism: 4`, `hashLength: 32`, `raw: true`
- Returns `Uint8Array` of 32 bytes (raw output, not hex/encoded)
- `generateSalt()` uses `crypto.randomBytes(32)` → returns `Uint8Array`

**Acceptance criteria:**
1. Same (password, salt) → identical 32-byte key on repeat calls
2. Different password → different key
3. Different salt → different key
4. Completes in <500ms on mid-range Windows hardware
5. Output verified against known Argon2id test vectors (RFC 9106)

---

### T-03.2 — Implement Argon2id via argon2-wasm (Capacitor)

| Property | Detail |
|----------|--------|
| **Depends on** | T-01.6 |
| **Blocks** | T-03.5, T-03.6 |

**Files produced:**
- `packages/platform/src/capacitor/WebCryptoProvider.ts` (Argon2id portion)

**Requirements:**
- Install `argon2-wasm` in `packages/platform`
- Same parameters as T-03.1 (64MB, 3 iterations, 4 parallelism, 32 bytes raw output)
- WASM binary must be loadable in Capacitor WebView (validate in E-00b)
- `generateSalt()` uses `crypto.getRandomValues(new Uint8Array(32))`

**Acceptance criteria:**
1. Same (password, salt) → identical 32-byte key (determinism)
2. Cross-platform determinism: same (password, salt) produces same key as T-03.1 — **CRITICAL**
3. Completes in <3 seconds on mid-range Android device
4. WASM binary size documented; load time measured separately

---

### T-03.3 — Implement AES-256-GCM via Node.js crypto (Electron)

| Property | Detail |
|----------|--------|
| **Depends on** | T-01.5 |
| **Blocks** | T-03.5, T-03.6 |

**Files produced:**
- `packages/platform/src/electron/NodeCryptoProvider.ts` (AES portion — same file as T-03.1)

**Requirements:**
- `encrypt(plaintext, key)`: generate 12 random bytes for nonce via `crypto.randomBytes(12)` → create cipher `crypto.createCipheriv('aes-256-gcm', key, nonce)` → return `{ ciphertext: Buffer.concat([cipher.update(plaintext), cipher.final()]), nonce, tag: cipher.getAuthTag() }`
- `decrypt(ciphertext, key, nonce, tag)`: create decipher → `decipher.setAuthTag(tag)` → return `Buffer.concat([decipher.update(ciphertext), decipher.final()])`
- Wrong key or tampered data → `decipher.final()` throws → catch and re-throw as `AuthenticationError`

**Acceptance criteria:**
1. Round-trip: encrypt → decrypt returns original byte-for-byte
2. Wrong key → `AuthenticationError`
3. Tampered ciphertext → `AuthenticationError`
4. Modified nonce → `AuthenticationError`
5. Performance: 5MB encrypt/decrypt <500ms

---

### T-03.4 — Implement AES-256-GCM via SubtleCrypto (Capacitor)

| Property | Detail |
|----------|--------|
| **Depends on** | T-01.6 |
| **Blocks** | T-03.5, T-03.6 |

**Files produced:**
- `packages/platform/src/capacitor/WebCryptoProvider.ts` (AES portion — same file as T-03.2)

**Requirements:**
- Import raw key as `CryptoKey` via `crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])`
- `encrypt(plaintext, key)`: generate 12 random bytes for nonce → `crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plaintext)` → SubtleCrypto appends the 16-byte tag to the ciphertext → extract tag from last 16 bytes
- `decrypt(ciphertext, key, nonce, tag)`: re-attach tag to ciphertext → `crypto.subtle.decrypt(...)` → returns plaintext
- Wrong key or tampered data → `crypto.subtle.decrypt()` rejects → catch as `AuthenticationError`

**Acceptance criteria:**
1. Round-trip: encrypt → decrypt returns original byte-for-byte
2. Wrong key → `AuthenticationError`
3. Tampered ciphertext → `AuthenticationError`
4. Cross-platform determinism: same (plaintext, key) encrypted with same nonce produces identical ciphertext on Electron and Capacitor — **CRITICAL for sync**
5. Performance: 5MB encrypt/decrypt <500ms on device

---

### T-03.5 — Implement Encrypted File Format (Shared)

| Property | Detail |
|----------|--------|
| **Depends on** | T-03.1, T-03.2, T-03.3, T-03.4 |
| **Blocks** | T-03.6, E-09, E-10 |

**Files produced:**
- `packages/shared/src/data/database/EncryptedFileFormat.ts`

**Requirements:**
- Implements the constitution's encrypted file format:
  - Byte 0-3: Magic 0x434D4442 ("CMDB")
  - Byte 4: Format version 0x01
  - Bytes 5-36: Argon2id salt (32 bytes)
  - Bytes 37-48: AES-GCM nonce (12 bytes)
  - Bytes 49-64: AES-GCM authentication tag (16 bytes)
  - Bytes 65+: AES-256-GCM ciphertext
- `pack(database: Uint8Array, key: Uint8Array, salt: Uint8Array): Promise<Uint8Array>`
  - Delegates to injected `CryptoProvider.encrypt()`
  - Constructs header + ciphertext
- `unpack(encrypted: Uint8Array, key: Uint8Array): Promise<{ database: Uint8Array, salt: Uint8Array }>`
  - Validates magic bytes → `FormatError` if wrong
  - Validates version → `VersionError` if unsupported
  - Extracts salt from header
  - Delegates to injected `CryptoProvider.decrypt()`
  - Returns decrypted database + salt

**Acceptance criteria:**
1. Pack known data + known key → unpack with same key → data matches
2. Pack → modify one byte in ciphertext region → unpack → `AuthenticationError`
3. Random bytes → unpack → `FormatError`
4. Version byte 0x02 → unpack → `VersionError`
5. File produced by Electron → decrypted successfully by Capacitor (cross-platform) — **CRITICAL**
6. Acceptance criteria unchanged from original T-03.4 (format is identical)

---

### T-03.6 — CryptoProvider Unit Tests

| Property | Detail |
|----------|--------|
| **Depends on** | T-03.1 through T-03.5 |
| **Blocks** | (quality gate) |

**Files produced:**
- `packages/shared/src/data/database/__tests__/EncryptedFileFormat.test.ts`
- `packages/platform/src/electron/__tests__/NodeCryptoProvider.test.ts`
- `packages/platform/src/capacitor/__tests__/WebCryptoProvider.test.ts`

**Test Cases:**

| ID | Test | Expected Result |
|----|------|-----------------|
| CF-01 | Round-trip: empty database | Decrypted = original |
| CF-02 | Round-trip: 1KB database | Decrypted = original |
| CF-03 | Round-trip: 5MB database | Decrypted = original |
| CF-04 | Wrong password → unpack | `AuthenticationError` |
| CF-05 | Tampered ciphertext → unpack | `AuthenticationError` |
| CF-06 | Wrong magic bytes → unpack | `FormatError` |
| CF-07 | Unsupported version → unpack | `VersionError` |
| CF-08 | Deterministic key derivation: same (password, salt) → same key | Two calls produce identical Uint8Array |
| CF-09 | Different salts → different ciphertext for same plaintext + key | Ciphertexts differ |
| CF-10 | Cross-platform: Electron encrypt → Capacitor decrypt | Decrypted = original byte-for-byte |
| CF-11 | Cross-platform: Capacitor encrypt → Electron decrypt | Decrypted = original byte-for-byte |
| CF-12 | Performance: encrypt + decrypt 5MB, 10 iterations each platform | Mean <500ms per operation |

**Acceptance criteria:**
1. CF-10 and CF-11 are critical — cross-platform compatibility is non-negotiable for sync
2. All tests pass in CI for shared package
3. Platform-specific tests (CF-12) run on real Electron and Capacitor environments
