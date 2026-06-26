# E-04 T-04 — Implement CapacitorStorageProvider

**Parent Epic:** E-04: Platform Services
**Type:** Production Implementation (Platform Services Layer — Capacitor)
**Criticality:** FOUNDATION — `SecureStorageProvider` is the only contract through which the application persists sensitive credentials (derived AES key, OAuth tokens). Without it, authentication state cannot survive app restarts. `CapacitorStorageProvider` is the Capacitor (Android) implementation backed by `capacitor-secure-storage-plugin` (Android Keystore).

---

## 1. Goal

Implement `CapacitorStorageProvider` — the `SecureStorageProvider` interface implementation for the Capacitor (Android) platform. This provider stores and retrieves string values using `capacitor-secure-storage-plugin@0.10.0`, which wraps Android Keystore for hardware-backed secure credential storage. Unlike the Electron counterpart, no manual encryption is performed — Android Keystore provides hardware-backed encryption automatically. The provider handles the platform's non-idempotent `remove()` behavior by wrapping deletion in try/catch per Rule 7.1.

Additionally, this task cleans up the `SecureStorageProvider` interface duplicate in `CapacitorAuthProvider.ts` — replacing it with an import from the canonical location at `@collectio/shared` (established in T-04.3).

---

## 2. Scope

| In Scope | Rationale |
|---|---|
| `CapacitorStorageProvider` class in `packages/platform/src/capacitor/` | Capacitor-specific implementation using `capacitor-secure-storage-plugin` |
| `SecureStorageProvider` interface import from `@collectio/shared` | Canonical interface established by T-04.3 — no local duplicate |
| `store(key, value)` — direct pass-through to `SecureStoragePlugin.set()` | Plugin writes to Android Keystore; encryption is automatic |
| `retrieve(key)` — direct pass-through to `SecureStoragePlugin.get()` | Returns `string \| null`; catches errors for missing keys (OEM-dependent) |
| `delete(key)` — idempotent wrapper around `SecureStoragePlugin.remove()` | Wraps in try/catch per Rule 7.1; swallows "does not exist" errors |
| `clear()` — iterate all keys via `keys()` and delete each | Plugin has no native `clear()`; must iterate + remove |
| `CapacitorAuthProvider` cleanup — remove local `SecureStorageProvider` interface | Import from `@collectio/shared` instead |
| Barrel export from `packages/platform/src/capacitor/index.ts` | Makes class importable |
| Unit tests for all 4 methods + idempotency | Jest with mocked `capacitor-secure-storage-plugin` |

---

## 3. Out of Scope

| Out of Scope | Why | Where It Belongs |
|---|---|---|
| `ElectronStorageProvider` modifications | Separate platform; already implemented in T-04.3 | E-04 T-04.3 |
| `SecureStorageProvider` interface definition | Already canonicalized in T-04.3 | `packages/shared/src/domain/interfaces/SecureStorageProvider.ts` |
| `@capacitor/preferences` fallback for aggressive OEMs | Not yet required; kept as documented fallback per PK-03 / RP-07 | Future if OEM compatibility issues arise |
| Dependency injection wiring into `apps/capacitor/src/di.ts` | DI container setup is a dedicated task | E-04 T-04.8 |
| Any Electron/Node.js API usage | Platform boundary | N/A |
| Master password storage | Never stored per Rule 12.1; only derived AES key and OAuth tokens | CryptoProvider + AuthProvider decisions |

---

## 4. Files To Create

| # | File | Purpose | Responsibility |
|---|---|---|---|
| 1 | `packages/platform/src/capacitor/CapacitorStorageProvider.ts` | `SecureStorageProvider` Capacitor implementation | Implements the interface using `capacitor-secure-storage-plugin`. Handles non-idempotent `remove()` via try/catch. Handles missing-key `get()` errors on aggressive OEMs by returning `null`. Implements `clear()` via iterate-and-delete since the plugin has no native clear. |
| 2 | `packages/platform/src/capacitor/__tests__/CapacitorStorageProvider.test.ts` | Unit tests for CapacitorStorageProvider | Tests all 4 interface methods with mocked `capacitor-secure-storage-plugin`. Verifies idempotent delete swallows "does not exist" errors. Verifies missing-key `get()` returns null. Verifies `clear()` iterates all keys. |

---

## 5. Files To Modify

| # | File | Change | Reason |
|---|---|---|---|
| 1 | `packages/platform/src/capacitor/index.ts` | Add `export { CapacitorStorageProvider } from './CapacitorStorageProvider.js';` | Barrel re-export |
| 2 | `packages/platform/src/capacitor/CapacitorAuthProvider.ts` | Replace local `SecureStorageProvider` interface (lines 6-13) with `import type { SecureStorageProvider } from '@collectio/shared';` | Resolves TODO comment; de-duplicates interface |
| 3 | `packages/platform/src/capacitor/__tests__/CapacitorAuthProvider.test.ts` | If tests import `SecureStorageProvider` from local `CapacitorAuthProvider.ts`, update to import from `@collectio/shared` | Match source change; tests must compile |

---

## 6. Interfaces

### 6.1 `SecureStorageProvider` (Pre-existing — `packages/shared/src/domain/interfaces/SecureStorageProvider.ts`)

Canonical interface established by T-04.3. Import from `@collectio/shared`.

```
interface SecureStorageProvider {
  store(key: string, value: string): Promise<void>
  retrieve(key: string): Promise<string | null>
  delete(key: string): Promise<void>
  clear(): Promise<void>
}
```

**Contract semantics:**
- `store`: Writes a string value. Overwrites if key exists.
- `retrieve`: Returns the stored string, or `null` if key not found. Must not throw for missing keys.
- `delete`: Removes the key. Must be idempotent — deleting a nonexistent key must not throw.
- `clear`: Removes all stored key-value pairs. Must not throw if store is already empty.

### 6.2 `CapacitorStorageProvider` Public API

```
class CapacitorStorageProvider implements SecureStorageProvider {
  constructor()

  // Writes value to Android Keystore via SecureStoragePlugin.set()
  async store(key: string, value: string): Promise<void>

  // Reads from Android Keystore via SecureStoragePlugin.get()
  // Returns null if key not found (catches plugin errors on missing keys)
  async retrieve(key: string): Promise<string | null>

  // Removes key from Android Keystore. Idempotent — swallows "does not exist" errors.
  async delete(key: string): Promise<void>

  // Iterates all keys via SecureStoragePlugin.keys() and deletes each via delete()
  async clear(): Promise<void>
}
```

**Constructor:**
- No parameters. The `capacitor-secure-storage-plugin` is a singleton accessed via its global `SecureStoragePlugin` export.

---

## 7. Data Flow

### 7.1 `store(key, value)` Flow

```
1.  CALLER invokes storage.store('auth_access_token', 'ya29.abc...')

2.  WRITE to Android Keystore:
    - SecureStoragePlugin.set({ key: 'auth_access_token', value: 'ya29.abc...' })
    - Plugin writes to Android Keystore — encryption handled automatically by OS

3.  RETURN (void Promise)
```

### 7.2 `retrieve(key)` Flow

```
1.  CALLER invokes storage.retrieve('auth_access_token')

2.  READ from Android Keystore:
    - result = SecureStoragePlugin.get({ key: 'auth_access_token' })
    - Plugin returns { value: string } on success

3.  IF key found:
    - RETURN result.value (string)

4.  IF key not found (plugin throws or returns no value):
    - Catch error → return null
    - Note: Behavior varies by OEM — some throw, some return empty
```

### 7.3 `delete(key)` Flow

```
1.  CALLER invokes storage.delete('auth_access_token')

2.  DELETE from Android Keystore:
    - TRY: SecureStoragePlugin.remove({ key: 'auth_access_token' })
    - CATCH error:
        - IF error message contains "does not exist" → swallow (Rule 7.1)
        - ELSE → rethrow

3.  RETURN (void Promise)
```

### 7.4 `clear()` Flow

```
1.  CALLER invokes storage.clear()

2.  GET all keys:
    - result = SecureStoragePlugin.keys()
    - Returns { value: string[] } — array of all stored key names

3.  DELETE each key:
    - FOR each key in result.value:
        - storage.delete(key)  // reuses idempotent delete
    - If keys() fails → propagate error

4.  RETURN (void Promise)
```

---

## 8. State Changes

### 8.1 Android Keystore State

| Operation | Keys Affected | Effect |
|---|---|---|
| `store('key1', 'val1')` | `key1` | Written to hardware-backed Keystore |
| `store('key1', 'val2')` | `key1` | Overwritten in Keystore |
| `retrieve('key1')` | None | Read-only |
| `delete('key1')` | `key1` | Removed from Keystore |
| `clear()` | All keys | Each key individually deleted |

### 8.2 In-Memory State

`CapacitorStorageProvider` is stateless — all data lives in Android Keystore. No cache, no instance variables beyond the plugin reference.

---

## 9. Database Changes

**None.** `CapacitorStorageProvider` stores data exclusively in Android Keystore via `capacitor-secure-storage-plugin`. No SQLite tables are modified.

---

## 10. Error Handling

### 10.1 Error Scenarios

| Scenario | Behavior | Error |
|---|---|---|
| `SecureStoragePlugin.set()` fails (Keystore error) | Propagate error | Plugin error |
| `SecureStoragePlugin.get()` succeeds (key found) | Return `result.value` | — |
| `SecureStoragePlugin.get()` throws for missing key | Return `null` | Caught; no propagation |
| `SecureStoragePlugin.get()` returns no value for existing key | Return `null` | Defensive |
| `SecureStoragePlugin.remove()` throws "does not exist" | Swallow per Rule 7.1 | Caught; no propagation |
| `SecureStoragePlugin.remove()` throws other error | Propagate error | Plugin error |
| `SecureStoragePlugin.keys()` fails | Propagate error | Plugin error |
| `clear()` — `keys()` succeeds but individual `delete()` fails | Continue deleting remaining keys; propagate first error | Best-effort cleanup |

### 10.2 Idempotency

- `delete(key)` is idempotent — try/catch swallows "does not exist"
- `clear()` is idempotent — if `keys()` returns empty array, no deletes occur
- `store(key, value)` is idempotent — overwrites

### 10.3 Pattern for `delete()` (Rule 7.1)

```
try {
  await SecureStoragePlugin.remove({ key });
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (!msg.includes('does not exist')) throw err;
}
```

### 10.4 Pattern for `retrieve()`

```
try {
  const result = await SecureStoragePlugin.get({ key });
  return result?.value ?? null;
} catch {
  return null;
}
```

---

## 11. Logging Requirements

| Event | Level | Message | Rationale |
|---|---|---|---|
| (None) | — | — | Storage operations are low-level infrastructure. Logging each store/retrieve would be excessively verbose and risks leaking key names to logs. |

**Note:** Unlike `ElectronStorageProvider` (which logs an encryption availability check), `CapacitorStorageProvider` has no comparable construction-time check. The Android Keystore is assumed available.

**Prohibited from logging:** Stored values (access tokens, refresh tokens, derived AES key), store key names, any data that reveals what credentials exist.

---

## 12. Security Requirements

| # | Requirement | Source | How Enforced |
|---|---|---|---|
| 1 | Values stored in Android Keystore (hardware-backed) | NFR-SEC-02, PK-03 | `capacitor-secure-storage-plugin` uses Android Keystore natively |
| 2 | Data survives app kill | PK-03 (KC-09) | Plugin persists to Keystore — survives app kill by design |
| 3 | Data not accessible in plaintext via filesystem inspection | T-04.4 AC 5 | Keystore encrypts at hardware level; no plaintext on disk |
| 4 | Master password never stored | Rule 12.1 | Provider is value-agnostic; consumers enforce what is stored |
| 5 | No platform conditionals in provider | Rule 13.1 | This IS the Capacitor platform implementation |
| 6 | No `electron` or `node:*` imports | Rule 13.4 | Enforce via grep; zero Electron/Node.js references |

---

## 13. Acceptance Criteria

| # | Criterion | Verification |
|---|---|---|
| AC-01 | `store()` → `retrieve()` returns matching value | Unit test: store "test-value" → retrieve returns "test-value" |
| AC-02 | `retrieve()` nonexistent key returns `null` | Unit test: mock `get()` to throw → expect `null` |
| AC-03 | `delete()` → `retrieve()` returns `null` | Unit test: store → delete → retrieve returns null |
| AC-04 | `delete()` swallows "does not exist" error | Unit test: mock `remove()` to throw "does not exist" → no error propagated |
| AC-05 | `delete()` propagates non-idempotency errors | Unit test: mock `remove()` to throw "Keystore error" → error propagated |
| AC-06 | `clear()` deletes all stored keys | Unit test: mock `keys()` returns ['k1','k2']; verify `remove()` called for both |
| AC-07 | `clear()` handles empty store | Unit test: mock `keys()` returns []; verify `remove()` never called |
| AC-08 | `CapacitorAuthProvider` no longer defines local `SecureStorageProvider` | Code review: no `export interface SecureStorageProvider` in CapacitorAuthProvider.ts |
| AC-09 | TypeScript compiles clean across all packages | `pnpm typecheck` returns zero errors |
| AC-10 | All unit tests pass | `pnpm --filter @collectio/platform test -- CapacitorStorageProvider` |
| AC-11 | Existing `CapacitorAuthProvider` tests still pass | `pnpm --filter @collectio/platform test -- CapacitorAuthProvider` |
| AC-12 | Lint passes | `pnpm lint` returns zero errors |
| AC-13 | No `electron` or `node:*` imports in CapacitorStorageProvider | grep verification |
| AC-14 | No raw values in logs | Code review of all console.* calls |

---

## 14. Test Cases

### 14.1 Unit Tests (`CapacitorStorageProvider.test.ts`)

**Mock Strategy:** `jest.mock('capacitor-secure-storage-plugin', ...)` with mocked `set`, `get`, `remove`, `keys` methods on a mocked `SecureStoragePlugin` object.

| # | Test | What It Validates |
|---|---|---|
| UT-01 | `store()` calls `SecureStoragePlugin.set()` with correct key and value | Verify plugin set called with `{ key, value }` |
| UT-02 | `store()` propagates error from plugin | Mock set to reject; error propagates |
| UT-03 | `retrieve()` returns `result.value` when key found | Mock get returns `{ value: 'stored-val' }` → expect 'stored-val' |
| UT-04 | `retrieve()` returns `null` when `result.value` is empty string | Mock get returns `{ value: '' }` → expect null |
| UT-05 | `retrieve()` returns `null` when plugin throws (missing key) | Mock get to reject → expect null |
| UT-06 | `retrieve()` returns `null` when plugin throws non-missing-key error | Mock get to reject with arbitrary error → expect null (defensive) |
| UT-07 | `delete()` calls `SecureStoragePlugin.remove()` with correct key | Verify plugin remove called with `{ key }` |
| UT-08 | `delete()` swallows error containing "does not exist" | Mock remove to throw `Error("Item with given key does not exist")` → no error |
| UT-09 | `delete()` swallows error containing "does not exist" (case insensitive) | Mock remove to throw `Error("Key Does Not Exist")` → no error |
| UT-10 | `delete()` propagates error NOT containing "does not exist" | Mock remove to throw `Error("Keystore failure")` → error propagated |
| UT-11 | `clear()` calls `SecureStoragePlugin.keys()` to enumerate keys | Verify keys() called |
| UT-12 | `clear()` calls `delete()` for each key returned by `keys()` | Mock keys returns ['k1','k2']; verify two delete calls |
| UT-13 | `clear()` handles empty key array | Mock keys returns []; verify no delete calls |
| UT-14 | `clear()` propagates error from `keys()` | Mock keys to reject; error propagates |
| UT-15 | `clear()` continues deleting remaining keys when one delete fails | Mock keys returns ['k1','k2']; mock remove('k1') throws "does not exist"; verify 'k2' also deleted |
| UT-16 | Round-trip: store → retrieve returns original plaintext | Mock set/get to simulate real storage |
| UT-17 | `retrieve()` returns `null` when `result` is `null`/`undefined` | Mock get returns `null` → expect null |
| UT-18 | No `console.*` calls in production code paths | Verify zero log statements in implementation |

### 14.2 Integration Tests (T-04.7 — separate spec, listed for completeness)

| # | Test | Environment |
|---|---|---|
| IT-01 | Store → kill app → relaunch → retrieve survives | Physical Android device |
| IT-02 | Store binary data (base64 AES key) → retrieve matches | Physical Android device |
| IT-03 | Delete all → app relaunch → no keys remain | Physical Android device |

---

## 15. Definition Of Done

| # | Criterion | How Verified |
|---|---|---|
| DOD-01 | `CapacitorStorageProvider.ts` created in `platform/src/capacitor/` | File exists |
| DOD-02 | `CapacitorStorageProvider` implements `SecureStorageProvider` | `implements SecureStorageProvider` compiles |
| DOD-03 | `CapacitorStorageProvider` imports `SecureStorageProvider` from `@collectio/shared` | Import from canonical location |
| DOD-04 | `CapacitorStorageProvider` exported from `platform/src/capacitor/index.ts` | Barrel export present |
| DOD-05 | `CapacitorAuthProvider.ts` no longer defines local `SecureStorageProvider` interface | grep `export interface SecureStorageProvider` returns zero |
| DOD-06 | `CapacitorAuthProvider.ts` imports `SecureStorageProvider` from `@collectio/shared` | Import statement present |
| DOD-07 | All 18 unit tests pass | `pnpm --filter @collectio/platform test -- CapacitorStorageProvider` |
| DOD-08 | Existing `CapacitorAuthProvider` tests still pass | `pnpm --filter @collectio/platform test -- CapacitorAuthProvider` |
| DOD-09 | TypeScript compiles clean across all packages | `pnpm typecheck` returns zero errors |
| DOD-10 | Lint passes across all packages | `pnpm lint` returns zero errors |
| DOD-11 | Zero `electron` imports in `CapacitorStorageProvider.ts` | grep `from 'electron'` returns zero matches |
| DOD-12 | Zero `node:` imports in `CapacitorStorageProvider.ts` | grep `from 'node:'` returns zero matches |
| DOD-13 | Zero `console.*` calls in `CapacitorStorageProvider.ts` | Code review |
| DOD-14 | `delete()` wraps `remove()` in try/catch per Rule 7.1 | Code review; "does not exist" check |
| DOD-15 | `retrieve()` wraps `get()` in try/catch for missing key safety | Code review |
| DOD-16 | `clear()` calls `keys()` then iterates deletes | Code review |
| DOD-17 | No `import.meta.dirname` or bare `__dirname` | grep verification (Rule 15.2) — not expected but verify |
| DOD-18 | All barrel export paths resolve correctly | Manual import verification |

