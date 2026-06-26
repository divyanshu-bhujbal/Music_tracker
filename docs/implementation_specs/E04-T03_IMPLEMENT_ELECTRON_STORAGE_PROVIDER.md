# E-04 T-03 — Implement ElectronStorageProvider

**Parent Epic:** E-04: Platform Services
**Type:** Production Implementation (Platform Services Layer — Electron)
**Criticality:** FOUNDATION — `SecureStorageProvider` is the only contract through which the application persists sensitive credentials (derived AES key, OAuth tokens) to disk. Without it, authentication state cannot survive app restarts. `ElectronStorageProvider` is the Electron (Windows) implementation backed by `electron-store` + `safeStorage` (DPAPI).

---

## 1. Goal

Implement `ElectronStorageProvider` — the `SecureStorageProvider` interface implementation for the Electron (Windows) platform. This provider stores string values in `electron-store` (a persistent JSON key-value store in Electron's `userData` directory) with each value encrypted via `safeStorage.encryptString()` (Windows DPAPI) before being written to disk. On retrieval, values are decrypted via `safeStorage.decryptString()`. This ensures that even with filesystem access, an attacker cannot read stored credentials in plaintext.

Additionally, this task canonicalizes the `SecureStorageProvider` interface — currently defined locally in `ElectronAuthProvider.ts` with a TODO comment — into its proper home at `packages/shared/src/domain/interfaces/SecureStorageProvider.ts`, consistent with all other platform interfaces (`CryptoProvider`, `AuthProvider`).

---

## 2. Scope

| In Scope | Rationale |
|---|---|
| `SecureStorageProvider` interface canonicalization in `packages/shared/src/domain/interfaces/` | Currently a local duplicate in `ElectronAuthProvider.ts` with TODO; must live alongside other platform interfaces per 01_ARCHITECTURE.md §4 |
| `ElectronStorageProvider` class in `packages/platform/src/electron/` | Electron-specific implementation using `electron-store` + `safeStorage` |
| `safeStorage.isEncryptionAvailable()` check at construction | Defensive; refuses to operate if DPAPI is unavailable (NFR-SEC-02) |
| `safeStorage.encryptString()` on `store()` | Encrypts value before disk write |
| `safeStorage.decryptString()` on `retrieve()` | Decrypts value after disk read |
| Base64-encoding of encrypted `Buffer` for JSON serialization | `electron-store` stores JSON; `safeStorage` returns `Buffer` — must base64-encode |
| `store(key, value)` — encrypt then persist | Main write path |
| `retrieve(key)` — read then decrypt, return `string \| null` | Main read path; null for missing keys |
| `delete(key)` — remove key from store | Idempotent — `electron-store.delete()` is natively idempotent |
| `clear()` — remove all entries | Full wipe |
| `ElectronAuthProvider` cleanup — remove local `SecureStorageProvider` interface | Import from canonical location instead |
| Barrel exports from `shared/` and `platform/electron/` | Consistent import paths |
| Unit tests for all 4 methods + encryption verification | Jest with mocks for `electron-store` and `safeStorage` |

---

## 3. Out of Scope

| Out of Scope | Why | Where It Belongs |
|---|---|---|
| `CapacitorStorageProvider` implementation | Separate platform; different backend (Android Keystore via `capacitor-secure-storage-plugin`) | E-04 T-04.4 |
| Auto-migration of existing plaintext `electron-store` data | No data exists yet; all devices are on first install | N/A |
| `safeStorage` unavailable fallback (e.g., plaintext fallback) | Explicitly rejected — refuse to operate if DPAPI unavailable | This task (throws at construction) |
| Master password storage | Never stored per Rule 12.1; only derived AES key and OAuth tokens | CryptoProvider + AuthProvider |
| Key rotation or re-encryption | V1 limitation | Future |
| Any Capacitor/Android API usage | Platform boundary | E-04 T-04.4 |

---

## 4. Files To Create

| # | File | Purpose | Responsibility |
|---|---|---|---|
| 1 | `packages/shared/src/domain/interfaces/SecureStorageProvider.ts` | Canonical `SecureStorageProvider` interface | Defines the 4-method interface mandated by 01_ARCHITECTURE.md §4: `store()`, `retrieve()`, `delete()`, `clear()`. Pure TypeScript — zero platform code. Replaces the local duplicate in `ElectronAuthProvider.ts`. |
| 2 | `packages/platform/src/electron/ElectronStorageProvider.ts` | `SecureStorageProvider` Electron implementation | Implements the interface using `electron-store` for persistence and `safeStorage` for encryption. Constructor accepts optional `name` parameter for store file name (default: `"config"`). Checks `safeStorage.isEncryptionAvailable()` at construction. |
| 3 | `packages/platform/src/electron/__tests__/ElectronStorageProvider.test.ts` | Unit tests for ElectronStorageProvider | Tests all 4 interface methods with mocked `electron-store` and `safeStorage`. Verifies encrypt-on-write and decrypt-on-read. Tests missing key returns null. Tests delete idempotency. Tests clear removes all. |

---

## 5. Files To Modify

| # | File | Change | Reason |
|---|---|---|---|
| 1 | `packages/shared/src/domain/interfaces/index.ts` | Add `export type { SecureStorageProvider } from './SecureStorageProvider.js';` | Barrel re-export — makes interface importable via `@collectio/shared` |
| 2 | `packages/shared/src/index.ts` | Add `export type { SecureStorageProvider } from './domain/interfaces/SecureStorageProvider.js';` | Top-level re-export — consistent with other interfaces |
| 3 | `packages/platform/src/electron/index.ts` | Add `export { ElectronStorageProvider } from './ElectronStorageProvider.js';` and update `SecureStorageProvider` type export to source from `@collectio/shared` | Barrel re-export; type now comes from canonical location |
| 4 | `packages/platform/src/electron/ElectronAuthProvider.ts` | Replace local `SecureStorageProvider` interface (lines 9-16) with `import type { SecureStorageProvider } from '@collectio/shared';` | Resolves TODO comment; de-duplicates interface |
| 5 | `packages/platform/src/electron/__tests__/ElectronAuthProvider.test.ts` | If tests import `SecureStorageProvider` from `ElectronAuthProvider.ts`, update to import from `@collectio/shared` | Match source change; tests must compile |

---

## 6. Interfaces

### 6.1 `SecureStorageProvider` (NEW — `packages/shared/src/domain/interfaces/SecureStorageProvider.ts`)

Mandated by 01_ARCHITECTURE.md §4. The contract between the application (AuthProvider, CryptoProvider consumer code) and any platform secure storage implementation.

```
interface SecureStorageProvider {
  store(key: string, value: string): Promise<void>
  retrieve(key: string): Promise<string | null>
  delete(key: string): Promise<void>
  clear(): Promise<void>
}
```

**Semantics:**
- `store`: Writes a string value under the given key. Overwrites if key exists.
- `retrieve`: Returns the string value for the key, or `null` if not found.
- `delete`: Removes the key. Must be idempotent — deleting a nonexistent key must not throw.
- `clear`: Removes all stored key-value pairs. Must not throw if store is already empty.

### 6.2 `ElectronStorageProvider` Public API

```
class ElectronStorageProvider implements SecureStorageProvider {
  constructor(name?: string)

  // Encrypts value via safeStorage → base64-encodes → writes to electron-store
  async store(key: string, value: string): Promise<void>

  // Reads from electron-store → base64-decodes → decrypts via safeStorage → returns plaintext
  // Returns null if key not found
  async retrieve(key: string): Promise<string | null>

  // Removes key from electron-store. Idempotent.
  async delete(key: string): Promise<void>

  // Clears all entries from electron-store.
  async clear(): Promise<void>
}
```

**Constructor:**
- `name?: string` — store file name. Default: `"config"`. Passed to `electron-store` as the store name.
- On construction, calls `safeStorage.isEncryptionAvailable()`. If `false`, throws `Error('Encryption is not available on this system')`.

---

## 7. Data Flow

### 7.1 `store(key, value)` Flow

```
1.  CALLER invokes storage.store('auth_access_token', 'ya29.abc...')

2.  ENCRYPT value:
    - encryptedBuffer = safeStorage.encryptString(value)
    - Returns Buffer containing DPAPI-encrypted ciphertext

3.  BASE64-ENCODE encrypted buffer:
    - base64String = encryptedBuffer.toString('base64')
    - Required because electron-store serializes to JSON, which cannot store raw Buffer

4.  WRITE to electron-store:
    - this.store.set(key, base64String)
    - electron-store persists to JSON file in userData directory

5.  RETURN (void Promise)
```

### 7.2 `retrieve(key)` Flow

```
1.  CALLER invokes storage.retrieve('auth_access_token')

2.  READ from electron-store:
    - base64String = this.store.get(key)
    - Returns undefined (not null) if key does not exist

3.  IF key not found:
    - IF base64String is undefined → return null

4.  BASE64-DECODE:
    - encryptedBuffer = Buffer.from(base64String, 'base64')

5.  DECRYPT:
    - plaintext = safeStorage.decryptString(encryptedBuffer)

6.  RETURN plaintext string
```

### 7.3 `delete(key)` Flow

```
1.  CALLER invokes storage.delete('auth_access_token')

2.  DELETE from electron-store:
    - this.store.delete(key)
    - electron-store.delete() is natively idempotent — no error if key doesn't exist

3.  RETURN (void Promise)
```

### 7.4 `clear()` Flow

```
1.  CALLER invokes storage.clear()

2.  CLEAR electron-store:
    - this.store.clear()
    - Removes all key-value pairs; file may still exist (empty JSON object)

3.  RETURN (void Promise)
```

---

## 8. State Changes

### 8.1 Electron-Store State (Persistent)

| Operation | Keys Affected | File Change |
|---|---|---|
| `store('key1', 'val1')` | `key1` → base64(encrypt(val1)) | `userData/config.json` updated |
| `store('key2', 'val2')` | `key2` → base64(encrypt(val2)) | `userData/config.json` updated |
| `retrieve('key1')` | None | Read-only |
| `delete('key1')` | `key1` removed | `userData/config.json` updated |
| `clear()` | All keys removed | `userData/config.json` becomes `{}` |

### 8.2 In-Memory State

`ElectronStorageProvider` holds a reference to the `electron-store` `Store` instance. All state lives on disk — nothing is cached in memory between calls. Each method reads/writes directly from/to the store.

---

## 9. Database Changes

**None.** `ElectronStorageProvider` uses `electron-store` which persists to a JSON file in Electron's `userData` directory. No SQLite tables are modified. This is platform secure storage, not application data.

---

## 10. Error Handling

### 10.1 Error Scenarios

| Scenario | Behavior | Error |
|---|---|---|
| `safeStorage.isEncryptionAvailable()` returns `false` at construction | Throw immediately | `Error('Encryption is not available on this system')` |
| `safeStorage.encryptString()` fails | Propagate error | Original error from Electron |
| `safeStorage.decryptString()` fails (corrupted data, wrong key) | Propagate error | Original error from Electron |
| `electron-store.get()` returns `undefined` (key not found) | Return `null` | No error — valid return |
| `electron-store.set()` fails (disk full, permission) | Propagate error | Original error from `electron-store` |
| `electron-store.delete()` on nonexistent key | No-op | `electron-store.delete()` is natively idempotent |
| `electron-store.clear()` on empty store | No-op | `electron-store.clear()` handles empty store gracefully |

### 10.2 Idempotency

- `delete(key)` is idempotent — `electron-store.delete()` does not throw on missing keys
- `clear()` is idempotent — `electron-store.clear()` does not throw on empty store
- `store(key, value)` overwrites — repeated calls with same key are safe

### 10.3 No Try/Catch Wrapping

Unlike `CapacitorStorageProvider` (which must wrap `delete` in try/catch per Rule 7.1 due to Android Keystore non-idempotency), `ElectronStorageProvider` does NOT need try/catch wrappers. `electron-store` natively provides idempotent delete and clear.

---

## 11. Logging Requirements

| Event | Level | Message | Rationale |
|---|---|---|---|
| Encryption unavailable at construction | `console.error` | `"safeStorage encryption is not available on this system"` | Critical failure — app cannot operate |
| Value stored successfully | `console.log` | (None — verbose, not needed) | — |
| Value retrieved successfully | `console.log` | (None — verbose, not needed) | — |
| All entries cleared | `console.log` | (None — verbose, not needed) | — |

**Note:** Storage operations are low-level infrastructure. Logging each store/retrieve would be excessively verbose and risks leaking key names to logs. Only the construction-time encryption check is logged.

**Prohibited from logging:** Stored values (access tokens, refresh tokens, derived AES key), store key names that reveal what credentials exist.

---

## 12. Security Requirements

| # | Requirement | Source | How Enforced |
|---|---|---|---|
| 1 | Values encrypted at rest on disk | NFR-SEC-02 | `safeStorage.encryptString()` before `electronStore.set()` |
| 2 | Encryption availability checked before any operation | NFR-SEC-02 | Constructor throws if `isEncryptionAvailable()` returns `false` |
| 3 | Encrypted values base64-encoded for JSON serialization | PK-03 analog | `buffer.toString('base64')` on write; `Buffer.from(str, 'base64')` on read |
| 4 | Master password never stored | Rule 12.1 | Provider is value-agnostic; consumers (AuthProvider, CryptoProvider) enforce what is stored |
| 5 | Store file in `userData` — survives app updates, wiped on OS reinstall | T-04.3 spec | `electron-store` default location; no custom path needed |
| 6 | No platform conditionals in provider | Rule 13.1 | This IS the platform implementation — conditionals are structural, not runtime |
| 7 | No `@capacitor/*` imports | Rule 13.4 | Enforce via grep; zero Capacitor references |

---

## 13. Acceptance Criteria

| # | Criterion | Verification |
|---|---|---|
| AC-01 | `store()` → `retrieve()` returns matching plaintext | Unit test: store "test-value" → retrieve returns "test-value" |
| AC-02 | `retrieve()` nonexistent key returns `null` | Unit test: retrieve("nonexistent") returns null |
| AC-03 | `delete()` → `retrieve()` returns `null` | Unit test: store → delete → retrieve returns null |
| AC-04 | `clear()` removes all entries | Unit test: store multiple keys → clear → retrieve each returns null |
| AC-05 | `safeStorage.isEncryptionAvailable()` returns `false` → constructor throws | Unit test: mock isEncryptionAvailable to return false → expect throw |
| AC-06 | `safeStorage.encryptString()` called on `store()` | Unit test: verify mock called with plaintext value |
| AC-07 | `safeStorage.decryptString()` called on `retrieve()` | Unit test: verify mock called with decrypted buffer |
| AC-08 | `delete()` is idempotent (no throw on missing key) | Unit test: delete nonexistent key does not throw |
| AC-09 | `clear()` is idempotent (no throw on empty store) | Unit test: clear empty store does not throw |
| AC-10 | `SecureStorageProvider` interface lives in `shared/src/domain/interfaces/` | File exists at canonical location |
| AC-11 | `ElectronAuthProvider` no longer defines local `SecureStorageProvider` interface | Code review: no `export interface SecureStorageProvider` in ElectronAuthProvider.ts |
| AC-12 | TypeScript compiles clean across all packages | `pnpm typecheck` returns zero errors |
| AC-13 | All unit tests pass | `pnpm --filter @collectio/platform test -- ElectronStorageProvider` |
| AC-14 | Lint passes | `pnpm lint` returns zero errors |
| AC-15 | No `@capacitor/*` imports in ElectronStorageProvider | grep verification |
| AC-16 | No raw values in logs | Code review of all console.* calls |

---

## 14. Test Cases

### 14.1 Unit Tests (`ElectronStorageProvider.test.ts`)

| # | Test | What It Validates |
|---|---|---|
| UT-01 | `store()` encrypts value via `safeStorage.encryptString()` | Mock safeStorage; verify encryptString called with plaintext |
| UT-02 | `store()` base64-encodes encrypted buffer and writes to electron-store | Mock encryptString returns Buffer; verify electronStore.set called with base64 string |
| UT-03 | `store()` overwrites existing key | Store → store again with different value → retrieve returns latest |
| UT-04 | `retrieve()` reads from electron-store and decrypts | Mock electronStore.get returns base64; verify decryptString called with correct Buffer |
| UT-05 | `retrieve()` returns null when key not found | Mock electronStore.get returns undefined → expect null |
| UT-06 | `retrieve()` returns null when store returns null | Mock electronStore.get returns null → expect null |
| UT-07 | `delete()` removes key from electron-store | Verify electronStore.delete called with key |
| UT-08 | `delete()` does not throw on missing key | Mock electronStore.delete (which is natively idempotent) |
| UT-09 | `clear()` clears all entries from electron-store | Verify electronStore.clear called |
| UT-10 | `clear()` does not throw on empty store | Mock electronStore.clear (natively idempotent) |
| UT-11 | Constructor throws when `safeStorage.isEncryptionAvailable()` returns `false` | Mock isEncryptionAvailable → false; expect throw |
| UT-12 | Constructor succeeds when `safeStorage.isEncryptionAvailable()` returns `true` | Mock isEncryptionAvailable → true; no throw |
| UT-13 | Constructor passes `name` to `electron-store` | Pass custom name; verify Store constructed with `{ name }` |
| UT-14 | Constructor uses default `"config"` name when none provided | No name arg; verify Store constructed with `{ name: 'config' }` |
| UT-15 | `retrieve()` handles corrupted data (decryptString throws) | Mock decryptString throws; error propagates |
| UT-16 | `store()` handles encryption failure (encryptString throws) | Mock encryptString throws; error propagates |
| UT-17 | Round-trip: store → retrieve returns original plaintext (integration-style) | Real safeStorage not required — mock both ends of the encryption pipe |

### 14.2 Mock Strategy

| Dependency | Mock Approach | Reason |
|---|---|---|
| `electron` (`safeStorage`) | `jest.mock('electron', ...)` with `isEncryptionAvailable`, `encryptString`, `decryptString` | SafeStorage requires Electron runtime; not available in Jest |
| `electron-store` | `jest.mock('electron-store', ...)` with `get`, `set`, `delete`, `clear` | electron-store uses Node.js fs; mock to avoid filesystem dependency |
| `node:crypto` | Not used by this provider | — |
| `@capacitor/*` | Must not appear in this file | Platform isolation check |

---

## 15. Definition Of Done

| # | Criterion | How Verified |
|---|---|---|
| DOD-01 | `SecureStorageProvider.ts` created in `shared/src/domain/interfaces/` | File exists |
| DOD-02 | `SecureStorageProvider` type exported from `shared/src/domain/interfaces/index.ts` | Barrel export present |
| DOD-03 | `SecureStorageProvider` type exported from `shared/src/index.ts` | Top-level re-export present |
| DOD-04 | `ElectronStorageProvider.ts` created in `platform/src/electron/` | File exists |
| DOD-05 | `ElectronStorageProvider` implements `SecureStorageProvider` | `implements SecureStorageProvider` compiles |
| DOD-06 | `ElectronStorageProvider` exported from `platform/src/electron/index.ts` | Barrel export present |
| DOD-07 | `platform/src/electron/index.ts` no longer exports `SecureStorageProvider` type from `ElectronAuthProvider.ts` | Type import now from `@collectio/shared` |
| DOD-08 | `ElectronAuthProvider.ts` no longer defines local `SecureStorageProvider` interface | grep `export interface SecureStorageProvider` in that file returns zero |
| DOD-09 | `ElectronAuthProvider.ts` imports `SecureStorageProvider` from `@collectio/shared` | Import statement present |
| DOD-10 | All 17 unit tests pass | `pnpm --filter @collectio/platform test -- ElectronStorageProvider` |
| DOD-11 | Existing `ElectronAuthProvider` tests still pass (import change) | `pnpm --filter @collectio/platform test -- ElectronAuthProvider` |
| DOD-12 | TypeScript compiles clean across all packages | `pnpm typecheck` returns zero errors |
| DOD-13 | Lint passes across all packages | `pnpm lint` returns zero errors |
| DOD-14 | Zero `@capacitor/*` imports in `ElectronStorageProvider.ts` | grep `from '@capacitor` returns zero matches |
| DOD-15 | Zero `client_secret` or raw token values in source | grep `client_secret` returns zero matches; code review for token patterns |
| DOD-16 | No `import.meta.dirname` or bare `__dirname` | grep verification (Rule 15.2) — not expected but verify |
| DOD-17 | `electron-store` `name` parameter default is `"config"` | Code review; matches existing Electron tools convention |
| DOD-18 | All barrel export paths resolve correctly | Manual import verification at each layer |

