# E14: Settings and Configuration — Implementation Specification

> **Source epic:** [E-14_SETTINGS.md](../epics/E-14_SETTINGS.md) — tasks T-14.1 through T-14.7
> **Prerequisites:** E-02 (Database Layer) — COMPLETE
> **Blocks:** (none)
> **Platform impact:** NONE — pure TypeScript in `@collectio/shared`, MUI React in `@collectio/renderer`

---

## 1. Goal

Implement a `SettingsManager` (application-layer orchestrator with defaults, type coercion, and validation) and a `SettingsScreen` (MUI form) that persists user preferences to the existing `app_settings` SQLite table. Wire MUI `ThemeProvider` into the app root so the `theme` setting controls light/dark mode across the entire application. Restructure the `App` component to support this infrastructure.

Changes to `sync_on_startup` and `auto_sync_delay_seconds` take effect on the next app launch (SyncEngine reads settings once at `initialize()` — no live-update method exists in V1).

---

## 2. Scope

| Task | Summary | Status |
|------|---------|--------|
| T-14.1 | `SettingsScreen` — MUI form with toggles, selects, slider, read-only fields | **NEW** — `packages/renderer/src/screens/SettingsScreen.tsx` |
| T-14.2 | `SettingsManager` — application-layer orchestrator: defaults, type coercion, validation, persistence | **NEW** — `packages/shared/src/application/settings/SettingsManager.ts` |
| T-14.3 | Sync-on-startup toggle (Switch) | Integrated into T-14.1 |
| T-14.4 | Auto-sync delay input (Slider or TextField, 30–600s) | Integrated into T-14.1 |
| T-14.5 | Default view toggle (table vs tile) | Integrated into T-14.1 |
| T-14.6 | Theme selection (light vs dark) | Integrated into T-14.1 |
| T-14.7 | Settings persistence tests | Integrated into test files |
| — | **Theme wiring** — `ThemeProvider` + `CssBaseline` at app root | **ADDED TO SCOPE** — `packages/renderer/src/App.tsx` restructure |

---

## 3. Out of Scope

- Live update of sync engine settings (updating `auto_sync_delay_seconds` while SyncEngine is running) — SyncEngine reads settings once at `initialize()`. Defer live-config update to V2.
- Editable `trash_retention_days` — V1 has indefinite retention only. The setting is read-only ("Indefinite").
- Per-category settings — settings apply globally. V2 may add per-category defaults.
- Settings import/export
- Settings screen unit/integration tests for native platform behavior (the tests use mocked `DatabaseConnection` — identical to existing repository tests)
- Dark mode image assets or icon variants — this is pure MUI theming, no asset changes needed.

---

## 4. Files To Create

| # | File | Package | Purpose | Type |
|---|------|---------|---------|------|
| 1 | `packages/shared/src/application/settings/SettingsManager.ts` | `@collectio/shared` | Application-layer settings orchestrator: parses typed values from string storage, provides defaults, validates input, persists via `AppSettingsRepository` | Pure TypeScript |
| 2 | `packages/shared/src/application/settings/__tests__/SettingsManager.test.ts` | `@collectio/shared` | Unit tests: defaults, type coercion, validation errors, get/set/getAll/reset | Jest test |
| 3 | `packages/renderer/src/screens/SettingsScreen.tsx` | `@collectio/renderer` | MUI form screen: sync-on-startup toggle, auto-sync delay slider/input, default view select, theme select, trash retention info, save feedback | React + MUI |
| 4 | `packages/renderer/src/screens/__tests__/SettingsScreen.test.tsx` | `@collectio/renderer` | Integration tests: form renders, loads values, persists changes, shows validation errors | Jest + RTL |
| 5 | `packages/shared/src/application/settings/settings-defaults.ts` | `@collectio/shared` | Constants: default values, allowed values, min/max ranges for every setting key | Pure TypeScript (constants) |

---

## 5. Files To Modify

| # | File | Change | Package |
|---|------|--------|---------|
| 1 | `packages/renderer/src/App.tsx` | Replace stub `<h1>Collectiods</h1>` with full app shell: read theme setting → MUI `ThemeProvider` + `CssBaseline` → render `AppRouter` | `@collectio/renderer` |
| 2 | `packages/renderer/src/navigation/AppRouter.tsx` | Replace `/settings` placeholder `<div>SettingsScreen (not yet implemented)</div>` with `<SettingsScreen />` import | `@collectio/renderer` |
| 3 | `packages/shared/src/application/index.ts` | Add `export { SettingsManager }` and `export type { SettingsValues }` and `export { SETTINGS_DEFAULTS, SETTINGS_SCHEMA }` | `@collectio/shared` |
| 4 | `packages/shared/src/index.ts` | Add re-exports for SettingsManager, SettingsValues, settings-defaults | `@collectio/shared` |
| 5 | `packages/renderer/src/index.ts` | Add `export { SettingsScreen } from './screens/SettingsScreen.js'` | `@collectio/renderer` |

---

## 6. Interfaces

### 6.1 `SettingsManager`

**Purpose:** Application-layer orchestrator wrapping `AppSettingsRepository`. Provides typed get/set with defaults, validation, and type coercion. The single source of truth for all settings access above the data layer.

**Constructor:**

```
constructor(repository: AppSettingsRepository)
```

**Type: `SettingsValues`**

```
interface SettingsValues {
  theme: 'light' | 'dark';
  default_view: 'table' | 'tile';
  sync_on_startup: boolean;
  auto_sync_delay_seconds: number;
  trash_retention_days: number;
}
```

**Public API:**

```
get(key: AppSettingsKey): Promise<string | number | boolean>
```
Returns the typed value for a setting. If the key is not stored in the database, returns the default. Performs type coercion: `'true'/'false'` → `boolean`, `'120'` → `number` for numeric keys. Returns raw `string` for theme/default_view.

```
set(key: AppSettingsKey, value: unknown): Promise<void>
```
Validates the value against the schema for that key, then persists via `AppSettingsRepository.set()`. Throws `ValidationError` (new custom error, or reuse `DatabaseError`) if value is invalid.

```
getAll(): Promise<SettingsValues>
```
Returns all settings as a typed object. Missing keys get default values. Uses `AppSettingsRepository.getAll()` and fills gaps with defaults.

```
resetAll(): Promise<void>
```
Overwrites all 5 keys to their defaults in a single transaction (Rule 4.8).

```
getDefault(key: AppSettingsKey): string | number | boolean
```
Returns the default value for a key. Synchronous — no database call.

### 6.2 Settings Defaults & Schema (`settings-defaults.ts`)

**Purpose:** Centralized constants file defining default values, allowed values, and validation rules for every setting key. Consumed by SettingsManager and SettingsScreen.

**Exports:**

```
SETTINGS_DEFAULTS: Record<AppSettingsKey, string>
```
Default string values for every key. Used when a key is not stored in `app_settings`.

```
SETTINGS_SCHEMA: Record<AppSettingsKey, SettingSchema>
```
Where `SettingSchema` is:

```
interface SettingSchema {
  type: 'string' | 'boolean' | 'number';
  allowedValues?: readonly string[];
  min?: number;
  max?: number;
  label: string;       // UI display label (English)
  description: string; // Help text for the setting
}
```

**Defaults Table:**

| Key | Default | Type | Allowed / Range |
|-----|---------|------|-----------------|
| `theme` | `'light'` | string | `'light'`, `'dark'` |
| `default_view` | `'table'` | string | `'table'`, `'tile'` |
| `sync_on_startup` | `'true'` | boolean | `'true'`, `'false'` |
| `auto_sync_delay_seconds` | `'120'` | number | 30–600 |
| `trash_retention_days` | `'-1'` | number | -1 = indefinite (V1: read-only) |

### 6.3 `SettingsScreen`

**Purpose:** MUI form screen that loads settings from the database, renders interactive form controls for each setting, writes changes on user interaction, and provides immediate feedback (success/error snackbar). Rendered within MainLayout's `<Outlet />` at `/settings`.

**Props:** None (self-contained — reads `db` from `useServiceProvider()` context).

**Internal State:**

```
{
  values: Partial<SettingsValues>;           // Loaded from DB on mount
  saving: Record<string, boolean>;           // Per-key saving state
  error: string | null;                      // User-facing error message
  dirty: boolean;                            // True when unsaved changes exist
}
```

**Form Controls:**

| Setting | Control | MUI Component | Behavior |
|---------|---------|---------------|----------|
| Theme | Toggle | `Switch` with labels "Light" / "Dark" | Immediate save on toggle |
| Default View | Select | `FormControl` + `Select` + `MenuItem` | Immediate save on select |
| Sync on Startup | Toggle | `Switch` | Immediate save on toggle |
| Auto-Sync Delay | Slider + Number Input | `Slider` (30–600) + `TextField type="number"` | Save on slider commit (drag end) or input blur |
| Trash Retention | Read-only text | `TextField` with `disabled: true` | Shows "Indefinite" |

**Immediate Save Pattern:** Each form control fires `SettingsManager.set()` directly on change (no Save button). A brief `Snackbar` shows "Saved" on success or the error message on failure. This matches the constitution's simplicity philosophy — no multi-step form submission.

---

## 7. Data Flow

### 7.1 SettingsScreen Mount

```
SettingsScreen mounts
  → useServiceProvider() → { db }
  → new AppSettingsRepository(db)
  → new SettingsManager(appSettingsRepo)
  → settingsManager.getAll() → SettingsValues
  → Populate form controls with current values
```

### 7.2 User Changes a Setting (e.g., toggle theme)

```
User flips Theme Switch to "dark"
  → onChange handler fires
  → setSaving({ theme: true })
  → settingsManager.set('theme', 'dark')
    → validates against schema: 'dark' ∈ ['light', 'dark'] → OK
    → appSettingsRepo.set('theme', 'dark')
      → INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('theme', 'dark', NOW())
  → on success:
    → update local state: values.theme = 'dark'
    → setSaving({ theme: false })
    → show Snackbar: "Theme updated"
    → The app root (App.tsx) must re-read theme and update ThemeProvider
  → on failure:
    → setSaving({ theme: false })
    → show Snackbar: error message (red alert)
    → revert toggle to previous value
```

### 7.3 Theme Propagation

```
1. SettingsScreen writes theme = 'dark' to app_settings
2. SettingsScreen signals theme change via a lightweight event or store
3. App.tsx (the root) reads the new theme:
   const themeMode = settingsManager.get('theme') ?? 'light'
   const muiTheme = createTheme({ palette: { mode: themeMode } })
   <ThemeProvider theme={muiTheme}>
     <CssBaseline />
     <AppRouter />
   </ThemeProvider>
```

**Theme signal mechanism:** Use a Zustand store — `useThemeStore` (new, tiny) — OR expose a callback from `App.tsx` through React context. The simplest approach: a dedicated Zustand store (`useAppearanceStore`) that holds `theme: 'light' | 'dark'` and a `setTheme(mode)` action. SettingsScreen calls `setTheme('dark')` after successful persistence. `App.tsx` subscribes to `useAppearanceStore` and passes `theme` to `createTheme()`.

### 7.4 Sync Settings Changed — No Immediate Effect

```
User changes sync_on_startup to 'false'
  → settingsManager.set('sync_on_startup', 'false')
  → persisted to app_settings
  → Snackbar: "Sync on startup disabled. Changes take effect on next app launch."
  → SyncEngine is NOT notified — it reads settings at initialize() only
```

### 7.5 `default_view` Changed — Consumer is E-15

```
User changes default_view to 'tile'
  → persisted to app_settings
  → Snackbar: "Default view updated"
  → CategoryScreen (E-15) reads this setting on mount and renders the appropriate view
  → No immediate visual change until user navigates back to a category screen
```

---

## 8. State Changes

### 8.1 Database (`app_settings`)

| Operation | SQL | updated_at |
|-----------|-----|------------|
| `set(key, value)` | `INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)` | Set to `new Date().toISOString()` (via `AppSettingsRepository.set()`) |
| `resetAll()` | Multiple `INSERT OR REPLACE` in a transaction | Updated on every key |
| `getAll()` | `SELECT key, value FROM app_settings` | No write |

All writes trigger `updated_at` changes, which the `DirtyStateTracker` detects as pending changes, which the `SyncEngine` syncs to the cloud on the next cycle.

### 8.2 Zustand Store — `useAppearanceStore` (New)

Create in `packages/renderer/src/stores/useAppearanceStore.ts`:

```
interface AppearanceState {
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
}
```

- Initialized to `'light'` (default)
- `SettingsScreen` calls `setTheme('dark')` after successful persistence
- `App.tsx` subscribes to `theme` and passes to MUI `createTheme({ palette: { mode: theme } })`
- This store is renderer-only — zero shared package dependencies (pure React/Zustand)

### 8.3 Sync Engine State

No change. SyncEngine's `initialize()` already reads `sync_on_startup` and `auto_sync_delay_seconds` (lines 133-134 of SyncEngine.ts). Settings changes are picked up on next app restart.

---

## 9. Database Changes

**No schema changes.** The `app_settings` table already exists (migration 001), `AppSettingsRepository` is fully implemented. No new tables, columns, or migrations.

### SQL Queries Used

All queries go through `AppSettingsRepository` — no raw SQL in `SettingsManager` or `SettingsScreen`:

| Method | SQL |
|--------|-----|
| `get(key)` | `SELECT value FROM app_settings WHERE key = ?` |
| `set(key, value)` | `INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)` |
| `getAll()` | `SELECT key, value FROM app_settings` |
| `resetAll()` | Transaction: `INSERT OR REPLACE` for each of the 5 keys with default values |

---

## 10. Error Handling

### 10.1 `SettingsManager`

| Scenario | Behavior |
|----------|----------|
| `get()` on a key with corrupt stored value (e.g., `auto_sync_delay_seconds = 'abc'`) | Returns default value. Logs `console.warn`. Does NOT throw. |
| `set()` with invalid value (out of range, wrong type) | Throws `DatabaseError('Invalid value for <key>: <value>. Expected <description>.')` |
| `set()` with unknown key | Delegates to `AppSettingsRepository.set()` which throws via `validateKey()` |
| `set()` — database error (connection closed) | Error propagates from `AppSettingsRepository`. Caught by `SettingsScreen`'s try/catch. |
| `getAll()` on empty DB | Returns object with all defaults. Never returns `null`. |
| `resetAll()` — database error | Error propagates. Transaction rolls back (Rule 4.8). |

### 10.2 `SettingsScreen`

| Scenario | Behavior |
|----------|----------|
| `settingsManager.set()` rejects | Show error `Snackbar` with message. Revert form control to previous value. Set `saving[key] = false`. |
| `settingsManager.getAll()` fails on mount | Show error `Alert` banner: "Failed to load settings. Please restart the app." |
| `db` is null (ServiceProvider not ready) | `useServiceProvider()` throws. Error boundary should catch. |
| User enters non-numeric value in delay TextField | Show inline validation error: "Must be a number between 30 and 600." Do NOT save. |
| User enters delay < 30 or > 600 | Show inline validation error. Do NOT save. |
| User toggles theme rapidly (multiple clicks) | Each toggle is a separate `set()` call. Last write wins. Each has its own spin/snackbar state via `saving` map. |

### 10.3 `App.tsx` Theme Wiring

| Scenario | Behavior |
|----------|----------|
| Theme setting not stored (new install) | `useAppearanceStore` defaults to `'light'`. `createTheme({ palette: { mode: 'light' } })`. |
| `useAppearanceStore` undefined | Render fails — this is a build/config error. The store must be created before App mounts. |

---

## 11. Logging Requirements

| Component | Level | Event |
|-----------|-------|-------|
| `SettingsManager.get()` | `debug` | `"SettingsManager: get('<key>') = '<coerced value>' (stored: '<raw>')"` |
| `SettingsManager.get()` | `warn` | `"SettingsManager: corrupt value for '<key>': '<raw>' — using default"` |
| `SettingsManager.set()` | `debug` | `"SettingsManager: set('<key>', '<value>')"` |
| `SettingsManager.set()` | `warn` | `"SettingsManager: validation failed for '<key>': <reason>"` |
| `SettingsManager.getAll()` | `debug` | `"SettingsManager: getAll() — N keys stored, M defaults"` |
| `SettingsManager.resetAll()` | `info` | `"SettingsManager: resetAll() — restored 5 default values"` |
| SettingsScreen (on save success) | `debug` | `"SettingsScreen: saved '<key>' = '<value>'"` |
| SettingsScreen (on save failure) | `error` | `"SettingsScreen: failed to save '<key>': <error>"` |

Use `console.*` — consistent with existing codebase conventions.

---

## 12. Security Requirements

- No new security concerns. Settings are stored in the SQLite database (local, unencrypted per constitution §16.4).
- Settings propagate through sync in the encrypted cloud backup — same security profile as all other user data.
- No credentials or secrets stored in settings. All setting keys are well-known, non-sensitive preferences.
- No OAuth tokens, derived keys, or passwords in `app_settings`. Those are in platform secure storage.

---

## 13. Acceptance Criteria

All 7 E-14 tasks have identical acceptance criteria per the epic document:

| ID | Criterion |
|----|-----------|
| AC-01 | `SettingsManager.get()` returns typed values with correct defaults when `app_settings` is empty |
| AC-02 | `SettingsManager.set()` validates values against schema and throws on invalid input |
| AC-03 | `SettingsManager.getAll()` returns a complete `SettingsValues` object with all 5 keys |
| AC-04 | `SettingsManager.resetAll()` restores all 5 keys to their default values |
| AC-05 | `SettingsScreen` loads settings from the database on mount and displays them in form controls |
| AC-06 | `SettingsScreen` renders a toggle (Switch) for sync-on-startup with labels "On" / "Off" |
| AC-07 | `SettingsScreen` renders an input for auto-sync delay accepting values 30–600, default 120 |
| AC-08 | `SettingsScreen` renders a select for default view with options "Table" and "Tile" |
| AC-09 | `SettingsScreen` renders a toggle for theme with options "Light" and "Dark" |
| AC-10 | `SettingsScreen` shows read-only trash retention as "Indefinite" |
| AC-11 | Changing any setting persists to `app_settings` and shows a success `Snackbar` |
| AC-12 | Invalid input (e.g., delay < 30) shows inline validation error and does not save |
| AC-13 | `App.tsx` wraps the app with MUI `ThemeProvider` + `CssBaseline`, controlled by the `theme` setting |
| AC-14 | Settings survive app restart (verified by refreshing the page and checking form values) |
| AC-15 | `SettingsScreen` renders within `MainLayout` (sidebar + outlet pattern) at `/settings` |
| AC-16 | Sidebar Settings link navigates to `/settings` and the route renders `SettingsScreen` |

---

## 14. Test Cases

### 14.1 `SettingsManager` — Unit Tests

Place in `packages/shared/src/application/settings/__tests__/SettingsManager.test.ts`.

Use `createMockDb()` from existing repository test patterns for `DatabaseConnection`.

| ID | Test | Setup | Assertions |
|----|------|-------|------------|
| SM-01 | `get('theme')` returns default `'light'` when key not stored | Mock `query()` returns `[]` (empty) | Result is `'light'` |
| SM-02 | `get('theme')` returns stored value `'dark'` | Mock returns `[{ value: 'dark' }]` | Result is `'dark'` |
| SM-03 | `get('sync_on_startup')` returns `false` (boolean) when stored `'false'` | Mock returns `[{ value: 'false' }]` | Result is `false` (boolean type, not string) |
| SM-04 | `get('sync_on_startup')` returns `true` (default) when not stored | Mock returns `[]` | Result is `true` |
| SM-05 | `get('auto_sync_delay_seconds')` returns `120` (number) default | Mock returns `[]` | Result is `120`, `typeof result === 'number'` |
| SM-06 | `get('auto_sync_delay_seconds')` parses stored `'300'` to `300` | Mock returns `[{ value: '300' }]` | Result is `300` (number type) |
| SM-07 | `get('auto_sync_delay_seconds')` with corrupt `'abc'` returns default `120` | Mock returns `[{ value: 'abc' }]` | Result is `120`, console.warn called |
| SM-08 | `set('theme', 'dark')` persists successfully | Call `set()` | `mock.execute()` called with `'INSERT OR REPLACE ...'` and params `['theme', 'dark', expect.any(String)]` |
| SM-09 | `set('theme', 'invalid')` throws | Call `set()` | Throws `Error` containing "Invalid value" |
| SM-10 | `set('auto_sync_delay_seconds', 29)` throws (below min) | Call `set()` | Throws `Error` containing "between 30 and 600" |
| SM-11 | `set('auto_sync_delay_seconds', 601)` throws (above max) | Call `set()` | Throws `Error` containing "between 30 and 600" |
| SM-12 | `set('auto_sync_delay_seconds', 120)` succeeds | Call `set()` | Persists `'120'` as string |
| SM-13 | `set('sync_on_startup', true)` persists `'true'` | Call `set()` | `execute()` params include `'true'` (string) |
| SM-14 | `set('default_view', 'tile')` succeeds | Call `set()` | Persists successfully |
| SM-15 | `set('default_view', 'cards')` throws (not in allowed values) | Call `set()` | Throws `Error` containing "Expected one of: table, tile" |
| SM-16 | `getAll()` returns all 5 keys with defaults when DB is empty | Mock returns `[]` | Result has all keys: `theme: 'light'`, `default_view: 'table'`, `sync_on_startup: true`, `auto_sync_delay_seconds: 120`, `trash_retention_days: -1` |
| SM-17 | `getAll()` returns mix of stored and default values | Mock returns `[{ key: 'theme', value: 'dark' }]` only | `theme` is `'dark'`, other 4 keys are defaults |
| SM-18 | `resetAll()` writes 5 default values in a transaction | Call `resetAll()` | `mock.transaction()` called once. Inside: 5 calls to `tx.execute()` with correct default values |
| SM-19 | `getDefault('theme')` returns `'light'` synchronously | Call `getDefault()` | Returns `'light'` with no async operation |

### 14.2 `SettingsScreen` — Integration Tests

Place in `packages/renderer/src/screens/__tests__/SettingsScreen.test.tsx`.

Mock `useServiceProvider()` to return a mock `ServiceProvider` with mock `db`. Mock `AppSettingsRepository` and `SettingsManager` return values.

| ID | Test | Setup | Assertions |
|----|------|-------|------------|
| SS-01 | Renders all settings sections | Mock `getAll()` returns defaults | Screen shows labels for: Theme, Default View, Sync on Startup, Auto-Sync Delay, Trash Retention |
| SS-02 | Theme switch reflects current value | Mock `getAll()` → `theme: 'dark'` | Switch is in "dark" position |
| SS-03 | Theme switch toggles on click | Click "Light" → switch moves to "Light" | `settingsManager.set('theme', 'light')` called |
| SS-04 | Sync-on-startup switch reflects stored value | Mock `getAll()` → `sync_on_startup: false` | Switch is in "off" position |
| SS-05 | Default view select shows options | Open select | Dropdown shows "Table" and "Tile" options |
| SS-06 | Auto-sync delay slider reflects stored value | Mock `getAll()` → `auto_sync_delay_seconds: 300` | Slider thumb at 300, text field shows "300" |
| SS-07 | Auto-sync delay TextField validates input | Type "700" and blur | Shows validation error "Must be 30–600". Does NOT call `set()`. |
| SS-08 | Auto-sync delay Slider commits on drag end | Drag slider to 200 | `settingsManager.set('auto_sync_delay_seconds', 200)` called |
| SS-09 | Trash retention shows "Indefinite" | Any setup | Text field is disabled, value = "Indefinite" |
| SS-10 | Success snackbar on save | Mock `set()` resolves | "Saved" snackbar appears after toggle |
| SS-11 | Error snackbar on save failure | Mock `set()` rejects with `Error('DB error')` | Red alert snackbar shows "DB error" |
| SS-12 | Loading state on mount | `getAll()` is pending | Shows `CircularProgress` until data resolves |
| SS-13 | Error state on mount failure | `getAll()` rejects | Shows error `Alert` banner with message |

### 14.3 `useAppearanceStore` — Basic Store Test

| ID | Test | Assertions |
|----|------|------------|
| AS-01 | Default theme is `'light'` | `useAppearanceStore.getState().theme === 'light'` |
| AS-02 | `setTheme('dark')` updates theme | After calling, `getState().theme === 'dark'` |

---

## 15. Definition Of Done

Per PROJECT_CONSTITUTION.md Section 26 (Task-Level DoD):

1. **Implemented:** All acceptance criteria AC-01 through AC-16 are met
2. **Self-reviewed:** Diff reviewed; no debugging artifacts, dead code, or commented-out sections
3. **Tested:** All test cases in Section 14 pass. `pnpm test` produces zero failures. No regression in `AppSettingsRepository`, `SyncEngine`, `AppRouter`, or `Sidebar` tests.
4. **Platform verified:** SettingsScreen renders correctly in both Electron BrowserWindow and Capacitor WebView. Theme toggle switches MUI palette. Settings persist across app restart on both platforms.
5. **No new lint errors:** `pnpm lint` passes with zero warnings. `pnpm typecheck` passes with zero errors.
6. **No hardcoded data:** No inline SQL in renderer code. No platform conditionals. No magic strings outside settings-defaults.ts. All setting keys referenced via `AppSettingsKey` type.
7. **Agent rules compliant:**
   - Rule 4.8: `resetAll()` uses `db.transaction()` for atomic writes
   - Rule 11.6: `.tsx` for SettingsScreen
   - Rule 13.4: No platform imports in renderer (uses `useServiceProvider()` → `SettingsManager`)
   - Rule 13.2: Domain layer pure TypeScript — `SettingsValues` and defaults are plain objects
8. **Constitution compliant:**
   - Settings stored in `app_settings` table per §14.1
   - Settings propagate via LWW sync (table has `updated_at`)
   - Theme uses MUI's `ThemeProvider` per tech stack §12
   - Auto-sync delay default 120s per §15.2

---

## 16. Implementation Notes

### 16.1 `App.tsx` Restructure

Current stub:

```tsx
export default function App() {
  return <h1>Collectiods</h1>;
}
```

Must be replaced with:

```
App.tsx responsibilities:
1. Create MUI theme from useAppearanceStore.theme
2. Wrap app with <ThemeProvider theme={muiTheme}>
3. Include <CssBaseline /> for body/normalization
4. Render <AppRouter authenticated={true} />
5. QueryClientProvider for TanStack Query (deferred — currently not wired at app root)
```

This is a one-time restructuring. The App component was a placeholder — replacing it with the real shell is not an E-14 code change per se, but E-14 is blocked without it (theme setting has no effect without ThemeProvider).

### 16.2 Theme Propagation Detail

The propagation chain:

```
SettingsScreen                   App.tsx
  │                                │
  │ sets 'theme' in app_settings   │ subscribes to useAppearanceStore
  │ calls setTheme('dark') on      │ theme === 'dark'
  │ useAppearanceStore ────────────→ createTheme({ palette: { mode: 'dark' } })
  │                                │
  │                                │ ThemeProvider re-renders all children
  │                                │ MUI components switch to dark palette
```

The Zustand store is the signal. SettingsScreen writes to both the database (persistence) and the store (immediate effect). On app restart, `App.tsx` should initialize the store from the database (or default to `'light'` if the DB read hasn't completed yet, then update when it does).

### 16.3 Immediate Save Pattern Rationale

No "Save All" button. Each control saves immediately on change. Rationale:
- Simpler UX — no multi-step form submission, no "unsaved changes" state
- Each setting is independent — changing theme doesn't require re-validating sync delay
- Internet is not required for any setting save (local SQLite only)
- Consistent with the constitution's "simplicity over features" philosophy

### 16.4 Settings Affecting SyncEngine — V1 Limitation

SyncEngine reads `sync_on_startup` and `auto_sync_delay_seconds` once at `initialize()` (lines 133-135). There is no `SyncEngine.updateSettings()` method. The SettingsScreen must display a note: "Sync settings changes take effect on next app launch."

### 16.5 `useAppearanceStore` File Location

Place at `packages/renderer/src/stores/useAppearanceStore.ts`. This follows the pattern established by `useSearchFilterStore.ts` in `packages/renderer/src/components/` — but as a cross-cutting concern (appearance affects the entire renderer), it belongs in a `stores/` directory rather than `components/`.

### 16.6 Existing Code NOT to Modify

- `AppSettingsRepository` — fully implemented, correct
- `AppSettingsKey` type + `APP_SETTINGS_KEYS` array — fully defined, correct
- `SyncEngine.initialize()` — already reads settings correctly
- `Sidebar.tsx` — already has Settings link
- `MainLayout.tsx` — already renders `<Outlet />` for child routes

### 16.7 `trash_retention_days` Handling

V1 has indefinite retention only (`-1`). The setting appears as a read-only `TextField` with value "Indefinite" and a descriptive caption: "Deleted items are kept indefinitely. Automatic purge is not available in this version." This satisfies the constitution's hook for future retention policy (TD-04).

---

_End of E14 Implementation Specification_
