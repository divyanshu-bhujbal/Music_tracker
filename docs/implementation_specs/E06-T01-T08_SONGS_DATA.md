# E06 T01–T08: Songs Category — Data — Implementation Specification

> **Source epic:** [E-06_SONGS_DATA.md](../epics/E-06_SONGS_DATA.md)
> **Prerequisites:** E-05 (Category Framework) — COMPLETE; E-02 (Database Layer) — COMPLETE
> **Blocks:** E-07 (Songs UI)
> **Platform impact:** NONE — pure TypeScript in `@collectio/shared`; one file in `@collectio/renderer`

---

## 1. Goal

Implement the `SongDuplicateDetector` (normalization pipeline + artist set comparison per Constitution §14.4), create unit tests for it, and register the `SongsCategory` definition implementing `CategoryDefinition` so the category framework has its first concrete category.

---

## 2. Scope

| Task | Status | File |
|------|--------|------|
| T-06.1 | **ALREADY DONE** (E-02 T-02.15) | `packages/shared/src/data/repositories/ArtistRepository.ts` |
| T-06.2 | **ALREADY DONE** (E-02 T-02.15) | `packages/shared/src/data/repositories/SongRepository.ts` |
| T-06.3 | **ALREADY DONE** (E-02 T-02.15) | `packages/shared/src/data/repositories/SongArtistRepository.ts` |
| T-06.4 | **THIS SPEC** | `packages/shared/src/application/duplicate/SongDuplicateDetector.ts` |
| T-06.5 | **THIS SPEC** | `packages/shared/src/application/duplicate/__tests__/SongDuplicateDetector.test.ts` |
| T-06.6 | **ALREADY DONE** | `packages/shared/src/data/repositories/__tests__/SongRepository.test.ts` |
| T-06.7 | **ALREADY DONE** | `packages/shared/src/data/repositories/__tests__/ArtistRepository.test.ts` |
| T-06.8 | **THIS SPEC** | `packages/renderer/src/categories/songs/SongsCategory.ts` |

Three new files. Five files already complete from prior epics.

---

## 3. Out of Scope

- Song creation/editing UI (CreateForm, EditForm) — those are E-07 (Songs UI). Placeholder components are provided in `SongsCategory`.
- Song detail view — E-07.
- Table view rendering — E-15 (UI Shell).
- Tile view — E-15.
- Search/filter engine — E-08.
- Sync integration — E-10.
- Trash screen — E-12.
- Conflict resolution — E-10.
- Artist autocomplete — E-07.
- Language picker — E-07.
- Registration of `SongsCategory` in app entry points — the definition module exists; actual registration call is a one-liner in `apps/*/src/index.tsx` (or `di.ts`). The spec documents where but does NOT modify those files (deferred to E-07/E-15 when the UI shell exists to host navigation).

---

## 4. Files To Create

| # | File | Package |
|---|------|---------|
| 1 | `packages/shared/src/application/duplicate/SongDuplicateDetector.ts` | `@collectio/shared` |
| 2 | `packages/shared/src/application/duplicate/__tests__/SongDuplicateDetector.test.ts` | `@collectio/shared` |
| 3 | `packages/renderer/src/categories/songs/SongsCategory.ts` | `@collectio/renderer` |
| 4 | `packages/renderer/src/categories/songs/index.ts` | `@collectio/renderer` |

---

## 5. Files To Modify

| # | File | Change |
|---|------|--------|
| 1 | `packages/shared/src/application/index.ts` | Add `export { SongDuplicateDetector } from './duplicate/SongDuplicateDetector.js'` |
| 2 | `packages/shared/src/index.ts` | Add `export { SongDuplicateDetector } from './application/duplicate/SongDuplicateDetector.js'` (class export, not type-only) |

---

## 6. Interfaces

### 6.1 `SongDuplicateDetector`

**Existing types consumed (no redefinition):**
- `DuplicateCheckResult` — already defined in `packages/shared/src/domain/interfaces/CategoryDefinition.ts:38`
- `DatabaseConnection` — already defined in `packages/shared/src/data/database/DatabaseConnection.ts`
- `SongRepository` — already defined in `packages/shared/src/data/repositories/SongRepository.ts`
- `SongArtistRepository` — already defined in `packages/shared/src/data/repositories/SongArtistRepository.ts`
- `CreateSongInput` — already defined in `packages/shared/src/domain/models/Song.ts:11`
- `SongWithArtists` — already defined in `packages/shared/src/domain/models/Song.ts:29`

**New constructor dependency:**

```
SongDuplicateDetector(db: DatabaseConnection)
```

The constructor receives `DatabaseConnection` and instantiates `SongRepository` and `SongArtistRepository` internally. The public method is:

```
checkForDuplicates(candidate: { name: string; artistIds: string[] }): Promise<DuplicateCheckResult[]>
```

**`candidate` parameter shape (inline, not a named type):**
- `name: string` — the song name to check for duplicates
- `artistIds: string[]` — UUID strings of the candidate's artists

**Return value:** `Promise<DuplicateCheckResult[]>` — empty array means no duplicates found.

### 6.2 `SongsCategory`

Implements the `CategoryDefinition` interface (already defined in `packages/shared/src/domain/interfaces/CategoryDefinition.ts:59`).

All fields of `CategoryDefinition` must be populated:

| Field | Value |
|-------|-------|
| `id` | `"songs"` |
| `displayName` | `"Songs"` |
| `iconName` | `"music-note"` |
| `migrations` | `[{ version: 2, sql: "..." }]` — the content of `002_songs_category.sql`. Import via Vite `?raw` or read as literal. |
| `repositories` | `{ SongRepository, ArtistRepository, SongArtistRepository }` — the class constructors, not instances |
| `tableColumns` | See §A.2 below |
| `searchFields` | `["name", "album_name"]` |
| `filterFields` | See §A.3 below |
| `createForm` | Placeholder `FC` — renders `null` or a message: "Create form not yet implemented" |
| `editForm` | Placeholder `FC` — renders `null` or a message: "Edit form not yet implemented" |
| `detailView` | Placeholder `FC` — renders `null` or a message: "Detail view not yet implemented" |
| `duplicateDetector` | A bound function: `(candidate: unknown) => { ... }` that instantiates `SongDuplicateDetector` with a `DatabaseConnection` and calls `checkForDuplicates`. The `candidate` parameter is cast internally to `{ name: string; artistIds: string[] }`. |

**Critical design decision:** `SongsCategory` does NOT instantiate `DatabaseConnection` — it is a static definition module. The `duplicateDetector` function must receive `DatabaseConnection` at call time. This means `SongsCategory` is NOT self-contained for the duplicate detector field. See §12 for the resolution.

---

## 7. Data Flow

### 7.1 Duplicate Detection Flow

```
User submits "Create Song" form
  │
  ▼
Caller (CreateSongDialog, E-07) invokes SongsCategory.duplicateDetector(candidate)
  │
  ▼
SongDuplicateDetector.checkForDuplicates({ name, artistIds })
  │
  ├─ 1. Normalize candidate name (4-step pipeline)
  │     NFC → lowercase → trim → collapse whitespace
  │
  ├─ 2. Query all active song names via SongRepository.findAll()
  │     Normalize each stored name using the same pipeline
  │     Collect songs where normalized name === normalized candidate name
  │
  ├─ 3. For each name-matched song:
  │     └─ Retrieve artist set via SongArtistRepository.findBySongId(songId)
  │        Compare candidate artistIds with stored artistIds
  │        ├─ Exact match → Scenario A (exact duplicate)
  │        └─ Any difference → Scenario B (partial overlap)
  │
  └─ 4. Return DuplicateCheckResult[] (empty if no matches)
```

### 7.2 Category Registration Flow

```
App Entry (apps/electron/src/renderer.tsx or apps/capacitor/src/index.tsx)
  │
  ├─ import { SongsCategory } from '@collectio/renderer/categories/songs'
  ├─ import { CategoryRegistry } from '@collectio/shared'
  │
  └─ CategoryRegistry.register(SongsCategory)   ← runs once before <App/> renders
```

Registration occurs BEFORE the React tree mounts. This is a synchronous one-liner.

---

## 8. State Changes

**NONE.** The duplicate detector is a pure query pattern — it reads from the database, normalizes strings in memory, and returns results. No writes. No mutations. No state management.

`SongsCategory` is a frozen module-level constant (`const SongsCategory: CategoryDefinition = { ... }`). It is never mutated after definition.

---

## 9. Database Changes

**NONE.** Tables `songs`, `artists`, `song_artists` already exist (migration 002). The duplicate detector reads from these tables (SELECT only). The repositories (`SongRepository`, `SongArtistRepository`) are already implemented and tested.

---

## 10. Error Handling

| Scenario | Behavior |
|----------|----------|
| `checkForDuplicates` called with empty `name` string | Return `[]` immediately — no database query |
| `checkForDuplicates` called with `artistIds: []` (no artists) | Only name-based comparison; any name match returns Scenario A |
| Database read fails (connection error) | Let the error propagate — caller (E-07 dialog) handles the Promise rejection |
| Normalization encounters invalid Unicode | `String.prototype.normalize('NFC')` handles all valid strings; invalid lone surrogates produce replacement characters (U+FFFD) — safe |
| No songs exist in database | `SongRepository.findAll()` returns `[]` → duplicate detector returns `[]` |

The duplicate detector does NOT catch database errors. The caller (E-07 dialog) wraps the call in try/catch and shows a user-facing error. This follows the repository pattern — repositories throw on failure, callers handle.

---

## 11. Logging Requirements

**NONE.** The duplicate detector performs string normalization and database reads. There are no fallible async operations beyond standard database queries (which repositories already handle). No logging is required for V1.

---

## 12. Security Requirements

**NONE.** The duplicate detector handles song names and artist IDs — no credentials, no tokens, no PII. SQL queries use parameterized placeholders (`?`) through existing repositories, which already enforce this.

---

## 13. Acceptance Criteria

| # | Criterion | Verifies |
|---|-----------|----------|
| AC-01 | `SongDuplicateDetector` exports a class with constructor `(db: DatabaseConnection)` and method `checkForDuplicates(candidate) -> Promise<DuplicateCheckResult[]>` | T-06.4 interface contract |
| AC-02 | Normalization pipeline produces correct output for NFC, lowercase, trim, collapse whitespace | T-06.4 normalization |
| AC-03 | Songs with same normalized name + same artist IDs return `type: 'exact'` | Scenario A |
| AC-04 | Songs with same normalized name + different/overlapping artist IDs return `type: 'partial'` | Scenario B |
| AC-05 | Songs with different normalized names return empty array | No false positives |
| AC-06 | Empty candidate name returns `[]` without querying database | Edge case |
| AC-07 | `SongsCategory` is a `const` module export implementing `CategoryDefinition` | T-06.8 |
| AC-08 | `SongsCategory.id === "songs"`, `displayName === "Songs"`, `iconName === "music-note"` | Category metadata |
| AC-09 | `SongsCategory.searchFields` is `["name", "album_name"]` | Search configuration |
| AC-10 | `SongsCategory.tableColumns` has 6 entries (checkbox, name, artists, album, language, date added) | Table configuration |
| AC-11 | `SongsCategory.repositories` includes `SongRepository`, `ArtistRepository`, `SongArtistRepository` constructors | Repository map |
| AC-12 | `SongsCategory.createForm`, `editForm`, `detailView` are valid `React.FC` components (placeholders acceptable) | Interface compliance |
| AC-13 | `SongsCategory.duplicateDetector` is a function matching the `CategoryDefinition` signature | Detector wiring |
| AC-14 | Duplicate detection unit tests pass with ≥80% coverage on `SongDuplicateDetector.ts` | T-06.5 |
| AC-15 | All existing tests continue to pass (`pnpm --filter @collectio/shared test`) | No regressions |
| AC-16 | `pnpm typecheck` passes with zero errors across all 5 workspace packages | Type safety |
| AC-17 | `pnpm lint` passes with zero errors on `packages/shared/` and `packages/renderer/` | Code quality |

---

## 14. Test Cases

### 14.1 SongDuplicateDetector Unit Tests

**File:** `packages/shared/src/application/duplicate/__tests__/SongDuplicateDetector.test.ts`

**Test environment:** Node (`testEnvironment: "node"`) — no React, no DOM. Mock `DatabaseConnection` using the same pattern as existing repository tests (createMockDb factory).

| # | Test | Mock Setup | Expected |
|---|------|------------|----------|
| DUP-01 | `checkForDuplicates({ name: "", artistIds: [] })` | Any db | Returns `[]` — no DB calls |
| DUP-02 | Normalization: NFC composed form | queryResult: `[{ name: "café" }]` | `checkForDuplicates({ name: "cafe\u0301", ... })` matches |
| DUP-03 | Normalization: lowercase | queryResult: `[{ name: "Test Song" }]` | `checkForDuplicates({ name: "TEST SONG", ... })` matches |
| DUP-04 | Normalization: trim whitespace | queryResult: `[{ name: "Hello" }]` | `checkForDuplicates({ name: "  Hello  ", ... })` matches |
| DUP-05 | Normalization: collapse internal whitespace | queryResult: `[{ name: "Hello World" }]` | `checkForDuplicates({ name: "Hello   World", ... })` matches |
| DUP-06 | Combined normalization | queryResult: `[{ name: "café au lait" }]` | `checkForDuplicates({ name: "  CAFÉ   AU  LAIT  ", ... })` matches |
| DUP-07 | Scenario A: exact name + exact artist set | queryResult: name match; artist IDs: `["a1", "a2"]` | Returns `[{ type: "exact", ... }]` |
| DUP-08 | Scenario B: exact name + different artists | queryResult: name match; artist IDs: `["a1"]` vs candidate `["a2"]` | Returns `[{ type: "partial", ... }]` |
| DUP-09 | Scenario B: exact name + overlapping artists | queryResult: name match; artist IDs: `["a1", "a2"]` vs candidate `["a1", "a3"]` | Returns `[{ type: "partial", ... }]` |
| DUP-10 | No match: different name | queryResult: `[{ name: "Other Song" }]` | Returns `[]` |
| DUP-11 | No match: no songs in database | queryResult: `[]` | Returns `[]` |
| DUP-12 | Multiple matches: two songs with same normalized name | queryResult: 2 name-matched songs | Returns 2 results |
| DUP-13 | Candidate with no artists matches song with artists (Scenario B) | queryResult: name match; artist IDs: `["a1"]` vs candidate: `[]` | Returns `[{ type: "partial", ... }]` |
| DUP-14 | Candidate with no artists matches song with no artists (Scenario A) | queryResult: name match; artist IDs: `[]` both sides | Returns `[{ type: "exact", ... }]` |
| DUP-15 | Normalization handles non-ASCII Unicode strings | queryResult: `[{ name: "日本語" }]` | `checkForDuplicates({ name: "日本語", ... })` matches |
| DUP-16 | Normalization handles emoji strings | queryResult: `[{ name: "🎵" }]` | `checkForDuplicates({ name: "🎵", ... })` matches |
| DUP-17 | Does not query database when candidate name is empty | queryResult: (any) | `query` mock is NOT called; returns `[]` |
| DUP-18 | `resolutionOptions` in Scenario A contains expected strings | queryResult: exact match | `resolutionOptions` includes `"Overwrite Existing"` and `"Skip Creation"` |
| DUP-19 | `resolutionOptions` in Scenario B contains expected strings | queryResult: partial match | `resolutionOptions` includes `"Merge Artists onto Existing Song"` and `"Create Separate Entry"` |
| DUP-20 | Database error propagates | query mock rejects with `new Error("DB error")` | `checkForDuplicates` rejects with the same error |

### 14.2 SongsCategory Definition Tests

**No separate test file needed.** The definition module is validated by:
- `pnpm typecheck` — verifies `SongsCategory` satisfies `CategoryDefinition`
- `pnpm --filter @collectio/shared test` — existing `CategoryRegistry` tests (REG-01 through REG-11) verify registration works
- A future E-07 or E-16 integration test will verify `CategoryRegistry.register(SongsCategory)` succeeds

---

## 15. Definition of Done

Per `PROJECT_CONSTITUTION.md` Section 26 (Task-Level DoD):

1. **Implemented:** All 3 remaining tasks (T-06.4, T-06.5, T-06.8) complete per this specification.
2. **Self-reviewed:** Diff reviewed for:
   - No hardcoded SQL — all queries through existing repositories
   - No platform conditionals — pure TypeScript
   - Correct export paths (`.js` extension for ESM)
   - Placeholder React components are valid `FC` types
3. **Tested:** DUP-01 through DUP-20 pass. Existing tests pass.
4. **Platform verified:** `pnpm typecheck` across all 5 packages passes. No platform code in new files.
5. **No new lint errors:** `pnpm lint` passes on shared and renderer packages.
6. **No hardcoded data:** Song name normalization constants, resolution option strings, column definitions — all defined once, exported, never duplicated.

### Gate Commands

```
pnpm --filter @collectio/shared typecheck
pnpm --filter @collectio/renderer typecheck
pnpm --filter @collectio/shared lint
pnpm --filter @collectio/renderer lint
pnpm --filter @collectio/shared test
pnpm typecheck            # all 5 workspace packages
```

---

## Appendix A: SongsCategory Field Details

### A.1 `migrations`

The `SongsCategory.migrations` field references migration 002 (songs category tables). Two approaches:

**Approach 1 (recommended):** Import the raw SQL content at build time using Vite `?raw`:
```typescript
import migration002Sql from '../../../../packages/shared/src/data/database/migrations/002_songs_category.sql?raw';
```
Requires `raw-modules.d.ts` in the renderer package (already exists in `apps/capacitor/src/`, must also exist in `packages/renderer/src/` if import happens there).

**Approach 2:** Reference migration by metadata only (`{ version: 2, sql: "" }`) since the actual migration is already executed by the DI layer before the app renders. The `migrations` field on `CategoryDefinition` is informational — the DI files already load and execute the real SQL.

**Decision: Approach 1.** Use `?raw` import. If the renderer Vite config doesn't handle `?raw`, add to `packages/renderer/vite.config.ts` (Vite handles `?raw` natively). Create `packages/renderer/src/raw-modules.d.ts` with:
```typescript
declare module '*?raw' {
  const content: string;
  export default content;
}
```

### A.2 `tableColumns` (6 columns)

| key | label | sortable | filterable | flex | fixedWidth |
|-----|-------|----------|------------|------|------------|
| `selection` | `""` | `false` | `false` | `0` | `48` |
| `name` | `"Song Name"` | `true` | `true` | `3` | — |
| `artists` | `"Artist(s)"` | `true` | `true` | `2` | — |
| `album_name` | `"Album"` | `true` | `true` | `2` | — |
| `language_id` | `"Language"` | `true` | `true` | `1` | `120` |
| `added_at` | `"Date Added"` | `true` | `false` | `1` | `140` |

Source: `PROJECT_CONSTITUTION.md` §18.2 and §02_DATABASE_SCHEMA.md §5.

### A.3 `filterFields` (4 filters)

| key | label | sourceField |
|-----|-------|-------------|
| `name` | `"Song Name"` | `name` |
| `artists` | `"Artist(s)"` | `display_name` |
| `album_name` | `"Album"` | `album_name` |
| `language_id` | `"Language"` | `name` |

Note: `language_id` filter's `sourceField` is `"name"` from the `languages` table (the display name), not the numeric ID. This is an exception — the filter UI shows language names, not IDs.

### A.4 Placeholder React Components

Each placeholder must satisfy the `React.FC` contract in `CategoryDefinition`. Minimal valid placeholder:

```typescript
const PlaceholderCreateForm: FC<{ onSave: (item: unknown) => void; onCancel: () => void }> = () => null;
const PlaceholderEditForm: FC<{ item: unknown; onSave: (item: unknown) => void; onCancel: () => void }> = () => null;
const PlaceholderDetailView: FC<{ item: unknown; onClose: () => void }> = () => null;
```

These render nothing (`null`) and are replaced by real components in E-07. They exist solely to satisfy the `CategoryDefinition` type contract.

### A.5 `duplicateDetector` Wiring

The `CategoryDefinition.duplicateDetector` field is typed as `(candidate: unknown) => Promise<DuplicateCheckResult[]>`. It does NOT receive `DatabaseConnection` as a parameter. This creates a wiring challenge: the `SongDuplicateDetector` class needs `db` in its constructor.

**Resolution:** `SongsCategory` is a module-level constant. The `duplicateDetector` function is defined as a wrapper that:
1. Receives `candidate: unknown`
2. Gets `DatabaseConnection` from... where?

Options:
- **A:** Accept `db` as a factory parameter: `export function createSongsCategory(db: DatabaseConnection): CategoryDefinition` — but the epic spec says `SongsCategory` is the module export, not a factory.
- **B:** `duplicateDetector` throws if no `db` is configured — requires a `setDb()` call before use. Brittle.
- **C:** `duplicateDetector` is a lazily-initialized closure that captures `db` from the module scope. Set via `SongsCategory.setDb(db)` before registration. This keeps the module export constant but requires a setup call.

**Decision: Option C.** Add an internal `let _db: DatabaseConnection | null = null` to the `SongsCategory` module. Export `SongsCategory.configure(db: DatabaseConnection): void` (called once at app startup). The `duplicateDetector` closure reads `_db` — if null at call time, throws a descriptive error. The `SongsCategory` constant itself is the `CategoryDefinition` object, with the closure bound to `_db`.

This keeps the module export as a `const SongsCategory: CategoryDefinition` while allowing database injection. The configure-then-register pattern is: `SongsCategory.configure(db); CategoryRegistry.register(SongsCategory);`

---

## Appendix B: File Details

### B.1 `packages/shared/src/application/duplicate/SongDuplicateDetector.ts`

- **Purpose:** Detect potential duplicate songs before creation, per Constitution §14.4.
- **Responsibility:** Normalize song names (NFC → lowercase → trim → collapse whitespace), compare against existing songs, classify matches as Scenario A (exact) or Scenario B (partial), return `DuplicateCheckResult[]`.
- **Public API:**
  - `class SongDuplicateDetector`
  - `constructor(db: DatabaseConnection)` — stores db; instantiates `SongRepository` and `SongArtistRepository` internally
  - `checkForDuplicates(candidate: { name: string; artistIds: string[] }): Promise<DuplicateCheckResult[]>` — main entry point

### B.2 `packages/shared/src/application/duplicate/__tests__/SongDuplicateDetector.test.ts`

- **Purpose:** Unit tests for the `SongDuplicateDetector` class.
- **Responsibility:** Cover normalization pipeline (6 test cases), Scenario A/B classification (4 test cases), edge cases (empty name, no matches, error propagation, Unicode/emoji), resolution options content.
- **Public API:** None (test file). Tests DUP-01 through DUP-20.

### B.3 `packages/renderer/src/categories/songs/SongsCategory.ts`

- **Purpose:** The concrete `CategoryDefinition` implementation for the Songs category — the first category registered in the application.
- **Responsibility:** Export a `const SongsCategory: CategoryDefinition` with all fields populated. Provide `configure(db: DatabaseConnection): void` for dependency injection. Export placeholder React components for create/edit/detail forms.
- **Public API:**
  - `SongsCategory: CategoryDefinition` — the frozen definition object
  - `SongsCategory.configure(db: DatabaseConnection): void` — inject database connection before use

### B.4 `packages/renderer/src/categories/songs/index.ts`

- **Purpose:** Barrel re-export for the songs category module.
- **Responsibility:** `export { SongsCategory } from './SongsCategory.js'`
- **Public API:** Re-exports `SongsCategory`.

---

## Appendix C: Barrel Export Checklist

| Barrel File | Must Export |
|-------------|-------------|
| `packages/shared/src/application/index.ts` | Add `export { SongDuplicateDetector } from './duplicate/SongDuplicateDetector.js'` |
| `packages/shared/src/index.ts` | Add `export { SongDuplicateDetector } from './application/duplicate/SongDuplicateDetector.js'` |

No changes needed to domain interfaces barrel — `DuplicateCheckResult` is already exported via `CategoryDefinition.ts` re-export chain.

---

## Appendix D: Key Design Decisions

### DD-01: Duplicate detector is a class, not a module-level function

The `SongDuplicateDetector` class pattern follows the existing codebase convention (repositories, MigrationRunner). Constructor injection of `DatabaseConnection` enables testing with mocks. The class creates its own `SongRepository` and `SongArtistRepository` instances internally — callers never see them.

### DD-02: Normalization is a private static method

The 4-step normalization pipeline is a private static method on `SongDuplicateDetector`. It is tested indirectly through `checkForDuplicates` results (DUP-02 through DUP-06). No separate export — normalization is never consumed outside the detector.

### DD-03: `SongsCategory.configure()` pattern

The `CategoryDefinition.duplicateDetector` signature does not accept `db`. Rather than making `SongsCategory` a factory function (which changes the export shape from the epic spec), a `configure()` call sets an internal module-level `_db` variable. The closure in `duplicateDetector` reads it. This keeps the module export as a `const` while enabling DI.

### DD-04: Resolution options are string constants

Per FR-DUP-02 and FR-DUP-03:
- Scenario A: `["Overwrite Existing", "Skip Creation"]`
- Scenario B: `["Merge Artists onto Existing Song", "Create Separate Entry"]`

These strings are defined as `const` arrays in the detector module. The E-07 dialog will use them to render buttons — no coupling between the detector and the UI.

### DD-05: Repositories, not raw SQL

The duplicate detector uses `SongRepository.findAll()` and `SongArtistRepository.findBySongId()` — never raw SQL. This reuses existing tested code and keeps SQL in one place. A consequence: `findAll()` loads all active songs into memory. At 10,000 songs with slim `Song` objects (6 fields), this is ~2-3MB — acceptable for V1 per NFR-PERF-01.

### DD-06: `SongsCategory` exports, not `default`

Following the codebase convention (named exports, no `export default`), `SongsCategory` is a named export. The barrel `index.ts` re-exports it.

---

_End of Implementation Specification_
