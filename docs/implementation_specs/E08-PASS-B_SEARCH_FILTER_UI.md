# E08 Pass B: Search & Filter UI — Implementation Specification

> **Source epic:** [E-08_SEARCH_FILTER.md](../epics/E-08_SEARCH_FILTER.md) — tasks T-08.1, T-08.2, T-08.5, T-08.6
> **Prerequisites:** E08 Pass A (FilterEngine, SortEngine, useFilteredSongs) — COMPLETE
> **Blocks:** E-15 (UI Shell) integration — wiring into TableView/CategoryScreen
> **Platform impact:** NONE — pure React + MUI in `@collectio/renderer`

---

## 1. Goal

Implement the React + MUI search and filter UI components: a global search bar, per-column filter popovers with multi-select checkboxes, active filter indicator badges on column headers, and a filter bar with "Clear All" action. All components are controlled (state via props) and designed to be wired into E15's `TableView` and `CategoryScreen`.

---

## 2. Scope

| Task | Summary |
|------|---------|
| T-08.1 | `SearchBar` — MUI `TextField` with search icon. Fires `onChange` on every keystroke. Debounced at the consumer level (E15). Emits search text. |
| T-08.2 | `ColumnFilterPopover` — MUI `Popover` + `Checkbox` list. Loads unique values for a column from the database. Multi-select. Emits selected values. |
| T-08.5 | Active filter indicators — integrated into `ColumnFilterPopover` trigger. Shows badge count when column has active filters. Colored icon when `activeFilters > 0`. |
| T-08.6 | `FilterBar` — Horizontal bar with `Chip` components for each active filter + "Clear All" `Button`. Only visible when filters are active. |
| — | `useSearchFilterStore` — Zustand store holding search text, column filters, and sort state. Optional but recommended for E15 wiring. |
| — | `useColumnFilterValues` — TanStack Query hook that fetches unique values for a given column from the database. |

---

## 3. Out of Scope

- TableView rendering of filtered results — E-15
- CategoryScreen (host for SearchBar and FilterBar) — E-15
- Column header click → sort toggle — E-15 (TableView header)
- Debouncing search input — E-15 consumer wraps `SearchBar` with debounce
- Platform-specific adaptations (keyboard shortcuts for search focus) — E-15
- Wiring components into the full app shell — E-15 integration pass

---

## 4. Files To Create

| # | File | Package |
|---|------|---------|
| 1 | `packages/renderer/src/components/SearchBar.tsx` | `@collectio/renderer` |
| 2 | `packages/renderer/src/components/ColumnFilterPopover.tsx` | `@collectio/renderer` |
| 3 | `packages/renderer/src/components/FilterBar.tsx` | `@collectio/renderer` |
| 4 | `packages/renderer/src/components/index.ts` | `@collectio/renderer` |
| 5 | `packages/renderer/src/components/useSearchFilterStore.ts` | `@collectio/renderer` |
| 6 | `packages/renderer/src/components/useColumnFilterValues.ts` | `@collectio/renderer` |
| 7 | `packages/renderer/src/components/__tests__/SearchBar.test.tsx` | `@collectio/renderer` |
| 8 | `packages/renderer/src/components/__tests__/ColumnFilterPopover.test.tsx` | `@collectio/renderer` |
| 9 | `packages/renderer/src/components/__tests__/FilterBar.test.tsx` | `@collectio/renderer` |
| 10 | `packages/renderer/src/components/__tests__/useSearchFilterStore.test.ts` | `@collectio/renderer` |

---

## 5. Files To Modify

| # | File | Change |
|---|------|--------|
| 1 | `packages/renderer/src/index.ts` | Add `export { SearchBar, ColumnFilterPopover, FilterBar, useSearchFilterStore, useColumnFilterValues } from './components/index.js'` |

No changes to `@collectio/shared` — all Pass A engine exports are already in place.

---

## 6. Interfaces

### 6.1 `SearchBar`

**Props:**

```
SearchBarProps {
  value: string                       // current search text (controlled)
  onChange: (value: string) => void   // fires on every keystroke
  placeholder?: string                // default: "Search..."
  disabled?: boolean                  // disabled when no category has searchFields
}
```

**Behavior:**
- MUI `TextField` with `type="search"`, search icon adornment
- Controlled component — value comes from parent/Zustand store
- `onChange` fires on each keystroke (no internal debounce)
- Clear button (X) in the input when value is non-empty
- When `disabled`, the TextField is greyed out

### 6.2 `ColumnFilterPopover`

**Props:**

```
ColumnFilterPopoverProps {
  columnKey: string                   // e.g., "language_id", "album_name"
  columnLabel: string                 // e.g., "Language", "Album"
  filterable: boolean                 // from ColumnDefinition
  values: string[]                    // unique values for this column (fetched externally)
  selectedValues: string[]            // currently selected filter values
  onChange: (columnKey: string, values: string[]) => void  // emits on checkbox toggle
  isLoading?: boolean                 // loading state for unique values
}
```

**Behavior:**
- Trigger: MUI `IconButton` with filter icon (e.g., `FilterListIcon`)
- When `selectedValues.length > 0`: icon color changes to primary color + `Badge` shows count (T-08.5)
- When `filterable === false`: trigger is not rendered (returns `null`)
- Popover: MUI `Popover` anchored to the trigger button
- Content: `FormGroup` with `FormControlLabel` + `Checkbox` for each unique value
- "Select All" / "Deselect All" helper buttons at the top of the popover
- Empty state: "No values available" text when `values` is empty and not loading
- Close on click-away (MUI Popover default)

### 6.3 `FilterBar`

**Props:**

```
FilterBarProps {
  columnFilters: Record<string, string[]>   // all active column filters
  columnLabels: Record<string, string>       // column key → display label
  onRemoveFilter: (columnKey: string, value: string) => void  // remove single value
  onRemoveColumn: (columnKey: string) => void   // remove all values for a column
  onClearAll: () => void                     // clear all filters
}
```

**Behavior:**
- Rendered as a horizontal bar (MUI `Stack` or `Box` flex row)
- Each active filter value: `Chip` with label `"Column: Value"`, delete button calls `onRemoveFilter`
- Group chips by column with subtle visual grouping or separator
- "Clear All" `Button` (variant: "text", size: "small") at the end
- Hidden when `columnFilters` has zero entries
- Single row that wraps if overflow

### 6.4 `useSearchFilterStore` (Zustand Store)

**Store shape:**

```
SearchFilterState {
  searchText: string
  columnFilters: Record<string, string[]>
  sortKey: string | null
  sortDirection: 'asc' | 'desc'
  
  // Actions
  setSearchText: (text: string) => void
  toggleColumnFilter: (key: string, value: string) => void
  setColumnFilters: (key: string, values: string[]) => void
  clearColumnFilter: (key: string) => void
  clearAllFilters: () => void
  setSort: (key: string | null, direction: 'asc' | 'desc') => void
  clearSort: () => void
}
```

**Behavior:**
- Created via `create<SearchFilterState>()` from `zustand`
- Module-level singleton — no props, no context
- `toggleColumnFilter`: if value already in set → remove; else → add
- `clearAllFilters`: resets `columnFilters` to `{}` and `searchText` to `""`
- `clearSort`: resets to `sortKey: null, sortDirection: 'desc'`
- Sort direction cycling (`asc` → `desc` → null) is the responsibility of the caller (E15 TableView header click), not this store

### 6.5 `useColumnFilterValues` (TanStack Query Hook)

**Hook signature:**

```
useColumnFilterValues(columnKey: string): {
  values: string[]
  isLoading: boolean
  error: Error | null
}
```

**Behavior:**
- Fetches unique values for a given column from the database
- Uses TanStack Query with cache key `['column-values', columnKey]`
- For Songs category:
  - `"language_id"` → queries `LanguageRepository.findAll()` and extracts display names
  - `"album_name"` → queries `SongRepository` and extracts unique non-null album names
  - `"name"` → returns `[]` (song name filter uses search text, not multi-select)
  - `"artists"` → queries `ArtistRepository.findAll()` and extracts display names
- Stale time: 60 seconds (column values rarely change)
- Returns empty array while loading

### 6.6 Types Already Defined (Do Not Redefine)

- `ColumnDefinition`, `FilterDefinition` — `@collectio/shared`
- `CategoryDefinition` — `@collectio/shared`
- `FilterResult`, `SortResult` — `@collectio/shared`
- `Song`, `Artist`, `Language` — `@collectio/shared`

---

## 7. Data Flow

### 7.1 Search Flow

```
User types in SearchBar
  │
  ├─ onChange(text) → useSearchFilterStore.setSearchText(text)
  │
  └─ E15 consumer subscribes to store → passes searchText to useFilteredSongs()
       → FilterEngine.buildFilter() → SongRepository.findFiltered() → rerender table
```

### 7.2 Column Filter Flow

```
User clicks filter icon on column header (E15 renders ColumnFilterPopover trigger)
  │
  ├─ Popover opens
  ├─ useColumnFilterValues(columnKey) fetches unique values
  │   ├─ loading → show spinner
  │   └─ loaded → show checkbox list
  │
  ├─ User checks/unchecks values
  │   └─ onChange(columnKey, selectedValues) → useSearchFilterStore.setColumnFilters(key, values)
  │
  ├─ User clicks away → Popover closes
  │
  └─ Trigger icon shows Badge(count) when selectedValues.length > 0 (T-08.5)
```

### 7.3 FilterBar Flow

```
useSearchFilterStore.columnFilters changes
  │
  ├─ If has entries → FilterBar renders
  │   ├─ Chip for each filter value (e.g., "Language: English")
  │   │   └─ Delete click → onRemoveFilter(key, value)
  │   │       → useSearchFilterStore.toggleColumnFilter(key, value)
  │   │
  │   └─ "Clear All" click → onClearAll()
  │       → useSearchFilterStore.clearAllFilters()
  │
  └─ If no entries → FilterBar not rendered
```

### 7.4 Sort Flow (Store Only)

```
User clicks column header (E15)
  │
  ├─ Determine next state: null → "asc" → "desc" → null
  ├─ useSearchFilterStore.setSort(columnKey, direction)
  │
  └─ E15 consumer subscribes → passes sort to useFilteredSongs()
       → SortEngine.buildSort() → SongRepository.findFiltered() → rerender table
```

---

## 8. State Changes

### 8.1 `useSearchFilterStore` State Transitions

| Action | State Before | State After |
|--------|-------------|-------------|
| `setSearchText("hello")` | `searchText: ""` | `searchText: "hello"` |
| `setSearchText("")` | `searchText: "hello"` | `searchText: ""` |
| `toggleColumnFilter("lang", "en")` | `columnFilters: {}` | `columnFilters: { lang: ["en"] }` |
| `toggleColumnFilter("lang", "en")` | `columnFilters: { lang: ["en"] }` | `columnFilters: {}` |
| `toggleColumnFilter("lang", "ja")` | `columnFilters: { lang: ["en"] }` | `columnFilters: { lang: ["en", "ja"] }` |
| `setColumnFilters("lang", ["en", "ja"])` | any | `columnFilters: { lang: ["en", "ja"] }` |
| `clearColumnFilter("lang")` | `columnFilters: { lang: ["en"] }` | `columnFilters: {}` |
| `clearAllFilters()` | any | `searchText: ""`, `columnFilters: {}` |
| `setSort("name", "asc")` | `sortKey: null` | `sortKey: "name"`, `sortDirection: "asc"` |
| `clearSort()` | `sortKey: "name"` | `sortKey: null`, `sortDirection: "desc"` |

### 8.2 `useColumnFilterValues` Cache State

- **Cache key:** `['column-values', columnKey]`
- **Populated on:** First `useColumnFilterValues(columnKey)` call
- **Stale after:** 60 seconds
- **Invalidated on:** Entity creation that affects column values (handled by mutation `onSuccess` in `useSongsStore`)

---

## 9. Database Changes

**NONE.** `useColumnFilterValues` reads from existing tables via existing repositories. No schema changes. No migrations.

---

## 10. Error Handling

| Scenario | Component | Handling |
|----------|-----------|----------|
| `useColumnFilterValues` query fails | `ColumnFilterPopover` | Show "Failed to load values" message in popover. Checkboxes disabled. Retry on next open. |
| Disabled search (category has no searchFields) | `SearchBar` | `TextField` disabled with placeholder "Search unavailable" |
| Column with `filterable: false` | `ColumnFilterPopover` trigger | Not rendered (returns `null`) |
| All filter values deselected → empty array | `ColumnFilterPopover` | `onChange(columnKey, [])` clears that column's filter |
| Rapid checkbox toggling | `ColumnFilterPopover` | Each toggle calls `onChange` immediately — no batching needed (store handles state) |
| `ColumnFilterPopover` opened for column with zero values | `ColumnFilterPopover` | "No values available" message. No checkboxes. |

**No component throws.** All error states are surfaced in the UI, not as exceptions.

---

## 11. Logging Requirements

**NONE.** UI components — no logging needed for V1.

---

## 12. Security Requirements

**NONE.** UI components render filter values from the database. No credential handling, no token exposure, no PII. All database access goes through existing repositories (parameterized queries).

---

## 13. Acceptance Criteria

| # | Criterion | Verifies |
|---|-----------|----------|
| AC-01 | `SearchBar` renders MUI `TextField` with search icon | T-08.1 |
| AC-02 | `SearchBar` calls `onChange` on every keystroke | T-08.1 |
| AC-03 | `SearchBar` shows clear button when value is non-empty | T-08.1 |
| AC-04 | `SearchBar` is disabled when `disabled={true}` | T-08.1 |
| AC-05 | `ColumnFilterPopover` renders filter icon button | T-08.2 |
| AC-06 | Filter icon shows `Badge` with count when active filters > 0 (T-08.5) | Active indicator |
| AC-07 | Filter icon color changes to primary when active | Active indicator |
| AC-08 | Clicking filter icon opens `Popover` with checkbox list | T-08.2 |
| AC-09 | Checkbox list populated from `values` prop | T-08.2 |
| AC-10 | Checking a value calls `onChange` with updated selectedValues | T-08.2 |
| AC-11 | "Select All" / "Deselect All" buttons work | T-08.2 |
| AC-12 | Closing popover (click away) does not lose selection | T-08.2 |
| AC-13 | Loading state shows spinner while `isLoading` | T-08.2 |
| AC-14 | Empty values shows "No values available" | T-08.2 |
| AC-15 | `FilterBar` renders when `columnFilters` has entries | T-08.6 |
| AC-16 | Each filter value shown as `Chip` with column name + value | T-08.6 |
| AC-17 | Chip delete calls `onRemoveFilter` | T-08.6 |
| AC-18 | "Clear All" button calls `onClearAll` | T-08.6 / FR-SEARCH-06 |
| AC-19 | `FilterBar` hidden when no active filters | T-08.6 |
| AC-20 | `useSearchFilterStore.setSearchText()` updates state | Store |
| AC-21 | `useSearchFilterStore.toggleColumnFilter()` adds/removes values | Store |
| AC-22 | `useSearchFilterStore.clearAllFilters()` resets to defaults | Store |
| AC-23 | `useColumnFilterValues` returns values from database | Column values hook |
| AC-24 | All component tests pass with `@testing-library/react` | T-08.7 extension |
| AC-25 | `pnpm typecheck` passes with zero errors | Type safety |
| AC-26 | `pnpm lint` passes with zero errors on renderer | Code quality |
| AC-27 | Existing tests continue to pass | No regressions |

---

## 14. Test Cases

### 14.1 SearchBar Tests

**File:** `packages/renderer/src/components/__tests__/SearchBar.test.tsx`

| # | Test | Expected |
|---|------|----------|
| SB-01 | Renders TextField with placeholder | Placeholder text visible |
| SB-02 | Typing calls onChange | onChange called with typed text |
| SB-03 | Empty value shows search icon | Search icon adornment visible |
| SB-04 | Non-empty value shows clear button | Clear button (X) visible |
| SB-05 | Clicking clear button calls onChange("") | onChange called with empty string |
| SB-06 | Disabled TextField when disabled prop true | TextField has disabled attribute |
| SB-07 | Controlled value reflects prop change | TextField value updates when prop changes |

### 14.2 ColumnFilterPopover Tests

**File:** `packages/renderer/src/components/__tests__/ColumnFilterPopover.test.tsx`

| # | Test | Expected |
|---|------|----------|
| CFP-01 | Renders filter icon button with label | `IconButton` with `aria-label` containing column name |
| CFP-02 | Badge count matches selectedValues length | Badge shows "3" when 3 values selected |
| CFP-03 | No badge when selectedValues is empty | Badge not rendered |
| CFP-04 | Clicking icon opens popover | Checkbox list visible |
| CFP-05 | Popover shows "Select All" and "Deselect All" | Two helper buttons at top |
| CFP-06 | Checkboxes match values prop | One checkbox per value |
| CFP-07 | Checked checkboxes match selectedValues | Pre-checked items correct |
| CFP-08 | Checking a value calls onChange with updated array | onChange called with value added |
| CFP-09 | Unchecking a value calls onChange with value removed | onChange called with value removed |
| CFP-10 | "Select All" checks all checkboxes | onChange called with all values |
| CFP-11 | "Deselect All" unchecks all checkboxes | onChange called with empty array |
| CFP-12 | Clicking away closes popover | Popover not visible |
| CFP-13 | Loading state shows CircularProgress | Spinner visible, checkboxes not |
| CFP-14 | Empty values shows "No values available" | Message visible |
| CFP-15 | Not rendered when filterable is false | Returns null, no DOM |
| CFP-16 | Filter icon color changes when active | Primary color when selectedValues > 0 |

### 14.3 FilterBar Tests

**File:** `packages/renderer/src/components/__tests__/FilterBar.test.tsx`

| # | Test | Expected |
|---|------|----------|
| FB-01 | Renders when columnFilters has entries | Component visible |
| FB-02 | Hidden when columnFilters is empty | Component not in DOM |
| FB-03 | Each filter value shown as Chip | Chip with text "Column: Value" |
| FB-04 | Chip delete calls onRemoveFilter | onRemoveFilter called with key + value |
| FB-05 | On chip delete, chip removed from display | Single value deletion |
| FB-06 | "Clear All" button visible | Button with "Clear All" text |
| FB-07 | "Clear All" click calls onClearAll | onClearAll mock called |
| FB-08 | Multiple values for same column shown as multiple chips | All values rendered |
| FB-09 | Multiple columns shown with separators or grouping | Visual distinction between columns |

### 14.4 useSearchFilterStore Tests

**File:** `packages/renderer/src/components/__tests__/useSearchFilterStore.test.ts`

| # | Test | Expected |
|---|------|----------|
| ST-01 | Initial state has empty searchText | `searchText: ""` |
| ST-02 | Initial state has empty columnFilters | `columnFilters: {}` |
| ST-03 | Initial state has null sortKey | `sortKey: null` |
| ST-04 | `setSearchText()` updates state | State reflects new value |
| ST-05 | `toggleColumnFilter()` adds value when not present | Value added to array |
| ST-06 | `toggleColumnFilter()` removes value when present | Value removed; array removed if empty |
| ST-07 | `setColumnFilters()` replaces all values for a column | Array replaced |
| ST-08 | `clearColumnFilter()` removes entire column entry | Key removed from columnFilters |
| ST-09 | `clearAllFilters()` resets searchText and columnFilters | Both reset to defaults |
| ST-10 | `setSort()` updates sortKey and sortDirection | Both updated |
| ST-11 | `clearSort()` resets to default | `sortKey: null`, `sortDirection: "desc"` |
| ST-12 | Multiple component subscriptions re-render correctly | Zustand reactivity works |

---

## 15. Definition of Done

Per `PROJECT_CONSTITUTION.md` Section 26 (Task-Level DoD):

1. **Implemented:** All 10 new files exist. `SearchBar`, `ColumnFilterPopover`, `FilterBar`, `useSearchFilterStore`, and `useColumnFilterValues` are complete.
2. **Self-reviewed:** Diff reviewed for:
   - All components are controlled (state via props or Zustand store)
   - No direct database access from components — all through hooks
   - MUI components imported from `@mui/material` (not `@mui/material/TextField` deep imports — MUI v6 supports tree-shaking but the convention is top-level)
   - No platform-specific code in any file
3. **Tested:** SB-01–07, CFP-01–16, FB-01–09, ST-01–12 pass. Existing tests pass.
4. **Platform verified:** `pnpm typecheck` across all packages passes. No platform code.
5. **No new lint errors:** `pnpm lint` on renderer package passes.
6. **No hardcoded data:** Column labels and filter values come from `CategoryDefinition` and database queries.

### Gate Commands

```
pnpm --filter @collectio/renderer typecheck
pnpm --filter @collectio/renderer lint
pnpm --filter @collectio/renderer test
pnpm --filter @collectio/shared test
pnpm typecheck
```

---

## Appendix A: File Details

### A.1 `SearchBar.tsx`

- **Purpose:** Global search input bar (FR-SEARCH-01). Controlled MUI `TextField` with search icon and clear button.
- **Responsibility:** Render a search input. Call `onChange` on every keystroke. Never debounce internally. Reflect controlled `value` prop.
- **Public API:** `SearchBar(props: SearchBarProps): JSX.Element`

### A.2 `ColumnFilterPopover.tsx`

- **Purpose:** Per-column filter popover with multi-select checkboxes (FR-SEARCH-03). Active filter indicator on the trigger icon (FR-SEARCH-05, T-08.5).
- **Responsibility:** Render a filter icon button. Show `Badge` count when active. Open `Popover` with `Checkbox` list on click. Emit `onChange` on toggle. Hide when `filterable === false`.
- **Public API:** `ColumnFilterPopover(props: ColumnFilterPopoverProps): JSX.Element | null`

### A.3 `FilterBar.tsx`

- **Purpose:** Horizontal bar showing active filter chips with "Clear All" action (FR-SEARCH-06).
- **Responsibility:** Render `Chip` for each active filter value (grouped by column). Render "Clear All" `Button`. Hidden when no filters active.
- **Public API:** `FilterBar(props: FilterBarProps): JSX.Element | null`

### A.4 `components/index.ts`

- **Purpose:** Barrel export for all shared renderer components.
- **Responsibility:** Re-export `SearchBar`, `ColumnFilterPopover`, `FilterBar`, `useSearchFilterStore`, `useColumnFilterValues`.
- **Public API:** Named re-exports.

### A.5 `useSearchFilterStore.ts`

- **Purpose:** Zustand store for search, filter, and sort state. Single source of truth consumed by SearchBar, ColumnFilterPopover, FilterBar, and E15 TableView.
- **Responsibility:** Hold `searchText`, `columnFilters`, `sortKey`, `sortDirection`. Provide actions for mutation. Module-level singleton created via `create()`.
- **Public API:**
  - `useSearchFilterStore()` — returns full state + actions (Zustand hook)
  - Individual selectors: `useSearchText()`, `useColumnFilters()`, `useActiveSort()`

### A.6 `useColumnFilterValues.ts`

- **Purpose:** TanStack Query hook that fetches unique values for a given column from the database.
- **Responsibility:** Query `LanguageRepository.findAll()` for language filter, `ArtistRepository.findAll()` for artist filter, `SongRepository` for album filter. Return `{ values, isLoading, error }`. Cache with 60s stale time.
- **Public API:** `useColumnFilterValues(columnKey: string): { values: string[]; isLoading: boolean; error: Error | null }`

---

## Appendix B: Component Placement in E15 (Future Wiring)

These components are designed to be placed as follows when E15 is built:

```
CategoryScreen (E-15)
├── SearchBar                          ← above TableView
├── FilterBar                          ← below SearchBar, only when active
├── TableView (E-15)
│   └── TableHeader (E-15)
│       └── ColumnHeader (E-15)
│           └── ColumnFilterPopover    ← icon button in each filterable column header
```

The Zustand store (`useSearchFilterStore`) is consumed by:
- `SearchBar` (writes `searchText`, reads `searchText`)
- `ColumnFilterPopover` (writes `columnFilters`, reads `columnFilters`)
- `FilterBar` (reads `columnFilters`, writes `columnFilters`)
- E15 `CategoryScreen` (reads `searchText`, `columnFilters`, `sortKey`, `sortDirection` — passes to `useFilteredSongs()`)
- E15 `TableView` header (writes `sortKey`, `sortDirection` on column header click)

---

## Appendix C: MUI Component Reference

| Feature | MUI Component | Key Props |
|---------|--------------|-----------|
| Search input | `TextField` | `type="search"`, `value`, `onChange`, `placeholder`, `disabled`, `InputProps={{ startAdornment: <SearchIcon />, endAdornment: ... }}` |
| Filter icon | `IconButton` | `onClick`, `color`, `aria-label` |
| Badge | `Badge` | `badgeContent`, `color="primary"`, `invisible={count === 0}` |
| Popover | `Popover` | `open`, `anchorEl`, `onClose`, `anchorOrigin`, `transformOrigin` |
| Checkbox list | `FormGroup` + `FormControlLabel` + `Checkbox` | `control={<Checkbox checked={...} onChange={...} />}`, `label={value}` |
| Filter chips | `Chip` | `label`, `onDelete`, `size="small"`, `variant="outlined"` |
| Clear button | `Button` | `variant="text"`, `size="small"`, `onClick`, `startIcon={<ClearAllIcon />}` |
| Loading | `CircularProgress` | `size={24}`, inside Popover content |
| Icons | `SearchIcon`, `FilterListIcon`, `FilterListOffIcon`, `ClearAllIcon` | From `@mui/icons-material` |

---

## Appendix D: Key Design Decisions

### DD-01: All components are controlled

`SearchBar`, `ColumnFilterPopover`, and `FilterBar` are stateless UI — all state comes from `useSearchFilterStore`. This makes them trivially testable (pass props, assert callback calls) and decouples them from the data layer.

### DD-02: Store is module-level, not context-based

Following the existing `useSongsStore` pattern, `useSearchFilterStore` is a Zustand `create()` call at module scope. No React context. No provider component. E15 `CategoryScreen` subscribes to the store's selectors directly.

### DD-03: `useColumnFilterValues` is per-column, lazy

Each `ColumnFilterPopover` instance calls `useColumnFilterValues(key)` independently. TanStack Query deduplicates identical keys. Values are only fetched when the popover opens (lazy evaluation via `enabled` option or simply rendering the hook when the popover is open).

### DD-04: Sorting state lives in the same store

Rather than a separate store for sort, sort state (`sortKey`, `sortDirection`) lives in `useSearchFilterStore`. This keeps all query-affecting state in one place — the E15 consumer reads a single store to build the `useFilteredSongs()` call.

### DD-05: No debounce in SearchBar

Per the E08 Pass A spec, debouncing is a consumer concern. `SearchBar` fires `onChange` on every keystroke. E15 wraps the subscriber with a 150ms debounce before calling `useSearchFilterStore.setSearchText()`. This keeps the UI responsive to user input while preventing excessive queries.

---

_End of Implementation Specification_
