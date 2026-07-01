# Backup & Recovery

> Source: E-13 Implementation Specification
> Target: Personal Collection Manager V1.0

---

## 1. Google Drive Backup Mechanism

### How Backup Works

The application automatically uploads an encrypted copy of the local SQLite database to Google Drive whenever sync occurs. The encrypted file is stored in the app's private `drive.appdata` folder — invisible to the user's Drive UI.

### Google Drive Version History

Google Drive automatically maintains version history for files in `drive.appdata`:

- **Version retention:** Up to 100 versions per file, managed by Google
- **Version creation:** Each upload overwrites the previous file; Google Drive keeps the old version
- **Version access:** Versions are accessible via the Drive API (`revisions` endpoint) but not through the standard Drive web UI for `drive.appdata` files
- **No manual control:** Users cannot manually trigger or manage versions; the application's sync cycle creates new versions automatically

### What Is Backed Up

| Data | Backed Up | Notes |
|------|-----------|-------|
| SQLite database (schema + data) | Yes | Encrypted with AES-256-GCM before upload |
| Schema version | Yes | Embedded in the database |
| All songs, artists, languages | Yes | Part of the SQLite database |
| App settings | Yes | Stored in `app_settings` table within the database |
| Sync log | Yes | Stored in `sync_log` table within the database |
| Device registrations | Yes | Stored in `devices` table within the database |
| Derived AES key | No | Stored in platform secure storage, not in the database |
| Google OAuth tokens | No | Stored in platform secure storage, not in the database |
| Secure storage contents | No | Out of scope for V1 |

---

## 2. Recovery Procedures

### 2.1 Automatic Recovery (Electron)

The `RecoveryManager` class orchestrates automatic recovery on Windows:

1. **Detect corruption** — `DatabaseIntegrityCheck.check()` runs `PRAGMA integrity_check` + `PRAGMA foreign_key_check`
2. **Download cloud backup** — Downloads the encrypted file from Google Drive
3. **Decrypt** — Uses the derived AES-256 key to decrypt the backup
4. **Verify backup** — Runs integrity check on the decrypted backup
5. **Replace local database** — Overwrites the corrupt `.db` file on disk
6. **Re-open connection** — Re-initializes the database connection with PRAGMAs

### 2.2 Manual Recovery (Capacitor / Android)

The Capacitor platform does not support byte-level database replacement in V1 (AD-21). Manual recovery steps:

1. **Export from a healthy device:**
   - If you have another device (Electron/Windows) with a healthy copy, let it sync to Google Drive
   - The encrypted backup on Drive will contain the latest good state

2. **On Windows (Electron):**
   - Launch the application — it will detect corruption and offer automatic recovery
   - Or: manually trigger recovery from Settings (when available)

3. **On Android (Capacitor):**
   - The application will detect corruption and report `UNSUPPORTED_PLATFORM`
   - Transfer the encrypted backup file from Google Drive to the Android device
   - Use a SQLite editor to replace the database file manually
   - The database file is located at: `<app-data>/databases/collectio.db`

### 2.3 Recovery from Accidental Delete

If the user accidentally deletes the database file:

- **Electron:** The application detects the missing file on next launch, downloads from Google Drive, and restores
- **Capacitor:** The application creates a new empty database; the user must manually restore from a Windows device

### 2.4 Recovery from Forgotten Password

If the user forgets their master password:

- **No recovery path in V1** — the cloud backup is encrypted with the derived key, which requires the master password
- The user retains access to data on any device where the app is installed (local DB is unencrypted)
- What is lost: ability to sync and ability to onboard new devices from cloud backup
- This is a known limitation disclosed at initial setup (constitution §16.4)

---

## 3. DatabaseIntegrityCheck

### Purpose

Run SQLite health checks on demand and return a structured report.

### Usage

```typescript
import { DatabaseIntegrityCheck } from '@collectio/shared';

const checker = new DatabaseIntegrityCheck(db);
const report = await checker.check();

if (!report.healthy) {
  console.error(`Corruption detected: ${report.integrityResult}`);
  if (report.foreignKeyViolations > 0) {
    console.error(`${report.foreignKeyViolations} foreign key violations`);
  }
}
```

### Report Format

```typescript
interface IntegrityReport {
  healthy: boolean;              // Overall health status
  integrityResult: string;       // Raw PRAGMA output ("ok" or error text)
  foreignKeyViolations: number;  // Count of FK violations
  foreignKeyDetails: string;     // JSON string of violation rows
  checkedAt: string;             // ISO-8601 timestamp
}
```

---

## 4. RecoveryManager

### Purpose

Orchestrate the corruption recovery pipeline. Detects corruption, downloads and decrypts the cloud backup, validates it, and replaces the local database.

### Usage

```typescript
import { RecoveryManager } from '@collectio/shared';

const manager = new RecoveryManager({
  db,
  integrityCheck: new DatabaseIntegrityCheck(db),
  cloudStorageProvider,
  encryptedFileFormat,
  appMetadataRepo,
  getDerivedKey: async () => derivedKey,
  openInMemoryDb: async (bytes) => BetterSqlite3Connection.fromBuffer(Buffer.from(bytes)),
  replaceLocalDb: async (bytes) => db.replaceWithBytes!(bytes),
  isOnline: () => navigator.onLine,
});

const result = await manager.recover();

switch (result.status) {
  case 'HEALTHY':
    // No recovery needed
    break;
  case 'RECOVERED':
    // Database restored from cloud backup
    console.log(`Restored from backup at ${result.cloudBackupTime}`);
    break;
  case 'NO_CLOUD_BACKUP':
    // Never synced — no backup available
    break;
  case 'FAILED':
    // Recovery failed — see result.reason
    break;
  case 'UNSUPPORTED_PLATFORM':
    // Capacitor — manual recovery required
    break;
}
```

### Recovery Result

```typescript
type RecoveryStatus =
  | 'HEALTHY'            // Database is healthy, no recovery needed
  | 'NO_CLOUD_BACKUP'    // No cloud backup exists
  | 'FAILED'             // Recovery failed (see reason)
  | 'UNSUPPORTED_PLATFORM' // Capacitor — cannot replace DB bytes
  | 'RECOVERED';         // Successfully recovered

interface RecoveryResult {
  status: RecoveryStatus;
  reason?: string;              // Human-readable explanation
  cloudBackupTime?: string;     // ISO-8601 of the backup used
  localChangesLost?: boolean;   // true if unsynced changes were lost
  recordsPreserved?: boolean;   // true if backup data was preserved
}
```

---

## 5. Known Limitations

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| Capacitor cannot replace DB bytes (AD-21) | Android recovery is detection-only | Manual recovery on Windows device required |
| No automatic corruption detection | Corruption not discovered until next app launch or manual check | `DatabaseIntegrityCheck` can be called on-demand |
| Cloud backup may also be corrupt | If backup was uploaded while DB was damaged, recovery cannot help | RecoveryManager validates backup before restoring |
| No cross-version recovery | Cloud backup with newer schema than local app cannot be restored | Deferred to V2 |
| V1 recovery does not restore secure storage | Only the SQLite database is recovered | OAuth tokens and derived key must be re-derived |

---

## 6. Manual Recovery Verification Checklist

| Scenario | Steps to Verify |
|----------|----------------|
| Google Drive version history visible | Open Drive in browser → verify `collectio.db` has version history with timestamps |
| Recovery from known-good backup (Electron) | Corrupt a test DB by deleting a system table → trigger recovery → verify data is restored to cloud backup state |
| Recovery detects corrupt cloud backup | Corrupt both local and cloud → verify recovery refuses to restore |
| Capacitor recovery guidance | Corrupt Capacitor DB → verify `UNSUPPORTED_PLATFORM` result → follow documented manual recovery steps on Windows device |
| No cloud backup scenario | Fresh install, skip sync → corrupt local DB → verify `NO_CLOUD_BACKUP` result |

---

## 7. Security Notes

- The cloud backup is encrypted with AES-256-GCM using a key derived from the master password
- Without the master password, the backup cannot be decrypted — recovery is impossible
- Recovery does NOT bypass authentication
- Recovery does NOT create a new cloud file — it downloads the existing backup
- No new credential storage is introduced by the recovery system
- The derived AES key is never logged during recovery operations
