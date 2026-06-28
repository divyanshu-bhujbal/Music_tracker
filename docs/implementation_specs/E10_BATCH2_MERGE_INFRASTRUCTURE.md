# E-10 Batch 2 — Merge Infrastructure (ChangeTracker, ConflictResolver)

> **Epic:** E-10_SYNC_ENGINE.md | **Phase:** 3 | **Batch:** 2 of 3
> **Depends On:** E-10 Batch 1 (DirtyStateTracker), E-02 (Database Layer)
> **Blocks:** E-10 Batch 3 (SyncEngine orchestrator)
> **Platform Impact:** UNCHANGED — pure TypeScript. Zero platform-specific code. Both files live in `packages/shared/src/application/sync/`.
> **Date:** 2026-06-28

---

## 1. Goal

Implement the two components that form the core merge infrastructure for the 14-step sync algorithm:

- **ChangeTracker** — Identifies changed records in both the local and cloud (remote) databases by querying all entity tables for rows with `updated_at > last_successful_sync`. Discovers table schemas dynamically via SQLite introspection.
- **ConflictResolver** — Applies Last-Write-Wins (LWW) merge logic to resolve conflicts between local and remote change sets. Detects and resolves orphaned foreign key references after merge. Pure computation for LWW; DB access only for FK orphan detection.

These are the intellectual center of the sync engine. Their correctness determines whether the user's data survives a multi-device sync.

## 2. Scope

- T-10.4: `ChangeTracker.getLocalChanges()` — identify records changed locally since `last_successful_sync`
- T-10.5: `ChangeTracker.getRemoteChanges()` — identify records changed in the cloud DB since `last_successful_sync` (integrated into same file as T-10.4)
- T-10.6: `ConflictResolver.resolve()` — LWW merge algorithm producing winning record set
- T-10.7: `ConflictResolver.resolveOrphans()` — orphaned FK detection and soft-delete/deletion (integrated into same file as T-10.6)
- T-10.14: Unit tests covering all 9 conflict scenarios from 03_SYNC_STATE_MACHINE.md §7 plus edge cases
- Dynamic table/PK/FK discovery via SQLite introspection (PRAGMA table_info, PRAGMA foreign_key_list)
- Support for composite primary keys (junction tables like `song_artists`)

## 3. Out of Scope

- `SyncEngine` orchestrator (14-step algorithm) — Batch 3
- `useSyncStore` Zustand store — Batch 3
- Dirty state computation — already done in Batch 1 (`DirtyStateTracker`)
- Inactivity timer — already done in Batch 1 (`SyncTimer`)
- Sync lock — already done in Batch 1 (`SyncLock`)
- Network monitoring — already done in Batch 1 (`NetworkMonitor`)
- Applying winners to the database — handled by `SyncEngine` in Batch 3 (steps 9–10 of algorithm)
- Encrypt/decrypt/upload/download — handled by `SyncEngine` in Batch 3 via `CryptoProvider` and `CloudStorageProvider`

## 4. Files To Create

| # | File | Task | Package |
|---|------|------|---------|
| 1 | `packages/shared/src/application/sync/ChangeTracker.ts` | T-10.4, T-10.5 | `@collectio/shared` |
| 2 | `packages/shared/src/application/sync/ConflictResolver.ts` | T-10.6, T-10.7 | `@collectio/shared` |
| 3 | `packages/shared/src/application/sync/__tests__/ChangeTracker.test.ts` | T-10.4/10.5 tests | `@collectio/shared` |
| 4 | `packages/shared/src/application/sync/__tests__/ConflictResolver.test.ts` | T-10.14, T-10.6/10.7 tests | `@collectio/shared` |

## 5. Files To Modify

| # | File | Change |
|---|------|--------|
| 1 | `packages/shared/src/application/sync/index.ts` | Add `export { ChangeTracker } from './ChangeTracker.js'` and `export { ConflictResolver } from './ConflictResolver.js'` |
| 2 | `packages/shared/src/application/index.ts` | Add re-exports for `ChangeTracker` and `ConflictResolver` (only if needed externally; the barrel already re-exports from `sync/index.js`) |

Note: `packages/shared/src/index.ts` does NOT need modification for Batch 2. These are internal sync engine components consumed only by `SyncEngine` in Batch 3. If external consumers (e.g., DI files) need these types, Batch 3 will add exports.

## 6. File Specifications

### 6.1 `ChangeTracker.ts`

**Purpose:** Identify which records have changed in a database since a given point in time. Used by the sync engine to find local changes (from the device's SQLite DB) and remote changes (from the decrypted cloud DB opened as an in-memory SQLite connection).

**Responsibility:**
- Discover entity tables with `updated_at` column via `sqlite_master` introspection (same query as `DirtyStateTracker.getEntityTables()`)
- Discover primary key columns per table via `PRAGMA table_info(<table>) WHERE pk > 0`
- Query changed records: `SELECT * FROM <table> WHERE updated_at > ?` (or all records if `lastSyncTime` is `null`)
- Return structured results grouped by table with schema metadata (PK column names)
- Caching: discovered table schemas are cached after first call (same rationale as `DirtyStateTracker`)

**Public API:**

| Method | Returns | Purpose |
|--------|---------|---------|
| `getLocalChanges(lastSyncTime: string)` | `Promise<ChangeSet>` | Changed records in the local database since `lastSyncTime`. If `lastSyncTime` is `null` (never synced), returns ALL records across all entity tables. |
| `getRemoteChanges(cloudDb: DatabaseConnection, lastSyncTime: string)` | `Promise<ChangeSet>` | Changed records in the cloud (in-memory) database since `lastSyncTime`. Accepts a `DatabaseConnection` to the decrypted cloud DB. |

**Types:**

```typescript
/**
 * Schema metadata for a single entity table.
 */
interface TableSchema {
  /** SQLite table name (e.g., "artists", "songs", "song_artists", "app_settings") */
  name: string;
  /** Primary key column names in order. Single column for entity tables
   *  (["id"]), multi-column for junction tables (["song_id", "artist_id"]). */
  primaryKeyColumns: string[];
}

/**
 * A set of changed rows for one table, including its schema.
 */
interface EntityChanges {
  schema: TableSchema;
  /** Full rows as returned by SELECT *. Each row is a plain object with column
   *  names as keys. Includes all columns: id, name, updated_at, deleted_at, etc. */
  rows: Record<string, unknown>[];
}

/**
 * Complete change set keyed by table name.
 */
type ChangeSet = Map<string, EntityChanges>;
```

**Constructor dependency:** `DatabaseConnection` (the local DB connection)

**Implementation specifics:**

1. **Table discovery** — reuses the same `sqlite_master` + `pragma_table_info` query pattern from `DirtyStateTracker` (see `DirtyStateTracker.ts:106-121`). Must be kept consistent with that component's query. If the queries diverge, they could disagree on which tables to sync vs count as dirty.

2. **PK column discovery** — per discovered table:
   ```sql
   SELECT name FROM pragma_table_info('<table>') WHERE pk > 0 ORDER BY pk
   ```
   - `artists` → `["id"]`
   - `songs` → `["id"]`
   - `song_artists` → `["song_id", "artist_id"]`
   - `app_settings` → `["key"]`

3. **Composite PK key building** — The `EntityChanges` structure includes `primaryKeyColumns` so the `ConflictResolver` can build a unique key string for each row without knowing the table schema. Building the key is the `ConflictResolver`'s responsibility (see §6.2).

4. **NULL lastSyncTime handling** — If `lastSyncTime` is `null`, query `SELECT * FROM <table>` (no WHERE clause). All records are considered "changes" for first-ever sync.

5. **Cache invalidation** — Table schemas are cached in memory. In V1, the schema does not change at runtime (migrations run at startup before sync). No cache invalidation needed.

**Source of truth:** 03_SYNC_STATE_MACHINE.md §6 (Sync Algorithm steps 6–7); 02_DATABASE_SCHEMA.md §3–5 (table definitions).

---

### 6.2 `ConflictResolver.ts`

**Purpose:** Apply the Last-Write-Wins merge algorithm to resolve conflicts between local and remote change sets. After merge, detect orphaned foreign key references and resolve them by soft-deletion or row deletion.

**Responsibility:**
- LWW merge: compare `updated_at` timestamps for each record present in either local or remote changes; determine winning record
- Deterministic tiebreak: equal timestamps → local wins
- Handle records that exist in only one side (new creations)
- Handle soft-deleted records transparently (deleted_at is just another column; LWW timestamp comparison determines whether the delete or the edit wins)
- Orphaned FK detection: after winners are determined, scan FK relationships for broken references
- Orphan resolution: soft-delete entity records (SET deleted_at) or delete junction rows (DELETE)
- Statistics: count conflicts, new-local, new-remote, orphans

**Public API:**

| Method | Returns | Purpose |
|--------|---------|---------|
| `resolve(localChanges: ChangeSet, remoteChanges: ChangeSet)` | `MergeResult` | Pure computation. Takes local and remote change sets; returns winning records + statistics. No DB access. |
| `resolveOrphans(db: DatabaseConnection)` | `Promise<OrphanReport>` | Query the given database for orphaned FK references. Must be called AFTER winners have been applied (SyncEngine handles this in Batch 3). Discovers FK relationships dynamically via `PRAGMA foreign_key_list`. |

**Types:**

```typescript
/**
 * Result of an LWW merge operation.
 */
interface MergeResult {
  /** Winning records grouped by table name. Each entry includes the schema
   *  and the winning rows. These are the records that should be applied
   *  to the merged database. */
  winners: ChangeSet;
  /** Number of records present in both local and remote (conflicts resolved by LWW). */
  conflictsResolved: number;
  /** Number of records present only in local changes (new local creations). */
  newLocalOnly: number;
  /** Number of records present only in remote changes (new remote creations). */
  newRemoteOnly: number;
  /** Total number of winning records across all tables. */
  totalRecordsAffected: number;
}

/**
 * Result of orphaned FK resolution.
 */
interface OrphanReport {
  /** Number of orphaned records found and resolved. */
  orphansFound: number;
  /** Human-readable details for sync_log error_message.
   *  Each string describes one orphan resolution (e.g.,
   *  "song_artists(song_id=abc, artist_id=xyz): referenced artist soft-deleted — junction row deleted"). */
  details: string[];
}
```

**Constructor dependency:** None. `resolve()` is a pure function (no DB access). `resolveOrphans()` accepts `DatabaseConnection` as a parameter (not stored).

**LWW Merge Algorithm** (from 03_SYNC_STATE_MACHINE.md §6 step 8):

```
FOR each tableName in (localChanges.keys ∪ remoteChanges.keys):
  schema = entityChanges.schema
  pkColumns = schema.primaryKeyColumns
  
  localRows  = localChanges.get(tableName)?.rows ?? []
  remoteRows = remoteChanges.get(tableName)?.rows ?? []
  
  // Build maps keyed by composite PK string
  localMap  = indexByPk(localRows, pkColumns)
  remoteMap = indexByPk(remoteRows, pkColumns)
  
  allPks = union(localMap.keys, remoteMap.keys)
  
  FOR each pkKey in allPks:
    local  = localMap[pkKey]
    remote = remoteMap[pkKey]
    
    IF local AND remote:
      IF local.updated_at > remote.updated_at:
        winner = local
      ELSE IF remote.updated_at > local.updated_at:
        winner = remote
      ELSE:  // equal timestamps — deterministic tiebreak
        winner = local
      conflictsResolved++
      
    ELSE IF local AND NOT remote:
      winner = local
      newLocalOnly++
      
    ELSE IF remote AND NOT local:
      winner = remote
      newRemoteOnly++
    
    winners.get(tableName).rows.push(winner)
    totalRecordsAffected++
```

**Composite PK key building** — The `indexByPk` helper builds a string key from a row's PK column values:
```typescript
function buildPkKey(row: Record<string, unknown>, pkColumns: string[]): string {
  return pkColumns.map(col => String(row[col])).join('|');
}
```
- `artists` row `{id: "uuid-1", ...}` → key `"uuid-1"`
- `song_artists` row `{song_id: "uuid-2", artist_id: "uuid-3", ...}` → key `"uuid-2|uuid-3"`
- `app_settings` row `{key: "theme", ...}` → key `"theme"`

**Orphaned FK Resolution Algorithm** (T-10.7):

1. Discover all user-content tables (tables with `updated_at` column, same as `ChangeTracker`)
2. For each table, query `PRAGMA foreign_key_list(<table>)` to get FK relationships
3. Filter to only user-content FKs (ignore FKs to infrastructure tables: `app_metadata`, `devices`, `sync_log`, `languages`, `categories` — these reference tables are immutable during sync)
4. For each FK relationship (`fromTable.fromColumn → toTable.toColumn`):
   - Check if `toTable` has a `deleted_at` column (via `PRAGMA table_info`)
   - If yes: find rows in `fromTable` where the referenced row in `toTable` is soft-deleted (`deleted_at IS NOT NULL`)
   - If no: find rows where the referenced row in `toTable` doesn't exist
5. For each orphan found:
   - If `fromTable` has a `deleted_at` column → `UPDATE <fromTable> SET deleted_at = ? WHERE <pk> = ?` (soft-delete)
   - If `fromTable` has no `deleted_at` column → `DELETE FROM <fromTable> WHERE <pk> = ?` (hard-delete junction row)
6. Log each resolution

**FK relationships in V1** (discovered dynamically, not hardcoded):
- `song_artists.song_id → songs.id` — `songs` has `deleted_at`. If a song is soft-deleted, orphaned junction rows are hard-deleted (song_artists has no `deleted_at`).
- `song_artists.artist_id → artists.id` — `artists` has `deleted_at`. If an artist is soft-deleted, orphaned junction rows are hard-deleted.
- `songs.language_id → languages.id` — `languages` is a seed reference table (no `deleted_at`). IGNORED by the filter.
- `sync_log.device_id → devices.id` — infrastructure table. IGNORED.

**Source of truth:** 03_SYNC_STATE_MACHINE.md §6 (Step 8), §7 (Conflict Scenarios); 02_DATABASE_SCHEMA.md §5 (table definitions).

---

## 7. Interfaces

No new domain interfaces are defined in Batch 2. Both `ChangeTracker` and `ConflictResolver` are concrete classes exported from the sync module. They are consumed only by `SyncEngine` (Batch 3).

### Type exports

The following types are exported from `ChangeTracker.ts` for use by `ConflictResolver.ts` and `SyncEngine.ts`:

| Type | Export From | Used By |
|------|------------|---------|
| `TableSchema` | `ChangeTracker.ts` | `ConflictResolver.ts`, `SyncEngine.ts` |
| `EntityChanges` | `ChangeTracker.ts` | `ConflictResolver.ts` |
| `ChangeSet` | `ChangeTracker.ts` | `ConflictResolver.ts`, `SyncEngine.ts` |

The following types are exported from `ConflictResolver.ts`:

| Type | Export From | Used By |
|------|------------|---------|
| `MergeResult` | `ConflictResolver.ts` | `SyncEngine.ts` |
| `OrphanReport` | `ConflictResolver.ts` | `SyncEngine.ts` |

## 8. Data Flow

### 8.1 Change Identification (T-10.4 / T-10.5)

```
SyncEngine.execute() [Batch 3]
  │
  ├─ lastSyncTime = await appMetadataRepo.get('last_successful_sync')
  │
  ├─ localChanges = await changeTracker.getLocalChanges(lastSyncTime)
  │   │
  │   ├─ discoverTables() → ["artists", "songs", "song_artists", "app_settings"]
  │   ├─ discoverPkColumns("artists") → ["id"]
  │   ├─ discoverPkColumns("songs") → ["id"]
  │   ├─ discoverPkColumns("song_artists") → ["song_id", "artist_id"]
  │   ├─ discoverPkColumns("app_settings") → ["key"]
  │   │
  │   └─ FOR each table:
  │        SELECT * FROM <table> WHERE updated_at > ?
  │        Return Map<tableName, {schema, rows}>
  │
  ├─ [Step 3-4 in SyncEngine: download + decrypt cloud DB to in-memory DB]
  │
  └─ remoteChanges = await changeTracker.getRemoteChanges(cloudInMemoryDb, lastSyncTime)
      └─ (same logic, queries the in-memory cloud DB)
```

### 8.2 LWW Merge (T-10.6)

```
SyncEngine receives localChanges and remoteChanges
  │
  ▼
ConflictResolver.resolve(localChanges, remoteChanges)
  │
  ├─ Build index: for each table, key rows by composite PK
  │   localMap["artists"]["uuid-1"] = { id: "uuid-1", display_name: "...", updated_at: "..." }
  │   remoteMap["artists"]["uuid-1"] = { id: "uuid-1", display_name: "...", updated_at: "..." }
  │
  ├─ FOR each (tableName, pkKey) in union(localKeys, remoteKeys):
  │   ├─ Both exist → compare updated_at → LWW winner
  │   ├─ Local only → winner = local (new creation)
  │   └─ Remote only → winner = remote (new creation from other device)
  │
  └─ Return MergeResult { winners, conflictsResolved, newLocalOnly, newRemoteOnly, totalRecordsAffected }
```

### 8.3 Orphaned FK Resolution (T-10.7)

```
SyncEngine [Batch 3 — after applying winners to merged DB]
  │
  ▼
ConflictResolver.resolveOrphans(mergedDb)
  │
  ├─ Discover entity tables via sqlite_master
  │
  ├─ FOR each entity table:
  │   ├─ PRAGMA foreign_key_list(<table>)
  │   └─ Filter: only FKs to other entity tables (tables with deleted_at or updated_at)
  │
  ├─ FOR each FK relationship (fromTable.col → toTable.col):
  │   ├─ Check if toTable has deleted_at column
  │   ├─ Query: SELECT fromTable.* FROM fromTable
  │   │         LEFT JOIN toTable ON fromTable.col = toTable.col
  │   │         WHERE toTable.col IS NULL
  │   │            OR (toTable has deleted_at AND toTable.deleted_at IS NOT NULL)
  │   │
  │   ├─ FOR each orphan row:
  │   │   ├─ fromTable has deleted_at → UPDATE SET deleted_at = NOW()
  │   │   └─ fromTable lacks deleted_at → DELETE
  │   │
  │   └─ Log resolution details
  │
  └─ Return OrphanReport { orphansFound, details[] }
```

## 9. State Changes

**ChangeTracker:** Read-only. No database writes. No in-memory state beyond cached table schemas.

**ConflictResolver.resolve():** Pure function. No side effects. No state changes.

**ConflictResolver.resolveOrphans():** Writes to the database (soft-delete or hard-delete orphaned rows). This is called by SyncEngine on the merged database copy, not the live local database.

## 10. Database Changes

**None.** No schema migrations, no new tables, no seed data.

`ConflictResolver.resolveOrphans()` performs DML (UPDATE/DELETE) on existing tables during sync. These writes are always to the merged database copy, not the live database. The SyncEngine handles the copy/replace lifecycle.

## 11. Error Handling

| Component | Scenario | Behavior |
|-----------|----------|----------|
| `ChangeTracker.getLocalChanges()` | Database connection closed | `ConnectionError` propagates — caller handles |
| `ChangeTracker.getLocalChanges()` | Table has no `updated_at` rows matching criteria | Returns empty `rows[]` for that table (not an error) |
| `ChangeTracker.getLocalChanges()` | No entity tables exist (migrations not run) | Returns empty `ChangeSet` (not an error) |
| `ChangeTracker.getRemoteChanges()` | Cloud DB connection closed | `ConnectionError` propagates |
| `ChangeTracker.getRemoteChanges()` | Cloud DB has different schema (migration mismatch) | Tables missing from cloud DB are silently absent from ChangeSet. This is correct — records in those tables won't exist remotely, so they become "local only" winners. |
| `ConflictResolver.resolve()` | `EntityChanges.schema.primaryKeyColumns` is empty | Throw `Error('Table schema missing primary key: <tableName>')` — this is a programming error, not a runtime condition |
| `ConflictResolver.resolve()` | Row missing a PK column value | Throw `Error('Row missing primary key column: <col>')` — data corruption |
| `ConflictResolver.resolve()` | `updated_at` is null or undefined on a row | Treat as epoch 0 in comparison (oldest possible). Log warning. |
| `ConflictResolver.resolveOrphans()` | `PRAGMA foreign_key_list` fails | Throw — caller should abort sync |
| `ConflictResolver.resolveOrphans()` | No FK relationships found | Return `{ orphansFound: 0, details: [] }` — not an error |
| `ConflictResolver.resolveOrphans()` | Orphan deletion fails (constraint violation) | Throw — data integrity issue; sync should abort |

## 12. Logging Requirements

| Component | Event | Level | Message Pattern |
|-----------|-------|-------|----------------|
| `ChangeTracker` | Table discovery | `debug` | `ChangeTracker: discovered ${n} entity tables: [names]` |
| `ChangeTracker` | Changes queried | `debug` | `ChangeTracker: ${source} changes — ${n} tables with ${totalRows} rows (since ${lastSync \|\| 'beginning'})` |
| `ConflictResolver` | Merge started | `debug` | `ConflictResolver: merging ${localTables} local tables, ${remoteTables} remote tables` |
| `ConflictResolver` | Merge complete | `info` | `ConflictResolver: merge complete — ${conflicts} conflicts, ${newLocal} local-only, ${newRemote} remote-only, ${total} total` |
| `ConflictResolver` | Timestamp tiebreak | `debug` | `ConflictResolver: tiebreak on ${table}.${pkKey} — equal timestamps (${ts}), local wins` |
| `ConflictResolver` | Null updated_at | `warn` | `ConflictResolver: row in ${table} has null updated_at — treating as epoch 0` |
| `ConflictResolver` | Orphan found | `warn` | `ConflictResolver: orphan in ${fromTable}(${pk}) — referenced ${toTable} record ${action}. ${resolution}` |
| `ConflictResolver` | Orphan resolution complete | `info` | `ConflictResolver: resolved ${n} orphaned FK references` |
| `ConflictResolver` | PK column error | `error` | `ConflictResolver: table ${table} has no primary key columns — cannot merge` |

All logs use `console.debug/info/warn/error`. Follow existing patterns from `DirtyStateTracker.ts` and `TokenRefresher.ts`.

## 13. Security Requirements

**None.** Both components operate on database records and do not handle secrets, make network calls, or perform cryptographic operations. The cloud DB bytes are decrypted by `SyncEngine` before `ChangeTracker` receives the in-memory `DatabaseConnection`.

## 14. Test Cases

### 14.1 ChangeTracker Tests

**File:** `packages/shared/src/application/sync/__tests__/ChangeTracker.test.ts`

**Setup:** Create in-memory `DatabaseConnection`. Create entity tables with `updated_at` columns. Populate with test data. Use `beforeEach` to recreate fresh DB.

| ID | Test | Setup | Expected |
|----|------|-------|----------|
| CT-01 | `getLocalChanges()` returns empty set when no changes exist | Insert rows with `updated_at = T-100`; call with `lastSyncTime = T` | `ChangeSet` has tables but all `rows[]` are empty |
| CT-02 | `getLocalChanges()` returns changed rows | Insert 3 songs with `updated_at = T+10`; call with `lastSyncTime = T` | `songs` table has 3 rows; each row has all columns |
| CT-03 | `getLocalChanges()` returns all rows when `lastSyncTime` is null | Insert 5 songs with various `updated_at` | Songs table has all 5 rows (first sync) |
| CT-04 | `getLocalChanges()` discovers entity tables dynamically | Create `artists`, `songs`, `song_artists`, `app_settings` tables with `updated_at` | All 4 tables present in ChangeSet keys |
| CT-05 | `getLocalChanges()` excludes tables without `updated_at` | Create `app_metadata` (no updated_at) with rows | `app_metadata` not in ChangeSet |
| CT-06 | `getLocalChanges()` discovers PK columns correctly | Create `artists` (id PK) | `schema.primaryKeyColumns = ["id"]` |
| CT-07 | Composite PK discovery | Create `song_artists` (song_id, artist_id PK) | `schema.primaryKeyColumns = ["song_id", "artist_id"]` |
| CT-08 | `getLocalChanges()` returns rows from multiple tables | Insert songs + artists + song_artists with updated_at > lastSync | 3 tables in ChangeSet, each with correct row count |
| CT-09 | `getRemoteChanges()` queries the passed DB connection | Create a second in-memory DB with different data; call getRemoteChanges | Returns rows from the second DB, not the constructor DB |
| CT-10 | `getRemoteChanges()` works with empty remote DB | Pass in-memory DB with tables but no rows | ChangeSet has tables but empty rows |
| CT-11 | Table schema cache works (same tables, single discovery) | Call getLocalChanges twice | Table discovery query runs only on first call |
| CT-12 | Row includes all columns | Insert song with name, album_name, language_id, updated_at, deleted_at | Each returned row has all column keys |
| CT-13 | `app_settings` table discovered and queried | Insert app_settings with updated_at > lastSync | app_settings present with correct rows |

### 14.2 ConflictResolver Tests — LWW Merge

**File:** `packages/shared/src/application/sync/__tests__/ConflictResolver.test.ts`

**Setup:** Build `ChangeSet` objects manually (no DB needed — pure computation tests). Create helper functions to construct `EntityChanges` for each table.

#### 14.2.1 Core LWW Scenarios (from 03_SYNC_STATE_MACHINE.md §7)

| ID | Scenario | Local | Remote | Expected Winner |
|----|----------|-------|--------|----------------|
| CF-01 | Local newer | `{ id: "1", updated_at: "T+10" }` | `{ id: "1", updated_at: "T" }` | Local |
| CF-02 | Remote newer | `{ id: "1", updated_at: "T" }` | `{ id: "1", updated_at: "T+10" }` | Remote |
| CF-03 | Same timestamp (deterministic tiebreak) | `{ id: "1", updated_at: "T" }` | `{ id: "1", updated_at: "T" }` | Local |
| CF-04 | Only local has record | `{ id: "1" }` exists | No record | Local |
| CF-05 | Only remote has record | No record | `{ id: "1" }` exists | Remote |
| CF-06 | Both soft-deleted, local more recent | `{ id: "1", updated_at: "T+5", deleted_at: "T+5" }` | `{ id: "1", updated_at: "T", deleted_at: "T" }` | Local (more recent deleted_at wins via updated_at comparison) |
| CF-07 | Local deleted, remote edited (remote newer) | `{ id: "1", updated_at: "T+5", deleted_at: "T+5" }` | `{ id: "1", updated_at: "T+10", deleted_at: null }` | Remote (undo delete, apply edit) |
| CF-08 | Remote deleted, local edited (local newer) | `{ id: "1", updated_at: "T+10", deleted_at: null }` | `{ id: "1", updated_at: "T+5", deleted_at: "T+5" }` | Local (keep alive, apply edit) |
| CF-09 | Multiple records across different tables | 2 songs changed + 3 artists changed | 1 song changed + 2 artists changed | 3 songs (2 local-only + 1 conflict winner) + 5 artists (3 local-only + 2 conflict winners) |

#### 14.2.2 Statistics

| ID | Test | Expected |
|----|------|----------|
| CF-10 | `conflictsResolved` count | CF-01 + CF-02 + CF-03 scenarios together → 3 conflicts |
| CF-11 | `newLocalOnly` count | Only-local records → correct count |
| CF-12 | `newRemoteOnly` count | Only-remote records → correct count |
| CF-13 | `totalRecordsAffected` equals sum of winners | Verify total matches expected |

#### 14.2.3 Composite Primary Key Handling

| ID | Test | Setup | Expected |
|----|------|-------|----------|
| CF-14 | Junction table merge — local newer | song_artists local `{ song_id: "s1", artist_id: "a1", updated_at: "T+10" }` vs remote `{ song_id: "s1", artist_id: "a1", updated_at: "T" }` | Local wins |
| CF-15 | Junction table — different composite keys are different records | local `{ song_id: "s1", artist_id: "a1" }` and remote `{ song_id: "s1", artist_id: "a2" }` | Both treated as separate records (both win as local-only/remote-only) |
| CF-16 | app_settings merge — PK is "key" not "id" | local `{ key: "theme", value: "dark", updated_at: "T+10" }` vs remote `{ key: "theme", value: "light", updated_at: "T" }` | Local wins with value "dark" |

#### 14.2.4 Edge Cases

| ID | Test | Expected |
|----|------|----------|
| CF-17 | Empty local changes, non-empty remote | All remote records win (newRemoteOnly) |
| CF-18 | Empty remote changes, non-empty local | All local records win (newLocalOnly) |
| CF-19 | Both empty | Empty winners, all stats zero |
| CF-20 | Tables in local but not in remote | Local records win as newLocalOnly |
| CF-21 | Tables in remote but not in local | Remote records win as newRemoteOnly |
| CF-22 | Record has null/undefined updated_at | Treated as epoch 0; other record wins. Warning logged. |

### 14.3 ConflictResolver Tests — Orphaned FK Resolution

**Setup:** Create in-memory `DatabaseConnection` with entity tables and FK relationships. Insert rows that simulate post-merge state with broken references.

| ID | Test | Setup | Expected |
|----|------|-------|----------|
| OR-01 | Junction references soft-deleted song | song_artists row references a song with `deleted_at IS NOT NULL` | Junction row deleted |
| OR-02 | Junction references soft-deleted artist | song_artists row references an artist with `deleted_at IS NOT NULL` | Junction row deleted |
| OR-03 | No orphans → no deletions | All FKs reference active (non-deleted) records | `orphansFound = 0`; no rows modified |
| OR-04 | Multiple orphans found | 3 orphaned junction rows across different tables | All 3 resolved; `orphansFound = 3`; details array has 3 entries |
| OR-05 | Details string format | Single orphan resolved | Detail string format: `"<fromTable>(<pk>): referenced <toTable> record soft-deleted — <action>"` |
| OR-06 | Empty database (no entity tables) | No tables with updated_at | `orphansFound = 0` |
| OR-07 | FK check ignores infrastructure tables | FK from sync_log to devices exists | Not checked or resolved |
| OR-08 | FK check ignores reference tables | FK from songs to languages exists | Not checked or resolved (languages is a seed table) |

## 15. Acceptance Criteria

1. `ChangeTracker.getLocalChanges()` returns `EntityChanges` keyed by table name with schema metadata and full rows
2. `ChangeTracker.getLocalChanges()` returns all rows when `lastSyncTime` is null (first sync)
3. `ChangeTracker.getRemoteChanges()` queries the passed `DatabaseConnection`, not the constructor's DB
4. `ChangeTracker` discovers entity tables and PK columns via `sqlite_master` + `pragma_table_info` — no hardcoded table list
5. `ConflictResolver.resolve()` correctly applies LWW: later `updated_at` wins; equal timestamps → local wins
6. `ConflictResolver.resolve()` correctly handles records present in only one side (newLocalOnly / newRemoteOnly)
7. `ConflictResolver.resolve()` correctly handles soft-deleted records (deleted_at treated as part of row; LWW on updated_at)
8. `ConflictResolver.resolve()` handles composite primary keys (junction tables, app_settings)
9. `ConflictResolver.resolve()` provides accurate statistics (conflictsResolved, newLocalOnly, newRemoteOnly, totalRecordsAffected)
10. `ConflictResolver.resolveOrphans()` detects FK orphans via `PRAGMA foreign_key_list` — dynamic discovery, no hardcoded relationships
11. `ConflictResolver.resolveOrphans()` soft-deletes entity records and hard-deletes junction rows
12. `ConflictResolver.resolveOrphans()` ignores infrastructure and reference table FKs
13. All unit tests pass (`pnpm --filter @collectio/shared test`)
14. `pnpm typecheck` passes with zero errors
15. `pnpm lint` passes with zero errors/warnings

## 16. Definition Of Done

- [ ] `ChangeTracker.ts` created with `getLocalChanges()` and `getRemoteChanges()` methods
- [ ] `ChangeTracker` exports `TableSchema`, `EntityChanges`, `ChangeSet` types
- [ ] `ChangeTracker` discovers tables via `sqlite_master` + PK columns via `pragma_table_info`
- [ ] `ChangeTracker` caches table schemas after first discovery
- [ ] `ChangeTracker` returns schema metadata alongside rows in every `EntityChanges`
- [ ] `ConflictResolver.ts` created with `resolve()` and `resolveOrphans()` methods
- [ ] `ConflictResolver` exports `MergeResult` and `OrphanReport` types
- [ ] `ConflictResolver.resolve()` implements LWW algorithm matching 03_SYNC_STATE_MACHINE.md §6 step 8
- [ ] `ConflictResolver.resolve()` uses composite PK key builder for junction tables
- [ ] `ConflictResolver.resolveOrphans()` uses dynamic FK discovery via `PRAGMA foreign_key_list`
- [ ] `ConflictResolver.resolveOrphans()` filters out infrastructure/reference table FKs
- [ ] `ConflictResolver.resolveOrphans()` distinguishes soft-delete (entity) vs hard-delete (junction)
- [ ] `packages/shared/src/application/sync/index.ts` updated with new exports
- [ ] All test cases from §14.1 (13), §14.2 (22), and §14.3 (8) pass
- [ ] TypeScript strict mode: zero errors
- [ ] ESLint: zero warnings
- [ ] No `console.log` — only `console.debug/info/warn/error` per existing patterns

## Appendix A: Code Patterns to Follow

| Pattern | Reference File | What to Copy |
|---------|---------------|-------------|
| Class structure + constructor injection | `packages/shared/src/application/sync/DirtyStateTracker.ts` | Same package, same directory — use identical style |
| Entity table discovery query | `DirtyStateTracker.ts:110-113` | Copy the `sqlite_master` + `pragma_table_info` query verbatim |
| Logging style | `DirtyStateTracker.ts:33-48` | `console.debug()` with component prefix + key data |
| Test setup (in-memory SQLite) | `packages/shared/src/application/sync/__tests__/DirtyStateTracker.test.ts` | Same pattern for creating tables, inserting test data |
| Jest describe/it | Same as above | `describe('ChangeTracker', () => { ... })` pattern |
| Type exports | `packages/shared/src/application/sync/DirtyStateTracker.ts` | Types defined in same file as class |
| Barrel export | `packages/shared/src/application/sync/index.ts` | `export { ClassName } from './FileName.js'` |

## Appendix B: Dependency Graph for Batch 2

```
                    DatabaseConnection
                    (already exists)
                          │
            ┌─────────────┴─────────────┐
            │                           │
            ▼                           ▼
     ChangeTracker              ConflictResolver
     (depends on DB         (resolve() — pure function,
      for queries)           resolveOrphans() — takes
            │                DB as parameter)
            │                           │
            └───────────┬───────────────┘
                        │
                        ▼
               ChangeTracker types
               (TableSchema, EntityChanges, ChangeSet)
                   imported by ConflictResolver
                        │
                        ▼
                   SyncEngine
                   (Batch 3)
```

- `ChangeTracker` uses `DatabaseConnection` for read-only queries
- `ConflictResolver.resolve()` is a pure function — zero DB access. Accepts `ChangeSet` objects.
- `ConflictResolver.resolveOrphans()` accepts `DatabaseConnection` as a parameter, performs read/write
- `ConflictResolver` imports types (`ChangeSet`, `EntityChanges`, `TableSchema`) from `ChangeTracker`

## Appendix C: Shared Query with DirtyStateTracker

Both `DirtyStateTracker` (Batch 1) and `ChangeTracker` (Batch 2) use the same table discovery query:

```sql
SELECT m.name FROM sqlite_master m
WHERE m.type = 'table'
AND m.name NOT IN ('sqlite_sequence')
AND EXISTS (SELECT 1 FROM pragma_table_info(m.name) WHERE name = 'updated_at')
```

**Do NOT extract this into a shared utility in Batch 2.** Both classes keep their own copy of the query. This avoids creating a coupling point between batches. If a shared utility is desired, extract it in Batch 3 when both classes are stabilized.

**If the query changes in one class, it MUST change in the other.** The coding agent must grep for this query pattern and keep them synchronized.

## Appendix D: FK Filtering Rules for resolveOrphans()

When discovering FK relationships, ignore relationships where the **referenced table** is an infrastructure or reference table:

| Referenced Table | Type | Ignored? | Reason |
|-----------------|------|----------|--------|
| `languages` | Reference seed table | Yes | Immutable during normal sync |
| `categories` | Reference seed table | Yes | Immutable during normal sync |
| `devices` | Infrastructure | Yes | Not user-content; not merge-relevant |
| `app_metadata` | Infrastructure | Yes | Key-value store; no FKs reference it |
| `sync_log` | Infrastructure | Yes | Audit trail; not merge-relevant |
| `songs` | Entity | No | User content — check |
| `artists` | Entity | No | User content — check |

**Detection rule:** A table is an infrastructure/reference table if it does NOT have an `updated_at` column (check via `PRAGMA table_info`). This rule correctly classifies all current and future tables without hardcoding.
