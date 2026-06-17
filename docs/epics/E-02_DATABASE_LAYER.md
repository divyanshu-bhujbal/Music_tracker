# E-02: Database Layer

**Phase:** 1 | **Type:** Foundation | **Depends On:** E-01 | **Blocks:** E-05, E-10, E-14

---

## Overview

**Purpose:** Implement SQLite database access on both platforms via an abstract `DatabaseConnection` interface. The migration runner, query builder, and all repository implementations use this interface — they are platform-agnostic. Only the connection adapter layer differs between Electron and Capacitor.

**Key architectural change from original:** `DatabaseConnection` is **async** because Capacitor's SQLite plugin bridge is asynchronous. Electron's `better-sqlite3` is synchronous — wrapped in `Promise.resolve()` to satisfy the interface.

### Component Mapping Table

| Original (Option A) | Revised (Option D) | Change |
|---------------------|-------------------|--------|
| `react-native-sqlite-storage` (both platforms) | `better-sqlite3` (Electron) + `@capacitor-community/sqlite` (Capacitor) | Two separate packages, unified behind async interface |
| Single sync `DatabaseConnection` | Async `DatabaseConnection` interface + two implementations | Interface becomes async to accommodate Capacitor |
| `MigrationRunner` | `MigrationRunner` | Unchanged — reads from connection interface |
| `QueryBuilder` | `QueryBuilder` | Unchanged — generates SQL strings only |
| All 9 repository implementations | All 9 repository implementations | Unchanged — use `this.db.query<T>(sql, params)` async pattern |
| Migration SQL files | Migration SQL files | Unchanged — identical `.sql` files |

---

## Tasks

### PART A: Database Connection Adapters (New — 5 tasks)

---

### T-02.1 — Verify better-sqlite3 on Electron

| Property | Detail |
|----------|--------|
| **Depends on** | T-01.5 (Electron app scaffold) |
| **Blocks** | T-02.3, T-02.4 |

**Files produced:**
- `packages/platform/src/electron/__verify__/better-sqlite3-verify.ts` (temporary verification script)

**Requirements:**
- Install `better-sqlite3` in `packages/platform`
- Open a database file in Electron's `userData` directory
- Run the 12 SQ test cases from E-00b T-00b.1 (CREATE, INSERT, SELECT, UPDATE, DELETE, transactions, FK enforcement, persistence, integrity_check)
- `PRAGMA foreign_keys = ON` must be honored — **this was the failure in E-00 for react-native-sqlite-storage**

**Acceptance criteria:**
1. All 12 SQ test cases pass on Electron
2. FK enforcement works (not optional — was the reason Option A was rejected)
3. Database file persists in `<userData>/collectio.db`
4. `PRAGMA integrity_check` returns "ok"
5. Document any Electron-specific configuration (e.g., native addon rebuild requirements)

---

### T-02.2 — Verify @capacitor-community/sqlite on Android

| Property | Detail |
|----------|--------|
| **Depends on** | T-01.6 (Capacitor app scaffold) |
| **Blocks** | T-02.3, T-02.5 |

**Files produced:**
- `packages/platform/src/capacitor/__verify__/capacitor-sqlite-verify.ts` (temporary verification script)

**Requirements:**
- Install `@capacitor-community/sqlite` in `packages/platform`
- Run the 12 SQ test cases on a physical Android device
- The plugin must be initialized via Capacitor's plugin system before use

**Acceptance criteria:**
1. All 12 SQ test cases pass on physical Android device
2. FK enforcement works
3. Database file persists in the app's data directory
4. Document Capacitor plugin initialization steps

---

### T-02.3 — Define DatabaseConnection Interface

| Property | Detail |
|----------|--------|
| **Depends on** | T-02.1, T-02.2 (at least one platform verified) |
| **Blocks** | T-02.4, T-02.5, T-02.6 through T-02.15 |

**Files produced:**
- `packages/shared/src/data/database/DatabaseConnection.ts`

**Interface:**
```
open(dbPath: string): Promise<void>
close(): Promise<void>
execute(sql: string, params?: any[]): Promise<void>
query<T>(sql: string, params?: any[]): Promise<T[]>
transaction<T>(fn: (db: DatabaseConnection) => Promise<T>): Promise<T>
```

**Requirements:**
- All methods return `Promise` (async interface to accommodate Capacitor)
- `transaction()` accepts an async callback and wraps it in BEGIN/COMMIT/ROLLBACK
- `execute()` is for INSERT/UPDATE/DELETE — returns void
- `query<T>()` is for SELECT — returns typed array
- Errors must be typed: `DatabaseError`, `ConstraintError` (FK/NOT NULL), `ConnectionError`

**Acceptance criteria:**
1. Interface compiles in shared package
2. Type errors when implementing with wrong signatures

---

### T-02.4 — Implement BetterSqlite3Connection (Electron)

| Property | Detail |
|----------|--------|
| **Depends on** | T-02.1, T-02.3 |
| **Blocks** | (none — platform adapter, used by Electron app entry) |

**Files produced:**
- `packages/platform/src/electron/BetterSqlite3Connection.ts`

**Requirements:**
- Wraps `better-sqlite3` synchronous API in `Promise.resolve()` for all methods
- On `open()`: execute `PRAGMA foreign_keys = ON`, `PRAGMA journal_mode = WAL`, `PRAGMA synchronous = NORMAL`, `PRAGMA busy_timeout = 5000`
- `transaction()` wraps the callback in `BEGIN`/`COMMIT`; on error, executes `ROLLBACK` and re-throws
- `execute()` uses `db.prepare(sql).run(params)`
- `query<T>()` uses `db.prepare(sql).all(params)` and maps to typed objects
- Input validation: reject multiple statements in a single SQL string
- Parameter binding: use `?` placeholders only (no `${}` interpolation)

**Acceptance criteria:**
1. All methods satisfy `DatabaseConnection` interface
2. FK enforcement test passes
3. Transaction rollback works: insert → rollback → query confirms no rows
4. Parallel reads work (WAL mode)
5. `PRAGMA integrity_check` returns "ok" after operations

---

### T-02.5 — Implement CapacitorSqliteConnection (Android)

| Property | Detail |
|----------|--------|
| **Depends on** | T-02.2, T-02.3 |
| **Blocks** | (none — platform adapter, used by Capacitor app entry) |

**Files produced:**
- `packages/platform/src/capacitor/CapacitorSqliteConnection.ts`

**Requirements:**
- Wraps `@capacitor-community/sqlite` async plugin API
- On `open()`: plugin initialization + PRAGMA setup (same pragmas as T-02.4)
- All methods are naturally async (no Promise wrapping needed)
- `transaction()` uses the plugin's transaction API if available; otherwise manual BEGIN/COMMIT
- Input validation identical to T-02.4
- Handle plugin lifecycle: close on app background; reopen on foreground

**Acceptance criteria:**
1. All methods satisfy `DatabaseConnection` interface
2. FK enforcement test passes on Android device
3. Transaction rollback works
4. Database persists across app background → foreground

---

### PART B: Migration Runner and Query Tools (Unchanged Logic — 3 tasks)

---

### T-02.6 — Implement MigrationRunner

| Property | Detail |
|----------|--------|
| **Depends on** | T-02.3 (interface defined) |
| **Blocks** | T-02.7, T-02.8 |

**Files produced:**
- `packages/shared/src/data/database/MigrationRunner.ts`

**Requirements:**
- At startup: read `schema_version` from `app_metadata`; if table doesn't exist → version = 0
- Find all `.sql` files in the migrations directory sorted by filename prefix
- Execute each migration in a transaction via the injected `DatabaseConnection`
- After each successful migration: `UPDATE app_metadata SET value = :newVersion WHERE key = 'schema_version'`
- On failure: rollback that migration, log error, abort startup
- Migrations are read as text and executed as SQL — no modification
- After all migrations: run `PRAGMA integrity_check` and `PRAGMA foreign_key_check`

**Acceptance criteria:**
1. Fresh database: migration 0 → 1 → 2 applied, schema_version = 2
2. Database already at version 1: only migration 2 applied
3. Migration with SQL error: version unchanged, error surfaced
4. Identity: running twice produces same result (no duplicate execution)
5. Acceptance criteria unchanged from original T-02.3

---

### T-02.7 — Write Migration 001 (Core Infrastructure)

| Property | Detail |
|----------|--------|
| **Depends on** | T-02.6 |
| **Blocks** | T-02.9 through T-02.15 |

**Files produced:**
- `packages/shared/src/data/database/migrations/001_core_infrastructure.sql`

**Requirements:**
- Creates tables: `app_metadata`, `devices`, `sync_log`, `app_settings`, `languages`, `categories`
- All column definitions, constraints, defaults, and foreign keys match constitution Section 14
- Seeds `languages` table with 60 ISO 639-1 codes (Appendix C)
- Seeds `categories` table with `songs` category row
- Acceptance criteria unchanged from original T-02.4

---

### T-02.8 — Write Migration 002 (Songs Category)

| Property | Detail |
|----------|--------|
| **Depends on** | T-02.6, T-02.7 |
| **Blocks** | T-02.12, T-02.13, T-02.14 |

**Files produced:**
- `packages/shared/src/data/database/migrations/002_songs_category.sql`

**Requirements:**
- Creates tables: `artists`, `songs`, `song_artists`
- All column definitions, foreign keys, composite PK on `song_artists` match constitution Section 14.3
- Acceptance criteria unchanged from original T-02.5

---

### PART C: Repository Implementations (Unchanged — 7 tasks)

---

### T-02.9 through T-02.15 — Repository Implementations

**Note:** Tasks T-02.9 through T-02.15 have **identical acceptance criteria** to the original E-02 plan. The only implementation difference: all repository methods are now `async` because `DatabaseConnection` is async. Each repository receives `DatabaseConnection` via constructor injection.

| Task | File | Description |
|------|------|-------------|
| T-02.9 | `AppMetadataRepository.ts` | Key-value store for `app_metadata`; keys validated against enum |
| T-02.10 | `DeviceRepository.ts` | Device registration + last-seen updates |
| T-02.11 | `LanguageRepository.ts` | Language CRUD + search + seed validation |
| T-02.12 | `CategoryRepository.ts` | Category read-only; `getEnabled()` |
| T-02.13 | `SyncLogRepository.ts` | Sync event logging |
| T-02.14 | `AppSettingsRepository.ts` | User settings key-value with `updated_at` tracking |
| T-02.15 | `SongRepository.ts`, `ArtistRepository.ts`, `SongArtistRepository.ts` | Songs category data access (see E-06 for full detail) |

**Shared requirement for all repositories:**
- Constructor takes `DatabaseConnection`
- All query methods use parameterized SQL (`?` placeholders, never string interpolation)
- Soft-delete pattern: `WHERE deleted_at IS NULL` filter on all active queries
- Timestamps in ISO-8601 format
- Typed return values matching domain models (from `packages/shared/src/domain/models/`)

**Acceptance criteria:** Unchanged from original E-02 tasks.
