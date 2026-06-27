# E05 T01–T06: Category Framework — Implementation Specification

> **Source epics:** [E-05_CATEGORY_FRAMEWORK.md](../epics/E-05_CATEGORY_FRAMEWORK.md)
> **Prerequisites:** E-02 (Database Layer) — COMPLETE
> **Blocks:** E-06 (Songs Data)
> **Platform impact:** NONE — zero platform dependencies. Pure TypeScript.

---

## 1. Goal

Define the `CategoryDefinition` interface, implement the `CategoryRegistry` singleton, and provide React hooks (`useActiveCategory`, `useCategoryList`, `useCategorySearchFields`) that the renderer consumes. This is the extensibility contract that enables adding new categories (Books, Movies, Games) in future versions by implementing one interface — zero changes to core application code.

After this epic, `CategoryRegistry` exists with zero categories registered (M0 milestone criterion).

---

## 2. Scope

| Task | File | Summary |
|------|------|---------|
| T-05.1 | `packages/shared/src/domain/interfaces/CategoryDefinition.ts` | Define the `CategoryDefinition` interface and its dependent types |
| T-05.2 | `packages/shared/src/application/category/CategoryRegistry.ts` | Singleton registry: register, get, getAll, has |
| T-05.3 | `packages/shared/src/application/category/useActiveCategory.ts` | React hook returning the currently-selected `CategoryDefinition` |
| T-05.4 | `packages/shared/src/application/category/useCategoryList.ts` | React hook returning all registered `CategoryDefinition[]` |
| T-05.5 | `packages/shared/src/application/category/useCategorySearchFields.ts` | React hook returning `searchFields` for the active category |
| T-05.6 | `packages/shared/src/application/category/__tests__/CategoryRegistry.test.ts` | Unit tests for `CategoryRegistry` |

---

## 3. Out of Scope

- Registering `SongsCategory` — that is E-06 (the Songs category definition does not exist yet)
- UI components (`createForm`, `editForm`, `detailView`) — those are per-category React components defined in E-06/E-07
- `DuplicateDetector` implementation — that is E-06/E-07
- Loading categories from the `categories` database table — the registry is a compile-time/startup in-memory map; the DB `categories` table is a reference table managed by migrations
- Wiring the registry into the DI container (`ServiceProvider`) — not needed; the registry is a standalone singleton
- Wiring hooks into the renderer app entry — that is E-15 (UI Shell)
- `useCategoryStore` (Zustand store for active category state) — this spec defines hooks that consume a store; the store itself is created as part of T-05.3

---

## 4. Files To Create

| # | File | Package |
|---|------|---------|
| 1 | `packages/shared/src/domain/interfaces/CategoryDefinition.ts` | `@collectio/shared` |
| 2 | `packages/shared/src/application/category/CategoryRegistry.ts` | `@collectio/shared` |
| 3 | `packages/shared/src/application/category/useActiveCategory.ts` | `@collectio/shared` |
| 4 | `packages/shared/src/application/category/useCategoryList.ts` | `@collectio/shared` |
| 5 | `packages/shared/src/application/category/useCategorySearchFields.ts` | `@collectio/shared` |
| 6 | `packages/shared/src/application/category/__tests__/CategoryRegistry.test.ts` | `@collectio/shared` |

---

## 5. Files To Modify

| # | File | Change |
|---|------|--------|
| 1 | `packages/shared/src/domain/interfaces/index.ts` | Add `export type { CategoryDefinition, ColumnDefinition, FilterDefinition, RepositoryMap } from './CategoryDefinition.js'` |
| 2 | `packages/shared/src/application/index.ts` | Add `export { CategoryRegistry } from './category/CategoryRegistry.js'` and re-export hook types as needed |
| 3 | `packages/shared/src/index.ts` | Add `export type { CategoryDefinition, ColumnDefinition, FilterDefinition, RepositoryMap } from './domain/interfaces/CategoryDefinition.js'`; add `export { CategoryRegistry } from './application/category/CategoryRegistry.js'` |
| 4 | `packages/shared/package.json` | Add `react` and `zustand` as `peerDependencies`; add `@types/react` as `devDependency` (see §6 rationale) |

---

## 6. Interfaces

### 6.1 `CategoryDefinition` (`packages/shared/src/domain/interfaces/CategoryDefinition.ts`)

```
CategoryDefinition {
  id: string
  displayName: string
  iconName: string
  migrations: Migration[]
  repositories: RepositoryMap
  tableColumns: ColumnDefinition[]
  searchFields: string[]
  filterFields: FilterDefinition[]
  createForm: React.FC<{ onSave: (item: unknown) => void; onCancel: () => void }>
  editForm: React.FC<{ item: unknown; onSave: (item: unknown) => void; onCancel: () => void }>
  detailView: React.FC<{ item: unknown; onClose: () => void }>
  duplicateDetector: (candidate: unknown) => Promise<DuplicateCheckResult[]>
}
```

**`id`:** Unique slug matching the `categories.id` DB column (e.g., `"songs"`).

**`displayName`:** Human-readable label for sidebar and navigation (e.g., `"Songs"`).

**`iconName`:** MUI icon identifier string (e.g., `"music-note"`).

**`migrations`:** Array of `{ version: number; sql: string }` objects — the SQL migration files for this category's tables. Imported from the existing `Migration` type in `MigrationTypes.ts`.

**`repositories`:** A map of repository class constructors keyed by entity name. Each value is a class constructor that takes `DatabaseConnection` as its sole constructor argument. Type: `Record<string, new (db: DatabaseConnection) => unknown>`.

**`tableColumns`:** Column definitions for the table view. Each `ColumnDefinition` has: `{ key: string; label: string; sortable: boolean; filterable: boolean; flex: number; fixedWidth?: number }`.

**`searchFields`:** Array of column `key` strings that global search queries against (e.g., `["name", "album_name", "display_name"]`).

**`filterFields`:** Array of `{ key: string; label: string; sourceField: string }` — each describes a column filter's data source.

**`createForm` / `editForm` / `detailView`:** React functional components. The interface uses `React.FC` for type annotation only. `react` is a peer dependency of `@collectio/shared` for these type references — no runtime React code executes in the shared package.

**`duplicateDetector`:** Async function that takes a candidate item (the partially-built entity before save) and returns an array of potential duplicates. Each `DuplicateCheckResult` has: `{ type: 'exact' | 'partial'; existingItem: unknown; resolutionOptions: string[] }`.

### 6.2 Supporting Types (defined in same file)

```
ColumnDefinition {
  key: string
  label: string
  sortable: boolean
  filterable: boolean
  flex: number
  fixedWidth?: number
}

FilterDefinition {
  key: string
  label: string
  sourceField: string
}

DuplicateCheckResult {
  type: 'exact' | 'partial'
  existingItem: unknown
  resolutionOptions: string[]
}
```

`RepositoryMap` is a type alias: `Record<string, new (db: DatabaseConnection) => unknown>`.

**`Migration`** is re-used from the existing `packages/shared/src/data/database/MigrationTypes.ts` — do NOT redefine it.

**`DatabaseConnection`** is re-used from the existing `packages/shared/src/data/database/DatabaseConnection.ts` — import type-only.

### 6.3 Dependency Justification (`packages/shared/package.json` additions)

The `CategoryDefinition` interface references:
- `React.FC` — requires `react` as a **peerDependency** (type-only contract, zero runtime React in shared/)
- `Migration` — already exported from `@collectio/shared`; self-reference
- `DatabaseConnection` — already exported from `@collectio/shared`; self-reference

The hooks (`useActiveCategory`, `useCategoryList`, `useCategorySearchFields`) reference:
- `useStore` from `zustand` — requires `zustand` as a **peerDependency**
- React hooks (`useCallback`, `useMemo`) — requires `react` as a **peerDependency**

This follows AD-18 precedent (shared importing types from platform as devDep). Here, shared imports React types as devDep and declares react/zustand as peerDeps.

**Add to `packages/shared/package.json`:**
```json
"peerDependencies": {
  "react": "18.3.1",
  "zustand": "5.0.14"
},
"devDependencies": {
  "@types/react": "18.3.31"
}
```

`react` and `zustand` versions MUST match those in `packages/renderer/package.json` (Rule 7.1 approved packages).

---

## 7. Data Flow

```
App Entry (apps/electron/ or apps/capacitor/)
  │
  ├─ CategoryRegistry.register(SongsCategory)   ← E-06 does this
  ├─ CategoryRegistry.register(BooksCategory)   ← future V2
  │
  ▼
CategoryRegistry (singleton, in-memory Map<string, CategoryDefinition>)
  │
  ├─ useCategoryList()      → reads registry, returns CategoryDefinition[]
  ├─ useActiveCategory()    → reads registry + Zustand store for selected ID
  └─ useCategorySearchFields() → reads active category, returns searchFields
  │
  ▼
Renderer Components (Sidebar, TableView, SearchBar)
  consume hooks → get category metadata → render UI
```

**Key principle:** The registry is an in-memory registration map. It does NOT read from the database. The `categories` table in the DB is a separate concern — it represents which categories exist at the data layer for sync/reference. The registry represents which categories are compiled into the current app version. They are expected to be consistent but are not coupled.

---

## 8. State Changes

### 8.1 `CategoryRegistry` State

- **Internal:** `Map<string, CategoryDefinition>` — private, static
- **Initial state:** Empty map (zero categories registered — M0 criterion)
- **Mutations:** Only `register()` appends entries. No `unregister()`. No `clear()`.
- **Thread safety:** Not required (single-threaded JavaScript runtime)
- **Duplicate registration:** Throws a descriptive error (see §10)

### 8.2 Active Category State (Zustand Store)

Created inside `useActiveCategory.ts` (or a shared `categoryStore.ts` in the same directory):

```
interface CategoryStore {
  activeCategoryId: string | null
  setActiveCategory: (id: string) => void
}
```

- **Initial state:** `activeCategoryId = null` (no category selected until user navigates)
- **Persistence:** In-memory only (not persisted to DB or storage — navigation state is ephemeral)
- **Setting a non-existent category ID:** Silently stores the ID; hooks that resolve it will return `undefined`

The store is a module-level Zustand store (created via `create<CategoryStore>(...)`), NOT a React context. This follows the existing codebase pattern (Zustand for client state, not React context).

---

## 9. Database Changes

**NONE.**

The `categories` table already exists (created by migration 001). The `CategoryRepository` already exists and exports `findEnabled()`. The registry does not read from the database — it is purely an in-memory compile-time registration map.

---

## 10. Error Handling

| Scenario | Behavior |
|----------|----------|
| `CategoryRegistry.register()` called with duplicate `id` | Throw `Error("Category '${id}' is already registered.")` |
| `CategoryRegistry.register()` called with definition missing required fields | TypeScript compile-time error (strict interface) — no runtime check needed |
| `CategoryRegistry.get(id)` for unregistered `id` | Return `undefined` (not an error — caller handles) |
| `useActiveCategory()` when no category is registered | Return `undefined` (valid state — M0 has zero categories) |
| `useActiveCategory()` when active ID doesn't match any registered category | Return `undefined` |
| `useCategorySearchFields()` when no active category | Return `[]` (empty array) |
| `useCategoryList()` when no categories registered | Return `[]` (empty array) |

No custom error classes are needed for E-05. A plain `Error` with a descriptive message is sufficient for the one error case (duplicate registration).

---

## 11. Logging Requirements

**NONE.**

E-05 is pure registration logic. There are no async operations, no I/O, no network calls, and no fallible operations beyond the duplicate-registration guard. Runtime logging is not required.

---

## 12. Security Requirements

**NONE.**

The category framework handles no credentials, no user data, no PII, no tokens, no cryptographic material. It is a static type registry. Zero security surface.

---

## 13. Acceptance Criteria

All 6 tasks share identical acceptance criteria:

| # | Criterion |
|---|-----------|
| AC-01 | `CategoryDefinition` interface compiles with `tsc --noEmit` in `@collectio/shared` |
| AC-02 | `CategoryRegistry` singleton exists with `register()`, `get()`, `getAll()`, `has()` methods |
| AC-03 | `CategoryRegistry.register()` accepts a `CategoryDefinition` and stores it |
| AC-04 | `CategoryRegistry.get(id)` returns the registered definition or `undefined` |
| AC-05 | `CategoryRegistry.getAll()` returns all registered definitions (empty array initially) |
| AC-06 | `CategoryRegistry.has(id)` returns `true` for registered categories, `false` otherwise |
| AC-07 | Registering a duplicate `id` throws an `Error` with a descriptive message |
| AC-08 | `useActiveCategory()` returns the `CategoryDefinition` for the currently-selected ID, or `undefined` |
| AC-09 | `useCategoryList()` returns all registered `CategoryDefinition[]` |
| AC-10 | `useCategorySearchFields()` returns `string[]` of search field keys for the active category, or `[]` if none |
| AC-11 | All hooks re-render correctly when the active category changes (Zustand reactivity) |
| AC-12 | `CategoryRegistry` unit tests pass with ≥80% coverage on new files (per `jest.config.ts` threshold) |
| AC-13 | `pnpm typecheck` passes with zero errors across all 5 workspace packages |
| AC-14 | `pnpm lint` passes with zero errors on `packages/shared/` |
| AC-15 | Existing tests continue to pass (`pnpm --filter @collectio/shared test`) |
| AC-16 | No platform-specific code exists in any new file (pure TypeScript) |
| AC-17 | All new exports are re-exported from `packages/shared/src/index.ts` |

---

## 14. Test Cases

### 14.1 `CategoryRegistry` Unit Tests

All tests in `packages/shared/src/application/category/__tests__/CategoryRegistry.test.ts`.

**Test environment:** Node (jest with `testEnvironment: "node"` — the shared package does not use jsdom). The registry has no React dependencies — pure TypeScript class.

| # | Test | Expected |
|---|------|----------|
| REG-01 | `getAll()` on fresh registry | Returns `[]` |
| REG-02 | `has('songs')` on fresh registry | Returns `false` |
| REG-03 | `get('songs')` on fresh registry | Returns `undefined` |
| REG-04 | `register(mockDefinition)` then `getAll()` | Returns array containing the definition |
| REG-05 | `register(mockDefinition)` then `has(id)` | Returns `true` |
| REG-06 | `register(mockDefinition)` then `get(id)` | Returns the exact same definition object |
| REG-07 | `register()` two different definitions | `getAll()` returns both; `has()` returns `true` for both IDs |
| REG-08 | `register()` duplicate `id` | Throws `Error` with message containing the duplicated ID string |
| REG-09 | `register()` duplicate — first registration preserved | After catching error, `get(id)` still returns first definition |
| REG-10 | `getAll()` returns a copy, not internal reference | Mutating the returned array does not affect registry |
| REG-11 | `register()` with all optional fields empty (`searchFields: []`, `filterFields: []`, `migrations: []`) | Accepted, no error |

### 14.2 Hook Tests

Hook tests require a React environment (`jsdom` or equivalent). If placed in `packages/shared/` (which uses `testEnvironment: "node"`), an override is needed or tests go in `packages/renderer/`.

**Decision:** Unit tests for hooks go in `packages/renderer/src/hooks/__tests__/` (matching E-15 patterns). This avoids adding jsdom to the shared package. The registry tests (REG-01 through REG-11) are sufficient for the shared package test coverage threshold.

Rationale: The shared package jest config uses `testEnvironment: "node"`. Hooks require React + jsdom. Rather than bifurcating the shared test config, hook tests are deferred to the renderer package which already has `jest-environment-jsdom`. This is consistent with the architecture (renderer tests React; shared tests pure TypeScript).

| # | Test | Location | Expected |
|---|------|----------|----------|
| HOOK-01 | `useCategoryList()` with zero registered | `packages/renderer/src/hooks/__tests__/` | Returns `[]` |
| HOOK-02 | `useCategoryList()` with two registered | Same | Returns both definitions |
| HOOK-03 | `useActiveCategory()` with no active ID | Same | Returns `undefined` |
| HOOK-04 | `useActiveCategory()` after `setActiveCategory(id)` | Same | Returns matching definition |
| HOOK-05 | `useActiveCategory()` with ID not in registry | Same | Returns `undefined` |
| HOOK-06 | `useCategorySearchFields()` with active category | Same | Returns `searchFields` array |
| HOOK-07 | `useCategorySearchFields()` with no active category | Same | Returns `[]` |
| HOOK-08 | Changing active category triggers re-render | Same | Hook returns new definition after change |

---

## 15. Definition of Done

Per `PROJECT_CONSTITUTION.md` Section 26 (Task-Level DoD):

1. **Implemented:** All 6 tasks complete per this specification.
2. **Self-reviewed:** Diff reviewed for import correctness, type safety, and no extraneous changes.
3. **Tested:** REG-01 through REG-11 pass. Existing tests pass (`pnpm --filter @collectio/shared test`).
4. **Platform verified:** No platform-specific code — verified by `pnpm typecheck` across all 5 packages.
5. **No new lint errors:** `pnpm lint` on shared package passes with zero errors.
6. **No hardcoded data:** No magic strings, no platform conditionals. Category IDs come from registered definitions, not hardcoded lists.

### Gate Commands (must all pass)

```
pnpm --filter @collectio/shared typecheck
pnpm --filter @collectio/shared lint
pnpm --filter @collectio/shared test
pnpm typecheck            # all 5 workspace packages
```

---

## Appendix A: File Details

### A.1 `packages/shared/src/domain/interfaces/CategoryDefinition.ts`

- **Purpose:** Define the contract that every category (Songs, Books, Movies, Games) must implement.
- **Responsibility:** Export the `CategoryDefinition` interface and its supporting types (`ColumnDefinition`, `FilterDefinition`, `DuplicateCheckResult`, `RepositoryMap`). Import `Migration` from `../data/database/MigrationTypes.js` (type-only). Import `DatabaseConnection` from `../data/database/DatabaseConnection.js` (type-only). Import `FC` from `react` (type-only).
- **Public API:**
  - `CategoryDefinition` — the main interface
  - `ColumnDefinition` — table column metadata
  - `FilterDefinition` — column filter metadata
  - `DuplicateCheckResult` — duplicate detection result
  - `RepositoryMap` — type alias for repository constructor map

### A.2 `packages/shared/src/application/category/CategoryRegistry.ts`

- **Purpose:** Singleton registry that holds all `CategoryDefinition` instances registered at app startup.
- **Responsibility:** Provide `register()`, `get()`, `getAll()`, `has()`. Enforce duplicate registration guards. The registry is a static class — no instantiation needed. All methods are synchronous.
- **Public API:**
  - `CategoryRegistry.register(definition: CategoryDefinition): void` — registers a category; throws on duplicate `id`
  - `CategoryRegistry.get(id: string): CategoryDefinition | undefined` — retrieves by ID
  - `CategoryRegistry.getAll(): CategoryDefinition[]` — returns a shallow copy of all registered definitions
  - `CategoryRegistry.has(id: string): boolean` — checks if a category ID is registered

### A.3 `packages/shared/src/application/category/useActiveCategory.ts`

- **Purpose:** React hook that returns the `CategoryDefinition` for the currently-selected category, or `undefined` if none is selected.
- **Responsibility:** Create a module-level Zustand store (`CategoryStore`) tracking `activeCategoryId`. The hook reads the store + queries the registry. Re-renders on active category change via Zustand subscription.
- **Public API:**
  - `useActiveCategory(): CategoryDefinition | undefined` — the currently-active category definition
  - `useActiveCategoryStore(): CategoryStore` — returns `{ activeCategoryId, setActiveCategory }` for components that need to set the active category (e.g., sidebar `CategoryNav`)

### A.4 `packages/shared/src/application/category/useCategoryList.ts`

- **Purpose:** React hook that returns all registered `CategoryDefinition[]`. Re-renders when registry changes (though in V1, registration only happens once at startup).
- **Responsibility:** Read `CategoryRegistry.getAll()`. For V1, the list is static after startup — but the hook pattern preserves extensibility for dynamic registration in future versions.
- **Public API:**
  - `useCategoryList(): CategoryDefinition[]` — all registered categories

### A.5 `packages/shared/src/application/category/useCategorySearchFields.ts`

- **Purpose:** React hook that returns the `searchFields` string array for the currently-active category, or `[]` if no category is active.
- **Responsibility:** Delegates to `useActiveCategory()` and extracts `.searchFields`. Pure convenience hook — no independent state.
- **Public API:**
  - `useCategorySearchFields(): string[]` — search field keys for the active category

### A.6 `packages/shared/src/application/category/__tests__/CategoryRegistry.test.ts`

- **Purpose:** Unit tests for `CategoryRegistry` covering all methods and edge cases.
- **Responsibility:** Tests REG-01 through REG-11 as specified in §14.1. Uses a mock `CategoryDefinition` factory function to create test definitions without depending on real category implementations.
- **Public API:** None (test file).

---

## Appendix B: Mock CategoryDefinition Factory

For test purposes only. Used in `CategoryRegistry.test.ts`:

```typescript
function mockCategoryDefinition(overrides?: Partial<CategoryDefinition>): CategoryDefinition {
  return {
    id: 'test-category',
    displayName: 'Test Category',
    iconName: 'test-icon',
    migrations: [],
    repositories: {},
    tableColumns: [],
    searchFields: [],
    filterFields: [],
    createForm: () => null,
    editForm: () => null,
    detailView: () => null,
    duplicateDetector: async () => [],
    ...overrides,
  };
}
```

This factory enables tests like:
- `register(mockCategoryDefinition({ id: 'books' }))` — unique registration
- `register(mockCategoryDefinition({ searchFields: [] }))` — edge case with empty fields

---

## Appendix C: Key Design Decisions

### CD-01: Registry is in-memory, not DB-backed

The registry is a compile-time/startup in-memory map. It does NOT read from the `categories` database table. The DB table is for sync/reference; the registry is for application-level extensibility. They are separate concerns by design.

### CD-02: Hooks in shared package with react/zustand as peerDeps

The epic spec places hooks in `packages/shared/src/application/category/`. This requires `react` and `zustand` as `peerDependencies` of `@collectio/shared`. This follows the AD-18 precedent (shared importing types from platform as devDep). The hooks cause zero runtime React code in shared — they are executed in the renderer's React context.

### CD-03: Hook tests deferred to renderer package

The shared package uses `testEnvironment: "node"` (no jsdom). Hook tests require React + jsdom. Rather than bifurcating the shared jest config, hook tests (HOOK-01 through HOOK-08) are placed in `packages/renderer/src/hooks/__tests__/`. The shared package's test coverage threshold is satisfied by registry unit tests (REG-01 through REG-11).

### CD-04: Zustand store is module-level, not React context

Following the existing codebase pattern (`zustand` for client state), the active-category store is a module-level `create()` call, exported for consumption by hooks. This avoids unnecessary React context nesting and is consistent with the architecture's state management decision (Section 12 of 01_ARCHITECTURE.md).

### CD-05: `Migration` type re-used from existing `MigrationTypes.ts`

The `CategoryDefinition.migrations` field uses the existing `Migration` type (`{ version: number; sql: string }`) defined in `packages/shared/src/data/database/MigrationTypes.ts`. Do not redefine it. Import type-only.

---

## Appendix D: Barrel Export Checklist

After implementing all files, verify these exports exist:

| Barrel File | Must Export |
|-------------|-------------|
| `packages/shared/src/domain/interfaces/index.ts` | `CategoryDefinition`, `ColumnDefinition`, `FilterDefinition`, `DuplicateCheckResult`, `RepositoryMap` |
| `packages/shared/src/application/index.ts` | `CategoryRegistry`, `useActiveCategory`, `useCategoryList`, `useCategorySearchFields` |
| `packages/shared/src/index.ts` | Same types as interfaces/index.ts + `CategoryRegistry` (class export, not type-only) |

Hooks do NOT need to be re-exported from the top-level `index.ts` unless a consumer outside `@collectio/shared` is expected to import them directly. Per the architecture, hooks are consumed by the renderer package, which can import from `@shared/application/category/useActiveCategory` via path aliases.

---

_End of Implementation Specification_
