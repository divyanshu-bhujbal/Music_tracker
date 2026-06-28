# E-10 Batch 3 — Sync Engine Orchestrator & Store (SyncEngine, useSyncStore)

> **Epic:** E-10_SYNC_ENGINE.md | **Phase:** 3 | **Batch:** 3 of 3
> **Depends On:** E-10 Batch 1 (DirtyStateTracker, SyncTimer, SyncLock, NetworkMonitor), E-10 Batch 2 (ChangeTracker, ConflictResolver), E-09 (CloudStorageProvider), E-03 (CryptoProvider, EncryptedFileFormat), E-02 (repositories)
> **Blocks:** E-13 (Backup)
> **Date:** 2026-06-28

---

## 1. Goal

Implement the `SyncEngine` orchestrator that wires together all Batch 1 and Batch 2 components into the 14-step sync algorithm. Also implement `useSyncStore`, a Zustand store managing the sync state machine for the UI (sidebar, progress indicators).

This is the final batch of the sync engine. When complete, the application can perform full offline-first sync with LWW conflict resolution.

## 2. Scope

- **T-10.8**: `SyncEngine` — 14-step sync algorithm orchestrator
- **T-10.9**: Startup sync — integrated into `SyncEngine.initialize()` (checks `sync_on_startup`, `isDirty`, `isOnline`)
- **T-10.10**: Shutdown sync — integrated into `SyncEngine.syncOnShutdown()` (expedited sync attempt if dirty)
- **T-10.13**: Failure handling — integrated into `SyncEngine.execute()` (sync log on failure, state transitions, exponential backoff for repeated failures)
- **T-10.11**: `useSyncStore` — Zustand store with sync state, dirty flag, pending count, last sync time, actions
- **T-10.15**: Full sync cycle integration tests — mock `CloudStorageProvider` + `CryptoProvider`; verify end-to-end
- Wire `SyncEngine` into both DI files and app entry points

## 3. Out of Scope

- Manual sync trigger UI (sidebar sync button) — E-15 UI Shell wires `useSyncStore.triggerSync()` to button click
- Pull-to-refresh on Android — Capacitor-specific gesture; out of scope for sync engine
- Conflict resolution UI (surfacing conflict log) — V1 resolves silently via LWW; `sync_log` stores details for future UI
- Backup/restore — E-13
- Settings UI for sync preferences — E-14
- Repeated sync failure backoff at global level — handled by `SyncTimer` + `NetworkMonitor`; exponential backoff for repeated failures is in §14.1

## 4. Files To Create

| # | File | Task | Package |
|---|------|------|---------|
| 1 | `packages/shared/src/application/sync/SyncEngine.ts` | T-10.8, T-10.9, T-10.10, T-10.13 | `@collectio/shared` |
| 2 | `packages/shared/src/application/sync/useSyncStore.ts` | T-10.11 | `@collectio/shared` |
| 3 | `packages/shared/src/application/sync/__tests__/SyncEngine.test.ts` | T-10.15 | `@collectio/shared` |
| 4 | `packages/shared/src/application/sync/__tests__/useSyncStore.test.ts` | T-10.11 tests | `@collectio/shared` |

## 5. Files To Modify

| # | File | Change |
|---|------|--------|
| 1 | `packages/shared/src/application/sync/index.ts` | Add `export { SyncEngine }` and `export { useSyncStore }` |
| 2 | `packages/shared/src/application/index.ts` | Add re-exports for `SyncEngine` and `useSyncStore` |
| 3 | `packages/shared/src/index.ts` | Re-export `SyncEngine`, `useSyncStore`, and sync state types needed by renderer |
| 4 | `apps/electron/src/di.ts` | Instantiate `SyncEngine` + all sub-components; add `syncEngine` to `ServiceProvider` (or pass separately); call `syncEngine.initialize()` after construction; wire `syncOnShutdown()` to `app.on('before-quit')` |
| 5 | `apps/capacitor/src/di.ts` | Same as Electron; wire `syncOnShutdown()` to Capacitor lifecycle |
| 6 | `packages/shared/src/application/ServiceProvider.ts` | Optionally add `syncEngine?: SyncEngine` field if needed by renderer (see §7) |

## 6. File Specifications

### 6.1 `SyncEngine.ts`

**Purpose:** Orchestrate the complete 14-step sync algorithm as defined in 03_SYNC_STATE_MACHINE.md §6. Manage the sync lifecycle: startup check, auto-sync timer coordination, manual trigger, shutdown sync, and failure recovery.

**Responsibility:**
- Execute the 14-step sync algorithm atomically (all-or-nothing)
- Coordinate sub-components: lock → log → download → decrypt → identify changes → merge → build merged DB → encrypt → upload → log success → unlock
- On step failure: abort, log failure, revert state, release lock
- On step 12 (upload) failure: revert `last_successful_sync`, discard merged copy
- Initialize the sync system at app startup: register device, check dirty, start auto-sync timer, bind network events
- Handle runtime events: write notifications (reset timer), online/offline transitions, manual sync requests

**Public API:**

| Method | Returns | Purpose |
|--------|---------|---------|
| `initialize()` | `Promise<void>` | Called once at app startup. Registers device if needed, reads settings, checks dirty state, starts sync timer, binds network events, conditionally performs startup sync. |
| `execute()` | `Promise<SyncResult>` | Execute the full 14-step sync algorithm. Acquires lock, runs all steps, logs to sync_log, releases lock. Throws if lock cannot be acquired. Returns detailed result. |
| `syncOnShutdown()` | `Promise<void>` | Expedited sync on app close. Only attempts if dirty + online. Does NOT skip on failure — dirty state persists for next startup. Returns immediately if not dirty or offline. |
| `triggerManualSync()` | `Promise<void>` | Cancel inactivity timer, attempt sync immediately. Updates `useSyncStore` with SYNCING state. |
| `onWrite()` | `void` | Called by repository layer whenever an entity is created/updated/deleted. Resets inactivity timer. Sets dirty state in store. |
| `getState()` | `SyncEngineState` | Returns current internal state snapshot (dirty, lastSync, pendingCount, timerRunning, online). |
| `destroy()` | `void` | Cleanup: cancel timer, remove network listener. Call on app shutdown. |

**SyncResult type:**

```typescript
interface SyncResult {
  success: boolean;
  recordsAffected: number;
  conflictsResolved: number;
  newLocalOnly: number;
  newRemoteOnly: number;
  orphansResolved: number;
  errorMessage?: string;        // Set only on failure
  errorCode?: string;           // CloudStorageErrorCode or 'DECRYPT_FAILED' or 'LOCK_BUSY' or 'MERGE_FAILED' or 'ENCRYPT_FAILED'
  lastSyncTime: string | null;  // New last_successful_sync timestamp on success
}
```

**Constructor dependencies** (injected via constructor — no service locator):

```
constructor(
  db: DatabaseConnection,              // Local SQLite DB
  cryptoProvider: CryptoProvider,      // Argon2id + AES-GCM
  cloudStorageProvider: CloudStorageProvider,  // Google Drive
  encryptedFileFormat: EncryptedFileFormat,    // pack/unpack
  dirtyStateTracker: DirtyStateTracker,        // Batch 1
  syncTimer: SyncTimer,                        // Batch 1
  syncLock: SyncLock,                          // Batch 1
  changeTracker: ChangeTracker,                // Batch 2
  conflictResolver: ConflictResolver,          // Batch 2
  networkMonitor: NetworkMonitor,              // Batch 1 (platform/shared)
  appMetadataRepo: AppMetadataRepository,      // E-02
  syncLogRepo: SyncLogRepository,              // E-02
  deviceRepo: DeviceRepository,                // E-02
  appSettingsRepo: AppSettingsRepository,      // E-02
)
```

**14-Step Algorithm Implementation** (`execute()` method):

```
async execute(): Promise<SyncResult> {
  // STEP 1: Acquire lock
  if (!this.syncLock.acquire()) {
    return { success: false, errorCode: 'LOCK_BUSY', ... };
  }
  
  let syncLogId: number | null = null;
  let previousLastSync: string | null = null;
  
  try {
    // Read device ID
    const deviceId = await this.getDeviceId();
    
    // STEP 2: Create sync_log entry (IN_PROGRESS)
    const syncLog = await this.syncLogRepo.create({ device_id: deviceId, direction: 'MERGE' });
    syncLogId = syncLog.id;
    
    // STEP 3: Download cloud DB
    // Get cloud file ID; if no cloud backup, skip download (treat as first sync)
    const cloudFileId = await this.appMetadataRepo.get('cloud_file_id');
    let cloudData: Uint8Array | null = null;
    let cloudModifiedTime: string | null = null;
    
    if (cloudFileId) {
      const downloadResult = await this.cloudStorageProvider.download(cloudFileId);
      cloudData = downloadResult.data;
      cloudModifiedTime = downloadResult.modifiedTime;
    }
    
    // STEP 4: Decrypt cloud DB to in-memory SQLite (only if cloud data exists)
    let cloudInMemoryDb: DatabaseConnection | null = null;
    let kdfSalt: Uint8Array | null = null;
    
    if (cloudData) {
      // Get or create KDF salt + derived key
      const saltHex = await this.appMetadataRepo.get('kdf_salt');
      // ... derive key from salt + stored password hash ...
      // This is simplified — actual key derivation via SecureStorageProvider
      const { database: cloudDbBytes, salt } = await this.encryptedFileFormat.unpack(cloudData, derivedKey);
      kdfSalt = salt;
      
      // Open in-memory SQLite with cloud DB bytes
      cloudInMemoryDb = await this.openInMemoryDb(cloudDbBytes);
    }
    
    // STEP 5: Get last_successful_sync
    previousLastSync = await this.appMetadataRepo.get('last_successful_sync');
    const lastSyncTime = previousLastSync ?? null;
    
    // STEP 6: Identify local changes
    const localChanges = await this.changeTracker.getLocalChanges(lastSyncTime);
    
    // STEP 7: Identify remote changes
    let remoteChanges: ChangeSet = new Map();
    if (cloudInMemoryDb) {
      remoteChanges = await this.changeTracker.getRemoteChanges(cloudInMemoryDb, lastSyncTime);
    }
    
    // STEP 8: LWW Merge
    const mergeResult = this.conflictResolver.resolve(localChanges, remoteChanges);
    
    // STEP 9: Build merged database (apply winners to local DB copy)
    // Create in-memory copy of local DB
    const mergedDb = await this.createMergedDb(mergeResult.winners, lastSyncTime);
    
    // STEP 10: Update last_successful_sync in merged copy
    const now = new Date().toISOString();
    // ... write to merged copy's app_metadata ...
    
    // STEP 11: Encrypt merged database
    const kdfSaltBytes = kdfSalt ?? /* read from local app_metadata */;
    const mergedDbBytes = await this.serializeDb(mergedDb);
    const encryptedBytes = await this.encryptedFileFormat.pack(mergedDbBytes, derivedKey, kdfSaltBytes);
    
    // STEP 12: Upload
    await this.cloudStorageProvider.upload(encryptedBytes, 'collectio.db');
    
    // On success: apply winners to live local DB
    await this.applyWinnersToLive(mergeResult.winners, now);
    
    // STEP 12b: Resolve orphaned FKs on live DB
    const orphanReport = await this.conflictResolver.resolveOrphans(this.db);
    
    // STEP 13: Update sync_log with SUCCESS
    await this.syncLogRepo.markCompleted(
      syncLogId,
      'SUCCESS',
      mergeResult.totalRecordsAffected + orphanReport.orphansFound,
    );
    
    // STEP 14: Release lock
    this.syncLock.release();
    
    return {
      success: true,
      recordsAffected: mergeResult.totalRecordsAffected,
      conflictsResolved: mergeResult.conflictsResolved,
      newLocalOnly: mergeResult.newLocalOnly,
      newRemoteOnly: mergeResult.newRemoteOnly,
      orphansResolved: orphanReport.orphansFound,
      lastSyncTime: now,
    };
    
  } catch (error) {
    // Handle failure
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = determineErrorCode(error);
    
    // If upload failed (step 12) → revert last_successful_sync
    if (errorCode === 'UPLOAD_FAILED' || errorCode === 'NETWORK' || errorCode === 'RATE_LIMITED' || errorCode === 'SERVER_ERROR') {
      if (previousLastSync !== null) {
        await this.appMetadataRepo.set('last_successful_sync', previousLastSync);
      }
    }
    
    // Log failure
    if (syncLogId !== null) {
      await this.syncLogRepo.markCompleted(syncLogId, 'FAILURE', 0, errorMessage);
    }
    
    // Always release lock
    this.syncLock.release();
    
    return { success: false, errorCode, errorMessage, recordsAffected: 0, conflictsResolved: 0, newLocalOnly: 0, newRemoteOnly: 0, orphansResolved: 0, lastSyncTime: previousLastSync };
  }
}
```

**Startup Sync** (`initialize()` method, T-10.9):

1. Register current device if not registered (check `device_id` in `app_metadata`)
2. Create `DeviceRepository.register()` if needed; store device_id
3. Read `sync_on_startup` from `app_settings` (default: `true`)
4. Read `auto_sync_delay_seconds` from `app_settings` (default: `120`)
5. Configure `SyncTimer` with delay from settings
6. Read `last_successful_sync` from `app_metadata`
7. Initialize current dirty/pending state via `dirtyStateTracker`
8. Update `useSyncStore` with initial state
9. Bind `networkMonitor.onStatusChange()` callback:
   - Offline → set store to `OFFLINE`, pause timer
   - Online → set store to `IDLE`, resume timer, trigger 10s debounced auto-sync if dirty
10. Bind `syncTimer.onExpiry` callback:
    - Check `isDirty` && `isOnline`
    - If yes → execute sync; if no → do nothing
11. If `sync_on_startup` is `true` and `dirty` and `online` and cloud DB exists:
    - Execute startup sync
    - On success → update store
    - On failure → set store to `WARNING`, app continues normally
12. If `sync_on_startup` is `true` and `not dirty`:
    - Skip sync, set store to `IDLE (clean)`
13. If offline at startup:
    - Set store to `OFFLINE`, skip sync

**Shutdown Sync** (`syncOnShutdown()` method, T-10.10):

1. Check `isDirty` via `dirtyStateTracker`
2. If not dirty → return immediately
3. Check `isOnline` via `networkMonitor`
4. If not online → return (dirty state persists for next startup)
5. Execute sync (call `execute()`)
6. Do NOT wait indefinitely — timeout at 30 seconds
7. On success → clean shutdown
8. On failure/timeout → dirty state persists; caught on next startup sync

**Failure Handling** (T-10.13):

1. All failures are logged to `sync_log` with error_message
2. After failure: `useSyncStore` transitions to `WARNING` state
3. Store retains `errorMessage` for display
4. Next auto-sync cycle or manual sync will retry
5. Repeated failures: `SyncEngine` tracks consecutive failure count
   - After 3 consecutive failures → exponentially increase auto-sync interval (5min, 10min, 30min, 1hr, 4hr, 12hr...)
   - Success resets failure count
6. Decryption failure (wrong password or corruption) → `ALERT` state
7. `NOT_AUTHENTICATED` error → `ALERT` state (user must re-authenticate)

**Auto-Sync Trigger Flow:**

```
onWrite() called by repository
  │
  ├─ dirtyStateTracker checks dirty (call isDirty)
  ├─ useSyncStore.setDirty(true, pendingCount)
  ├─ syncTimer.reset()  // restart 120s countdown
  │
  ▼
[Timer expires]
  │
  ├─ isDirty? → yes
  ├─ isOnline? → yes
  ├─ useSyncStore.setSyncState('SYNCING')
  ├─ execute()
  ├─ success → useSyncStore.setSyncState('IDLE'), update lastSyncTime
  └─ failure → useSyncStore.setSyncState('WARNING'), set errorMessage

[Network transitions offline→online]
  │
  ├─ useSyncStore.setOnline(true)
  ├─ isDirty?
  ├─ 10-second debounce
  └─ execute()  (auto-sync)
```

**Source of truth:** 03_SYNC_STATE_MACHINE.md §2, §5, §6, §8, §9, §10, §12.

---

### 6.2 `useSyncStore.ts`

**Purpose:** Single Zustand store managing sync state for the entire application. Consumed by the sidebar `SyncStatusPanel`, the sync button, and the startup screen. The store reflects the state machine from 03_SYNC_STATE_MACHINE.md §2.

**Responsibility:**
- Hold sync state: `IDLE | DIRTY | SYNCING | WARNING | ALERT | OFFLINE`
- Hold dirty flag, pending change count, last sync time, error message
- Expose actions: `triggerSync`, `skipSync`, `setSyncState`, `setDirty`, `setOnline`
- Provide selector hooks for individual properties (follows existing Zustand pattern from `useSearchFilterStore`)

**State shape:**

```typescript
type SyncState = 'IDLE' | 'DIRTY' | 'SYNCING' | 'WARNING' | 'ALERT' | 'OFFLINE';

interface SyncStoreState {
  // Readable state
  syncState: SyncState;
  isDirty: boolean;
  pendingCount: number;
  lastSyncTime: string | null;    // ISO-8601 or null if never synced
  errorMessage: string | null;    // Set on WARNING/ALERT states
  isOnline: boolean;
  
  // Actions
  setSyncState: (state: SyncState) => void;
  setDirty: (dirty: boolean, pendingCount?: number) => void;
  setOnline: (online: boolean) => void;
  setLastSyncTime: (time: string) => void;
  setError: (message: string | null) => void;
  triggerSync: () => void;        // Called by sidebar sync button
  skipSync: () => void;           // Called by startup "Skip" button
  reset: () => void;              // Reset to initial state
}
```

**Module-level singleton** — created via `create<SyncStoreState>()` from Zustand. Same pattern as `useSearchFilterStore.ts`. No props, no context needed.

**State transitions** (matching 03_SYNC_STATE_MACHINE.md §2 diagram):

| Current State | Event | New State |
|--------------|-------|-----------|
| IDLE (clean) | Write occurs | DIRTY |
| IDLE (dirty) | Write occurs | DIRTY (timer reset) |
| DIRTY | Timer expires, dirty, online | SYNCING |
| DIRTY | Timer expires, dirty, offline | DIRTY (timer paused) |
| DIRTY | Manual sync triggered | SYNCING |
| IDLE/DIRTY | Network goes offline | OFFLINE |
| SYNCING | Sync succeeds | IDLE (clean) |
| SYNCING | Sync fails (network/server) | WARNING |
| SYNCING | Sync fails (decrypt/auth) | ALERT |
| WARNING | Next sync succeeds | IDLE (clean) |
| WARNING | Write occurs | DIRTY |
| ALERT | After re-authentication | IDLE |
| OFFLINE | Network goes online, dirty | DIRTY |
| OFFLINE | Network goes online, clean | IDLE |

**Selector hooks** (following `useSearchFilterStore` pattern):

```typescript
export const useSyncStore = create<SyncStoreState>(...);

// Selector hooks
export function useSyncState(): SyncState;
export function useSyncPendingCount(): number;
export function useSyncLastSyncTime(): string | null;
export function useSyncIsOnline(): boolean;
export function useSyncError(): string | null;
```

**`triggerSync()` implementation:**
- Sets state to `SYNCING`
- Cancels the inactivity timer
- Calls `SyncEngine.execute()` — this is the binding point
- On result: updates store state and stats

The store needs a reference to `SyncEngine` to call `execute()`. This can be done via:
- Injecting `SyncEngine` into the store at creation time
- Or having `SyncEngine` call store methods directly

**Design decision:** `SyncEngine` calls store methods directly (push model). The store's `triggerSync()` is a thin wrapper that delegates to the injected `SyncEngine` reference. This avoids circular imports (store doesn't import SyncEngine).

The store is created with an initially null `syncEngine` reference. During `SyncEngine.initialize()`, `SyncEngine` calls `useSyncStore.getState().setSyncEngine(this)`. This is the same pattern used by Zustand stores that need an external API.

**Source of truth:** 03_SYNC_STATE_MACHINE.md §2 (State Machine), §3 (Dirty State), §5 (Trigger Sources).

---

## 7. Interfaces / Type Exports

No new domain interfaces. The following types are exported:

| Type | Export From | Used By |
|------|------------|---------|
| `SyncState` | `useSyncStore.ts` | Renderer (sidebar, sync button, startup screen) |
| `SyncResult` | `SyncEngine.ts` | `useSyncStore`, DI files |
| `SyncStoreState` | `useSyncStore.ts` | Renderer components |

**ServiceProvider modification:**
The `ServiceProvider` interface already exists at `packages/shared/src/application/ServiceProvider.ts`. For E-10, the `SyncEngine` does NOT need to be added to `ServiceProvider`. It is instantiated in the DI files after all providers are created, then wired to `useSyncStore` and the app lifecycle. The renderer accesses sync state via `useSyncStore` Zustand hooks, not via `ServiceProvider`.

## 8. Data Flow

### 8.1 App Startup Flow

```
App entry point (main.ts / index.tsx)
  │
  ├─ DI: createServices() → { db, cryptoProvider, cloudStorageProvider, ... }
  │
  ├─ DI: create SyncEngine with all deps
  │   new SyncEngine(db, cryptoProvider, cloudStorageProvider, encryptedFileFormat,
  │                  dirtyStateTracker, syncTimer, syncLock,
  │                  changeTracker, conflictResolver,
  │                  networkMonitor, appMetadataRepo, syncLogRepo, deviceRepo, appSettingsRepo)
  │
  ├─ DI: call syncEngine.initialize()
  │   ├─ Register device (if first launch)
  │   ├─ Read settings (sync_on_startup, auto_sync_delay_seconds)
  │   ├─ Configure syncTimer delay
  │   ├─ Check dirty state → update useSyncStore
  │   ├─ Bind networkMonitor.onStatusChange()
  │   ├─ If sync_on_startup && dirty && online → execute startup sync
  │   └─ If offline → set OFFLINE state
  │
  ├─ DI: Wire lifecycle hooks
  │   Electron: app.on('before-quit', () => syncEngine.syncOnShutdown())
  │   Capacitor: register shutdown handler
  │
  └─ Renderer mounts → reads useSyncStore for sidebar state
```

### 8.2 Full Sync Cycle (14 Steps)

```
triggerSync() / auto-sync timer / startup sync
  │
  ▼
SyncEngine.execute()
  │
  ├─ [1] syncLock.acquire() — return LOCK_BUSY if held
  ├─ [2] syncLogRepo.create(MERGE, IN_PROGRESS) → syncLogId
  │
  ├─ [3] cloudStorageProvider.download(cloudFileId)
  │     └─ FAIL → abort, CloudStorageError → WARNING
  │
  ├─ [4] encryptedFileFormat.unpack(cloudData, key)
  │     └─ FAIL → abort, AuthenticationError → ALERT
  │     └─ Open in-memory DB from decrypted bytes
  │
  ├─ [5] appMetadataRepo.get('last_successful_sync')
  │
  ├─ [6] changeTracker.getLocalChanges(lastSyncTime)
  ├─ [7] changeTracker.getRemoteChanges(cloudInMemoryDb, lastSyncTime)
  │
  ├─ [8] conflictResolver.resolve(local, remote) → MergeResult
  │
  ├─ [9] Build merged DB copy + apply winners
  │     └─ FAIL → abort, MERGE_FAILED
  │
  ├─ [9b] conflictResolver.resolveOrphans(mergedDb) → OrphanReport
  │
  ├─ [10] UPDATE last_successful_sync = NOW() (in merged copy)
  │
  ├─ [11] encryptedFileFormat.pack(mergedDbBytes, key, salt)
  │     └─ FAIL → abort, ENCRYPT_FAILED
  │
  ├─ [12] cloudStorageProvider.upload(encrypted, 'collectio.db')
  │     └─ FAIL → revert last_sync, discard copy, UPLOAD_FAILED
  │
  ├─ [12b] Apply winners + orphans to LIVE local DB
  │
  ├─ [13] syncLogRepo.markCompleted(syncLogId, SUCCESS)
  │
  ├─ [14] syncLock.release()
  │
  └─ Return SyncResult { success: true, ... }
  │
  └─ useSyncStore → setSyncState('IDLE'), setLastSyncTime(now), setDirty(false)
```

### 8.3 Write Event Flow

```
User creates/edits/deletes a song (any repository mutation)
  │
  ▼
Repository calls syncEngine.onWrite()
  │
  ├─ dirtyStateTracker.isDirty() → true (computed)
  ├─ dirtyStateTracker.getPendingCount() → n
  ├─ useSyncStore.setDirty(true, n)
  ├─ useSyncStore.setSyncState('DIRTY')
  └─ syncTimer.reset()
```

## 9. State Changes

### 9.1 `app_metadata` Changes

| Operation | Key | Change |
|-----------|-----|--------|
| SyncEngine.initialize() (first launch) | `device_id` | Set to UUID v4 |
| SyncEngine.execute() step 10 | `last_successful_sync` | Set to ISO-8601 now |
| SyncEngine.execute() step 12 (upload) | `cloud_file_id` | Set via `DriveMetadataTracker` (GoogleDriveProvider handles) |
| SyncEngine.execute() step 12 (upload) | `cloud_modified_time` | Set via `DriveMetadataTracker` |
| Upload failure (step 12 revert) | `last_successful_sync` | Reverted to previous value |
| First sync (no cloud DB) | `cloud_file_id` | Created by upload |
| Decryption failure | _(none)_ | No write; ALERT state in store |

### 9.2 `sync_log` Changes

| Operation | Fields |
|-----------|--------|
| Step 2 | INSERT: `IN_PROGRESS`, `direction=MERGE`, `started_at=NOW()`, device_id |
| Step 13 (success) | UPDATE: `SUCCESS`, `completed_at=NOW()`, `records_affected=N` |
| Failure (any step) | UPDATE: `FAILURE`, `completed_at=NOW()`, `error_message=reason` |

### 9.3 `devices` Changes

| Operation | Fields |
|-----------|--------|
| First launch | INSERT: UUID, name, platform, registered_at |
| Each successful sync | UPDATE: `last_seen_at` |

### 9.4 `useSyncStore` (in-memory Zustand)

| Event | State Change |
|-------|-------------|
| Write occurs | `syncState='DIRTY'`, `isDirty=true`, `pendingCount++` |
| Timer expiration | `syncState='SYNCING'` |
| Sync success | `syncState='IDLE'`, `isDirty=false`, `pendingCount=0`, `lastSyncTime=now`, `errorMessage=null` |
| Sync network/server failure | `syncState='WARNING'`, `errorMessage=reason`, `isDirty` unchanged |
| Sync decrypt/auth failure | `syncState='ALERT'`, `errorMessage=reason` |
| Network goes offline | `syncState='OFFLINE'`, `isOnline=false` |
| Network returns online | `syncState='IDLE'` (or `DIRTY` if dirty), `isOnline=true` |

## 10. Database Changes

**None.** No schema migrations, no new tables. `SyncEngine` reads/writes existing tables (`app_metadata`, `sync_log`, `devices`, entity tables) via repository classes.

## 11. Error Handling

| Scenario | Detection | SyncEngine Response | Store State | Retry |
|----------|-----------|--------------------|------------|-------|
| Lock busy (sync already in progress) | `syncLock.acquire()` returns `false` | Return `{ success: false, errorCode: 'LOCK_BUSY' }` immediately | Unchanged | N/A (already syncing) |
| No cloud DB exists (first sync) | `cloud_file_id` is null | Skip download (step 3); upload creates first DB | Normal flow | N/A |
| Download fails (network/server/rate/not found) | `CloudStorageError` from `download()` | Abort; log failure; release lock | `WARNING` | Yes (auto-sync or manual) |
| Decryption fails (wrong key/corruption) | `AuthenticationError` or `FormatError` from `unpack()` | Abort; log failure; do NOT upload | `ALERT` | No (requires re-auth) |
| Merge fails | Exception in `conflictResolver.resolve()` | Abort; log failure | `WARNING` | Yes |
| Encrypt fails | Exception in `encryptedFileFormat.pack()` | Abort; log failure | `WARNING` | Yes |
| Upload fails (step 12) | `CloudStorageError` from `upload()` | Revert `last_successful_sync`; log failure; discard merged copy | `WARNING` | Yes |
| Upload success, log update fails | Exception in `syncLogRepo.markCompleted()` | Caught; logged to console; does NOT revert sync | N/A (data was synced) | N/A |
| Repeated failures (consecutive) | `failureCount >= 3` | Increase auto-sync interval exponentially (5min → 10min → 30min → 1hr → 4hr → 12hr → 24hr) | `WARNING` | Delayed auto-sync |
| Shutdown sync timeout | 30s timeout in `syncOnShutdown()` | Return; dirty state persists | Unchanged | Next startup sync |

**Error code mapping:**

```typescript
function determineErrorCode(error: unknown): string {
  if (error instanceof CloudStorageError) return error.code;
  if (error instanceof AuthenticationError) return 'DECRYPT_FAILED';
  if (error instanceof FormatError) return 'DECRYPT_FAILED';
  if (error instanceof VersionError) return 'DECRYPT_FAILED';
  if (error instanceof DatabaseError) return 'MERGE_FAILED';
  return 'UNKNOWN';
}
```

## 12. Logging Requirements

| Event | Level | Message Pattern |
|-------|-------|----------------|
| Device registered (first launch) | `info` | `SyncEngine: device registered — ${deviceId}` |
| Initialize started | `info` | `SyncEngine: initializing — sync_on_startup=${bool}, delay=${s}s, dirty=${bool}, online=${bool}` |
| Initialize complete (no sync needed) | `info` | `SyncEngine: initialized — state=${state}` |
| Startup sync started | `info` | `SyncEngine: startup sync starting` |
| Startup sync skipped (user) | `info` | `SyncEngine: startup sync skipped by user` |
| Sync started (auto/manual/shutdown) | `info` | `SyncEngine: sync started (trigger=${auto|manual|startup|shutdown})` |
| Sync step started | `debug` | `SyncEngine: step ${n}/14 — ${description}` |
| Sync step failed | `warn` | `SyncEngine: step ${n} failed — ${errorCode}: ${message}` |
| Sync complete (success) | `info` | `SyncEngine: sync complete — ${recordsAffected} records, ${conflicts} conflicts, ${orphans} orphans` |
| Sync complete (failure) | `warn` | `SyncEngine: sync failed after ${step} — ${errorCode}: ${message}` |
| Upload revert | `warn` | `SyncEngine: upload failed — reverting last_successful_sync to ${previous}` |
| Shutdown sync triggered | `info` | `SyncEngine: shutdown sync — dirty=${bool}, online=${bool}` |
| Shutdown sync skipped (no changes) | `debug` | `SyncEngine: shutdown sync skipped — not dirty` |
| Shutdown sync timeout | `warn` | `SyncEngine: shutdown sync timed out after 30s` |
| Network status change | `debug` | `SyncEngine: network ${online|offline}` |
| Write notification | `debug` | `SyncEngine: write detected — resetting timer` |
| Auto-sync interval increased | `warn` | `SyncEngine: consecutive failure ${n} — auto-sync interval increased to ${interval}` |
| Auto-sync interval reset | `info` | `SyncEngine: sync succeeded — auto-sync interval reset` |

## 13. Security Requirements

| Requirement | Implementation |
|-------------|---------------|
| Master password never stored (Rule 12.1, NFR-SEC-01) | `SyncEngine` does not handle the master password. It receives the pre-derived AES key or derives it via `SecureStorageProvider` retrieval. |
| Derived key in platform secure storage (NFR-SEC-02) | `SyncEngine` reads the derived key from `SecureStorageProvider` (indirectly via `CryptoProvider`/`EncryptedFileFormat`). Never stores key in plaintext code. |
| Never log secrets (Rule 12.2) | `SyncEngine` logs only operational metadata (device ID, record counts, timestamps). Never logs keys, tokens, or file contents. |
| Cloud DB encrypted before upload (NFR-SEC-03) | Steps 9→11 ensure the DB is encrypted via `EncryptedFileFormat.pack()` before `cloudStorageProvider.upload()`. |

## 14. Test Cases

### 14.1 SyncEngine Integration Tests

**File:** `packages/shared/src/application/sync/__tests__/SyncEngine.test.ts`

**Setup:** Create in-memory `DatabaseConnection` with full schema (all tables). Mock `CloudStorageProvider`, `CryptoProvider`, `EncryptedFileFormat`. Mock `NetworkMonitor` (default: online). Use real `DirtyStateTracker`, `ChangeTracker`, `ConflictResolver`, `SyncLock`, `SyncTimer` with fake timers. Provide mock repositories backed by the in-memory DB.

| ID | Test | Setup | Expected |
|----|------|-------|----------|
| SE-01 | Full sync cycle: local changes only → upload succeeds | Insert 3 songs locally; cloud DB has none | Upload called with encrypted bytes; last_successful_sync updated; sync_log marked SUCCESS; recordsAffected=3 |
| SE-02 | Full sync cycle: remote changes only → download + merge | Cloud DB has 2 new artists; local DB has none | Download called; 2 artists merged into local DB |
| SE-03 | Full sync cycle: both sides changed → LWW merge | Local song updated_at=T+10; remote same song updated_at=T | Local record wins; conflict count=1; total records affected correct |
| SE-04 | Upload failure → local DB unchanged | CloudStorageProvider.upload() throws CloudStorageError('NETWORK') | last_successful_sync reverted to previous; local DB unchanged; sync_log FAILURE |
| SE-05 | Decryption failure → ALERT state | EncryptedFileFormat.unpack() throws AuthenticationError | Store set to ALERT; sync_log FAILURE; no upload attempted |
| SE-06 | Lock busy → returns immediately | syncLock already held | execute() returns { success: false, errorCode: 'LOCK_BUSY' }; no sync_log created |
| SE-07 | First sync (no cloud DB) → upload creates first backup | cloud_file_id is null | Download step skipped; upload creates new file; cloud_file_id + cloud_modified_time set |
| SE-08 | Startup sync when dirty + online | isDirty=true, isOnline=true, sync_on_startup='true' | execute() called; on success → store IDLE(clean) |
| SE-09 | Startup sync skipped when not dirty | isDirty=false, isOnline=true, sync_on_startup='true' | execute() NOT called; store IDLE(clean) |
| SE-10 | Startup sync skipped when offline | isDirty=true, isOnline=false | execute() NOT called; store OFFLINE |
| SE-11 | Startup sync skipped by user (skipSync) | isDirty=true, isOnline=true | syncNotCalled; store OFFLINE |
| SE-12 | Shutdown sync when dirty + online | isDirty=true, isOnline=true | execute() called (non-blocking with timeout) |
| SE-13 | Shutdown sync skipped when not dirty | isDirty=false | execute() NOT called |
| SE-14 | Manual sync trigger cancels timer + syncs | Timer running; triggerManualSync() called | Timer cancelled; execute() called; store SYNCING then IDLE |
| SE-15 | Write notification resets timer | Timer counting down; onWrite() called | Timer.reset() called; store DIRTY |
| SE-16 | Offline → online transition triggers auto-sync (debounced) | isDirty=true; transition offline→online | 10s timer starts; after 10s → execute() called if still dirty |
| SE-17 | Repeated failures increase auto-sync interval | execute() fails 3 times consecutively | 4th auto-sync interval = 5 minutes (not default 120s) |
| SE-18 | Successful sync resets failure count + interval | 3 failures then 1 success | failureCount=0; interval restored to default |
| SE-19 | Sync orphaned FK during merge | Cloud has artist soft-deleted; local has song_artist referencing it | conflictResolver.resolveOrphans() called; orphaned junction rows deleted; orphansResolved > 0 |
| SE-20 | Device registered on first initialize | device_id is null in app_metadata | Device created in devices table; device_id stored in app_metadata |

### 14.2 useSyncStore Unit Tests

**File:** `packages/shared/src/application/sync/__tests__/useSyncStore.test.ts`

| ID | Test | Setup | Expected |
|----|------|-------|----------|
| US-01 | Initial state is IDLE, clean | Create store (no sync engine reference) | `syncState='IDLE'`, `isDirty=false`, `pendingCount=0`, `lastSyncTime=null` |
| US-02 | `setDirty(true, 5)` updates state | Call setDirty | `syncState='DIRTY'`, `isDirty=true`, `pendingCount=5` |
| US-03 | `setSyncState('SYNCING')` updates state | Call setSyncState | `syncState='SYNCING'` |
| US-04 | `setOnline(false)` sets offline | Call setOnline(false) | `syncState='OFFLINE'`, `isOnline=false` |
| US-05 | `setOnline(true)` restores IDLE when clean | OFFLINE, isDirty=false → setOnline(true) | `syncState='IDLE'`, `isOnline=true` |
| US-06 | `setOnline(true)` restores DIRTY when dirty | OFFLINE, isDirty=true → setOnline(true) | `syncState='DIRTY'`, `isOnline=true` |
| US-07 | `setError('msg')` sets errorMessage | Call setError | `errorMessage='msg'` |
| US-08 | `setLastSyncTime('2026-01-01T00:00:00Z')` stores | Call setLastSyncTime | `lastSyncTime='2026-01-01T00:00:00Z'` |
| US-09 | `skipSync()` returns to IDLE | Call skipSync from any state | `syncState` unchanged (function is a no-op on state; sync engine handles actual skip) |
| US-10 | `reset()` clears all state | Set various values, call reset | All values back to initial defaults |
| US-11 | Selector `useSyncState()` returns only state | Subscribe to selector | Only re-renders when syncState changes, not when other fields change |

## 15. Acceptance Criteria

1. `SyncEngine.execute()` successfully completes all 14 steps when all components are available
2. `SyncEngine.execute()` returns `LOCK_BUSY` when another sync is in progress
3. `SyncEngine.execute()` reverts `last_successful_sync` and does not modify local DB on upload failure (step 12)
4. `SyncEngine.execute()` sets `ALERT` state and does not upload on decryption failure (step 4)
5. `SyncEngine.initialize()` performs startup sync when `sync_on_startup=true`, dirty, and online
6. `SyncEngine.initialize()` skips startup sync when offline, not dirty, or user skips
7. `SyncEngine.syncOnShutdown()` attempts expedited sync if dirty + online; returns immediately otherwise
8. `SyncEngine.onWrite()` updates dirty state in store and resets timer
9. `SyncEngine` tracks consecutive failures and increases auto-sync interval exponentially
10. `SyncEngine` registers the device on first launch
11. `SyncEngine` updates `last_seen_at` on each successful sync
12. `useSyncStore` correctly reflects all 6 sync states (`IDLE`, `DIRTY`, `SYNCING`, `WARNING`, `ALERT`, `OFFLINE`)
13. `useSyncStore` provides selector hooks matching the pattern from `useSearchFilterStore`
14. `useSyncStore.triggerSync()` delegates to `SyncEngine.execute()`
15. All integration tests pass (`pnpm --filter @collectio/shared test`)
16. All unit tests for `useSyncStore` pass
17. `pnpm typecheck` passes with zero errors
18. `pnpm lint` passes with zero errors/warnings

## 16. Definition Of Done

- [ ] `SyncEngine.ts` created with full constructor injection of all 14 dependencies
- [ ] `SyncEngine.execute()` implements the 14-step algorithm per 03_SYNC_STATE_MACHINE.md §6
- [ ] `SyncEngine.initialize()` implements startup sync logic per 03_SYNC_STATE_MACHINE.md §8
- [ ] `SyncEngine.syncOnShutdown()` implements expedited sync per 03_SYNC_STATE_MACHINE.md §9
- [ ] `SyncEngine` handles all failure scenarios per 03_SYNC_STATE_MACHINE.md §12
- [ ] `SyncEngine` tracks consecutive failures and adjusts auto-sync interval
- [ ] `SyncEngine` reads `sync_on_startup` and `auto_sync_delay_seconds` from `app_settings`
- [ ] `SyncEngine` binds `networkMonitor.onStatusChange()` for online/offline transitions
- [ ] `SyncEngine` implements 10-second debounce on offline→online auto-sync trigger
- [ ] `SyncEngine` uses `conflictResolver.resolveOrphans()` after merge
- [ ] `useSyncStore.ts` created with Zustand `create<SyncStoreState>()`
- [ ] `useSyncStore` state shape matches the 6-state machine from 03_SYNC_STATE_MACHINE.md §2
- [ ] `useSyncStore` selector hooks exported: `useSyncState`, `useSyncPendingCount`, `useSyncLastSyncTime`, `useSyncIsOnline`, `useSyncError`
- [ ] Both DI files (`apps/electron/src/di.ts`, `apps/capacitor/src/di.ts`) create `SyncEngine` and call `initialize()`
- [ ] Electron DI wires `syncOnShutdown()` to `app.on('before-quit')`
- [ ] Capacitor DI wires `syncOnShutdown()` to platform lifecycle
- [ ] Integration test file created with all 20 test cases from §14.1
- [ ] Store unit test file created with all 11 test cases from §14.2
- [ ] All existing tests (Batch 1 + Batch 2) continue to pass
- [ ] `packages/shared/src/application/sync/index.ts` exports `SyncEngine` and `useSyncStore`
- [ ] `packages/shared/src/application/index.ts` re-exports sync module additions
- [ ] `packages/shared/src/index.ts` re-exports types needed by renderer
- [ ] TypeScript strict mode: zero errors
- [ ] ESLint: zero warnings

## Appendix A: Code Patterns to Follow

| Pattern | Reference File | What to Copy |
|---------|---------------|-------------|
| Constructor injection | `packages/platform/src/shared/GoogleDriveProvider.ts` | `private readonly` fields; no service locator |
| Async orchestrator | `packages/platform/src/shared/TokenRefresher.ts` | `try/catch/finally`; early returns on failure |
| Zustand store (module singleton) | `packages/renderer/src/components/useSearchFilterStore.ts` | `create<State>()` with actions; selector hooks below |
| Test setup (in-memory DB + mocks) | `packages/shared/src/application/sync/__tests__/ConflictResolver.test.ts` | `beforeEach` to create mock DB; `afterEach` to cleanup |
| Mock fixtures | `packages/platform/src/shared/__tests__/TokenRefresher.test.ts` | Helper functions for mock creation |
| DI wiring | `apps/electron/src/di.ts` | `console.debug` construction logs; explicit construction order |

## Appendix B: DI Construction Order (Batch 3 additions)

```
1. StorageProvider          (E-04)
2. DatabaseConnection       (E-02) → open()
3. CryptoProvider           (E-03)
4. AuthProvider             (E-04)
5. TokenRefresher           (E-04)
6. DriveMetadataTracker     (E-09)
7. CloudStorageProvider     (E-09)    ← GoogleDriveProvider
8. MigrationRunner          (E-02) → run()
9. DirtyStateTracker        (E-10 B1)
10. SyncTimer               (E-10 B1)
11. SyncLock                (E-10 B1)
12. NetworkMonitor          (E-10 B1)
13. ChangeTracker           (E-10 B2)
14. ConflictResolver        (E-10 B2)
15. EncryptedFileFormat     (E-03)
16. SyncEngine              (E-10 B3) ← NEW — construct LAST
17. SyncEngine.initialize()           ← NEW — call after construction
18. Wire lifecycle hooks              ← NEW — Electron: before-quit; Capacitor: appStateChange
```

## Appendix C: Encrypted File Format Serialization

The `SyncEngine` must serialize the merged in-memory database to `Uint8Array` bytes for encryption (step 9→11). This is platform-dependent.

**V1 approach:** The `SyncEngine` creates a temporary in-memory copy by:
1. Creating a second `DatabaseConnection` with `:memory:` database
2. Replicating the schema from the local DB (query `sqlite_master` for CREATE TABLE statements)
3. Copying all data (SELECT * → INSERT)
4. Applying winners via INSERT OR REPLACE
5. Updating last_successful_sync in the copy

**Serialization:** After building the merged copy, the `SyncEngine` needs the raw bytes. The `DatabaseConnection` interface must be extended with a `serialize()` method, OR the platform DI files must provide a serialization helper.

**Decision for V1:** Add `serialize(): Promise<Uint8Array>` to `DatabaseConnection` interface. This is a read-only operation that dumps the entire database to bytes without modifying it. Implementation:
- Electron (`better-sqlite3`): `db.serialize()` (available natively)
- Capacitor: `sqlite3_backup` via the plugin or `VACUUM INTO` equivalent

This is the simplest approach and avoids platform-specific code in `SyncEngine`. The `DatabaseConnection` interface modification must be done as part of this batch.

## Appendix D: Cloud DB Not Found (Empty Cloud)

When `cloud_file_id` is null (first sync, or cloud DB was deleted externally):

1. Step 3: skip download — no cloud bytes available
2. Step 4: skip decrypt — no cloud DB to decrypt
3. Step 7: `remoteChanges` = empty `ChangeSet` (no remote data)
4. Step 8: all local records become "local only" winners (newLocalOnly = all local records)
5. Steps 9-12: encrypt local DB and upload → creates first cloud backup
6. `cloud_file_id` and `cloud_modified_time` set by `GoogleDriveProvider.upload()` internally (via `DriveMetadataTracker`)

The `SyncEngine` does NOT special-case this — the 14-step algorithm handles it naturally because empty remote changes produce no merge conflicts.
