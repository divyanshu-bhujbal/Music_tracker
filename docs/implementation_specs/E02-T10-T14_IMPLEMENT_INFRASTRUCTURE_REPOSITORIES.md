# E-02 T10-T14 — Implement Infrastructure Repositories

**Parent Epic:** E-02: Database Layer  
**Type:** Production Implementation (Data Layer — Repositories)  
**Criticality:** FOUNDATION — these repositories complete the data access layer for all infrastructure and reference tables. Every component above (Application, Sync Engine, Settings Manager, UI) reads/writes exclusively through these repositories. T09 established the pattern; T10-T14 apply it to the remaining 5 tables.

---

## 1. Goal

Implement 5 typed repository classes covering all infrastructure and reference tables not yet handled by T09. Each follows the T09 pattern: constructor-injected `DatabaseConnection`, async methods returning `Promise<T>`, parameterized SQL via `?` placeholders, domain model types in `packages/shared/src/domain/models/`, and unit tests with mocked `DatabaseConnection`.

| Task | Repository | Table | Domain Model | Key Pattern |
|------|-----------|-------|-------------|-------------|
| T10 | `DeviceRepository` | `devices` | `Device`, `Platform` | UUID generation, platform enum |
| T11 | `LanguageRepository` | `languages` | `Language` | Search, seed validation, user-flag |
| T12 | `CategoryRepository` | `categories` | `Category` | Read-only, `findEnabled()` |
| T13 | `SyncLogRepository` | `sync_log` | `SyncLog`, `SyncDirection`, `SyncStatus`, `CreateSyncLogInput` | Insert-then-update lifecycle |
| T14 | `AppSettingsRepository` | `app_settings` | `AppSettingsKey` | Mirrors T09 + `updated_at` management |

---

## 2. Scope

| In Scope | Rationale |
|----------|-----------|
| Domain model types for all 5 tables | Pure TypeScript — zero imports. Follows `AppMetadataKey.ts` pattern |
| `AppSettingsKey` string literal union + runtime array | Mirrors `AppMetadataKey` — 5 well-known keys with runtime validation |
| `DeviceRepository` — register, find, update, list | Device lifecycle management for sync infrastructure |
| `LanguageRepository` — CRUD, search, seeded/user split | Reference data access; user additions flagged |
| `CategoryRepository` — read-only queries | Categories managed by software (migrations), not users |
| `SyncLogRepository` — create in-progress entry, mark complete, query | Sync event logging for diagnostics and sidebar UI |
| `AppSettingsRepository` — get, set, getAll, has | User-configurable settings with `updated_at` for LWW sync |
| `AppSettingsRepository.set()` auto-sets `updated_at` | Every write updates the LWW timestamp; caller provides only key+value |
| `DeviceRepository` auto-generates `registered_at`, `last_seen_at` | Timestamps are repository responsibility, not caller's |
| `SyncLogRepository` auto-sets `started_at` and `status` on create | Immutable audit trail fields are repository-managed |
| Barrel re-exports from `packages/shared/src/index.ts` | All types and classes importable via `@collectio/shared` |
| Unit tests with mocked `DatabaseConnection` for all 5 repositories | Verifies SQL correctness, parameter binding, async behavior, error handling |

---

## 3. Out of Scope

| Out of Scope | Why | Where It Belongs |
|-------------|-----|-----------------|
| T15 (SongRepository, ArtistRepository, SongArtistRepository) | Separate task — songs category tables are user-content entities with soft-delete | E-02 T-02.15 |
| Repository interface abstractions (`IDeviceRepository`, etc.) | Domain layer repository interfaces are a separate concern; T09 shipped concrete class only | Domain layer — not required by these tasks |
| Soft-delete filtering (`WHERE deleted_at IS NULL`) | None of the T10-T14 tables have `deleted_at` — they are infrastructure/reference tables, not user-content entities | Only T15 (songs, artists, song_artists) |
| `LanguageRepository.update()` / `LanguageRepository.delete()` | Language editing is not a V1 requirement. Only create (for user additions) is needed | Could be added in future |
| `CategoryRepository` write methods | Categories are inserted by migration 001 only. No create/update/delete | Migration files |
| `SyncLogRepository.delete()` | Sync logs are an append-only audit trail | Not needed in V1 |
| `AppSettingsRepository` batch writes or multi-key atomicity | V1 writes one setting at a time | Could be added later |
| Value type coercion (e.g., parsing `'120'` as integer) | Repository returns raw strings. Callers interpret values | Caller (Settings Manager, Sync Engine) |
| Multilingual search / full-text indexing on languages | V1 uses simple `LIKE '%query%'` on `name` and `native_name` | Search/Filter Engine (E-08) |
| SyncLog auto-pagination or time-range filtering | V1 returns all logs or limited by count | Could be added in future |

---

## 4. Files To Create

### 4.1 T10 — DeviceRepository

| # | File | Purpose | Responsibility |
|---|------|---------|---------------|
| 1 | `packages/shared/src/domain/models/Device.ts` | Domain model: `Device` entity and `Platform` type | Exports `Device` interface with fields: `id` (string UUID), `name` (string), `platform` (`'ANDROID' \| 'WINDOWS'`), `registered_at` (ISO-8601 string), `last_seen_at` (ISO-8601 string). Also exports `Platform` type — the string literal union `'ANDROID' \| 'WINDOWS'`. Pure TypeScript — zero imports. |
| 2 | `packages/shared/src/data/repositories/DeviceRepository.ts` | Repository class: typed CRUD for `devices` table | Exports `DeviceRepository` class. Constructor takes `DatabaseConnection`. Methods: `register(name, platform)`, `findById(id)`, `findAll()`, `updateLastSeen(id)`, `findByPlatform(platform)`, `count()`. All methods return `Promise<T>`. `register()` auto-generates UUID v4, sets `registered_at` and `last_seen_at` to `new Date().toISOString()`. `updateLastSeen()` sets `last_seen_at` to current UTC ISO-8601. All SQL uses `?` placeholder parameterized queries. No soft-delete filtering (infrastructure table has no `deleted_at`). |
| 3 | `packages/shared/src/data/repositories/__tests__/DeviceRepository.test.ts` | Unit tests with mocked `DatabaseConnection` | Mocks `DatabaseConnection` to record calls and return configurable results. Tests: all methods with normal/empty/error cases. |

### 4.2 T11 — LanguageRepository

| # | File | Purpose | Responsibility |
|---|------|---------|---------------|
| 4 | `packages/shared/src/domain/models/Language.ts` | Domain model: `Language` entity | Exports `Language` interface with fields: `id` (number), `iso_code` (string), `name` (string), `native_name` (string), `user_added` (number — 0 or 1), `created_at` (ISO-8601 string). Pure TypeScript — zero imports. |
| 5 | `packages/shared/src/data/repositories/LanguageRepository.ts` | Repository class: typed CRUD + search for `languages` table | Exports `LanguageRepository` class. Constructor takes `DatabaseConnection`. Methods: `findById(id)`, `findByIsoCode(isoCode)`, `findAll()`, `findSeeded()` (user_added=0), `findUserAdded()` (user_added=1), `search(query)` (LIKE on name OR native_name), `create(isoCode, name, nativeName)`, `count()`. All methods return `Promise<T>`. `create()` auto-sets `user_added=1`, `created_at` to current UTC ISO-8601. `search()` wraps query in `%` wildcards and uses parameterized LIKE. No soft-delete (reference table). |
| 6 | `packages/shared/src/data/repositories/__tests__/LanguageRepository.test.ts` | Unit tests with mocked `DatabaseConnection` | Tests: all methods with normal/empty/error cases, seed count verification (60 languages), search with partial match. |

### 4.3 T12 — CategoryRepository

| # | File | Purpose | Responsibility |
|---|------|---------|---------------|
| 7 | `packages/shared/src/domain/models/Category.ts` | Domain model: `Category` entity | Exports `Category` interface with fields: `id` (string slug), `display_name` (string), `icon_name` (string), `enabled` (number — 0 or 1), `sort_order` (number), `introduced_in_version` (string). Pure TypeScript — zero imports. |
| 8 | `packages/shared/src/data/repositories/CategoryRepository.ts` | Repository class: read-only queries for `categories` table | Exports `CategoryRepository` class. Constructor takes `DatabaseConnection`. Methods: `findById(id)`, `findAll()`, `findEnabled()` (WHERE enabled=1 ORDER BY sort_order), `count()`. All methods return `Promise<T>`. No write methods — categories are managed by software (migration seed data). No soft-delete (reference table). |
| 9 | `packages/shared/src/data/repositories/__tests__/CategoryRepository.test.ts` | Unit tests with mocked `DatabaseConnection` | Tests: all read methods, empty result handling, `findEnabled()` ordering. |

### 4.4 T13 — SyncLogRepository

| # | File | Purpose | Responsibility |
|---|------|---------|---------------|
| 10 | `packages/shared/src/domain/models/SyncLog.ts` | Domain model: `SyncLog` entity, direction/status types, create input | Exports `SyncDirection` type (`'UPLOAD' \| 'DOWNLOAD' \| 'MERGE'`), `SyncStatus` type (`'SUCCESS' \| 'FAILURE' \| 'IN_PROGRESS'`), `SyncLog` interface (id, device_id, started_at, completed_at, direction, status, records_affected, error_message), and `CreateSyncLogInput` interface (device_id, direction — the fields the caller provides). Pure TypeScript — zero imports. |
| 11 | `packages/shared/src/data/repositories/SyncLogRepository.ts` | Repository class: create + update lifecycle for `sync_log` table | Exports `SyncLogRepository` class. Constructor takes `DatabaseConnection`. Methods: `findById(id)`, `findByDeviceId(deviceId)`, `findRecent(limit?)`, `create(input)`, `markCompleted(id, status, recordsAffected, errorMessage?)`, `count()`. All methods return `Promise<T>`. `create()` auto-sets `started_at` to current UTC ISO-8601, `status='IN_PROGRESS'`, `records_affected=0`. `markCompleted()` sets `completed_at` to current UTC ISO-8601, updates status/records_affected/error_message. `findRecent()` defaults to 20 rows, ordered by `started_at DESC`. No soft-delete (log table). |
| 12 | `packages/shared/src/data/repositories/__tests__/SyncLogRepository.test.ts` | Unit tests with mocked `DatabaseConnection` | Tests: create sets IN_PROGRESS, markCompleted updates fields, findRecent ordering, nullable completed_at/error_message handling. |

### 4.5 T14 — AppSettingsRepository

| # | File | Purpose | Responsibility |
|---|------|---------|---------------|
| 13 | `packages/shared/src/domain/models/AppSettingsKey.ts` | Domain model: well-known `app_settings` keys | Exports `AppSettingsKey` type — a string literal union of the 5 keys: `'trash_retention_days'`, `'theme'`, `'default_view'`, `'sync_on_startup'`, `'auto_sync_delay_seconds'`. Also exports `APP_SETTINGS_KEYS` readonly array for runtime validation. Pure TypeScript — zero imports. |
| 14 | `packages/shared/src/data/repositories/AppSettingsRepository.ts` | Repository class: typed key-value with `updated_at` tracking | Exports `AppSettingsRepository` class. Constructor takes `DatabaseConnection`. Methods: `get(key)`, `set(key, value)`, `getAll()`, `has(key)`. Mirrors T09 `AppMetadataRepository` API with one difference: `set()` also updates `updated_at` to current UTC ISO-8601. All methods validate keys against `APP_SETTINGS_KEYS`. All SQL uses `?` placeholders. |
| 15 | `packages/shared/src/data/repositories/__tests__/AppSettingsRepository.test.ts` | Unit tests with mocked `DatabaseConnection` | Tests: mirrors T09 test structure — get/set/getAll/has with key validation, plus `updated_at` timestamp verification on set(). |

---

## 5. Files To Modify

| # | File | Change | Rationale |
|---|------|--------|-----------|
| 1 | `packages/shared/src/index.ts` | Add barrel re-exports for all 5 new domain models and 5 new repository classes | Makes all types and repositories importable via `@collectio/shared`. Add exports: `Device`, `Platform`, `DeviceRepository`, `Language`, `LanguageRepository`, `Category`, `CategoryRepository`, `SyncLog`, `SyncDirection`, `SyncStatus`, `CreateSyncLogInput`, `SyncLogRepository`, `AppSettingsKey`, `APP_SETTINGS_KEYS`, `AppSettingsRepository` |
| 2 | `packages/shared/tsconfig.json` | No change required | `include: ["src"]` already covers new files |
| 3 | `packages/shared/package.json` | No change required | No new dependencies — pure TypeScript, no native/third-party packages needed |

---

## 6. Interfaces

### 6.1 T10 — DeviceRepository Public API

**Constructor:** `constructor(db: DatabaseConnection)`

**Method: `async register(name: string, platform: Platform): Promise<Device>`**
- Generates UUID v4 for `id` (via `crypto.randomUUID()` — available in Node 19+ and all modern browsers/WebViews)
- Sets `registered_at = new Date().toISOString()`
- Sets `last_seen_at = new Date().toISOString()`
- Executes `INSERT INTO devices (id, name, platform, registered_at, last_seen_at) VALUES (?, ?, ?, ?, ?)`
- Returns the full `Device` object (same fields as inserted)

**Method: `async findById(id: string): Promise<Device | null>`**
- Executes `SELECT * FROM devices WHERE id = ?`
- Returns `Device` if found, `null` if not

**Method: `async findAll(): Promise<Device[]>`**
- Executes `SELECT * FROM devices ORDER BY registered_at DESC`
- Returns all devices (no soft-delete — `devices` has no `deleted_at`)
- Empty table returns `[]`

**Method: `async updateLastSeen(id: string): Promise<void>`**
- Executes `UPDATE devices SET last_seen_at = ? WHERE id = ?`
- `last_seen_at` is current UTC ISO-8601 string
- Does NOT throw if device doesn't exist — no-op for missing device

**Method: `async findByPlatform(platform: Platform): Promise<Device[]>`**
- Executes `SELECT * FROM devices WHERE platform = ? ORDER BY registered_at DESC`
- Returns matching devices or `[]`

**Method: `async count(): Promise<number>`**
- Executes `SELECT COUNT(*) AS count FROM devices`
- Returns count as number

### 6.2 T11 — LanguageRepository Public API

**Constructor:** `constructor(db: DatabaseConnection)`

**Method: `async findById(id: number): Promise<Language | null>`**
- Executes `SELECT * FROM languages WHERE id = ?`
- Returns `Language` if found, `null` if not

**Method: `async findByIsoCode(isoCode: string): Promise<Language | null>`**
- Executes `SELECT * FROM languages WHERE iso_code = ?`
- Returns `Language` if found, `null` if not (e.g., nonexistent ISO code)

**Method: `async findAll(): Promise<Language[]>`**
- Executes `SELECT * FROM languages ORDER BY name ASC`
- Returns all languages or `[]`

**Method: `async findSeeded(): Promise<Language[]>`**
- Executes `SELECT * FROM languages WHERE user_added = 0 ORDER BY name ASC`
- Returns seeded languages (expect ~60) or `[]`

**Method: `async findUserAdded(): Promise<Language[]>`**
- Executes `SELECT * FROM languages WHERE user_added = 1 ORDER BY created_at DESC`
- Returns user-added languages or `[]`

**Method: `async search(query: string): Promise<Language[]>`**
- Executes `SELECT * FROM languages WHERE name LIKE ? OR native_name LIKE ? ORDER BY name ASC`
- Query wrapped in `%` on both sides: param is `%query%`
- Returns matching languages or `[]`
- Empty query returns `[]`

**Method: `async create(isoCode: string, name: string, nativeName: string): Promise<Language>`**
- Sets `user_added = 1`, `created_at = new Date().toISOString()`
- Executes `INSERT INTO languages (iso_code, name, native_name, user_added, created_at) VALUES (?, ?, ?, 1, ?)`
- Returns the full `Language` object (id comes from autoincrement)
- Throws `ConstraintError` if `iso_code` already exists (UNIQUE constraint)
- Throws `ConstraintError` if name or native_name is empty (NOT NULL constraint)
- Gets auto-generated `id` via `last_insert_rowid()` — requires `db.query("SELECT last_insert_rowid() AS id")` or using the id from the insert result

**Method: `async count(): Promise<number>`**
- Executes `SELECT COUNT(*) AS count FROM languages`
- Returns count as number

### 6.3 T12 — CategoryRepository Public API

**Constructor:** `constructor(db: DatabaseConnection)`

**Method: `async findById(id: string): Promise<Category | null>`**
- Executes `SELECT * FROM categories WHERE id = ?`
- Returns `Category` if found, `null` if not

**Method: `async findAll(): Promise<Category[]>`**
- Executes `SELECT * FROM categories ORDER BY sort_order ASC`
- Returns all categories or `[]`

**Method: `async findEnabled(): Promise<Category[]>`**
- Executes `SELECT * FROM categories WHERE enabled = 1 ORDER BY sort_order ASC`
- Returns enabled categories (what the sidebar navigation displays) or `[]`

**Method: `async count(): Promise<number>`**
- Executes `SELECT COUNT(*) AS count FROM categories`
- Returns count as number

### 6.4 T13 — SyncLogRepository Public API

**Constructor:** `constructor(db: DatabaseConnection)`

**Method: `async findById(id: number): Promise<SyncLog | null>`**
- Executes `SELECT * FROM sync_log WHERE id = ?`
- Returns `SyncLog` if found, `null` if not

**Method: `async findByDeviceId(deviceId: string): Promise<SyncLog[]>`**
- Executes `SELECT * FROM sync_log WHERE device_id = ? ORDER BY started_at DESC`
- Returns matching logs or `[]`

**Method: `async findRecent(limit: number = 20): Promise<SyncLog[]>`**
- Executes `SELECT * FROM sync_log ORDER BY started_at DESC LIMIT ?`
- Default limit is 20
- Returns recent logs or `[]`

**Method: `async create(input: CreateSyncLogInput): Promise<SyncLog>`**
- `CreateSyncLogInput` has fields: `device_id` (string), `direction` (SyncDirection)
- Sets `started_at = new Date().toISOString()`, `status = 'IN_PROGRESS'`, `records_affected = 0`, `completed_at = null`, `error_message = null`
- Executes `INSERT INTO sync_log (device_id, started_at, completed_at, direction, status, records_affected, error_message) VALUES (?, ?, NULL, ?, 'IN_PROGRESS', 0, NULL)`
- Returns full `SyncLog` object including auto-generated `id`
- Gets auto-generated `id` via `last_insert_rowid()` query

**Method: `async markCompleted(id: number, status: SyncStatus, recordsAffected: number, errorMessage?: string): Promise<void>`**
- Sets `completed_at = new Date().toISOString()`
- `status` must be `'SUCCESS'` or `'FAILURE'` (not `'IN_PROGRESS'`)
- Executes `UPDATE sync_log SET status = ?, completed_at = ?, records_affected = ?, error_message = ? WHERE id = ?`
- `error_message` is `null` when not provided (SUCCESS case)
- Does NOT throw if id doesn't exist — no-op for missing log

**Method: `async count(): Promise<number>`**
- Executes `SELECT COUNT(*) AS count FROM sync_log`
- Returns count as number

### 6.5 T14 — AppSettingsRepository Public API

**Constructor:** `constructor(db: DatabaseConnection)`

**Method: `async get(key: AppSettingsKey): Promise<string | null>`**
- Validates `key` is in `APP_SETTINGS_KEYS` — throws `DatabaseError` if not
- Executes `SELECT value FROM app_settings WHERE key = ?` with parameterized key
- Returns value string if found, `null` if no row

**Method: `async set(key: AppSettingsKey, value: string): Promise<void>`**
- Validates `key` is in `APP_SETTINGS_KEYS` — throws `DatabaseError` if not
- Generates `updated_at = new Date().toISOString()`
- Executes `INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)` with parameterized key, value, and timestamp
- `INSERT OR REPLACE` handles both insert (new key) and update (existing key)
- **Key difference from T09:** `app_settings` has `updated_at` column — every write must update it

**Method: `async getAll(): Promise<Partial<Record<AppSettingsKey, string>>>`**
- Executes `SELECT key, value FROM app_settings`
- Returns plain object mapping present keys to their values
- Empty database returns `{}`

**Method: `async has(key: AppSettingsKey): Promise<boolean>`**
- Validates `key` is in `APP_SETTINGS_KEYS` — throws `DatabaseError` if not
- Executes `SELECT 1 AS one FROM app_settings WHERE key = ?`
- Returns `true` if row exists, `false` otherwise

**Private method: `validateKey(key: string): asserts key is AppSettingsKey`**
- Checks `APP_SETTINGS_KEYS.includes(key as AppSettingsKey)`
- Throws `DatabaseError("Unknown app_settings key: '${key}'")` if not in set
- Called by `get()`, `set()`, and `has()`

### 6.6 Domain Model Types Summary

| File | Exports | Purpose |
|------|---------|---------|
| `Device.ts` | `Device` interface, `Platform` type | Device entity for sync participant tracking |
| `Language.ts` | `Language` interface | Reference language entity (60 seeded + user additions) |
| `Category.ts` | `Category` interface | Read-only category definition (songs, future: books...) |
| `SyncLog.ts` | `SyncLog` interface, `SyncDirection` type, `SyncStatus` type, `CreateSyncLogInput` interface | Sync audit trail types |
| `AppSettingsKey.ts` | `AppSettingsKey` type, `APP_SETTINGS_KEYS` array | Closed key set for user-configurable settings |

### 6.7 Repository SQL Operations Summary

| Repository | Operation | Interface Method | SQL Pattern |
|-----------|-----------|-----------------|-------------|
| DeviceRepository | Register | `db.execute("INSERT INTO devices ... VALUES (?, ?, ?, ?, ?)", [...])` | INSERT with ? params |
| DeviceRepository | Find by ID | `db.query<Device>("SELECT * FROM devices WHERE id = ?", [id])` | SELECT with ? params |
| DeviceRepository | Find all | `db.query<Device>("SELECT * FROM devices ORDER BY registered_at DESC")` | SELECT, no params |
| DeviceRepository | Update last seen | `db.execute("UPDATE devices SET last_seen_at = ? WHERE id = ?", [...])` | UPDATE with ? params |
| DeviceRepository | Find by platform | `db.query<Device>("SELECT * FROM devices WHERE platform = ? ORDER BY registered_at DESC", [...])` | SELECT with ? params |
| LanguageRepository | Search | `db.query<Language>("SELECT * FROM languages WHERE name LIKE ? OR native_name LIKE ? ORDER BY name ASC", ["%query%", "%query%"])` | SELECT with LIKE and ? params |
| LanguageRepository | Create | `db.execute("INSERT INTO languages ... VALUES (?, ?, ?, 1, ?)", [...])` | INSERT with ? params |
| CategoryRepository | Find enabled | `db.query<Category>("SELECT * FROM categories WHERE enabled = 1 ORDER BY sort_order ASC")` | SELECT, no params |
| SyncLogRepository | Create | `db.execute("INSERT INTO sync_log ... VALUES (?, ?, NULL, ?, 'IN_PROGRESS', 0, NULL)", [...])` | INSERT with ? params |
| SyncLogRepository | Mark completed | `db.execute("UPDATE sync_log SET status = ?, completed_at = ?, records_affected = ?, error_message = ? WHERE id = ?", [...])` | UPDATE with ? params |
| AppSettingsRepository | Set | `db.execute("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)", [...])` | INSERT OR REPLACE with ? params |

### 6.8 Auto-Generated ID Retrieval Pattern

For tables with AUTOINCREMENT primary keys (`languages`, `sync_log`), after `INSERT`, retrieve the generated ID:

```
// After INSERT into languages or sync_log:
const rows = await this.db.query<{ id: number }>('SELECT last_insert_rowid() AS id');
const generatedId = rows[0].id;
```

This pattern is required because the `DatabaseConnection` interface's `execute()` returns `void` — it does not expose `lastInsertRowid`. The `query()` method on a `SELECT last_insert_rowid()` immediately after the insert is the standard SQLite pattern.

---

## 7. Data Flow

### 7.1 DeviceRepository Flow

```
Caller (first-launch setup, SyncEngine)
  │
  ├─ const device = await repo.register('My Laptop', 'WINDOWS')
  │     └─ Generates UUID, sets timestamps
  │     └─ INSERT INTO devices ... VALUES (?, ?, ?, ?, ?)
  │     └─ SELECT last_insert_rowid() — but devices uses TEXT UUID PK, no autoincrement
  │     └─ Returns full Device { id, name, platform, registered_at, last_seen_at }
  │
  ├─ const device = await repo.findById('550e8400-...')
  │     └─ SELECT * FROM devices WHERE id = ?
  │     └─ Returns Device or null
  │
  └─ await repo.updateLastSeen('550e8400-...')
        └─ UPDATE devices SET last_seen_at = ? WHERE id = ?
        └─ Returns void
```

### 7.2 LanguageRepository Flow

```
Caller (Song create/edit form, Language autocomplete)
  │
  ├─ const results = await repo.search('jap')
  │     └─ SELECT * FROM languages WHERE name LIKE '%jap%' OR native_name LIKE '%jap%' ORDER BY name ASC
  │     └─ Returns [{ id: 28, iso_code: 'ja', name: 'Japanese', native_name: '日本語', ... }]
  │
  ├─ const lang = await repo.create('xx', 'CustomLang', 'CustomLang')
  │     └─ user_added = 1, created_at = now
  │     └─ INSERT INTO languages ... VALUES (?, ?, ?, 1, ?)
  │     └─ SELECT last_insert_rowid()
  │     └─ Returns full Language with generated id
  │     └─ Throws ConstraintError if iso_code='xx' already exists
  │
  └─ const seeded = await repo.findSeeded()
        └─ SELECT * FROM languages WHERE user_added = 0 ORDER BY name ASC
        └─ Returns ~60 languages
```

### 7.3 CategoryRepository Flow

```
Caller (Sidebar CategoryNav, CategoryRegistry)
  │
  └─ const enabled = await repo.findEnabled()
        └─ SELECT * FROM categories WHERE enabled = 1 ORDER BY sort_order ASC
        └─ Returns [{ id: 'songs', display_name: 'Songs', icon_name: 'music-note', ... }]
        └─ Sidebar renders one nav item per enabled category
```

### 7.4 SyncLogRepository Flow

```
Caller (SyncEngine)
  │
  ├─ const log = await repo.create({ device_id: 'abc', direction: 'MERGE' })
  │     └─ Sets started_at=now, status='IN_PROGRESS', records_affected=0
  │     └─ INSERT INTO sync_log ... VALUES (?, ?, NULL, ?, 'IN_PROGRESS', 0, NULL)
  │     └─ SELECT last_insert_rowid()
  │     └─ Returns full SyncLog with generated id
  │
  ├─ ... sync algorithm runs ...
  │
  ├─ await repo.markCompleted(log.id, 'SUCCESS', 15)
  │     └─ Sets completed_at=now, status='SUCCESS', records_affected=15, error_message=null
  │     └─ UPDATE sync_log SET status=?, completed_at=?, records_affected=?, error_message=? WHERE id=?
  │
  └─ const recent = await repo.findRecent(10)
        └─ SELECT * FROM sync_log ORDER BY started_at DESC LIMIT 10
        └─ Sidebar displays last sync status from most recent log
```

### 7.5 AppSettingsRepository Flow

```
Caller (Settings Manager, SyncEngine for sync_on_startup/auto_sync_delay_seconds)
  │
  ├─ const theme = await repo.get('theme')
  │     └─ validateKey('theme') → valid
  │     └─ query("SELECT value FROM app_settings WHERE key = ?", ['theme'])
  │     └─ Returns 'light' or null
  │
  ├─ await repo.set('theme', 'dark')
  │     └─ validateKey('theme') → valid
  │     └─ updated_at = new Date().toISOString()
  │     └─ execute("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)", ['theme', 'dark', '<timestamp>'])
  │     └─ Returns void
  │
  └─ const all = await repo.getAll()
        └─ query("SELECT key, value FROM app_settings")
        └─ Returns { theme: 'dark', sync_on_startup: 'true', ... }
```

### 7.6 Import Chain

```
@collectio/shared (all types + repositories)
        ↑
apps/* (main.ts / index.tsx — creates repo instances, injects connection)
packages/renderer/ (hooks, components — imports types from @collectio/shared)
packages/platform/ (providers, adapters — imports types from @collectio/shared)
```

---

## 8. State Changes

### 8.1 Repository Internal State

All 5 repositories are stateless beyond the stored `DatabaseConnection` reference. No caching, no in-memory maps, no dirty tracking.

| Field | Type | Purpose |
|-------|------|---------|
| `db` | `DatabaseConnection` (private readonly) | Injected connection; never replaced |

### 8.2 Database State

| Repository | Operation | Database Effect |
|-----------|-----------|----------------|
| DeviceRepository | `register()` | INSERT new row in `devices` |
| DeviceRepository | `updateLastSeen()` | UPDATE `last_seen_at` on a `devices` row |
| DeviceRepository | `findById()`, `findAll()`, `findByPlatform()`, `count()` | No change (read-only) |
| LanguageRepository | `create()` | INSERT new row in `languages`; autoincrement id |
| LanguageRepository | `findById()`, `findByIsoCode()`, `findAll()`, `findSeeded()`, `findUserAdded()`, `search()`, `count()` | No change (read-only) |
| CategoryRepository | `findById()`, `findAll()`, `findEnabled()`, `count()` | No change (read-only) |
| SyncLogRepository | `create()` | INSERT new row in `sync_log`; autoincrement id |
| SyncLogRepository | `markCompleted()` | UPDATE `status`, `completed_at`, `records_affected`, `error_message` on a `sync_log` row |
| SyncLogRepository | `findById()`, `findByDeviceId()`, `findRecent()`, `count()` | No change (read-only) |
| AppSettingsRepository | `set()` | INSERT OR REPLACE row in `app_settings`; sets `updated_at` |
| AppSettingsRepository | `get()`, `getAll()`, `has()` | No change (read-only) |

### 8.3 Timestamp Generation Policy

| Timestamp Field | Generated By | When | ISO-8601 Format |
|----------------|-------------|------|-----------------|
| `devices.registered_at` | DeviceRepository | `register()` call | `new Date().toISOString()` |
| `devices.last_seen_at` | DeviceRepository | `register()` and `updateLastSeen()` calls | `new Date().toISOString()` |
| `languages.created_at` | LanguageRepository | `create()` call | `new Date().toISOString()` |
| `sync_log.started_at` | SyncLogRepository | `create()` call | `new Date().toISOString()` |
| `sync_log.completed_at` | SyncLogRepository | `markCompleted()` call | `new Date().toISOString()` |
| `app_settings.updated_at` | AppSettingsRepository | `set()` call | `new Date().toISOString()` |

All timestamps are UTC ISO-8601 strings (`2026-06-24T12:00:00.000Z`). The `new Date().toISOString()` method always produces UTC — no timezone conversion needed.

---

## 9. Database Changes

**None.** All 5 repositories read from and write to existing tables created by migration 001 (`001_core_infrastructure.sql`). No schema changes, no new tables, no index creation, no ALTER statements.

---

## 10. Error Handling

### 10.1 Common Error Scenarios

| Error Condition | Detection | Response |
|----------------|-----------|----------|
| `DatabaseConnection` throws on any method | Catch from underlying connection | Re-throw the original error as-is. The connection already wraps native errors in `DatabaseError`/`ConstraintError` |
| Language `create()` with duplicate `iso_code` | UNIQUE constraint violation from SQLite | DB throws `ConstraintError` — repository re-throws as-is |
| Language `create()` with empty name/nativeName | NOT NULL constraint violation from SQLite | DB throws `ConstraintError` — repository re-throws as-is |
| `SyncLogRepository.markCompleted()` with non-existent id | No rows matched by UPDATE | No error — UPDATE affecting 0 rows is valid (no-op) |
| `DeviceRepository.updateLastSeen()` with non-existent id | No rows matched by UPDATE | No error — UPDATE affecting 0 rows is valid (no-op) |
| `AppSettingsRepository.get()` with key that has no row | `query()` returns `[]` | Return `null` — not an error |
| `AppSettingsRepository.get()`/`set()`/`has()` with unknown key | `APP_SETTINGS_KEYS.includes()` returns false | Throw `DatabaseError("Unknown app_settings key: '${key}'")` |

### 10.2 Repository-Specific Error Handling

**T10 DeviceRepository:** No custom validation. `platform` is checked at the TypeScript level by the `Platform` type. Runtime casts via `as Platform` could pass invalid values — SQLite CHECK constraint rejects them with `ConstraintError`.

**T11 LanguageRepository:** `create()` may throw `ConstraintError` for duplicate ISO codes or empty names. `search()` with empty string returns `[]` — no error.

**T12 CategoryRepository:** Read-only — only errors come from the connection layer (e.g., table doesn't exist if migration failed).

**T13 SyncLogRepository:** `create()` validates input via TypeScript types. `markCompleted()` accepts `null` for `errorMessage` (success case) and a string for failure case. Does NOT validate that `status` is `'SUCCESS'` or `'FAILURE'` at runtime — this is a TypeScript-level constraint (`SyncStatus`).

**T14 AppSettingsRepository:** Mirrors T09 error handling exactly. Key validation precedes all SQL operations. Invalid keys never reach the database.

### 10.3 Error Message Format

```
DatabaseError: Unknown app_settings key: 'invalid_key'
ConstraintError: NOT NULL constraint failed: languages.name
```

### 10.4 SQL Error Propagation

If the underlying `DatabaseConnection` throws (e.g., database file corruption, disk full, FK violation on `sync_log.device_id`), the error is re-thrown as-is. The repository does not wrap or suppress connection-level errors.

---

## 11. Logging Requirements

**None.** Repositories are thin data access layers. Logging is the caller's responsibility. The `SyncLogRepository` itself does not log — it is the target of logging by the SyncEngine.

---

## 12. Security Requirements

| Requirement | Status |
|------------|--------|
| Parameterized queries — no SQL injection | ENFORCED — all SQL uses `?` placeholders with parameter arrays. Zero string interpolation or template literals |
| No secrets stored by repositories | PASS — no repository stores or processes encryption keys, passwords, or tokens |
| `AppSettingsRepository` key validation prevents EAV abuse | ENFORCED — runtime validation rejects unknown keys; closed key set prevents arbitrary data storage |
| No connection lifecycle management | PASS — `open()`/`close()` are the caller's responsibility; repositories never open or close connections |
| UUID generation uses `crypto.randomUUID()` | ENFORCED — available in Node 19+, Electron 30.5.1 (Node 20.16.0), and Capacitor WebView. No external UUID library needed |

---

## 13. Acceptance Criteria

### 13.1 T10 — DeviceRepository

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `Device` and `Platform` types compile | `tsc --noEmit` — zero errors |
| 2 | `Device` has all 5 fields matching migration 001 | Unit test: verify interface |
| 3 | `DeviceRepository` compiles with all 6 methods | `tsc --noEmit` |
| 4 | `register()` generates UUID, sets timestamps, inserts row | Unit test: verify UUID format, ISO-8601 timestamps, correct INSERT SQL |
| 5 | `findById()` returns Device when found | Unit test: mock query returns row → returns Device |
| 6 | `findById()` returns null when not found | Unit test: mock query returns `[]` → returns null |
| 7 | `findAll()` returns all devices ordered by `registered_at DESC` | Unit test: verify SELECT + ORDER BY |
| 8 | `updateLastSeen()` updates timestamp | Unit test: verify UPDATE SQL with ISO-8601 timestamp |
| 9 | `updateLastSeen()` does not throw for non-existent device | Unit test: mock execute succeeds → no error |
| 10 | `findByPlatform()` filters by platform | Unit test: verify SELECT WHERE platform = ? |
| 11 | `count()` returns number | Unit test: mock query returns `[{count: 3}]` → returns `3` |
| 12 | All SQL uses `?` placeholders | Unit test: verify SQL strings contain `?` not actual values |
| 13 | Repository does not call `db.open()` or `db.close()` | Code review |
| 14 | Barrel export compiles | `import { DeviceRepository, Device } from '@collectio/shared'` |

### 13.2 T11 — LanguageRepository

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `Language` type compiles | `tsc --noEmit` |
| 2 | `LanguageRepository` compiles with all 8 methods | `tsc --noEmit` |
| 3 | `findById()` returns Language or null | Unit test |
| 4 | `findByIsoCode()` returns Language or null for nonexistent code | Unit test |
| 5 | `findAll()` returns all languages ordered by name | Unit test |
| 6 | `findSeeded()` returns only `user_added = 0` | Unit test: verify WHERE clause |
| 7 | `findUserAdded()` returns only `user_added = 1` | Unit test: verify WHERE clause |
| 8 | `search('jap')` wraps query in `%`, searches both name and native_name | Unit test: verify LIKE patterns `%jap%` |
| 9 | `search('')` returns `[]` | Unit test: empty query → empty array |
| 10 | `create()` sets `user_added=1`, `created_at` timestamp, inserts with params | Unit test: verify INSERT SQL with params, user_added=1 literal |
| 11 | `create()` retrieves auto-generated id via `last_insert_rowid()` | Unit test: mock query returns `[{id: 61}]` → returned Language has id=61 |
| 12 | `count()` returns number | Unit test |
| 13 | All SQL uses `?` placeholders | Unit test |
| 14 | Barrel export compiles | `import { LanguageRepository, Language } from '@collectio/shared'` |

### 13.3 T12 — CategoryRepository

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `Category` type compiles | `tsc --noEmit` |
| 2 | `CategoryRepository` compiles with all 4 methods | `tsc --noEmit` |
| 3 | `findById()` returns Category or null | Unit test |
| 4 | `findAll()` returns all categories ordered by `sort_order` | Unit test |
| 5 | `findEnabled()` returns only `enabled = 1`, ordered by `sort_order` | Unit test: verify WHERE enabled = 1, ORDER BY sort_order |
| 6 | `count()` returns number | Unit test |
| 7 | No write methods exist | Code review: grep for `execute(` in repository file — must produce zero matches |
| 8 | Barrel export compiles | `import { CategoryRepository, Category } from '@collectio/shared'` |

### 13.4 T13 — SyncLogRepository

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `SyncLog`, `SyncDirection`, `SyncStatus`, `CreateSyncLogInput` types compile | `tsc --noEmit` |
| 2 | `SyncLogRepository` compiles with all 6 methods | `tsc --noEmit` |
| 3 | `create()` sets `status='IN_PROGRESS'`, `started_at` timestamp, `records_affected=0` | Unit test: verify INSERT SQL has 'IN_PROGRESS' literal and ISO-8601 timestamp |
| 4 | `create()` retrieves auto-generated id | Unit test: mock query returns `[{id: 5}]` → returned SyncLog has id=5 |
| 5 | `markCompleted()` sets `completed_at`, `status`, `records_affected`, `error_message` | Unit test: verify UPDATE SQL |
| 6 | `markCompleted()` with no errorMessage sets `error_message = null` | Unit test: verify params include null |
| 7 | `markCompleted()` does not throw for non-existent id | Unit test: mock execute succeeds → no error |
| 8 | `findById()` returns SyncLog with nullable `completed_at` and `error_message` | Unit test: returned SyncLog has `completed_at: null`, `error_message: null` |
| 9 | `findByDeviceId()` returns logs for a device | Unit test: verify SELECT WHERE device_id = ? |
| 10 | `findRecent()` defaults to 20, ordered by `started_at DESC` | Unit test: verify LIMIT and ORDER BY |
| 11 | `findRecent(5)` overrides limit | Unit test: verify LIMIT 5 |
| 12 | `count()` returns number | Unit test |
| 13 | All SQL uses `?` placeholders | Unit test |
| 14 | Barrel export compiles | `import { SyncLogRepository, SyncLog, SyncDirection } from '@collectio/shared'` |

### 13.5 T14 — AppSettingsRepository

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `AppSettingsKey` type compiles | `tsc --noEmit` |
| 2 | `APP_SETTINGS_KEYS` array contains exactly 5 keys matching `02_DATABASE_SCHEMA.md` §3 | Unit test: array length is 5; all documented keys present |
| 3 | `AppSettingsRepository` compiles and implements all 4 methods | `tsc --noEmit` |
| 4 | `get()` returns string when key exists | Unit test |
| 5 | `get()` returns `null` when key has no row | Unit test |
| 6 | `set()` calls `execute()` with correct parameterized SQL including `updated_at` | Unit test: verify `INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)` with 3 params |
| 7 | `set()` generates ISO-8601 `updated_at` | Unit test: verify third param is ISO-8601 format |
| 8 | `getAll()` returns all rows as key-value object | Unit test |
| 9 | `getAll()` returns `{}` when empty | Unit test |
| 10 | `has()` returns true/false correctly | Unit test |
| 11 | Invalid key on `get()`/`set()`/`has()` throws `DatabaseError` | Unit test: message contains "Unknown app_settings key" |
| 12 | All SQL uses `?` placeholders | Unit test: SQL string does not contain the value |
| 13 | `updated_at` is present in INSERT OR REPLACE | Unit test: verify SQL includes `updated_at` column |
| 14 | Barrel export compiles | `import { AppSettingsRepository, AppSettingsKey } from '@collectio/shared'` |

### 13.6 Global Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| G1 | All domain model files have zero imports (pure TypeScript) | Grep each `domain/models/*.ts` for `import` |
| G2 | All repositories import only from `../database/` and `../../domain/models/` | Code review |
| G3 | `pnpm typecheck` passes from root with zero errors | `pnpm typecheck` |
| G4 | `pnpm lint` passes for `packages/shared/` | `pnpm --filter @collectio/shared lint` |
| G5 | All unit tests pass with mocked `DatabaseConnection` | `pnpm --filter @collectio/shared test` |
| G6 | No platform imports in any repository or domain model file | Grep for `better-sqlite3`, `@capacitor`, `electron`, `capacitor` — zero matches |
| G7 | `packages/shared/src/index.ts` exports all 10 new types/classes | Code review — 5 domain models + 5 repositories |
| G8 | All methods return `Promise<T>` (async per AD-01) | TypeScript enforces this via `DatabaseConnection` interface; unit tests verify `instanceof Promise` |

---

## 14. Test Cases

Tests follow the T09 pattern: `createMockDb()` helper with `queryResult` override, mock `DatabaseConnection` that records calls, `describe`/`it` blocks per method.

### 14.1 T10 — DeviceRepository Tests

```
Constructor: constructor stores DatabaseConnection
  → Create repository with mock → internal db field is set

register():
  Test: register generates UUID v4, sets timestamps, returns Device
  Test: register uses ? placeholders, not string interpolation
  Test: register returns Device with correct name and platform

findById():
  Test: findById returns Device when found
  Test: findById returns null when not found

findAll():
  Test: findAll returns all devices ordered by registered_at DESC
  Test: findAll returns [] when no devices

updateLastSeen():
  Test: updateLastSeen executes UPDATE with ISO-8601 timestamp
  Test: updateLastSeen uses ? placeholders
  Test: updateLastSeen does not throw for non-existent device

findByPlatform():
  Test: findByPlatform returns only matching platform devices
  Test: findByPlatform returns [] when no matches

count():
  Test: count returns correct number
  Test: count returns 0 for empty table

Async:
  Test: all methods return Promise instances
```

### 14.2 T11 — LanguageRepository Tests

```
findById():
  Test: findById returns Language when found
  Test: findById returns null when not found

findByIsoCode():
  Test: findByIsoCode returns Language for valid code
  Test: findByIsoCode returns null for nonexistent code ('zz')

findAll():
  Test: findAll returns all languages ordered by name ASC
  Test: findAll returns [] when empty

findSeeded():
  Test: findSeeded returns only user_added=0 languages
  Test: findSeeded expects correct WHERE clause

findUserAdded():
  Test: findUserAdded returns only user_added=1 languages
  Test: findUserAdded expects correct WHERE clause

search():
  Test: search wraps query in % wildcards on both sides
  Test: search queries both name AND native_name columns
  Test: search returns [] for empty query string
  Test: search returns [] for no matches

create():
  Test: create sets user_added=1 literal in SQL (not as ? param)
  Test: create sets created_at to ISO-8601 timestamp
  Test: create retrieves auto-generated id via last_insert_rowid()
  Test: create uses ? placeholders (not string interpolation)
  Test: create returns full Language with generated id

count():
  Test: count returns correct number
  Test: count returns 0 for empty table

Async:
  Test: all methods return Promise instances
```

### 14.3 T12 — CategoryRepository Tests

```
findById():
  Test: findById returns Category for 'songs'
  Test: findById returns null for unknown category

findAll():
  Test: findAll returns all categories ordered by sort_order ASC
  Test: findAll returns [] when empty

findEnabled():
  Test: findEnabled returns only enabled=1, ordered by sort_order
  Test: findEnabled returns [] when no enabled categories

count():
  Test: count returns correct number
  Test: count returns 0 for empty table

No write methods:
  Test: CategoryRepository has no execute() calls (code review check)

Async:
  Test: all methods return Promise instances
```

### 14.4 T13 — SyncLogRepository Tests

```
findById():
  Test: findById returns SyncLog when found
  Test: findById returns SyncLog with nullable completed_at and error_message
  Test: findById returns null when not found

findByDeviceId():
  Test: findByDeviceId returns logs for device, ordered by started_at DESC
  Test: findByDeviceId returns [] for device with no logs

findRecent():
  Test: findRecent returns logs ordered by started_at DESC
  Test: findRecent defaults to LIMIT 20
  Test: findRecent(5) uses LIMIT 5
  Test: findRecent returns [] when no logs

create():
  Test: create sets status='IN_PROGRESS' literal
  Test: create sets started_at to ISO-8601 timestamp
  Test: create sets records_affected=0, completed_at=NULL, error_message=NULL
  Test: create retrieves auto-generated id via last_insert_rowid()
  Test: create returns full SyncLog with generated id
  Test: create uses ? placeholders

markCompleted():
  Test: markCompleted sets completed_at, status, records_affected
  Test: markCompleted sets error_message=null when not provided
  Test: markCompleted sets error_message when provided (FAILURE case)
  Test: markCompleted uses ? placeholders
  Test: markCompleted does not throw for non-existent id

count():
  Test: count returns correct number

Async:
  Test: all methods return Promise instances
```

### 14.5 T14 — AppSettingsRepository Tests

```
get():
  Test: get returns value when key exists
  Test: get returns null when key not set
  Test: get throws DatabaseError on invalid key

set():
  Test: set executes INSERT OR REPLACE with key, value, timestamp
  Test: set generates ISO-8601 updated_at as third parameter
  Test: set overwrites existing key
  Test: set throws DatabaseError on invalid key
  Test: set uses ? placeholders, not string interpolation

getAll():
  Test: getAll returns all rows as key-value object
  Test: getAll returns {} when no rows

has():
  Test: has returns true when key exists
  Test: has returns false when key not set
  Test: has throws DatabaseError on invalid key

APP_SETTINGS_KEYS constant:
  Test: APP_SETTINGS_KEYS contains all 5 well-known keys
  Test: APP_SETTINGS_KEYS has no duplicate entries

Async:
  Test: get returns a Promise
  Test: set returns a Promise
```

---

## 15. Definition Of Done

### T10 — DeviceRepository
- [ ] `packages/shared/src/domain/models/Device.ts` exists with `Device` interface and `Platform` type
- [ ] `Device.ts` has zero imports
- [ ] `packages/shared/src/data/repositories/DeviceRepository.ts` exists
- [ ] Repository constructor takes `DatabaseConnection` parameter
- [ ] Repository has 6 methods: `register`, `findById`, `findAll`, `updateLastSeen`, `findByPlatform`, `count`
- [ ] All methods return `Promise<T>` (async per AD-01)
- [ ] `register()` auto-generates UUID v4 and ISO-8601 timestamps
- [ ] `updateLastSeen()` sets `last_seen_at` to current UTC ISO-8601
- [ ] All SQL uses `?` parameterized placeholders — zero string interpolation
- [ ] Repository never calls `db.open()` or `db.close()`
- [ ] Unit test file created with all test cases from §14.1
- [ ] All acceptance criteria 1–14 verified

### T11 — LanguageRepository
- [ ] `packages/shared/src/domain/models/Language.ts` exists with `Language` interface
- [ ] `Language.ts` has zero imports
- [ ] `packages/shared/src/data/repositories/LanguageRepository.ts` exists
- [ ] Repository constructor takes `DatabaseConnection` parameter
- [ ] Repository has 8 methods: `findById`, `findByIsoCode`, `findAll`, `findSeeded`, `findUserAdded`, `search`, `create`, `count`
- [ ] All methods return `Promise<T>` (async per AD-01)
- [ ] `create()` auto-sets `user_added=1` and `created_at` ISO-8601 timestamp
- [ ] `search()` wraps query in `%` wildcards, queries both `name` and `native_name`
- [ ] `create()` retrieves auto-generated id via `SELECT last_insert_rowid()`
- [ ] All SQL uses `?` parameterized placeholders — zero string interpolation
- [ ] Repository never calls `db.open()` or `db.close()`
- [ ] Unit test file created with all test cases from §14.2
- [ ] All acceptance criteria 1–14 verified

### T12 — CategoryRepository
- [ ] `packages/shared/src/domain/models/Category.ts` exists with `Category` interface
- [ ] `Category.ts` has zero imports
- [ ] `packages/shared/src/data/repositories/CategoryRepository.ts` exists
- [ ] Repository constructor takes `DatabaseConnection` parameter
- [ ] Repository has 4 methods: `findById`, `findAll`, `findEnabled`, `count`
- [ ] All methods return `Promise<T>` (async per AD-01)
- [ ] No write methods (no `execute()` calls)
- [ ] `findEnabled()` filters `WHERE enabled = 1 ORDER BY sort_order ASC`
- [ ] Repository never calls `db.open()` or `db.close()`
- [ ] Unit test file created with all test cases from §14.3
- [ ] All acceptance criteria 1–8 verified

### T13 — SyncLogRepository
- [ ] `packages/shared/src/domain/models/SyncLog.ts` exists with `SyncLog`, `SyncDirection`, `SyncStatus`, `CreateSyncLogInput`
- [ ] `SyncLog.ts` has zero imports
- [ ] `packages/shared/src/data/repositories/SyncLogRepository.ts` exists
- [ ] Repository constructor takes `DatabaseConnection` parameter
- [ ] Repository has 6 methods: `findById`, `findByDeviceId`, `findRecent`, `create`, `markCompleted`, `count`
- [ ] All methods return `Promise<T>` (async per AD-01)
- [ ] `create()` auto-sets `status='IN_PROGRESS'`, `started_at` ISO-8601 timestamp, `records_affected=0`
- [ ] `markCompleted()` sets `completed_at` ISO-8601 timestamp, updates status/records_affected/error_message
- [ ] `findRecent()` defaults to LIMIT 20, ordered by `started_at DESC`
- [ ] `create()` retrieves auto-generated id via `SELECT last_insert_rowid()`
- [ ] All SQL uses `?` parameterized placeholders — zero string interpolation
- [ ] Repository never calls `db.open()` or `db.close()`
- [ ] Unit test file created with all test cases from §14.4
- [ ] All acceptance criteria 1–14 verified

### T14 — AppSettingsRepository
- [ ] `packages/shared/src/domain/models/AppSettingsKey.ts` exists with `AppSettingsKey` type and `APP_SETTINGS_KEYS` constant
- [ ] `AppSettingsKey` type is a string literal union of exactly 5 keys matching `02_DATABASE_SCHEMA.md` §3
- [ ] `APP_SETTINGS_KEYS` is a readonly array containing all 5 keys
- [ ] `AppSettingsKey.ts` has zero imports
- [ ] `packages/shared/src/data/repositories/AppSettingsRepository.ts` exists
- [ ] Repository constructor takes `DatabaseConnection` parameter
- [ ] Repository has 4 public methods: `get`, `set`, `getAll`, `has`
- [ ] All methods return `Promise<T>` (async per AD-01)
- [ ] `set()` uses `INSERT OR REPLACE` with `?` placeholders including `updated_at`
- [ ] `set()` generates ISO-8601 `updated_at` timestamp automatically
- [ ] Runtime key validation on `get()`, `set()`, and `has()` using `APP_SETTINGS_KEYS`
- [ ] Invalid keys throw `DatabaseError("Unknown app_settings key: '...'")`
- [ ] All SQL uses `?` parameterized placeholders — zero string interpolation
- [ ] Repository never calls `db.open()` or `db.close()`
- [ ] Unit test file created with all test cases from §14.5
- [ ] All acceptance criteria 1–14 verified

### Global
- [ ] `packages/shared/src/index.ts` re-exports all 10 new types/classes
- [ ] All domain model files have zero imports
- [ ] No platform imports in any repository file
- [ ] `pnpm typecheck` passes with zero errors
- [ ] `pnpm --filter @collectio/shared lint` passes with zero errors
- [ ] `pnpm --filter @collectio/shared test` passes with zero failures
- [ ] All 5 repository files and all 5 test files exist and pass review

---

_End of Implementation Specification_
