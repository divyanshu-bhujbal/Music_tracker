# E08 Pass A: Search & Filter Engine — Implementation Specification

> **Source epic:** [E-08_SEARCH_FILTER.md](../epics/E-08_SEARCH_FILTER.md) — tasks T-08.3, T-08.4, T-08.7
> **Prerequisites:** E-07 (Songs UI) — COMPLETE; E-06 (Songs Data) — COMPLETE
> **Blocks:** E08 Pass B (SearchBar, ColumnFilterPopover, FilterBar UI)
> **Platform impact:** NONE — pure TypeScript in `@collectio/shared`

---

## 1. Goal

Implement `FilterEngine` and `SortEngine` — pure TypeScript modules that construct parameterized SQL WHERE and ORDER BY clauses for the Songs category. These engines are consumed by `SongRepository` (new `findFiltered` method) to enable global search, column filtering, filter composition (AND logic), and single-column sort.

---

## 2. Scope

| Task | Summary |
|------|---------|
| T-08.3 | `FilterEngine` — builds SQL WHERE clause from search text + column filter values. Returns `{ whereClause: string; params: unknown[] }`. Supports AND composition between filters and OR across global search fields. |
| T-08.4 | `SortEngine` — builds SQL ORDER BY clause from column key + direction. Validates against `CategoryDefinition.tableColumns`. Returns `{ orderByClause: string }`. |
| — | New `SongRepository.findFiltered()` method that consumes the engine's output |
| — | New `useFilteredSongs()` hook in `useSongsStore` that wires the engine into the query layer |
| T-08.7 | Unit tests for `FilterEngine` and `SortEngine` |

---

## 3. Out of Scope

- SearchBar UI (TextField) — E08 Pass B
- ColumnFilterPopover UI (Popover + Checkbox list) — E08 Pass B
- FilterBar UI (Clear All, active filter chips) — E08 Pass B
- Active filter indicators on column headers — E08 Pass B
- TableView rendering of filtered results — E-15 (UI Shell)
- Debouncing search input — E08 Pass B (the engine is synchronous; debouncing is a UI concern)
- Category-agnostic search (Books, Movies) — V2. The engine accepts `CategoryDefinition` as input so it works for any category, but V1 only has Songs.

---

## 4. Files To Create

| # | File | Package |
|---|------|---------|
| 1 | `packages/shared/src/application/search/FilterEngine.ts` | `@collectio/shared` |
| 2 | `packages/shared/src/application/search/SortEngine.ts` | `@collectio/shared` |
| 3 | `packages/shared/src/application/search/__tests__/FilterEngine.test.ts` | `@collectio/shared` |
| 4 | `packages/shared/src/application/search/__tests__/SortEngine.test.ts` | `@collectio/shared` |

---

## 5. Files To Modify

| # | File | Change |
|---|------|--------|
| 1 | `packages/shared/src/application/index.ts` | Add `export { FilterEngine } from './search/FilterEngine.js'` and `export { SortEngine } from './search/SortEngine.js'` |
| 2 | `packages/shared/src/index.ts` | Add `export { FilterEngine } from './application/search/FilterEngine.js'` and `export { SortEngine } from './application/search/SortEngine.js'` |
| 3 | `packages/shared/src/data/repositories/SongRepository.ts` | Add `findFiltered()` method |
| 4 | `packages/renderer/src/categories/songs/store/useSongsStore.ts` | Add `useFilteredSongs()` hook |

---

## 6. Interfaces

### 6.1 `FilterEngine`

Purpose: Build a parameterized SQL WHERE clause from global search text and per-column filter values.

**Static method:**

```
FilterEngine.buildFilter(
  category: Pick<CategoryDefinition, 'searchFields' | 'filterFields'>,
  searchText: string,
  columnFilters: Record<string, string[]>
): FilterResult
```

**Input:**
- `category`: The active `CategoryDefinition` — provides `searchFields` (column keys for global text search) and `filterFields` (column filter definitions)
- `searchText`: Raw user input from the search bar. Empty string means "no search".
- `columnFilters`: Map of column `key` → array of selected filter values (e.g., `{ language_id: ["English", "Japanese"], album_name: ["Abbey Road"] }`). Missing keys or empty arrays mean "no filter on that column".

**Return type (`FilterResult`):**

```
FilterResult {
  whereClause: string     // SQL fragment: "WHERE (s.name LIKE ? OR s.album_name LIKE ?) AND (s.language_id IN (SELECT id FROM languages WHERE name IN (?, ?)))"
  params: unknown[]       // Parameterized values matching ? placeholders in order
}
```

If no filters and no search text, `whereClause` is `""` (empty string) and `params` is `[]`. The caller prepends `WHERE` or appends to the base query.

**Key behaviors:**
- Global search: For each field in `searchFields`, adds `field LIKE '%' || ? || '%'` with the search text as parameter. Combines with `OR`.
- Column filter: For each non-empty entry in `columnFilters`, adds `field IN (?, ?, ...)` for the list of values. Combines with `AND`.
- Both active: `(global_search_OR_group) AND (filter1) AND (filter2) ...`
- Escape: The engine uses LIKE with `%` concatenation via SQL `||` operator. The search text is passed as a parameter — SQLite handles safe parameter binding. No custom escaping needed.
- All input is parameterized: User-provided values go into the `params` array. The `whereClause` string contains only `?` placeholders.

### 6.2 `SortEngine`

Purpose: Build a SQL ORDER BY clause from a column key and sort direction.

**Static method:**

```
SortEngine.buildSort(
  columnKey: string | null,
  direction: 'asc' | 'desc',
  columns: ColumnDefinition[]
): SortResult
```

**Input:**
- `columnKey`: The column to sort by, or `null` for default sort
- `direction`: Sort direction
- `columns`: The category's `tableColumns` array — validates the sort column exists and is sortable

**Return type (`SortResult`):**

```
SortResult {
  orderByClause: string   // SQL fragment: "ORDER BY name ASC" or "ORDER BY updated_at DESC" (default)
}
```

**Key behaviors:**
- Valid column + `sortable: true` → `ORDER BY <column_key> <ASC|DESC>`
- `null` columnKey → default sort: `ORDER BY updated_at DESC`
- Column not found or `sortable: false` → default sort (graceful degradation, no throw)
- Direction: `'asc'` or `'desc'` only. Invalid values → default direction (desc)

### 6.3 `SongRepository.findFiltered()` (new method)

Add to the existing `SongRepository` class:

```
findFiltered(
  filter: FilterResult,
  sort: SortResult
): Promise<Song[]>
```

**Implementation:** Builds the full SQL: `SELECT * FROM songs WHERE deleted_at IS NULL` + `filter.whereClause` + `sort.orderByClause`. Passes `filter.params` to `this.db.query<Song>()`. Combines the `deleted_at IS NULL` base filter with the engine's where clause using `AND`.

**Always filters soft-deleted rows** — `deleted_at IS NULL` is prepended before any user filter.

### 6.4 `useFilteredSongs()` (new hook)

Add to `useSongsStore`:

```
useFilteredSongs(
  searchText: string,
  columnFilters: Record<string, string[]>,
  sortKey: string | null,
  sortDirection: 'asc' | 'desc'
): { data: SongWithArtists[]; isLoading: boolean; error: Error | null }
```

**Implementation:** Calls `FilterEngine.buildFilter()`, `SortEngine.buildSort()`, then `SongRepository.findFiltered()`, then enriches with artists via `findSongWithArtists()`. Uses TanStack Query with a composite cache key: `['songs', 'filtered', searchText, columnFilters, sortKey, sortDirection]`.

---

## 7. Data Flow

```
User types in SearchBar / selects filter values (E08 Pass B)
  │
  ▼
useFilteredSongs(searchText, columnFilters, sortKey, sortDirection)
  │
  ├─ 1. FilterEngine.buildFilter(category, searchText, columnFilters)
  │      → { whereClause, params }
  │
  ├─ 2. SortEngine.buildSort(sortKey, sortDirection, columns)
  │      → { orderByClause }
  │
  ├─ 3. SongRepository.findFiltered(filter, sort)
  │      → Song[]
  │
  └─ 4. For each Song: SongRepository.findSongWithArtists(id)
         → SongWithArtists[]
```

The engine is called synchronously every time the hook's input changes. TanStack Query deduplicates identical queries. Debouncing is the UI's responsibility (E08 Pass B).

---

## 8. State Changes

**NONE.** `FilterEngine` and `SortEngine` are stateless pure functions. They compute output from input — no internal state, no side effects, no mutations.

The new `useFilteredSongs()` hook uses TanStack Query cache (keyed by filter parameters). This is the same caching pattern as existing store hooks.

---

## 9. Database Changes

**NONE.** The engine produces SQL fragments consumed by `SongRepository` which queries existing tables (`songs`, `artists`, `song_artists`, `languages`). No schema changes. No new indexes. No new migrations.

---

## 10. Error Handling

| Scenario | Handling |
|----------|----------|
| `FilterEngine.buildFilter()` called with empty `searchText` and empty `columnFilters` | Returns `{ whereClause: "", params: [] }` — no filtering |
| `FilterEngine.buildFilter()` called with `searchText` but no `searchFields` defined | Returns `{ whereClause: "", params: [] }` — no fields to search |
| `FilterEngine.buildFilter()` called with column key not in `filterFields` | Ignores unknown keys silently — no error |
| `SortEngine.buildSort()` with `null` columnKey | Returns default sort (`ORDER BY updated_at DESC`) |
| `SortEngine.buildSort()` with column not in `columns` array | Returns default sort |
| `SortEngine.buildSort()` with column where `sortable: false` | Returns default sort |
| `SortEngine.buildSort()` with invalid direction string | Returns default sort direction (`desc`) |
| Empty filter value array for a column | That column is excluded from WHERE clause |
| `searchText` contains SQL metacharacters (`%`, `_`, `'`) | Safe — passed as parameter, not string-interpolated |

**No throwing.** The engine functions return valid (possibly neutral) results for all inputs. This follows the architecture's "reliability over novelty" principle — a malformed input degrades to no-filter rather than crashing.

---

## 11. Logging Requirements

**NONE.** The engine is pure computation with no I/O, no async operations, no fallible external dependencies.

---

## 12. Security Requirements

- **SQL injection prevention:** All user-provided values go into the `params: unknown[]` array. The `whereClause` string contains only `?` placeholders and SQL keywords. Never concatenate user input into SQL strings (Rule 4.7). The `SongRepository.findFiltered()` method passes `filter.params` directly to `this.db.query<Song>(sql, params)`.
- **No credential access:** The engine has zero access to `AuthProvider`, `CryptoProvider`, or `SecureStorageProvider`.
- **No logging of filter values:** Filter values (song names, artist names) are not logged.

---

## 13. Acceptance Criteria

| # | Criterion | Verifies |
|---|-----------|----------|
| AC-01 | `FilterEngine.buildFilter()` returns `{ whereClause, params }` for all inputs | T-08.3 interface |
| AC-02 | Empty `searchText` + empty `columnFilters` → `{ whereClause: "", params: [] }` | No-op filter |
| AC-03 | `searchText: "hello"` + `searchFields: ["name", "album_name"]` → WHERE with 2 LIKE clauses joined by OR | Global search |
| AC-04 | `columnFilters: { language_id: ["en", "ja"] }` → WHERE with IN clause | Column filter |
| AC-05 | Both search + column filter → combined with AND | Filter composition |
| AC-06 | Multiple column filters → combined with AND between columns | AND logic (FR-SEARCH-04) |
| AC-07 | All values in `columnFilters` appear as `?` parameters in order | Parameterization |
| AC-08 | `searchText` appears as a `?` parameter, not inline | SQL injection safety |
| AC-09 | `SortEngine.buildSort("name", "asc", columns)` → `ORDER BY name ASC` | Sort clause |
| AC-10 | `SortEngine.buildSort(null, "desc", columns)` → `ORDER BY updated_at DESC` | Default sort |
| AC-11 | `SortEngine.buildSort("nonexistent", "asc", columns)` → `ORDER BY updated_at DESC` | Invalid column fallback |
| AC-12 | `SortEngine.buildSort("added_at", "invalid", columns)` → `ORDER BY added_at DESC` | Invalid direction fallback |
| AC-13 | `SortEngine.buildSort("selection", "asc", columns)` → default sort (selection is not sortable) | Non-sortable column |
| AC-14 | `SongRepository.findFiltered()` queries with combined WHERE `deleted_at IS NULL AND {filter.whereClause}` | Soft-delete preserved |
| AC-15 | `useFilteredSongs()` returns `SongWithArtists[]` for a given filter | Store integration |
| AC-16 | Filter engine unit tests pass with ≥80% coverage | T-08.7 |
| AC-17 | Sort engine unit tests pass with ≥80% coverage | T-08.7 |
| AC-18 | `pnpm typecheck` passes with zero errors across all packages | Type safety |
| AC-19 | `pnpm lint` passes with zero errors on `packages/shared/` | Code quality |
| AC-20 | Existing shared + renderer tests continue to pass | No regressions |

---

## 14. Test Cases

### 14.1 FilterEngine Tests

**File:** `packages/shared/src/application/search/__tests__/FilterEngine.test.ts`

| # | Test | Input | Expected |
|---|------|-------|----------|
| FE-01 | Empty search + no filters | `searchText: ""`, `columnFilters: {}` | `{ whereClause: "", params: [] }` |
| FE-02 | Search with one search field | `searchText: "hello"`, `searchFields: ["name"]` | `whereClause` contains `name LIKE '%' \|\| ? \|\| '%'`; `params: ["hello"]` |
| FE-03 | Search with multiple search fields | `searchText: "hello"`, `searchFields: ["name", "album_name"]` | `whereClause` contains `(name LIKE ... OR album_name LIKE ...)`; `params` has 2 entries of `"hello"` |
| FE-04 | Single column filter with one value | `columnFilters: { language: ["English"] }` | `whereClause` contains `IN (?)`; `params: ["English"]` |
| FE-05 | Single column filter with multiple values | `columnFilters: { album_name: ["A", "B"] }` | `whereClause` contains `IN (?, ?)`; `params: ["A", "B"]` |
| FE-06 | Search + one column filter (AND composition) | `searchText: "x"`, `columnFilters: { lang: ["en"] }` | `whereClause` has `(search) AND (filter)` grouping |
| FE-07 | Two column filters (AND between columns) | `columnFilters: { lang: ["en"], album: ["A"] }` | `whereClause` has `(filter1) AND (filter2)` |
| FE-08 | All parameters in order | Combined search + multiple filters | `params` array matches `?` placeholder order |
| FE-09 | Empty filter value array ignored | `columnFilters: { lang: [] }` | That column produces no WHERE clause |
| FE-10 | Unknown column key in filter | `columnFilters: { nonexistent: ["x"] }` | Ignored; no clause added |
| FE-11 | Search with empty `searchFields` array | `searchText: "x"`, `searchFields: []` | `{ whereClause: "", params: [] }` |
| FE-12 | Search text with special chars | `searchText: "100% sure (test)"` | Text passed as parameter; no SQL injection |
| FE-13 | searchText is whitespace-only | `searchText: "   "` | Trimmed; if empty after trim → no search clause |
| FE-14 | Empty filterFields with active columnFilters | `filterFields: []`, `columnFilters: { x: ["y"] }` | `{ whereClause: "", params: [] }` — no filters defined |

### 14.2 SortEngine Tests

**File:** `packages/shared/src/application/search/__tests__/SortEngine.test.ts`

| # | Test | Input | Expected |
|---|------|-------|----------|
| SE-01 | Valid sortable column ascending | `columnKey: "name"`, `direction: "asc"`, `columns: [...]` | `{ orderByClause: "ORDER BY name ASC" }` |
| SE-02 | Valid sortable column descending | `columnKey: "name"`, `direction: "desc"` | `{ orderByClause: "ORDER BY name DESC" }` |
| SE-03 | Null columnKey → default | `columnKey: null`, `direction: "desc"` | `{ orderByClause: "ORDER BY updated_at DESC" }` |
| SE-04 | Column not in list → default | `columnKey: "nonexistent"`, `direction: "asc"` | `{ orderByClause: "ORDER BY updated_at DESC" }` |
| SE-05 | Column exists but `sortable: false` → default | `columnKey: "selection"` (sortable: false) | `{ orderByClause: "ORDER BY updated_at DESC" }` |
| SE-06 | Invalid direction → default direction | `direction: "sideways"` | `{ orderByClause: "ORDER BY name DESC" }` |
| SE-07 | Valid column with uppercase direction | `direction: "ASC"` | Should normalize to lowercase; `ORDER BY name ASC` |
| SE-08 | Empty columns array | `columns: []` | `{ orderByClause: "ORDER BY updated_at DESC" }` |

### 14.3 SongRepository.findFiltered() Tests

**Add to:** `packages/shared/src/data/repositories/__tests__/SongRepository.test.ts` (existing)

| # | Test | Expected |
|---|------|----------|
| SR-F-01 | `findFiltered()` with empty filter + default sort | Queries all active songs; WHERE has `deleted_at IS NULL` |
| SR-F-02 | `findFiltered()` with WHERE clause | SQL contains `WHERE deleted_at IS NULL AND (user_filter)` |
| SR-F-03 | `findFiltered()` with params | Params passed to `db.query()` |
| SR-F-04 | `findFiltered()` preserves soft-delete filter | `deleted_at IS NULL` always present |
| SR-F-05 | `findFiltered()` with sort | SQL ends with ORDER BY clause |

---

## 15. Definition of Done

Per `PROJECT_CONSTITUTION.md` Section 26 (Task-Level DoD):

1. **Implemented:** `FilterEngine`, `SortEngine`, `SongRepository.findFiltered()`, and `useFilteredSongs()` all complete.
2. **Self-reviewed:** Diff reviewed for:
   - No string interpolation of user values into SQL (all `?` placeholders)
   - `FilterResult.params` order matches `whereClause` placeholder order
   - Sort direction validation is case-insensitive
   - Default sort clause is consistent (`updated_at DESC`)
3. **Tested:** FE-01 through FE-14 and SE-01 through SE-08 pass. SR-F-01 through SR-F-05 pass. All existing tests pass.
4. **Platform verified:** `pnpm typecheck` across all 5 packages passes. No platform code.
5. **No new lint errors:** `pnpm lint` on shared + renderer packages passes.
6. **No hardcoded data:** Search/filter logic uses `CategoryDefinition` fields — no hardcoded column names in the engine.

### Gate Commands

```
pnpm --filter @collectio/shared typecheck
pnpm --filter @collectio/shared lint
pnpm --filter @collectio/shared test
pnpm --filter @collectio/renderer typecheck
pnpm --filter @collectio/renderer lint
pnpm --filter @collectio/renderer test
pnpm typecheck
```

---

## Appendix A: File Details

### A.1 `FilterEngine.ts`

- **Purpose:** Build parameterized SQL WHERE clauses from global search text and per-column filter selections.
- **Responsibility:** Accept `CategoryDefinition` (search/filter metadata), raw search text, and a column→values filter map. Produce a `FilterResult` with a SQL WHERE fragment and ordered parameter array. Never access the database. Never throw.
- **Public API:**
  - `FilterEngine.buildFilter(category, searchText, columnFilters): FilterResult` — static method
  - `FilterResult { whereClause: string; params: unknown[] }` — exported type

### A.2 `SortEngine.ts`

- **Purpose:** Build SQL ORDER BY clauses from a column key and sort direction.
- **Responsibility:** Accept a column key, direction, and `ColumnDefinition[]`. Validate the column exists and is sortable. Produce a `SortResult` with an ORDER BY fragment. Always return a valid clause — never throw, never return invalid SQL.
- **Public API:**
  - `SortEngine.buildSort(columnKey, direction, columns): SortResult` — static method
  - `SortResult { orderByClause: string }` — exported type

### A.3 `FilterEngine.test.ts`

- **Purpose:** Unit tests for `FilterEngine.buildFilter()`.
- **Responsibility:** Cover empty inputs, global search, column filters, AND composition, parameter ordering, edge cases (no search fields, no filter fields, unknown keys, special characters). Tests FE-01 through FE-14.
- **Public API:** None (test file).

### A.4 `SortEngine.test.ts`

- **Purpose:** Unit tests for `SortEngine.buildSort()`.
- **Responsibility:** Cover valid sort, default sort, invalid column, non-sortable column, invalid direction, case-insensitivity, empty columns. Tests SE-01 through SE-08.
- **Public API:** None (test file).

---

## Appendix B: Example FilterResult Outputs

### Example 1: No search, no filters
```
Input:  searchText="", columnFilters={}
Output: { whereClause: "", params: [] }
```

### Example 2: Global search only
```
Input:  searchText="hello", searchFields=["name", "album_name"]
Output: {
  whereClause: "WHERE (s.name LIKE '%' || ? || '%' OR s.album_name LIKE '%' || ? || '%')",
  params: ["hello", "hello"]
}
```

### Example 3: Column filter only
```
Input:  columnFilters={ language_id: ["English", "Japanese"] }
Output: {
  whereClause: "AND (l.name IN (?, ?))",
  params: ["English", "Japanese"]
}
```

### Example 4: Search + one filter (AND composition)
```
Input:  searchText="hello", searchFields=["name"],
        columnFilters={ album_name: ["Abbey Road"] }
Output: {
  whereClause: "WHERE (s.name LIKE '%' || ? || '%') AND (s.album_name IN (?))",
  params: ["hello", "Abbey Road"]
}
```

---

## Appendix C: SongRepository.findFiltered() SQL Assembly

The method combines the permanent soft-delete filter with the engine's where clause:

```
Base:    SELECT * FROM songs WHERE deleted_at IS NULL
+filter:  AND {filter.whereClause}
+sort:    {sort.orderByClause}
```

All `filter.params` are spread into the `db.query()` call after the SQL string.

---

## Appendix D: Key Design Decisions

### DD-01: Engine is stateless pure functions

`FilterEngine.buildFilter()` and `SortEngine.buildSort()` are static methods with zero side effects. This makes them trivially testable (no mocking, no setup) and allows the UI to call them synchronously on every keystroke without concern for stale state.

### DD-02: Engine never throws

Invalid inputs produce neutral results (empty WHERE, default sort). This ensures the app degrades gracefully — a misconfigured category definition shows all rows instead of crashing.

### DD-03: Filter params use positional `?` placeholders

SQLite supports positional parameters (`?`). The engine builds the `whereClause` and `params` array in lockstep — the Nth `?` maps to `params[N]`. This matches the existing repository pattern (`db.query(sql, params)`).

### DD-04: `deleted_at IS NULL` is always prepended

The SongRepository's `findFiltered()` method always adds the soft-delete filter BEFORE the engine's WHERE clause. This prevents accidentally showing soft-deleted items through filter bypass. The engine never needs to know about soft-delete semantics.

### DD-05: Column filter values use exact match (IN clause)

Per the Constitution, column filters use exact value matching ("user checks/unchecks values"). The engine uses `IN (?, ?, ...)` clauses, not LIKE. Global search uses LIKE for substring matching. This distinction matches the UX: search is fuzzy, filters are exact.

### DD-06: Store integration via new hook, not query modification

Rather than modifying the existing `useSongs()` hook (which would break its simple cache key), a new `useFilteredSongs()` hook is added to the store. This keeps the existing "all songs" query untouched and allows the filtered query to have its own TanStack Query cache key.

---

_End of Implementation Specification_
