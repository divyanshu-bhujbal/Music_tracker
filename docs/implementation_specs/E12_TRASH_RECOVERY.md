# E12: Trash and Recovery — Implementation Specification

> **Source epic:** [E-12_TRASH_RECOVERY.md](../epics/E-12_TRASH_RECOVERY.md) — tasks T-12.1 through T-12.5
> **Prerequisites:** E-07 (Songs UI) — COMPLETE
> **Blocks:** E-16 (Testing & QA)
> **Platform impact:** NONE — pure TypeScript SQL in `@collectio/shared`, MUI React in `@collectio/renderer`

---

## 1. Goal

Complete the trash and recovery subsystem: bulk soft-delete operations on the data layer, a dedicated TrashScreen for viewing and restoring soft-deleted songs, and a "Trash" nav link in the Sidebar. Single-delete and single-restore are already implemented in the repository layer and wired into the UI; this spec adds the missing pieces: bulk-delete, the trash listing screen, and the restore-from-trash user flow.

---

## 2. Scope

| Task | Summary | Status |
|------|---------|--------|
| T-12.1 | Single soft-delete actions | **ALREADY EXISTS** — `SongRepository.softDelete()`, `ArtistRepository.softDelete()`, `useDeleteSong` hook, `SongDetailDialog` delete UI |
| T-12.2 | Bulk soft-delete | **NEW** — `SongRepository.bulkSoftDelete()`, `ArtistRepository.bulkSoftDelete()` |
| T-12.3 | TrashScreen | **NEW** — MUI-based screen listing soft-deleted songs with per-item restore action |
| T-12.4 | Single restore action | **ALREADY EXISTS** — `SongRepository.restore()`, `ArtistRepository.restore()`, `useRestoreSong` hook. New: wire into TrashScreen |
| T-12.5 | Tests | **NEW** — bulk soft-delete unit tests, TrashScreen integration tests |

---

## 3. Out of Scope

- Bulk restore (restore multiple items at once) — not required by E-12 tasks or constitution
- Bulk delete from table-view checkboxes — the table view with selection checkboxes is not yet implemented; `bulkSoftDelete()` is added to the repository layer for future use but has no UI trigger in this spec
- Hard delete / permanent delete — constitution mandates indefinite trash retention (FR-SONG-07), no purge in V1
- Artist restore from TrashScreen — TrashScreen shows only songs; artists are restored via song association (no separate artist trash view)
- Trash item count badge on sidebar nav link — defer to E-15 (UI Shell polish)
- Cascade soft-delete: soft-deleting a song does NOT auto-soft-delete its artists or junction rows. Per schema, `song_artists` has no `deleted_at` column (by design — junction tables use `updated_at` for LWW sync tracking)
- Language delete/restore — languages are a reference table, not user-content. They have no `deleted_at` column and are not part of the trash system

---

## 4. Files To Create

| # | File | Package | Purpose |
|---|------|---------|---------|
| 1 | `packages/renderer/src/screens/TrashScreen.tsx` | `@collectio/renderer` | MUI screen showing all soft-deleted songs with restore action per item, loading/empty/error states |
| 2 | `packages/renderer/src/screens/__tests__/TrashScreen.test.tsx` | `@collectio/renderer` | Integration tests: renders deleted items, restore action calls restore API, empty state, error state |

---

## 5. Files To Modify

| # | File | Change | Package |
|---|------|--------|---------|
| 1 | `packages/shared/src/data/repositories/SongRepository.ts` | Add `bulkSoftDelete(ids: string[]): Promise<void>` method | `@collectio/shared` |
| 2 | `packages/shared/src/data/repositories/ArtistRepository.ts` | Add `bulkSoftDelete(ids: string[]): Promise<void>` method | `@collectio/shared` |
| 3 | `packages/renderer/src/categories/songs/store/useSongsStore.ts` | Add `useDeletedSongs()` query hook and `useBulkDeleteSong()` mutation hook | `@collectio/renderer` |
| 4 | `packages/renderer/src/navigation/AppRouter.tsx` | Replace placeholder `<div>TrashScreen (not yet implemented)</div>` with `<TrashScreen />` import | `@collectio/renderer` |
| 5 | `packages/renderer/src/components/Sidebar.tsx` | Add Trash nav link (between CategoryNav and Settings) using `@mui/icons-material/Delete` | `@collectio/renderer` |
| 6 | `packages/shared/src/data/repositories/__tests__/SongRepository.test.ts` | Add `bulkSoftDelete()` tests | `@collectio/shared` |
| 7 | `packages/shared/src/data/repositories/__tests__/ArtistRepository.test.ts` | Add `bulkSoftDelete()` tests | `@collectio/shared` |
| 8 | `packages/renderer/src/index.ts` | Add `export { TrashScreen } from './screens/TrashScreen.js'` | `@collectio/renderer` |

---

## 6. Interfaces

### 6.1 `SongRepository.bulkSoftDelete()`

**Purpose:** Atomically soft-delete multiple songs. Updates `deleted_at` and `updated_at` on all specified IDs within a single transaction.

**Signature:**

```
bulkSoftDelete(ids: string[]): Promise<void>
```

**Contract:**

- If `ids` is empty, return immediately (no-op)
- Execute within `DatabaseConnection.transaction()` (Rule 4.8 — multi-row writes must be atomic)
- For each ID: `UPDATE songs SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`
- All IDs get the same `deleted_at` and `updated_at` timestamp (single `new Date().toISOString()` value)
- Already-deleted items (`WHERE deleted_at IS NOT NULL`) are silently skipped — the operation is idempotent
- Does NOT cascade to `song_artists` (junction table has no `deleted_at` column by design)
- Does NOT cascade to `artists` (artist lifecycle is independent per schema)

**Why bulk-specific SQL:** Using `IN (...)` with parameterized queries is more efficient than N individual `softDelete()` calls. The transaction wrapper ensures atomicity — if any update fails, all are rolled back.

### 6.2 `ArtistRepository.bulkSoftDelete()`

**Purpose:** Atomically soft-delete multiple artists within a single transaction.

**Signature:**

```
bulkSoftDelete(ids: string[]): Promise<void>
```

**Contract:** Identical to `SongRepository.bulkSoftDelete()` — transaction-gated, same timestamp for all, idempotent (skips already-deleted artists).

### 6.3 `useDeletedSongs()` — Query Hook

**Purpose:** Fetch all soft-deleted songs with their artist information, for display in TrashScreen.

**Signature:**

```
export function useDeletedSongs(): UseQueryResult<SongWithArtists[]>
```

**Query key:** `['songs', 'deleted']`

**Behavior:**

- Calls `SongRepository.findAllIncludingDeleted()` (already implemented)
- Filters in-memory to only songs where `deleted_at !== null`
- Hydrates each song with artists via `SongRepository.findSongWithArtists()`
- Sorts by `deleted_at` descending (most recently deleted first)
- Uses `staleTime: 30_000` (consistent with other store queries)

### 6.4 `useBulkDeleteSong()` — Mutation Hook

**Purpose:** Atomically soft-delete multiple songs and invalidate queries.

**Signature:**

```
export function useBulkDeleteSong(): UseMutationResult<void, Error, string[]>
```

**Behavior:**

- Calls `SongRepository.bulkSoftDelete(ids)`
- On success: invalidates `['songs']` and `['songs', 'deleted']` query keys
- Returns void on success, throws `Error` on failure

---

## 7. Data Flow

### 7.1 Single Delete (Already Implemented — Included for Reference)

```
SongDetailDialog (user clicks "Delete")
  → confirmation dialog (user clicks "Delete")
  → useDeleteSong.mutateAsync(song.id)
    → SongRepository.softDelete(id)
      → UPDATE songs SET deleted_at = NOW(), updated_at = NOW() WHERE id = ? AND deleted_at IS NULL
    → onSuccess: invalidateQueries(['songs'])
  → CategoryScreen: deleted item disappears from active list
```

### 7.2 Bulk Delete (New — Infrastructure Only, No UI Trigger Yet)

```
Future: TableView selection checkboxes → selected IDs
  → useBulkDeleteSong.mutateAsync(ids)
    → SongRepository.bulkSoftDelete(ids)
      → db.transaction(tx => {
          for each id: tx.execute(UPDATE songs SET deleted_at = ?, updated_at = ? WHERE ...)
        })
    → onSuccess: invalidateQueries(['songs'], ['songs', 'deleted'])
```

### 7.3 TrashScreen Restore

```
TrashScreen (user clicks "Restore" on a deleted song)
  → useRestoreSong.mutateAsync(song.id)
    → SongRepository.restore(id)
      → UPDATE songs SET deleted_at = NULL, updated_at = NOW() WHERE id = ? AND deleted_at IS NOT NULL
    → onSuccess: invalidateQueries(['songs'], ['songs', 'deleted'])
  → TrashScreen: restored item disappears from trash list, reappears in active category
```

### 7.4 Trash Nav

```
Sidebar "Trash" link (always visible)
  → navigate('/trash')
  → AppRouter matches /trash route → renders <TrashScreen />
  → TrashScreen mounts → useDeletedSongs() fires query
```

---

## 8. State Changes

### 8.1 Zustand / React Query State

| Mutation | Queries Invalidated | Effect |
|----------|--------------------|--------|
| `softDelete(id)` | `['songs']` | Deleted song removed from active category view |
| `bulkSoftDelete(ids)` | `['songs']`, `['songs', 'deleted']` | Deleted songs removed from active view, trash list refetched |
| `restore(id)` | `['songs']`, `['songs', 'deleted']` | Restored song reappears in active category, removed from trash |
| Song CRUD (create/update) | `['songs']` (already implemented) | No change to this spec |

### 8.2 UI State Within TrashScreen

| State | Condition | Rendering |
|-------|-----------|-----------|
| **Loading** | `useDeletedSongs().isLoading === true` | MUI `CircularProgress` centered |
| **Empty** | `useDeletedSongs().data.length === 0` | MUI `Typography` "Trash is empty" with `@mui/icons-material/DeleteOutline` icon |
| **Error** | `useDeletedSongs().isError === true` | MUI `Alert severity="error"` with `error.message` |
| **Data** | `useDeletedSongs().data.length > 0` | MUI `Table` (virtualized) — one row per deleted song |
| **Restoring** | `useRestoreSong().isPending === true` for a specific ID | That row shows a `CircularProgress` instead of the Restore button |

### 8.3 Database State

| Operation | `songs.deleted_at` | `songs.updated_at` | `song_artists.updated_at` |
|-----------|--------------------|--------------------|----------------------------|
| softDelete | set to NOW() | set to NOW() | **NOT modified** (junction table has no soft-delete by design) |
| bulkSoftDelete | set to NOW() (same timestamp for all) | set to NOW() | **NOT modified** |
| restore | set to NULL | set to NOW() | **NOT modified** |

The `updated_at` changes trigger the dirty state tracker (see 03_SYNC_STATE_MACHINE.md §3), ensuring sync picks up trash/restore operations as changes that must propagate to the cloud.

---

## 9. Database Changes

**No schema changes.** All `deleted_at` columns already exist (migration 002). No new migrations, tables, or columns. No PRAGMA changes.

### SQL Summary

**New SQL in SongRepository:**
```
-- bulkSoftDelete(ids)
-- Within transaction, for each id:
UPDATE songs SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL
```

**New SQL in ArtistRepository:**
```
-- bulkSoftDelete(ids)
-- Within transaction, for each id:
UPDATE artists SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL
```

**New SQL in TrashScreen/useDeletedSongs:**
No new repository methods. Uses existing `findAllIncludingDeleted()` and filters in-memory:
```
-- Already exists in SongRepository
SELECT * FROM songs ORDER BY updated_at DESC
-- Application-layer filter: song.deleted_at !== null
```

---

## 10. Error Handling

### 10.1 Repository Layer

| Scenario | Behavior |
|----------|----------|
| `bulkSoftDelete([])` | Return immediately, no-op (no DB call) |
| `bulkSoftDelete()` with an ID that doesn't exist | Silently skipped — `WHERE id = ? AND deleted_at IS NULL` matches zero rows. No error. |
| `bulkSoftDelete()` with an already-deleted ID | Silently skipped — `WHERE deleted_at IS NULL` excludes it. No error. |
| Transaction failure (DB locked, constraint violation) | `DatabaseConnection.transaction()` rolls back automatically. Error propagated to caller. |
| `restore()` on non-existent ID | Silently skipped — `WHERE deleted_at IS NOT NULL` matches zero rows. No error. |
| `restore()` on already-active song | Silently skipped — already has `deleted_at IS NULL`. No error. |

### 10.2 Store / Hook Layer

| Scenario | Behavior |
|----------|----------|
| `useBulkDeleteSong` mutation fails | Error propagated to component via `mutation.error`. TrashScreen shows Snackbar/Alert. |
| `useRestoreSong` mutation fails | Caught in TrashScreen's try/catch. Shows error Snackbar. Item remains in trash list. |
| `useDeletedSongs` query fails | TrashScreen renders error state (MUI Alert + retry button). |

### 10.3 UI Layer (TrashScreen)

- Restore button must show loading state (`isPending`) using `useRestoreSong().isPending` combined with the currently-restoring ID
- Error Snackbar with `autoHideDuration={6000}` follows the pattern in `SongDetailDialog` (lines 135-147)
- No optimistic updates — mutations invalidate queries on success only

---

## 11. Logging Requirements

| Layer | Level | Event |
|-------|-------|-------|
| `SongRepository.bulkSoftDelete` | `debug` | `"SongRepository: bulk soft-deleting N songs (X already deleted)"` — count of IDs attempted vs. skipped |
| `ArtistRepository.bulkSoftDelete` | `debug` | `"ArtistRepository: bulk soft-deleting N artists (X already deleted)"` |
| TrashScreen | None required | Existing user-facing error messages are sufficient |
| `useDeleteSong` / `useRestoreSong` | None required | Already implemented; no change |

Use `console.debug` for repository-layer logging (consistent with existing `SongRepository` pattern — no logging library).

---

## 12. Security Requirements

- No new security concerns. The soft-delete pattern operates on existing SQL tables with existing access patterns.
- TrashScreen reads deleted items from the local database only — no cloud access, no OAuth required.
- No authentication gates — if the user is authenticated to the app, they can access the Trash view.
- No data leaves the device during trash operations (soft-delete and restore are local SQL operations; sync propagates changes later via the sync engine).

---

## 13. Acceptance Criteria

All 5 E-12 tasks have identical acceptance criteria per the epic document:

| ID | Criterion |
|----|-----------|
| AC-01 | User can soft-delete a song from the detail dialog (confirmed with confirmation step) |
| AC-02 | `SongRepository.bulkSoftDelete()` atomically sets `deleted_at` on multiple songs within a transaction |
| AC-03 | `ArtistRepository.bulkSoftDelete()` atomically sets `deleted_at` on multiple artists within a transaction |
| AC-04 | TrashScreen displays all soft-deleted songs with: song name, artist(s), album, language, date deleted |
| AC-05 | TrashScreen shows loading spinner while fetching deleted items |
| AC-06 | TrashScreen shows "Trash is empty" when no deleted items exist |
| AC-07 | TrashScreen shows error state when query fails |
| AC-08 | Each deleted song row has a "Restore" action button |
| AC-09 | Clicking "Restore" clears `deleted_at`, invalidates queries, and the song reappears in the active category view |
| AC-10 | Bulk soft-delete is idempotent — deleting already-deleted items is a no-op |
| AC-11 | Sidebar has a "Trash" nav link between CategoryNav and Settings |
| AC-12 | Clicking "Trash" navigates to `/trash` and renders TrashScreen |
| AC-13 | TrashScreen renders within `MainLayout` (sidebar + outlet pattern) |
| AC-14 | Delete and restore operations survive app restart (confirmed by re-querying after page reload) |

---

## 14. Test Cases

### 14.1 SongRepository.bulkSoftDelete() — Unit Tests

Place in `packages/shared/src/data/repositories/__tests__/SongRepository.test.ts` (after existing `softDelete()` describe block).

| ID | Test | Assertions |
|----|------|------------|
| BS-01 | `bulkSoftDelete()` with empty array is a no-op | Zero calls to `mock.execute` or `mock.transaction` |
| BS-02 | `bulkSoftDelete()` wraps in transaction | `mock.transaction` is called once |
| BS-03 | `bulkSoftDelete()` updates `deleted_at` and `updated_at` on each ID | Inside transaction callback: calls to `tx.execute` per ID with `UPDATE songs SET deleted_at = ?, updated_at = ?` |
| BS-04 | All IDs get the same timestamp | Within a single `bulkSoftDelete()` call, all `params[0]` values (deleted_at) are identical |
| BS-05 | Each update uses `WHERE id = ? AND deleted_at IS NULL` | All `tx.execute` calls contain `WHERE id = ? AND deleted_at IS NULL` |
| BS-06 | Already-deleted items are skipped | When a mock query returns a song with `deleted_at !== null`, the UPDATE does not execute for that ID (or the WHERE clause prevents it) |
| BS-07 | Returns `Promise<void>` | Result type is void, method returns a Promise |
| BS-08 | Single-ID bulk delete behaves like `softDelete()` | Same parameter pattern as existing `softDelete()` test — one UPDATE call inside transaction |

### 14.2 ArtistRepository.bulkSoftDelete() — Unit Tests

Place in `packages/shared/src/data/repositories/__tests__/ArtistRepository.test.ts` (after existing `softDelete()` describe block).

| ID | Test | Assertions |
|----|------|------------|
| AB-01 | `bulkSoftDelete()` with empty array is a no-op | Zero calls to `mock.execute` or `mock.transaction` |
| AB-02 | `bulkSoftDelete()` wraps in transaction | `mock.transaction` is called once |
| AB-03 | `bulkSoftDelete()` updates `deleted_at` and `updated_at` on each ID | Inside transaction: calls to `tx.execute` per ID with `UPDATE artists SET deleted_at = ?, updated_at = ?` |

### 14.3 Existing Tests — No Regression

| Repository | Verify |
|------------|--------|
| `SongRepository` | All existing `softDelete()`, `restore()`, `findAll()`, `findAllIncludingDeleted()` tests still pass |
| `ArtistRepository` | All existing `softDelete()`, `restore()`, `findAll()` tests still pass |
| `useDeleteSong` | Hook mutation still works (no API change) |
| `useRestoreSong` | Hook mutation still works (no API change) |
| `SongDetailDialog` | Delete confirmation dialog and delete flow unchanged |

### 14.4 TrashScreen — Integration Tests

Place in `packages/renderer/src/screens/__tests__/TrashScreen.test.tsx`.

| ID | Test | Setup | Assertions |
|----|------|-------|------------|
| TS-01 | Renders loading state | Mock `useDeletedSongs` returning `{ isLoading: true }` | `CircularProgress` or role="progressbar" exists |
| TS-02 | Renders empty state | Mock `useDeletedSongs` returning `{ data: [] }` | Text "Trash is empty" visible |
| TS-03 | Renders deleted song rows | Mock returning 3 deleted songs with artists | 3 rows visible; each row shows song name, artist(s), album, language, date deleted |
| TS-04 | Renders error state | Mock `useDeletedSongs` returning `{ isError: true, error: new Error('DB error') }` | Alert with "DB error" visible |
| TS-05 | Restore button triggers mutation | Mock `useRestoreSong` | Clicking Restore calls `mutateAsync` with correct song ID |
| TS-06 | Restore button shows loading state | Mock `useRestoreSong` with `{ isPending: true }` for specific ID | Row shows spinner instead of Restore button |
| TS-07 | TrashScreen uses MainLayout | Test render within MemoryRouter | No full-page takeover; layout is preserved |

Test mocking strategy: Use Jest to mock `useSongsStore` module, controlling `useDeletedSongs` and `useRestoreSong` return values. Wrap component in `HashRouter` with `MemoryRouter` from react-router-dom.

---

## 15. Definition of Done

Per PROJECT_CONSTITUTION.md Section 26 (Task-Level DoD):

1. **Implemented:** All acceptance criteria AC-01 through AC-14 are met
2. **Self-reviewed:** Diff reviewed; no debugging artifacts, console.logs, commented-out code
3. **Tested:** All test cases in Section 14 pass. `pnpm test` produces zero failures. No regression in existing tests.
4. **Platform verified:** TrashScreen renders correctly in both Electron BrowserWindow and Capacitor WebView. Soft-delete/restore SQL executes correctly on both `better-sqlite3` and `@capacitor-community/sqlite`.
5. **No new lint errors:** `pnpm lint` passes with zero warnings. `pnpm typecheck` passes with zero errors.
6. **No hardcoded data:** No inline SQL strings in renderer code. No platform conditionals. No magic strings.
7. **Agent rules compliant:** Virtualization (Rule 8.1) on TrashScreen table. Transaction wrapping for `bulkSoftDelete` (Rule 4.8). `.tsx` extension for TrashScreen (Rule 11.6). No platform imports in renderer (Rule 13.4).
8. **Constitution compliant:** Soft-delete only — no hard deletes. Indefinite trash retention (FR-SONG-07). TrashScreen is a ContentArea screen (per 01_ARCHITECTURE.md §5 navigation structure).

---

## 16. Implementation Notes

### 16.1 TrashScreen Table Columns

| Column | Source Field | Width |
|--------|-------------|-------|
| Song Name | `song.name` | flex 3 |
| Artist(s) | `song.artists.map(a => a.display_name).join(', ')` | flex 2 |
| Album | `song.album_name ?? '—'` | flex 2 |
| Language | Resolved from `language_id` via languages table (passed as prop or queried) | fixed 120px |
| Date Deleted | `song.deleted_at` formatted as locale date string | fixed 130px |
| Actions | Restore button | fixed 100px |

### 16.2 Virtualization Requirements

Per AD-02 and Rule 8.1, the TrashScreen table MUST use `@tanstack/react-virtual` if it could render more than 100 deleted items. Use the established patterns:
- `useVirtualizer({ count, getScrollElement, estimateSize: () => 48, overscan: 5, measureElement })`
- Scroll container must have fixed height and `overflow: auto` (Rule 8.2)
- Rows use `position: absolute; transform: translateY()` (Rule 8.3)

### 16.3 MUI Component Usage

TrashScreen must use the same MUI v6 patterns as existing components:
- `Table` / `TableHead` / `TableBody` / `TableRow` / `TableCell` for the data table
- `Dialog` / `DialogTitle` / `DialogContent` / `DialogActions` for confirmation dialogs
- `Snackbar` + `Alert` for error notifications
- `Button variant="outlined"` for Restore action
- `CircularProgress` for loading state

### 16.4 Sidebar Trash Link

Add between `CategoryNav` and the Settings `Divider` in `Sidebar.tsx`. Use:
- Icon: `DeleteOutline` from `@mui/icons-material`
- In collapsed mode: `Tooltip`-wrapped `IconButton`
- In expanded mode: `ListItemButton` with `ListItemIcon` + `ListItemText`
- Active state: highlight when `location.pathname === '/trash'`
- Navigate: `navigate('/trash')`

### 16.5 Existing Code NOT to Modify

The following implementations are complete and must not be altered in this spec:
- `SongRepository.softDelete(id)` — already correct
- `SongRepository.restore(id)` — already correct
- `SongRepository.findAllIncludingDeleted()` — already correct
- `ArtistRepository.softDelete(id)` — already correct
- `ArtistRepository.restore(id)` — already correct
- `ArtistRepository.findAllIncludingDeleted()` — already correct
- `useDeleteSong()` hook — already correct
- `useRestoreSong()` hook — already correct
- `SongDetailDialog` delete confirmation UI — already correct
- `CategoryScreen` `handleDelete` callback — already correct

### 16.6 SongArtistRepository

No changes to `SongArtistRepository`. The junction table `song_artists` has no `deleted_at` column by design (constitution 02_DATABASE_SCHEMA.md §14.3). When a song is soft-deleted, junction rows remain intact and are restored when the song is restored. LWW sync handles junction table conflicts via `updated_at`.

### 16.7 Dirty State Tracking

Soft-delete and restore operations set `updated_at` on the affected rows. This triggers the existing `DirtyStateTracker` (03_SYNC_STATE_MACHINE.md §3) because `MAX(updated_at) > last_successful_sync`. No additional dirty-state wiring is needed — the existing tracker uses `MAX(updated_at)` across all entity tables.

---

_End of E12 Implementation Specification_
