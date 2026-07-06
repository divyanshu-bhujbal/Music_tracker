# E15-T10: Platform-Specific UI Adaptations

> **Epic:** E-15 UI Shell | **Depends on:** T-15.2 (MainLayout), T-15.7 (TableView), T-15.8 (TileView) | **Blocks:** E-07

---

## 1. Goal

Create a platform adaptation layer that allows the shared React renderer to tailor UI behavior based on the host platform (Electron/Windows vs. Capacitor/Android) **without importing platform-specific code**. A `PlatformAdapter` interface — defined in `@collectio/shared` — exposes declarative **capability flags** (not platform identity strings) and callback registration methods. A `usePlatformAdapter()` React context hook makes these capabilities available to any renderer component. The app entry points inject platform-specific implementations. Electron IPC handlers are added for right-click context menus and keyboard shortcuts.

---

## 2. Scope

| In Scope | Detail |
|----------|--------|
| `PlatformAdapter` interface | Defined in `packages/shared/src/domain/interfaces/` — capability flags + callback registrations. NO platform identity string exposed |
| `usePlatformAdapter` hook | React context hook in `packages/renderer/src/hooks/` — reads from `PlatformAdapterContext` |
| `PlatformAdapterContext` | Created alongside the hook; default throws (must be provided by app entry) |
| Electron IPC additions | Main process handlers for `showContextMenu` + `globalShortcut` keyboard shortcuts; preload bridge exposes `platform.showContextMenu()` and `platform.onKeyboardShortcut()` |
| Capacitor context injection | `apps/capacitor/src/index.tsx` injects CapacitorPlatformAdapter via `PlatformAdapterContext.Provider` |
| Electron context injection | `apps/electron/src/renderer.tsx` injects ElectronPlatformAdapter via `PlatformAdapterContext.Provider` (without needing the full ServiceProvider DI bridge) |
| TableView adaptations | Row hover highlight (Electron), right-click context menu (Electron), wider default column widths (Electron via CSS multiplier) |
| TileView adaptations | Minimum touch target sizing (Capacitor: 48×48dp) |
| MainLayout adaptations | Safe area padding (Capacitor only); native back button handling (Capacitor only) |
| Component-level application | Components read capabilities from `usePlatformAdapter()` and branch on capability booleans — never on platform identity |

## 3. Out of Scope

| Out of Scope | Handled By |
|-------------|-----------|
| Pull-to-refresh | Blocked by `@tanstack/react-virtual` scroll container conflict — deferred to E-07 or separate spike |
| Bottom sheet via MUI `Drawer anchor="bottom"` | E-07 (edit/create dialogs will use this when they are built for mobile) |
| Electron title bar customization | `BrowserWindow` default OS chrome is used — no custom title bar in V1 |
| Capacitor safe area CSS via `@capacitor/status-bar` | Deferred — safe area padding can be approximated with simple CSS `env(safe-area-inset-*)` constants provided by Capacitor WebView without importing the plugin; full integration requires plugin installation in a follow-up |
| Platform identity string exposure | Banned by design — `usePlatformAdapter()` NEVER returns `{ platform: 'electron' | 'capacitor' }` |
| Desktop notifications via Electron `Notification` | Not a UI adaptation — separate feature |
| Capacitor `@capacitor/status-bar` plugin installation | The plugin is NOT installed as part of this task; safe area CSS constants are available natively in Capacitor WebView |
| Multi-monitor DPI scaling | OS handles this natively |
| Tablet/Kiosk/Chromebook detection | No special handling — these edges cases match whichever platform they run on |
| Electron DI bridge (ServiceProviderContext for Electron renderer) | Remains deferred per AD-T15.1-04 |

---

## 4. Files To Create

| # | File | Package | Purpose |
|---|------|---------|---------|
| 1 | `packages/shared/src/domain/interfaces/PlatformAdapter.ts` | `@collectio/shared` | Interface definition — capability flags + callback registrations |
| 2 | `packages/renderer/src/hooks/usePlatformAdapter.ts` | `@collectio/renderer` | React context + hook — reads `PlatformAdapter` from context |
| 3 | `packages/renderer/src/hooks/__tests__/usePlatformAdapter.test.tsx` | `@collectio/renderer` | Unit tests for context/hook |
| 4 | `packages/platform/src/electron/ElectronPlatformAdapterFactory.ts` | `@collectio/platform` | Factory that builds an ElectronPlatformAdapter from `window.collectio.platform` bridge (or noop fallback if bridge absent) |
| 5 | `packages/platform/src/capacitor/CapacitorPlatformAdapterFactory.ts` | `@collectio/platform` | Factory that builds a CapacitorPlatformAdapter using `App.addListener('backButton')` and capacitive touch sizing |
| 6 | `packages/renderer/src/hooks/__tests__/__mocks__/platformAdapterMock.ts` | `@collectio/renderer` | Shared mock factory for `PlatformAdapter` to be reused across component tests |

## 5. Files To Modify

| # | File | Change |
|---|------|--------|
| 1 | `packages/shared/src/domain/interfaces/index.ts` | Add `export type { PlatformAdapter } from './PlatformAdapter.js'` |
| 2 | `packages/shared/src/index.ts` | Add re-export of `PlatformAdapter` from barrel |
| 3 | `packages/renderer/src/App.tsx` | Accept optional `platformAdapter` prop; wrap `AppRouter` with `PlatformAdapterContext.Provider` |
| 4 | `apps/electron/src/renderer.tsx` | Import `ElectronPlatformAdapterFactory`; create adapter; pass to `<App platformAdapter={...} />` |
| 5 | `apps/capacitor/src/index.tsx` | Import `CapacitorPlatformAdapterFactory`; create adapter inside `Root`; pass to `<App platformAdapter={...} />` |
| 6 | `apps/electron/src/main.ts` | Register 4 `ipcMain.handle` channels: `collectio:menu:showContextMenu` and `collectio:shortcut:on`, `collectio:shortcut:isRegistered`, `collectio:shortcut:unregisterAll`; register `globalShortcut` for Ctrl+N, Delete, Ctrl+F, Escape on window focus; unregister on blur |
| 7 | `apps/electron/src/preload.ts` | Expose `platform.showContextMenu` and `platform.onKeyboardShortcut` via `contextBridge.exposeInMainWorld` |
| 8 | `packages/renderer/src/components/TableView.tsx` | Read `usePlatformAdapter()`; add `:hover` row highlight when `supportsHover` is true; attach `onContextMenu` handler wired to `showContextMenu()` when available; apply column width multiplier from `columnWidthScale` |
| 9 | `packages/renderer/src/components/TileView.tsx` | Read `usePlatformAdapter()`; apply `minHeight` / `minWidth` to cards based on `touchTargetSize` |
| 10 | `packages/renderer/src/components/MainLayout.tsx` | Read `usePlatformAdapter()`; apply safe area padding when `usesSafeAreaInsets` is true |
| 11 | `packages/renderer/src/components/__tests__/TableView.test.tsx` | Update tests to wrap in `PlatformAdapterContext.Provider` with mock adapter |
| 12 | `packages/renderer/src/components/__tests__/TileView.test.tsx` | Update tests to wrap in `PlatformAdapterContext.Provider` with mock adapter |
| 13 | `packages/renderer/src/navigation/AppRouter.tsx` | Read `usePlatformAdapter()`; register back button callback (Android) for browser back navigation |
| 14 | `packages/platform/src/electron/index.ts` | Add export of `ElectronPlatformAdapterFactory` |
| 15 | `packages/platform/src/capacitor/index.ts` | Add export of `CapacitorPlatformAdapterFactory` |

---

## 6. Interfaces

### 6.1 `PlatformAdapter` — Defined in `@collectio/shared`

```
interface ContextMenuItem {
  id: string
  label: string
  action: () => void
}

interface PlatformAdapter {
  /** True if the platform supports mouse hover states (desktop — Electron) */
  readonly supportsHover: boolean

  /** True if the platform supports right-click context menus */
  readonly supportsContextMenu: boolean

  /** True if the platform supports global keyboard shortcuts */
  readonly supportsKeyboardShortcuts: boolean

  /** True if the platform has a hardware/system back button (Android) */
  readonly hasBackButton: boolean

  /** Minimum touch target size in CSS pixels (0 = no minimum; use for mouse platforms) */
  readonly touchTargetSize: number

  /** Multiplier applied to default column widths (1.0 = default; >1.0 = wider for desktop) */
  readonly columnWidthScale: number

  /** True if the platform uses safe area insets (notched phones) */
  readonly usesSafeAreaInsets: boolean

  /** Show a native context menu at the current pointer position. No-op if unsupported. */
  showContextMenu(items: ContextMenuItem[]): void

  /** Register a callback for a keyboard shortcut (Electron accelerator format: 'CommandOrControl+N').
   *  Returns an unsubscribe function. No-op if unsupported. */
  onKeyboardShortcut(shortcut: string, callback: () => void): () => void

  /** Register a callback for the platform back button (Android hardware back).
   *  Returns an unsubscribe function. No-op if unsupported. */
  onBackButton(callback: () => void): () => void
}
```

| Field | Type | Purpose |
|-------|------|---------|
| `supportsHover` | `boolean` | Used by TableView rows for `:hover` background change |
| `supportsContextMenu` | `boolean` | Used by TableView to decide whether to attach `onContextMenu` handler |
| `supportsKeyboardShortcuts` | `boolean` | Used by MainLayout/CategoryScreen to decide whether to show keyboard shortcut hints |
| `hasBackButton` | `boolean` | Used by AppRouter to register a back-navigation handler |
| `touchTargetSize` | `number` | Used by TileView cards for `minHeight`/`minWidth`; 48 for Capacitor, 0 for Electron |
| `columnWidthScale` | `number` | Used by TableView `computeGridTemplate()` to multiply `fixedWidth` values; 1.3 for Electron, 1.0 for Capacitor |
| `usesSafeAreaInsets` | `boolean` | Used by MainLayout for CSS `padding-top: env(safe-area-inset-top, 0px)` |
| `showContextMenu(items)` | `(items: ContextMenuItem[]) => void` | Triggers native context menu at current mouse position (Electron) or is a no-op (Capacitor) |
| `onKeyboardShortcut(shortcut, callback)` | `(shortcut: string, callback: () => void) => () => void` | Registers a keyboard listener; returns unsubscribe function |
| `onBackButton(callback)` | `(callback: () => void) => () => void` | Registers Android back button listener; returns unsubscribe function |

**Design Rule: NO platform identity field.** Components check capability flags (`supportsHover`, `hasBackButton`) rather than checking `platform === 'electron'`. This satisfies Rule 13.1 and Rule 13.4 — the renderer never imports platform-specific code or detects the platform.

### 6.2 `PlatformAdapterContext` — React Context in renderer

```
PlatformAdapterContext: React.Context<PlatformAdapter>
```

Created in `usePlatformAdapter.ts` at module scope. Default value is a `noopPlatformAdapter` that sets all booleans to `false`, numeric scales to `1.0`, and all callback registration methods to `() => () => {}` (no-op returning empty unsubscribe). Components that accidentally render outside the provider get safe defaults rather than throwing.

### 6.3 `usePlatformAdapter()` — Hook in renderer

```
function usePlatformAdapter(): PlatformAdapter
```

Reads from `PlatformAdapterContext`. Returns the context value — no throwing. Components always get a valid object (the noop default if provider is absent).

### 6.4 `ElectronPlatformAdapterFactory` — in `@collectio/platform`

```
function createElectronPlatformAdapter(windowBridge?: CollectioPlatformBridge): PlatformAdapter
```

Builds an Electron-specific `PlatformAdapter`:
- `supportsHover`: `true`
- `supportsContextMenu`: `true`
- `supportsKeyboardShortcuts`: `true`
- `hasBackButton`: `false`
- `touchTargetSize`: `0`
- `columnWidthScale`: `1.3`
- `usesSafeAreaInsets`: `false`
- `showContextMenu(items)`: calls `windowBridge.showContextMenu(items)` if available, no-op otherwise
- `onKeyboardShortcut(shortcut, callback)`: calls `windowBridge.onKeyboardShortcut(shortcut, callback)` if available, no-op otherwise
- `onBackButton(callback)`: no-op

### 6.5 `CapacitorPlatformAdapterFactory` — in `@collectio/platform`

```
function createCapacitorPlatformAdapter(): PlatformAdapter
```

Builds a Capacitor-specific `PlatformAdapter`:
- `supportsHover`: `false`
- `supportsContextMenu`: `false`
- `supportsKeyboardShortcuts`: `false`
- `hasBackButton`: `true`
- `touchTargetSize`: `48`
- `columnWidthScale`: `1.0`
- `usesSafeAreaInsets`: `true`
- `showContextMenu(items)`: no-op
- `onKeyboardShortcut(shortcut, callback)`: no-op
- `onBackButton(callback)`: uses `App.addListener('backButton', handler)` (imported from `@capacitor/app`); returns unsubscribe

**Note on Capacitor imports:** `CapacitorPlatformAdapterFactory.ts` lives in `packages/platform/src/capacitor/` — it **is allowed** to import `@capacitor/app` because it is a platform implementation layer file (Rule 13.1 permits platform-specific code in the Platform Implementations layer). The renderer never sees this import.

### 6.6 `TableViewProps` — Extended

```
TableViewProps {
  // ... existing fields unchanged ...
}
```

No new props. `TableView` reads `usePlatformAdapter()` internally. Callers (CategoryScreen) pass nothing platform-related.

### 6.7 `TileViewProps` — Extended

Same pattern — no new props. TileView reads `usePlatformAdapter()` internally.

### 6.8 `AppProps` — Extended

```
AppProps {
  routerType?: 'browser' | 'hash'   // existing
  platformAdapter?: PlatformAdapter   // NEW — injected by app entry point; defaults to noop
}
```

Defaults to `noopPlatformAdapter` if not provided — keeps Electron entry point optional and allows tests to render without wrapping.

### 6.9 `ContextMenuItem` — inline in PlatformAdapter

```
interface ContextMenuItem {
  id: string        // unique identifier for this menu item
  label: string     // display text
  action: () => void // callback when selected
}
```

### 6.10 Electron Preload Bridge Additions — `window.collectio.platform`

```
{
  showContextMenu: (items: Array<{ id: string; label: string }>) => Promise<string | null>,
  onKeyboardShortcut: (shortcut: string, callbackId: string) => void,
  offKeyboardShortcut: (callbackId: string) => void,
}
```

**Marshalling design:** `ContextMenuItem.action` is a renderer-side function — it cannot be serialized across the context bridge. The preload bridge sends only `{ id, label }` arrays. The renderer-side adapter maintains a `Map<string, () => void>` callback registry keyed by `id`. When the preload bridge resolves with a selected `id`, the adapter looks up the callback and invokes it.

For keyboard shortcuts: the renderer generates unique `callbackId` strings, registers them via the bridge, and the main process fires `ipcRenderer.on('collectio:shortcut:fired', callbackId)` to trigger renderer callbacks.

### 6.11 Reused from `@collectio/shared`

| Import | Type |
|--------|------|
| `PlatformAdapter` | Interface (new) |
| `ContextMenuItem` | Interface (new, inline in PlatformAdapter.ts) |

---

## 7. Data Flow

```
apps/electron/src/main.ts
  │
  ├─ ipcMain.handle('collectio:menu:showContextMenu', ...)
  │   └─ Menu.buildFromTemplate(items) → Menu.popup() → resolves with selected item id
  │
  ├─ globalShortcut.register('CommandOrControl+N', ...)
  │   └─ fires ipc event 'collectio:shortcut:fired' with callbackId
  │
  └─ BrowserWindow 'focus' → enable shortcuts; 'blur' → unregister shortcuts

apps/electron/src/preload.ts
  │
  ├─ contextBridge.exposeInMainWorld('collectio', { ..., platform: { ... } })
  │   ├─ platform.showContextMenu(items): ipcRenderer.invoke('collectio:menu:showContextMenu', items)
  │   ├─ platform.onKeyboardShortcut(shortcut, cbId): ipcRenderer.send('collectio:shortcut:on', shortcut, cbId)
  │   └─ platform.offKeyboardShortcut(cbId): ipcRenderer.send('collectio:shortcut:off', cbId)
  │
  └─ ipcRenderer.on('collectio:shortcut:fired', (cbId) => { /* invoke renderer callback */ })

apps/electron/src/renderer.tsx
  │
  ├─ createElectronPlatformAdapter(window.collectio?.platform)
  │   └─ PlatformAdapter with supportsHover=true, columnWidthScale=1.3, etc.
  │
  └─ <App routerType="browser" platformAdapter={electronAdapter} />

apps/capacitor/src/index.tsx
  │
  ├─ Root() → createCapacitorPlatformAdapter()
  │   └─ PlatformAdapter with touchTargetSize=48, hasBackButton=true, etc.
  │
  └─ <App platformAdapter={capacitorAdapter} />

packages/renderer/src/App.tsx
  │
  ├─ <PlatformAdapterContext.Provider value={platformAdapter ?? noopPlatformAdapter}>
  │   └─ <ThemeProvider>
  │       └─ <AppRouter routerType={routerType} />
  │
  └─ All descendant components can call usePlatformAdapter()

packages/renderer/src/components/TableView.tsx
  │
  ├─ const platform = usePlatformAdapter()
  ├─ Row hover: sx conditional on platform.supportsHover
  ├─ onContextMenu: if platform.supportsContextMenu → platform.showContextMenu(items)
  ├─ Column widths: grid template multiplier uses platform.columnWidthScale
  └─ px/margin on non-selection cells adjusted for wider columns

packages/renderer/src/components/TileView.tsx
  │
  ├─ const platform = usePlatformAdapter()
  ├─ Card minHeight/minWidth: platform.touchTargetSize > 0 ? `${platform.touchTargetSize}px` : undefined
  └─ Cards maintain minimum tap target on mobile

packages/renderer/src/components/MainLayout.tsx
  │
  ├─ const platform = usePlatformAdapter()
  └─ Safe area: if platform.usesSafeAreaInsets → pt: 'env(safe-area-inset-top, 0px)'

packages/renderer/src/navigation/AppRouter.tsx
  │
  ├─ const platform = usePlatformAdapter()
  ├─ useEffect → if platform.hasBackButton → const unsub = platform.onBackButton(() => navigate(-1))
  └─ Cleanup: return unsub
```

### IPC Data Flow for Context Menu (Extended)

```
1. User right-clicks row in TableView
2. TableView.onContextMenu handler fires
3. Handler calls platform.showContextMenu([
     { id: 'edit', label: 'Edit' },
     { id: 'delete', label: 'Delete' },
     { id: 'copy', label: 'Copy Name' },
   ])
4. ElectronPlatformAdapter.showContextMenu():
   a. Stores callback map: { edit: editCallback, delete: deleteCallback, copy: copyCallback }
   b. Calls window.collectio.platform.showContextMenu([{ id: 'edit', label: 'Edit' }, ...])
5. preload.ts: ipcRenderer.invoke('collectio:menu:showContextMenu', items)
6. main.ts handler:
   a. const menu = Menu.buildFromTemplate(items.map(i => ({ label: i.label, click: () => resolve(i.id) })))
   b. menu.popup({ window: BrowserWindow.fromWebContents(event.sender) })
   c. Resolves with selected id (or null if dismissed)
7. preload receives result → returns to adapter
8. Adapter looks up callback by id → invokes it → clears map
```

### IPC Data Flow for Keyboard Shortcuts (Extended)

```
1. main.ts registers globalShortcut('CommandOrControl+N', ...)
2. User presses Ctrl+N
3. globalShortcut fires → main process sends ipc event to focused window
4. preload.ts listener receives 'collectio:shortcut:fired' with callbackId
5. preload invokes the registered renderer callback
6. No IPC invoke/response pattern — fire-and-forget

Mapping:
  Ctrl+N         → 'create-new'   (create new song)
  Delete         → 'delete-selected' (delete selected items)
  Ctrl+F         → 'focus-search' (focus search bar)
  Escape         → 'deselect-escape' (clear selection / close dialog)
```

---

## 8. State Changes

### 8.1 New React Context

| Context | Value Type | Initial | Provided By |
|---------|-----------|---------|-------------|
| `PlatformAdapterContext` | `PlatformAdapter` | `noopPlatformAdapter` | `App.tsx` — wraps entire render tree |

### 8.2 New State in Electron main.ts

| State | Type | Purpose |
|-------|------|---------|
| `shortcutRegistrations` (lexical scope in `registerIpcHandlers`) | `Map<string, { shortcut: string; window: BrowserWindow }>` | Tracks which callbackIds are mapped to which shortcuts for cleanup |

### 8.3 App Component (App.tsx)

| New Prop | Type | Default | Purpose |
|----------|------|---------|---------|
| `platformAdapter` | `PlatformAdapter \| undefined` | `noopPlatformAdapter` | Injected by app entry point |

### 8.4 Electron renderer.tsx

| Change | Detail |
|--------|--------|
| New import | `createElectronPlatformAdapter` from `@collectio/platform/electron` |
| New variable | `platformAdapter` = result of factory call |
| JSX change | `<App routerType="browser" platformAdapter={platformAdapter} />` |

### 8.5 Capacitor index.tsx — `Root` Component

| Change | Detail |
|--------|--------|
| New import | `createCapacitorPlatformAdapter` from `@collectio/platform/capacitor` |
| New variable | `platformAdapter` = result of factory call |
| JSX change | `<App platformAdapter={platformAdapter} />` added to ServiceProviderContext branch |

### 8.6 Existing Stores — Unchanged

No changes to: `useAuthStore`, `useSyncStore`, `useAppearanceStore`, `useSearchFilterStore`, `useSelectionStore`. Platform adaptations are a UI layer concern — no state management changes.

---

## 9. Database Changes

**None.** Platform adaptations are pure UI layer. Zero database reads, writes, or schema changes.

---

## 10. Error Handling

| Scenario | Handling |
|----------|----------|
| `usePlatformAdapter()` called outside provider | Returns `noopPlatformAdapter` — all capabilities report `false`/neutral. No throw. Components degrade gracefully |
| `window.collectio.platform` is undefined (Electron preload bridge not loaded) | `ElectronPlatformAdapterFactory` gracefully returns adapter with `showContextMenu` and `onKeyboardShortcut` as no-ops; capability flags remain `true` (platform is still Electron) |
| Right-click context menu with empty items array | `showContextMenu([])` → main process renders empty `Menu` → resolves `null` → adapter does nothing |
| Keyboard shortcut registration fails (OS conflict) | `globalShortcut.register()` returns `false` — log a `console.warn`, continue. The shortcut callback is never invoked. Graceful degradation |
| `globalShortcut.register()` throws | Wrap in try/catch in main process; log warning; continue |
| Capacitor `App.addListener('backButton')` called but `@capacitor/app` not installed | Factory throws at creation time (package import fails); if import is optional/try-caught, `onBackButton` returns no-op |
| Multiple `onBackButton` listeners registered | `App.addListener` supports multiple listeners — Capacitor handles this natively. Each returns its own unsubscribe |
| BrowserWindow destroyed before context menu popup resolves | `Menu.popup()` silently destroyed with the window — no error, `null` resolves naturally via close |
| Adapter created before Capacitor app plugin is ready (early lifecycle) | Factory creates adapter with static capability flags immediately; `onBackButton` registration works because `App.addListener` can be called before plugin is fully initialized (it queues listeners) |

---

## 11. Logging Requirements

| Event | Level | Message |
|-------|-------|---------|
| Keyboard shortcut registration fails (OS conflict) | `console.warn` | `globalShortcut: failed to register "<accelerator>" — may conflict with OS shortcut` |
| `showContextMenu` called on platform that doesn't support it | `console.debug` | `PlatformAdapter: showContextMenu called but context menus not supported — no-op` |
| `onKeyboardShortcut` called on unsupported platform | `console.debug` | `PlatformAdapter: onKeyboardShortcut called but keyboard shortcuts not supported — no-op` |
| `onBackButton` called on unsupported platform | `console.debug` | `PlatformAdapter: onBackButton called but back button not supported — no-op` |

No other logging. Warnings for unexpected caps; debug for intentional no-ops.

---

## 12. Security Requirements

| Requirement | Rationale | Rule Reference |
|-------------|-----------|---------------|
| `PlatformAdapter` must NOT expose a platform identity string (`'electron'`, `'capacitor'`) | Prevents components from writing `if (platform.name === 'electron')` — forces capability-based branching | Rule 13.1, Rule 13.4 |
| `packages/renderer/` must NOT import from `@capacitor/app`, `electron`, `@collectio/platform/electron`, or `@collectio/platform/capacitor` | Layer isolation — renderer only sees `PlatformAdapter` interface | Rule 13.4 |
| `ElectronPlatformAdapterFactory` resides in `packages/platform/src/electron/` — permitted to import `electron` APIs | Platform Implementations layer is the ONLY layer allowed to access platform APIs | Rule 13.1 |
| `CapacitorPlatformAdapterFactory` resides in `packages/platform/src/capacitor/` — permitted to import `@capacitor/app` | Same as above | Rule 13.1 |
| `contextBridge.exposeInMainWorld` must expose only serializable data | `showContextMenu` only sends `{ id, label }[]` across bridge — renderer callbacks stay in renderer | Rule 15.3 |
| `contextIsolation: true` and `nodeIntegration: false` remain enforced | This task adds IPC handlers but does not modify `BrowserWindow` webPreferences | Rule 15.3 |
| Keyboard shortcuts registered via `globalShortcut` must be unregistered on window blur and app quit | Prevent shortcuts from firing when app is backgrounded | Rule 15.2b (Node 20.16.0 API compliance) |
| No secrets or tokens in `PlatformAdapter` or context menu items | Menu labels are user-facing strings only | Rule 12.1, Rule 12.2 |

---

## 13. Acceptance Criteria

| ID | Criterion | Verification |
|----|-----------|-------------|
| AC-01 | `pnpm typecheck` passes across all workspace packages with zero errors | Run `pnpm typecheck` from repo root |
| AC-02 | `pnpm lint` passes across all workspace packages with zero errors | Run `pnpm lint` from repo root |
| AC-03 | `usePlatformAdapter()` returns non-null object when called inside provider | Unit test: wrap in provider, read hook, assert `supportsHover` matches injected value |
| AC-04 | `usePlatformAdapter()` returns noop adapter (no throw) when called outside provider | Unit test: render without provider, read hook, assert all flags are false/neutral |
| AC-05 | `PlatformAdapter` interface has NO `platformName` or identity string field | Inspect `PlatformAdapter.ts` — grep for `platformName`, `platform`, `name`, `type` string fields |
| AC-06 | `packages/renderer/src/` has zero imports from `@capacitor/`, `electron`, `@collectio/platform/electron`, or `@collectio/platform/capacitor` | Grep `packages/renderer/src/` — zero matches |
| AC-07 | Electron `main.ts` registers `collectio:menu:showContextMenu` IPC handler | Inspect `main.ts` — handler exists, calls `Menu.buildFromTemplate` + `menu.popup()` |
| AC-08 | Electron `preload.ts` exposes `window.collectio.platform.showContextMenu` | Inspect `preload.ts` — bridge method exists |
| AC-09 | TableView rows show hover background change on platform that reports `supportsHover: true` | Unit test: wrap in provider with `supportsHover=true`, verify CSS hover style present; with `supportsHover=false`, verify absent |
| AC-10 | TableView right-click fires `showContextMenu` on platform that reports `supportsContextMenu: true` | Unit test: wrap in provider, fire `onContextMenu` on row, verify `showContextMenu` called with expected items |
| AC-11 | TableView right-click does NOT attach handler when `supportsContextMenu: false` | Unit test: wrap with `supportsContextMenu=false`, verify `onContextMenu` prop absent from row |
| AC-12 | TableView `gridTemplateColumns` uses `columnWidthScale` multiplier | Unit test: create adapter with `columnWidthScale=1.3`, verify grid template includes `1.3` multiplier for fixed-width columns |
| AC-13 | TileView cards have `minHeight: 48px` / `minWidth: 48px` when `touchTargetSize=48` | Unit test: wrap with `touchTargetSize=48`, assert card `minHeight`/`minWidth` style present |
| AC-14 | TileView cards do NOT have min size constraints when `touchTargetSize=0` | Unit test: wrap with `touchTargetSize=0`, assert no min size styles |
| AC-15 | MainLayout applies safe area padding when `usesSafeAreaInsets: true` | Unit test: wrap with `usesSafeAreaInsets=true`, verify `paddingTop` CSS references `env(safe-area-inset-top)` |
| AC-16 | `AppRouter` registers back button callback when `hasBackButton: true` | Unit test: wrap with `hasBackButton=true`, verify `onBackButton` called; navigate to new route, fire back button callback, verify navigation returned |
| AC-17 | `App` component wraps children in `PlatformAdapterContext.Provider` | Unit test: render `<App>`, verify `PlatformAdapterContext.Provider` in component tree |
| AC-18 | Electron `renderer.tsx` passes `platformAdapter` prop to `App` | Inspect file — `createElectronPlatformAdapter` called, result passed to `<App>` |
| AC-19 | Capacitor `index.tsx` passes `platformAdapter` prop to `App` | Inspect file — `createCapacitorPlatformAdapter` called inside `Root`, result passed to `<App>` |
| AC-20 | All existing tests still pass (zero regressions) | Run `pnpm test` from root — zero new failures |
| AC-21 | `pnpm build:capacitor` succeeds | Run `pnpm build:capacitor` from root |
| AC-22 | Capacitor builds do NOT require `@capacitor/status-bar` to be installed | Build succeeds without the plugin; safe area CSS uses native `env()` constants |

---

## 14. Test Cases

### 14.1 Interface Unit Tests — `PlatformAdapter` (no separate file — type-checked by tsc)

No runtime tests for the interface. `tsc --noEmit` verifies the interface is correctly typed and exported. Verified by AC-01 and AC-05.

### 14.2 PlatformAdapter Hook Tests — `usePlatformAdapter.test.tsx`

| Test ID | Description | Setup |
|---------|-------------|-------|
| PA-01 | Hook returns adapter with `supportsHover: true` when provided by context | Wrap in provider with mock `{ supportsHover: true }`; assert hook returns `true` |
| PA-02 | Hook returns adapter with `touchTargetSize: 48` when provided by context | Wrap in provider; assert hook returns `48` |
| PA-03 | Hook returns `showContextMenu` function matching injected value | Wrap in provider with mock func; assert hook returns the same function reference |
| PA-04 | Hook returns noop adapter when rendered outside provider | Render without provider; assert `supportsHover === false`, `touchTargetSize === 0`, `columnWidthScale === 1.0` |
| PA-05 | Noop adapter `showContextMenu()` does not throw | Call `showContextMenu([])` on noop adapter; assert no throw |
| PA-06 | Noop adapter `onKeyboardShortcut()` returns unsubscribe function | Call `onKeyboardShortcut('Ctrl+N', jest.fn())()` — assert does not throw |
| PA-07 | Noop adapter `onBackButton()` returns unsubscribe function | Call `onBackButton(jest.fn())()` — assert does not throw |
| PA-08 | Hook re-renders when context value changes | Change provider value; verify component re-renders with new values |

### 14.3 TableView Platform Tests — `TableView.test.tsx` (Added Tests)

| Test ID | Description | Setup |
|---------|-------------|-------|
| TV-PLAT-01 | Row hover styles present when `supportsHover: true` | Wrap with adapter `supportsHover=true`; verify row `sx` includes hover background |
| TV-PLAT-02 | Row hover styles absent when `supportsHover: false` | Wrap with adapter `supportsHover=false`; verify row `sx` does NOT include hover |
| TV-PLAT-03 | Right-click on row calls `showContextMenu` when `supportsContextMenu: true` | Mock `showContextMenu`; fire `onContextMenu` on row; verify called with Edit/Delete/Copy items |
| TV-PLAT-04 | Row has no `onContextMenu` handler when `supportsContextMenu: false` | Wrap with `supportsContextMenu=false`; verify `onContextMenu` prop not on row element |
| TV-PLAT-05 | Column widths scaled by `columnWidthScale` | Wrap with `columnWidthScale=1.3`; verify `computeGridTemplate` result includes scaled fixed-width values |
| TV-PLAT-06 | Column widths not scaled when `columnWidthScale=1.0` | Wrap with `columnWidthScale=1.0`; verify grid template unchanged from default |

### 14.4 TileView Platform Tests — `TileView.test.tsx` (Added Tests)

| Test ID | Description | Setup |
|---------|-------------|-------|
| TV-PLAT-07 | Card has `minHeight: 48px` when `touchTargetSize=48` | Wrap with adapter `touchTargetSize=48`; assert card `minHeight` style |
| TV-PLAT-08 | Card has `minWidth: 48px` when `touchTargetSize=48` | Same; assert card `minWidth` style |
| TV-PLAT-09 | Card has no min size when `touchTargetSize=0` | Wrap with `touchTargetSize=0`; assert no `minHeight`/`minWidth` styles |

### 14.5 MainLayout Platform Tests

| Test ID | Description | Setup |
|---------|-------------|-------|
| ML-PLAT-01 | Safe area padding applied when `usesSafeAreaInsets: true` | Wrap with adapter `usesSafeAreaInsets=true`; verify `paddingTop: 'env(safe-area-inset-top, 0px)'` |
| ML-PLAT-02 | Safe area padding absent when `usesSafeAreaInsets: false` | Wrap with `usesSafeAreaInsets=false`; verify no `env()` padding |

### 14.6 AppRouter Platform Tests — `AppRouter.test.tsx` (Added Tests)

| Test ID | Description | Setup |
|---------|-------------|-------|
| RT-PLAT-01 | `onBackButton` registered when `hasBackButton: true` | Mock `onBackButton = jest.fn().mockReturnValue(jest.fn())`; render router; verify `onBackButton` called |
| RT-PLAT-02 | Back button callback triggers `navigate(-1)` | Render router; simulate back button callback; verify `navigate(-1)` invoked |
| RT-PLAT-03 | Back button unsubscribe called on unmount | Render router; unmount; verify unsubscribe function called |
| RT-PLAT-04 | `onBackButton` NOT called when `hasBackButton: false` | Wrap with `hasBackButton=false`; verify `onBackButton` not invoked |

### 14.7 Electron Main Process IPC Tests (Platform-Level Unit Tests)

| Test ID | Description |
|---------|-------------|
| E-PLAT-01 | `collectio:menu:showContextMenu` returns selected item ID when user clicks menu item |
| E-PLAT-02 | `collectio:menu:showContextMenu` resolves `null` when menu dismissed without selection |
| E-PLAT-03 | `collectio:shortcut:on` registers shortcut via `globalShortcut.register` |
| E-PLAT-04 | `collectio:shortcut:unregisterAll` unregisters all shortcuts |
| E-PLAT-05 | BrowserWindow blur unregisters shortcuts; focus re-registers them |

### 14.8 Integration Tests

| Test ID | Description |
|---------|-------------|
| INT-PLAT-01 | Electron `renderer.tsx` creates adapter and passes to App — build succeeds |
| INT-PLAT-02 | Capacitor `index.tsx` creates adapter and passes to App — build succeeds |
| INT-PLAT-03 | Existing TableView tests pass when wrapped in `PlatformAdapterContext.Provider` with mock |
| INT-PLAT-04 | Existing TileView tests pass when wrapped in `PlatformAdapterContext.Provider` with mock |
| INT-PLAT-05 | Existing AppRouter tests pass when wrapped in `PlatformAdapterContext.Provider` with mock |

---

## 15. Definition Of Done

1. **File created:** `packages/shared/src/domain/interfaces/PlatformAdapter.ts` — `PlatformAdapter` + `ContextMenuItem` interfaces exported.
2. **File created:** `packages/renderer/src/hooks/usePlatformAdapter.ts` — `PlatformAdapterContext` + `usePlatformAdapter()` + `noopPlatformAdapter`.
3. **File created:** `packages/renderer/src/hooks/__tests__/usePlatformAdapter.test.tsx` — PA-01 through PA-08 passing.
4. **File created:** `packages/platform/src/electron/ElectronPlatformAdapterFactory.ts` — factory producing Electron adapter.
5. **File created:** `packages/platform/src/capacitor/CapacitorPlatformAdapterFactory.ts` — factory producing Capacitor adapter (uses `@capacitor/app` for `onBackButton`).
6. **File created:** `packages/renderer/src/hooks/__tests__/__mocks__/platformAdapterMock.ts` — reusable mock factory for other test files.
7. **`packages/shared/src/domain/interfaces/index.ts` updated:** `PlatformAdapter` exported.
8. **`packages/shared/src/index.ts` updated:** `PlatformAdapter` re-exported from barrel.
9. **`packages/renderer/src/App.tsx` modified:**
   - `platformAdapter` prop added (optional, defaults to `noopPlatformAdapter`).
   - Root render wrapped in `<PlatformAdapterContext.Provider value={platformAdapter}>`.
10. **`apps/electron/src/main.ts` modified:**
    - IPC handler `collectio:menu:showContextMenu` registered.
    - IPC handler `collectio:shortcut:on` registered.
    - IPC handler `collectio:shortcut:isRegistered` registered.
    - `globalShortcut` registration for Ctrl+N, Delete, Ctrl+F, Escape on window focus.
    - Shortcut unregistration on window blur.
11. **`apps/electron/src/preload.ts` modified:**
    - `collectio.platform` namespace exposed with `showContextMenu`, `onKeyboardShortcut`, `offKeyboardShortcut`.
    - Callback map maintained in preload for `shortcut:fired` IPC events → renderer callback dispatch.
12. **`apps/electron/src/renderer.tsx` modified:**
    - `createElectronPlatformAdapter` imported and called.
    - Result passed as `platformAdapter` prop to `<App>`.
13. **`apps/capacitor/src/index.tsx` modified:**
    - `createCapacitorPlatformAdapter` imported and called inside `Root`.
    - Result passed as `platformAdapter` prop to `<App>`.
14. **`packages/renderer/src/components/TableView.tsx` modified:**
    - `usePlatformAdapter()` called.
    - Row hover `sx` conditional on `supportsHover`.
    - `onContextMenu` handler wired to `showContextMenu()` when `supportsContextMenu`.
    - Fixed-width columns multiplied by `columnWidthScale` in `computeGridTemplate()`.
15. **`packages/renderer/src/components/TileView.tsx` modified:**
    - `usePlatformAdapter()` called.
    - Card `minHeight`/`minWidth` set to `touchTargetSize` when > 0.
16. **`packages/renderer/src/components/MainLayout.tsx` modified:**
    - `usePlatformAdapter()` called.
    - Safe area padding applied when `usesSafeAreaInsets`.
17. **`packages/renderer/src/navigation/AppRouter.tsx` modified:**
    - `usePlatformAdapter()` called.
    - `onBackButton` callback registered when `hasBackButton`, wired to `navigate(-1)`.
    - Unsubscribe on unmount.
18. **`packages/platform/src/electron/index.ts` updated:** `ElectronPlatformAdapterFactory` exported.
19. **`packages/platform/src/capacitor/index.ts` updated:** `CapacitorPlatformAdapterFactory` exported.
20. **Existing test files updated** (TableView, TileView, AppRouter) to wrap in `PlatformAdapterContext.Provider` with mock adapter. Zero test regressions.
21. **Zero TypeScript errors** (`tsc --noEmit` passes in all packages).
22. **Zero ESLint errors** (`pnpm lint` passes).
23. **Rule 13.4 confirmed:** Grep `packages/renderer/src/` for `@capacitor/`, `from 'electron'`, `@collectio/platform/electron`, `@collectio/platform/capacitor` — zero matches.
24. **Rule 13.1 confirmed:** No `PlatformAdapter` exposes platform identity string. Components branch on capabilities only.
25. **Rule 15.6 confirmed:** No unused imports in any modified or created file.
26. **AC-01 through AC-22 all verified.**
27. **All acceptance criteria (AC-01 through AC-22) verified.**

---

## 16. Traceability

| Source Document | Section | Requirement |
|----------------|---------|-------------|
| `E-15_UI_SHELL.md` | T-15.10 | Platform-specific UI adaptations: wider columns, hover states, right-click context menu, keyboard shortcuts (Electron); touch targets, back gesture, safe area insets (Capacitor) |
| `E-15_UI_SHELL.md` | T-15.10 AC | Electron: hover states on rows, right-click context menu, keyboard shortcuts Ctrl+N/Delete/Ctrl+F/Escape, native OS window chrome |
| `E-15_UI_SHELL.md` | T-15.10 AC | Capacitor: touch targets minimum 48×48dp, back gesture via `App.addListener('backButton')`, safe area insets |
| `01_ARCHITECTURE.md` | §3 | Platform-specific code isolated behind interfaces; no platform conditionals outside Platform Implementations layer |
| `01_ARCHITECTURE.md` | §4 | Interface contracts: DI pattern, renderer never imports platform code |
| `05_FOLDER_STRUCTURE.md` | §1 | `hooks/` directory for React hooks; platform implementations in `packages/platform/src/electron/` and `capacitor/` |
| `05_FOLDER_STRUCTURE.md` | §6 | Platform differences handled via DI, not file extension resolution or conditional imports |
| `06_IMPLEMENTATION_DECISIONS.md` | AD-23 | Virtualized tables use CSS Grid — this task must not break grid layout pattern |
| `06_IMPLEMENTATION_DECISIONS.md` | AD-08 / Rule 15.2 | `__dirname` computed via `fileURLToPath` + `dirname()` in Electron main process |
| `06_IMPLEMENTATION_DECISIONS.md` | AD-17 / Rule 6.6 | Loopback HTTP server for OAuth — not affected by this task; context menu IPC follows same bridge pattern |
| `07_AGENT_RULES.md` | Rule 13.1 | No `if (platform === 'android')` outside Platform Implementations layer |
| `07_AGENT_RULES.md` | Rule 13.4 | Renderer must never import platform-specific code |
| `07_AGENT_RULES.md` | Rule 15.3 | `contextIsolation: true`, `nodeIntegration: false` — IPC through context bridge only |
| `07_AGENT_RULES.md` | Rule 15.2 | `__dirname` from `import.meta.url` — no bare `__dirname` or `import.meta.dirname` |
| `07_AGENT_RULES.md` | Rule 15.2b | Electron main process targets Node 20.16.0 — no ES2024+ APIs |
| `07_AGENT_RULES.md` | Rule 15.7 | Native Capacitor plugins must be direct deps of `apps/capacitor/` |
| `07_AGENT_RULES.md` | Rule 16.3 | Mock `@tanstack/react-virtual` in JSDOM tests |
| `07_AGENT_RULES.md` | Rule 16.4 | Partial mock of `react-router-dom` for Router tests |
| `PK-01` | `@capacitor/app` v6.0.3 | Already approved and installed — used by `CapacitorPlatformAdapterFactory` for `backButton` |

---

## 17. Architecture Decisions (New)

### AD-T15.10-01: Capability Flags Exclusively — Never Platform Identity

**Decision:** `PlatformAdapter` exposes capability booleans (`supportsHover`, `supportsContextMenu`, `hasBackButton`, `usesSafeAreaInsets`) and numeric scales (`touchTargetSize`, `columnWidthScale`). It does NOT expose a platform identity string (`'electron'`, `'capacitor'`, `'windows'`, `'android'`). Components branch on capabilities, not identity.

**Reason:**
- Components that check `platform.name === 'electron'` would violate Rule 13.1
- Capability-based branching naturally handles edge cases (Android on Chromebook supports hover + keyboard; Electron on touch-screen laptop has no touch-target requirement)
- Adding a new platform (iOS, Linux) requires only implementing `PlatformAdapter` — zero component changes
- This is the architectural pattern mandated by the constitution (Section 11: "Platform-specific code is isolated behind interfaces")

**Alternatives considered:**
1. `platform: 'electron' | 'capacitor'` enum — rejected because it encourages `if (platform === 'electron')` in renderer components
2. Individual adapter classes per platform with interface casting — rejected because it adds complexity without benefit; the capability object is sufficient for V1

### AD-T15.10-02: Noop Adapter as Default — No Throw

**Decision:** `usePlatformAdapter()` returns a `noopPlatformAdapter` (all flags `false`/neutral, all methods no-ops) when called outside a provider, rather than throwing. Components always get a valid object.

**Reason:**
- Electron renderer currently has no `ServiceProviderContext.Provider` (per AD-T15.1-04). Components like `TableView` that call `useServiceProvider()` would throw. Making `usePlatformAdapter()` also throw would double the runtime failure surface during incremental development.
- The noop pattern allows any component to call `usePlatformAdapter()` without fearing crashes — adaptations simply degrade to baseline behavior
- This is consistent with the web platform's principle of graceful degradation: if a capability isn't provided, behave as if it's not supported

**Contrast with `useServiceProvider()`:** `useServiceProvider()` throws because database access is a hard requirement. Platform adaptations are cosmetic/convenience — the app functions correctly without them.

### AD-T15.10-03: Column Width Scale — Render-Time CSS Multiplier, Not Separate Grid Templates

**Decision:** `columnWidthScale` is a numeric multiplier applied to `fixedWidth` values in `computeGridTemplate()` at render time. Not a separate grid template per platform.

**Reason:**
- Consistent with AD-23 (CSS Grid pattern) — a single grid template string is shared between header and body
- Math is trivial: `col.fixedWidth ? `${col.fixedWidth * scale}px` : `${col.flex}fr`
- No layout shift between platforms — proportional scaling maintains column ratios
- Scale of 1.3 on Electron gives ~30% wider columns — matches the "wider default column widths" requirement from constitution Section 18.7

### AD-T15.10-04: Context Menu Callback Registry in Renderer

**Decision:** `ContextMenuItem.action` is a renderer-side JavaScript function. It is NOT serialized across the context bridge. The preload bridge receives only `{ id, label }[]`. The `ElectronPlatformAdapter` maintains a `Map<string, () => void>` callback registry. When the bridge resolves with a selected ID, the adapter looks up and invokes the callback.

**Reason:**
- Functions cannot pass through `contextBridge.exposeInMainWorld` / `ipcRenderer.invoke` — Electron imposes a structured clone algorithm
- The callback registry pattern is the standard approach for menu actions in Electron apps (documented in Electron's `Menu.buildFromTemplate` examples)
- Memory safety: the registry is cleared after each `showContextMenu` call completes
- The alternative (sending action identifiers and having a global action dispatcher) couples the menu builder to application-level action IDs — rejected for V1 simplicity

### AD-T15.10-05: Global Shortcuts Fired via IPC Event, Not Direct Callback

**Decision:** Keyboard shortcuts registered by the Electron main process fire an `ipcMain → webContents.send('collectio:shortcut:fired', callbackId)` IPC event. The preload script listens for this event and invokes the registered renderer callback.

**Reason:**
- `globalShortcut.register()` runs in the main process — it cannot directly invoke renderer functions
- `webContents.send()` is the correct IPC mechanism for main → renderer communication
- Fire-and-forget pattern (no invoke/response) because shortcuts have no return value
- `callbackId` is a UUID generated by the renderer at registration time — avoids name collisions
- Shortcuts registered on `BrowserWindow.focus` and unregistered on `blur` — prevents shortcuts from firing when the app is backgrounded

### AD-T15.10-06: Capacitor Safe Areas Use Native CSS Constants — No Plugin

**Decision:** Safe area insets are applied via CSS `env(safe-area-inset-top, 0px)` and `env(safe-area-inset-bottom, 0px)` — native Capacitor WebView environment variables. The `@capacitor/status-bar` plugin is NOT installed for this task.

**Reason:**
- Capacitor WebView exposes `env(safe-area-inset-*)` CSS constants natively without any plugin
- These constants account for the status bar, notch, and navigation bar on modern Android devices
- The `@capacitor/status-bar` plugin adds programmatic control over status bar color/style — not needed for basic safe area padding
- Adding a plugin requires `cap sync`, native recompilation, and `MainActivity.java` registration — avoided for this task's scope
- Future tasks (theming, dark mode status bar) can install the plugin when needed

---

## 18. Appendix A — `noopPlatformAdapter` Reference

Used as the default context value and returned by `usePlatformAdapter()` when no provider is present:

| Field | Value | Rationale |
|-------|-------|-----------|
| `supportsHover` | `false` | No hover → no CSS hover effects |
| `supportsContextMenu` | `false` | No context menu → no right-click handler |
| `supportsKeyboardShortcuts` | `false` | No shortcuts → no key bindings registered |
| `hasBackButton` | `false` | No back button → no listener registered |
| `touchTargetSize` | `0` | No touch sizing → default card dimensions |
| `columnWidthScale` | `1.0` | No scaling → default column widths |
| `usesSafeAreaInsets` | `false` | No insets → no safe area padding |
| `showContextMenu()` | `() => {}` | No-op |
| `onKeyboardShortcut()` | `() => () => {}` | Returns no-op unsubscribe |
| `onBackButton()` | `() => () => {}` | Returns no-op unsubscribe |

## 19. Appendix B — Column Width Scale Example

Default Songs grid template: `48px 3fr 2fr 2fr 120px 140px`

With `columnWidthScale: 1.3` (Electron): `48px 3fr 2fr 2fr 156px 182px`

Fixed-width columns (`added_at`: 120px, `language_id`: 140px) are scaled proportionally. Flex columns (`name`: 3fr, `artists`: 2fr, `album_name`: 2fr) fill remaining space naturally — they don't need scaling because the browser window is wider on desktop.

## 20. Appendix C — Context Menu Items per Table Row

Items passed to `platform.showContextMenu()` when right-clicking a row:

```typescript
[
  { id: 'detail',   label: 'View Details' },
  { id: 'edit',     label: 'Edit' },
  { id: 'delete',   label: 'Delete' },
  { id: 'copy-name', label: 'Copy Name' },
  { id: 'copy-artist', label: 'Copy Artist' },
]
```

The `'copy-*'` items write to the system clipboard via `navigator.clipboard.writeText()`. All other items invoke callbacks provided by `TableView`/`CategoryScreen`. Separator before Delete (achieved by adding `{ id: '__sep__', label: '---' }` or using Electron's `type: 'separator'` — handled by the preload → main IPC mapping).
