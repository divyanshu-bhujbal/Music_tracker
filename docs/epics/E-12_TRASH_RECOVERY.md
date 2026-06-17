# E-12: Trash and Recovery

**Phase:** 2 | **Type:** Feature | **Depends On:** E-07 | **Blocks:** (none)

---

## Overview

**Purpose:** Implement soft-delete, bulk delete, trash screen, and restore functionality.

**Platform impact:** UNCHANGED — all logic is SQL-based (soft-delete pattern). The TrashScreen is a React component using MUI, functionally identical to the original.

---

## Tasks

| ID | Task | File |
|----|------|------|
| T-12.1 | Implement soft-delete action | `packages/shared/src/data/repositories/` (base repository) |
| T-12.2 | Implement bulk soft-delete | `packages/shared/src/data/repositories/` (base repository) |
| T-12.3 | Implement TrashScreen | `packages/renderer/src/screens/TrashScreen.tsx` |
| T-12.4 | Implement restore action | `packages/shared/src/data/repositories/` (base repository) |
| T-12.5 | Trash and recovery tests | `packages/shared/src/data/repositories/__tests__/` |

## Acceptance Criteria

**Unchanged from original E-12 plan.** All 5 tasks have identical acceptance criteria.
