# E15 T01 — Set Up React Router Structure: Implementation Specification

> **Source epic:** [E-15_UI_SHELL.md](../epics/E-15_UI_SHELL.md) — Task T-15.1
> **Prerequisites:** E-01 (Project Infrastructure) — COMPLETE; E-04 (Platform Services + DI) — COMPLETE
> **Blocks:** T-15.7 (TableView), E-07 (Songs UI)
> **Platform impact:** REVISED — BrowserRouter for Electron, HashRouter for Capacitor. React Router v6 + MUI.

---

## 1. Goal

Conditional routing based on authentication state: unauthenticated users see auth flow (Setup/Unlock screens), authenticated users see MainLayout with nested routes. Router type is configurable per platform — `BrowserRouter` for Electron, `HashRouter` for Capacitor. Replace the hardcoded `authenticated={true}` with a Zustand auth store. Create stub `SetupScreen` and `UnlockScreen` components to replace placeholder `<div>` elements. Wire the Electron renderer entry point to use `App` from `@collectio/renderer`.

---

## 2. Scope

| In scope | Detail |
|----------|--------|
| `useAuthStore` | Zustand store holding `isAuthenticated` state with `setAuthenticated` action. Read by `AppRouter` for conditional routing. |
| `AppRouter` refactor | Accept `routerType` prop (`'browser'` | `'hash'`). Subscribe to `useAuthStore` internally instead of accepting `authenticated` prop. |
| `App` refactor | Accept `routerType` prop, pass through to `AppRouter`. Apply platform router selection at the app entry point level. |
| `SetupScreen` stub | Minimal React component at `packages/renderer/src/screens/SetupScreen.tsx`. |
| `UnlockScreen` stub | Minimal React component at `packages/renderer/src/screens/UnlockScreen.tsx`. |
| Electron `renderer.tsx` | Import `App` from `@collectio/renderer/App`, wrap with `ServiceProviderContext.Provider`, use `BrowserRouter`. |
| Barrel exports | Export `AppRouter` and `useAuthStore` from `packages/renderer/src/index.ts`. |

---

## 3. Out of Scope

| Out of scope | Handled by |
|-------------|-----------|
| Real OAuth sign-in / sign-out logic | Future E-04 auth wiring task; auth store defaults to `isAuthenticated: true` for now |
| `SetupScreen` UI implementation | Future auth UI task; only a minimal stub component is created here |
| `UnlockScreen` UI implementation | Future auth UI task; only a minimal stub component is created here |
| Real auth state transition (true → false, false → true) | Future auth tasks hook into the store's `setAuthenticated` action |
| Electron renderer DI bridge architecture | Future DI bridge task; Electron renderer currently imports `createServices` from `di.ts` — same pattern as Capacitor. If `di.ts` contains Node-only APIs and cannot be imported in renderer, the DI wiring for Electron renderer will need a separate bridge task |
| Capacitor `index.tsx` wiring changes | Capacitor already imports and renders `<App />` with DI; no changes needed (its router type defaults to `'hash'`) |
| Platform-specific UI adaptations (keyboard shortcuts, context menus, touch targets) | T-15.10 |
| TableView / TileView | T-15.7 / T-15.8 |
| Selection mode | T-15.9 |
| Component tests for shell | T-15.11 |

---

## 4. Files To Create

| # | File | Package | Purpose |
|---|------|---------|---------|
| 1 | `packages/renderer/src/stores/useAuthStore.ts` | `@collectio/renderer` | Zustand store for authentication state |
| 2 | `packages/renderer/src/screens/SetupScreen.tsx` | `@collectio/renderer` | Stub component for initial app setup |
| 3 | `packages/renderer/src/screens/UnlockScreen.tsx` | `@collectio/renderer` | Stub component for session unlock |

---

## 5. Files To Modify

| # | File | Change |
|---|------|--------|
| 1 | `packages/renderer/src/navigation/AppRouter.tsx` | Accept `routerType` prop; subscribe to `useAuthStore` internally; remove `authenticated` prop; use conditional router component |
| 2 | `packages/renderer/src/App.tsx` | Accept `routerType` prop (default `'hash'`); pass to `AppRouter`; remove hardcoded `authenticated={true}` |
| 3 | `apps/electron/src/renderer.tsx` | Import `App` from `@collectio/renderer/App`; wrap with `ServiceProviderContext.Provider`; pass `routerType="browser"` |
| 4 | `packages/renderer/src/index.ts` | Add exports for `AppRouter` and `useAuthStore` |

No changes to `@collectio/shared`, `@collectio/platform`, `apps/capacitor/`, or any existing screen/component files beyond what is listed above.

---

## 6. Interfaces

### 6.1 `useAuthStore`

**Shape:**

```typescript
interface AuthState {
  isAuthenticated: boolean;
  setAuthenticated: (auth: boolean) => void;
}
```

**Module-level singleton** — `create<AuthState>()` at module scope, matching the existing `useAppearanceStore` pattern.

**Initial state:** `isAuthenticated: true` — matches current behavior. When real OAuth is wired (future task), the store will be initialized from platform secure storage (check for stored tokens on app launch).

**Subscribers:** `AppRouter` reads `isAuthenticated` to determine which route branch to render. Future auth UI components will call `setAuthenticated`.

**No React context or provider component.** Follows the established Zustand pattern used by `useAppearanceStore`, `useSyncStore`, and `useSearchFilterStore`.

### 6.2 `AppRouter`

**Props:**

```
AppRouterProps {
  routerType?: 'browser' | 'hash'   // default: 'hash'
}
```

**Removed props:** `authenticated` — previously passed from `App`, now read internally from `useAuthStore`.

**Behavior:**
- Reads `isAuthenticated` from `useAuthStore`
- If `routerType === 'browser'`: wraps each branch in `<BrowserRouter>` (from `react-router-dom`)
- Otherwise: wraps each branch in `<HashRouter>` (current behavior)
- Unauthenticated branch: routes `/setup`, `/unlock`, catch-all → `/setup`
- Authenticated branch: layout route (`<MainLayout>`) containing `/` (index), `/songs`, `/trash`, `/settings`, catch-all → `/songs`
- Route definitions, screen imports, and CategoryRegistry usage are unchanged from current implementation
- SetupScreen and UnlockScreen imports replace the `<div>` placeholders

**Router selection design rationale:**
The router type is a prop because `AppRouter` lives in `packages/renderer/` which must not import platform-specific code (Rule 13.4). The platform entry point (`apps/electron/src/renderer.tsx` or `apps/capacitor/src/index.tsx`) decides the router type and passes it through `<App routerType="..." />`.

### 6.3 `App`

**Props:**

```
AppProps {
  routerType?: 'browser' | 'hash'   // default: 'hash'
}
```

**Behavior:**
- Unchanged MUI theme wrapping (`ThemeProvider` + `CssBaseline`)
- Passes `routerType` prop to `<AppRouter routerType={routerType} />`
- No longer passes `authenticated` prop

### 6.4 `SetupScreen`

**Public API:** `export function SetupScreen()` — default export optional; named export preferred (matches `TrashScreen`/`SettingsScreen` pattern).

**Behavior:** Renders a minimal MUI `Box` with text "Setup (not yet implemented)". Accepts no props. Must be a valid React functional component that does not throw.

### 6.5 `UnlockScreen`

**Public API:** `export function UnlockScreen()` — same pattern as SetupScreen.

**Behavior:** Renders a minimal MUI `Box` with text "Unlock (not yet implemented)". Accepts no props.

---

## 7. Data Flow

```
apps/electron/src/renderer.tsx
  │
  ├─ createServices() → ServiceProvider
  ├─ <ServiceProviderContext.Provider value={services}>
  │   └─ <App routerType="browser" />
  │       └─ <ThemeProvider> → <AppRouter routerType="browser" />
  │           ├─ useAuthStore().isAuthenticated === false
  │           │   └─ <BrowserRouter>
  │           │       ├─ /setup → <SetupScreen />
  │           │       ├─ /unlock → <UnlockScreen />
  │           │       └─ * → redirect /setup
  │           │
  │           └─ useAuthStore().isAuthenticated === true
  │               └─ <BrowserRouter>
  │                   └─ <MainLayout>  (uses <Outlet />)
  │                       ├─ / (index) → <CategoryScreen />
  │                       ├─ /songs → <CategoryScreen />
  │                       ├─ /trash → <TrashScreen />
  │                       ├─ /settings → <SettingsScreen />
  │                       └─ * → redirect /songs

apps/capacitor/src/index.tsx
  │
  ├─ createServices() → ServiceProvider
  ├─ <ServiceProviderContext.Provider value={services}>
  │   └─ <App />  (routerType defaults to 'hash')
  │       └─ same flow as above, using <HashRouter>
```

**Key data flow rules:**
- `useAuthStore` is a module-level singleton — read directly by `AppRouter`, no prop threading
- `ServiceProvider` flows via React context (`ServiceProviderContext.Provider`) — consumed by screens via `useServiceProvider()`
- Router type flows as a prop: entry point → `App` → `AppRouter`
- No cross-layer violations: renderer never imports platform-specific code

---

## 8. State Changes

| Store | State Key | Before T-15.1 | After T-15.1 | Trigger |
|-------|-----------|---------------|--------------|---------|
| `useAuthStore` (new) | `isAuthenticated` | N/A (did not exist) | `true` (default) | Store initialization |
| `useAuthStore` (new) | `setAuthenticated` | N/A | Function available | Future auth tasks |
| `AppRouter` | `authenticated` prop | Required, hardcoded `true` in App.tsx | Removed prop; reads `useAuthStore` internally | Architectural change |
| `App` | `authenticated` prop passthrough | Hardcoded `authenticated={true}` | Removed | Architectural change |
| `App` | `routerType` prop | Did not exist | `'hash'` (default), `'browser'` (Electron) | Platform entry point |
| Electron `renderer.tsx` | Render tree | `<div>Collectio</div>` | `ServiceProviderContext.Provider` → `App routerType="browser"` | DI wiring + router selection |
| `AppRouter` | Router component | Always `<HashRouter>` | `<BrowserRouter>` or `<HashRouter>` based on prop | Platform entry point |

**No changes to:** `useSyncStore`, `useAppearanceStore`, `useSearchFilterStore`, `ServiceProvider`, or any database state.

---

## 9. Database Changes

None. This task is a UI routing layer change. No SQL migrations, no schema changes, no `app_metadata` modifications.

The `useAuthStore` is purely in-memory (Zustand). Persistent auth state (stored tokens, device registration) will be handled by future E-04 auth wiring tasks using `SecureStorageProvider`.

---

## 10. Error Handling

| Scenario | Behavior |
|----------|----------|
| `useAuthStore` is accessed outside Zustand provider | Zustand stores are module-level singletons — no provider needed. No error possible. |
| `CategoryRegistry.get('songs')` returns `undefined` | Fallback to `SongsCategory` import (existing pattern in AppRouter, unchanged) |
| Invalid `routerType` value passed to AppRouter | Falls through to `HashRouter` (default branch). Logs a console warning. |
| `root` element missing in DOM (Electron) | Existing `throw new Error(...)` in renderer.tsx — unchanged |
| `ServiceProviderContext` missing when screen calls `useServiceProvider()` | Screens already handle this: `useServiceProvider()` throws if context is undefined. On Electron renderer, if `createServices()` fails, the error state is shown before `<App>` renders |
| `createServices()` fails (Electron renderer) | Same error handling pattern as Capacitor: show error UI, don't mount `<App>` |

---

## 11. Logging Requirements

| Event | Level | Message |
|-------|-------|---------|
| Invalid `routerType` prop | `console.warn` | `AppRouter: unknown routerType "<value>", falling back to HashRouter` |
| Auth state change | `console.debug` | `useAuthStore: isAuthenticated changed to <true\|false>` |

No other logging is required. The router itself does not perform I/O; navigation is handled by React Router's built-in mechanisms.

---

## 12. Security Requirements

| Requirement | Rationale | Rule Reference |
|-------------|-----------|----------------|
| `AppRouter` must not import from `@capacitor/*` or Electron APIs | Renderer layer isolation | Rule 13.4 |
| `useAuthStore` must not store tokens, passwords, or secrets | In-memory state only; secrets go through `SecureStorageProvider` | Rule 12.1, Rule 12.2 |
| `useAuthStore` default `isAuthenticated: true` must be replaced before production release | Current default is for development convenience; real auth must validate stored tokens | Rule 12.1 |
| `BrowserRouter` on Electron must not expose full filesystem paths in URLs | `BrowserRouter` uses `pushState` with app-relative paths; no filesystem URLs are constructed | Rule 15.3 |
| Electron renderer.tsx `contextIsolation: true` remains enforced | Configured in `main.ts` — this task does not modify main process | Rule 15.3 |

---

## 13. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-1 | `pnpm typecheck` passes across all 5 workspace packages with zero errors | Run `pnpm typecheck` from repo root |
| AC-2 | `pnpm lint` passes across all 5 workspace packages with zero errors | Run `pnpm lint` from repo root |
| AC-3 | Unauthenticated user is redirected to `/setup` (when `isAuthenticated === false`) | Set `useAuthStore.setState({ isAuthenticated: false })` in test; verify SetupScreen renders |
| AC-4 | Authenticated user sees MainLayout with Songs screen active (when `isAuthenticated === true`) | Default state; verify MainLayout renders with CategoryScreen for Songs |
| AC-5 | Navigate to `/trash` renders TrashScreen (authenticated) | `navigate('/trash')` → TrashScreen renders |
| AC-6 | Navigate to `/settings` renders SettingsScreen (authenticated) | `navigate('/settings')` → SettingsScreen renders |
| AC-7 | Unknown route redirects: unauthenticated → `/setup`, authenticated → `/songs` | Navigate to `/nonexistent` → verify redirect |
| AC-8 | `routerType="browser"` renders `<BrowserRouter>` | Render `<App routerType="browser">` → verify `BrowserRouter` in component tree |
| AC-9 | `routerType="hash"` renders `<HashRouter>` (default) | Render `<App>` with no routerType prop → verify `HashRouter` in component tree |
| AC-10 | Back button navigates correctly | `navigate('/trash'); navigate(-1)` → returns to previous route |
| AC-11 | Electron renderer.tsx imports and renders App without errors | Inspect file — must import `App` and `ServiceProviderContext`, render `<App routerType="browser">` |
| AC-12 | Capacitor build not broken | Run `pnpm build:capacitor` from root — must succeed |
| AC-13 | All existing tests pass | Run `pnpm test` from root — zero new failures |
| AC-14 | No platform imports in renderer package | Grep `packages/renderer/src/` for `@capacitor/` or `from 'electron'` — zero matches |
| AC-15 | AppRouter does not accept `authenticated` prop | Inspect `AppRouter` signature — no `authenticated` in props interface |

---

## 14. Test Cases

Tests live in `packages/renderer/src/navigation/__tests__/AppRouter.test.tsx` and `packages/renderer/src/stores/__tests__/useAuthStore.test.ts`.

Uses Jest + React Testing Library with `MemoryRouter` (from `react-router-dom`) for isolated route testing — avoids platform-specific router dependency.

### 14.1 Auth Store Tests

| # | Test | Steps | Expected |
|---|------|-------|----------|
| ST-01 | Default state is authenticated | Create store, read `isAuthenticated` | `true` |
| ST-02 | `setAuthenticated(false)` transitions to unauthenticated | Call `setAuthenticated(false)`, read `isAuthenticated` | `false` |
| ST-03 | `setAuthenticated(true)` transitions back | Call `setAuthenticated(false)` then `setAuthenticated(true)` | `true` |
| ST-04 | Store is a singleton (same instance across imports) | Import store in two separate test files (or reset and re-import) | Same reference |

### 14.2 Router Tests (Authenticated Branch)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| RT-01 | Index route renders CategoryScreen | Render `<AppRouter />` (defaults: auth=true, hash) | CategoryScreen renders with Songs category |
| RT-02 | `/songs` route renders CategoryScreen | Navigate to `/songs` | CategoryScreen renders |
| RT-03 | `/trash` route renders TrashScreen | Navigate to `/trash` | TrashScreen renders |
| RT-04 | `/settings` route renders SettingsScreen | Navigate to `/settings` | SettingsScreen renders |
| RT-05 | Unknown route redirects to `/songs` | Navigate to `/nonexistent` | URL becomes `/songs`, CategoryScreen renders |
| RT-06 | MainLayout wraps authenticated routes | Render authenticated branch | MainLayout is in component tree |

### 14.3 Router Tests (Unauthenticated Branch)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| RT-07 | `/setup` renders SetupScreen | Set `isAuthenticated: false`, render router | SetupScreen renders |
| RT-08 | `/unlock` renders UnlockScreen | Set `isAuthenticated: false`, navigate to `/unlock` | UnlockScreen renders |
| RT-09 | Unknown route redirects to `/setup` | Set `isAuthenticated: false`, navigate to `/nonexistent` | URL becomes `/setup`, SetupScreen renders |

### 14.4 Router Type Tests

| # | Test | Steps | Expected |
|---|------|-------|----------|
| RT-10 | Default router type is HashRouter | Render `<AppRouter />` (no routerType prop) | Routes prefixed with `#/` |
| RT-11 | `routerType="hash"` uses HashRouter | Render `<AppRouter routerType="hash" />` | Routes prefixed with `#/` |
| RT-12 | `routerType="browser"` uses BrowserRouter | Render `<AppRouter routerType="browser" />` | Routes without `#/` prefix |

### 14.5 App Component Tests

| # | Test | Steps | Expected |
|---|------|-------|----------|
| AP-01 | App renders MUI theme wrapper | Render `<App />` | ThemeProvider and CssBaseline in component tree |
| AP-02 | App passes routerType to AppRouter | Render `<App routerType="browser" />` | AppRouter receives routerType="browser" |

### 14.6 Integration Tests

| # | Test | Steps | Expected |
|---|------|-------|----------|
| INT-01 | Capacitor entry point still renders App | Run `pnpm build:capacitor` | Build succeeds; App component is in the bundle |
| INT-02 | Electron renderer.tsx compiles via Vite | Run `pnpm build:electron` (if script exists) or verify `tsc --noEmit` passes in `apps/electron` | No build errors related to App import |

---

## 15. Definition Of Done

- [ ] `useAuthStore.ts` created with `isAuthenticated` and `setAuthenticated`
- [ ] `SetupScreen.tsx` created as stub component
- [ ] `UnlockScreen.tsx` created as stub component
- [ ] `AppRouter.tsx` refactored: `routerType` prop added, `authenticated` prop removed, `useAuthStore` subscribed internally
- [ ] `App.tsx` refactored: `routerType` prop added and passed through; `authenticated={true}` removed
- [ ] `apps/electron/src/renderer.tsx` updated: imports `App` and `ServiceProviderContext`, renders `<App routerType="browser">` wrapped in DI provider
- [ ] `packages/renderer/src/index.ts` updated with new exports
- [ ] `pnpm typecheck` passes with zero errors
- [ ] `pnpm lint` passes with zero errors
- [ ] `pnpm build:capacitor` succeeds
- [ ] `pnpm test` passes with zero new failures
- [ ] All 6 store tests pass (ST-01 through ST-04)
- [ ] All 12 router tests pass (RT-01 through RT-12)
- [ ] All 2 app component tests pass (AP-01 through AP-02)
- [ ] All 2 integration tests pass (INT-01 through INT-02)
- [ ] AC-1 through AC-15 all verified

---

## 16. Traceability

| Source Document | Section | Requirement |
|----------------|---------|-------------|
| `E-15_UI_SHELL.md` | T-15.1 | Router structure: conditional auth routing, platform-specific router, stub screens |
| `E-15_UI_SHELL.md` | T-15.1 AC-1 | Unauthenticated → redirected to SetupScreen |
| `E-15_UI_SHELL.md` | T-15.1 AC-2 | Authenticated → MainLayout with Songs active |
| `E-15_UI_SHELL.md` | T-15.1 AC-3 | `/trash` → TrashScreen renders |
| `E-15_UI_SHELL.md` | T-15.1 AC-4 | Back button navigates correctly on both platforms |
| `01_ARCHITECTURE.md` | §5 | Navigation structure: Auth Flow → SetupScreen, UnlockScreen; Main App → MainLayout, CategoryScreen, TrashScreen, SettingsScreen |
| `01_ARCHITECTURE.md` | §3 | Renderer layer responsibilities, no business logic |
| `05_FOLDER_STRUCTURE.md` | §1 | `screens/` directory for screen components, `stores/` or `hooks/` for state |
| `05_FOLDER_STRUCTURE.md` | §4 | Import aliases: `@shared/`, `@renderer/`, `@platform/` |
| `05_FOLDER_STRUCTURE.md` | §5 | File naming: `PascalCase + Screen` suffix, `use` prefix for hooks/stores |
| `07_AGENT_RULES.md` | Rule 13.4 | Renderer must never import platform-specific code |
| `07_AGENT_RULES.md` | Rule 13.1 | Platform-specific code isolated behind interfaces |
| `07_AGENT_RULES.md` | Rule 11.6 | `.tsx` extension for all files containing JSX |
| `07_AGENT_RULES.md` | Rule 11.1 | Strict mode mandatory |
| `07_AGENT_RULES.md` | Rule 12.1 | Never store the master password |
| `07_AGENT_RULES.md` | Rule 12.2 | Never log secrets |
| `06_IMPLEMENTATION_DECISIONS.md` | AD-03 | Separate OAuth client IDs per platform (auth store must support per-platform config in future) |
| `06_IMPLEMENTATION_DECISIONS.md` | AD-09 | Electron app tsconfig excludes renderer source files |
| `06_IMPLEMENTATION_DECISIONS.md` | AD-10 | App packages omit `composite: true` |

---

## 17. Architecture Decisions (New)

### AD-T15.1-01: Router Type as Prop, Not Internal Detection

**Decision:** The router type (`'browser'` | `'hash'`) is passed as a prop from the platform entry point to `App` → `AppRouter`. No runtime platform detection (`navigator.userAgent`, `window.process`) is used inside the renderer package.

**Reason:**
- `packages/renderer/` must not import platform-specific code (Rule 13.4)
- `BrowserRouter` and `HashRouter` are both from `react-router-dom` — no platform import needed
- The platform entry point (`apps/electron/`, `apps/capacitor/`) is the correct place to decide router type
- Defaulting to `'hash'` preserves backward compatibility (Capacitor works unchanged)

**Alternatives considered:**
1. Runtime detection via `window.electronAPI` — violates Rule 13.4
2. Separate `AppRouter.electron.tsx` / `AppRouter.capacitor.tsx` — file duplication, violates DI-based platform isolation pattern (05_FOLDER_STRUCTURE.md §6)
3. Single `HashRouter` for both platforms — violates E-15 spec requirement for `BrowserRouter` on Electron

### AD-T15.1-02: Auth Store as Module-Level Zustand Singleton

**Decision:** `useAuthStore` is a module-level `create<AuthState>()` call, matching the existing `useAppearanceStore` and `useSyncStore` patterns. No React context, no provider component.

**Reason:**
- Zustand stores are consumed directly via hooks — no provider wrapping needed
- Consistent with all existing stores in the codebase
- `AppRouter` subscribes to `isAuthenticated` via selector; re-renders automatically on change
- Future auth tasks (E-04 OAuth wiring) call `useAuthStore.getState().setAuthenticated(true/false)` — no prop threading, no HOC wrapping

### AD-T15.1-03: Stub Screens as Named Function Exports

**Decision:** `SetupScreen` and `UnlockScreen` use named function exports (`export function SetupScreen()`), matching the existing `TrashScreen` and `SettingsScreen` pattern.

**Reason:**
- Consistently named exports across all screens
- No decisions about default vs. named imports for consumers
- Stubs are intentionally minimal — they exist to satisfy route definitions so routing logic can be tested independently of screen implementation

### AD-T15.1-04: Electron Renderer DI Follows Capacitor Pattern

**Decision:** The Electron `renderer.tsx` imports `createServices` from `apps/electron/src/di.ts` and wraps `<App>` with `ServiceProviderContext.Provider`, mirroring the Capacitor `index.tsx` pattern.

**Reason:**
- Screens (`SettingsScreen`, `TrashScreen`, `CategoryScreen`) already use `useServiceProvider()` React context hook
- A single DI wrapping pattern across both platforms simplifies maintenance
- If `di.ts` cannot be imported directly in the Vite-bundled renderer (due to Node.js native modules like `better-sqlite3`, `readFileSync`), this decision will need revision in a follow-up task. The spec acknowledges this risk and provides a fallback comment in the file.

**Fallback if `di.ts` cannot be imported in Electron renderer:**
Wrap `<App>` without `ServiceProviderContext.Provider` and add a comment: `// TODO: Electron DI bridge — see AD-T15.1-04`. The router will still function; screens that depend on `useServiceProvider()` will throw at runtime, which is acceptable for an incremental delivery.
