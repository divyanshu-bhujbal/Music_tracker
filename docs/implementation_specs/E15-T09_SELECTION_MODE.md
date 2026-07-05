# E15-T09: Implement Selection Mode

> **Epic:** E-15 UI Shell | **Depends on:** T-15.7 (TableView) | **Blocks:** E-07, E-12

---

## 1. Goal

Extract the local `selectedIds` state from `TableView.tsx` into a shared Zustand store (`useSelectionStore`). Create a `SelectionModeBar` — a floating bulk action bar that appears when items are selected, displaying the selection count and offering "Delete Selected" and "Clear Selection" actions. Enables batch operations for E-07 (bulk song deletion) and E-12 (trash/recovery).

## 2. Scope

- Zustand store `useSelectionStore` with `selectedIds: Set<string>`, toggle/selectAll/clearAll actions, and count selector
- `SelectionModeBar` presentational component: floating bar with count badge, "Delete Selected" button, "Clear Selection" button
- Replace `TableView`'s local `useState<Set<string>>` with `useSelectionStore`
- CategoryScreen conditionally renders `SelectionModeBar` when selection count > 0
- Select-all checkbox supports indeterminate state (some but not all selected)
- Selection cleared on route change (unmount)

## 3. Out of Scope

- Actual delete logic ("Delete Selected" callback is wired to `CategoryScreen`; bulk deletion implementation is E-07)
- Trash restore with selections (E-12)
- Drag-select / shift-click range selection
- Selection persistence across app restarts
- Selection in TileView (TileView has no checkboxes)
- Keyboard shortcuts for selection (Ctrl+A, Shift+click — V2)
- Multi-category selection (V2)

---

## 4. Files To Create

| File | Purpose |
|------|---------|
| `packages/renderer/src/stores/useSelectionStore.ts` | Zustand store — holds selected IDs, toggle/selectAll/clearAll actions |
| `packages/renderer/src/stores/__tests__/useSelectionStore.test.ts` | Unit tests for store logic (no DOM needed) |
| `packages/renderer/src/components/SelectionModeBar.tsx` | Floating bulk action bar — count badge, "Delete Selected", "Clear Selection" |
| `packages/renderer/src/components/__tests__/SelectionModeBar.test.tsx` | Unit tests for bar rendering and callbacks |

## 5. Files To Modify

| File | Change |
|------|--------|
| `packages/renderer/src/components/TableView.tsx` | Remove local `selectedIds` state (line 95). Replace all `selectedIds` references (lines 115-116, 121-122, 127-136, 216, 274, 275) with `useSelectionStore` selectors and actions. Remove `useState` import if no longer needed. |
| `packages/renderer/src/components/CategoryScreen.tsx` | Import `SelectionModeBar` and `useSelectionStore`. Conditionally render `<SelectionModeBar>` when `selectionCount > 0` (replacing or overlaying the toolbar). Wire `onClear` to `store.clearAll()`. Wire `onDeleteSelected` — stub for now, will be replaced by E-07 bulk delete. |
| `packages/renderer/src/components/index.ts` | Add `export { SelectionModeBar } from './SelectionModeBar.js'` |
| `packages/renderer/src/stores/index.ts` | Add `export { useSelectionStore } from './useSelectionStore.js'` (create if absent, otherwise add line) |
| `packages/renderer/src/components/__tests__/TableView.test.tsx` | Update tests to mock `useSelectionStore` instead of expecting local state behavior for checkboxes |

---

## 6. Interfaces

### 6.1 `useSelectionStore` — Zustand Store

```
interface SelectionState {
  selectedIds: Set<string>
  toggle: (id: string) => void
  selectAll: (ids: string[]) => void
  clearAll: () => void
  isSelected: (id: string) => boolean
}

// Selector hook
function useSelectionCount(): number
```

| Field | Type | Purpose |
|-------|------|---------|
| `selectedIds` | `Set<string>` | Currently selected item IDs |
| `toggle(id)` | `(id: string) => void` | Add if absent, remove if present |
| `selectAll(ids)` | `(ids: string[]) => void` | Replace selection with all provided IDs |
| `clearAll()` | `() => void` | Reset selection to empty set |
| `isSelected(id)` | `(id: string) => boolean` | Convenience selector — `selectedIds.has(id)` |
| `useSelectionCount()` | `() => number` | Derived selector — `selectedIds.size` |

**Pattern:** Module-level singleton via `create<SelectionState>()`, matching `useSearchFilterStore`. Exported as `useSelectionStore`.

### 6.2 `SelectionModeBarProps`

```
SelectionModeBarProps {
  selectionCount: number
  onClear: () => void
  onDeleteSelected: () => void
}
```

| Field | Type | Purpose |
|-------|------|---------|
| `selectionCount` | `number` | Number of selected items (displayed in badge) |
| `onClear` | `() => void` | Called when "Clear Selection" is clicked |
| `onDeleteSelected` | `() => void` | Called when "Delete Selected" is clicked |

### 6.3 `TableViewProps` — Unchanged

The `TableViewProps` interface does NOT change. The store integration is internal — callers (`CategoryScreen`) do not pass selection state as props.

### 6.4 Reused from `@collectio/shared`

| Import | Type |
|--------|------|
| `CategoryDefinition` | Interface |
| `SongWithArtists` | Domain model (for `item.id` access) |

---

## 7. Data Flow

```
useSelectionStore (singleton Zustand store)
  │
  ├── selectedIds: Set<string>
  ├── toggle(id)       ── called by TableView per-row checkbox
  ├── selectAll(ids)   ── called by TableView select-all checkbox
  ├── clearAll()       ── called by SelectionModeBar "Clear Selection"
  ├── isSelected(id)   ── read by TableView per-row checkbox
  │
  └── useSelectionCount()  ── read by CategoryScreen to decide visibility

TableView
  │
  ├── Reads: store.isSelected(item.id) → checkbox checked state
  ├── Writes: store.toggle(item.id) → per-row checkbox onChange
  ├── Reads: store.selectedIds → compute allSelected/indeterminate
  └── Writes: store.selectAll(items.ids) or store.clearAll() → select-all checkbox

CategoryScreen
  │
  ├── Reads: useSelectionCount() → conditionally render SelectionModeBar
  └── Renders: <SelectionModeBar
        selectionCount={count}
        onClear={() => store.clearAll()}
        onDeleteSelected={handleDeleteSelected} />

SelectionModeBar (presentational)
  │
  ├── Props in: selectionCount, onClear, onDeleteSelected
  └── Callbacks out: button clicks → onClear() / onDeleteSelected()
```

**Key flow:**
1. User clicks row checkbox → `TableView` calls `store.toggle(id)` → store updates `selectedIds` → all subscribers re-render
2. `CategoryScreen` reads `useSelectionCount()` — if count > 0, renders `SelectionModeBar`
3. User clicks "Clear Selection" → `SelectionModeBar` calls `onClear()` → `CategoryScreen` calls `store.clearAll()` → selection cleared → `SelectionModeBar` hidden
4. User clicks "Delete Selected" → `SelectionModeBar` calls `onDeleteSelected()` → `CategoryScreen` handles deletion (stub for now; E-07)

---

## 8. State Changes

### 8.1 New Store: `useSelectionStore`

| State | Initial | Mutated By |
|-------|---------|------------|
| `selectedIds` | `new Set()` | `toggle()`, `selectAll()`, `clearAll()` |
| `selectionCount` (derived) | `0` | Any mutation to `selectedIds` |

**Store resets:** `clearAll()` is called on route change via `useEffect` cleanup in `CategoryScreen`:
```
useEffect(() => {
  return () => { useSelectionStore.getState().clearAll(); };
}, []);
```

### 8.2 `TableView` Changes

| Removed State | Replaced By |
|---------------|-------------|
| `const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())` | `useSelectionStore((s) => s.selectedIds)` |
| `setSelectedIds(new Set())` | `store.clearAll()` |
| `setSelectedIds(new Set(items.map(...)))` | `store.selectAll(ids)` |
| `setSelectedIds(prev => toggle logic)` | `store.toggle(id)` |

`TableViewProps` unchanged. `TableView` interface unchanged — consumers see no difference.

### 8.3 `CategoryScreen` Changes

| New In Component | Purpose |
|------------------|---------|
| `const selectionCount = useSelectionCount()` | Read from store to decide bar visibility |
| `const handleDeleteSelected` (stub) | Placeholder callback passed to SelectionModeBar |
| `SelectionModeBar` conditional render | `<SelectionModeBar ... />` shown only when `selectionCount > 0` |
| `useEffect` cleanup | Calls `store.clearAll()` on unmount (route change) |

### 8.4 SelectionModeBar — Presentational

**No local state.** Pure props-in, callbacks-out component.

---

## 9. Database Changes

**None.** Selection is pure UI state. No persistence. No database reads or writes.

---

## 10. Error Handling

| Scenario | Handling |
|----------|----------|
| TableView renders with items, store is empty (initial state) | No checkboxes checked — correct |
| Select-all called with empty `ids` array | `selectAll([])` → `selectedIds` becomes empty set — guard: if all items empty, return early |
| `toggle(id)` called for an ID not in current data | Store adds or removes the ID regardless — orphaned IDs cleaned up on next `selectAll` or `clearAll` |
| "Delete Selected" called with no selection | Guard in `CategoryScreen`: do not render `SelectionModeBar` when count=0, so button unreachable |
| Virtual row recycles while checkbox was checked | `checked` prop reads from store — always correct regardless of DOM reuse |

---

## 11. Logging Requirements

**None.** Zero `console.*` calls in store, bar, or modified TableView.

---

## 12. Security Requirements

- **Rule 5 (Crypto):** Not applicable.
- **Rule 6 (OAuth):** Not applicable.
- **Rule 12:** No secrets or credentials handled.
- **Rule 13.4:** No platform-specific imports in store or SelectionModeBar.

---

## 13. Acceptance Criteria

| ID | Criterion | Verification |
|----|-----------|-------------|
| AC-01 | Store `toggle()` adds ID when absent, removes ID when present | Store unit test: toggle same ID twice; assert added then removed |
| AC-02 | Store `selectAll(ids)` replaces selection with all provided IDs | Store unit test: call selectAll; assert selectedIds equals provided array |
| AC-03 | Store `clearAll()` resets selection to empty set | Store unit test: select items, clear, assert size=0 |
| AC-04 | `useSelectionCount()` returns correct count after mutations | Store unit test: toggle 3 items, assert count=3 |
| AC-05 | TableView checkboxes read from store, not local state | Verify `checked` prop uses `store.isSelected(id)` |
| AC-06 | TableView select-all checkbox shows indeterminate when partially selected | Unit test: select one row, assert indeterminate, not checked |
| AC-07 | SelectionModeBar renders count badge with correct number | Unit test: pass `selectionCount=5`, assert "5" in DOM |
| AC-08 | "Clear Selection" button calls `onClear` callback | Unit test: click button, assert callback fired |
| AC-09 | "Delete Selected" button calls `onDeleteSelected` callback | Unit test: click button, assert callback fired |
| AC-10 | SelectionModeBar NOT rendered when count is 0 | CategoryScreen integration test: assert bar absent |
| AC-11 | Selection cleared on route change | Test: select items, unmount CategoryScreen, remount; assert selection count = 0 |
| AC-12 | Selection persists during scroll (virtual row recycling) | Verify row re-render reads from store; tested via unit test with mock virtualizer |

---

## 14. Test Cases

### 14.1 Store Unit Tests — `useSelectionStore.test.ts`

| Test ID | Description |
|---------|-------------|
| SS-01 | `toggle()` adds new ID to empty set |
| SS-02 | `toggle()` removes existing ID |
| SS-03 | `selectAll()` replaces entire set with provided IDs |
| SS-04 | `selectAll([])` results in empty set |
| SS-05 | `clearAll()` resets to empty set |
| SS-06 | `isSelected()` returns true for toggled ID, false for unknown ID |
| SS-07 | `useSelectionCount()` returns 0 initially |
| SS-08 | `useSelectionCount()` returns 3 after toggling 3 IDs |
| SS-09 | `useSelectionCount()` returns 0 after clearAll |
| SS-10 | Toggling the same ID twice returns it to original state (idempotent) |

### 14.2 SelectionModeBar Unit Tests — `SelectionModeBar.test.tsx`

| Test ID | Description |
|---------|-------------|
| SB-01 | Renders selection count text (e.g., "5 selected") |
| SB-02 | Renders "Clear Selection" button |
| SB-03 | Renders "Delete Selected" button |
| SB-04 | Clicking "Clear Selection" fires `onClear` |
| SB-05 | Clicking "Delete Selected" fires `onDeleteSelected` |
| SB-06 | Bar renders with correct layout (floating/fixed position, prominent background) |

### 14.3 TableView Tests Updated — `TableView.test.tsx`

| Test ID | Description |
|---------|-------------|
| TV-CHECK-01 | Checkbox `checked` prop reads from mocked `useSelectionStore.isSelected()` |
| TV-CHECK-02 | Checkbox `onChange` calls mocked `useSelectionStore.toggle()` |
| TV-CHECK-03 | Select-all checkbox reads state from mocked store (all selected → checked) |
| TV-CHECK-04 | Select-all checkbox shows indeterminate when partially selected |
| TV-CHECK-05 | Select-all calls `store.selectAll()` when none selected, `store.clearAll()` when all selected |

### 14.4 CategoryScreen Integration Test

| Test ID | Description |
|---------|-------------|
| CS-SEL-01 | SelectionModeBar NOT visible when no items selected |
| CS-SEL-02 | Selecting items → SelectionModeBar appears |
| CS-SEL-03 | Clicking "Clear Selection" → bar disappears |

---

## 15. Definition Of Done

1. **File created:** `packages/renderer/src/stores/useSelectionStore.ts` — module-level Zustand singleton with `selectedIds`, `toggle`, `selectAll`, `clearAll`, `isSelected`, `useSelectionCount`.
2. **File created:** `packages/renderer/src/stores/__tests__/useSelectionStore.test.ts` — SS-01 through SS-10 passing.
3. **File created:** `packages/renderer/src/components/SelectionModeBar.tsx` — presentational bar component.
4. **File created:** `packages/renderer/src/components/__tests__/SelectionModeBar.test.tsx` — SB-01 through SB-06 passing.
5. **`TableView.tsx` modified:**
   - `useState<Set<string>>` for `selectedIds` removed.
   - All `selectedIds` reads replaced with `useSelectionStore` selectors.
   - All `setSelectedIds` calls replaced with store actions (`toggle`, `selectAll`, `clearAll`).
   - `TableViewProps` unchanged.
6. **`CategoryScreen.tsx` modified:**
   - `SelectionModeBar` imported and rendered conditionally when `useSelectionCount() > 0`.
   - `onClear` wired to `useSelectionStore.getState().clearAll()`.
   - `onDeleteSelected` wired to stub handler.
   - `useEffect` cleanup calls `clearAll()` on unmount.
7. **`components/index.ts` updated:** `SelectionModeBar` exported.
8. **`stores/index.ts` updated:** `useSelectionStore` and selectors exported.
9. **Existing TableView tests updated** (TV-CHECK-01 through TV-CHECK-05) to work with mocked store.
10. **Integration tests** CS-SEL-01 through CS-SEL-03 pass.
11. **Zero TypeScript errors** (`tsc --noEmit`).
12. **Zero ESLint errors** (`pnpm lint`).
13. **No unused imports** (`Rule 15.6`).
14. **`.tsx` extension** for all files containing JSX (`Rule 11.6`).
15. **No platform imports** in any new or modified file (`Rule 13.4`).
16. **No logging** — zero `console.*` calls.
17. **Selection survives virtual row recycling** — confirmed by store-backed checkbox state.
