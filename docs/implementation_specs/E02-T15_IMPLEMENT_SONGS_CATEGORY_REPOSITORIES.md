# E-02 T15 — Implement Songs Category Repositories

**Parent Epic:** E-02: Database Layer  
**Type:** Production Implementation (Data Layer — Repositories)  
**Criticality:** FOUNDATION — these are the first user-content entity repositories. They introduce soft-delete filtering (`WHERE deleted_at IS NULL`), M:N junction table management, immutable field handling (`added_at`), and cross-table JOIN queries (`findSongWithArtists`). Every future category (Books, Movies, Games) will replicate this pattern.

---

## 1. Goal

Implement 3 typed repository classes for the Songs category: `ArtistRepository`, `SongRepository`, and `SongArtistRepository`. These cover the `artists`, `songs`, and `song_artists` tables created by migration 002. They follow the T09 pattern (constructor-injected `DatabaseConnection`, async, parameterized SQL via `?`) and establish the soft-delete pattern required by all future category repositories.

## 2. Scope

| In Scope | Rationale |
|----------|-----------|
| `Artist` domain model | Pure TypeScript interface — fields from `artists` table |
| `Song` domain model | Pure TypeScript interface — fields from `songs` table |
| `SongArtist` domain model | Pure TypeScript interface — fields from `song_artists` junction table |
| `SongWithArtists` domain model | Composite type returned by `findSongWithArtists()` — a Song with its associated artists |
| `CreateSongInput` domain model | Input type for song creation — caller provides only user-specified fields |
| `UpdateSongInput` domain model | Input type for song updates — all editable fields optional, `added_at` excluded |
| `ArtistRepository` | CRUD + softDelete + restore + findByName (returns all matches — no uniqueness) |
| `SongRepository` | CRUD + softDelete + restore + findSongWithArtists JOIN query + findByLanguageId |
| `SongArtistRepository` | Junction table M:N — add, remove, updateSortOrder, findBySongId, findByArtistId |
| Soft-delete enforcement on `artists` and `songs` | All active queries append `WHERE deleted_at IS NULL`. `findAllIncludingDeleted()` variants bypass this filter |
| `songs.added_at` immutability | `update()` must never include `added_at` in the SET clause. `added_at` is set once by `create()` |
| `updated_at` auto-generation on every write | All mutations auto-set `updated_at = new Date().toISOString()` |
| `updated_at` on `song_artists` mutations | Every add/remove/reorder on the junction table updates `updated_at` for LWW sync |
| UUID generation for artist and song PKs | `crypto.randomUUID()` — same pattern as DeviceRepository |
| `findSongWithArtists()` cross-table JOIN | LEFT JOIN songs → song_artists → artists; combines rows into `SongWithArtists` |
| Barrel re-exports from `packages/shared/src/index.ts` | All types and classes importable via `@collectio/shared` |
| Unit tests with mocked `DatabaseConnection` for all 3 repositories | Verifies soft-delete filter, immutability, JOIN behavior, parameter binding |

## 3. Out of Scope

| Out of Scope | Why | Where It Belongs |
|-------------|-----|-----------------|
| Duplicate detection logic | Application layer concern (constitution §14.4). Repository provides raw `findByName()` and `findSongWithArtists()` for the detector to consume | `SongDuplicateDetector` in `packages/shared/src/application/duplicate/` |
| Name normalization pipeline (NFC, lowercase, whitespace collapse) | Application layer — not a data access concern | `SongDuplicateDetector` |
| Song-artist replacement orchestration (diff old vs. new artist sets) | Application layer or service. SongArtistRepository provides atomic single-operations only | Application layer sync service or song edit orchestrator |
| Transaction wrapping across multiple repositories | Caller's responsibility via `db.transaction()` | Application layer |
| Cascade soft-delete to `song_artists` | Not required per constitution — `song_artists` has no `deleted_at`. Soft-deleting a song leaves junction rows intact | N/A — by design |
| Adding a song with its initial artists in one call | SongRepository.create() only creates the song row. Caller must follow up with SongArtistRepository.add() calls | Application layer orchestration |
| Artist metadata fields (biography, country, formed_year) | Future migration — the `artists` table is designed for extensibility | Migration 004+ |
| Songs category UI components | Renderer package | E-07 |
| `SongsCategory` registration (implements `CategoryDefinition`) | Requires E-05 CategoryFramework and renderer components | E-06 (T-06.8) |

## 4. Files To Create

### 4.1 Domain Models

| # | File | Purpose | Responsibility |
|---|------|---------|---------------|
| 1 | `packages/shared/src/domain/models/Artist.ts` | Domain model: `Artist` entity | Exports `Artist` interface with fields: `id` (string UUID), `display_name` (string), `created_at` (ISO-8601 string), `updated_at` (ISO-8601 string), `deleted_at` (ISO-8601 string \| null). Pure TypeScript — zero imports. |
| 2 | `packages/shared/src/domain/models/Song.ts` | Domain model: `Song` entity, `CreateSongInput`, `UpdateSongInput`, `SongWithArtists`, `SongArtistWithName` | Exports 5 types:<br> — `Song` interface: `id` (string UUID), `name` (string), `album_name` (string \| null), `language_id` (number), `added_at` (ISO-8601 string), `updated_at` (ISO-8601 string), `deleted_at` (ISO-8601 string \| null)<br> — `CreateSongInput` interface: `name` (string), `album_name` (string \| null), `language_id` (number) — fields the caller provides at creation<br> — `UpdateSongInput` interface: `name` (string), `album_name` (string \| null), `language_id` (number) — all fields required; caller passes current values for unchanged fields<br> — `SongWithArtists` interface: extends `Song`, adds `artists: SongArtistWithName[]`<br> — `SongArtistWithName` interface: `id` (string — artist UUID), `display_name` (string), `sort_order` (number)<br>Pure TypeScript — zero imports. |
| 3 | `packages/shared/src/domain/models/SongArtist.ts` | Domain model: `SongArtist` junction entity | Exports `SongArtist` interface with fields: `song_id` (string UUID), `artist_id` (string UUID), `sort_order` (number), `updated_at` (ISO-8601 string). Pure TypeScript — zero imports. |

### 4.2 Repositories

| # | File | Purpose | Responsibility |
|---|------|---------|---------------|
| 4 | `packages/shared/src/data/repositories/ArtistRepository.ts` | Repository: CRUD + soft-delete for `artists` table | Exports `ArtistRepository` class. Constructor takes `DatabaseConnection`. Methods: `create(displayName)`, `findById(id)`, `findByName(displayName)`, `findAll()`, `findAllIncludingDeleted()`, `update(id, displayName)`, `softDelete(id)`, `restore(id)`, `count()`. All methods return `Promise<T>`. `create()` auto-generates UUID v4, sets `created_at` and `updated_at` to current UTC ISO-8601. `findByName()` returns ALL matching artists (constitution allows duplicate display names). Active queries (`findById`, `findByName`, `findAll`) append `WHERE deleted_at IS NULL`. `findAllIncludingDeleted()` does not filter by `deleted_at`. |
| 5 | `packages/shared/src/data/repositories/SongRepository.ts` | Repository: CRUD + soft-delete + JOIN for `songs` table | Exports `SongRepository` class. Constructor takes `DatabaseConnection`. Methods: `create(input)`, `findById(id)`, `findSongWithArtists(id)`, `findAll()`, `findAllIncludingDeleted()`, `findByLanguageId(languageId)`, `update(id, input)`, `softDelete(id)`, `restore(id)`, `count()`. All methods return `Promise<T>`. `create()` auto-generates UUID v4, sets `added_at` and `updated_at` to current UTC ISO-8601. `update()` updates `name`, `album_name`, `language_id`, and `updated_at` — `added_at` is NEVER in the SET clause. `findSongWithArtists()` executes a 3-table LEFT JOIN and combines rows into a `SongWithArtists` object. Active queries append `WHERE songs.deleted_at IS NULL`. |
| 6 | `packages/shared/src/data/repositories/SongArtistRepository.ts` | Repository: M:N junction management for `song_artists` table | Exports `SongArtistRepository` class. Constructor takes `DatabaseConnection`. Methods: `findBySongId(songId)`, `findByArtistId(artistId)`, `add(songId, artistId, sortOrder)`, `remove(songId, artistId)`, `updateSortOrder(songId, artistId, sortOrder)`, `count()`. All methods return `Promise<T>`. `add()`/`remove()`/`updateSortOrder()` auto-set `updated_at` to current UTC ISO-8601. No soft-delete filtering (`song_artists` has no `deleted_at`). Composite PK `(song_id, artist_id)` — `add()` with duplicate pair throws `ConstraintError`. |

### 4.3 Tests

| # | File | Purpose | Responsibility |
|---|------|---------|---------------|
| 7 | `packages/shared/src/data/repositories/__tests__/ArtistRepository.test.ts` | Unit tests with mocked `DatabaseConnection` | Tests: create with UUID + timestamps, findById with soft-delete filter, findByName returning multiple matches, findAll excluding deleted, findAllIncludingDeleted, update updating display_name + updated_at, softDelete setting deleted_at, restore nullifying deleted_at, count. |
| 8 | `packages/shared/src/data/repositories/__tests__/SongRepository.test.ts` | Unit tests with mocked `DatabaseConnection` | Tests: create with UUID + added_at + updated_at, findById with soft-delete filter, findSongWithArtists JOIN combining rows, findAll excluding deleted, findAllIncludingDeleted, findByLanguageId, update excluding added_at from SET clause, softDelete, restore, count, album_name nullable handling. |
| 9 | `packages/shared/src/data/repositories/__tests__/SongArtistRepository.test.ts` | Unit tests with mocked `DatabaseConnection` | Tests: findBySongId returning all junction rows, findByArtistId, add with UUIDs + sort_order + updated_at, add duplicate → ConstraintError, remove, updateSortOrder, count, FK violation on nonexistent song/artist. |

## 5. Files To Modify

| # | File | Change | Rationale |
|---|------|--------|-----------|
| 1 | `packages/shared/src/index.ts` | Add barrel re-exports for all 6 new types and 3 new repository classes | Makes all types and repositories importable via `@collectio/shared`. Add exports: `Artist`, `ArtistRepository`, `Song`, `CreateSongInput`, `UpdateSongInput`, `SongWithArtists`, `SongArtistWithName`, `SongRepository`, `SongArtist`, `SongArtistRepository` |
| 2 | `packages/shared/tsconfig.json` | No change required | `include: ["src"]` already covers new files |
| 3 | `packages/shared/package.json` | No change required | No new dependencies — pure TypeScript |

## 6. Interfaces

### 6.1 ArtistRepository Public API

**Constructor:** `constructor(db: DatabaseConnection)`

**Method: `async create(displayName: string): Promise<Artist>`**
- Generates UUID v4 for `id` via `crypto.randomUUID()`
- Sets `created_at = new Date().toISOString()`
- Sets `updated_at = new Date().toISOString()`
- Sets `deleted_at = null`
- Executes `INSERT INTO artists (id, display_name, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, NULL)`
- Returns the full `Artist` object with all fields

**Method: `async findById(id: string): Promise<Artist | null>`**
- Executes `SELECT * FROM artists WHERE id = ? AND deleted_at IS NULL`
- Returns `Artist` if found, `null` if not (either doesn't exist or is soft-deleted)

**Method: `async findByName(displayName: string): Promise<Artist[]>`**
- Executes `SELECT * FROM artists WHERE display_name = ? AND deleted_at IS NULL ORDER BY created_at ASC`
- Returns ALL matching artists (constitution explicitly allows duplicate display names)
- Empty match returns `[]`

**Method: `async findAll(): Promise<Artist[]>`**
- Executes `SELECT * FROM artists WHERE deleted_at IS NULL ORDER BY display_name ASC`
- Returns active artists or `[]`

**Method: `async findAllIncludingDeleted(): Promise<Artist[]>`**
- Executes `SELECT * FROM artists ORDER BY display_name ASC`
- No `WHERE deleted_at IS NULL` filter
- Returns all artists, including soft-deleted (for trash/audit views)

**Method: `async update(id: string, displayName: string): Promise<void>`**
- Sets `updated_at = new Date().toISOString()`
- Executes `UPDATE artists SET display_name = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`
- Does NOT throw if artist doesn't exist or is soft-deleted — no-op

**Method: `async softDelete(id: string): Promise<void>`**
- Sets `deleted_at = new Date().toISOString()`
- Sets `updated_at = new Date().toISOString()`
- Executes `UPDATE artists SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`
- Does NOT throw if already soft-deleted — WHERE clause prevents double-delete

**Method: `async restore(id: string): Promise<void>`**
- Sets `deleted_at = NULL`
- Sets `updated_at = new Date().toISOString()`
- Executes `UPDATE artists SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL`
- Does NOT throw if artist is not soft-deleted — WHERE clause prevents no-op restore

**Method: `async count(): Promise<number>`**
- Executes `SELECT COUNT(*) AS count FROM artists WHERE deleted_at IS NULL`
- Returns count of active (non-deleted) artists

### 6.2 SongRepository Public API

**Constructor:** `constructor(db: DatabaseConnection)`

**Method: `async create(input: CreateSongInput): Promise<Song>`**
- `input` has fields: `name` (string), `album_name` (string | null), `language_id` (number)
- Generates UUID v4 for `id` via `crypto.randomUUID()`
- Sets `added_at = new Date().toISOString()` — immutable creation timestamp
- Sets `updated_at = new Date().toISOString()`
- Sets `deleted_at = null`
- Executes `INSERT INTO songs (id, name, album_name, language_id, added_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, NULL)`
- Returns the full `Song` object with all fields
- Does NOT create any `song_artists` rows — caller must use `SongArtistRepository` separately
- Throws `ConstraintError` if `language_id` references nonexistent language (FK violation)

**Method: `async findById(id: string): Promise<Song | null>`**
- Executes `SELECT * FROM songs WHERE id = ? AND deleted_at IS NULL`
- Returns `Song` if found, `null` if not

**Method: `async findSongWithArtists(id: string): Promise<SongWithArtists | null>`**
- Executes a 3-table LEFT JOIN:
  ```sql
  SELECT
    s.id, s.name, s.album_name, s.language_id, s.added_at, s.updated_at, s.deleted_at,
    a.id AS artist_id, a.display_name AS artist_display_name, sa.sort_order AS artist_sort_order
  FROM songs s
  LEFT JOIN song_artists sa ON s.id = sa.song_id
  LEFT JOIN artists a ON sa.artist_id = a.id AND a.deleted_at IS NULL
  WHERE s.id = ? AND s.deleted_at IS NULL
  ORDER BY sa.sort_order ASC
  ```
- LEFT JOIN ensures songs with zero artists return a row with NULL artist columns
- Groups result rows into a single `SongWithArtists` object:
  - Song fields from the first row (or null if no match)
  - `artists` array built from non-null artist rows
  - If no artists, `artists` is `[]`
- If no song row found, returns `null`

**Method: `async findAll(): Promise<Song[]>`**
- Executes `SELECT * FROM songs WHERE deleted_at IS NULL ORDER BY updated_at DESC`
- Returns active songs or `[]`

**Method: `async findAllIncludingDeleted(): Promise<Song[]>`**
- Executes `SELECT * FROM songs ORDER BY updated_at DESC`
- No soft-delete filter — for trash/audit views

**Method: `async findByLanguageId(languageId: number): Promise<Song[]>`**
- Executes `SELECT * FROM songs WHERE language_id = ? AND deleted_at IS NULL ORDER BY name ASC`
- Returns matching songs or `[]`

**Method: `async update(id: string, input: UpdateSongInput): Promise<void>`**
- `input` has fields: `name` (string), `album_name` (string | null), `language_id` (number) — all required. Caller passes current values for unchanged fields.
- Sets `updated_at = new Date().toISOString()`
- Executes `UPDATE songs SET name = ?, album_name = ?, language_id = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`
- **`added_at` is NEVER in the SET clause** — enforced by the SQL, not by convention. The `UpdateSongInput` type does not include `added_at`.
- Does NOT throw if song doesn't exist or is soft-deleted — no-op

**Method: `async softDelete(id: string): Promise<void>`**
- Sets `deleted_at = new Date().toISOString()`
- Sets `updated_at = new Date().toISOString()`
- Executes `UPDATE songs SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`
- Does NOT cascade to `song_artists` — junction rows remain unchanged

**Method: `async restore(id: string): Promise<void>`**
- Sets `deleted_at = NULL`
- Sets `updated_at = new Date().toISOString()`
- Executes `UPDATE songs SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL`

**Method: `async count(): Promise<number>`**
- Executes `SELECT COUNT(*) AS count FROM songs WHERE deleted_at IS NULL`

### 6.3 SongArtistRepository Public API

**Constructor:** `constructor(db: DatabaseConnection)`

**Method: `async findBySongId(songId: string): Promise<SongArtist[]>`**
- Executes `SELECT * FROM song_artists WHERE song_id = ? ORDER BY sort_order ASC`
- Returns all junction rows for a song (including rows for soft-deleted songs — `song_artists` has no `deleted_at`)
- Returns `[]` if no artists associated

**Method: `async findByArtistId(artistId: string): Promise<SongArtist[]>`**
- Executes `SELECT * FROM song_artists WHERE artist_id = ? ORDER BY sort_order ASC`
- Returns all junction rows for an artist (including rows for soft-deleted artists — no `deleted_at` on junction)
- Returns `[]` if no songs associated

**Method: `async add(songId: string, artistId: string, sortOrder: number): Promise<SongArtist>`**
- Sets `updated_at = new Date().toISOString()`
- Executes `INSERT INTO song_artists (song_id, artist_id, sort_order, updated_at) VALUES (?, ?, ?, ?)`
- Returns the full `SongArtist` object
- Throws `ConstraintError` if pair already exists (composite PK violation)
- Throws `ConstraintError` if `song_id` or `artist_id` don't exist (FK violation)

**Method: `async remove(songId: string, artistId: string): Promise<void>`**
- Executes `DELETE FROM song_artists WHERE song_id = ? AND artist_id = ?`
- Does NOT throw if pair doesn't exist — DELETE affecting 0 rows is valid (no-op)

**Method: `async updateSortOrder(songId: string, artistId: string, sortOrder: number): Promise<void>`**
- Sets `updated_at = new Date().toISOString()`
- Executes `UPDATE song_artists SET sort_order = ?, updated_at = ? WHERE song_id = ? AND artist_id = ?`
- Does NOT throw if pair doesn't exist — UPDATE affecting 0 rows is valid

**Method: `async count(): Promise<number>`**
- Executes `SELECT COUNT(*) AS count FROM song_artists`

### 6.4 Domain Model Types Summary

| File | Exports | Purpose |
|------|---------|---------|
| `Artist.ts` | `Artist` interface | Artist entity (id, display_name, created_at, updated_at, deleted_at) |
| `Song.ts` | `Song` interface, `CreateSongInput` interface, `UpdateSongInput` interface, `SongWithArtists` interface, `SongArtistWithName` interface | Song entity + creation/update input types + joined result type |
| `SongArtist.ts` | `SongArtist` interface | Junction entity (song_id, artist_id, sort_order, updated_at) |

### 6.5 Repository SQL Operations Summary

| Repository | Operation | Interface Method | SQL Pattern |
|-----------|-----------|-----------------|-------------|
| ArtistRepository | Create | `db.execute("INSERT INTO artists (id, display_name, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, NULL)", [...])` | INSERT with ? params |
| ArtistRepository | Find by ID | `db.query<Artist>("SELECT * FROM artists WHERE id = ? AND deleted_at IS NULL", [id])` | SELECT with soft-delete filter |
| ArtistRepository | Find by name | `db.query<Artist>("SELECT * FROM artists WHERE display_name = ? AND deleted_at IS NULL ORDER BY created_at ASC", [name])` | SELECT with soft-delete filter, returns array |
| ArtistRepository | Find all | `db.query<Artist>("SELECT * FROM artists WHERE deleted_at IS NULL ORDER BY display_name ASC")` | SELECT with soft-delete filter |
| ArtistRepository | Find all incl. deleted | `db.query<Artist>("SELECT * FROM artists ORDER BY display_name ASC")` | SELECT without soft-delete filter |
| ArtistRepository | Update | `db.execute("UPDATE artists SET display_name = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL", [...])` | UPDATE with ? params |
| ArtistRepository | Soft delete | `db.execute("UPDATE artists SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL", [...])` | UPDATE sets deleted_at |
| ArtistRepository | Restore | `db.execute("UPDATE artists SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL", [...])` | UPDATE nullifies deleted_at |
| SongRepository | Create | `db.execute("INSERT INTO songs (id, name, album_name, language_id, added_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, NULL)", [...])` | INSERT with ? params |
| SongRepository | Find song with artists | `db.query("SELECT s.id, s.name, ... a.id AS artist_id, ... FROM songs s LEFT JOIN song_artists sa ON ... LEFT JOIN artists a ON ... WHERE s.id = ? AND s.deleted_at IS NULL ORDER BY sa.sort_order ASC", [id])` | 3-table LEFT JOIN |
| SongRepository | Update | `db.execute("UPDATE songs SET name = ?, album_name = ?, language_id = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL", [...])` | UPDATE — `added_at` NOT in SET |
| SongArtistRepository | Add | `db.execute("INSERT INTO song_artists (song_id, artist_id, sort_order, updated_at) VALUES (?, ?, ?, ?)", [...])` | INSERT with ? params |
| SongArtistRepository | Remove | `db.execute("DELETE FROM song_artists WHERE song_id = ? AND artist_id = ?", [...])` | DELETE with composite PK |
| SongArtistRepository | Update sort order | `db.execute("UPDATE song_artists SET sort_order = ?, updated_at = ? WHERE song_id = ? AND artist_id = ?", [...])` | UPDATE with ? params |

### 6.6 Soft-Delete Filter Pattern

All repositories on tables with `deleted_at` (`artists`, `songs`) follow this consistent pattern:

| Method | Filter | Rationale |
|--------|--------|-----------|
| `findById()` | `WHERE deleted_at IS NULL` | Soft-deleted records are invisible to normal lookup |
| `findByName()` | `WHERE deleted_at IS NULL` | Only active artists match |
| `findAll()` | `WHERE deleted_at IS NULL` | Default list view excludes trash |
| `findAllIncludingDeleted()` | _(no filter)_ | For trash views and audit |
| `findByLanguageId()` | `WHERE deleted_at IS NULL` | Only active songs per language |
| `update()` | `WHERE deleted_at IS NULL` | Cannot update a soft-deleted record |
| `softDelete()` | `WHERE deleted_at IS NULL` | Prevents double-soft-delete |
| `restore()` | `WHERE deleted_at IS NOT NULL` | Only restores soft-deleted records |

The `song_artists` table has **no `deleted_at`** — no soft-delete filtering applies. When joining through `song_artists`, the caller must join through the parent table (`songs` or `artists`) and filter `deleted_at IS NULL` there if needed. `findSongWithArtists()` handles this internally by joining through both parent tables with soft-delete filters.

## 7. Data Flow

### 7.1 ArtistRepository Flow

```
Caller (Song create/edit form, Artist autocomplete)
  │
  ├─ const artist = await repo.create('The Beatles')
  │     └─ Generates UUID, sets created_at/updated_at = now
  │     └─ INSERT INTO artists (id, display_name, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, NULL)
  │     └─ Returns Artist { id, display_name, created_at, updated_at, deleted_at: null }
  │
  ├─ const results = await repo.findByName('Various Artists')
  │     └─ SELECT * FROM artists WHERE display_name = ? AND deleted_at IS NULL ORDER BY created_at ASC
  │     └─ Returns [Artist, Artist, Artist] — all three "Various Artists" rows (no uniqueness enforcement)
  │
  ├─ await repo.softDelete('abc-123')
  │     └─ UPDATE artists SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL
  │     └─ Artist is now invisible to findById/findByName/findAll
  │     └─ song_artists rows referencing this artist are NOT changed
  │
  └─ await repo.restore('abc-123')
        └─ UPDATE artists SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL
        └─ Artist is visible again
```

### 7.2 SongRepository Flow

```
Caller (Song create/edit form, Song list view, Duplicate Detector)
  │
  ├─ const song = await repo.create({ name: 'Bohemian Rhapsody', album_name: 'A Night at the Opera', language_id: 30 })
  │     └─ Generates UUID, sets added_at/updated_at = now
  │     └─ INSERT INTO songs (id, name, album_name, language_id, added_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, NULL)
  │     └─ Returns Song { id, name, album_name, language_id, added_at, updated_at }
  │     └─ Does NOT create song_artists rows — caller does that separately
  │
  ├─ const songWithArtists = await repo.findSongWithArtists('song-uuid')
  │     └─ 3-table LEFT JOIN: songs → song_artists → artists
  │     └─ Filters: s.deleted_at IS NULL, a.deleted_at IS NULL (or NULL for no artist)
  │     └─ Groups rows: song fields from first row, artists array from artist columns
  │     └─ Song with 0 artists → { ...song, artists: [] }
  │     └─ Song with 2 artists → { ...song, artists: [{id, display_name, sort_order}, ...] }
  │     └─ Returns null if song not found
  │
  ├─ await repo.update('song-uuid', { name: 'Updated Name', album_name: null, language_id: 32 })
  │     └─ UPDATE songs SET name = ?, album_name = ?, language_id = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL
  │     └─ added_at is NOT in the SET clause — immutable
  │     └─ updated_at is always set to current UTC ISO-8601
  │
  └─ const songs = await repo.findByLanguageId(30)
        └─ SELECT * FROM songs WHERE language_id = ? AND deleted_at IS NULL ORDER BY name ASC
        └─ Returns all active songs in Italian (language_id=30)
```

### 7.3 SongArtistRepository Flow

```
Caller (Song edit dialog — adding/removing/reordering artists)
  │
  ├─ await repo.add('song-uuid', 'artist-uuid', 1)
  │     └─ INSERT INTO song_artists (song_id, artist_id, sort_order, updated_at) VALUES (?, ?, ?, ?)
  │     └─ updated_at = now
  │     └─ Returns SongArtist { song_id, artist_id, sort_order, updated_at }
  │     └─ Throws ConstraintError if pair already exists (composite PK) or FKs don't exist
  │
  ├─ await repo.remove('song-uuid', 'artist-uuid')
  │     └─ DELETE FROM song_artists WHERE song_id = ? AND artist_id = ?
  │     └─ No-op if pair doesn't exist (no error thrown)
  │
  ├─ await repo.updateSortOrder('song-uuid', 'artist-uuid', 3)
  │     └─ UPDATE song_artists SET sort_order = ?, updated_at = ? WHERE song_id = ? AND artist_id = ?
  │     └─ updated_at = now (for LWW sync)
  │
  └─ const artists = await repo.findBySongId('song-uuid')
        └─ SELECT * FROM song_artists WHERE song_id = ? ORDER BY sort_order ASC
        └─ Returns [{ song_id, artist_id: 'abc', sort_order: 1, updated_at }, ...]
        └─ Returns [] if no artists (no error)
```

### 7.4 Import Chain

```
@collectio/shared (Artist, Song, SongArtist types + 3 repositories)
        ↑
apps/* (main.ts / index.tsx — creates repo instances, injects connection)
packages/renderer/src/categories/songs/ (Song create/edit/detail components)
packages/shared/src/application/ (SyncEngine reads updated_at; DuplicateDetector reads findByName/findAll)
```

## 8. State Changes

### 8.1 Repository Internal State

All 3 repositories are stateless beyond the stored `DatabaseConnection` reference. No caching, no in-memory maps.

| Field | Type | Purpose |
|-------|------|---------|
| `db` | `DatabaseConnection` (private readonly) | Injected connection; never replaced |

### 8.2 Database State

| Repository | Operation | Database Effect |
|-----------|-----------|----------------|
| ArtistRepository | `create()` | INSERT new row in `artists` |
| ArtistRepository | `update()` | UPDATE `display_name` + `updated_at` on `artists` row |
| ArtistRepository | `softDelete()` | UPDATE `deleted_at` + `updated_at` on `artists` row |
| ArtistRepository | `restore()` | UPDATE `deleted_at = NULL` + `updated_at` on `artists` row |
| SongRepository | `create()` | INSERT new row in `songs` |
| SongRepository | `update()` | UPDATE `name`, `album_name`, `language_id`, `updated_at` on `songs` row; `added_at` unchanged |
| SongRepository | `softDelete()` | UPDATE `deleted_at` + `updated_at` on `songs` row; `song_artists` rows unchanged |
| SongRepository | `restore()` | UPDATE `deleted_at = NULL` + `updated_at` on `songs` row |
| SongArtistRepository | `add()` | INSERT new row in `song_artists` |
| SongArtistRepository | `remove()` | DELETE row from `song_artists` |
| SongArtistRepository | `updateSortOrder()` | UPDATE `sort_order` + `updated_at` on `song_artists` row |
| All read methods | No change (read-only) | |

### 8.3 Timestamp Generation Policy

| Timestamp Field | Generated By | When | Notes |
|----------------|-------------|------|-------|
| `artists.created_at` | ArtistRepository | `create()` call | Never updated |
| `artists.updated_at` | ArtistRepository | `create()`, `update()`, `softDelete()`, `restore()` calls | Always set to current UTC |
| `artists.deleted_at` | ArtistRepository | `softDelete()` call | Set to current UTC; nullified by `restore()` |
| `songs.added_at` | SongRepository | `create()` call | **IMMUTABLE** — never updated by any method |
| `songs.updated_at` | SongRepository | `create()`, `update()`, `softDelete()`, `restore()` calls | Always set to current UTC |
| `songs.deleted_at` | SongRepository | `softDelete()` call | Set to current UTC; nullified by `restore()` |
| `song_artists.updated_at` | SongArtistRepository | `add()`, `remove()`, `updateSortOrder()` calls | Required for LWW sync on junction table |

All timestamps are UTC ISO-8601 strings produced by `new Date().toISOString()`.

### 8.4 Immutable Field Enforcement

The `songs.added_at` column is immutable per constitution §14.3. Enforcement:

1. **Type-level:** `UpdateSongInput` does not include `added_at` — callers cannot pass it
2. **SQL-level:** `update()` SQL never includes `added_at` in the SET clause
3. **Test-level:** Unit tests verify `added_at` is not in any UPDATE SQL string

The `create()` method is the ONLY method that writes to `added_at`.

## 9. Database Changes

**None.** All 3 repositories read from and write to existing tables created by migration 002 (`002_songs_category.sql`). No schema changes, no new tables, no index creation, no ALTER statements.

## 10. Error Handling

### 10.1 Common Error Scenarios

| Error Condition | Repository | Detection | Response |
|----------------|-----------|-----------|----------|
| `DatabaseConnection` throws on any method | All | Catch from underlying connection | Re-throw original error as-is |
| `create()` with empty display_name | Artist | NOT NULL constraint | DB throws `ConstraintError` → re-thrown as-is |
| `create()` with empty name | Song | NOT NULL constraint | DB throws `ConstraintError` → re-thrown as-is |
| `create()` with nonexistent `language_id` | Song | FK violation | DB throws `ConstraintError` → re-thrown as-is |
| `add()` with duplicate `(song_id, artist_id)` | SongArtist | Composite PK violation | DB throws `ConstraintError` → re-thrown as-is |
| `add()` with nonexistent `song_id` or `artist_id` | SongArtist | FK violation | DB throws `ConstraintError` → re-thrown as-is |
| `softDelete()` on already-deleted | Artist/Song | WHERE `deleted_at IS NULL` → no rows matched | No error — no-op UPDATE |
| `restore()` on not-deleted | Artist/Song | WHERE `deleted_at IS NOT NULL` → no rows matched | No error — no-op UPDATE |
| `update()` on soft-deleted | Artist/Song | WHERE `deleted_at IS NULL` → no rows matched | No error — no-op UPDATE |
| `remove()` non-existent pair | SongArtist | DELETE affects 0 rows | No error — no-op |
| `updateSortOrder()` non-existent pair | SongArtist | UPDATE affects 0 rows | No error — no-op |
| `findById()` for soft-deleted record | Artist/Song | WHERE `deleted_at IS NULL` filters it out | Returns `null` — not an error |
| `findSongWithArtists()` for song with 0 artists | Song | LEFT JOIN produces NULL artist columns | Returns `SongWithArtists` with `artists: []` |

### 10.2 Error Message Examples

```
ConstraintError: NOT NULL constraint failed: artists.display_name
ConstraintError: FOREIGN KEY constraint failed: songs.language_id
ConstraintError: UNIQUE constraint failed: song_artists.song_id, song_artists.artist_id
```

### 10.3 SQL Error Propagation

If the underlying `DatabaseConnection` throws (corruption, disk full, FK/UNIQUE/NOT NULL violations), the error is re-thrown as-is. The repository never wraps or suppresses connection-level errors.

## 11. Logging Requirements

**None.** Repositories are thin data access layers. Logging is the caller's responsibility.

## 12. Security Requirements

| Requirement | Status |
|------------|--------|
| Parameterized queries — no SQL injection | ENFORCED — all SQL uses `?` placeholders. Zero string interpolation |
| No secrets stored | PASS — artist names and song names are user data, not secrets |
| UUID generation via `crypto.randomUUID()` | ENFORCED — no external UUID library |
| No connection lifecycle management | PASS — `open()`/`close()` are caller's responsibility |
| No data validation beyond SQL constraints | PASS — display name length, language code validity are Application layer concerns |

## 13. Acceptance Criteria

### 13.1 ArtistRepository

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `Artist` type compiles with all 5 fields | `tsc --noEmit` |
| 2 | `ArtistRepository` compiles with all 9 methods | `tsc --noEmit` |
| 3 | `create()` generates UUID v4, sets both timestamps, returns Artist | Unit test |
| 4 | `findById()` includes `WHERE deleted_at IS NULL` | Unit test |
| 5 | `findById()` returns null for soft-deleted artist | Unit test: mock returns `[]` because WHERE clause excludes it |
| 6 | `findByName()` returns ALL matches (duplicate names allowed) | Unit test: mock returns 3 rows → returns all 3 |
| 7 | `findAll()` excludes soft-deleted | Unit test: verify SQL contains `WHERE deleted_at IS NULL` |
| 8 | `findAllIncludingDeleted()` has NO `WHERE deleted_at IS NULL` | Unit test: verify SQL does not contain `deleted_at IS NULL` |
| 9 | `update()` updates display_name + updated_at | Unit test: verify UPDATE SQL columns |
| 10 | `update()` WHERE clause includes `deleted_at IS NULL` | Unit test: can't update soft-deleted |
| 11 | `softDelete()` sets deleted_at + updated_at | Unit test |
| 12 | `restore()` sets deleted_at = NULL + updated_at | Unit test |
| 13 | `count()` counts only active artists | Unit test: verify `WHERE deleted_at IS NULL` |
| 14 | All SQL uses `?` placeholders | Unit test |

### 13.2 SongRepository

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `Song`, `CreateSongInput`, `UpdateSongInput`, `SongWithArtists`, `SongArtistWithName` types compile | `tsc --noEmit` |
| 2 | `SongRepository` compiles with all 10 methods | `tsc --noEmit` |
| 3 | `create()` generates UUID, sets `added_at` and `updated_at`, returns Song | Unit test |
| 4 | `create()` with `album_name = null` inserts NULL | Unit test |
| 5 | `findById()` includes `WHERE deleted_at IS NULL` | Unit test |
| 6 | `findSongWithArtists()` executes 3-table LEFT JOIN | Unit test: verify SQL contains LEFT JOIN on song_artists and artists |
| 7 | `findSongWithArtists()` returns song with `artists: []` when no artists | Unit test: mock returns 1 row with NULL artist columns |
| 8 | `findSongWithArtists()` returns song with artists array when artists exist | Unit test: mock returns 2 rows → artists array has 2 entries |
| 9 | `findSongWithArtists()` returns null when song not found | Unit test: mock returns `[]` |
| 10 | `findAll()` excludes soft-deleted | Unit test |
| 11 | `findAllIncludingDeleted()` has no soft-delete filter | Unit test |
| 12 | `findByLanguageId()` filters by language + soft-delete | Unit test |
| 13 | `update()` SQL does NOT contain `added_at` in SET clause | Unit test: verify SQL string does not include `added_at` |
| 14 | `update()` updates name, album_name, language_id, updated_at | Unit test |
| 15 | `softDelete()` sets deleted_at + updated_at | Unit test |
| 16 | `restore()` nullifies deleted_at | Unit test |
| 17 | `count()` counts only active songs | Unit test |
| 18 | All SQL uses `?` placeholders | Unit test |

### 13.3 SongArtistRepository

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `SongArtist` type compiles with all 4 fields | `tsc --noEmit` |
| 2 | `SongArtistRepository` compiles with all 6 methods | `tsc --noEmit` |
| 3 | `add()` inserts with song_id, artist_id, sort_order, updated_at | Unit test |
| 4 | `add()` returns full SongArtist object | Unit test |
| 5 | `add()` duplicate pair → ConstraintError | Unit test: mock execute throws ConstraintError |
| 6 | `remove()` executes DELETE with both PK columns | Unit test: verify DELETE SQL |
| 7 | `remove()` does not throw for non-existent pair | Unit test: mock execute succeeds → no error |
| 8 | `updateSortOrder()` updates sort_order + updated_at | Unit test |
| 9 | `findBySongId()` returns all rows ordered by sort_order | Unit test: verify ORDER BY sort_order ASC |
| 10 | `findBySongId()` returns `[]` for song with no artists | Unit test |
| 11 | `findByArtistId()` returns all rows for an artist | Unit test |
| 12 | `count()` returns total junction rows | Unit test |
| 13 | All SQL uses `?` placeholders | Unit test |
| 14 | No soft-delete filter on any query | Code review: no `deleted_at` references in repository |

### 13.4 Global Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| G1 | All domain model files have zero imports | Grep `Artist.ts`, `Song.ts`, `SongArtist.ts` for `import` — zero matches |
| G2 | All repositories import only from `../database/` and `../../domain/models/` | Code review |
| G3 | `pnpm typecheck` passes from root | `pnpm typecheck` |
| G4 | `pnpm lint` passes for `packages/shared/` | `pnpm --filter @collectio/shared lint` |
| G5 | All unit tests pass with mocked `DatabaseConnection` | `pnpm --filter @collectio/shared test` |
| G6 | No platform imports in any file | Grep for `better-sqlite3`, `@capacitor`, `electron` — zero matches |
| G7 | `packages/shared/src/index.ts` exports all 9 new types/classes | Code review |
| G8 | All methods return `Promise<T>` | Unit tests verify `instanceof Promise` |
| G9 | Soft-delete pattern is consistent across ArtistRepository and SongRepository | Code review: compare WHERE clauses |

## 14. Test Cases

Tests follow the T09 pattern: `createMockDb()` helper with `queryResult` override, mock `DatabaseConnection` that records calls, `describe`/`it` blocks per method.

### 14.1 ArtistRepository Tests

```
Constructor:
  Test: constructor stores DatabaseConnection

create():
  Test: create generates UUID v4, sets created_at + updated_at, returns Artist
  Test: create uses ? placeholders, not string interpolation
  Test: create sets deleted_at = NULL
  Test: create returns Artist with all 5 fields populated

findById():
  Test: findById returns Artist when found (not soft-deleted)
  Test: findById uses WHERE id = ? AND deleted_at IS NULL
  Test: findById returns null when not found
  Test: findById returns null for soft-deleted artist (mock returns [] because WHERE excludes it)

findByName():
  Test: findByName returns ALL matching artists (3 "Various Artists")
  Test: findByName uses WHERE display_name = ? AND deleted_at IS NULL
  Test: findByName returns [] when no matches

findAll():
  Test: findAll returns active artists ordered by display_name
  Test: findAll uses WHERE deleted_at IS NULL
  Test: findAll returns [] when empty

findAllIncludingDeleted():
  Test: findAllIncludingDeleted returns ALL artists including soft-deleted
  Test: findAllIncludingDeleted SQL does NOT contain "deleted_at IS NULL"

update():
  Test: update updates display_name and updated_at
  Test: update uses WHERE id = ? AND deleted_at IS NULL (can't update soft-deleted)
  Test: update uses ? placeholders

softDelete():
  Test: softDelete sets deleted_at and updated_at
  Test: softDelete uses WHERE id = ? AND deleted_at IS NULL (prevents double-delete)

restore():
  Test: restore sets deleted_at = NULL and updates updated_at
  Test: restore uses WHERE id = ? AND deleted_at IS NOT NULL

count():
  Test: count returns number of active artists
  Test: count SQL includes WHERE deleted_at IS NULL

Async:
  Test: all mutation methods return Promise instances
```

### 14.2 SongRepository Tests

```
create():
  Test: create generates UUID, sets added_at + updated_at, returns Song
  Test: create with album_name = null inserts NULL
  Test: create with album_name = 'value' inserts the value
  Test: create uses ? placeholders
  Test: added_at is present in INSERT (verifies it's set)

findById():
  Test: findById returns Song when found
  Test: findById uses WHERE id = ? AND deleted_at IS NULL
  Test: findById returns null when not found

findSongWithArtists():
  Test: findSongWithArtists returns SongWithArtists with artists array when artists exist
    → Mock returns 2 rows → artists array length 2, sort_order values correct
    → Song fields from first row
  Test: findSongWithArtists returns SongWithArtists with empty artists array when no artists
    → Mock returns 1 row with NULL artist columns → artists: []
  Test: findSongWithArtists returns null when song not found
    → Mock returns []
  Test: findSongWithArtists SQL contains LEFT JOIN song_artists and LEFT JOIN artists
  Test: findSongWithArtists SQL filters a.deleted_at IS NULL (excludes deleted artists from join)

findAll():
  Test: findAll returns active songs ordered by updated_at DESC
  Test: findAll uses WHERE deleted_at IS NULL

findAllIncludingDeleted():
  Test: findAllIncludingDeleted returns all songs including soft-deleted

findByLanguageId():
  Test: findByLanguageId returns songs for a language
  Test: findByLanguageId uses WHERE language_id = ? AND deleted_at IS NULL

update():
  Test: update SQL does NOT contain 'added_at' anywhere
  Test: update updates name, album_name, language_id, updated_at
  Test: update uses WHERE id = ? AND deleted_at IS NULL
  Test: update with album_name = null sets NULL

softDelete():
  Test: softDelete sets deleted_at and updated_at
  Test: softDelete uses WHERE deleted_at IS NULL (prevents double-delete)

restore():
  Test: restore nullifies deleted_at, updates updated_at
  Test: restore uses WHERE deleted_at IS NOT NULL

count():
  Test: count returns number of active songs
  Test: count SQL includes WHERE deleted_at IS NULL

Async:
  Test: all mutation methods return Promise instances
```

### 14.3 SongArtistRepository Tests

```
add():
  Test: add inserts song_id, artist_id, sort_order, updated_at
  Test: add returns full SongArtist object
  Test: add duplicate pair throws ConstraintError
  Test: add uses ? placeholders

remove():
  Test: remove executes DELETE with both PK columns
  Test: remove does not throw for non-existent pair
  Test: remove uses ? placeholders

updateSortOrder():
  Test: updateSortOrder updates sort_order and updated_at
  Test: updateSortOrder uses WHERE song_id = ? AND artist_id = ?
  Test: updateSortOrder does not throw for non-existent pair
  Test: updateSortOrder sets updated_at to ISO-8601 timestamp

findBySongId():
  Test: findBySongId returns all rows for a song ordered by sort_order ASC
  Test: findBySongId returns [] for song with no artists
  Test: findBySongId includes rows even if song is soft-deleted (no deleted_at on junction)

findByArtistId():
  Test: findByArtistId returns all rows for an artist
  Test: findByArtistId returns [] for artist with no songs

count():
  Test: count returns total junction rows
  Test: count returns 0 for empty table

Async:
  Test: all mutation methods return Promise instances
```

## 15. Definition Of Done

### Domain Models
- [ ] `packages/shared/src/domain/models/Artist.ts` exists with `Artist` interface (5 fields)
- [ ] `Artist.ts` has zero imports
- [ ] `packages/shared/src/domain/models/Song.ts` exists with `Song`, `CreateSongInput`, `UpdateSongInput`, `SongWithArtists`, `SongArtistWithName` interfaces
- [ ] `CreateSongInput` has 3 fields: `name`, `album_name`, `language_id`
- [ ] `UpdateSongInput` has 3 fields: `name`, `album_name`, `language_id` — no `added_at`
- [ ] `SongWithArtists` extends `Song` and adds `artists: SongArtistWithName[]`
- [ ] `SongArtistWithName` has fields: `id`, `display_name`, `sort_order`
- [ ] `Song.ts` has zero imports
- [ ] `packages/shared/src/domain/models/SongArtist.ts` exists with `SongArtist` interface (4 fields)
- [ ] `SongArtist.ts` has zero imports

### ArtistRepository
- [ ] `packages/shared/src/data/repositories/ArtistRepository.ts` exists
- [ ] Constructor takes `DatabaseConnection` parameter
- [ ] 9 methods: `create`, `findById`, `findByName`, `findAll`, `findAllIncludingDeleted`, `update`, `softDelete`, `restore`, `count`
- [ ] All methods return `Promise<T>`
- [ ] `create()` auto-generates UUID v4 and ISO-8601 timestamps
- [ ] `findByName()` returns array (duplicate names allowed)
- [ ] All active queries include `WHERE deleted_at IS NULL`
- [ ] `findAllIncludingDeleted()` has no soft-delete filter
- [ ] `softDelete()` WHERE clause prevents double-delete
- [ ] `restore()` WHERE clause prevents no-op restore
- [ ] All SQL uses `?` placeholders
- [ ] Repository never calls `db.open()` or `db.close()`

### SongRepository
- [ ] `packages/shared/src/data/repositories/SongRepository.ts` exists
- [ ] Constructor takes `DatabaseConnection` parameter
- [ ] 10 methods: `create`, `findById`, `findSongWithArtists`, `findAll`, `findAllIncludingDeleted`, `findByLanguageId`, `update`, `softDelete`, `restore`, `count`
- [ ] All methods return `Promise<T>`
- [ ] `create()` auto-generates UUID v4, sets `added_at` and `updated_at`
- [ ] `update()` SQL SET clause does NOT contain `added_at` — immutable enforcement
- [ ] `findSongWithArtists()` uses 3-table LEFT JOIN with soft-delete filters on parent tables
- [ ] `findSongWithArtists()` groups rows into `SongWithArtists` object
- [ ] `findSongWithArtists()` returns `{ ...song, artists: [] }` when no artists
- [ ] `album_name` nullable handling: `null` → SQL NULL, string → SQL string
- [ ] All active queries include `WHERE deleted_at IS NULL`
- [ ] All SQL uses `?` placeholders
- [ ] Repository never calls `db.open()` or `db.close()`

### SongArtistRepository
- [ ] `packages/shared/src/data/repositories/SongArtistRepository.ts` exists
- [ ] Constructor takes `DatabaseConnection` parameter
- [ ] 6 methods: `findBySongId`, `findByArtistId`, `add`, `remove`, `updateSortOrder`, `count`
- [ ] All methods return `Promise<T>`
- [ ] `add()` sets `updated_at` to current UTC ISO-8601
- [ ] `remove()` sets `updated_at` to current UTC ISO-8601
- [ ] `updateSortOrder()` sets `updated_at` to current UTC ISO-8601
- [ ] No soft-delete filtering on any query (`song_artists` has no `deleted_at`)
- [ ] `findBySongId()` orders by `sort_order ASC`
- [ ] All SQL uses `?` placeholders
- [ ] Repository never calls `db.open()` or `db.close()`

### Tests
- [ ] `ArtistRepository.test.ts` created with all test cases from §14.1
- [ ] `SongRepository.test.ts` created with all test cases from §14.2
- [ ] `SongArtistRepository.test.ts` created with all test cases from §14.3

### Global
- [ ] `packages/shared/src/index.ts` re-exports all 9 new types and repositories
- [ ] All domain model files have zero imports
- [ ] No platform imports in any repository file
- [ ] `pnpm typecheck` passes with zero errors
- [ ] `pnpm --filter @collectio/shared lint` passes with zero errors
- [ ] `pnpm --filter @collectio/shared test` passes with zero failures
- [ ] All 3 repository files and all 3 test files exist and pass review

---

_End of Implementation Specification_
