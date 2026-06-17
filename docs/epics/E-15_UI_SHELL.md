# E-15: UI Shell

**Phase:** 1 | **Type:** Foundation | **Depends On:** E-01 | **Blocks:** E-07

---

## Overview

**Purpose:** Set up the application shell — navigation structure, collapsible sidebar, sync status panel, category navigation, table/tile view framework, selection mode, and platform-specific UI adaptations.

**Platform impact:** REVISED. Uses React Router + MUI instead of React Navigation + React Native Paper. All behavioral acceptance criteria are unchanged.

---

## Navigation Mapping Table

| React Navigation (Original) | React Router v6 (Revised) | Notes |
|-----------------------------|--------------------------|-------|
| `NavigationContainer` | `BrowserRouter` (Electron) / `HashRouter` (Capacitor) | Capacitor uses HashRouter because WebView doesn't support browser history pushState reliably |
| `createNativeStackNavigator` | `<Routes>` + `<Route>` | Flat route tree; no native stack animation |
| `navigation.navigate('screen')` | `const navigate = useNavigate(); navigate('/path')` | URL-based navigation |
| `navigation.goBack()` | `navigate(-1)` | Browser history back |
| `route.params` | `useParams()` / `useSearchParams()` | URL params or query strings |
| `Linking` (deep links) | Electron: `app.setAsDefaultProtocolClient('collectio')`; Capacitor: `App.addListener('appUrlOpen')` | Custom protocol handling |
| `DrawerNavigator` (sidebar) | MUI `Drawer` | Persistent or temporary drawer |

## Component Mapping Table

| React Native Paper (Original) | Material UI (Revised) | Notes |
|--------------------|---------------|-------|
| `Drawer` | `Drawer` | Collapsible sidebar; same collapse/expand behavior |
| `Appbar` | `AppBar` + `Toolbar` | Top bar for mobile; optional on desktop |
| `IconButton` | `IconButton` | Sidebar toggle, action buttons |
| `List.Item` | `ListItem` + `ListItemIcon` + `ListItemText` | Sidebar navigation items |
| `Badge` | `Badge` | Pending change count indicator |
| `Divider` | `Divider` | Sidebar section separator |
| `Typography` | `Typography` | Text labels |
| `Checkbox` | `Checkbox` | Selection mode |
| `Switch` | `Switch` | Settings toggles |
| `Snackbar` | `Snackbar` / `Alert` | Sync status messages |

---

## Tasks

### T-15.1 — Set Up React Router Structure

| Property | Detail |
|----------|--------|
| **Depends on** | T-01.3 |
| **Blocks** | T-15.2 through T-15.6 |

**Files produced:**
- `packages/renderer/src/navigation/AppRouter.tsx`

**Requirements:**
- Conditional routing: if not authenticated → auth screens (SetupScreen, UnlockScreen); if authenticated → MainLayout with nested routes
- Auth state from Zustand store
- Electron: `BrowserRouter`; Capacitor: `HashRouter` (configured per app entry)
- Route paths: `/setup`, `/unlock`, `/`, `/songs`, `/trash`, `/settings`
- Protected routes redirect to `/setup` if not authenticated

**Acceptance criteria:**
1. Unauthenticated → redirected to SetupScreen
2. Authenticated → MainLayout with Songs screen active
3. Navigate to `/trash` → TrashScreen renders
4. Back button navigates correctly (Electron + Capacitor)
5. Acceptance criteria unchanged from original T-15.1

---

### T-15.2 — Implement MainLayout

| Property | Detail |
|----------|--------|
| **Depends on** | T-15.1 |
| **Blocks** | T-15.3, T-15.7, T-15.8 |

**Files produced:**
- `packages/renderer/src/components/MainLayout.tsx`

**Requirements:**
- Two-panel layout: collapsible sidebar (left) + content area (right)
- Sidebar width: 56px collapsed, 280px expanded
- Content area fills remaining space (CSS flexbox)
- Responsive: on narrow screens, sidebar is temporary (overlay) instead of persistent
- Uses MUI layout primitives (Box, Drawer, CssBaseline)

**Acceptance criteria:** Unchanged from original T-15.2.

---

### T-15.3 — Implement Collapsible Sidebar

| Property | Detail |
|----------|--------|
| **Depends on** | T-15.2 |
| **Blocks** | T-15.4, T-15.5, T-15.6 |

**Files produced:**
- `packages/renderer/src/components/Sidebar.tsx`

**Requirements:**
- Collapsed: vertical icon strip (MUI `IconButton` list)
- Expanded: labeled items with full text (MUI `ListItem` with `ListItemText`)
- Toggle via hamburger `IconButton`
- Collapsed by default (stored in localStorage)
- Same visual indicators as original: sync status icon, category icons, settings gear

**Acceptance criteria:** Unchanged from original T-15.3.

---

### T-15.4 — Implement SyncStatusPanel

| Property | Detail |
|----------|--------|
| **Depends on** | T-15.3 |
| **Blocks** | (none) |

**Files produced:**
- `packages/renderer/src/components/SyncStatusPanel.tsx`

**Requirements:**
- Sync status icon: green check (last success), yellow warning (pending/failed), red error (unrecoverable)
- "Last sync: X ago" relative timestamp (using `Intl.RelativeTimeFormat`)
- "N pending changes" count badge
- Tap icon → triggers manual sync (dispatches to Zustand sync store)

**Acceptance criteria:** Unchanged from original T-15.4.

---

### T-15.5 — Implement CategoryNav in Sidebar

| Property | Detail |
|----------|--------|
| **Depends on** | T-15.3, T-05.2 |
| **Blocks** | (none) |

**Files produced:**
- `packages/renderer/src/components/CategoryNav.tsx`

**Requirements:**
- Reads enabled categories from `CategoryRegistry`
- Renders as vertical icon list (collapsed) or labeled items (expanded)
- Current category highlighted (MUI `selected` prop on `ListItem`)
- Tap navigates to `/category/:id` route
- V1: shows only "Songs"

**Acceptance criteria:** Unchanged from original T-15.5.

---

### T-15.6 — Implement SettingsLink in Sidebar

| Property | Detail |
|----------|--------|
| **Depends on** | T-15.3 |
| **Blocks** | (none) |

**Files produced:**
- Integrated into `packages/renderer/src/components/Sidebar.tsx`

**Requirements:**
- Gear icon always visible; "Settings" label when expanded
- Tap navigates to `/settings`

**Acceptance criteria:** Unchanged from original T-15.6.

---

### T-15.7 — Implement TableView Component

| Property | Detail |
|----------|--------|
| **Depends on** | T-15.2, T-15.9 (selection mode integration) |
| **Blocks** | E-07 |

**Files produced:**
- `packages/renderer/src/components/TableView.tsx`

**Requirements:**
- Spreadsheet-style virtualized table using `@tanstack/react-virtual`
- Columns defined by `CategoryDefinition.tableColumns`
- Sortable headers: tap → asc → desc → none (single column sort)
- Leftmost column = selection checkbox
- Renders 10,000 rows in <200ms (NFR-PERF-01)
- Row tap opens detail dialog
- Selection mode via checkbox

**Acceptance criteria:** Unchanged from original T-15.7. Virtualization library is `@tanstack/react-virtual` instead of `FlashList`.

---

### T-15.8 — Implement TileView Component

| Property | Detail |
|----------|--------|
| **Depends on** | T-15.2 |
| **Blocks** | E-07 |

**Files produced:**
- `packages/renderer/src/components/TileView.tsx`

**Requirements:**
- Card grid using MUI `Card` + `CardContent`
- 2 columns on narrow, 3 on medium, 4 on wide (CSS grid responsive)
- Card shows: song name, artist(s), album, language tag
- Card tappable → opens detail dialog

**Acceptance criteria:** Unchanged from original T-15.8.

---

### T-15.9 — Implement Selection Mode

| Property | Detail |
|----------|--------|
| **Depends on** | T-15.7 |
| **Blocks** | E-07, E-12 |

**Files produced:**
- `packages/renderer/src/components/SelectionModeBar.tsx`

**Requirements:**
- Leftmost column = checkbox; select-all checkbox in header
- Bulk action bar appears with "Delete Selected", "Clear Selection"
- Selection stored in Zustand store

**Acceptance criteria:** Unchanged from original T-15.9.

---

### T-15.10 — Platform-Specific UI Adaptations

| Property | Detail |
|----------|--------|
| **Depends on** | T-15.2, T-15.7, T-15.8 |
| **Blocks** | E-07 |

**Files produced:**
- `packages/renderer/src/hooks/usePlatformAdapter.ts` — detects Electron vs. Capacitor at runtime
- Platform-specific behaviour distributed across components

**Requirements (Electron):**
- Wider default column widths (configured in CSS via media query or platform detection)
- Hover states on rows (CSS `:hover` — works natively in browser)
- Right-click context menu via Electron IPC: renderer sends `show-context-menu` → main process `Menu.buildFromTemplate()`
- Keyboard shortcuts via Electron `globalShortcut`: Ctrl+N (new), Delete (delete selected), Ctrl+F (focus search), Escape (deselect/close)
- Native OS window chrome, title bar

**Requirements (Capacitor):**
- Touch targets minimum 48×48dp (CSS `min-width: 48px; min-height: 48px`)
- Bottom sheet via MUI `Drawer` with `anchor="bottom"`
- Back gesture via Capacitor `App.addListener('backButton')`
- Pull-to-refresh via browser touch events + CSS `overscroll-behavior`
- Safe area insets via Capacitor `@capacitor/status-bar`

**Acceptance criteria:** Unchanged from original T-15.10. Platform-specific features achieved via different APIs but have the same user-facing behavior.

---

### T-15.11 — Component Tests for Shell

| Property | Detail |
|----------|--------|
| **Depends on** | T-15.2 through T-15.9 |
| **Blocks** | (none) |

**Files produced:**
- `packages/renderer/src/components/__tests__/`

**Requirements:**
- Uses `@testing-library/react` (RTL) with jsdom environment
- Tests: sidebar collapse/expand, navigation fires correct callbacks, table renders rows, tile renders cards, selection mode activates/deactivates

**Acceptance criteria:** Unchanged from original T-15.11. Testing library is RTL (web) instead of RNTL.
