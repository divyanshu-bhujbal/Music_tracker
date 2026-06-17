# Synchronization Design & State Machine

> Source: PROJECT_CONSTITUTION.md Section 15
> Target: Personal Collection Manager V1.0

---

## 1. Synchronization Model

**Offline-first full-file sync with Last-Write-Wins (LWW) record-level merging.**

| Concept | Definition |
|---------|-----------|
| **Local database** | SQLite on device — always the source of truth for the current device |
| **Cloud database** | Encrypted SQLite file on Google Drive — represents the most recent successfully merged state |
| **Sync direction** | Local ↔ Cloud, merge, then Cloud ← Merged |
| **Conflict resolution** | Automatic, deterministic — Last-Write-Wins based on `updated_at` timestamps |
| **Conflict frequency** | Expected, not exceptional (up to 4 devices operating simultaneously) |

---

## 2. Sync State Machine

```
                          ┌─────────────┐
                          │    IDLE     │
                          │ (clean/dirty│
                          └──────┬──────┘
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
              write occurs   startup      shutdown
              (any entity)   (if online)   (if dirty)
                    │            │            │
                    ▼            │            │
              ┌──────────┐      │            │
              │  DIRTY   │◄─────┘            │
              │ + timer  │                   │
              │ (120s)   │                   │
              └────┬─────┘                   │
                   │                         │
          ┌────────┼────────┐                │
     write occurs  timer    manual          │
     (resets timer) fires   sync           │
          │          │        │              │
          ▼          ▼        ▼              │
     timer resets  ┌──────────────┐          │
                   │  SYNCING     │◄─────────┘
                   │ (lock held)  │
                   └──────┬───────┘
                          │
               ┌──────────┼──────────┐
               │          │          │
            success    failure    decrypt fail
               │          │          │
               ▼          ▼          ▼
           ┌──────┐  ┌─────────┐  ┌───────┐
           │ IDLE │  │WARNING  │  │ALERT  │
           │(clean)│  │(dirty   │  │(corrupt│
           │       │  │persists)│  │ /wrong │
           └──────┘  └─────────┘  │ key)   │
                                  └───────┘
```

### State Definitions

| State | Description | Sidebar Indicator |
|-------|-------------|-------------------|
| **IDLE (clean)** | No pending changes; `updated_at` ≤ `last_successful_sync` | Green check — "Synced X minutes ago" |
| **IDLE (dirty)** | Pending changes exist but timer hasn't fired; app still fully usable | Yellow dot — "N pending changes" |
| **DIRTY** | Write occurred; 120s timer running. Subsequent writes reset timer | Yellow dot — "N pending changes" |
| **SYNCING** | Sync algorithm executing; lock held | Spinning indicator — "Syncing..." |
| **WARNING** | Sync failed; dirty state persists; app fully usable | Yellow warning — "Sync failed. Retrying in X minutes." |
| **ALERT** | Decryption failed — wrong password or corruption | Red error — "Cloud backup unrecoverable" |
| **OFFLINE** | No network connectivity; all operations local-only | Gray offline icon — "Offline" |

---

## 3. Dirty State Logic

### When does the app become dirty?

1. Any INSERT, UPDATE, or DELETE on an entity table sets `updated_at = NOW()` (UTC)
2. Application computes `MAX(updated_at)` across all entity tables
3. If `MAX(updated_at) > last_successful_sync` → the database is **dirty**

### How does dirty state persist across restarts?

Dirty flag is **computed at runtime**, not stored as a separate flag:
- `last_successful_sync` is stored in `app_metadata`
- On startup, query `MAX(updated_at)` across all entity tables
- Compare against stored `last_successful_sync`
- If any entity has a newer timestamp → dirty

This means dirty state naturally survives app restarts, crashes, and power loss.

### Pending change count

```
SELECT COUNT(*) FROM (
  SELECT updated_at FROM artists WHERE updated_at > :lastSync
  UNION ALL
  SELECT updated_at FROM songs WHERE updated_at > :lastSync
  UNION ALL
  SELECT updated_at FROM song_artists WHERE updated_at > :lastSync
  UNION ALL
  SELECT updated_at FROM app_settings WHERE updated_at > :lastSync
)
```

---

## 4. Auto-Sync Timer

| Parameter | Default | Configurable | Setting Key |
|-----------|---------|-------------|-------------|
| Delay | 120 seconds | Yes | `auto_sync_delay_seconds` |
| Range | 30–600 seconds | Yes | `auto_sync_delay_seconds` |

### Timer Behavior

| Event | Action |
|-------|--------|
| Write occurs (INSERT/UPDATE/DELETE) | Start or reset timer to configured delay |
| Subsequent write during timer | Reset timer (restart countdown) |
| Timer expires + online + dirty | Trigger auto-sync |
| Timer expires + offline | No sync attempted; timer pauses until connectivity returns |
| Sync in progress | Timer suppressed |
| App backgrounded (mobile) | Timer paused |
| Manual sync triggered | Timer cancelled; sync runs immediately |

### Design rationale

The timer prevents rapid consecutive edits on a single device from triggering multiple uploads. It does **not** prevent cross-device conflicts — those are resolved by LWW merging.

---

## 5. Sync Trigger Sources

| Trigger | Condition | Behavior |
|---------|-----------|----------|
| **Startup sync** | App launches, online, cloud DB exists | Sync before showing main UI; progress shown with "Skip / Work Offline" button |
| **Shutdown sync** | App closing, online, dirty | Expedited sync attempt; uses platform background task APIs |
| **Auto-sync** | Timer expires, online, dirty | Background sync; no user interruption |
| **Manual sync** | User taps sync icon in sidebar or pull-to-refresh (Android) | Immediate sync; shows "Syncing..." with spinner |
| **Post-connectivity** | Device transitions offline → online, dirty | Auto-sync triggered after a short delay (10s debounce) |

---

## 6. Sync Algorithm (14 Steps)

The sync engine executes these steps. If any step fails, the sync is **aborted** and the local database is **unchanged**.

```
 1. ACQUIRE sync lock (prevents concurrent syncs)
 2. SET sync_log status = IN_PROGRESS, direction = MERGE
 3. FETCH encrypted database file from Google Drive
    └─ FAIL → ABORT, show warning, go to step 16
 4. DECRYPT cloud database to temporary in-memory SQLite connection
    └─ FAIL → ABORT (corruption or wrong key), alert user, go to step 16
 5. GET last_successful_sync from local app_metadata
 6. IDENTIFY local changes:
    SELECT all records across all entity tables
    WHERE updated_at > last_successful_sync
 7. IDENTIFY remote changes:
    SELECT all records in the decrypted cloud DB
    WHERE updated_at > last_successful_sync
 8. MERGE records using Last-Write-Wins (LWW):
    a. For every record ID in (local_changes ∪ remote_changes):
       Compare local.updated_at vs remote.updated_at
       The record with the later timestamp overwrites the older one
       If timestamps are equal → local wins (deterministic tiebreak)
    b. For orphaned FKs (structurally broken references):
       Soft-delete the orphaned record
       Log resolution to sync_log with error_message
 9. BUILD merged database: apply winning records to local database copy
10. UPDATE last_successful_sync = NOW() in app_metadata
11. ENCRYPT merged database with AES-256-GCM
12. UPLOAD encrypted file to Google Drive
    (Overwrites primary; Google Drive versions the old file automatically)
    └─ FAIL → ABORT, revert last_successful_sync to previous value,
       discard merged changes, go to step 16
13. UPDATE sync_log with SUCCESS, timestamp, records_affected
14. RELEASE sync lock
```

### Step 8 in Detail: LWW Merge

```
FOR each record_id in (local_changes ∪ remote_changes):
  local_record  = records.get(local, record_id)
  remote_record = records.get(remote, record_id)

  IF local_record AND remote_record:
    IF local_record.updated_at > remote_record.updated_at:
      winner = local_record
    ELSE IF remote_record.updated_at > local_record.updated_at:
      winner = remote_record
    ELSE:  // timestamps equal
      winner = local_record  // deterministic tiebreak

  ELSE IF local_record AND NOT remote_record:
    winner = local_record   // new local record

  ELSE IF remote_record AND NOT local_record:
    winner = remote_record  // new remote record

  APPLY winner to merged database

AFTER merge:
  SCAN for orphaned foreign keys
  FOR each orphan:
    SOFT-DELETE orphaned record
    LOG resolution
```

---

## 7. Conflict Scenarios

| Scenario | Local State | Remote State | Winner | Rationale |
|----------|------------|--------------|--------|-----------|
| Local newer | updated_at = T+10 | updated_at = T | Local | Later timestamp wins |
| Remote newer | updated_at = T | updated_at = T+10 | Remote | Later timestamp wins |
| Same timestamp | updated_at = T | updated_at = T | Local | Deterministic tiebreak (consistent across all devices) |
| Only local has record | Record exists | No record | Local | New local creation |
| Only remote has record | No record | Record exists | Remote | New remote creation |
| Both soft-deleted | deleted_at set | deleted_at set | Most recent deleted_at | If same deleted_at → tiebreak to local |
| Local deleted, remote edited | deleted_at = T+5 | updated_at = T+10 | Remote | Remote edit is newer → restore + apply edit |
| Remote deleted, local edited | updated_at = T+10 | deleted_at = T+5 | Local | Local edit is newer → keep alive + edit |
| FK orphan | artist deleted on A | song_artist on B refs the artist | Soft-delete orphan | Structural constraint enforced deterministically |

---

## 8. Startup Sync

```
App launches
  │
  ├─ No cloud DB exists (first launch ever)?
  │   └─ Skip sync. Proceed to setup.
  │
  ├─ Offline?
  │   └─ Load local DB. Show "Offline" in sidebar. Skip sync.
  │
  └─ Online + cloud DB exists?
      └─ Show progress screen with "Skip / Work Offline" button
          │
          ├─ User taps Skip?
          │   └─ Cancel sync. Load local DB. Show "Offline" warning.
          │
          └─ Sync runs:
              ├─ Success → Load merged DB. Show "Synced X ago".
              └─ Fail → Auto-fallback to local DB. Show "Sync failed" warning.
```

---

## 9. Shutdown Sync

```
App closing
  │
  ├─ Not dirty?
  │   └─ Close immediately.
  │
  └─ Dirty + online?
      └─ Attempt expedited sync:
          ├─ Android: WorkManager one-time task
          ├─ Windows: Background Tasks API
          ├─ Success → DB synced before close
          └─ Fail → Dirty state persists; caught on next startup sync
```

---

## 10. Offline Operation

| Capability | Available Offline? |
|------------|--------------------|
| View all data | Yes |
| Create songs/artists | Yes |
| Edit songs/artists | Yes |
| Soft-delete items | Yes |
| Restore from trash | Yes |
| Search and filter | Yes |
| Change settings | Yes |
| Sync | No |
| Google Drive access | No |
| OAuth token refresh | No |

When offline → online transition occurs, the dirty state check triggers auto-sync after a 10-second debounce to allow the network to stabilize.

---

## 11. Sync Lock

| Property | Value |
|----------|-------|
| Type | In-memory application-level mutex |
| Scope | Single process |
| Persistence | Does not survive app restart |
| Timeout | No timeout — a stuck sync must be manually resolved (app restart) |

### Rationale for in-memory lock

In V1, the app runs as a single process with a single database connection. An in-process mutex is sufficient. If the app crashes during sync, the lock dies with the process and the dirty state is caught and resolved by the next startup sync.

---

## 12. Failure Handling & Retry

| Failure Type | Retry Strategy | User Impact |
|-------------|---------------|-------------|
| Network unavailable | No retry; wait for connectivity | "Offline" indicator; app fully usable |
| HTTP 5xx (Drive server error) | 3 retries with exponential backoff (1s, 2s, 4s) | "Sync failed" warning; retry on next auto-sync cycle |
| HTTP 429 (rate limit) | 5 retries with exponential backoff (1s, 2s, 4s, 8s, 16s) | Warning; automatic recovery |
| HTTP 401 (unauthorized) | Attempt token refresh, retry once | If refresh fails → needsReauth flag, sync disabled until re-auth |
| Decryption failure | No retry | "Cloud backup unrecoverable" alert + recovery options |
| Upload failure (step 12) | 3 retries with backoff | Local DB unchanged; sync status reverted; retry on next cycle |
| Repeated sync failures | Exponential backoff on auto-sync (5min, 10min, 30min, 1hr, 4hr, 12hr...) | Persistent warning; app fully usable |

---

## 13. Sync V1 Limitations (Known)

| Limitation | Impact | Future Path |
|-----------|--------|-------------|
| Full-file sync (not incremental) | Entire DB uploaded each sync | Move to chunked/incremental when DB > 50MB |
| Single cloud provider (Google Drive) | No Dropbox/OneDrive/WebDAV | Add via CloudStorageProvider interface |
| No concurrent sync on same device | In-memory lock only | Sufficient for single-user, single-process app |
| No automatic conflict notification | Conflicts resolved silently via LWW | Conflict log visible in sync_log table; UI can surface in future |
