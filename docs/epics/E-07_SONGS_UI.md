# E-07: Songs Category — UI

**Phase:** 2 | **Type:** Feature | **Depends On:** E-06, E-15 | **Blocks:** E-08, E-12

---

## Overview

**Purpose:** Implement the Songs category UI — table view, tile view, create/edit/detail dialogs, duplicate detection dialog, artist autocomplete, and language picker.

**Platform impact:** MINOR. All acceptance criteria are unchanged. The only difference: components use Material UI (MUI) instead of React Native Paper.

---

## Component Mapping Table

| React Native Paper (Original) | Material UI (Revised) | Notes |
|--------------------|---------------|-------|
| `TextInput` | `TextField` | Same controlled input pattern (`value` + `onChange`) |
| `Button` | `Button` | Same `onClick` handler; variant="contained" for primary |
| `Dialog` | `Dialog` + `DialogTitle` + `DialogContent` + `DialogActions` | Slightly different nesting structure |
| `Searchbar` | `Autocomplete` with `freeSolo` | For artist/language autocomplete; handles input + dropdown |
| `Chip` | `Chip` | For displaying multi-selected artists |
| `Menu` | `Menu` + `MenuItem` | Right-click context menus |
| `Snackbar` | `Snackbar` / `Alert` | Validation feedback; same patterns |
| `Divider` | `Divider` | Visual separator |
| `Checkbox` | `Checkbox` | Selection mode |
| `IconButton` | `IconButton` | Close, filter, action buttons |
| `Typography` | `Typography` | Text display; variant prop similar to Paper's variant |
| `FlatList` / `FlashList` | `@tanstack/react-virtual` | Virtualized table rows |
| `TouchableRipple` | `ButtonBase` / `IconButton` | Touch targets; MUI handles accessibility built-in |
| `Portal` | MUI `Dialog` is automatically portaled | No separate Portal component needed |
| `BottomSheet` | `Drawer` with `anchor="bottom"` | Mobile-specific; same behavior |
| `Card` | `Card` + `CardContent` | Tile view cards |

### Key Differences for Implementation

1. **Form pattern:** RN Paper uses `onChangeText`; MUI uses `onChange` with `event.target.value`. Both are controlled components.
2. **Dialog pattern:** RN Paper `Dialog` is a single component. MUI `Dialog` requires explicit `DialogTitle`, `DialogContent`, `DialogActions` children.
3. **Modal overlay:** RN Paper `Portal` wraps dialogs. MUI `Dialog` uses React Portal internally — no wrapper needed.
4. **Autocomplete:** MUI `Autocomplete` handles both the search input and dropdown. In RN Paper, this was a `Searchbar` + separate `Menu`.
5. **Virtualization:** `@tanstack/react-virtual` replaces `FlashList`. Both are virtualized row renderers. The API differs but the concept is identical.

---

## Tasks

| ID | Task | Notes |
|----|------|-------|
| T-07.1 | Implement SongCreateDialog | Use MUI components per mapping table. AC unchanged. |
| T-07.2 | Implement SongEditDialog | Use MUI components per mapping table. AC unchanged. |
| T-07.3 | Implement SongDetailDialog | Use MUI components per mapping table. AC unchanged. |
| T-07.4 | Implement ArtistAutocomplete component | `Autocomplete` with `freeSolo` + "Create 'X'" option. AC unchanged. |
| T-07.5 | Implement LanguagePicker component | `Autocomplete` with `freeSolo={false}` + language list. AC unchanged. |
| T-07.6 | Integrate duplicate detection into create flow | Same logic; different dialog component. AC unchanged. |
| T-07.7 | Implement DuplicateDetectionDialog | MUI `Dialog` with Scenario A/B resolution options. AC unchanged. |
| T-07.8 | Implement Songs Zustand store | Uses TanStack Query + Zustand. AC unchanged. |
| T-07.9 | Component tests for Song dialogs | `@testing-library/react` instead of RNTL. AC unchanged. |

## Acceptance Criteria

**Unchanged from original E-07 plan.** Every task has identical acceptance criteria. The library change is purely syntactic — behavior, validation, duplicate detection flow, artist autocomplete behavior, and language picker constraints are all identical.
