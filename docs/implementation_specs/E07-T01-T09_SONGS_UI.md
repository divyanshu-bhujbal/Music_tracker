# E07 T01–T09: Songs Category — UI — Implementation Specification

> **Source epic:** [E-07_SONGS_UI.md](../epics/E-07_SONGS_UI.md)
> **Prerequisites:** E-06 (Songs Data) — COMPLETE; E-15 (UI Shell) — NOT STARTED
> **Blocks:** E-08 (Search & Filter), E-12 (Trash & Recovery)
> **Platform impact:** NONE — pure React + MUI. All dialogs are self-contained.

---

## 1. Goal

Implement the Songs category UI layer: create/edit/detail dialogs, artist autocomplete, language picker, duplicate detection dialog, and the `useSongsStore` Zustand+TanStack Query store. Replace the placeholder React components in `SongsCategory` with real implementations. All UI uses Material UI (MUI).

---

## 2. Scope

| Task | Summary |
|------|---------|
| T-07.1 | `SongCreateDialog` — form with song name, artist autocomplete, language picker, album name. Validates required fields. Calls duplicate detector before save. |
| T-07.2 | `SongEditDialog` — same form pre-populated with existing song data. `added_at` is read-only (FR-SONG-03). |
| T-07.3 | `SongDetailDialog` — read-only view of all fields including Date Added. Actions: Edit (opens EditDialog), Delete (soft-delete), Close. |
| T-07.4 | `ArtistAutocomplete` — MUI `Autocomplete` with `freeSolo`. Loads existing artists. "Create 'X'" option for inline artist creation (FR-ARTIST-03). Multi-select. |
| T-07.5 | `LanguagePicker` — MUI `Autocomplete` with `freeSolo={false}`. Loads all languages from the reference table. Single-select. User-added languages are visually flagged (FR-LANG-03). |
| T-07.6 | Duplicate detection integration — embedded in `SongCreateDialog` save handler. Calls `SongsCategory.duplicateDetector()`. Opens `DuplicateDetectionDialog` if matches found. |
| T-07.7 | `DuplicateDetectionDialog` — presents matched songs with Scenario A (exact) or Scenario B (partial) resolution options. User picks per match (FR-DUP-05). |
| T-07.8 | `useSongsStore` — Zustand store with TanStack Query for songs/artists/languages CRUD. Exposes: `useSongs()`, `useArtists()`, `useLanguages()`, `useCreateSong()`, `useUpdateSong()`, `useDeleteSong()`, `useCreateArtist()`. |
| T-07.9 | Component tests for all dialogs using `@testing-library/react`. |

---

## 3. Out of Scope

- Table View / Tile View — E-15 (UI Shell)
- Sidebar / CategoryNav / MainLayout — E-15
- Navigation / routing — E-15
- Platform-specific adaptations (context menu, keyboard shortcuts, touch targets) — E-15
- Search and filter engine — E-08
- Trash screen / restore — E-12
- Bulk delete — E-15 (selection mode)
- Sync integration — E-10
- App entry wiring (registering `SongsCategory`, configuring store) — deferred to E-15 integration pass
- Artist detail/edit screens (artists have no dedicated management UI in V1 — managed inline via autocomplete)

---

## 4. Files To Create

| # | File | Package |
|---|------|---------|
| 1 | `packages/renderer/src/categories/songs/components/SongCreateDialog.tsx` | `@collectio/renderer` |
| 2 | `packages/renderer/src/categories/songs/components/SongEditDialog.tsx` | `@collectio/renderer` |
| 3 | `packages/renderer/src/categories/songs/components/SongDetailDialog.tsx` | `@collectio/renderer` |
| 4 | `packages/renderer/src/categories/songs/components/ArtistAutocomplete.tsx` | `@collectio/renderer` |
| 5 | `packages/renderer/src/categories/songs/components/LanguagePicker.tsx` | `@collectio/renderer` |
| 6 | `packages/renderer/src/categories/songs/components/DuplicateDetectionDialog.tsx` | `@collectio/renderer` |
| 7 | `packages/renderer/src/categories/songs/components/index.ts` | `@collectio/renderer` |
| 8 | `packages/renderer/src/categories/songs/store/useSongsStore.ts` | `@collectio/renderer` |
| 9 | `packages/renderer/src/categories/songs/store/index.ts` | `@collectio/renderer` |
| 10 | `packages/renderer/src/categories/songs/components/__tests__/SongCreateDialog.test.tsx` | `@collectio/renderer` |
| 11 | `packages/renderer/src/categories/songs/components/__tests__/SongEditDialog.test.tsx` | `@collectio/renderer` |
| 12 | `packages/renderer/src/categories/songs/components/__tests__/SongDetailDialog.test.tsx` | `@collectio/renderer` |
| 13 | `packages/renderer/src/categories/songs/components/__tests__/ArtistAutocomplete.test.tsx` | `@collectio/renderer` |
| 14 | `packages/renderer/src/categories/songs/components/__tests__/LanguagePicker.test.tsx` | `@collectio/renderer` |
| 15 | `packages/renderer/src/categories/songs/components/__tests__/DuplicateDetectionDialog.test.tsx` | `@collectio/renderer` |
| 16 | `packages/renderer/src/categories/songs/store/__tests__/useSongsStore.test.ts` | `@collectio/renderer` |

---

## 5. Files To Modify

| # | File | Change |
|---|------|--------|
| 1 | `packages/renderer/src/categories/songs/SongsCategory.ts` | Replace `PlaceholderCreateForm`, `PlaceholderEditForm`, `PlaceholderDetailView` with `SongCreateDialog`, `SongEditDialog`, `SongDetailDialog` imports |
| 2 | `packages/renderer/src/categories/songs/index.ts` | Add re-exports for all new components and store |

---

## 6. Interfaces

### 6.1 Store Interface (`useSongsStore`)

The store is a module-level Zustand store created via `create()`. It uses TanStack Query (`useQuery`, `useMutation`) internally and exposes hooks. Before first use, `configure(db: DatabaseConnection)` must be called — same pattern as `SongsCategory.configure()`.

**Public hooks:**

```
useSongs(): { data: SongWithArtists[]; isLoading: boolean; error: Error | null }
useArtists(query?: string): { data: Artist[]; isLoading: boolean }
useLanguages(): { data: Language[]; isLoading: boolean }
useCreateSong(): { mutateAsync: (input: CreateSongInput & { artistIds: string[] }) => Promise<Song>; isPending: boolean }
useUpdateSong(): { mutateAsync: (id: string, input: UpdateSongInput & { artistIds: string[] }) => Promise<void>; isPending: boolean }
useDeleteSong(): { mutateAsync: (id: string) => Promise<void>; isPending: boolean }
useRestoreSong(): { mutateAsync: (id: string) => Promise<void>; isPending: boolean }
useCreateArtist(): { mutateAsync: (displayName: string) => Promise<Artist>; isPending: boolean }
```

**Non-hook exports:**

```
configureSongsStore(db: DatabaseConnection): void
```

TanStack Query caches are invalidated on mutations to keep list views consistent.

### 6.2 Dialog Props

All dialogs follow the existing `CategoryDefinition` prop contracts plus additional internal props for the DI container.

**`SongCreateDialog`**

```
Props:
  open: boolean
  onSave: (item: unknown) => void   // CategoryDefinition contract
  onCancel: () => void              // CategoryDefinition contract
  db: DatabaseConnection            // injected from ServiceProvider context
```

**`SongEditDialog`**

```
Props:
  open: boolean
  item: unknown                     // CategoryDefinition contract — cast to SongWithArtists internally
  onSave: (item: unknown) => void   // CategoryDefinition contract
  onCancel: () => void              // CategoryDefinition contract
  db: DatabaseConnection
```

**`SongDetailDialog`**

```
Props:
  open: boolean
  item: unknown                     // CategoryDefinition contract — cast to SongWithArtists internally
  onClose: () => void               // CategoryDefinition contract
  onEdit: (item: unknown) => void   // Opens EditDialog
  onDelete: (id: string) => void    // Soft-deletes and closes
```

**`ArtistAutocomplete`**

```
Props:
  value: Artist[]                   // currently selected artists
  onChange: (artists: Artist[]) => void
  db: DatabaseConnection
```

**`LanguagePicker`**

```
Props:
  value: Language | null            // currently selected language
  onChange: (language: Language | null) => void
  db: DatabaseConnection
```

**`DuplicateDetectionDialog`**

```
Props:
  open: boolean
  results: DuplicateCheckResult[]   // from SongDuplicateDetector
  onResolve: (actions: DuplicateResolution[]) => void  // user's choices per match
  onCancel: () => void              // back to create dialog, song not saved
```

`DuplicateResolution` (new inline type):
```
{ existingSongId: string; action: 'overwrite' | 'skip' | 'merge' | 'create-separate' }
```

### 6.3 Types Already Defined (Do Not Redefine)

- `DatabaseConnection` — `@collectio/shared`
- `Song`, `CreateSongInput`, `UpdateSongInput`, `SongWithArtists`, `SongArtistWithName` — `@collectio/shared`
- `Artist` — `@collectio/shared`
- `Language` — `@collectio/shared`
- `DuplicateCheckResult` — `@collectio/shared`
- `CategoryDefinition` — `@collectio/shared`
- `SongRepository`, `ArtistRepository`, `SongArtistRepository`, `LanguageRepository` — `@collectio/shared`

---

## 7. Data Flow

### 7.1 Create Song Flow

```
User clicks "New Song" (E-15)
  │
  ▼
SongCreateDialog opens (open=true)
  │
  ├─ User fills in: song name (TextField), album (TextField)
  ├─ User selects language via LanguagePicker
  │   └─ LanguagePicker queries LanguageRepository.findAll() (debounced)
  │
  ├─ User adds artists via ArtistAutocomplete
  │   ├─ Types → ArtistRepository.search() (debounced, 300ms)
  │   ├─ Selects existing artist → added to chip list
  │   └─ Types new name → "Create 'X'" option
  │       └─ On select: ArtistRepository.create(displayName) → returns Artist → added to chip list
  │
  ├─ User clicks "Save"
  │   ├─ Validate: name non-empty, ≥1 artist, language selected
  │   │   └─ FAIL → show inline validation errors, stay in dialog
  │   │
  │   ├─ Collect artist IDs from selected artists
  │   ├─ Call SongsCategory.duplicateDetector({ name, artistIds })
  │   │   ├─ Returns [] → proceed to save
  │   │   └─ Returns matches → open DuplicateDetectionDialog
  │   │       ├─ User resolves each match (overwrite/skip/merge/create-separate)
  │   │       ├─ User clicks "Apply" → actions returned to create dialog
  │   │       │   ├─ 'overwrite' → SongRepository.update(existingId, input)
  │   │       │   ├─ 'skip' → do nothing for that match
  │   │       │   ├─ 'merge' → SongArtistRepository.add(existingId, artistId) for each new artist
  │   │       │   └─ 'create-separate' → SongRepository.create(input) + SongArtistRepository.add() for each artist
  │   │       └─ User clicks "Cancel" → back to create dialog
  │   │
  │   └─ SongRepository.create(input) + SongArtistRepository.add() for each artist
  │       └─ Invalidate TanStack Query cache for songs list
  │
  └─ onSave(item) called → CategoryDefinition contract fulfilled → dialog closes
```

### 7.2 Edit Song Flow

```
User opens edit dialog (from DetailDialog or context menu, E-15)
  │
  ▼
SongEditDialog opens with item pre-populated
  │
  ├─ Fields populated: name, album_name, language (via LanguagePicker), artists (via ArtistAutocomplete)
  ├─ added_at displayed as read-only Typography (FR-SONG-03)
  │
  ├─ User modifies fields
  ├─ User clicks "Save"
  │   ├─ Validate: name non-empty, ≥1 artist, language selected
  │   │   └─ FAIL → show inline validation errors
  │   ├─ SongRepository.update(id, input)
  │   ├─ Compare old artist set vs new artist set
  │   │   ├─ Removed artists → SongArtistRepository.remove(songId, artistId)
  │   │   └─ Added artists → SongArtistRepository.add(songId, artistId, sortOrder)
  │   └─ Invalidate TanStack Query cache
  │
  └─ onSave(item) called → dialog closes
```

### 7.3 Detail Dialog Flow

```
User clicks row in table (E-15)
  │
  ▼
SongDetailDialog opens
  │
  ├─ Displays: song name, album, language (name), artists (chips), Date Added
  ├─ "Edit" button → onEdit(item) → caller opens SongEditDialog
  ├─ "Delete" button → confirmation → SongRepository.softDelete(id) → onClose()
  └─ "Close" button → onClose()
```

### 7.4 ArtistAutocomplete Data Flow

```
User types in ArtistAutocomplete
  │
  ├─ Debounce 300ms
  ├─ If input is empty → show all artists (first 50, use Autocomplete's built-in virtualization)
  ├─ If input has text → ArtistRepository.search(query) via useArtists(query)
  │
  ├─ Dropdown shows:
  │   ├─ Existing artists matching query (display_name)
  │   └─ If no exact match: "Create 'UserInput'" option
  │
  └─ User selects:
      ├─ Existing artist → Artist object added to selected array
      └─ "Create 'X'" → ArtistRepository.create(displayName) → new Artist added
```

### 7.5 Store Data Flow

```
useSongsStore.configure(db)
  │
  ▼
TanStack QueryClient (module-level, created once)
  │
  ├─ useSongs() → useQuery({ queryKey: ['songs'], queryFn: () => songRepo.findAll() })
  ├─ useArtists(query?) → useQuery({ queryKey: ['artists', query], queryFn: () => ... })
  ├─ useLanguages() → useQuery({ queryKey: ['languages'], queryFn: () => languageRepo.findAll() })
  │
  ├─ useCreateSong() → useMutation({ mutationFn: (input) => ..., onSuccess: () => queryClient.invalidateQueries(['songs']) })
  ├─ useUpdateSong() → useMutation({ mutationFn: (...) => ..., onSuccess: () => queryClient.invalidateQueries(['songs']) })
  ├─ useDeleteSong() → useMutation({ mutationFn: (id) => ..., onSuccess: () => queryClient.invalidateQueries(['songs']) })
  ├─ useRestoreSong() → useMutation({ mutationFn: (id) => ..., onSuccess: () => queryClient.invalidateQueries(['songs']) })
  └─ useCreateArtist() → useMutation({ mutationFn: (name) => ..., onSuccess: () => queryClient.invalidateQueries(['artists']) })
```

**Important:** TanStack Query requires a `QueryClientProvider` at the React tree root. This does NOT exist in the current `main.tsx`. The store's `useQuery`/`useMutation` hooks will fail at runtime without it. For E07 development and testing, the provider is added to individual test wrappers. Production wiring is done in E-15 (UI Shell) when the full app tree is assembled.

---

## 8. State Changes

### 8.1 Dialog State (local, per-instance)

| Dialog | Internal State |
|--------|---------------|
| `SongCreateDialog` | `name: string`, `album: string`, `artists: Artist[]`, `language: Language \| null`, `errors: Record<string, string>`, `isSaving: boolean`, `showDuplicateDialog: boolean`, `duplicateResults: DuplicateCheckResult[]` |
| `SongEditDialog` | Same as CreateDialog, plus `originalItem: SongWithArtists` and `isLoading: boolean` (fetch current data on open) |
| `SongDetailDialog` | `isDeleting: boolean`, `showDeleteConfirm: boolean` |
| `ArtistAutocomplete` | `inputValue: string`, `options: Artist[]`, `isLoading: boolean` |
| `LanguagePicker` | `inputValue: string`, `options: Language[]`, `isLoading: boolean` |
| `DuplicateDetectionDialog` | `resolutions: Map<string, DuplicateResolution>` (per existing song) |

### 8.2 Store State (module-level, TanStack Query cache)

- **Cache keys:** `['songs']`, `['artists', query?]`, `['languages']`
- **Cache invalidation:** On any mutation that changes a table, invalidate the relevant query key
- **Stale time:** 30 seconds (for artists/languages — rarely change). 0 for songs (always fetch fresh after mutation).
- **No Zustand-persisted state** — all state lives in the TanStack Query cache. Zustand is used only as the hook container, per the architecture's state management decision (lightweight, no boilerplate).

### 8.3 Module-Level Configuration

```
// Once at app startup:
configureSongsStore(db);        // Sets the DatabaseConnection
SongsCategory.configure(db);    // Already implemented in E06
CategoryRegistry.register(SongsCategory);
```

---

## 9. Database Changes

**NONE.**

All CRUD operations use existing repositories: `SongRepository`, `ArtistRepository`, `SongArtistRepository`, `LanguageRepository`. No schema changes. No new migrations. No new tables.

---

## 10. Error Handling

| Scenario | Component | Handling |
|----------|-----------|----------|
| Save with empty song name | CreateDialog / EditDialog | Inline error: "Song name is required." Save button stays enabled; error shown on click. |
| Save with no artists selected | CreateDialog / EditDialog | Inline error: "At least one artist is required." |
| Save with no language selected | CreateDialog / EditDialog | Inline error: "Language is required." |
| Database error during save | CreateDialog / EditDialog | `Snackbar` with error message. Dialog stays open. User can retry or cancel. |
| Database error during delete | DetailDialog | `Snackbar` with error message. Dialog stays open. |
| Database error loading artist list | ArtistAutocomplete | Show "Failed to load artists" message. Input still works (user can type). |
| Database error loading language list | LanguagePicker | Show "Failed to load languages" message. Picker disabled. |
| Duplicate detection DB error | CreateDialog | `Snackbar` with error. Offer "Save Anyway" and "Cancel" options. |
| `duplicateDetector` throws (no db configured) | CreateDialog | `Snackbar`: "Duplicate detection unavailable. Save anyway?" |
| Edit dialog opened with deleted song | EditDialog | Load song data on open; if `deleted_at` is set, show warning: "This item is in Trash. Edit to restore it." |
| Store hooks called before `configure()` | useSongsStore | Throw descriptive error: "Songs store not configured. Call configureSongsStore(db) first." |

No dialog should crash the app. All async errors are caught and surfaced as `Snackbar` messages or inline validation text.

---

## 11. Logging Requirements

**NONE.**

Dialogs and store handle user interactions and database operations. No logging is required for V1. Errors are surfaced to the user via `Snackbar` — not logged.

---

## 12. Security Requirements

- **SQL injection:** Not applicable — all database access goes through existing repositories which use parameterized queries (`?` placeholders).
- **XSS:** React + MUI escape all user-provided strings by default. No `dangerouslySetInnerHTML` is used.
- **No credential handling:** Dialogs never access `AuthProvider`, `CryptoProvider`, or `SecureStorageProvider`.
- **No token exposure:** The store holds a `DatabaseConnection` reference (already authenticated at connection open time) — no tokens in component state.

---

## 13. Acceptance Criteria

| # | Criterion | Verifies |
|---|-----------|----------|
| AC-01 | `SongCreateDialog` renders form with name, album, artist autocomplete, language picker | T-07.1 |
| AC-02 | `SongCreateDialog` validates required fields (name, ≥1 artist, language) and shows inline errors | T-07.1 validation |
| AC-03 | `SongCreateDialog` calls `SongsCategory.duplicateDetector()` before save | T-07.6 integration |
| AC-04 | `SongCreateDialog` opens `DuplicateDetectionDialog` when duplicates found | T-07.6/T-07.7 |
| AC-05 | `SongCreateDialog` saves song via `useCreateSong()` mutation when no duplicates or after resolution | T-07.1/T-07.8 |
| AC-06 | `SongCreateDialog` calls `onSave(item)` and closes on successful save | T-07.1 contract |
| AC-07 | `SongEditDialog` pre-populates all fields from existing song data | T-07.2 |
| AC-08 | `SongEditDialog` displays `added_at` as read-only text (FR-SONG-03) | T-07.2 |
| AC-09 | `SongEditDialog` calls `onSave(item)` with updated data on save | T-07.2 contract |
| AC-10 | `SongDetailDialog` displays all song fields including artists and language name | T-07.3 |
| AC-11 | `SongDetailDialog` has Edit, Delete, and Close actions | T-07.3 |
| AC-12 | `ArtistAutocomplete` loads existing artists and filters by input | T-07.4 / FR-ARTIST-02 |
| AC-13 | `ArtistAutocomplete` offers "Create 'X'" option for new artist names (FR-ARTIST-03) | T-07.4 |
| AC-14 | `ArtistAutocomplete` supports multi-select (FR-ARTIST-04) | T-07.4 |
| AC-15 | `LanguagePicker` loads all languages and filters by input (FR-LANG-02) | T-07.5 |
| AC-16 | `LanguagePicker` flags user-added languages visually (FR-LANG-03) | T-07.5 |
| AC-17 | `LanguagePicker` does not allow free-text entry (FR-LANG-04) | T-07.5 |
| AC-18 | `DuplicateDetectionDialog` shows matched songs with resolution options per Scenario A/B | T-07.7 / FR-DUP-02/03 |
| AC-19 | Duplicate resolution choices execute correct actions (overwrite, skip, merge, create-separate) | T-07.6 |
| AC-20 | User always makes the resolution choice — no auto-resolution (FR-DUP-05) | T-07.7 |
| AC-21 | `useSongsStore` exposes all listed hooks and mutations | T-07.8 |
| AC-22 | Store mutations invalidate TanStack Query cache on success | T-07.8 |
| AC-23 | All component tests pass with `@testing-library/react` | T-07.9 |
| AC-24 | `pnpm typecheck` passes with zero errors across all packages | Type safety |
| AC-25 | `pnpm lint` passes with zero errors on `packages/renderer/` | Code quality |
| AC-26 | No platform-specific imports in any new file | Architecture compliance |
| AC-27 | Existing shared tests continue to pass | No regressions |

---

## 14. Test Cases

### 14.1 SongCreateDialog Tests

**File:** `packages/renderer/src/categories/songs/components/__tests__/SongCreateDialog.test.tsx`

| # | Test | Expected |
|---|------|----------|
| CD-01 | Renders all form fields | Name TextField, Album TextField, ArtistAutocomplete, LanguagePicker, Cancel/Save buttons |
| CD-02 | Save with empty name shows error | "Song name is required" helper text on name field |
| CD-03 | Save with no artists shows error | "At least one artist is required" message |
| CD-04 | Save with no language shows error | "Language is required" message |
| CD-05 | Save with valid data calls onSave | onSave mock called with song data |
| CD-06 | Cancel calls onCancel | onCancel mock called, no save |
| CD-07 | Save triggers duplicate detection | duplicateDetector mock called with { name, artistIds } |
| CD-08 | No duplicates → save proceeds | onSave called; duplicate dialog NOT shown |
| CD-09 | Duplicates found → duplicate dialog opens | DuplicateDetectionDialog rendered with results |
| CD-10 | Resolving duplicates → save proceeds with resolution actions | Correct repository methods called per resolution |
| CD-11 | DB error during save → Snackbar shown | Error message visible; dialog stays open |
| CD-12 | Close button calls onCancel | Dialog closes without saving |

### 14.2 SongEditDialog Tests

**File:** `packages/renderer/src/categories/songs/components/__tests__/SongEditDialog.test.tsx`

| # | Test | Expected |
|---|------|----------|
| ED-01 | Renders form pre-populated with item data | Name, Album, Artists, Language match item |
| ED-02 | `added_at` displayed as read-only text | Not an input; shown as Typography |
| ED-03 | Cannot edit `added_at` | No input element for date added |
| ED-04 | Save with valid changes calls onSave | onSave called with updated data |
| ED-05 | Artist set changes handled correctly | Removed artist → remove() called; Added artist → add() called |
| ED-06 | Cancel calls onCancel | onCancel mock called |
| ED-07 | Edit of soft-deleted song shows warning | "This item is in Trash" message |
| ED-08 | Validation errors same as CreateDialog | Required field checks |

### 14.3 SongDetailDialog Tests

**File:** `packages/renderer/src/categories/songs/components/__tests__/SongDetailDialog.test.tsx`

| # | Test | Expected |
|---|------|----------|
| DD-01 | Renders all item fields | Name, Album, Artists (chips), Language name, Date Added |
| DD-02 | Date Added is visible but not editable | Displayed as text |
| DD-03 | Edit button calls onEdit | onEdit mock called with item |
| DD-04 | Delete button shows confirmation | Confirmation dialog or text appears |
| DD-05 | Confirm delete calls onDelete | onDelete called with song ID |
| DD-06 | Close button calls onClose | onClose mock called |
| DD-07 | Cancel delete does not call onDelete | Delete not executed |

### 14.4 ArtistAutocomplete Tests

**File:** `packages/renderer/src/categories/songs/components/__tests__/ArtistAutocomplete.test.tsx`

| # | Test | Expected |
|---|------|----------|
| AA-01 | Renders Autocomplete input | MUI Autocomplete rendered |
| AA-02 | Typing filters existing artists | ArtistRepository called with query; options filtered |
| AA-03 | Selecting artist adds to selected list | Chip appears for selected artist; onChange called |
| AA-04 | Removing artist chip updates selection | Artist removed from selected list |
| AA-05 | New artist name shows "Create 'X'" option | FreeSolo option rendered |
| AA-06 | Selecting "Create 'X'" creates artist | ArtistRepository.create() called; new artist added to selected |
| AA-07 | Loading state shown while fetching | CircularProgress or loading text |
| AA-08 | Error state shows message | "Failed to load artists" message |
| AA-09 | Multiple artists can be selected | Multiple chips displayed |

### 14.5 LanguagePicker Tests

**File:** `packages/renderer/src/categories/songs/components/__tests__/LanguagePicker.test.tsx`

| # | Test | Expected |
|---|------|----------|
| LP-01 | Renders Autocomplete with languages | Options populated from LanguageRepository |
| LP-02 | Typing filters language list | Options filtered by input |
| LP-03 | Selecting language calls onChange | onChange called with Language object |
| LP-04 | User-added languages visually distinct | Different styling or badge for `user_added: 1` |
| LP-05 | Free-text entry not allowed | Cannot type arbitrary text and save (freeSolo={false}) |
| LP-06 | Loading state shown | Progress indicator while fetching |
| LP-07 | Error state shows message | "Failed to load languages" |
| LP-08 | Clearing selection calls onChange(null) | Language deselected |

### 14.6 DuplicateDetectionDialog Tests

**File:** `packages/renderer/src/categories/songs/components/__tests__/DuplicateDetectionDialog.test.tsx`

| # | Test | Expected |
|---|------|----------|
| DP-01 | Renders matched songs list | Each match shown with song name and artists |
| DP-02 | Scenario A shows "Overwrite Existing" and "Skip Creation" | Resolution buttons/radio for exact match |
| DP-03 | Scenario B shows "Merge Artists" and "Create Separate Entry" | Resolution buttons/radio for partial match |
| DP-04 | User selects resolution for each match | State updates per match |
| DP-05 | "Apply" calls onResolve with resolutions | onResolve called with resolution array |
| DP-06 | "Cancel" calls onCancel | onCancel called; no resolutions applied |
| DP-07 | Multiple matches all shown | All DuplicateCheckResults rendered |
| DP-08 | No default resolution pre-selected | User must actively choose (FR-DUP-05) |

### 14.7 useSongsStore Tests

**File:** `packages/renderer/src/categories/songs/store/__tests__/useSongsStore.test.ts`

| # | Test | Expected |
|---|------|----------|
| ST-01 | `configure()` stores DatabaseConnection | Internal state set |
| ST-02 | Hook called before `configure()` throws | Descriptive error |
| ST-03 | `useSongs()` returns songs list | Queries SongRepository.findAll() |
| ST-04 | `useSongs()` returns loading state | isLoading=true during fetch |
| ST-05 | `useCreateSong()` calls SongRepository.create() + SongArtistRepository.add() | Both repos called |
| ST-06 | `useCreateSong()` invalidates songs cache | queryClient.invalidateQueries(['songs']) called |
| ST-07 | `useUpdateSong()` calls SongRepository.update() | Update query executed |
| ST-08 | `useDeleteSong()` calls SongRepository.softDelete() | Soft delete executed |
| ST-09 | `useRestoreSong()` calls SongRepository.restore() | Restore executed |
| ST-10 | `useCreateArtist()` returns created Artist | ArtistRepository.create() result |
| ST-11 | Mutation `isPending` reflects loading state | True during mutation, false after |
| ST-12 | Mutation error propagates | Error accessible via `error` field |

---

## 15. Definition of Done

Per `PROJECT_CONSTITUTION.md` Section 26 (Task-Level DoD):

1. **Implemented:** All 9 tasks complete per this specification. All 16 new files exist.
2. **Self-reviewed:** Diff reviewed for:
   - Correct MUI component usage per the component mapping table (E-07 epic §Component Mapping Table)
   - No direct repository access from dialogs — all through `useSongsStore`
   - Placeholder components in `SongsCategory.ts` replaced with real imports
   - Correct prop types matching `CategoryDefinition` contracts
   - No platform-specific imports
3. **Tested:** All test cases (CD-01–12, ED-01–08, DD-01–07, AA-01–09, LP-01–08, DP-01–08, ST-01–12) pass. Existing tests continue to pass.
4. **Platform verified:** `pnpm typecheck` across all 5 packages passes. No platform code.
5. **No new lint errors:** `pnpm lint` on renderer package passes.
6. **No hardcoded data:** No magic strings. Validation messages, resolution options, and labels use constants or are derived from existing types.

### Gate Commands

```
pnpm --filter @collectio/renderer typecheck
pnpm --filter @collectio/renderer lint
pnpm --filter @collectio/renderer test
pnpm --filter @collectio/shared test    # verify no regressions
pnpm typecheck                           # all 5 workspace packages
```

---

## Appendix A: File Details

### A.1 `SongCreateDialog.tsx`

- **Purpose:** Modal form for creating a new song. Implements the `CategoryDefinition.createForm` contract.
- **Responsibility:** Collect song name, album, language, and artists. Validate required fields. Run duplicate detection before save. Handle inline artist creation. Save via `useSongsStore.useCreateSong()`. Call `onSave` on success.
- **Public API:** React `FC` matching `{ onSave: (item: unknown) => void; onCancel: () => void }` plus `open`, `db` props.

### A.2 `SongEditDialog.tsx`

- **Purpose:** Modal form for editing an existing song. Implements the `CategoryDefinition.editForm` contract.
- **Responsibility:** Pre-populate fields from existing song data. Display `added_at` as read-only. Allow editing of name, album, language, artists. Handle artist set diffing (add/remove). Save via `useSongsStore.useUpdateSong()`. Call `onSave` on success.
- **Public API:** React `FC` matching `{ item: unknown; onSave: (item: unknown) => void; onCancel: () => void }` plus `open`, `db` props.

### A.3 `SongDetailDialog.tsx`

- **Purpose:** Read-only detail view of a song. Implements the `CategoryDefinition.detailView` contract.
- **Responsibility:** Display all song fields (including read-only `added_at`). Show artists as chips, language as name. Provide Edit, Delete (with confirmation), and Close actions.
- **Public API:** React `FC` matching `{ item: unknown; onClose: () => void }` plus `open`, `onEdit`, `onDelete`, `db` props.

### A.4 `ArtistAutocomplete.tsx`

- **Purpose:** Multi-select artist picker with autocomplete and inline creation (FR-ARTIST-02, FR-ARTIST-03, FR-ARTIST-04).
- **Responsibility:** Load existing artists via `useArtists(query)`. Debounce input 300ms. Render MUI `Autocomplete` with `freeSolo` + `multiple`. Offer "Create 'X'" option for unmatched input.
- **Public API:** `{ value: Artist[]; onChange: (artists: Artist[]) => void; db: DatabaseConnection }`

### A.5 `LanguagePicker.tsx`

- **Purpose:** Single-select language picker with autocomplete from the reference table (FR-LANG-02, FR-LANG-04).
- **Responsibility:** Load languages via `LanguageRepository.findAll()`. Render MUI `Autocomplete` with `freeSolo={false}`. Visually distinguish user-added languages (FR-LANG-03).
- **Public API:** `{ value: Language | null; onChange: (language: Language | null) => void; db: DatabaseConnection }`

### A.6 `DuplicateDetectionDialog.tsx`

- **Purpose:** Modal for resolving duplicate song matches per FR-DUP-02, FR-DUP-03, FR-DUP-05.
- **Responsibility:** Display each matched song with its resolution options (Scenario A: Overwrite/Skip; Scenario B: Merge/Create Separate). Collect user choices. Call `onResolve` with resolution array on Apply.
- **Public API:** `{ open: boolean; results: DuplicateCheckResult[]; onResolve: (actions: DuplicateResolution[]) => void; onCancel: () => void }`

### A.7 `components/index.ts`

- **Purpose:** Barrel export for all Songs category UI components.
- **Responsibility:** Re-export `SongCreateDialog`, `SongEditDialog`, `SongDetailDialog`, `ArtistAutocomplete`, `LanguagePicker`, `DuplicateDetectionDialog`.
- **Public API:** Named re-exports.

### A.8 `store/useSongsStore.ts`

- **Purpose:** Zustand + TanStack Query store for Songs category CRUD operations.
- **Responsibility:** Hold `DatabaseConnection` reference. Expose hooks for querying and mutating songs, artists, and languages. Invalidate TanStack Query caches on mutations. Throw if used before `configure()`.
- **Public API:** `configureSongsStore(db)`, `useSongs()`, `useArtists(query?)`, `useLanguages()`, `useCreateSong()`, `useUpdateSong()`, `useDeleteSong()`, `useRestoreSong()`, `useCreateArtist()`.

### A.9 `store/index.ts`

- **Purpose:** Barrel export for the store.
- **Responsibility:** Re-export everything from `useSongsStore.ts`.
- **Public API:** Same as `useSongsStore.ts`.

---

## Appendix B: MUI Component Usage Reference

Per the epic's component mapping table:

| Feature | MUI Component | Key Props |
|---------|--------------|-----------|
| Text input | `TextField` | `value`, `onChange`, `error`, `helperText`, `fullWidth`, `label` |
| Autocomplete (artist) | `Autocomplete` | `freeSolo`, `multiple`, `options`, `value`, `onChange`, `onInputChange`, `renderInput`, `renderTags`, `filterOptions` |
| Autocomplete (language) | `Autocomplete` | `freeSolo={false}`, `options`, `value`, `onChange`, `renderInput`, `getOptionLabel` |
| Buttons | `Button` | `variant="contained"` (primary), `variant="outlined"` (secondary), `onClick` |
| Dialog container | `Dialog` | `open`, `onClose`, `maxWidth`, `fullWidth` |
| Dialog sections | `DialogTitle`, `DialogContent`, `DialogActions` | Children of `Dialog` |
| Artist chips | `Chip` | `label`, `onDelete`, `size="small"` |
| Typography | `Typography` | `variant` for headings/body |
| Error feedback | `Snackbar` + `Alert` | `open`, `onClose`, `severity`, `children` |
| Icons | `IconButton` + MUI icons | `onClick`, `size="small"` |
| Loading indicator | `CircularProgress` | `size`, inside `DialogContent` or inline |
| Confirmation | `Dialog` (nested) or `Alert` inside detail | Second dialog for delete confirmation |

---

## Appendix C: Key Design Decisions

### CD-01: Store uses `configure()` pattern, not React context

Same pattern as `SongsCategory.configure()`. The `DatabaseConnection` is set once at app startup. Hooks throw if called before configuration. This avoids prop-drilling `db` through every component tree level and keeps stores as module-level singletons.

### CD-02: TanStack Query provider is a separate concern

The `QueryClientProvider` must wrap the React tree for `useQuery`/`useMutation` to work. This is added at the app entry point (`main.tsx` or E-15 shell), not inside the store. Tests wrap components in their own `QueryClientProvider`. This separation keeps the store unaware of React context setup.

### CD-03: Dialogs accept `db` prop, not context

Dialogs receive `DatabaseConnection` as an explicit prop rather than reading from React context. This makes them testable (pass mock db directly) and keeps them decoupled from the DI system. The caller (E-15 shell or test wrapper) is responsible for providing `db`.

### CD-04: Artist set diffing in update flow

When editing a song, the dialog compares old artist IDs vs new artist IDs. Removed artists trigger `SongArtistRepository.remove()`. Added artists trigger `SongArtistRepository.add()`. Unchanged artists are left alone. This is done in the dialog's save handler, not in the store — the store's `useUpdateSong()` handles the song row update only.

### CD-05: Duplicate resolution executes repository calls directly

The `DuplicateDetectionDialog` returns resolution actions to `SongCreateDialog`. The create dialog then executes the appropriate repository calls (overwrite → update, merge → add artists to existing, etc.). This keeps the duplicate dialog as a pure decision component — it makes no database calls.

### CD-06: No service for dialogs — direct repository access

Dialogs use `useSongsStore` hooks which internally use repositories. Dialogs never import or instantiate repositories directly. This enforces the single source of truth for all data operations.

---

_End of Implementation Specification_
