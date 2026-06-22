# E-02 T-07 — Write Migration 001 (Core Infrastructure)

**Parent Epic:** E-02: Database Layer
**Type:** Data Definition (Migration SQL)
**Criticality:** FOUNDATION — this migration creates every infrastructure and reference table in the application. All repository implementations (T-02.9–T-02.15), the sync engine (E-10), and every user-facing data operation depend on these tables existing. If this migration is incorrect, nothing works.

---

## 1. Goal

Write `001_core_infrastructure.sql` — the version 1 migration that creates all V1 infrastructure and reference tables in a fresh database. This is the first migration applied after an empty database is created. It defines 6 tables: `app_metadata`, `devices`, `sync_log`, `app_settings`, `languages`, `categories`. It seeds `languages` with 60 ISO 639-1 entries and `categories` with the `songs` category row. It bootstraps the `schema_version` tracking row at `'0'` so the MigrationRunner can update it to `'1'` after execution.

This is a plain `.sql` file — zero TypeScript, zero platform code, zero dependencies beyond SQLite itself.

---

## 2. Scope

| In Scope | Rationale |
|----------|-----------|
| 6 `CREATE TABLE IF NOT EXISTS` statements | Match `02_DATABASE_SCHEMA.md` §3–4 exactly — every column, type, constraint, default, and foreign key |
| `INSERT INTO app_metadata (key, value) VALUES ('schema_version', '0')` | Bootstraps version tracking so the MigrationRunner can update it |
| 60 `INSERT INTO languages` rows | ISO 639-1 codes from `PROJECT_CONSTITUTION.md` Appendix C; each row has `iso_code`, `name` (English), `native_name` (native script), `user_added = 0`, `created_at` |
| 1 `INSERT INTO categories` row | `songs` category: `id = 'songs'`, `display_name = 'Songs'`, `icon_name = 'music-note'`, `enabled = 1`, `sort_order = 1`, `introduced_in_version = '1.0.0'` |
| `PRAGMA foreign_keys = ON` as documentation | The runner routes this to `query()` per AD-05/E02-T06; redundant with connection-open PRAGMAs but serves as in-file documentation |
| `--` comment header | Documents what this migration creates, matching the convention from `04_MIGRATION_STRATEGY.md` §2 |
| Semicolon-delimited statement format | One statement per `;` — compatible with MigrationRunner's `splitStatements()` |
| `created_at` values as `CURRENT_TIMESTAMP` | For reference/seed records; ensures valid ISO-8601 timestamps |

---

## 3. Out of Scope

| Out of Scope | Why | Where It Belongs |
|-------------|-----|-----------------|
| Songs category tables (`artists`, `songs`, `song_artists`) | Separate migration — version 2 | E-02 T-02.8 |
| Domain model types (Song, Artist, Language, etc.) | TypeScript type definitions — not SQL | `packages/shared/src/domain/models/` |
| Repository implementations | Consumer of the schema — not the schema itself | E-02 T-02.9–T-02.15 |
| Migration execution / validation | The MigrationRunner executes this file; platform-level SQLite validation is a separate test | E-02 T-02.6, platform tests |
| Index creation for search/filter | Separate migration for performance optimization | Future migration (e.g., `005_search_indexes.sql`) |
| `app_settings` seed rows (defaults) | Settings defaults are applied by the SettingsManager at runtime, not inserted by migration | E-14 |
| `app_metadata` keys beyond `schema_version` | Other keys (`device_id`, `kdf_salt`, `initialized`, `last_successful_sync`, `cloud_file_id`, `cloud_modified_time`) are set by the application at runtime, not by migration | App entry / security setup |

---

## 4. Files To Create

| # | File | Purpose | Responsibility |
|---|------|---------|---------------|
| 1 | `packages/shared/src/data/database/migrations/001_core_infrastructure.sql` | Version 1 migration SQL | Contains all DDL for the 6 infrastructure/reference tables, all seed INSERT statements, the version bootstrap INSERT, and a documentation PRAGMA. Every column definition, constraint, type, default, foreign key, and CHECK matches `02_DATABASE_SCHEMA.md` §3–4 character-for-character. Statements are semicolon-delimited. File uses `--` comment header. |
| 2 | `packages/shared/src/data/database/__tests__/migrations/001_core_infrastructure.test.ts` | Unit test validating the migration against in-memory SQLite | Creates an in-memory `better-sqlite3` database, executes the migration SQL through the same statement-splitting and PRAGMA-routing logic the runner uses, then verifies all 6 tables exist, constraints are active, seed data count and content is correct, and the migration is idempotent. |

### 4.1 File Specification — `001_core_infrastructure.sql`

**Purpose:** Raw SQL text file. No special markers, no rollback sections, no migration metadata beyond the `--` comment header.

**Structure:**
1. Comment header: `-- Migration 001: Core Infrastructure Tables`
2. PRAGMA statement: `PRAGMA foreign_keys = ON;` (documentation; handled by runner)
3. 6 `CREATE TABLE IF NOT EXISTS` statements (one per table, terminated by `;`)
4. 1 `INSERT INTO app_metadata` statement (bootstraps `schema_version = '0'`)
5. 60 `INSERT INTO languages` statements (one per ISO code)
6. 1 `INSERT INTO categories` statement (songs category)

**Table Definitions (must match `02_DATABASE_SCHEMA.md` §3–4):**

#### app_metadata
| Column | Type | Constraints | Notes |
|--------|------|------------|-------|
| `key` | TEXT | PRIMARY KEY, NOT NULL | Enumerated key set |
| `value` | TEXT | NOT NULL | String value |

No audit columns. This is an infrastructure key-value store, not a user-content entity.

#### devices
| Column | Type | Constraints | Notes |
|--------|------|------------|-------|
| `id` | TEXT | PRIMARY KEY, NOT NULL | UUID v4 |
| `name` | TEXT | NOT NULL | Device name |
| `platform` | TEXT | NOT NULL, CHECK (platform IN ('ANDROID', 'WINDOWS')) | Platform enum |
| `registered_at` | TEXT | NOT NULL | ISO-8601 datetime |
| `last_seen_at` | TEXT | NOT NULL | ISO-8601 datetime |

No `created_at`/`updated_at`/`deleted_at` — uses domain-specific timestamp column names.

#### sync_log
| Column | Type | Constraints | Notes |
|--------|------|------------|-------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Sequential integer ID |
| `device_id` | TEXT | FOREIGN KEY → devices(id) | NULLable? No — NOT NULL per schema. Actually the schema doesn't explicitly say NOT NULL for device_id other than FK. FK implies NOT NULL in practice but should be explicit |
| `started_at` | TEXT | NOT NULL | ISO-8601 |
| `completed_at` | TEXT | NULLABLE | NULL until sync completes |
| `direction` | TEXT | — | `UPLOAD`, `DOWNLOAD`, or `MERGE` |
| `status` | TEXT | — | `SUCCESS`, `FAILURE`, or `IN_PROGRESS` |
| `records_affected` | INTEGER | — | NULLable — 0 is valid |
| `error_message` | TEXT | NULLABLE | Only set on failure |

No `updated_at` — sync_log rows are immutable after creation (only `status` and `completed_at` change during the sync window).

#### app_settings
| Column | Type | Constraints | Notes |
|--------|------|------------|-------|
| `key` | TEXT | PRIMARY KEY, NOT NULL | Enumerated key set |
| `value` | TEXT | NOT NULL | String value |
| `updated_at` | TEXT | NOT NULL | ISO-8601 — updated on every setting change; enables LWW sync |

#### languages
| Column | Type | Constraints | Notes |
|--------|------|------------|-------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Numeric ID |
| `iso_code` | TEXT | UNIQUE, NOT NULL | ISO 639-1 two-letter code |
| `name` | TEXT | NOT NULL | English name |
| `native_name` | TEXT | NOT NULL | Name in the language itself |
| `user_added` | INTEGER | NOT NULL, DEFAULT 0 | `0` for seeded; `1` for user-added |
| `created_at` | TEXT | NOT NULL | ISO-8601 |

#### categories
| Column | Type | Constraints | Notes |
|--------|------|------------|-------|
| `id` | TEXT | PRIMARY KEY, NOT NULL | Slug |
| `display_name` | TEXT | NOT NULL | UI display name |
| `icon_name` | TEXT | NOT NULL | Icon identifier |
| `enabled` | INTEGER | NOT NULL, DEFAULT 1 | Active flag |
| `sort_order` | INTEGER | NOT NULL | Sidebar display order |
| `introduced_in_version` | TEXT | NOT NULL | App version that added this category |

### 4.2 Language Seed Data (60 Rows)

Each INSERT follows this pattern:
```sql
INSERT INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('xx', 'English Name', 'Native Name', 0, CURRENT_TIMESTAMP);
```

The 60 ISO 639-1 codes are from `PROJECT_CONSTITUTION.md` Appendix C. The English name and native name for each code are defined by the ISO 639-1 standard. The full seed table:

| iso_code | name | native_name |
|----------|------|-------------|
| af | Afrikaans | Afrikaans |
| ar | Arabic | العربية |
| az | Azerbaijani | Azərbaycan dili |
| be | Belarusian | Беларуская |
| bg | Bulgarian | Български |
| bn | Bengali | বাংলা |
| ca | Catalan | Català |
| cs | Czech | Čeština |
| cy | Welsh | Cymraeg |
| da | Danish | Dansk |
| de | German | Deutsch |
| el | Greek | Ελληνικά |
| en | English | English |
| eo | Esperanto | Esperanto |
| es | Spanish | Español |
| et | Estonian | Eesti |
| eu | Basque | Euskara |
| fa | Persian | فارسی |
| fi | Finnish | Suomi |
| fr | French | Français |
| ga | Irish | Gaeilge |
| gl | Galician | Galego |
| gu | Gujarati | ગુજરાતી |
| he | Hebrew | עברית |
| hi | Hindi | हिन्दी |
| hr | Croatian | Hrvatski |
| hu | Hungarian | Magyar |
| hy | Armenian | Հայերեն |
| id | Indonesian | Bahasa Indonesia |
| is | Icelandic | Íslenska |
| it | Italian | Italiano |
| ja | Japanese | 日本語 |
| ka | Georgian | ქართული |
| kk | Kazakh | Қазақ тілі |
| kn | Kannada | ಕನ್ನಡ |
| ko | Korean | 한국어 |
| lt | Lithuanian | Lietuvių |
| lv | Latvian | Latviešu |
| mk | Macedonian | Македонски |
| ml | Malayalam | മലയാളം |
| mn | Mongolian | Монгол |
| mr | Marathi | मराठी |
| ms | Malay | Bahasa Melayu |
| mt | Maltese | Malti |
| nl | Dutch | Nederlands |
| no | Norwegian | Norsk |
| pa | Punjabi | ਪੰਜਾਬੀ |
| pl | Polish | Polski |
| pt | Portuguese | Português |
| ro | Romanian | Română |
| ru | Russian | Русский |
| sk | Slovak | Slovenčina |
| sl | Slovenian | Slovenščina |
| sq | Albanian | Shqip |
| sr | Serbian | Српски |
| sv | Swedish | Svenska |
| sw | Swahili | Kiswahili |
| ta | Tamil | தமிழ் |
| te | Telugu | తెలుగు |
| th | Thai | ไทย |
| tl | Tagalog | Tagalog |
| tr | Turkish | Türkçe |
| uk | Ukrainian | Українська |
| ur | Urdu | اردو |
| uz | Uzbek | Oʻzbek |
| vi | Vietnamese | Tiếng Việt |
| zh | Chinese | 中文 |

### 4.3 Categories Seed Data (1 Row)

```sql
INSERT INTO categories (id, display_name, icon_name, enabled, sort_order, introduced_in_version) VALUES ('songs', 'Songs', 'music-note', 1, 1, '1.0.0');
```

### 4.4 File Specification — `001_core_infrastructure.test.ts`

**Purpose:** Jest unit test that validates migration 001 against an in-memory SQLite database using `better-sqlite3`. This test proves the SQL is syntactically and semantically correct before the migration ever runs on a physical device.

**Test database:** Uses raw `better-sqlite3` with an in-memory database (`':memory:'`). This tests the SQL against the same SQLite engine that production uses. The test does NOT import `BetterSqlite3Connection` from `@collectio/platform` — doing so would create a reverse dependency (`packages/shared` → `packages/platform`), violating the architecture. The MigrationRunner integration with `DatabaseConnection` is validated separately in E02-T06's unit tests.

The SQL file is read from disk using Node.js `fs` with path resolution via `__dirname` (the shared package jest config uses CJS ts-jest, so `__dirname` is available as a global). The test runs in Node, not in a WebView — this is acceptable for unit tests.

**Test structure:**
- `beforeEach`: Open in-memory database, read the `.sql` file, split on `;` (matching runner's `splitStatements()`), execute each statement
- `afterEach`: Close database
- Test groups:
  - Table existence and structure
  - Constraint enforcement
  - Seed data content
  - Idempotency

**Exports no public API** — it is a Jest test file.

---

## 5. Files To Modify

| # | File | Change | Rationale |
|---|------|--------|-----------|
| 1 | `packages/shared/package.json` | No change required | No new dependencies — the migration is a `.sql` file; the test uses existing `better-sqlite3` from `packages/platform/` |
| 2 | `packages/shared/tsconfig.json` | No change required | `include: ["src"]` already covers the `__tests__/` directory |
| 3 | `packages/shared/jest.config.ts` or jest configuration | May need `transform` rule for `.sql` files (tell Jest to treat `.sql` as plain text / string module) | Jest by default cannot import `.sql` files. The test reads the file via `fs.readFileSync` — no import transform needed. But if a future test uses `import` for `.sql`, configure `moduleNameMapper` or a raw transform |

---

## 6. Interfaces

### 6.1 Migration File Interface

This file is consumed by the MigrationRunner. The interface contract is:

| Contract Element | Expectation |
|-----------------|-------------|
| **File format** | `.sql` file containing semicolon-delimited SQL statements |
| **Statement separation** | One logical SQL statement per `;` terminator |
| **DDL idempotency** | All `CREATE TABLE` statements use `IF NOT EXISTS` |
| **PRAGMA statements** | Placed at the top of the file; the runner routes these to `query()` |
| **Comment format** | `--` line comments for documentation |
| **File encoding** | UTF-8 |
| **No rollback SQL** | The file has no inverse migration statements |

### 6.2 Contract with MigrationRunner

The MigrationRunner (E02-T06) expects:
- Each `.sql` file is a single `Migration` object: `{ version: number, sql: string }`
- The `sql` string is split on `;` by the runner's `splitStatements()`
- PRAGMA statements are detected by `isPragmaStatement()` and routed to `query()`
- All other statements are routed to `execute()`
- The runner wraps the entire migration's execution in a transaction
- After all statements execute, the runner updates `app_metadata.schema_version` to `'1'`

The migration file must therefore:
- Not contain statements that fail inside a transaction (all DDL uses `IF NOT EXISTS`)
- Not rely on statement ordering that would break if the runner's splitting is wrong
- Include the `schema_version = '0'` bootstrap row so the runner has something to update

---

## 7. Data Flow

```
MigrationRunner.run()
  │
  ├─ Detects currentVersion = 0 (table doesn't exist)
  │
  ├─ Finds pending migration: version 1 (001_core_infrastructure.sql)
  │
  └─ db.transaction(async (conn) => {
       │
       ├─ splitStatements(sql) → array of individual SQL statements
       │
       ├─ FOR EACH statement:
       │     ├─ "PRAGMA foreign_keys = ON"  → conn.query(statement)
       │     ├─ "CREATE TABLE IF NOT EXISTS app_metadata (...)" → conn.execute(statement)
       │     ├─ "CREATE TABLE IF NOT EXISTS devices (...)" → conn.execute(statement)
       │     ├─ "CREATE TABLE IF NOT EXISTS sync_log (...)" → conn.execute(statement)
       │     ├─ "CREATE TABLE IF NOT EXISTS app_settings (...)" → conn.execute(statement)
       │     ├─ "CREATE TABLE IF NOT EXISTS languages (...)" → conn.execute(statement)
       │     ├─ "CREATE TABLE IF NOT EXISTS categories (...)" → conn.execute(statement)
       │     ├─ "INSERT INTO app_metadata (key, value) VALUES ('schema_version', '0')" → conn.execute(statement)
       │     ├─ "INSERT INTO languages (iso_code, name, native_name, ...) VALUES ('af', 'Afrikaans', 'Afrikaans', ...)" → conn.execute(statement)
       │     ├─ ... (59 more language INSERTs) ...
       │     └─ "INSERT INTO categories (...) VALUES ('songs', ...)" → conn.execute(statement)
       │
       └─ conn.execute(
            "UPDATE app_metadata SET value = ? WHERE key = ?",
            ['1', 'schema_version']
          )
     })
```

After the transaction commits:
- 6 tables exist in the database
- `app_metadata` has 1 row: `('schema_version', '1')` (runner updated from `'0'` to `'1'`)
- `languages` has 60 rows
- `categories` has 1 row

---

## 8. State Changes

### 8.1 Database State Before and After

| Aspect | Before Migration (Version 0) | After Migration (Version 1) |
|--------|------------------------------|------------------------------|
| `app_metadata` | Table does not exist | Table exists; 1 row: `('schema_version', '1')` |
| `devices` | Table does not exist | Table exists; 0 rows |
| `sync_log` | Table does not exist | Table exists; 0 rows |
| `app_settings` | Table does not exist | Table exists; 0 rows (defaults applied at runtime by SettingsManager) |
| `languages` | Table does not exist | Table exists; 60 rows |
| `categories` | Table does not exist | Table exists; 1 row (`songs`) |
| `schema_version` (tracked by runner) | `0` | `'1'` |

### 8.2 Transaction Atomicity

All CREATE TABLE and INSERT statements for migration 001 execute inside a single transaction. If any statement fails:
- The entire transaction rolls back
- The database reverts to version 0 (no tables)
- **Caveat:** On SQLite < 3.35 (API 26 devices), DDL is not fully transactional. `CREATE TABLE` inside a rolled-back transaction may persist. Using `IF NOT EXISTS` ensures idempotency regardless.

### 8.3 Migration File State

After this task is complete:
- `001_core_infrastructure.sql` exists and is ready for production
- The file is **immutable** per `04_MIGRATION_STRATEGY.md` §1 — never modified after release
- Future schema changes are new migration files (002, 003, ...)

---

## 9. Database Changes

**Created tables (6):**

| # | Table | Type | Rows After Migration |
|---|-------|------|----------------------|
| 1 | `app_metadata` | Infrastructure key-value store | 1 (`schema_version`) |
| 2 | `devices` | Entity | 0 |
| 3 | `sync_log` | Log | 0 |
| 4 | `app_settings` | Key-value (synced) | 0 |
| 5 | `languages` | Reference | 60 |
| 6 | `categories` | Reference | 1 |

**No tables are altered, dropped, or renamed.** This migration creates the initial schema from an empty database.

**`PRAGMA foreign_keys = ON`** is in the migration file as documentation but does not change database state — this PRAGMA is a connection-level setting, already set by `DatabaseConnection.open()`.

---

## 10. Error Handling

### 10.1 SQL-Level Errors

The migration file itself has no error handling — it's inert SQL text. Errors occur at execution time (when the MigrationRunner executes the SQL). The types of errors that could occur:

| Error | Cause | Prevention |
|-------|-------|-----------|
| `table already exists` | Running migration on a database that already has these tables (non-idempotent DDL) | All `CREATE TABLE` statements use `IF NOT EXISTS` |
| `UNIQUE constraint failed: languages.iso_code` | Duplicate ISO code in seed data | Verify the 60 ISO codes are unique |
| `FOREIGN KEY constraint failed` on `sync_log.device_id` → `devices.id` | Circular dependency in FK creation order | Tables are created before any data is inserted; FKs are between tables, not data. The FK constraint is created with the table and verified on INSERT/UPDATE, not on CREATE TABLE |
| `CHECK constraint failed: devices.platform` | Invalid platform value inserted at runtime | Migration creates no device rows — only the table structure. The CHECK constraint is enforced at INSERT time |
| `NOT NULL constraint failed` | Missing column in INSERT | Each INSERT explicitly lists all required columns |

### 10.2 MigrationRunner Error Handling

Error handling during execution is the MigrationRunner's responsibility (E02-T06):
- If any statement in the migration fails: the transaction rolls back, the runner logs the error, aborts startup
- The runner wraps the error in `DatabaseError` with the SQL statement and migration version

### 10.3 Test Error Handling

The unit test verifies:
- Each CREATE TABLE succeeds (no syntax errors)
- Each INSERT succeeds (no constraint violations)
- Running the migration twice does not error (idempotency test)
- FK constraint is active (INSERT child without parent → error caught = correct behavior)
- CHECK constraint is active (INSERT invalid platform → error caught)

---

## 11. Logging Requirements

**None from the migration file itself.** The `.sql` file has no logging capability. Logging during migration execution is the MigrationRunner's responsibility (E02-T06 §11).

The unit test logs to the Jest console via standard `expect()` assertions — no custom logging required.

---

## 12. Security Requirements

| Requirement | Status |
|------------|--------|
| No secrets in migration SQL | PASS — migration contains only DDL and public reference data (language names, category definition). No passwords, tokens, keys, salts, or PII |
| No user data in seed rows | PASS — seed data is ISO 639-1 language names and a category definition. No user-specific or device-specific data |
| `app_metadata` only stores `schema_version` seed | PASS — other well-known keys (`kdf_salt`, `device_id`, etc.) are set by the application at runtime, not by migration |
| No SQL injection vulnerability | PASS — all SQL is static, hand-written, parameter-free DDL/INSERT statements. No string concatenation at runtime |

---

## 13. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `001_core_infrastructure.sql` exists at `packages/shared/src/data/database/migrations/` | File system check |
| 2 | File starts with `-- Migration 001:` comment header | Open file, inspect first line |
| 3 | 6 `CREATE TABLE IF NOT EXISTS` statements present | Grep file for `CREATE TABLE IF NOT EXISTS` — must have 6 matches |
| 4 | `app_metadata` table has correct columns: `key TEXT PRIMARY KEY NOT NULL`, `value TEXT NOT NULL` | Unit test: query `PRAGMA table_info(app_metadata)` |
| 5 | `devices` table has correct columns and CHECK constraint: `platform TEXT NOT NULL CHECK (platform IN ('ANDROID', 'WINDOWS'))` | Unit test: verify all 5 columns; insert valid platform; insert invalid platform → error |
| 6 | `sync_log` table has correct columns and FK: `device_id TEXT REFERENCES devices(id)` | Unit test: verify all 8 columns; insert child row without parent → FK error |
| 7 | `app_settings` table has correct columns: `key TEXT PRIMARY KEY NOT NULL`, `value TEXT NOT NULL`, `updated_at TEXT NOT NULL` | Unit test: verify all 3 columns |
| 8 | `languages` table has correct columns with UNIQUE on `iso_code`: 6 columns including `iso_code TEXT UNIQUE NOT NULL`, `user_added INTEGER NOT NULL DEFAULT 0` | Unit test: verify columns; insert duplicate iso_code → error; verify DEFAULT applies to `user_added` |
| 9 | `categories` table has correct columns: 6 columns including `enabled INTEGER NOT NULL DEFAULT 1` | Unit test: verify columns; verify DEFAULT applies to `enabled` |
| 10 | `app_metadata` contains row `('schema_version', '0')` | Unit test: `SELECT value FROM app_metadata WHERE key = 'schema_version'` → `'0'` |
| 11 | `languages` contains exactly 60 rows | Unit test: `SELECT count(*) FROM languages` → 60 |
| 12 | `languages` seed rows have `user_added = 0` and `created_at` is not null | Unit test: `SELECT count(*) FROM languages WHERE user_added != 0 OR created_at IS NULL` → 0 |
| 13 | `languages` seed rows have unique `iso_code` values | Unit test: `SELECT count(DISTINCT iso_code) FROM languages` → 60 |
| 14 | Every language row has non-empty `iso_code`, `name`, and `native_name` | Unit test: `SELECT count(*) FROM languages WHERE iso_code = '' OR name = '' OR native_name = ''` → 0 |
| 15 | `categories` contains exactly 1 row: `('songs', 'Songs', 'music-note', 1, 1, '1.0.0')` | Unit test: verify all 6 columns of the single row |
| 16 | `PRAGMA foreign_keys` is active after migration execution | Unit test: insert child row with non-existent parent → error caught |
| 17 | Migration is idempotent: running all statements twice does not error | Unit test: execute migration SQL twice → second execution succeeds with no errors |
| 18 | Idempotency does not duplicate seed data | Unit test: run migration twice → `SELECT count(*) FROM languages` still 60 |
| 19 | `PRAGMA integrity_check` returns `'ok'` after migration | Unit test: query `PRAGMA integrity_check` → `'ok'` |
| 20 | All ISO 639-1 codes from `PROJECT_CONSTITUTION.md` Appendix C are present | Unit test: verify the 60-code list matches exactly |
| 21 | `tsc --noEmit` passes across all workspace packages (no impact from `.sql` file) | `pnpm typecheck` from root |
| 22 | `pnpm lint` passes for `packages/shared/` (no impact from `.sql` file) | `pnpm --filter @collectio/shared lint` |
| 23 | Unit test passes on raw `better-sqlite3` in-memory database | `pnpm --filter @collectio/shared test` |

---

## 14. Test Cases

### 14.1 Test Setup

All tests use raw `better-sqlite3` with an in-memory SQLite database. The test:
1. Creates a raw `better-sqlite3` `Database` instance with `new Database(':memory:')`
2. Enables `foreign_keys = ON` via `db.pragma('foreign_keys = ON')`
3. Reads `001_core_infrastructure.sql` from disk via `fs.readFileSync`
4. Splits the SQL on `;` statements (matching MigrationRunner's `splitStatements()`)
5. Routes PRAGMA statements to `db.exec()` and all others to `db.prepare(stmt).run()` (matching runner's routing)
6. After execution, runs assertions
7. Calls `db.close()` in `afterEach`

### 14.2 Required Test Cases

#### Table Existence and Structure
```
Test: All 6 tables exist
  → SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name
  → Returns rows for: app_metadata, app_settings, categories, devices, languages, sync_log

Test: app_metadata columns
  → PRAGMA table_info(app_metadata)
  → 2 columns: key (TEXT, pk=1, notnull=1), value (TEXT, notnull=1)

Test: devices columns and CHECK constraint
  → PRAGMA table_info(devices)
  → 5 columns: id, name, platform, registered_at, last_seen_at
  → INSERT with platform = 'ANDROID' → succeeds
  → INSERT with platform = 'WINDOWS' → succeeds
  → INSERT with platform = 'LINUX' → error (CHECK constraint)

Test: sync_log columns and FK constraint
  → PRAGMA table_info(sync_log)
  → 8 columns including device_id
  → PRAGMA foreign_key_list(sync_log)
  → Confirms FK on device_id referencing devices(id)

Test: app_settings columns
  → PRAGMA table_info(app_settings)
  → 3 columns: key, value, updated_at

Test: languages columns and UNIQUE constraint
  → PRAGMA table_info(languages)
  → 6 columns: id, iso_code, name, native_name, user_added, created_at
  → INSERT with existing iso_code → error (UNIQUE constraint)
  → user_added default: INSERT without user_added → row has user_added = 0

Test: categories columns
  → PRAGMA table_info(categories)
  → 6 columns: id, display_name, icon_name, enabled, sort_order, introduced_in_version
  → enabled default: INSERT without enabled → row has enabled = 1
```

#### Seed Data Content
```
Test: app_metadata seed
  → query("SELECT value FROM app_metadata WHERE key = 'schema_version'")
  → Returns [{value: '0'}]

Test: languages seed count
  → query("SELECT count(*) AS cnt FROM languages")
  → Returns [{cnt: 60}]

Test: languages seed user_added
  → query("SELECT count(*) AS cnt FROM languages WHERE user_added = 0")
  → Returns [{cnt: 60}]

Test: languages seed timestamps
  → query("SELECT count(*) AS cnt FROM languages WHERE created_at IS NOT NULL")
  → Returns [{cnt: 60}]

Test: languages seed unique iso_code
  → query("SELECT count(DISTINCT iso_code) AS cnt FROM languages")
  → Returns [{cnt: 60}]

Test: languages seed specific entries
  → query("SELECT name FROM languages WHERE iso_code = 'en'")
  → Returns [{name: 'English'}]
  → query("SELECT native_name FROM languages WHERE iso_code = 'ja'")
  → Returns [{native_name: '日本語'}]
  → query("SELECT name FROM languages WHERE iso_code = 'zh'")
  → Returns [{name: 'Chinese'}]

Test: categories seed
  → query("SELECT * FROM categories WHERE id = 'songs'")
  → Returns [{
      id: 'songs',
      display_name: 'Songs',
      icon_name: 'music-note',
      enabled: 1,
      sort_order: 1,
      introduced_in_version: '1.0.0'
    }]
```

#### Constraint Enforcement
```
Test: FK enforcement on sync_log
  → execute("INSERT INTO sync_log (device_id, started_at, direction, status) VALUES ('nonexistent', '2024-01-01T00:00:00.000Z', 'UPLOAD', 'IN_PROGRESS')")
  → Should throw error (FK violation)

Test: NOT NULL enforcement
  → execute("INSERT INTO devices (id, name, platform, last_seen_at) VALUES ('dev-1', 'Test', 'ANDROID', '2024-01-01T00:00:00.000Z')")
  → Should throw error (registered_at is NOT NULL and not provided)

Test: UNIQUE enforcement on languages.iso_code
  → execute("INSERT INTO languages (iso_code, name, native_name, created_at) VALUES ('en', 'English2', 'English2', CURRENT_TIMESTAMP)")
  → Should throw error (UNIQUE constraint)
```

#### Idempotency
```
Test: Running migration twice does not error
  → Execute migration SQL
  → Execute migration SQL again
  → No errors on second execution

Test: Running migration twice does not duplicate data
  → Execute migration SQL
  → Execute migration SQL again
  → query("SELECT count(*) AS cnt FROM languages") → [{cnt: 60}]
  → query("SELECT count(*) AS cnt FROM categories") → [{cnt: 1}]
  → query("SELECT count(*) AS cnt FROM app_metadata") → [{cnt: 1}]
```

#### Integrity
```
Test: PRAGMA integrity_check
  → query("PRAGMA integrity_check")
  → Returns [{integrity_check: 'ok'}]
```

#### Full ISO Code List
```
Test: All 60 ISO codes from Appendix C are present
  → query("SELECT iso_code FROM languages ORDER BY iso_code")
  → ISO codes match the list: af, ar, az, be, bg, bn, ca, cs, cy, da, de, el, en, eo, es, et, eu, fa, fi, fr, ga, gl, gu, he, hi, hr, hu, hy, id, is, it, ja, ka, kk, kn, ko, lt, lv, mk, ml, mn, mr, ms, mt, nl, no, pa, pl, pt, ro, ru, sk, sl, sq, sr, sv, sw, ta, te, th, tl, tr, uk, ur, uz, vi, zh
```

---

## 15. Definition Of Done

- [ ] `migrations/` directory exists at `packages/shared/src/data/database/migrations/`
- [ ] `001_core_infrastructure.sql` exists with `-- Migration 001:` comment header
- [ ] 6 `CREATE TABLE IF NOT EXISTS` statements present and correct
- [ ] All column definitions match `02_DATABASE_SCHEMA.md` §3–4 exactly: correct column names, types, constraints, defaults, foreign keys
- [ ] `devices.platform` has `CHECK (platform IN ('ANDROID', 'WINDOWS'))` constraint
- [ ] `sync_log.device_id` has `REFERENCES devices(id)` foreign key
- [ ] `languages.iso_code` has `UNIQUE` constraint
- [ ] `languages.user_added` has `DEFAULT 0`
- [ ] `categories.enabled` has `DEFAULT 1`
- [ ] `INSERT INTO app_metadata (key, value) VALUES ('schema_version', '0')` present
- [ ] 60 `INSERT INTO languages` statements present
- [ ] Each language row has correct `iso_code`, `name` (English), `native_name`, `user_added = 0`, `created_at = CURRENT_TIMESTAMP`
- [ ] 1 `INSERT INTO categories` statement for `songs` category present with correct values
- [ ] `PRAGMA foreign_keys = ON` at top of file (after comment header, before DDL)
- [ ] All statements terminated with `;`
- [ ] File uses UTF-8 encoding
- [ ] Unit test file created at `packages/shared/src/data/database/__tests__/migrations/001_core_infrastructure.test.ts`
- [ ] All unit tests pass: table structure, constraints, seed data, idempotency, integrity
- [ ] `pnpm typecheck` passes from root
- [ ] `pnpm lint` passes for `packages/shared/`
- [ ] `CREATE TABLE IF NOT EXISTS` (not `CREATE TABLE`) on all DDL — ensures idempotency and guards against non-transactional DDL on older SQLite
- [ ] All acceptance criteria 1–23 verified
