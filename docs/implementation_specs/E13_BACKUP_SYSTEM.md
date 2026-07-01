# E13: Backup System — Implementation Specification

> **Source epic:** [E-13_BACKUP.md](../epics/E-13_BACKUP.md) — tasks T-13.1 through T-13.4
> **Prerequisites:** E-10 (Sync Engine) — COMPLETE
> **Blocks:** E-16 (Testing & QA)
> **Platform impact:** NONE (pure TypeScript). Recovery restore step is Electron-only in V1 per AD-21 (Capacitor lacks native DB serialization).

---

## 1. Goal

Document the backup and recovery procedures, implement a standalone `DatabaseIntegrityCheck` utility for on-demand SQLite health checks, and implement a `RecoveryManager` that detects local database corruption and orchestrates recovery by downloading the encrypted cloud backup, decrypting it, verifying integrity, and replacing the local database file.

---

## 2. Scope

| Task | Summary | Status |
|------|---------|--------|
| T-13.1 | Document Google Drive version history backup mechanism and manual recovery procedures | **NEW** — `docs/BACKUP_RECOVERY.md` |
| T-13.2 | `DatabaseIntegrityCheck` — standalone utility running `PRAGMA integrity_check` + `PRAGMA foreign_key_check` | **NEW** — `packages/shared/src/data/database/` |
| T-13.3 | `RecoveryManager` — orchestrates: detect → download cloud backup → decrypt → verify → restore | **NEW** — `packages/shared/src/application/sync/` |
| T-13.4 | Recovery procedure verification | **NEW** — manual test checklist in `docs/BACKUP_RECOVERY.md` |

---

## 3. Out of Scope

- Automatic corruption detection (periodic health scans) — `DatabaseIntegrityCheck` is an on-demand utility; how/when it's called is deferred to E-14 (Settings) or E-15 (UI Shell)
- UI for triggering recovery — no button, no settings page, no progress indicator in this spec
- Replacement of corrupt database on Capacitor — AD-21 prevents writing raw SQLite bytes; Capacitor recovery is detection + documentation of manual steps only
- Cloud backup health verification (periodic cloud integrity check) — the cloud DB is validated only during recovery, not proactively
- Recovery of specific records (undo a bad edit) — that's trash/restore (E-12), not backup recovery
- Auto-purge of old Google Drive versions — Google manages version retention (up to 100 versions)
- Backup of non-database state (secure storage, settings files, localStorage) — V1 recovery only covers the SQLite database
- Cross-version recovery (cloud backup has newer schema than local app) — per 04_MIGRATION_STRATEGY.md §8, deferred to V2

---

## 4. Files To Create

| # | File | Package | Purpose | Type |
|---|------|---------|---------|------|
| 1 | `docs/BACKUP_RECOVERY.md` | `docs/` | User-facing documentation of Google Drive backup mechanism, recovery procedures, known limitations, and manual recovery checklist | Documentation |
| 2 | `packages/shared/src/data/database/DatabaseIntegrityCheck.ts` | `@collectio/shared` | Standalone class: runs `PRAGMA integrity_check` + `PRAGMA foreign_key_check`, returns structured health report | Pure TypeScript |
| 3 | `packages/shared/src/data/database/__tests__/DatabaseIntegrityCheck.test.ts` | `@collectio/shared` | Unit tests: healthy DB, corrupted DB, FK violations, edge cases | Jest test |
| 4 | `packages/shared/src/application/sync/RecoveryManager.ts` | `@collectio/shared` | Orchestrates: check integrity → download cloud backup → decrypt → verify → restore. Platform-agnostic via injected callbacks. | Pure TypeScript |
| 5 | `packages/shared/src/application/sync/__tests__/RecoveryManager.test.ts` | `@collectio/shared` | Unit/integration tests: successful recovery, corrupt cloud backup, no cloud backup, offline, missing key | Jest test |

---

## 5. Files To Modify

| # | File | Change | Package |
|---|------|--------|---------|
| 1 | `packages/shared/src/data/database/DatabaseConnection.ts` | Add **optional** `replaceWithBytes(bytes: Uint8Array): Promise<void>` method to the interface | `@collectio/shared` |
| 2 | `packages/shared/src/index.ts` | Add `export { DatabaseIntegrityCheck }` and `export { RecoveryManager }` and `export type { IntegrityReport, RecoveryResult, RecoveryStatus }` | `@collectio/shared` |
| 3 | `packages/shared/src/data/index.ts` (if barrel exists) | Add `export { DatabaseIntegrityCheck }` | `@collectio/shared` |
| 4 | `packages/platform/src/electron/BetterSqlite3Connection.ts` | Implement `replaceWithBytes()` — overwrite `.db` file on disk then re-initialize; also ensure existing `fromBuffer()` is accessible | `@collectio/platform` |
| 5 | `packages/platform/src/capacitor/CapacitorSqliteConnection.ts` | Implement `replaceWithBytes()` — throw `DatabaseError('not yet implemented')` per AD-21 / Rule 4.10 pattern | `@collectio/platform` |
| 6 | `apps/electron/src/di.ts` | Optionally construct and wire `RecoveryManager` (deferred to E-15 UI Shell for trigger; this spec only requires the class to exist) | `apps/electron` |
| 7 | `apps/capacitor/src/di.ts` | Optionally construct and wire `RecoveryManager` | `apps/capacitor` |

---

## 6. Interfaces

### 6.1 `DatabaseIntegrityCheck`

**Purpose:** Run SQLite health checks on demand and return a structured report. Does NOT depend on cloud or sync — pure local SQLite PRAGMAs.

**Constructor:**

```
constructor(db: DatabaseConnection)
```

**Public API:**

```
check(): Promise<IntegrityReport>
```

**`IntegrityReport` type:**

```
interface IntegrityReport {
  healthy: boolean;
  integrityResult: string;        // Raw PRAGMA integrity_check output (e.g., "ok" or error list)
  foreignKeyViolations: number;  // Count of rows returned by PRAGMA foreign_key_check
  foreignKeyDetails: string;     // JSON string of violation rows, or "" if none
  checkedAt: string;             // ISO-8601 timestamp of when the check ran
}
```

**Behavior:**

- Runs `PRAGMA integrity_check` via `db.query()`. If the first row's value is exactly `"ok"`, the database is structurally healthy.
- Any other value (e.g., `"row N missing from index idx_..."`) → `healthy: false`.
- Runs `PRAGMA foreign_key_check` via `db.query()`. Non-zero result rows → `foreignKeyViolations: count`, `healthy: false`.
- Both PRAGMAs are always executed — an early failure in integrity_check does not skip foreign_key_check.
- Catches and logs any unexpected errors (e.g., DB closed, connection error) → `healthy: false` with error message in `integrityResult`.

**Why standalone instead of reusing MigrationRunner:** MigrationRunner runs checks only at startup after migrations. DatabaseIntegrityCheck is callable on demand (e.g., from a Settings "Check Database Health" button, or from RecoveryManager before initiating recovery).

---

### 6.2 `RecoveryManager`

**Purpose:** Orchestrate the corruption recovery pipeline. Detects corruption, downloads and decrypts the cloud backup, validates it, and (on supported platforms) replaces the local database.

**Constructor:**

```
constructor(params: RecoveryManagerParams)
```

**`RecoveryManagerParams` type:**

```
interface RecoveryManagerParams {
  db: DatabaseConnection;                                      // Local DB connection
  integrityCheck: DatabaseIntegrityCheck;                      // To check local health
  cloudStorageProvider: CloudStorageProvider;                  // To download cloud backup
  encryptedFileFormat: EncryptedFileFormat;                    // To decrypt cloud backup
  appMetadataRepo: AppMetadataRepository;                      // To read cloud_file_id
  getDerivedKey: () => Promise<Uint8Array | null>;             // To obtain AES key
  openInMemoryDb: (bytes: Uint8Array) => Promise<DatabaseConnection>; // To validate decrypted backup
  replaceLocalDb: (bytes: Uint8Array) => Promise<void>;        // To overwrite local DB (platform-specific)
  isOnline: () => boolean;                                     // Network availability check
}
```

**Public API:**

```
recover(): Promise<RecoveryResult>
```

**`RecoveryResult` type:**

```
type RecoveryStatus = 'HEALTHY' | 'CORRUPT' | 'NO_CLOUD_BACKUP' | 'RECOVERING' | 'RECOVERED' | 'FAILED' | 'UNSUPPORTED_PLATFORM';

interface RecoveryResult {
  status: RecoveryStatus;
  reason?: string;              // Human-readable explanation (e.g., "PRAGMA integrity_check: ...")
  cloudBackupTime?: string;     // ISO-8601 — modifiedTime of the cloud backup used for recovery
  localChangesLost?: boolean;   // true if the local DB had unsynced changes that are lost after recovery
  recordsPreserved?: boolean;   // true if the recovery preserved data from the cloud backup
}
```

**Recovery Algorithm (7 Steps):**

1. **Check local integrity** — Call `integrityCheck.check()`. If `healthy: true`, return `{ status: 'HEALTHY' }`. No recovery needed.

2. **Read cloud file ID** — `await appMetadataRepo.get('cloud_file_id')`. If `null`, return `{ status: 'NO_CLOUD_BACKUP', reason: 'No cloud backup available — never synced or cloud_file_id missing' }`.

3. **Confirm online** — Call `isOnline()`. If `false`, return `{ status: 'FAILED', reason: 'Offline — recovery requires internet access to download cloud backup' }`.

4. **Download encrypted backup** — `await cloudStorageProvider.download(cloudFileId)`. Catches `CloudStorageError` (NOT_FOUND, NETWORK, etc.) → return `{ status: 'FAILED', reason: error.message }`.

5. **Decrypt backup** — Call `encryptedFileFormat.unpack(cloudData, derivedKey)`.
   - If `getDerivedKey()` returns `null` → `{ status: 'FAILED', reason: 'No derived key — cannot decrypt cloud backup' }`.
   - If `unpack()` throws `AuthenticationError` → `{ status: 'FAILED', reason: 'Wrong password or tampered backup — GCM authentication tag rejected' }`.
   - If `unpack()` throws `FormatError` or `VersionError` → `{ status: 'FAILED', reason: error.message }`.

6. **Verify decrypted backup** — Open decrypted bytes as in-memory DB via `openInMemoryDb(dbBytes)`, create a temporary `DatabaseIntegrityCheck` instance, run `check()`. If `healthy: false`, return `{ status: 'FAILED', reason: 'Cloud backup is also corrupt — cannot recover from Google Drive either. The backup was uploaded while the database was damaged.' }`.

7. **Replace local database** — Call `replaceLocalDb(dbBytes)`.
   - If throws `DatabaseError` (Capacitor) → `{ status: 'UNSUPPORTED_PLATFORM', reason: 'Recovery requires a Windows device. See docs/BACKUP_RECOVERY.md for manual steps.' }`.
   - On success → `{ status: 'RECOVERED', cloudBackupTime: downloadResult.modifiedTime }`.

**NOTE:** The `replaceLocalDb` callback is platform-specific:
- **Electron:** Overwrites the `.db` file on disk with `fs.writeFileSync()`, then calls `db.close()` and `db.open()` to re-initialize.
- **Capacitor:** Throws `DatabaseError('not yet implemented')` — recovery is limited to detection + documentation of manual steps.

---

### 6.3 `DatabaseConnection.replaceWithBytes()` — New Optional Method

**Purpose:** Replace the entire SQLite database file with the given bytes and re-initialize the connection.

**Signature:**

```
replaceWithBytes(bytes: Uint8Array): Promise<void>
```

**Contract:**

- Closes the existing connection gracefully (flush WAL, commit pending writes).
- Writes the given bytes to the database file path (overwriting the corrupt file).
- Re-opens the connection at the same path.
- Re-runs PRAGMA setup: `foreign_keys = ON`, `journal_mode = WAL`, `synchronous = NORMAL`, `busy_timeout = 5000`.
- Throws `DatabaseError` if the platform does not support byte-level replacement (Capacitor V1).

**Why optional on the interface:** Not every platform implementation can support this. `CapacitorSqliteConnection` throws per AD-21. The method exists so callers (RecoveryManager) don't need platform conditionals — they call the method and handle the error.

---

## 7. Data Flow

### 7.1 Recovery Flow (Electron — Full Path)

```
1. Trigger (manual, from future SettingsScreen or startup check)
   → RecoveryManager.recover()

2. RecoveryManager calls DatabaseIntegrityCheck.check()
   → db.query('PRAGMA integrity_check') + db.query('PRAGMA foreign_key_check')
   → Report: healthy=false, integrityResult="row 42 missing from index..."

3. RecoveryManager reads cloud_file_id from app_metadata
   → appMetadataRepo.get('cloud_file_id') → "abc123"

4. (Online check passes)

5. RecoveryManager downloads encrypted backup
   → cloudStorageProvider.download('abc123')
   → { data: <encrypted bytes>, modifiedTime: '2026-06-30T10:00:00.000Z' }

6. RecoveryManager derives key → getDerivedKey() → <32-byte Uint8Array>

7. RecoveryManager decrypts
   → encryptedFileFormat.unpack(encryptedBytes, derivedKey)
   → { database: <plaintext SQLite bytes>, salt: <32 bytes> }

8. RecoveryManager validates
   → openInMemoryDb(plaintextBytes) → in-memory DatabaseConnection
   → new DatabaseIntegrityCheck(inMemoryDb).check()
   → { healthy: true }

9. RecoveryManager replaces
   → replaceLocalDb(plaintextBytes)
     → BetterSqlite3Connection.replaceWithBytes(bytes):
       a. db.close()
       b. fs.writeFileSync(dbPath, bytes)
       c. db.open(dbPath) — re-runs PRAGMAs
     → Promise<void> resolves

10. RecoveryManager returns { status: 'RECOVERED', cloudBackupTime: '2026-06-30T...', localChangesLost: true, recordsPreserved: true }
```

### 7.2 Recovery Flow (Capacitor — Detection Only)

```
1. Same as steps 1-3 above

2. Step 4 (download) completes

3. Step 6 (decrypt) completes — in-memory bytes are available

4. Step 7 (replaceLocalDb) throws DatabaseError('not yet implemented')

5. RecoveryManager catches → returns {
     status: 'UNSUPPORTED_PLATFORM',
     reason: 'Recovery requires a Windows device. See docs/BACKUP_RECOVERY.md for manual steps.'
   }
```

### 7.3 No Recovery Needed (Healthy Database)

```
RecoveryManager.recover()
  → DatabaseIntegrityCheck.check()
  → { healthy: true }
  → Returns { status: 'HEALTHY' }
```
No cloud access, no decryption, no file replacement.

---

## 8. State Changes

### 8.1 Zustand Store (`useSyncStore`)

RecoveryManager does NOT directly write to `useSyncStore`. This is intentional — the recovery caller (future UI) decides how to surface the result.

The caller (Settings screen code, not in this spec) would typically:
- Set `syncState` to `'ALERT'` when corruption is detected
- Set `errorMessage` to the recovery reason on failure
- Set `syncState` to `'IDLE'` and clear `errorMessage` on `RECOVERED`

### 8.2 App Metadata

| Key | Recovery Effect |
|-----|----------------|
| `last_successful_sync` | **Wiped** — after recovery, the local DB is the cloud backup's state. The previous `last_successful_sync` timestamp is lost. New value is set on next sync. |
| `cloud_file_id` | **Preserved** — the cloud file ID doesn't change (the backup is downloaded, not replaced). |
| `kdf_salt` | **Overwritten** — the decrypted backup's salt is used. Salt is extracted by `EncryptedFileFormat.unpack()`. RecoveryManager writes it to `app_metadata` after restore. |

### 8.3 Database File

| Before Recovery | After Recovery (Electron) | After Recovery (Capacitor) |
|----------------|----------------------------|----------------------------|
| Corrupt `.db` file on disk | Replaced with cloud backup bytes. PRAGMAs re-applied. Migration version matches cloud backup. | **Unchanged** — recovery fails gracefully. DB remains corrupt on disk. |

---

## 9. Database Changes

**No schema changes.** No new tables, columns, or migrations.

### New `DatabaseConnection` Method

The interface gains one **optional** method:

```
replaceWithBytes(bytes: Uint8Array): Promise<void>
```

### Implementation Details

**Electron (`BetterSqlite3Connection`):**
- Close existing connection (flush WAL → `db.close()`)
- Write `bytes` to the file path using `fs.writeFileSync(dbPath, Buffer.from(bytes))`
- Re-open: `db.open(dbPath)`
- Re-execute PRAGMAs: `foreign_keys = ON`, `journal_mode = WAL`, `synchronous = NORMAL`, `busy_timeout = 5000`
- Requires access to `dbPath` (already stored in `BetterSqlite3Connection` from constructor)

**Capacitor (`CapacitorSqliteConnection`):**
- Throw `DatabaseError('CapacitorSqliteConnection.replaceWithBytes() is not yet implemented — recovery is Windows-only in V1')`
- Follows Rule 4.10 pattern — descriptive error, never stub data

---

## 10. Error Handling

### 10.1 `DatabaseIntegrityCheck`

| Scenario | Behavior |
|----------|----------|
| `PRAGMA integrity_check` returns `"ok"` | `healthy: true` |
| `PRAGMA integrity_check` returns non-ok (e.g., error list) | `healthy: false`, `integrityResult` contains raw error text |
| `PRAGMA foreign_key_check` returns rows | `healthy: false`, `foreignKeyViolations: count`, `foreignKeyDetails: JSON.stringify(rows)` |
| `db.query()` throws (connection closed, plugin error) | Caught, `healthy: false`, `integrityResult: 'check failed: <error message>'` |
| Both PRAGMAs fail | Both error details captured — one failure does not skip the other |

### 10.2 `RecoveryManager`

| Recovery Status | Condition | Return |
|----------------|-----------|--------|
| `HEALTHY` | `integrityCheck.check().healthy === true` | `{ status: 'HEALTHY' }` |
| `NO_CLOUD_BACKUP` | `cloud_file_id` is `null` or empty | `{ status: 'NO_CLOUD_BACKUP', reason: 'No cloud backup available...' }` |
| `FAILED` | Offline | `{ status: 'FAILED', reason: 'Offline — recovery requires internet...' }` |
| `FAILED` | `cloudStorageProvider.download()` throws `NOT_FOUND` | `{ status: 'FAILED', reason: 'Cloud backup file not found on Drive' }` |
| `FAILED` | `cloudStorageProvider.download()` throws `NETWORK` | `{ status: 'FAILED', reason: 'Network error downloading backup' }` |
| `FAILED` | `getDerivedKey()` returns `null` | `{ status: 'FAILED', reason: 'No derived key — cannot decrypt cloud backup' }` |
| `FAILED` | `encryptedFileFormat.unpack()` throws `AuthenticationError` | `{ status: 'FAILED', reason: 'Wrong password or tampered backup' }` |
| `FAILED` | `encryptedFileFormat.unpack()` throws `FormatError` | `{ status: 'FAILED', reason: error.message }` |
| `FAILED` | `encryptedFileFormat.unpack()` throws `VersionError` | `{ status: 'FAILED', reason: 'Unsupported file format version...' }` |
| `FAILED` | Decrypted cloud backup fails integrity check | `{ status: 'FAILED', reason: 'Cloud backup is also corrupt...' }` |
| `UNSUPPORTED_PLATFORM` | `replaceLocalDb()` throws `DatabaseError` | `{ status: 'UNSUPPORTED_PLATFORM', reason: 'Recovery requires Windows device...' }` |
| `RECOVERED` | All steps succeed | `{ status: 'RECOVERED', cloudBackupTime, localChangesLost: true, recordsPreserved: true }` |

### 10.3 Error Propagation

`RecoveryManager.recover()` never throws. All error paths return `RecoveryResult` with `status` not equal to `RECOVERED`. The caller handles the result — if it chooses to throw, that's a UI decision, not infrastructure.

---

## 11. Logging Requirements

| Component | Level | Event |
|-----------|-------|-------|
| `DatabaseIntegrityCheck.check()` | `debug` | `"DatabaseIntegrityCheck: healthy — integrity_check='ok', FK violations=0"` |
| `DatabaseIntegrityCheck.check()` | `warn` | `"DatabaseIntegrityCheck: CORRUPT — integrity_check='<result>', FK violations=N"` |
| `DatabaseIntegrityCheck.check()` | `error` | `"DatabaseIntegrityCheck: check failed — <error message>"` |
| `RecoveryManager.recover()` | `info` | `"RecoveryManager: starting recovery — detected corruption: <reason>"` |
| `RecoveryManager.recover()` | `info` | `"RecoveryManager: downloading cloud backup (fileId=<id>)"` |
| `RecoveryManager.recover()` | `info` | `"RecoveryManager: decrypting cloud backup"` |
| `RecoveryManager.recover()` | `info` | `"RecoveryManager: verifying decrypted backup integrity"` |
| `RecoveryManager.recover()` | `info` | `"RecoveryManager: replacing local DB with recovered bytes (N bytes)"` |
| `RecoveryManager.recover()` | `info` | `"RecoveryManager: recovery complete — cloud backup from <modifiedTime>"` |
| `RecoveryManager.recover()` | `warn` | `"RecoveryManager: recovery failed — <status>: <reason>"` |
| `RecoveryManager.recover()` | `info` | `"RecoveryManager: database is healthy — no recovery needed"` |

Use `console.*` methods (consistent with existing `SyncEngine`, `MigrationRunner`, `DirtyStateTracker` patterns). No logging library.

---

## 12. Security Requirements

- **Never log the derived AES key.** Log messages about decryption success/failure must NOT include key bytes or raw hex values.
- **Never log `cloud_file_id` at `info` or above.** Use `debug` level only (consistent with `SyncEngine` which logs cloud file operations at debug level).
- **Never log raw database bytes.** RecoveryManager handles `Uint8Array` payloads — log byte counts only, never the content.
- **No new credential storage.** The `getDerivedKey` callback reads from existing platform secure storage — no new keys, no new storage entries.
- **Recovery does NOT bypass authentication.** The cloud backup is encrypted — without the derived key (which requires the master password), recovery is impossible. This is by design (constitution §17.2).
- **Recovery does NOT create a new cloud file.** It downloads the existing backup. No upload happens during recovery. The user's Drive storage is unchanged.

---

## 13. Acceptance Criteria

All 4 E-13 tasks have identical acceptance criteria per the epic document:

| ID | Criterion |
|----|-----------|
| AC-01 | `DatabaseIntegrityCheck.check()` returns `{ healthy: true }` when `PRAGMA integrity_check` returns "ok" and no FK violations exist |
| AC-02 | `DatabaseIntegrityCheck.check()` returns `{ healthy: false }` with descriptive `integrityResult` when the database is structurally corrupt |
| AC-03 | `DatabaseIntegrityCheck.check()` returns `{ healthy: false }` with `foreignKeyViolations > 0` when orphaned FKs exist |
| AC-04 | `RecoveryManager.recover()` returns `{ status: 'HEALTHY' }` when the database is healthy (no recovery attempted) |
| AC-05 | `RecoveryManager.recover()` returns `{ status: 'NO_CLOUD_BACKUP' }` when `cloud_file_id` is missing from `app_metadata` |
| AC-06 | `RecoveryManager.recover()` returns `{ status: 'FAILED' }` when offline |
| AC-07 | `RecoveryManager.recover()` downloads, decrypts, verifies, and replaces the local database when corruption is detected (Electron) |
| AC-08 | `RecoveryManager.recover()` validates the decrypted cloud backup with its own integrity check before restoring |
| AC-09 | `RecoveryManager.recover()` refuses to restore if the cloud backup also fails integrity check |
| AC-10 | `RecoveryManager.recover()` returns `{ status: 'UNSUPPORTED_PLATFORM' }` on Capacitor (cannot write replacement bytes) |
| AC-11 | `DatabaseConnection.replaceWithBytes()` on Electron overwrites the `.db` file, re-opens, and re-applies PRAGMAs |
| AC-12 | `DatabaseConnection.replaceWithBytes()` on Capacitor throws `DatabaseError` with descriptive message |
| AC-13 | `docs/BACKUP_RECOVERY.md` documents Google Drive version history, manual recovery steps for both platforms, known limitations, and the recovery checklist |
| AC-14 | `RecoveryManager` operations do not throw uncaught exceptions — all errors return `RecoveryResult` with appropriate `status` |

---

## 14. Test Cases

### 14.1 `DatabaseIntegrityCheck` — Unit Tests

Place in `packages/shared/src/data/database/__tests__/DatabaseIntegrityCheck.test.ts`.

Use `createMockDb()` from `SongRepository.test.ts` pattern.

| ID | Test | Setup | Assertions |
|----|------|-------|------------|
| IC-01 | Healthy database returns `healthy: true` | Mock `query('PRAGMA integrity_check')` → `[{ integrity_check: 'ok' }]`. Mock `query('PRAGMA foreign_key_check')` → `[]` | `report.healthy === true`, `report.integrityResult === 'ok'`, `report.foreignKeyViolations === 0` |
| IC-02 | Corrupt database returns `healthy: false` | Mock `integrity_check` → `[{ integrity_check: 'row 42 missing from index idx_songs_name' }]` | `report.healthy === false`, `report.integrityResult` contains error text |
| IC-03 | FK violations set `healthy: false` | Mock `foreign_key_check` → `[{ table: 'songs', rowid: 1, parent: 'languages' }]` | `report.healthy === false`, `report.foreignKeyViolations === 1`, `report.foreignKeyDetails` is JSON string of violation rows |
| IC-04 | Both integrity and FK violations captured | Mock both failing | `report.healthy === false`, both fields populated |
| IC-05 | Query throws → `healthy: false` with error | Mock `query()` rejects with `Error('connection closed')` | `report.healthy === false`, `report.integrityResult` contains error message |
| IC-06 | `checkedAt` is set to current time | Any mock | `report.checkedAt` is a valid ISO-8601 string |
| IC-07 | Empty database (no tables) is healthy | SQLite returns "ok" for empty DB | `report.healthy === true` |
| IC-08 | Malformed integrity_check result (not "ok" but no explicit errors) | Mock returns `[{ integrity_check: 'unknown' }]` | `report.healthy === false` |

### 14.2 `RecoveryManager` — Unit/Integration Tests

Place in `packages/shared/src/application/sync/__tests__/RecoveryManager.test.ts`.

| ID | Test | Setup | Assertions |
|----|------|-------|------------|
| RM-01 | Healthy DB → returns HEALTHY | Mock `integrityCheck.check()` → `{ healthy: true }` | `result.status === 'HEALTHY'`, no cloud calls made |
| RM-02 | No cloud backup → returns NO_CLOUD_BACKUP | Mock `integrityCheck.check()` → `{ healthy: false }`. Mock `appMetadataRepo.get('cloud_file_id')` → `null` | `result.status === 'NO_CLOUD_BACKUP'`, `result.reason` is descriptive |
| RM-03 | Offline → returns FAILED | Mock dirty, cloud ID exists, `isOnline()` → `false` | `result.status === 'FAILED'`, `result.reason` mentions offline |
| RM-04 | Download fails → returns FAILED | Mock `cloudStorageProvider.download()` rejects with `CloudStorageError('Network error', 'NETWORK')` | `result.status === 'FAILED'`, error preserved in reason |
| RM-05 | Download 404 → returns FAILED | Mock download rejects with `CloudStorageError('Not found', 'NOT_FOUND')` | `result.status === 'FAILED'` |
| RM-06 | No derived key → returns FAILED | Mock `getDerivedKey()` → `null` | `result.status === 'FAILED'`, reason mentions missing key |
| RM-07 | Decrypt fails → returns FAILED | Mock `encryptedFileFormat.unpack()` throws `AuthenticationError('wrong key')` | `result.status === 'FAILED'`, reason mentions authentication tag |
| RM-08 | Cloud backup also corrupt → returns FAILED | All steps to verification succeed, but `integrityCheck.check()` on in-memory copy returns `{ healthy: false }` | `result.status === 'FAILED'`, reason mentions corrupt cloud backup |
| RM-09 | Successful recovery (Electron) → returns RECOVERED | All mocks pass: download returns bytes, decrypt returns bytes, integrity passes, `replaceLocalDb()` resolves | `result.status === 'RECOVERED'`, `result.cloudBackupTime` set, `result.localChangesLost === true`, `result.recordsPreserved === true` |
| RM-10 | Unsupported platform (Capacitor) → UNSUPPORTED_PLATFORM | `replaceLocalDb()` throws `DatabaseError('not yet implemented')` | `result.status === 'UNSUPPORTED_PLATFORM'`, reason is descriptive |
| RM-11 | `recover()` never throws | Any failure scenario | Method completes and returns `RecoveryResult` (does not reject Promise) |
| RM-12 | Integrity check before recovery | Verify `integrityCheck.check()` is called BEFORE any cloud operations | Check mock call order |

### 14.3 `DatabaseConnection.replaceWithBytes()` — Implementation Tests

These are platform-specific tests in the platform package test suites.

| ID | Platform | Test | Assertions |
|----|----------|------|------------|
| RB-01 | Electron | `replaceWithBytes()` closes, writes file, re-opens | Verify `fs.writeFileSync` called with correct path and `Buffer.from(bytes)`. Verify `db.open()` called after close. |
| RB-02 | Electron | PRAGMAs re-applied after replace | After replace, the opened connection has `foreign_keys = ON`, `journal_mode = WAL` |
| RB-03 | Electron | Can read/write after replace | After replacing with known bytes, query for a known row returns expected data |
| RB-04 | Capacitor | `replaceWithBytes()` throws | `DatabaseError` thrown with message mentioning "not yet implemented" |

### 14.4 Manual Recovery Checklist (T-13.4)

Documented in `docs/BACKUP_RECOVERY.md`:

| Scenario | Steps to Verify |
|----------|-----------------|
| Google Drive version history visible | Open Drive in browser → verify `collectio.db` has version history with timestamps |
| Recovery from a known-good backup (Electron) | Corrupt a test DB by deleting a system table → trigger recovery → verify data is restored to cloud backup state |
| Recovery detects corrupt cloud backup | Corrupt both local and cloud → verify recovery refuses to restore |
| Capacitor recovery guidance | Corrupt Capacitor DB → verify `UNSUPPORTED_PLATFORM` result → follow documented manual recovery steps on Windows device |
| No cloud backup scenario | Fresh install, skip sync → corrupt local DB → verify `NO_CLOUD_BACKUP` result |

---

## 15. Definition Of Done

Per PROJECT_CONSTITUTION.md Section 26 (Task-Level DoD):

1. **Implemented:** All acceptance criteria AC-01 through AC-14 are met
2. **Self-reviewed:** Diff reviewed; no debugging artifacts, hardcoded paths, or stale comments
3. **Tested:** All test cases in Section 14 pass. `pnpm test` produces zero failures. No regression in MigrationRunner, EncryptedFileFormat, or SyncEngine tests.
4. **Platform verified:**
   - Electron: RecoveryManager recovers from a corrupt database end-to-end (manual test with real better-sqlite3)
   - Capacitor: `replaceWithBytes()` throws descriptive error. RecoveryManager returns `UNSUPPORTED_PLATFORM`.
5. **No new lint errors:** `pnpm lint` passes with zero warnings. `pnpm typecheck` passes with zero errors.
6. **No hardcoded data:** No inline file paths. No embedded SQL that duplicates MigrationRunner PRAGMAs. No platform conditionals in `RecoveryManager`.
7. **Agent rules compliant:**
   - Rule 4.1: All PRAGMAs via `query()` (already handled by `DatabaseIntegrityCheck`)
   - Rule 4.10: `replaceWithBytes()` on Capacitor throws descriptive error, never returns stub data
   - Rule 12.2: No secrets logged
   - Rule 13.1: No platform conditionals — differences abstracted behind `replaceWithBytes()` callback
   - Rule 13.2: Domain layer pure TypeScript — `IntegrityReport` and `RecoveryResult` are plain interfaces
8. **Constitution compliant:**
   - Backup via Google Drive version history per §17.1 — documented, not implemented in app code
   - Recovery follows documented procedures per §17.2
   - Database corruption is detectable per NFR-REL-02
   - V1 limitation on Capacitor is documented per TD declaration pattern
9. **Documentation complete:** `docs/BACKUP_RECOVERY.md` exists and covers:
   - Google Drive version history mechanism
   - How many versions are retained (up to 100, managed by Google)
   - Recovery procedures for each recovery scenario (accidental delete, app bug, corruption, forgotten password)
   - Platform-specific recovery paths (Electron: automatic; Capacitor: manual via Windows)
   - Known limitations
   - Manual recovery verification checklist

---

## 16. Implementation Notes

### 16.1 `DatabaseIntegrityCheck` vs `MigrationRunner` Integrity Check

| Aspect | MigrationRunner | DatabaseIntegrityCheck |
|--------|----------------|------------------------|
| When | At startup, after migrations | On demand (triggered by code) |
| Scope | Migration-specific (checks after migration N) | General (checks current state) |
| PRAGMAs | `integrity_check` + `foreign_key_check` | Same PRAGMAs |
| Returns | `MigrationReport` (with migration context) | `IntegrityReport` (health-focused) |
| Failure behavior | Aborts startup | Returns structured result |

MigrationRunner's integrity check code (lines 202-233) is NOT extracted into DatabaseIntegrityCheck. Both classes independently call the same PRAGMAs — this is intentional. They serve different lifecycle hooks and have different error handling contracts.

### 16.2 `replaceLocalDb` Callback on Electron

The Electron implementation in `BetterSqlite3Connection` must:
1. Store `dbPath` from the constructor as a private field
2. `replaceWithBytes(bytes)` closes current connection
3. Writes bytes to `dbPath` via `fs.writeFileSync(dbPath, Buffer.from(bytes))`
4. Re-opens via the existing `open()` method (which runs PRAGMAs)

The `fromBuffer()` static method (line 99) creates an **in-memory** DatabaseConnection. It is NOT reused for `replaceWithBytes()` — that method targets the **on-disk** database file.

### 16.3 `EncryptedFileFormat.unpack()` Salt Handling

When recovery decrypts the cloud backup, `unpack()` returns both `database` bytes and `salt` bytes. The `salt` is extracted from the encrypted file header (bytes 5-36 per constitution §16.3). RecoveryManager MUST write the new salt to `app_metadata`:

```
await appMetadataRepo.set('kdf_salt', bytesToHex(unpacked.salt));
```

This ensures the local `kdf_salt` matches the decrypted backup's salt, so future key derivations (e.g., credential restore flow FR-AUTH-08) produce the same key.

### 16.4 Constructor Callbacks vs ServiceProvider

`RecoveryManagerParams` use constructor-injected callbacks (`getDerivedKey`, `openInMemoryDb`, `replaceLocalDb`, `isOnline`). This follows the same pattern as `SyncEngine` (lines 84-114) which injects `serializeDb`, `openInMemoryDb`, and `getDerivedKey` as callbacks.

This pattern avoids adding callback signatures to `ServiceProvider` and allows platform-specific implementations to be wired at the DI layer without polluting the shared interface contract.

### 16.5 Existing Code NOT to Modify

The following implementations are complete and must not be altered:
- `EncryptedFileFormat.pack()` / `EncryptedFileFormat.unpack()` — already correct
- `CloudStorageProvider.download()` — already implements retry, auth refresh, error handling
- `AppMetadataRepository.get()` / `set()` — already correct
- `MigrationRunner.runIntegrityCheck()` / `runForeignKeyCheck()` — private methods with correct implementation
- `SyncEngine.execute()` — recovery is a separate flow; SyncEngine is not a dependency of RecoveryManager
- `useSyncStore` — RecoveryManager does NOT write to the store directly

### 16.6 No UI Output in This Spec

`RecoveryManager` returns `RecoveryResult` objects — it does not render alerts, dialogs, or notifications. The caller (future code in E-14 Settings or E-15 UI Shell) decides how to surface `CORRUPT`, `FAILED`, `RECOVERED`, or `UNSUPPORTED_PLATFORM` states to the user.

---

_End of E13 Implementation Specification_
