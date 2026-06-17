# E-05: Category Framework

**Phase:** 1 | **Type:** Foundation | **Depends On:** E-02 | **Blocks:** E-06

---

## Overview

**Purpose:** Define the `CategoryDefinition` interface and implement the `CategoryRegistry` — the extensibility contract that enables adding new categories (Books, Movies, Games) in future versions without changing core application code.

**Platform impact:** UNCHANGED — zero platform dependencies. Pure TypeScript.

---

## Tasks

| ID | Task | File |
|----|------|------|
| T-05.1 | Define CategoryDefinition interface | `packages/shared/src/domain/interfaces/CategoryDefinition.ts` |
| T-05.2 | Implement CategoryRegistry | `packages/shared/src/application/category/CategoryRegistry.ts` |
| T-05.3 | Implement useActiveCategory hook | `packages/shared/src/application/category/useActiveCategory.ts` |
| T-05.4 | Implement useCategoryList hook | `packages/shared/src/application/category/useCategoryList.ts` |
| T-05.5 | Implement useCategorySearchFields hook | `packages/shared/src/application/category/useCategorySearchFields.ts` |
| T-05.6 | Registry unit tests | `packages/shared/src/application/category/__tests__/` |

## Interface

```
CategoryDefinition {
  id: string                     // slug: 'songs', 'books', 'movies'
  displayName: string            // UI label
  iconName: string               // MUI icon identifier
  migrations: Migration[]        // SQL migration files
  repositories: RepositoryMap    // Data access objects
  tableColumns: ColumnDefinition[]  // Table view columns
  searchFields: string[]          // Fields for global search
  filterFields: FilterDefinition[] // Column filter configs
  createForm: React.FC            // Create form component
  editForm: React.FC              // Edit form component
  detailView: React.FC            // Detail view component
  duplicateDetector: Function     // Duplicate detection logic
}
```

## Acceptance Criteria

**Unchanged from original E-05 plan.** All 6 tasks have identical acceptance criteria. The CategoryDefinition interface is the same contract regardless of platform.

## Platform Note

The `React.FC` references in CategoryDefinition are for the renderer package. The interface itself lives in `packages/shared/` which has React as a peer dependency for type definitions only — no runtime React dependency. Category registration happens in `apps/electron/src/index.tsx` and `apps/capacitor/src/index.tsx` at app startup.
