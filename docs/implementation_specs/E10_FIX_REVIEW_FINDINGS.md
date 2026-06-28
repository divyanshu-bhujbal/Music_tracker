# E-10 Fix Spec — Review Findings Remediation

> **Epic:** E-10_SYNC_ENGINE.md | **Phase:** 3 | **Trigger:** E10 implementation review (2026-06-28)
> **Depends On:** E-10 Batch 1/2/3 (all files exist, fixes applied in-place)
> **Platform Impact:** CHANGED — `DatabaseConnection` interface extended; Electron + Capacitor serialization implementations required
> **Date:** 2026-06-28

---

## 1. Goal

Fix all Critical and Major findings from the E10 implementation review (C1–C4, M1–M4), plus Minor findings m1–m5 where practical. The primary objective is restoring the all-or-nothing sync contract and making the sync engine functional.

Findings addressed:

| ID | Severity | Finding |
|----|----------|---------|
| C1 | Critical | Winners applied to live DB before upload — all-or-nothing contract violated |
| C2 | Critical | Auto-sync timer callback is empty — timer expiry does nothing |
| C3 | Critical | `NetworkMonitor` injected as `{}` — crashes at runtime |
| C4 | Critical | `serializeDb` stub returns empty bytes — cloud backup is empty |
| M1 | Major | Only 9 of 20 sync engine integration tests |
| M2 | Major | Electron DI missing `syncEngine.initialize()` call |
| M3 | Major | `triggerSync()` has no SyncEngine reference |
| M4 | Major | Shared schema cache across DBs |
| m3 | Minor | `resolveOrphans()` uses `execute()` with params (Capacitor Rule 4.7) |

---

## 2. Scope

- Add `serialize(): Promise<Uint8Array>` to `DatabaseConnection` interface
- Implement `serialize()` on `BetterSqlite3Connection` (Electron)
- Implement `serialize()` on `CapacitorSqliteConnection` (Capacitor)
- Restructure `SyncEngine.execute()` to build merged copy before upload (C1, C4)
- Add `setCallback()` to `SyncTimer` and wire auto-sync expiry (C2)
- Instantiate `NetworkMonitor` in both DI files and inject into `SyncEngine` (C3)
- Add `setSyncEngine()` to `useSyncStore` and wire `triggerSync()` (M3)
- Call `syncEngine.initialize()` in Electron DI (M2)
- Remove shared schema cache from `ChangeTracker` (M4)
- Route parameterized DML through `run()` in `resolveOrphans()` for Capacitor (m3)
- Add missing integration tests SE-02 through SE-20 (M1)
- Strengthen existing SE-01 test to verify sync success, not just `upload()` call
- Re-export `SyncEngine` and `useSyncStore` from `application/index.ts`
- Re-export `NetworkMonitorInterface` from `shared/src/index.ts` (needed by DI files)

## 3. Out of Scope

- Implementing actual `openInMemoryDb` for Capacitor (V1 limitation — uses in-memory DB constructor)
- Implementing `getDerivedKey` callback (depends on E-03 master password flow not yet in DI)
- Changing `getPlatform()` detection (minor, non-functional)
- Changing `getSetting()` type casts (minor, non-functional)
- `useSyncStore.lastSyncTime` type narrowing (minor, doesn't cause runtime issues)
- Capacitor `App.addListener('appStateChange')` shutdown wiring (Capacitor lifecycle, low priority for V1)

---

## 4. Files To Create

None. All changes are modifications to existing files.

## 5. Files To Modify

| # | File | Change | Finding |
|---|------|--------|---------|
| 1 | `packages/shared/src/data/database/DatabaseConnection.ts` | Add `serialize(): Promise<Uint8Array>` to interface | C4 |
| 2 | `packages/platform/src/electron/BetterSqlite3Connection.ts` | Implement `serialize()` using `db.serialize()` | C4 |
| 3 | `packages/platform/src/capacitor/CapacitorSqliteConnection.ts` | Implement `serialize()` via SQLite export mechanism | C4 |
| 4 | `packages/shared/src/application/sync/SyncEngine.ts` | Restructure merge flow; wire timer expiry; wire store reference; inject NetworkMonitor properly | C1, C2, C3, M3 |
| 5 | `packages/shared/src/application/sync/SyncTimer.ts` | Add `setCallback(fn)` method | C2 |
| 6 | `packages/shared/src/application/sync/useSyncStore.ts` | Add `setSyncEngine(ref)`, wire `triggerSync()` delegation | M3 |
| 7 | `packages/shared/src/application/sync/ChangeTracker.ts` | Remove shared schema cache; discover per-call | M4 |
| 8 | `packages/shared/src/application/sync/ConflictResolver.ts` | Route param DML through `execute()` only when params empty; use individual calls for Capacitor compat | m3 |
| 9 | `apps/electron/src/di.ts` | Instantiate NetworkMonitor; wire to SyncEngine; add serialize stub; call initialize() | C3, C4, M2 |
| 10 | `apps/capacitor/src/di.ts` | Instantiate NetworkMonitor; wire to SyncEngine; add serialize stub (real impl in file 3) | C3, C4 |
| 11 | `packages/shared/src/application/sync/__tests__/SyncEngine.test.ts` | Add SE-02 through SE-20; strengthen SE-01 | M1 |
| 12 | `packages/shared/src/application/index.ts` | Add exports for `SyncEngine`, `useSyncStore`, `ChangeTracker`, `ConflictResolver` | m5 |
| 13 | `packages/shared/src/index.ts` | Add `export type { NetworkMonitorInterface }` from domain interfaces | C3 |
| 14 | `packages/shared/src/domain/interfaces/index.ts` | Add `export type { NetworkMonitorInterface }` (if not already added) | C3 |
| 15 | `packages/platform/src/shared/index.ts` | Export `NetworkMonitor` (verify; currently missing per spec T-10.12) | C3 |

---

## 6. Interface Changes

### 6.1 `DatabaseConnection` — New `serialize()` Method

**Location:** `packages/shared/src/data/database/DatabaseConnection.ts`

Add to the existing interface:

```typescript
/**
 * Serializes the entire SQLite database to a Uint8Array of raw SQLite bytes.
 *
 * The returned bytes represent a complete, self-contained SQLite database file
 * suitable for writing to disk, uploading to cloud storage, or opening as an
 * in-memory database connection.
 *
 * This is a read-only operation — the database is not modified.
 *
 * @returns The complete SQLite database file as raw bytes.
 * @throws {DatabaseError} If serialization fails (database corruption, I/O error).
 */
serialize(): Promise<Uint8Array>;
```

**Placement:** Insert after `transaction()` and before the closing `}`.

**Implementation requirements:**

| Platform | Implementation | Mechanism |
|----------|---------------|-----------|
| Electron | `BetterSqlite3Connection` | `this.db.serialize()` — better-sqlite3 native method. Returns `Buffer`. Convert to `Uint8Array`. |
| Capacitor | `CapacitorSqliteConnection` | Use the `@capacitor-community/sqlite` export API. Call `this.db.exportToJson('full')` to get JSON, then reconstruct, OR use the plugin's native backup method. For V1 simplicity: read `sqlite_master` for CREATE statements, then `SELECT *` from each table, and reconstruct the SQLite file bytes programmatically. Acceptable alternative: call the plugin's `getDatabase` method if available, or serialize via the JavaScript-level backup API. |

**Electron pattern:**
```typescript
async serialize(): Promise<Uint8Array> {
  return new Uint8Array(this.db.serialize());
}
```

**Capacitor pattern (V1):**
```typescript
async serialize(): Promise<Uint8Array> {
  // Use the Capacitor SQLite plugin's export mechanism
  // The plugin's exportToJson('full') returns a JSON object with schema + data
  // We reconstruct byte-level SQLite from this, OR use a simpler approach:
  // For V1, serialize by exporting to JSON and reconstructing.
  const result = await this.dbConn.exportToJson('full');
  // ... reconstruct Uint8Array from JSON schema + data ...
}
```

### 6.2 `SyncTimer` — New `setCallback()` Method

**Location:** `packages/shared/src/application/sync/SyncTimer.ts`

Add public method:

```typescript
/**
 * Replace the expiry callback without restarting the timer.
 *
 * @param callback - New callback to invoke on expiry.
 */
setCallback(callback: () => void): void {
  this.onExpiry = callback;
}
```

**Note:** `onExpiry` is currently `private readonly`. Change to `private` (remove `readonly`). The constructor still sets it; `setCallback` overrides it.

### 6.3 `useSyncStore` — New `setSyncEngine()` Method + `triggerSync()` Rewire

**Location:** `packages/shared/src/application/sync/useSyncStore.ts`

Add to state:

```typescript
interface SyncStoreState {
  // ... existing state ...
  
  /** Reference to the SyncEngine instance, set during initialization */
  _syncEngineRef: unknown; // or imported type — avoids circular import
  
  /** Set the SyncEngine reference (called once during initialize) */
  setSyncEngine: (engine: unknown) => void;
}
```

`triggerSync()` implementation changes to:

```typescript
triggerSync: () => {
  const state = get();
  if (state.syncState === 'SYNCING') return;
  set({ syncState: 'SYNCING', errorMessage: null });
  if (get()._syncEngineRef) {
    (get()._syncEngineRef as { execute: () => void }).execute();
  }
},
```

### 6.4 `SyncEngine` Constructor — Remove Callback Injections, Add `NetworkMonitorInterface`

**Location:** `packages/shared/src/application/sync/SyncEngine.ts`

Changes to constructor:
1. Replace `networkMonitor: NetworkMonitorInterface` — already correct, just remove the `{} as never` from DI files. No code change needed in SyncEngine itself.
2. Remove `serializeDb`, `openInMemoryDb`, `getDerivedKey` constructor parameters. Replace `serializeDb(db)` calls with `db.serialize()`. Replace `openInMemoryDb(bytes)` with` a local private method that uses platform injection (see §7).
3. Keep `openInMemoryDb` as an injected callback for V1 — the interface doesn't yet support opening from bytes. This can be factory-created per platform in the DI files.

**Updated constructor (reduced):**

Remove the last 3 injected callbacks and add them as class-level injected properties instead, or keep them but ensure DI files provide real implementations. The simplest approach: keep `serializeDb` and `openInMemoryDb` as injected callbacks, but in DI files, wire them to real implementations (not stubs).

**Decision: Keep injected callbacks for serialize/openInMemory.** This avoids changing the `DatabaseConnection` interface (which affects all existing code) and keeps serialization platform-specific. But the DI files MUST provide real implementations, not stubs.

The `serializeDb` callback in DI files should simply be: `async () => await db.serialize()` — this works once `serialize()` is added to `DatabaseConnection`.

The `openInMemoryDb` callback in DI files for Electron can use `better-sqlite3`'s ability to open from Buffer. For Capacitor, this is a V1 stub (in-memory SQLite from bytes is not directly supported by the Capacitor plugin without additional work — the Capacitor DI can open a memory DB and populate it from the encrypted cloud DB bytes using a JS-level reconstruction).

---

## 7. Data Flow — Revised 14-Step Merge Flow

### 7.1 Corrected `SyncEngine.execute()` Flow (Steps 8–12)

```
[Steps 1-7 unchanged: lock, log, download, decrypt, identify changes]

STEP 8: LWW Merge (unchanged — pure computation)
  mergeResult = this.conflictResolver.resolve(localChanges, remoteChanges)

STEP 9: Build merged copy (NEW — separate from live DB)
  9a. liveBytes = await this.serializeDb(this.db)
  9b. mergedDb = await this.openInMemoryDb(liveBytes)
  9c. await this.applyWinnersToDb(mergedDb, mergeResult.winners)
  9d. orphanReport = await this.conflictResolver.resolveOrphans(mergedDb)

STEP 10: Update last_successful_sync in MERGED COPY (not live DB)
  await mergedDb.execute(
    "INSERT INTO app_metadata (key, value) VALUES ('last_successful_sync', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [now]
  )

STEP 11: Serialize + encrypt merged copy
  mergedBytes = await this.serializeDb(mergedDb)
  encryptedBytes = await this.encryptedFileFormat.pack(mergedBytes, derivedKey, kdfSalt)

STEP 12: Upload
  await this.cloudStorageProvider.upload(encryptedBytes, 'collectio.db')

  ┌─ SUCCESS ───────────────────────────────────────────┐
  │ Apply winners + orphans to LIVE DB                    │
  │  await this.applyWinnersToDb(this.db, winners)       │
  │  await this.conflictResolver.resolveOrphans(this.db) │
  │  await this.appMetadataRepo.set('last_successful_sync', now) │
  │  await this.deviceRepo.updateLastSeen(deviceId)      │
  │                                                      │
  │  Log SUCCESS                                         │
  │  Release lock                                        │
  │  Update store → IDLE(clean)                          │
  └──────────────────────────────────────────────────────┘

  ┌─ FAILURE ───────────────────────────────────────────┐
  │  Do NOT apply to live DB                             │
  │  mergedDb is discarded (in-memory, garbage collected) │
  │  Revert last_successful_sync if previously set       │
  │  Log FAILURE                                         │
  │  Release lock                                        │
  │  Update store → WARNING/ALERT                        │
  └──────────────────────────────────────────────────────┘
```

### 7.2 Auto-Sync Timer Expiry Flow (C2 fix)

```
SyncEngine.initialize()
  │
  ├─ Creates auto-sync callback:
  │   const onAutoSyncExpiry = async () => {
  │     const dirty = await this.dirtyStateTracker.isDirty();
  │     const online = this.networkMonitor.isOnline();
  │     if (dirty && online) {
  │       await this.execute();
  │     }
  │   };
  │
  ├─ Calls this.syncTimer.setCallback(onAutoSyncExpiry);
  └─ Calls this.syncTimer.start();
```

The SyncTimer is constructed in DI with `() => {}` (placeholder). In `initialize()`, SyncEngine calls `setCallback()` to bind the real auto-sync handler. This avoids needing the DI to construct the timer with a SyncEngine reference.

### 7.3 NetworkMonitor Integration Flow (C3 fix)

```
DI: createServices()
  │
  ├─ const networkMonitor = new NetworkMonitor();   // from @collectio/platform/shared
  │
  ├─ new SyncEngine(
  │     ...,
  │     networkMonitor,    // real instance, not {}
  │     ...
  │   )
  │
  └─ SyncEngine.initialize()
       ├─ networkMonitor.onStatusChange(callback)
       │   └─ Wired to store + debounce + auto-sync
       └─ Works — real instance, real methods
```

### 7.4 Manual Sync Trigger Flow (M3 fix)

```
UI: Sidebar "Sync Now" button
  │
  ├─ useSyncStore.getState().triggerSync()
  │   └─ Sets state to SYNCING
  │   └─ Delegates to this._syncEngineRef.execute()
  │
  ▼
SyncEngine.initialize():
  └─ useSyncStore.getState().setSyncEngine(this);
```

---

## 8. State Changes

### 8.1 New: Merged Copy Lifecycle

| Step | State | Location |
|------|-------|----------|
| 9b | In-memory DB created from live DB bytes | `openInMemoryDb(liveBytes)` |
| 9c-9d | Winners + orphans applied to copy only | `mergedDb` |
| 10 | `last_successful_sync` written to copy only | `mergedDb` |
| 11 | Copy serialized + encrypted | Bytes |
| Upload success | Winners + orphans applied to live DB; `last_sync` written to live `app_metadata` | `this.db` |
| Upload failure | Copy discarded (garbage collected); live DB untouched | N/A |

### 8.2 Existing State Changes (unchanged from original spec)

`app_metadata`, `sync_log`, `devices`, and `useSyncStore` state changes follow the original E10 Batch 3 spec §9. The only change is WHEN winners are applied to live DB (after upload success, not before).

---

## 9. Database Changes

**None.** No new schema migrations, tables, or seed data. The `serialize()` method reads the database; it does not write.

The `resolveOrphans()` DML calls (UPDATE/DELETE) now follow Rule 4.7 for Capacitor: parameterized DML routes through `run()`, not `execute()`. The `ConflictResolver` already uses `db.execute(sql, params)` — on Capacitor, this must route to `run()` per the existing `CapacitorSqliteConnection.execute()` implementation which already checks `params.length > 0` and routes accordingly. No code change needed in `ConflictResolver` IF the Capacitor connection implementation already handles this. But the fix spec should verify:

- `CapacitorSqliteConnection.execute(sql, params)` already routes to `dbConn.run(sql, params, false)` when `params` is non-empty.

**Verification needed:** Confirm `CapacitorSqliteConnection.execute()` already follows Rule 4.7. If not, this becomes a separate fix item.

---

## 10. Error Handling

| Scenario | Existing Behavior | Fix |
|----------|------------------|-----|
| `db.serialize()` fails (corruption) | Not applicable (new method) | Throws `DatabaseError` — propagates to `execute()` catch handler; sync aborts, copy discarded |
| `openInMemoryDb()` fails | Stub returned null | Capacitor DI provides proper implementation; failure throws, sync aborts |
| Upload fails (step 12) | Winners already applied to live DB (bug) | Winners NOT yet applied (fix). Live DB is untouched. Revert `last_sync` if previously set. Log failure. |
| `NetworkMonitor.onStatusChange()` crash | `TypeError` on `{}` (bug) | Real instance injected — works as documented |
| Auto-sync timer expires | No-op (empty callback) | `setCallback()` binds real handler → triggers `execute()` |
| `triggerSync()` with no engine ref | Sets state to SYNCING, never executes | `setSyncEngine()` wired → `execute()` called |
| Merge fails | Winners partially applied to live DB (bug) | Winners applied only to copy; copy discarded on failure; live DB untouched |
| Orphan resolution uses `execute()` with params on Capacitor | Silently discarded params (potential SQL error) | Verified `CapacitorSqliteConnection.execute()` routes to `run()` when params present per Rule 4.7 |

---

## 11. Logging Requirements

| Event | Level | Message Pattern |
|-------|-------|----------------|
| Merged copy created | `debug` | `SyncEngine: step 9/14 — building merged copy (${liveBytes.length} bytes)` |
| Winners applied to copy | `debug` | `SyncEngine: step 9c/14 — ${n} winners applied to merged copy` |
| Orphans resolved in copy | `debug` | `SyncEngine: step 9d/14 — ${n} orphans resolved in merged copy` |
| Copy serialized for upload | `debug` | `SyncEngine: step 11/14 — merged copy serialized (${bytes.length} bytes)` |
| Winners applied to live DB | `info` | `SyncEngine: step 12b/14 — applying ${n} winners to live DB` |
| Upload failure — live DB untouched | `warn` | `SyncEngine: upload failed — live DB unchanged, merged copy discarded` |
| Timer callback bound | `debug` | `SyncEngine: auto-sync timer callback bound` |
| NetworkMonitor online | `debug` | `SyncEngine: network online` |
| NetworkMonitor offline | `debug` | `SyncEngine: network offline` |
| SyncEngine reference set in store | `debug` | `SyncEngine: store reference wired` |

---

## 12. Security Requirements

No new security requirements. Existing requirements unchanged:
- Rule 12.1 (never store master password) — `SyncEngine` still doesn't handle passwords
- Rule 12.2 (never log secrets) — merged DB bytes logged as `bytes.length` only
- NFR-SEC-03 (cloud DB encrypted before upload) — unchanged; step 11 encrypts before step 12 uploads

---

## 13. Acceptance Criteria

1. `DatabaseConnection.serialize()` is defined in the interface and compiles
2. `BetterSqlite3Connection.serialize()` returns valid SQLite bytes for restore
3. `CapacitorSqliteConnection.serialize()` returns valid SQLite bytes for restore
4. `SyncEngine.execute()` builds merged copy BEFORE upload; applies winners to live DB ONLY after upload success
5. Upload failure leaves live DB completely unchanged (no partial merge residue)
6. Auto-sync timer expiry triggers `execute()` (checks dirty + online first)
7. `NetworkMonitor` is instantiated in both DI files and injected as a real instance into `SyncEngine`
8. `syncEngine.initialize()` is called in Electron DI
9. `useSyncStore.triggerSync()` delegates to `SyncEngine.execute()` after wiring
10. `ChangeTracker` does not cache schemas for `getRemoteChanges()` — rediscovery per call
11. All 20 SyncEngine integration tests (SE-01 through SE-20) pass
12. All existing Batch 1 + Batch 2 tests continue to pass
13. `pnpm typecheck` passes with zero errors across all 5 workspace packages
14. `pnpm lint` passes with zero errors/warnings

---

## 14. Test Cases

### 14.1 SyncEngine Integration Tests (M1 — complete SE-02 through SE-20)

**File:** `packages/shared/src/application/sync/__tests__/SyncEngine.test.ts`

**Setup:** Updated to properly mock `serializeDb` (returns real bytes) and `openInMemoryDb` (returns a working in-memory DB). Mock `NetworkMonitor` with real interface implementation (jest.fn() per method).

#### Newly Added Tests:

| ID | Test | Setup | Expected |
|----|------|-------|----------|
| SE-02 | Remote changes → download + merge | 2 artists in cloud DB; local DB has none; `getRemoteChanges` returns 2 rows; upload succeeds | 2 artists merged into local DB; `recordsAffected=2`; `newRemoteOnly=2` |
| SE-03 | Both sides changed → LWW merge | Local song `updated_at=T+10`, remote same song `updated_at=T`; upload succeeds | Local wins; `conflictsResolved=1`; `recordsAffected` includes winners |
| SE-04 | Upload failure → live DB unchanged | `cloudStorageProvider.upload()` rejects `CloudStorageError('NETWORK')` | Live DB rows unchanged; `last_successful_sync` reverted to previous; `sync_log` FAILURE; `success=false` |
| SE-05 | Decryption failure → ALERT state | `encryptedFileFormat.unpack()` throws `AuthenticationError` | Store set to ALERT; `success=false`; `errorCode='DECRYPT_FAILED'`; no upload attempted |
| SE-11 | Startup sync skipped by user (skipSync) | Mock `skipSync` scenario — simulate conditions where sync would normally start but user opted out | execute() NOT called |
| SE-12 | Shutdown sync when dirty + online | `isDirty=true`, `isOnline=true`; call `syncOnShutdown()` | `execute()` called |
| SE-13 | Shutdown sync skipped when not dirty | `isDirty=false`; call `syncOnShutdown()` | `execute()` NOT called; returns immediately |
| SE-16 | Offline→online transition triggers debounced sync | Set dirty; transition online via mock event | 10s timer starts; after advance → `execute()` called if still dirty |
| SE-17 | Repeated failures increase auto-sync interval | `execute()` fails 3 times consecutively | `syncTimer.setDelay()` called with `baseInterval * 2^n`; interval increases |
| SE-18 | Successful sync resets failure count + interval | 3 failures then 1 success | `consecutiveFailures=0`; `syncTimer.setDelay(baseInterval)` called |
| SE-19 | Orphan FK resolved during merge | Cloud artist soft-deleted; local song_artist references it; sync succeeds | `orphansResolved > 0`; orphaned junction row deleted from live DB after upload success |
| SE-20 | Device registered on first initialize | `device_id` is null in `app_metadata` | Device created in devices table; `device_id` stored in `app_metadata` |

#### Strengthened Tests:

| ID | Change |
|----|--------|
| SE-01 | Verify `result.success === true`, not just that `upload()` was called. Assert `recordsAffected > 0` and `sync_log` marked SUCCESS. |

All tests must use properly mocked `serializeDb` and `openInMemoryDb` that actually return/accept meaningful byte arrays, not stubs.

### 14.2 No Other Test File Changes

Existing Batch 1 and Batch 2 tests are unaffected. `SyncTimer.test.ts` needs a new test for `setCallback()` (TM-18):

| ID | Test | Setup | Expected |
|----|------|-------|----------|
| TM-18 | `setCallback()` replaces callback | Create timer with `cb1`, call `setCallback(cb2)`, `start()`, advance past delay | `cb2` called, `cb1` NOT called |

---

## 15. Definition Of Done

- [ ] `DatabaseConnection` interface extended with `serialize(): Promise<Uint8Array>`
- [ ] `BetterSqlite3Connection.serialize()` returns valid SQLite bytes
- [ ] `CapacitorSqliteConnection.serialize()` returns valid SQLite bytes
- [ ] `SyncEngine.execute()` builds merged copy in-memory; applies winners to copy before upload
- [ ] `SyncEngine.execute()` applies winners to live DB ONLY after successful upload (step 12b relocated)
- [ ] `SyncEngine.execute()` discards merged copy and leaves live DB untouched on any failure before upload
- [ ] `SyncTimer.setCallback()` method added; `onExpiry` field changed from `private readonly` to `private`
- [ ] `SyncEngine.initialize()` calls `syncTimer.setCallback()` to bind auto-sync handler
- [ ] `useSyncStore` has `setSyncEngine()` method; `triggerSync()` delegates to it
- [ ] `SyncEngine.initialize()` calls `useSyncStore.getState().setSyncEngine(this)`
- [ ] `ChangeTracker.getTableSchemas()` removed instance-level cache; per-call discovery
- [ ] `NetworkMonitor` instantiated in both DI files (`new NetworkMonitor()` from `@collectio/platform/shared`)
- [ ] Both DI files pass real `NetworkMonitor` instance (not `{} as never`) to `SyncEngine` constructor
- [ ] Electron DI calls `await syncEngine.initialize()` before `return`
- [ ] `NetworkMonitorInterface` re-exported from `packages/shared/src/domain/interfaces/index.ts` and `packages/shared/src/index.ts`
- [ ] All 20 SyncEngine integration tests pass (SE-01 through SE-20)
- [ ] `SyncTimer` test TM-18 added for `setCallback()`
- [ ] All existing tests (Batch 1 + Batch 2 + useSyncStore) continue to pass
- [ ] `pnpm typecheck` passes with zero errors across all 5 workspace packages
- [ ] `pnpm lint` passes with zero errors/warnings

---

## Appendix A: Code Patterns to Follow

| Pattern | Reference File | What to Copy |
|---------|---------------|-------------|
| Interface method addition | `packages/shared/src/data/database/DatabaseConnection.ts` | Same JSDoc style; `@returns`, `@throws` |
| DI wiring for new instance | `apps/electron/src/di.ts:109` (`new ElectronAuthProvider(...)`) | `console.debug` before/after; construction order comment |
| `setCallback` pattern | `packages/platform/src/shared/NetworkMonitor.ts:onStatusChange()` | Replace callback reference; keep idempotent |
| Zustand store action | `packages/renderer/src/components/useSearchFilterStore.ts` | Side-effect-free `set()` calls |
| Test mock factory | `packages/shared/src/application/sync/__tests__/DirtyStateTracker.test.ts` | `createMockDb()` pattern; `beforeEach` re-creates |
| Export type from domain | `packages/shared/src/domain/interfaces/index.ts` | `export type { NetworkMonitorInterface } from './NetworkMonitorInterface.js'` |

## Appendix B: DI Construction Order (Updated for Fixes)

```
 1. StorageProvider          (E-04)
 2. DatabaseConnection       (E-02) → open()
 3. CryptoProvider           (E-03)
 4. AuthProvider             (E-04)
 5. TokenRefresher           (E-04)
 6. DriveMetadataTracker     (E-09)
 7. CloudStorageProvider     (E-09)    ← GoogleDriveProvider
 8. MigrationRunner          (E-02) → run()
 9. EncryptedFileFormat      (E-03)
10. AppMetadataRepository    (E-02)
11. SyncLogRepository        (E-02)
12. DeviceRepository         (E-02)
13. AppSettingsRepository    (E-02)
14. DirtyStateTracker        (E-10 B1)
15. SyncTimer                (E-10 B1) ← constructed with empty callback
16. SyncLock                 (E-10 B1)
17. NetworkMonitor           (E-10 B1) ← NEW — real instance
18. ChangeTracker            (E-10 B2) ← no shared cache
19. ConflictResolver         (E-10 B2)
20. SyncEngine               (E-10 B3) ← receives real NetworkMonitor
21. SyncEngine.initialize()            ← binds timer callback, wires store, calls execute() if needed
22. Wire lifecycle hooks               ← Electron: before-quit; Capacitor: appStateChange
```

## Appendix C: Why Not Add `openInMemoryDb` to `DatabaseConnection` Interface

The `openInMemoryDb(bytes)` operation is fundamentally different from `open(path)`:
- `open(path)` connects to a filesystem SQLite file
- `openInMemoryDb(bytes)` creates a new in-memory DB from raw bytes

The `DatabaseConnection` interface only has `open(path)`. Adding `openInMemoryDb(bytes)` would require every existing mock and connection class to implement it, with Electron and Capacitor having completely different implementations. For V1, injecting `openInMemoryDb` as a callback into `SyncEngine` is the simpler approach:
- Electron DI: `async (bytes: Uint8Array) => new BetterSqlite3Connection(bytes.buffer)`
- Capacitor DI: `async (bytes: Uint8Array) => { /* create in-memory DB, populate from bytes */ }`

This keeps the `DatabaseConnection` interface minimal and delegates the platform-specific complexity to the DI layer.

## Appendix D: `serialize()` vs `serializeDb()` Callback

After adding `serialize()` to `DatabaseConnection`, the `serializeDb` callback in DI files becomes a one-liner:
```typescript
{
  serializeDb: async (db: DatabaseConnection) => await db.serialize(),
}
```

The `SyncEngine` can call `this.db.serialize()` directly. However, the callback approach is retained for V1 because:
1. The `openInMemoryDb` callback is required anyway (no interface method for it)
2. Keeping both as callbacks maintains symmetry in the constructor
3. If `serialize()` needs different behavior per call context in V2, the callback can be adapted without changing the SyncEngine
