# E15-T11: Component Tests for Shell

> **Epic:** E-15 UI Shell | **Depends on:** T-15.2 through T-15.10 | **Blocks:** (none)

---

## 1. Goal

Audit and complete test coverage for all UI shell components. Close gaps identified in `MainLayout.test.tsx` (sidebar toggle expansion), `CategoryScreen.test.tsx` (error state, loading state, filter bar visibility, SelectionModeBar integration, sort toggle, dialog cancel, rapid view toggle), and `App.test.tsx` (PlatformAdapterContext provider). Verify all existing tests pass post-T15.10. Confirm coverage exceeds the 30% threshold defined in `jest.config.ts`.

## 2. Scope

| In Scope | Detail |
|----------|--------|
| `MainLayout.test.tsx` | Add ML-04 (toggle expands sidebar — verifies `desktopOpen` state change when toggle callback fires) |
| `CategoryScreen.test.tsx` | Add CS-07 (error state propagates to child), CS-08 (loading state propagates to child), CS-09 (FilterBar visible when filters active), CS-10 (SelectionModeBar visible when `selectionCount > 0`), CS-11 (sort toggle cycles asc → desc → none), CS-12 (create dialog cancel closes dialog), CS-13 (rapid view toggle table→tile→table) |
| `App.test.tsx` | Add AP-03 (PlatformAdapterContext provider rendered in component tree) |
| Regression verification | Run `pnpm test` and verify zero new failures across all existing test files |
| Coverage verification | Run `pnpm test -- --coverage` and verify global thresholds (branches ≥ 30%, functions ≥ 30%, lines ≥ 30%, statements ≥ 30%) |
| Platform adapter mock audit | Verify all component tests that call `usePlatformAdapter()` wrap in `PlatformAdapterContext.Provider`. TableView, TileView, MainLayout, and AppRouter already do this. Audit CategoryScreen for the same pattern (it renders TableView/TileView as children — those children call `usePlatformAdapter()` internally) |

## 3. Out of Scope

| Out of Scope | Handled By |
|-------------|-----------|
| New test files | No new test files are created. Existing `__tests__/` files are augmented. |
| E2E tests (Playwright) | E-16 (Testing & QA) |
| Store tests (`useSelectionStore`, `useAuthStore`, `useAppearanceStore`) | Already complete in E15-T09, E15-T01, E14 |
| Song dialog tests (SongCreateDialog, SongEditDialog, SongDetailDialog, DuplicateDetectionDialog, ArtistAutocomplete, LanguagePicker) | Already exist in `categories/songs/components/__tests__/` |
| Screen tests (SetupScreen, UnlockScreen, SettingsScreen, TrashScreen) | Already exist — stubs are adequate |
| Non-shell component tests (SearchBar, FilterBar, ColumnFilterPopover, useSearchFilterStore, useColumnFilterValues) | Already exist and complete |
| Test infrastructure changes (`jest.config.ts`, `test-setup.ts`, `package.json`) | Already configured — no changes needed |
| 100% coverage | V1 target is 30%. Higher coverage is deferred |
| Snapshot testing | Not adopted for this codebase |
| Visual regression testing | Playwright E2E (E-16) |

---

## 4. Files To Create

**None.** This task only modifies existing test files. Zero new files.

## 5. Files To Modify

| # | File | Change |
|---|------|--------|
| 1 | `packages/renderer/src/components/__tests__/MainLayout.test.tsx` | Add ML-04: click sidebar toggle button → verify `desktopOpen` state transitions to `true`. Requires refactoring the test to instantiate Sidebar component internally rather than fully mocking it, OR adding a mock `onDesktopToggle` that captures the state change. |
| 2 | `packages/renderer/src/components/__tests__/CategoryScreen.test.tsx` | Add CS-07 through CS-13 (see §14 for details). Requires extending mock configurations to simulate error, loading, filter state, selection state, and sort changes. |
| 3 | `packages/renderer/src/__tests__/App.test.tsx` | Add AP-03: verify `PlatformAdapterContext.Provider` wraps children in component tree. Requires mocking `PlatformAdapterContext` or rendering and checking for its presence. |

**No changes to source files.** This is a test-only task. No component, store, hook, or interface source code is modified.

## 6. Interfaces

### 6.1 Test-only Mocks — Reused (No Changes)

| Mock | Source | Purpose |
|------|--------|---------|
| `createMockPlatformAdapter()` | `hooks/__tests__/__mocks__/platformAdapterMock.ts` | Reusable mock factory for `PlatformAdapter` — used by tests that wrap components in `PlatformAdapterContext.Provider` |
| `jest.mock('@tanstack/react-virtual')` | Inline in TableView.test.tsx | Virtualizer mock per Rule 16.3 |
| `jest.mock('react-router-dom')` (partial) | Inline in AppRouter.test.tsx | Router mock per Rule 16.4 |
| `jest.mock('../Sidebar.js')` | Inline in MainLayout.test.tsx | Sidebar mock — may need enhancement for ML-04 (see below) |
| `jest.mock('../../ServiceProviderContext.js')` | Inline in CategoryScreen.test.tsx | Already returns `{ db: {} }` — adequate |
| `jest.mock('../../stores/useSelectionStore.js')` | Inline in CategoryScreen.test.tsx | Already provides `useSelectionCount: () => 0` — must be overridable per test for CS-10 |
| `jest.mock('../../categories/songs/store/useSongsStore.js')` | Inline in CategoryScreen.test.tsx | Already provides `useFilteredSongs: () => ({ data: [], isLoading: false, error: null })` — must be overridable per test for CS-07, CS-08 |
| `jest.mock('../useSearchFilterStore.js')` | Inline in CategoryScreen.test.tsx | Already provides sort/filter state — must be overridable per test for CS-09, CS-11 |

### 6.2 Sidebar Mock Enhancement (MainLayout.test.tsx — ML-04)

The current Sidebar mock in `MainLayout.test.tsx` renders a static `<div>` — it does not invoke `onDesktopToggle` when clicked. For ML-04 to work, the mock must either:
- **Option A:** Mock Sidebar to call `onDesktopToggle` when its toggle button is clicked. Requires changing the mock to a real stub component that fires the callback.
- **Option B:** Test MainLayout state transitions by directly calling the `handleDesktopToggle` callback exposed through a ref or prop.

**Decision (in-spec):** Use **Option A** — refactor the Sidebar mock into a simple stub that renders a clickable toggle `IconButton` and calls `props.onDesktopToggle()` on click. This is test-only; no production Sidebar changes.

### 6.3 Mock Override Pattern for CategoryScreen Tests

New tests (CS-07 through CS-13) require different mock return values per test. The established override pattern uses `jest.spyOn` or `mockReturnValue` on the shared mock reference. Example for CS-08 (loading state):

```typescript
// CS-08: Loading state
it('shows loading indicator when data is loading', () => {
  // Override the module-level mock for this test only
  mockUseFilteredSongs.mockReturnValue({ data: [], isLoading: true, error: null });
  render(<CategoryScreen category={mockCategory} />);
  // assert CircularProgress visible...
});
```

To enable per-test overrides, the test file must:
1. Define mock functions at module scope (e.g., `const mockUseFilteredSongs = jest.fn()`)
2. Reference them in `jest.mock()` factory
3. Override return values in individual tests via `.mockReturnValue()`
4. Reset in `beforeEach` via `jest.clearAllMocks()` or explicit `.mockReset()`

This pattern is already used in `TrashScreen.test.tsx` (lines 7-9: `const mockUseDeletedSongs = jest.fn()`). The CategoryScreen.test.tsx must be refactored to match this pattern for `useFilteredSongs`, `useSelectionCount`, and `useSearchFilterStore` mocks.

### 6.4 Reused from `@collectio/shared`

| Import | Usage |
|--------|-------|
| `CategoryDefinition` | Creating mock category objects for CategoryScreen tests |
| `SongWithArtists` | Creating mock data for `useFilteredSongs` return values |
| `PlatformAdapter` | Type for mock adapter (already provided by `createMockPlatformAdapter`) |

---

## 7. Data Flow

### 7.1 Test Execution Flow

```
pnpm test
  │
  ├─ jest.config.ts — roots: src/, testMatch: **/__tests__/**/*.test.{ts,tsx}
  │
  ├─ Per test file:
  │   ├─ jest.mock() calls register module-level mock replacements
  │   ├─ describe() blocks group related tests
  │   ├─ beforeEach() resets store state / mock call counts
  │   ├─ render() mounts component with mock providers
  │   ├─ screen.getByText() / fireEvent.click() / userEvent.* exercise component
  │   └─ expect() assertions verify DOM state / callback invocations
  │
  └─ jest --coverage produces lcov + text summary against 30% thresholds
```

### 7.2 Mock Resolution Flow

```
Test file imports { TableView } from '../TableView.js'
  │
  ├─ jest.mock('../TableView.js', ...) intercepts import
  │   └─ Returns mock component (if mocked) or real component (if not mocked)
  │
  ├─ Real TableView imports { usePlatformAdapter } from '../../hooks/usePlatformAdapter.js'
  │   └─ usePlatformAdapter reads from PlatformAdapterContext
  │       └─ Test wraps component in <PlatformAdapterContext.Provider value={mockAdapter}>
  │           └─ Hook returns mock adapter — no throw, no platform detection
  │
  └─ Real TableView imports { useVirtualizer } from '@tanstack/react-virtual'
      └─ jest.mock('@tanstack/react-virtual', ...) intercepts
          └─ Returns mock useVirtualizer per Rule 16.3
```

### 7.3 New Test: ML-04 Data Flow

```
MainLayout.test.tsx
  │
  ├─ Mock <Sidebar> renders IconButton with onClick → props.onDesktopToggle()
  ├─ renderWithProvider(<MainLayout />)
  ├─ Initial assertion: sidebar has data-open="false"
  ├─ fireEvent.click(screen.getByLabelText('Toggle sidebar'))
  ├─ Mock onDesktopToggle fires → MainLayout's handleDesktopToggle sets desktopOpen=true
  ├─ Re-render triggered
  └─ Assertion: sidebar has data-open="true"
```

### 7.4 New Tests: CS-07 / CS-08 Data Flow

```
CategoryScreen.test.tsx
  │
  ├─ CS-07 (error):
  │   ├─ mockUseFilteredSongs.mockReturnValue({ data: [], isLoading: false, error: new Error('fail') })
  │   ├─ render(<CategoryScreen category={mockCategory} />)
  │   ├─ CategoryScreen renders <TableView items={[]} isLoading={false} error={error} />
  │   ├─ Mock TableView renders <div> with error prop — or —
  │   └─ Verify Alert/error indicator present in DOM
  │
  └─ CS-08 (loading):
      ├─ mockUseFilteredSongs.mockReturnValue({ data: [], isLoading: true, error: null })
      ├─ render(<CategoryScreen category={mockCategory} />)
      └─ Verify CircularProgress or loading indicator present
```

### 7.5 New Test: CS-09 Data Flow

```
  ├─ mockUseSearchFilterStore returns columnFilters: { language_id: ['en'] }
  ├─ hasActiveFilters computed as true (Object.keys(columnFilters).length > 0)
  ├─ render(<CategoryScreen category={mockCategory} />)
  └─ FilterBar rendered in DOM (data-testid="filter-bar")
```

### 7.6 New Test: CS-10 Data Flow

```
  ├─ Override useSelectionCount mock to return 3
  ├─ render(<CategoryScreen category={mockCategory} />)
  └─ SelectionModeBar rendered with "3 selected" text
```

---

## 8. State Changes

### 8.1 Test State Management

**No production state changes.** Tests manipulate only:

| What Changes | How |
|-------------|-----|
| Mock return values | `mockFn.mockReturnValue({ ... })` — per-test overrides |
| Store state (Zustand) | `useAuthStore.setState({ isAuthenticated: true })` — already pattern in AppRouter.test.tsx |
| Component state via user interaction | `fireEvent.click()`, `userEvent.type()` — triggers React state updates |
| Context values | `<PlatformAdapterContext.Provider value={adapter}>` — injected per test |

### 8.2 Test Cleanup

Per `jest.config.ts`, each test file runs in its own environment. JSDOM is reset between files. Within a file:

| When | What Cleans Up |
|------|---------------|
| `beforeEach` | `jest.clearAllMocks()` resets mock call counts and implementations |
| `beforeEach` | Store state reset (e.g., `useAuthStore.setState({ isAuthenticated: true })`) |
| After each test | `@testing-library/react` `cleanup()` auto-unmounts rendered components (configured by default in RTL v14+) |

### 8.3 CategoryScreen.test.tsx Required Refactoring

Current mock setup (lines 37-58) uses factory-returned static values inside `jest.mock()` — they cannot be overridden per test. **Refactoring required:**

| Current Pattern | Required Pattern |
|----------------|-----------------|
| `jest.mock('../../categories/songs/store/useSongsStore.js', () => ({ useFilteredSongs: () => ({ data: [], isLoading: false, error: null }) }))` | `const mockUseFilteredSongs = jest.fn().mockReturnValue({ data: [], isLoading: false, error: null }); jest.mock('...', () => ({ useFilteredSongs: () => mockUseFilteredSongs() }))` |
| `jest.mock('../../stores/useSelectionStore.js', () => ({ useSelectionCount: () => 0 }))` | `const mockUseSelectionCount = jest.fn().mockReturnValue(0); jest.mock('...', () => ({ useSelectionCount: mockUseSelectionCount }))` |

This refactoring affects CS-01 through CS-06 (existing tests) — all must continue to pass after the mock pattern change. No behavior change to existing tests — only the internal mock mechanism changes.

---

## 9. Database Changes

**None.** Tests use JSDOM in-memory DOM only. No SQLite, no migrations, no database connections. `useServiceProvider()` is mocked to return `{ db: {} }` — a stub object with no real database.

---

## 10. Error Handling

| Scenario | Handling |
|----------|----------|
| Test file imports a module not jest.mocked | Real module is used. If real module imports platform code, `moduleNameMapper` in `jest.config.ts` resolves `@platform` to platform mocks. No platform-native code runs in JSDOM. |
| `usePlatformAdapter()` called without provider in test | Returns `noopPlatformAdapter` per AD-T15.10-02 — all flags `false`/neutral. Test assertions for platform-specific behavior will fail (correctly — test is not providing the expected platform context). |
| Mock `useFilteredSongs` returns `undefined` data | `CategoryScreen` destructures `{ data: songs = [] }` — default `[]` prevents crash. Test verifies empty state rendered. |
| Test passes `error: new Error('fail')` to mock | `CategoryScreen` passes error to `TableView`/`TileView`. Those components render `<Alert severity="error">`. Mock `TableView` captures this — or render real `TableView` inside test. |
| `fireEvent.click()` on non-existent element | `@testing-library/react` throws `TestingLibraryElementError` with descriptive message — test fails with clear error. |
| `userEvent.type()` on disabled input | `user-event` v14 skips disabled inputs and logs a warning. Test that expects typing should check `disabled` prop first. |
| Jest spy on immutable module export | Use `jest.mocked()` wrapper + `.mockReturnValue()`. Direct reassignment of `const` exports is a runtime error. |

---

## 11. Logging Requirements

**None.** Test files must **not** contain `console.log`, `console.error`, or `console.warn` calls. Jest captures console output automatically — any intentional logging in production components will appear in test output, which is acceptable (Jest does not fail on console output unless `--silent` is passed).

---

## 12. Security Requirements

| Requirement | Relevance |
|-------------|-----------|
| Rule 12.1 / 12.2: No secrets in tests | Test mocks use stub functions and placeholder data — no real tokens, passwords, or keys |
| Rule 13.4: No platform imports in renderer | **Verified by tsc and test execution** — if a test file imports `@capacitor/app` or `electron`, the test fails with a module resolution error (these packages are not in renderer's `node_modules`) or a TypeScript compilation error |
| Rule 13.1: No platform conditionals | N/A — tests don't contain production logic |

No new security concerns. Test files do not access file system, network, or platform APIs.

---

## 13. Acceptance Criteria

| ID | Criterion | Verification |
|----|-----------|-------------|
| AC-01 | `pnpm test` passes with zero failures | Run `pnpm test` from `packages/renderer/` |
| AC-02 | `pnpm test -- --coverage` meets or exceeds thresholds (branches ≥ 30%, functions ≥ 30%, lines ≥ 30%, statements ≥ 30%) | Run coverage; inspect text-summary output |
| AC-03 | ML-04: Clicking sidebar toggle changes `desktopOpen` from `false` to `true` | Unit test asserts `data-open` attribute changes |
| AC-04 | CS-07: Error state propagates to child component (Alert or error text visible) | Unit test passes `error` via mock; asserts error indicator in DOM |
| AC-05 | CS-08: Loading state shows loading indicator | Unit test passes `isLoading=true` via mock; asserts spinner present |
| AC-06 | CS-09: FilterBar visible when column filters are active | Unit test mocks non-empty `columnFilters`; asserts FilterBar rendered |
| AC-07 | CS-10: SelectionModeBar visible when `selectionCount > 0` | Unit test mocks `useSelectionCount → 3`; asserts "3 selected" text visible |
| AC-08 | CS-11: Sort toggle cycles asc → desc → none | Unit test clicks header; verifies `setSort` / `clearSort` called with correct args in sequence |
| AC-09 | CS-12: Create dialog cancel closes dialog | Unit test opens dialog; clicks cancel; asserts dialog gone |
| AC-10 | CS-13: Rapid view toggle table → tile → table renders correct view each step | Unit test toggles three times; verifies correct view component each time |
| AC-11 | AP-03: App component renders PlatformAdapterContext.Provider | Unit test renders `<App />`; asserts provider in component tree |
| AC-12 | All existing tests (SB-01 through SP-18, CN-01 through CN-06, CS-01 through CS-06, TV-01 through TV-PLAT-06, TV-01 through TV-PLAT-09, RT-01 through RT-PLAT-04, AP-01 through AP-02, etc.) continue to pass | `pnpm test` report shows zero regressions |
| AC-13 | `tsc --noEmit` passes with zero errors | Run `pnpm typecheck` |
| AC-14 | `pnpm lint` passes with zero errors | Run `pnpm lint` |
| AC-15 | No `console.log` or `console.error` calls in test files | Grep `__tests__/` for `console.` — verify only justified calls (none expected) |

---

## 14. Test Cases

### 14.1 MainLayout — New Tests

**File:** `packages/renderer/src/components/__tests__/MainLayout.test.tsx`

| Test ID | Description | Setup |
|---------|-------------|-------|
| ML-04 | Clicking sidebar toggle button changes `desktopOpen` from `false` to `true` | Refactor Sidebar mock to a stub that renders `<IconButton aria-label="Toggle sidebar" onClick={() => props.onDesktopToggle?.()}>`. Initial render: sidebar `data-open="false"`. Click toggle button. Re-render: sidebar `data-open="true"`. |

### 14.2 CategoryScreen — New Tests

**File:** `packages/renderer/src/components/__tests__/CategoryScreen.test.tsx`

**Required refactoring (before new tests):** Lift `mockUseFilteredSongs`, `mockUseSelectionCount`, and `mockUseSearchFilterStore` to module-scope `jest.fn()` variables. Update `jest.mock()` factories to delegate to these variables. Call `jest.clearAllMocks()` in `beforeEach`. Existing CS-01 through CS-06 must pass unchanged.

| Test ID | Description | Mock Setup |
|---------|-------------|------------|
| CS-07 | Error state — displays error message when `useFilteredSongs` returns error | `mockUseFilteredSongs.mockReturnValue({ data: [], isLoading: false, error: new Error('Database connection lost') })` — verify error message "Database connection lost" visible in DOM |
| CS-08 | Loading state — shows loading indicator when data is loading | `mockUseFilteredSongs.mockReturnValue({ data: [], isLoading: true, error: null })` — verify `CircularProgress` or loading text visible |
| CS-09 | FilterBar visible when column filters are active | `mockUseSearchFilterStore` returns `columnFilters: { language_id: ['en'] }` — verify `data-testid="filter-bar"` in DOM |
| CS-10 | SelectionModeBar visible when `selectionCount > 0` | `mockUseSelectionCount.mockReturnValue(3)` — verify SelectionModeBar renders with "3 selected" |
| CS-11 | Sort toggle cycles asc → desc → none | Mock `setSort` and `clearSort` as `jest.fn()`. Simulate three sequential header clicks on the same column. Assert: 1st call → `setSort('name', 'asc')`, 2nd call → `setSort('name', 'desc')`, 3rd call → `clearSort()` |
| CS-12 | Create dialog cancel button closes dialog | Click "New Song" → dialog opens (`data-testid="create-dialog"` visible). Mock `SongCreateDialog` to render a Cancel button that calls `props.onCancel`. Click cancel → assert dialog not in DOM |
| CS-13 | Rapid view toggle table → tile → table renders correct view each step | Click "Switch to tile view" → assert `data-testid="tile-view"` visible, `data-testid="table-view"` not visible. Click "Switch to table view" → assert `data-testid="table-view"` visible, `data-testid="tile-view"` not visible |

### 14.3 App — New Test

**File:** `packages/renderer/src/__tests__/App.test.tsx`

| Test ID | Description | Setup |
|---------|-------------|-------|
| AP-03 | App renders `PlatformAdapterContext.Provider` in component tree | Render `<App />`. Either: (a) mock `PlatformAdapterContext.Provider` to render with `data-testid="platform-adapter-provider"` and assert it in DOM, OR (b) render without mocking `AppRouter` and verify the production provider is rendered. **Recommendation:** Use approach (a) — mock `PlatformAdapterContext` to wrap children in a `div[data-testid]`, mirroring the ThemeProvider mock pattern already in this file. |

### 14.4 Regression — No New Tests, Verification Only

| Verification | Method |
|-------------|--------|
| All existing MainLayout tests pass after Sidebar mock refactoring | Run `pnpm test -- --testPathPattern='MainLayout'` |
| All existing CategoryScreen tests pass after mock pattern refactoring | Run `pnpm test -- --testPathPattern='CategoryScreen'` |
| All existing TableView tests pass with PlatformAdapterContext wrapper | Run `pnpm test -- --testPathPattern='TableView'` |
| All existing TileView tests pass with PlatformAdapterContext wrapper | Run `pnpm test -- --testPathPattern='TileView'` |
| All existing AppRouter tests pass with PlatformAdapterContext wrapper | Run `pnpm test -- --testPathPattern='AppRouter'` |
| Full test suite passes | Run `pnpm test` — zero failures |

---

## 15. Definition Of Done

1. **`MainLayout.test.tsx` updated:**
   - Sidebar mock refactored to a stub that fires `onDesktopToggle` on toggle button click.
   - ML-04 added and passing: toggle click changes `desktopOpen` from `false` to `true`.
   - Existing ML-01, ML-02, ML-03, ML-PLAT-01, ML-PLAT-02 continue to pass.

2. **`CategoryScreen.test.tsx` refactored:**
   - `mockUseFilteredSongs`, `mockUseSelectionCount`, and mutable mock for `useSearchFilterStore` lifted to module-scope `jest.fn()`.
   - Existing CS-01 through CS-06 pass after refactoring.
   - CS-07 through CS-13 added and passing.

3. **`App.test.tsx` updated:**
   - Mock for `PlatformAdapterContext.Provider` added (approach matching ThemeProvider mock).
   - AP-03 added and passing: provider wraps children.

4. **No source file changes:** Zero TypeScript errors in prod code. `tsc --noEmit` passes.

5. **`pnpm lint` passes** with zero errors across all modified test files.

6. **`pnpm test` passes** with zero failures across all test suites.

7. **`pnpm test -- --coverage` meets thresholds:**
   - Branches ≥ 30%
   - Functions ≥ 30%
   - Lines ≥ 30%
   - Statements ≥ 30%

8. **Rule compliance verified:**
   - No platform imports in test files (Rule 13.4 — verified by `tsc --noEmit` and test execution).
   - No unused imports (Rule 15.6).
   - `.tsx` extension on all JSX-containing test files (Rule 11.6).
   - `@tanstack/react-virtual` mocked in TableView tests (Rule 16.3).
   - `react-router-dom` partially mocked in AppRouter tests (Rule 16.4).
   - No console logging in test files (Rule 12.2).

9. **All acceptance criteria (AC-01 through AC-15) verified.**

---

## 16. Traceability

| Source Document | Section | Requirement |
|----------------|---------|-------------|
| `E-15_UI_SHELL.md` | T-15.11 | Component tests for shell: sidebar collapse/expand, navigation callbacks, table renders rows, tile renders cards, selection mode activates/deactivates |
| `E-15_UI_SHELL.md` | T-15.11 AC | Uses `@testing-library/react` (RTL) with jsdom environment |
| `E15-T01_ROUTER_STRUCTURE.md` | §14 | AppRouter test patterns: partial mock of `react-router-dom`, MemoryRouter wrapper, state-based auth routing tests |
| `E15-T07_TABLE_VIEW.md` | §14 | TableView test patterns: `@tanstack/react-virtual` mock, gridTemplateColumns verification, checkbox selection tests |
| `E15-T08_TILE_VIEW.md` | §14 | TileView test patterns: card rendering, responsive grid, callback firing |
| `E15-T09_SELECTION_MODE.md` | §14 | SelectionModeBar test patterns; useSelectionStore test patterns |
| `E15-T10_PLATFORM_UI_ADAPTATIONS.md` | §14 | PlatformAdapter hook tests; platform mock factory; adapter context provider wrapping |
| `07_AGENT_RULES.md` | Rule 16.3 | Mock `@tanstack/react-virtual` in JSDOM tests |
| `07_AGENT_RULES.md` | Rule 16.4 | Partial mock of `react-router-dom` for BrowserRouter/HashRouter |
| `07_AGENT_RULES.md` | Rule 16.2 | Snapshot pre/post state for "no side effects" tests (not triggered here — tests are DOM-verification, not mutation-verification) |
| `07_AGENT_RULES.md` | Rule 11.6 | `.tsx` extension for JSX files |
| `07_AGENT_RULES.md` | Rule 15.6 | No unused imports |
| `07_AGENT_RULES.md` | Rule 13.4 | No platform imports in renderer test files |
| `06_IMPLEMENTATION_DECISIONS.md` | AD-23 | Virtualized tables use CSS Grid — tests verify grid template output |
| `06_IMPLEMENTATION_DECISIONS.md` | AD-T15.10-02 | NoopPlatformAdapter as default — tests without provider should not throw |
| `jest.config.ts` | coverageThreshold | global 30% minimum on branches/functions/lines/statements |

---

## 17. Architecture Decisions (New)

### AD-T15.11-01: Mock Refactoring Pattern — Module-Scope `jest.fn()` Over Static Factory

**Decision:** When a test file needs per-test mock return value overrides, use module-scope `jest.fn()` variables referenced inside `jest.mock()` factory callbacks. Do NOT use static factory return values that cannot be overridden.

**Reason:**
- `jest.mock()` is hoisted above imports — the factory runs once at module load time
- Static return values (`() => ({ data: [] })`) in the factory are locked in and cannot change per test
- `jest.fn().mockReturnValue(...)` allows individual tests to set different return values via `.mockReturnValue()` before render
- This pattern is already established in `TrashScreen.test.tsx` (lines 7-9)

**Consequences:**
- CategoryScreen.test.tsx must be refactored to use `const mockUseFilteredSongs = jest.fn()` at module scope
- The refactoring is mechanical — no semantic change to existing tests
- Future test files with state-dependent mock behavior must follow this pattern from the start
- `jest.clearAllMocks()` in `beforeEach` resets both call counts AND mock implementations (sets them to `jest.fn().mockReturnValue(undefined)`). Per-test setups that call `.mockReturnValue()` must run AFTER `beforeEach` resets. The correct order is: `beforeEach` clears → individual test sets `.mockReturnValue()` → render → assert.

### AD-T15.11-02: CategoryScreen Tests Render Mock Children — Not Real TableView/TileView

**Decision:** `CategoryScreen.test.tsx` continues to mock `TableView` and `TileView` as simple `<div data-testid="...">` stubs. New tests (CS-07, CS-08) assert that `CategoryScreen` correctly passes `error` and `isLoading` props rather than asserting exact child rendering.

**Reason:**
- `TableView` and `TileView` have their own comprehensive test suites
- CategoryScreen's responsibility is to compute the correct props and pass them — not to re-verify TableView rendering
- Rendering real `TableView` would require providing the full `PlatformAdapterContext.Provider` with mock adapter, `useSelectionStore` mock, and `@tanstack/react-virtual` mock — unnecessary coupling for CategoryScreen-level tests
- This is consistent with the existing pattern in lines 64-70 of CategoryScreen.test.tsx

**Consequences:**
- CS-07 verifies that when `useFilteredSongs` returns an error, the `error` prop flows into the rendered view tree (error message visible in DOM via the mock child or an Alert component)
- CS-08 verifies that when `useFilteredSongs` returns `isLoading: true`, a loading indicator renders
- Both tests verify parent → child prop flow, not child internal rendering
- If `CategoryScreen` adds its own error/loading UI (not just delegating to TableView/TileView), these tests still correctly verify that UI

### AD-T15.11-03: Sidebar Mock Becomes Interactive Stub for ML-04

**Decision:** The Sidebar mock in `MainLayout.test.tsx` is refactored from a static `<div>` to an interactive stub that renders a clickable toggle button calling `props.onDesktopToggle()`. The stub also passes through `desktopOpen` as `data-open` attribute.

**Reason:**
- ML-02 verifies the sidebar starts collapsed — this test is correct and must still pass
- ML-04 needs to verify that clicking the toggle changes the expanded state
- Without an interactive mock, there is no DOM element to click that triggers `onDesktopToggle`
- The stub stays minimal — it does not need to render a full sidebar, just a clickable toggle + data attribute passthrough

**Consequences:**
- The updated mock looks like:
  ```
  Sidebar: (props) => (
    <div data-testid="sidebar" data-open={props.desktopOpen}>
      <button aria-label="Toggle sidebar" onClick={() => props.onDesktopToggle?.()}>Toggle</button>
    </div>
  )
  ```
- ML-01 through ML-03 continue to pass with this mock (they assert sidebar existence and initial state)
- ML-04 clicks the toggle and asserts `data-open` changes
- No change to production `Sidebar.tsx`

---

## 18. Appendix A — Test Count Summary

| Test File | Before | Added | After |
|-----------|--------|-------|-------|
| `MainLayout.test.tsx` | 5 | 1 (ML-04) | 6 |
| `CategoryScreen.test.tsx` | 6 | 7 (CS-07–CS-13) | 13 |
| `App.test.tsx` | 3 | 1 (AP-03) | 4 |
| **Total new tests** | — | **9** | — |
| **Total tests post-task** | ~80+ | +9 | ~89+ |

## 19. Appendix B — Coverage Target Validation

The `jest.config.ts` thresholds are:

| Metric | Threshold | Rationale |
|--------|-----------|-----------|
| branches | 30% | Conditional paths (if/else, ternary, &&) — shell components have moderate branching (view toggle, auth state, error/loading/empty) |
| functions | 30% | Named functions, callbacks, arrow functions — shell components have many callbacks (onSort, onRowTap, onClear) |
| lines | 30% | Line coverage — shell source files are ~1,100 lines total across all components |
| statements | 30% | Statement coverage — tracks execution of individual statements |

All four metrics must be met. If any metric is below 30% after test additions, additional tests must be added for the under-covered files. The `coverage/text-summary` report identifies which files are below threshold.

## 20. Appendix C — Files Explicitly NOT Modified

These files exist and are already adequate — no changes needed in this task:

| File | Reason |
|------|--------|
| `components/__tests__/Sidebar.test.tsx` | 10 tests covering collapse/expand, links, mobile drawer — adequate |
| `components/__tests__/SyncStatusPanel.test.tsx` | 18 tests covering all status types, timestamps, counts, collapsed mode — adequate |
| `components/__tests__/CategoryNav.test.tsx` | 6 tests covering rendering, navigation, collapsed mode, unknown icons — adequate |
| `components/__tests__/TableView.test.tsx` | 22 tests (16 core + 6 platform) — adequate |
| `components/__tests__/TileView.test.tsx` | 15 tests (12 core + 3 platform) — adequate |
| `components/__tests__/SelectionModeBar.test.tsx` | 6 tests covering count, buttons, callbacks, layout — adequate |
| `components/__tests__/SearchBar.test.tsx` | Exists — adequate |
| `components/__tests__/FilterBar.test.tsx` | Exists — adequate |
| `components/__tests__/ColumnFilterPopover.test.tsx` | Exists — adequate |
| `navigation/__tests__/AppRouter.test.tsx` | 17 tests (12 route + 3 router type + 2 platform) — adequate |
| `stores/__tests__/useSelectionStore.test.ts` | 10 tests — adequate |
| `stores/__tests__/useAuthStore.test.ts` | 4 tests — adequate |
| `stores/__tests__/useAppearanceStore.test.ts` | Exists — adequate |
| `screens/__tests__/SetupScreen.test.tsx` | 1 stub test — adequate (stub component) |
| `screens/__tests__/UnlockScreen.test.tsx` | 1 stub test — adequate (stub component) |
| `screens/__tests__/SettingsScreen.test.tsx` | Exists — adequate |
| `screens/__tests__/TrashScreen.test.tsx` | Exists — adequate |
| `__tests__/ServiceProviderContext.test.tsx` | 3 tests — adequate |
