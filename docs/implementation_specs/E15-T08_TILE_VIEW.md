# E15-T08: Implement TileView Component

> **Epic:** E-15 UI Shell | **Depends on:** T-15.2 (MainLayout), E-06 (Songs Data) | **Blocks:** E-07

---

## 1. Goal

Create `TileView.tsx` — a responsive card grid view as an alternative to TableView. Each card displays song name, artist(s), album, and language using MUI `Card` + `CardContent`. Cards are arranged in a CSS Grid that adapts column count to viewport width (2 cols narrow / 3 medium / 4 wide). Tap/click on a card opens the detail dialog. Add a view-toggle control to `CategoryScreen` allowing users to switch between TableView and TileView.

## 2. Scope

- Card grid using MUI `Card` + `CardContent` + `Typography`
- Responsive CSS Grid layout (2/3/4 columns based on breakpoints)
- Card content: song name (title), artist(s) as comma-separated list, album name, language name
- Card tap/click fires `onCardTap` callback (mirrors `onRowTap` from TableView)
- Loading, empty, and error states (same patterns as TableView)
- View toggle button added to `CategoryScreen` toolbar to switch between Table/Tile views
- View preference stored in component state only (not persisted — V1 decision)

## 3. Out of Scope

- Virtualization (not needed for card grids; `AD-02` scope is tables only)
- View state persistence across app restarts (V2 — use `app_settings.default_view`)
- Card drag-and-drop reordering
- Image/artwork on cards
- Horizontal swipe actions on cards
- TileView for categories other than Songs (V2 — abstracted via `CategoryDefinition.tileFields`)
- `SelectionModeBar` integration (T-15.9 is TableView-specific)
- Sort controls on TileView (sort is controlled by `CategoryScreen` toolbar; data arrives pre-sorted)

---

## 4. Files To Create

| File | Purpose |
|------|---------|
| `packages/renderer/src/components/TileView.tsx` | Primary deliverable — responsive card grid component |
| `packages/renderer/src/components/__tests__/TileView.test.tsx` | Unit tests (RTL + JSDOM) |

## 5. Files To Modify

| File | Change |
|------|--------|
| `packages/renderer/src/components/CategoryScreen.tsx` | Add view toggle button (Table/Tile icon) to toolbar; conditionally render `<TableView>` or `<TileView>` based on `viewMode` state |
| `packages/renderer/src/components/index.ts` | Add `export { TileView } from './TileView.js'` |

---

## 6. Interfaces

### 6.1 `TileViewProps`

```
TileViewProps {
  category: CategoryDefinition
  items: SongWithArtists[]
  isLoading: boolean
  error: Error | null
  onCardTap: (item: SongWithArtists) => void
  languageMap: Map<number, string>
}
```

| Field | Type | Purpose |
|-------|------|---------|
| `category` | `CategoryDefinition` | Provides `displayName` for empty state message |
| `items` | `SongWithArtists[]` | Data rows (already filtered/sorted by parent `CategoryScreen`) |
| `isLoading` | `boolean` | Show `CircularProgress` when true |
| `error` | `Error \| null` | Show `Alert` when non-null |
| `onCardTap` | `(item: SongWithArtists) => void` | Callback when card is clicked — parent opens detail dialog |
| `languageMap` | `Map<number, string>` | Pre-built lookup for language_id → language name (avoids repeated lookups in render) |

### 6.2 Internal: `ViewMode` (in CategoryScreen)

```
type ViewMode = 'table' | 'tile'
```

Added as `useState<'table' | 'tile'>('table')` in `CategoryScreen`. Toggled by a button in the toolbar. Not a prop of TileView — the parent decides which view component to render.

### 6.3 Shared Props Pattern

`TileView` and `TableView` share a compatible prop shape:

| Prop | TableView | TileView |
|------|-----------|----------|
| `category` | Yes | Yes |
| `items` | Yes | Yes |
| `isLoading` | Yes | Yes |
| `error` | Yes | Yes |
| Row/card tap | `onRowTap` | `onCardTap` |
| `sortKey`/`sortDirection`/`onSort` | Yes | **No** — sort in toolbar only |
| `languageMap` | Internal | Prop |

`CategoryScreen` passes slightly different props to each — this is acceptable because it controls which one is rendered.

### 6.4 Reused from `@collectio/shared`

| Import | Type |
|--------|------|
| `CategoryDefinition` | Interface |
| `SongWithArtists` | Domain model |

---

## 7. Data Flow

```
CategoryScreen (parent)
  │
  ├─ useFilteredSongs(searchText, filters, sortKey, sortDirection)
  │   └─ returns { data: SongWithArtists[], isLoading, error }
  │
  ├─ useState<'table' | 'tile'>('table') → viewMode
  │
  ├─ Toolbar: [SearchBar] [spacer] [New Button] [View Toggle IconButton]
  │
  ├─ {viewMode === 'table' && <TableView ... />}
  │
  └─ {viewMode === 'tile' && (
       <TileView
         category={category}
         items={songs}
         isLoading={isLoading}
         error={error}
         onCardTap={handleRowTap}
         languageMap={languageMap}
       />
     )}
```

**Flow:**
1. `CategoryScreen` fetches data via `useFilteredSongs` (same as TableView)
2. `CategoryScreen` manages `viewMode` state locally
3. User clicks view toggle button → `setViewMode(viewMode === 'table' ? 'tile' : 'table')`
4. Based on `viewMode`, either `<TableView>` or `<TileView>` is rendered
5. User clicks a card → `onCardTap(item)` fires → `CategoryScreen` opens `DetailDialog`

The language map is built once in `CategoryScreen` from `useLanguages()` (already available from `useSongsStore`) and passed to `TileView` as a prop — avoids importing `useLanguages()` inside the presentational component.

---

## 8. State Changes

### 8.1 New State in CategoryScreen

| State | Type | Initial | Purpose |
|-------|------|---------|---------|
| `viewMode` | `'table' \| 'tile'` | `'table'` | Controls which view component is rendered; toggled by toolbar button |

### 8.2 TileView Local State

**None.** TileView is a pure presentational component — zero local state.

### 8.3 Language Map Construction (CategoryScreen)

```
const { data: languages = [] } = useLanguages();
const languageMap = new Map(languages.map((l) => [l.id, l.name]));
```

Built in CategoryScreen, passed to TileView. This map is stable across re-renders when `languages` data hasn't changed. No need to memoize for V1 unless profiling shows issues.

---

## 9. Database Changes

**None.** TileView has zero database access. All data arrives via props.

---

## 10. Error Handling

| Scenario | Behavior |
|----------|----------|
| `error` prop is non-null | `<Alert severity="error">{error.message}</Alert>` centered in card area |
| `items` is `[]` (empty) | Centered message: "No {category.displayName.toLowerCase()} found" |
| `isLoading` is true | `<CircularProgress />` centered; suppress card rendering |
| `items[n].album_name` is null | Render em-dash (`—`) or omit album row |
| `items[n].artists` is empty array | Render em-dash (`—`) for artists field |
| `languageMap.get(language_id)` returns undefined | Render em-dash (`—`) or "Unknown" |
| Song name or artist name exceeds card width | `Typography noWrap` with CSS text-overflow ellipsis |
| View toggle when no data loaded | View toggle is always available; toggling with no data shows empty state of new view |

No thrown errors from TileView — all errors are rendered as UI states.

---

## 11. Logging Requirements

**None.** TileView is a pure presentational component. Zero `console.*` calls.

---

## 12. Security Requirements

- **Rule 5 (Crypto):** Not applicable.
- **Rule 6 (OAuth):** Not applicable.
- **Rule 12:** No secrets, tokens, or credentials handled.
- **Rule 13.4:** No platform-specific imports.

---

## 13. Acceptance Criteria

| ID | Criterion | Verification |
|----|-----------|-------------|
| AC-01 | Card grid renders with correct song data (name, artists, album, language) | Unit test: verify card text content |
| AC-02 | Responsive grid: 2 columns on narrow viewport, 3 on medium, 4 on wide | Visual verification; unit test checks CSS `grid-template-columns` breakpoints |
| AC-03 | Card tap fires `onCardTap` with correct item | Unit test: click card, verify callback with correct song |
| AC-04 | Loading state shows `CircularProgress` and no cards | Unit test: `isLoading=true`, verify spinner present, no cards |
| AC-05 | Empty state shows appropriate message when `items.length === 0` | Unit test: `items=[]`, verify empty message with category name |
| AC-06 | Error state shows `Alert` with error message | Unit test: pass `error`, verify alert rendered |
| AC-07 | View toggle button in `CategoryScreen` toolbar switches between TableView and TileView | Unit test: verify `CategoryScreen` renders TileView when `viewMode=tile` |
| AC-08 | Cards have consistent height and width within the grid | Visual; CSS Grid implicitly handles this |
| AC-09 | Missing optional fields (album, language) show em-dash or are omitted | Unit test: null album → em-dash rendered |

---

## 14. Test Cases

### 14.1 Unit Tests (Jest + RTL, JSDOM)

**Test File:** `packages/renderer/src/components/__tests__/TileView.test.tsx`

| Test ID | Description | Setup |
|---------|-------------|-------|
| TV-01 | Renders correct number of cards for given items | Provide 3 items; assert 3 card elements in DOM |
| TV-02 | Card displays song name, artists, album, language correctly | Verify text content matches item data |
| TV-03 | Card with null album shows em-dash | `album_name: null` → assert em-dash rendered |
| TV-04 | Card with empty artists array shows em-dash | `artists: []` → assert em-dash rendered |
| TV-05 | Card with unknown language_id shows em-dash | `language_id: 999` not in map → assert em-dash |
| TV-06 | Card click fires `onCardTap` with correct item | Click card; assert callback called with matching item |
| TV-07 | Loading state — shows CircularProgress, no cards | `isLoading=true` → assert spinner, no card elements |
| TV-08 | Empty state — shows "No Songs found" | `items=[]` → assert empty message |
| TV-09 | Error state — shows Alert with error message | `error=new Error('fail')` → assert Alert |
| TV-10 | Single card renders correctly | Provide 1 item; verify card content |
| TV-11 | Long text truncated with noWrap (card width constrains) | Verify `Typography` has `noWrap` prop |
| TV-12 | CSS Grid breakpoints present (2/3/4 columns) | Verify `sx` prop contains responsive grid template |

### 14.2 CategoryScreen Integration Tests

| Test ID | Description |
|---------|-------------|
| TV-I01 | Default view is TableView on initial render | Assert TableView visible, TileView not rendered |
| TV-I02 | View toggle click switches to TileView | Simulate toggle click; assert TileView visible |
| TV-I03 | View toggle click switches back to TableView | Click toggle twice; assert TableView visible again |

### 14.3 E2E Tests (Playwright, E-16)

| Test ID | Description |
|---------|-------------|
| TV-E01 | View toggle produces correct visual layout change |
| TV-E02 | Card click opens detail dialog |
| TV-E03 | Responsive grid: resize viewport, verify column count changes |

---

## 15. Definition Of Done

1. **File created:** `packages/renderer/src/components/TileView.tsx` with zero TypeScript errors (`tsc --noEmit`).
2. **File created:** `packages/renderer/src/components/__tests__/TileView.test.tsx` with all TV-01 through TV-12 passing.
3. **`CategoryScreen.tsx` updated:**
   - View toggle `IconButton` added to toolbar (between "New" button and view area).
   - `useState<'table' | 'tile'>('table')` for `viewMode`.
   - Conditional rendering: `viewMode === 'table' ? <TableView> : <TileView>`.
   - `languageMap` built from `useLanguages()` and passed to `TileView`.
4. **`components/index.ts` updated:** `TileView` exported.
5. **MUI components used correctly:** `Card`, `CardContent`, `Box` for grid container, `Typography` for text.
6. **CSS Grid responsive:** `grid-template-columns` adapts via MUI's responsive `sx` syntax or CSS media queries.
7. **Rule 13.4 confirmed:** Zero platform-specific imports.
8. **No logging:** Zero `console.*` calls.
9. **All acceptance criteria (AC-01 through AC-09) verified.**
10. **Integration tests TV-I01 through TV-I03 pass.**
11. **ESLint passes:** `pnpm lint` with zero errors.
12. **No unused imports** (`Rule 15.6`).
13. **`.tsx` extension used** (`Rule 11.6`).
14. **No virtualization mock needed** — TileView is not virtualized (`Rule 16.3` does not apply).
15. **`TileView` is a pure presentational component** — no data fetching, no store imports, no side effects.
