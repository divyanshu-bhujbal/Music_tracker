# E-08: Search and Filter Engine

**Phase:** 2 | **Type:** Feature | **Depends On:** E-07 | **Blocks:** (none)

---

## Overview

**Purpose:** Implement global search, column filters, sort logic, and filter composition (AND logic).

**Platform impact:** UNCHANGED — zero platform dependencies. Pure TypeScript + Zustand + TanStack Query. The search/filter engine constructs SQL WHERE clauses — no UI rendering, no platform APIs.

---

## Tasks

| ID | Task | File |
|----|------|------|
| T-08.1 | Implement GlobalSearchBar | `packages/renderer/src/components/SearchBar.tsx` |
| T-08.2 | Implement ColumnFilterComponent | `packages/renderer/src/components/ColumnFilterPopover.tsx` |
| T-08.3 | Implement FilterCompositionLogic | `packages/shared/src/application/search/FilterEngine.ts` |
| T-08.4 | Implement SortLogic | `packages/shared/src/application/search/SortEngine.ts` |
| T-08.5 | Implement ActiveFilterIndicators | Integrated into T-08.2 |
| T-08.6 | Implement ClearAllFilters action | `packages/renderer/src/components/FilterBar.tsx` |
| T-08.7 | Search and filter tests | `packages/shared/src/application/search/__tests__/` |

## Acceptance Criteria

**Unchanged from original E-08 plan.** All 7 tasks have identical acceptance criteria. Search query construction and filter composition are pure TypeScript functions operating on SQL string builders.

## Platform Note

`SearchBar.tsx` and `ColumnFilterPopover.tsx` use MUI components (`TextField` for search, `Popover` with `Checkbox` list for filters). The underlying search/filter/sort engines in `packages/shared/` have zero UI dependencies.
