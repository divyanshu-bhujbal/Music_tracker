# E15-T07: Implement TableView Component

> **Epic:** E-15 UI Shell | **Depends on:** T-15.2 (MainLayout), E-05 (CategoryRegistry), E-06 (Songs Data), E-08 Pass A (Search/Filter Store) | **Blocks:** E-07

---

## 1. Goal

Create `TableView.tsx` — the primary data rendering component for all categories. A virtualized, sortable, spreadsheet-style table whose columns, sort fields, and filter fields are driven entirely by `CategoryDefinition.tableColumns`. Renders 10,000 rows in <200ms (NFR-PERF-01). Replaces the placeholder `<Typography>` in `CategoryScreen.tsx`.

Support for selection mode checkboxes (select-all header + per-row checkbox) is built into this component; integration with the full `SelectionModeBar` (T-15.9) is deferred but column layout must accommodate it.

---

## 2. Scope

- Virtualized row rendering via `@tanstack/react-virtual` (`useVirtualizer`)
- CSS Grid-based body rows (`AD-23` pattern) — header uses real MUI `Table`/`TableHead`/`TableRow`/`TableCell` with `display: grid`; body uses `<Box>` elements with matching `gridTemplateColumns` and absolute positioning
- Columns dynamically generated from `CategoryDefinition.tableColumns`
- Single-column sort: tap header → asc → desc → none, with visual sort indicator
- Leftmost selection column: select-all checkbox in header, per-row checkbox in body
- Row tap/click opens detail dialog (callback to `CategoryScreen`)
- Loading, empty, and error states
- Composable — accepts category definition and data as props; no hardcoded song logic

## 3. Out of Scope

- Multi-column sort (V2)
- Inline editing in the table
- Column resize / drag-to-reorder columns
- TileView toggle (handled by `CategoryScreen` or parent)
- Full `SelectionModeBar` integration (T-15.9) — bulk delete/clear actions
- Right-click context menu (T-15.10, Electron-specific)
- Pull-to-refresh (T-15.10, Capacitor-specific)
- Filter UI (already exists in `FilterBar` + `SearchBar`, rendered by `CategoryScreen`)
- Right-click / context menu (T-15.10)
- Platform-specific adaptations (T-15.10)

---

## 4. Files To Create

| File | Purpose |
|------|---------|
| `packages/renderer/src/components/TableView.tsx` | Primary deliverable — virtualized data table component |
| `packages/renderer/src/components/__tests__/TableView.test.tsx` | Unit tests (RTL + JSDOM) |

## 5. Files To Modify

| File | Change |
|------|--------|
| `packages/renderer/src/components/CategoryScreen.tsx` | Replace the placeholder `<Typography>{songs.length} songs</Typography>` with `<TableView>` component, passing category definition, data, sort state, and callbacks |
| `packages/renderer/src/components/index.ts` | Add `export { TableView } from './TableView.js'` |

---

## 6. Interfaces

### 6.1 `TableViewProps`

```
TableViewProps {
  category: CategoryDefinition
  items: SongWithArtists[]
  isLoading: boolean
  error: Error | null
  sortKey: string | null
  sortDirection: 'asc' | 'desc' | null
  onSort: (key: string) => void
  onRowTap: (item: SongWithArtists) => void
}
```

| Field | Type | Purpose |
|-------|------|---------|
| `category` | `CategoryDefinition` | Provides `tableColumns`, `displayName`; drives column layout |
| `items` | `SongWithArtists[]` | The data rows to render (already filtered/sorted by parent) |
| `isLoading` | `boolean` | Shows `CircularProgress` when true |
| `error` | `Error \| null` | Shows `Alert` when non-null |
| `sortKey` | `string \| null` | Currently sorted column key |
| `sortDirection` | `'asc' \| 'desc' \| null` | Current sort direction |
| `onSort` | `(key: string) => void` | Callback when header is tapped; parent handles cycle logic |
| `onRowTap` | `(item: SongWithArtists) => void` | Callback when a row (non-checkbox area) is clicked/tapped |

### 6.2 Internal: `gridTemplateColumns` Computation

The `gridTemplateColumns` CSS value is computed at render time from `category.tableColumns`:

- `selection` column (key === `'selection'`, `fixedWidth: 48`): `48px`
- Columns with `fixedWidth` defined: `${fixedWidth}px`
- Columns with only `flex` defined: `${flex}fr`

Example output for SongsCategory: `48px 3fr 2fr 2fr 120px 140px`

This string is shared between the header `TableRow` (`sx={{ display: 'grid', gridTemplateColumns }}`) and every body `<Box>` row.

### 6.3 Internal: Sort Icon Rendering

Per header column:
- `sortable: false` → no icon, no click handler
- `sortable: true` + not active → vertical unsorted icon (or no icon)
- `sortable: true` + active + `asc` → upward arrow icon
- `sortable: true` + active + `desc` → downward arrow icon

Use MUI icons: `ArrowUpward`, `ArrowDownward`, or `UnfoldMore` for unsorted.

### 6.4 Reused from `@collectio/shared`

| Import | Type |
|--------|------|
| `CategoryDefinition` | Interface |
| `ColumnDefinition` | Interface |
| `SongWithArtists` | Domain model (or generic `unknown` row type cast) |

---

## 7. Data Flow

```
CategoryScreen (parent)
  │
  ├─ useFilteredSongs(searchText, filters, sortKey, sortDirection)
  │   └─ returns { data: SongWithArtists[], isLoading, error }
  │
  ├─ useSearchFilterStore → { sortKey, sortDirection }
  │
  └─ <TableView
       category={category}
       items={data ?? []}
       isLoading={isLoading}
       error={error}
       sortKey={sortKey}
       sortDirection={sortDirection}
       onSort={(key) => toggleSort(key)}
       onRowTap={(item) => { setSelectedItem(item); setDetailOpen(true) }}
     />
```

**Flow:**
1. `CategoryScreen` fetches data via `useFilteredSongs` (TanStack Query)
2. `CategoryScreen` renders `<TableView>` with data, sort state, and callbacks
3. User taps a sortable column header → `onSort(key)` fired → `useSearchFilterStore.toggleSort(key)` cycles `asc → desc → none` → `useFilteredSongs` refetches with new sort → `TableView` re-renders with sorted data and updated sort indicators
4. User taps a row (excluding checkbox area) → `onRowTap(item)` fired → `CategoryScreen` opens `DetailDialog`
5. User taps a row checkbox → toggles local selection state (prepares for T-15.9)

`TableView` is a **presentational component** — it does not own data fetching, sort logic, or navigation. All business logic is delegated to the parent.

---

## 8. State Changes

### 8.1 Local Component State

| State | Type | Initial | Purpose |
|-------|------|---------|---------|
| `selectedIds` | `Set<string>` | `new Set()` | Tracks selected row IDs for future selection mode integration |

This state is local until T-15.9 moves it to a Zustand store. For now, checkboxes render checked/unchecked based on `selectedIds.has(item.id)`.

### 8.2 Ref-Based State

| Ref | Type | Purpose |
|-----|------|---------|
| `tableContainerRef` | `RefObject<HTMLDivElement>` | Passed to `getScrollElement` in `useVirtualizer` — identifies the scroll viewport |

### 8.3 Derived State

| Value | Source | Purpose |
|-------|--------|---------|
| `columnTemplate` | `category.tableColumns` | CSS grid template string (`48px 3fr 2fr 2fr 120px 140px`) |
| `virtualItems` | `useVirtualizer({ count, getScrollElement, estimateSize, overscan, measureElement })` | Only visible rows to render |

### 8.4 External State (Read-Only)

| Store | Fields Used |
|-------|------------|
| `useSearchFilterStore` | `sortKey`, `sortDirection` (passed as props, not read directly) |

`TableView` does **not** import `useSearchFilterStore` or `useSongsStore` directly — all data arrives via props.

---

## 9. Database Changes

**None.** `TableView` has zero database access. All data is provided via the `items` prop from the parent.

---

## 10. Error Handling

| Scenario | Behavior |
|----------|----------|
| `error` prop is non-null | Render `<Alert severity="error">{error.message}</Alert>` centered in the table area |
| `items` is empty array (`[]`) | Render empty state: centered `Typography` with message "No {category.displayName.toLowerCase()} found" plus an appropriate icon |
| `isLoading` is true | Render `<CircularProgress />` centered in the table area; suppress row rendering |
| `items` length changes after render | `useVirtualizer` re-sizes automatically; no manual index adjustment needed |
| `category.tableColumns` is empty | Render empty state: "No columns configured for {category.displayName}" |
| `category.tableColumns` has no `selection` column as first column | Still render selection column as the leftmost column anyway (guard against misconfigured category) |
| `tableContainerRef.current` is null | `useVirtualizer` returns 0 virtual items; no crash — just empty body |

No thrown errors from `TableView` itself — all errors are rendered as UI states.

---

## 11. Logging Requirements

**None.** `TableView` is a pure presentational component. No `console.log`, `console.error`, or `console.warn` calls. Errors are surfaced through the UI (`Alert` component), not the console.

---

## 12. Security Requirements

- **Rule 5 (Crypto):** Not applicable — no cryptographic operations.
- **Rule 6 (OAuth):** Not applicable — no auth operations.
- **Rule 12:** No secrets, tokens, or credentials are handled by this component.
- **Rule 13.4:** No platform-specific imports (`platform/electron/`, `platform/capacitor/`, `@capacitor/`).

---

## 13. Acceptance Criteria

Copied and adapted from original T-15.7 epic with MUI-specific notes:

| ID | Criterion | Verification |
|----|-----------|-------------|
| AC-01 | Columns render according to `CategoryDefinition.tableColumns` (dynamic, not hardcoded) | Unit test: render with mock columns, verify header text matches |
| AC-02 | Leftmost column is a selection checkbox; header has select-all checkbox | Unit test: verify checkbox elements present |
| AC-03 | Sortable header columns show sort indicator; tap → asc → desc → none | Unit test: click header, verify `onSort` called with correct key |
| AC-04 | Non-sortable header columns show no sort indicator and are not clickable | Unit test: click non-sortable header, verify `onSort` not called |
| AC-05 | Table renders 10,000 rows in <200ms (NFR-PERF-01) | Playwright E2E (E-16); unit test verifies virtualization structure |
| AC-06 | Only ~28 DOM rows visible at once (virtualization active) | Unit test: count rendered rows in mock output |
| AC-07 | Row tap (non-checkbox area) calls `onRowTap` with correct item | Unit test: click row text, verify callback |
| AC-08 | Checkbox tap toggles selection without firing `onRowTap` | Unit test: click checkbox, verify `onRowTap` not called, selection toggled |
| AC-09 | Loading state shows `CircularProgress` and does not render table | Unit test: pass `isLoading=true`, verify spinner present, no rows |
| AC-10 | Empty state shows appropriate message when `items.length === 0` | Unit test: pass `items=[]`, verify empty message |
| AC-11 | Error state shows `Alert` with error message | Unit test: pass `error`, verify alert rendered |
| AC-12 | Column widths are proportional according to `flex` and `fixedWidth` values | Unit test: verify `gridTemplateColumns` CSS matches expected string |
| AC-13 | Single column sort only — no multi-column sort UI | Visual + unit test: verify only one sort indicator active at a time (handled by parent via `sortKey` prop) |

---

## 14. Test Cases

### 14.1 Unit Tests (Jest + RTL, JSDOM)

**Test File:** `packages/renderer/src/components/__tests__/TableView.test.tsx`

| Test ID | Description | Mock/Setup |
|---------|-------------|------------|
| TV-01 | Renders correct number of header columns from `category.tableColumns` | Mock `@tanstack/react-virtual` per `Rule 16.3`; provide 3-column category |
| TV-02 | Renders row data correctly (song name, artist, album, language) | Provide `items` with 3 songs; verify text content visible in DOM |
| TV-03 | Loading state — shows CircularProgress, hides table | `isLoading=true`; assert spinner visible, no rows |
| TV-04 | Empty state — shows "No songs found" with zero items | `items=[]`; assert empty message visible |
| TV-05 | Error state — shows Alert with error message | `error=new Error('fail')`; assert Alert with 'fail' text |
| TV-06 | Sort callback fires on sortable header click with correct column key | Click sortable header; assert `onSort` called with column key |
| TV-07 | Sort callback does NOT fire on non-sortable header click | Click non-sortable header; assert `onSort` not called |
| TV-08 | Sort indicator renders correctly for active sort column (asc/desc) | Pass `sortKey='name'`, `sortDirection='asc'`; assert upward icon on name column |
| TV-09 | Row click fires `onRowTap` with correct item | Click row text area; assert callback with matching item |
| TV-10 | Checkbox click does NOT fire `onRowTap` | Click checkbox in row; assert `onRowTap` not called |
| TV-11 | Select-all checkbox toggles all row checkboxes | Click select-all; assert all rows checked; click again; assert all unchecked |
| TV-12 | `gridTemplateColumns` computed correctly from `ColumnDefinition` array | Provide columns with flex/fixedWidth; assert CSS string matches expected |
| TV-13 | Virtualization mock returns all items as visible | Verify `getVirtualItems()` returns all items from provided data |
| TV-14 | Single row renders correctly (virtualizer count=1) | Provide `items` with 1 song; assert row text visible |
| TV-15 | Selection column is always present even if not first in `tableColumns` | Provide columns without selection; assert checkbox column still leftmost |
| TV-16 | Re-render with new data updates rows | Change `items` prop; assert new text visible |

**Mocking `@tanstack/react-virtual`** (per `Rule 16.3`):

```typescript
jest.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: jest.fn().mockImplementation(({ count, estimateSize }) => {
    const size = estimateSize();
    const items = Array.from({ length: count }, (_, i) => ({
      index: i,
      start: i * size,
      size,
      key: i,
      measureElement: jest.fn(),
    }));
    return {
      getVirtualItems: () => items,
      getTotalSize: () => count * size,
      measureElement: jest.fn(),
      scrollToIndex: jest.fn(),
    };
  }),
}));
```

### 14.2 Integration Tests

| Test ID | Description |
|---------|-------------|
| TV-I01 | `CategoryScreen` renders `TableView` instead of placeholder when data loads | Verify `TableView` is in DOM and placeholder is not |

### 14.3 E2E Tests (Playwright, E-16)

| Test ID | Description |
|---------|-------------|
| TV-E01 | Scroll through 10,000 rows — smooth performance, no jank |
| TV-E02 | Sort column — data reorders correctly after header click |
| TV-E03 | Row click → detail dialog opens |
| TV-E04 | Checkbox selection persists during scroll (virtual rows recycle correctly) |

---

## 15. Definition Of Done

1. **File created:** `packages/renderer/src/components/TableView.tsx` with zero TypeScript errors (`tsc --noEmit`).
2. **File created:** `packages/renderer/src/components/__tests__/TableView.test.tsx` with all TV-01 through TV-16 passing (`pnpm test -- --testPathPattern='TableView'`).
3. **`CategoryScreen.tsx` updated:** Placeholder replaced with `<TableView>`, wired with correct props and callbacks.
4. **`components/index.ts` updated:** `TableView` exported.
5. **`AD-23` confirmed:** Body rows use `<Box>` with CSS Grid + absolute positioning (not `<TableRow>`/`<TableCell>`). Header uses real MUI `Table` + `TableHead`.
6. **`AD-02` confirmed:** `@tanstack/react-virtual` `useVirtualizer` is active with `estimateSize: 48`, `overscan: 5`, `measureElement`.
7. **`Rule 16.3` confirmed:** Test file mocks `@tanstack/react-virtual`.
8. **`Rule 13.4` confirmed:** Zero platform-specific imports in `TableView.tsx`.
9. **No logging:** Zero `console.*` calls.
10. **All acceptance criteria (AC-01 through AC-13) verified.**
11. **Integration test TV-I01 passes** (CategoryScreen renders TableView).
12. **ESLint passes:** `pnpm lint` with zero errors.
13. **No unused imports** (Rule 15.6).
14. **`.tsx` extension used** (Rule 11.6) — file contains JSX.
