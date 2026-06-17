# E-14: Settings and Configuration

**Phase:** 2 | **Type:** Feature | **Depends On:** E-02 | **Blocks:** (none)

---

## Overview

**Purpose:** Implement the SettingsScreen and settings persistence via `app_settings` table.

**Platform impact:** UNCHANGED — settings are stored in the SQLite database (shared schema). The SettingsScreen is a React component using MUI form controls.

---

## Tasks

| ID | Task | File |
|----|------|------|
| T-14.1 | Implement SettingsScreen | `packages/renderer/src/screens/SettingsScreen.tsx` |
| T-14.2 | Implement settings persistence | `packages/shared/src/application/settings/SettingsManager.ts` |
| T-14.3 | Implement sync-on-startup toggle | Integrated into T-14.1 |
| T-14.4 | Implement auto-sync delay config | Integrated into T-14.1 |
| T-14.5 | Implement default view toggle | Integrated into T-14.1 |
| T-14.6 | Implement theme selection | Integrated into T-14.1 |
| T-14.7 | Settings persistence tests | `packages/shared/src/application/settings/__tests__/` |

## Acceptance Criteria

**Unchanged from original E-14 plan.** All 7 tasks have identical acceptance criteria. Settings are stored in `app_settings` table which is synced via LWW (has `updated_at` column). Theme toggling uses MUI's `ThemeProvider` instead of RN Paper's theming.
