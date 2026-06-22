# E-02 T-06 — Implement MigrationRunner

**Parent Epic:** E-02: Database Layer
**Type:** Production Implementation (Data Layer)
**Criticality:** FOUNDATION — this runner executes at app startup before any data access. Every table, repository, and data operation depends on migrations having completed. If the runner fails, the app must refuse to operate.

---

## 1. Goal

Implement `MigrationRunner` — the versioned database migration executor that reads the current `schema_version` from `app_metadata`, discovers pending migration files, executes each in a transaction via the injected `DatabaseConnection`, and updates the version atomically. This is the Flyway/Liquibase pattern applied at the SQLite level.

The runner is platform-agnostic. It lives in `packages/shared/src/data/database/`, imports only from `@collectio/shared`, and receives both the `DatabaseConnection` and the migration definitions (`Migration[]`) via constructor injection. It has zero platform code, zero file I/O, zero Node.js imports.

---

## 2. Scope

| In Scope | Rationale |
|----------|-----------|
| `MigrationRunner` class consuming `DatabaseConnection` + `Migration[]` | Platform-agnostic executor; all dependencies injected |
| `Migration` type definition | `{ version: number; sql: string }` — version is integer, SQL is the raw file content |
| `MigrationResult` type definition | Per-migration outcome: version, status, duration, error message |
| Startup version detection | Query `app_metadata` for `schema_version`; if table missing → version = 0 |
| Pending migration filtering | Sort by version ascending; filter `version > currentVersion` |
| Per-migration transaction orchestration | Each migration executes inside `DatabaseConnection.transaction()` |
| SQL statement splitting | Split migration SQL content on `;` separators, execute each statement individually within the transaction |
| PRAGMA statement routing | Statements starting with `PRAGMA` (case-insensitive) are routed through `db.query()`; all others through `db.execute()` — accommodates AD-05 platform difference |
| Version update inside transaction | `UPDATE app_metadata SET value = ? WHERE key = 'schema_version'` executed atomically with the migration's DDL/DML |
| Post-migration integrity checks | After all migrations complete: `PRAGMA integrity_check` and `PRAGMA foreign_key_check` via `db.query()` |
| Error surfacing | Migration failures throw `DatabaseError` with migration version, SQL statement, and cause |
| Barrel re-export from `packages/shared/src/index.ts` | Makes types importable via `@collectio/shared` |

---

## 3. Out of Scope

| Out of Scope | Why | Where It Belongs |
|-------------|-----|-----------------|
| Migration SQL file content | Separate tasks: T-02.7 (001), T-02.8 (002) | E-02 T-02.7, T-02.8 |
| File system discovery of `.sql` files | Platform-dependent (Electron uses `fs`, Capacitor uses Vite bundling). The runner receives `Migration[]` pre-loaded by the caller | App entry point (`apps/electron/src/main.ts`, `apps/capacitor/src/index.tsx`) |
| `app_metadata` table creation | Migration 001 creates it — the runner only reads/updates the `schema_version` key | E-02 T-02.7 |
| Repository implementations | Repositories are consumers of the migrated schema — created after migrations exist | E-02 T-02.9–T-02.15 |
| Multi-statement SQL execution within `execute()` | The `DatabaseConnection` interface rejects multiple statements. The runner splits on `;` and executes individually | This task |
| Migration rollback (undo) | V1 has no automatic rollback; failed migration is rolled back (transaction abort) but no inverse migration is applied | N/A (V1 policy per 04_MIGRATION_STRATEGY.md §5) |
| WAL checkpointing or VACUUM after migration | SQLite manages WAL automatically | Future |
| Migration logging to a database table | Logging is console/file-based per 04_MIGRATION_STRATEGY.md §7 — no `migration_log` table | This task (logs to console) |
| Concurrent migration prevention | V1 is single-process; the runner assumes single-threaded startup | Future |

---

## 4. Files To Create

| # | File | Purpose | Responsibility |
|---|------|---------|---------------|
| 1 | `packages/shared/src/data/database/MigrationRunner.ts` | Versioned migration executor class | Implements the migration algorithm from 04_MIGRATION_STRATEGY.md. Constructor takes `DatabaseConnection` + `Migration[]`. Exposes `run(): Promise<MigrationReport>`. Reads `schema_version` from `app_metadata`, filters pending migrations, executes each in a transaction via the injected connection, updates version atomically, runs post-migration integrity checks. Splits migration SQL on `;` separators, routes PRAGMA statements to `query()`, and routes DDL/DML to `execute()`. Surfaces failures via `DatabaseError`. |
| 2 | `packages/shared/src/data/database/MigrationTypes.ts` | Type definitions: `Migration`, `MigrationResult`, `MigrationReport`, `MigrationStatus` | Pure types, no runtime code. `Migration.version` is integer, `Migration.sql` is raw file content string. `MigrationResult` captures per-migration outcome. `MigrationReport` aggregates all results. |
| 3 | `packages/shared/src/data/database/__tests__/MigrationRunner.test.ts` | Unit tests using mocked `DatabaseConnection` | Creates a mock `DatabaseConnection` that records all `execute()`/`query()`/`transaction()` calls. Tests: fresh install (0→1→2), incremental upgrade (1→2), idempotency (run twice), migration error rollback, PRAGMA routing, empty database detection, version gap detection, post-migration integrity check. No actual SQLite — purely orchestration logic tests. |

### 4.1 Public API — `MigrationTypes.ts`

**Exported types:**

```
type MigrationStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'SKIPPED'

interface Migration {
  version: number        // Integer migration version (1, 2, 3...)
  sql: string            // Raw content of the .sql migration file
}

interface MigrationResult {
  version: number
  status: MigrationStatus
  durationMs: number
  error?: string         // Error message if FAILED
  statementsExecuted: number  // Count of SQL statements executed in this migration
}

interface MigrationReport {
  startedAt: string      // ISO-8601
  completedAt: string    // ISO-8601
  currentVersion: number // Schema version before run
  finalVersion: number   // Schema version after run (same as currentVersion if no migrations)
  results: MigrationResult[]
  integrityCheck: string // Result of PRAGMA integrity_check (e.g., 'ok')
  foreignKeyCheck: string // Result of PRAGMA foreign_key_check (empty string if no violations)
}
```

### 4.2 Public API — `MigrationRunner.ts`

**Exported class:**

```
class MigrationRunner
```

**Constructor:**

```
constructor(db: DatabaseConnection, migrations: Migration[])
```

- `db`: An already-opened `DatabaseConnection` instance. The runner does NOT call `open()` or `close()` — lifecycle is managed by the caller
- `migrations`: Sorted array of `Migration` objects in ascending version order. The caller is responsible for sorting and providing all available migrations (not just pending ones — the runner filters internally)
- The `migrations` array can be empty — the runner will detect no pending migrations and complete with a no-op report

**Method: `async run(): Promise<MigrationReport>`**

Algorithm (matching 04_MIGRATION_STRATEGY.md §1):

1. **Record start time** (`new Date().toISOString()`)
2. **Detect current version:**
   - Query `SELECT value FROM app_metadata WHERE key = 'schema_version'`
   - If table `app_metadata` does not exist (query throws with "no such table") → `currentVersion = 0`
   - If table exists but no `schema_version` key → throw `DatabaseError("schema_version key not found in app_metadata")`
   - If key exists → parse `value` as integer
3. **Filter pending migrations:** `migrations.filter(m => m.version > currentVersion)`
   - If no pending migrations: skip to step 7 (post-migration integrity + report)
4. **Validate no version gaps:** pending migrations must form a consecutive sequence starting from `currentVersion + 1`. If gap detected (e.g., current=1, pending=[3]) → throw `DatabaseError("Missing migration: version 2")`
5. **Execute each pending migration in order:**
   - For each pending migration:
     a. Record start time for this migration
     b. Execute inside `db.transaction(async (conn) => { ... })`:
        - Split `migration.sql` on `;` separators into individual statements
        - For each non-empty statement:
          - If statement starts with `PRAGMA` (case-insensitive, ignoring leading whitespace) → `await conn.query(statement)` (Rule 4.1 / AD-05 — PRAGMAs must use `query()` on Android)
          - Otherwise → `await conn.execute(statement)` (DDL/DML via `execute()`)
        - After all statements: `await conn.execute("UPDATE app_metadata SET value = ? WHERE key = 'schema_version'", [String(migration.version)])`
     c. Record success result with duration and statement count
     d. If transaction throws: catch, record failure result with error message, log the error, re-throw to abort the entire run
   - If any migration fails → stop processing remaining migrations; throw `DatabaseError` wrapping the failing migration's error
6. **Post-migration integrity checks:**
   - `const integrity = await db.query<{ integrity_check: string }>('PRAGMA integrity_check')` — extract value from first row
   - `const fkCheck = await db.query('PRAGMA foreign_key_check')` — extract violation rows if any
   - If `integrity_check !== 'ok'` → log warning (but do not abort — DB is readable but may have structural issues)
   - If `foreign_key_check` returns rows → log warning with violation details
7. **Record completion time; return `MigrationReport`**

**Private method: `splitStatements(sql: string): string[]`**

Splits raw migration SQL content on `;` separators. Handles:
- Trims whitespace from each statement
- Filters out empty statements (blank lines, trailing semicolons)
- Does NOT split inside string literals (basic `'...'` and `"..."` awareness)
- Statements are returned in order, with the trailing `;` stripped

**Private method: `isPragmaStatement(stmt: string): boolean`**

Checks if a trimmed, uppercase statement starts with `PRAGMA`. Case-insensitive match. Leading whitespace ignored.

---

## 5. Files To Modify

| # | File | Change | Rationale |
|---|------|--------|-----------|
| 1 | `packages/shared/src/index.ts` | Add barrel re-exports: `export { MigrationRunner } from './data/database/MigrationRunner.js'` and `export type { Migration, MigrationResult, MigrationReport, MigrationStatus } from './data/database/MigrationTypes.js'` | Makes the runner and types importable via `import { MigrationRunner } from '@collectio/shared'` |
| 2 | `packages/shared/package.json` | No change required | No new dependencies — pure TypeScript, no runtime deps |
| 3 | `packages/shared/tsconfig.json` | No change required | `include: ["src"]` already covers the new files |

---

## 6. Interfaces

### 6.1 Constructor Dependency

The runner takes two dependencies via constructor injection:

| Parameter | Type | Source | Notes |
|-----------|------|--------|-------|
| `db` | `DatabaseConnection` | `@collectio/shared` | Already-opened connection; runner calls `execute()`, `query()`, `transaction()` |
| `migrations` | `Migration[]` | Caller provides | Sorted ascending by version; all available migrations (runner filters pending) |

### 6.2 Internal SQL Operations

All SQL operations go through the injected `DatabaseConnection`. The runner never constructs raw SQLite handle references.

| Operation | Interface Method | SQL |
|-----------|-----------------|-----|
| Read current version | `db.query<{value: string}>("SELECT value FROM app_metadata WHERE key = ?", ["schema_version"])` | `SELECT value FROM app_metadata WHERE key = 'schema_version'` |
| Execute DDL (CREATE TABLE, ALTER TABLE, etc.) | `db.execute(statement)` — unparameterized | Varies per migration |
| Execute DML (INSERT seed data, etc.) | `db.execute(statement)` — unparameterized | Varies per migration |
| Execute PRAGMA | `db.query(statement)` | `PRAGMA foreign_keys = ON`, etc. |
| Update version (parameterized) | `db.execute("UPDATE app_metadata SET value = ? WHERE key = ?", [String(version), "schema_version"])` | Parameterized for safety |
| Transaction wrapper | `db.transaction(async (conn) => { ... })` | Each migration is a transaction |
| Post-migration integrity | `db.query("PRAGMA integrity_check")` | Returns `[{integrity_check: 'ok'}]` |
| Post-migration FK check | `db.query("PRAGMA foreign_key_check")` | Returns `[]` if no violations |

### 6.3 PRAGMA Routing Logic

Per AD-05, PRAGMA statements must use `query()` on Capacitor Android (Android's `execSQL()` rejects result-returning statements). The runner routes PRAGMA statements to `query()` and all other statements to `execute()` — this works correctly on both platforms:

- **Electron:** `BetterSqlite3Connection.query()` calls `db.prepare(sql).all()` — PRAGMAs work fine with this
- **Capacitor:** `CapacitorSqliteConnection.query()` calls `dbConn.query(sql)` — PRAGMAs work fine with this (Rule 4.1)
- **DDL/DML on Capacitor:** `CapacitorSqliteConnection.execute()` with no params routes to `dbConn.execute(sql, false)` — works fine for unparameterized DDL/DML per Rule 4.7

### 6.4 Statement Splitting Algorithm

The `splitStatements()` method must handle:

- Simple semicolon-delimited SQL: `CREATE TABLE x (...); CREATE TABLE y (...);`
- Multi-line statements where `;` is the terminator on its own line
- Empty statements (blank lines between statements, trailing semicolons)
- String literals containing `;` — basic single-quote and double-quote awareness to avoid splitting mid-string
- Comments (`--` to end of line) are preserved as part of their statement

The algorithm:
1. Iterate through SQL characters, tracking whether inside a string literal
2. When `;` is encountered outside a string: emit the accumulated statement, reset
3. When end of input: emit any remaining non-empty statement
4. Trim whitespace from each emitted statement
5. Filter out empty strings

This is deliberately simple — migration SQL is hand-written, not generated. It does not need to handle all edge cases of SQL parsing (nested BEGIN/END blocks, dollar-quoting, etc.).

---

## 7. Data Flow

```
App Entry Point (apps/electron/src/main.ts or apps/capacitor/src/index.tsx)
  │
  ├─ const db = new BetterSqlite3Connection()  (or CapacitorSqliteConnection)
  ├─ await db.open(dbPath)
  │     └─ PRAGMAs set (foreign_keys, journal_mode, synchronous, busy_timeout)
  │
  ├─ const migrations = [
  │     { version: 1, sql: "<contents of 001_core_infrastructure.sql>" },
  │     { version: 2, sql: "<contents of 002_songs_category.sql>" },
  │   ]
  │
  ├─ const runner = new MigrationRunner(db, migrations)
  │
  └─ const report = await runner.run()
        │
        ├─ currentVersion = await db.query("SELECT value FROM app_metadata WHERE key = 'schema_version'")
        │     └─ Table missing → currentVersion = 0
        │     └─ Key missing → throw DatabaseError
        │     └─ Value = "1" → currentVersion = 1
        │
        ├─ pending = migrations.filter(m => m.version > currentVersion)
        │     └─ Validate no gaps (versions must be consecutive)
        │
        ├─ FOR EACH pending migration:
        │     │
        │     └─ await db.transaction(async (conn) => {
        │           │
        │           ├─ statements = splitStatements(migration.sql)
        │           │
        │           ├─ FOR EACH statement:
        │           │     ├─ isPragma? → await conn.query(statement)
        │           │     └─ else      → await conn.execute(statement)
        │           │
        │           └─ await conn.execute(
        │                "UPDATE app_metadata SET value = ? WHERE key = ?",
        │                [String(migration.version), "schema_version"]
        │              )
        │        })
        │        │
        │        ├─ Success → record MigrationResult { status: 'SUCCESS', ... }
        │        └─ Failure → record MigrationResult { status: 'FAILED', ... }, throw
        │
        ├─ integrity = await db.query("PRAGMA integrity_check")
        ├─ fkViolations = await db.query("PRAGMA foreign_key_check")
        │
        └─ return MigrationReport { currentVersion, finalVersion, results, integrityCheck, foreignKeyCheck }
```

Import chain:
```
@collectio/shared  (MigrationRunner class, Migration types)
        ↑
apps/electron  (main.ts: loads .sql files via fs, creates runner, calls run)
apps/capacitor (index.tsx: imports .sql via Vite raw, creates runner, calls run)
```

---

## 8. State Changes

### 8.1 Database State Transitions

| Stage | `schema_version` in `app_metadata` | Database Tables |
|-------|-----------------------------------|-----------------|
| Before runner (fresh DB) | Table does not exist | None |
| Runner start (fresh DB) | Detected as version 0 | None |
| After migration 001 | `"1"` | `app_metadata`, `devices`, `sync_log`, `app_settings`, `languages`, `categories`; ~60 language rows + `songs` category row seeded |
| After migration 002 | `"2"` | All above + `artists`, `songs`, `song_artists` |
| Runner complete (already up-to-date) | `"2"` (unchanged) | All tables unchanged |

### 8.2 Runner Internal State

| Phase | Internal State |
|-------|---------------|
| Construction | `db` and `migrations` stored; no SQL executed yet |
| `run()` — version detection | `currentVersion` determined; `pendingVersions` computed |
| `run()` — migration loop | Each migration version transitions from PENDING → SUCCESS or FAILED in the results array |
| `run()` — integrity check | Results array complete; integrity values captured |
| `run()` — return | Immutable `MigrationReport` returned; runner instance is reusable (call `run()` again — it'll re-read version and execute only pending) |

### 8.3 Transaction Atomicity

Each migration version update is atomic:
- If the migration SQL succeeds but the version UPDATE fails → transaction rolls back, version unchanged, migration re-executed on next run
- If the migration SQL fails → transaction rolls back, version unchanged, runner aborts
- The `UPDATE app_metadata SET value = ? WHERE key = 'schema_version'` is the LAST statement in the transaction — it only executes after all migration DDL/DML succeeds

This guarantees the `schema_version` always accurately reflects which migrations have been fully applied.

---

## 9. Database Changes

**None directly from the runner itself.** The runner executes DDL/DML contained in the `Migration.sql` strings it receives. The runner's own SQL operations are:
- `SELECT value FROM app_metadata WHERE key = 'schema_version'` (read only)
- `UPDATE app_metadata SET value = ? WHERE key = 'schema_version'` (updates version)
- `PRAGMA integrity_check` (read only)
- `PRAGMA foreign_key_check` (read only)

No tables are created, dropped, or altered by the runner directly.

---

## 10. Error Handling

### 10.1 Error Classification

| Error Condition | Detection | Response |
|----------------|-----------|----------|
| `app_metadata` table does not exist | `db.query()` for `schema_version` throws with "no such table" | Treat as `currentVersion = 0` (first launch) |
| `app_metadata` exists but `schema_version` key missing | `db.query()` returns `[]` (empty result) | Throw `DatabaseError("schema_version key not found in app_metadata. Database may be corrupt.")` |
| `schema_version` value is not a valid integer | `parseInt()` returns `NaN` | Throw `DatabaseError("Invalid schema_version value: '${value}'")` |
| No pending migrations | `pending.length === 0` | No-op; proceed to integrity checks; return report with `finalVersion === currentVersion` |
| Version gap detected | `pending[0].version !== currentVersion + 1` or non-consecutive pending versions | Throw `DatabaseError("Missing migration: version ${expected}")` |
| Migration SQL execution fails (DDL error, constraint violation, etc.) | `db.execute()` throws inside transaction | Transaction rolls back. Error wrapped in `DatabaseError` with `sql`, `params`, `cause`. Runner aborts and throws. `MigrationResult` recorded for the failed migration with `status: 'FAILED'` |
| Version update fails | `db.execute("UPDATE app_metadata...")` throws inside transaction | Same as migration SQL failure — transaction rolls back |
| Transaction `beginCommit()`/`commitTransaction()` fails | `db.transaction()` throws its own error | Wrapped in `DatabaseError`; runner aborts |
| Integrity check fails | `integrity_check` returns value !== `'ok'` | Logged as warning in the `MigrationReport.integrityCheck` field. Runner does NOT abort — DB is readable but may have structural issues. Caller decides whether to proceed |
| Foreign key check finds violations | `foreign_key_check` returns non-empty array | Logged as warning in the `MigrationReport.foreignKeyCheck` field. Runner does NOT abort. Caller decides |

### 10.2 Error Wrapping

All errors thrown by the runner must include context:

```
new DatabaseError(
  `Migration ${version} failed: ${originalError.message}`,
  { cause: originalError }
)
```

The `cause` chain preserves the full stack trace back to the underlying SQLite error.

### 10.3 Per-Migration Failure Behavior

```
Migration 001: SUCCESS → schema_version = 1
Migration 002: FAILED  → transaction rolled back, schema_version stays 1, runner aborts
Migration 003: NOT ATTEMPTED (runner stopped after 002 failure)
```

The `MigrationReport` returned reflects partial progress:
- `currentVersion: 0`
- `finalVersion: 1` (only 001 succeeded)
- `results: [{version: 1, status: 'SUCCESS'}, {version: 2, status: 'FAILED', error: '...'}]`

### 10.4 Idempotency Guarantee

Running the runner twice on the same database is safe and produces the same result:
- First run: `currentVersion = 1` → executes migration 002 → `finalVersion = 2`
- Second run: `currentVersion = 2` → `pending = []` → no-op → `finalVersion = 2`

---

## 11. Logging Requirements

The runner logs to the console at key decision points. Logging is informational — the `MigrationReport` is the canonical record.

| Event | Log Level | Message |
|-------|-----------|---------|
| Runner started | info | `MigrationRunner: starting. Current schema version: ${currentVersion}` |
| No pending migrations | info | `MigrationRunner: database is up-to-date at version ${currentVersion}` |
| Pending migrations found | info | `MigrationRunner: ${count} pending migration(s): versions [${versions}]` |
| Migration started | info | `MigrationRunner: executing migration ${version}` |
| Migration completed | info | `MigrationRunner: migration ${version} completed (${durationMs}ms, ${statements} statements)` |
| Migration failed | error | `MigrationRunner: migration ${version} FAILED: ${error.message}` |
| Runner completed | info | `MigrationRunner: completed. Version ${currentVersion} → ${finalVersion}` |
| Integrity check warning | warn | `MigrationRunner: PRAGMA integrity_check returned: "${value}"` |
| FK check warning | warn | `MigrationRunner: PRAGMA foreign_key_check found ${count} violation(s)` |

All log messages are prefixed with `MigrationRunner:` for filtering.

---

## 12. Security Requirements

| Requirement | Status |
|------------|--------|
| Parameterized SQL for version update | ENFORCED — `db.execute("UPDATE app_metadata SET value = ? WHERE key = ?", [String(version), "schema_version"])` uses `?` placeholders |
| No string interpolation for values | ENFORCED — migration version is never concatenated into SQL; passed as parameter |
| No raw SQL from user input | ENFORCED — all SQL comes from trusted migration files bundled with the application. No user-provided SQL |
| No secrets in migration files | PASS — migration files contain schema definitions only; no passwords, tokens, or keys |
| No file system access from runner | ENFORCED — runner receives pre-loaded `Migration[]`; zero `fs`, `path`, or file I/O |

---

## 13. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `MigrationRunner` class compiles in `packages/shared/` | `pnpm --filter @collectio/shared typecheck` — zero errors |
| 2 | `Migration`, `MigrationResult`, `MigrationReport`, `MigrationStatus` types compile | Same typecheck pass |
| 3 | Barrel export compiles: `import { MigrationRunner } from '@collectio/shared'` | TypeScript resolves the import without errors |
| 4 | Fresh database (version 0): runs migrations 1 and 2, `schema_version` = `"2"` | Unit test with mock DB |
| 5 | Database at version 1: runs only migration 2, `schema_version` = `"2"` | Unit test: seed mock DB with `schema_version = "1"` |
| 6 | Database at version 2: no migrations run, `schema_version` = `"2"` (idempotent) | Unit test: seed mock DB with `schema_version = "2"` |
| 7 | Migration SQL error: transaction rolled back, `schema_version` unchanged, error thrown | Unit test: migration 2 throws, verify `schema_version` stays at 1 |
| 8 | Version gap detected: error thrown with "Missing migration" message | Unit test: current version = 0, migrations = [{version: 1}, {version: 3}] |
| 9 | Missing `schema_version` key: error thrown with "not found" message | Unit test: `app_metadata` exists but `schema_version` row missing |
| 10 | Invalid `schema_version` value: error thrown with "Invalid" message | Unit test: `schema_version` value = `"abc"` |
| 11 | PRAGMA statements routed to `query()`, DDL/DML routed to `execute()` | Unit test: migration contains `PRAGMA foreign_keys = ON` and `CREATE TABLE...`; verify `query()` called for PRAGMA, `execute()` for CREATE |
| 12 | Version update is last statement in transaction | Unit test: verify order of mock calls within `transaction()` callback — version UPDATE is last |
| 13 | `PRAGMA integrity_check` executed after all migrations | Unit test: verify `query('PRAGMA integrity_check')` called after migration loop completes |
| 14 | `PRAGMA foreign_key_check` executed after all migrations | Unit test: verify `query('PRAGMA foreign_key_check')` called |
| 15 | `MigrationReport` contains complete results for all attempted migrations | Unit test: verify report shape — `startedAt`, `completedAt`, `currentVersion`, `finalVersion`, `results[]`, `integrityCheck`, `foreignKeyCheck` |
| 16 | Failed migration does not prevent report generation | Unit test: migration 2 fails → `MigrationReport` returned with `results[1].status === 'FAILED'` |
| 17 | `splitStatements()` correctly splits semicolon-delimited SQL | Unit test: input `"CREATE TABLE x (id INT);\nINSERT INTO x VALUES (1);"` → 2 statements |
| 18 | `splitStatements()` handles empty statements and trailing semicolons | Unit test: input `"SELECT 1;\n\nSELECT 2;\n"` → 2 statements |
| 19 | `isPragmaStatement()` correctly identifies PRAGMA statements | Unit test: `" PRAGMA foreign_keys = ON"` → `true`; `"CREATE TABLE..."` → `false` |
| 20 | Runner does not throw on empty migrations array | Unit test: `migrations = []`, `currentVersion = 2` → report with `finalVersion = 2` |
| 21 | `tsc --noEmit` passes across all workspace packages | `pnpm typecheck` from root |
| 22 | `pnpm lint` passes for `packages/shared/` | `pnpm --filter @collectio/shared lint` |
| 23 | All unit tests pass with mocked `DatabaseConnection` | `pnpm --filter @collectio/shared test` |
| 24 | Zero platform imports in runner or types files | Grep for `fs`, `path`, `node:`, `@capacitor`, `electron`, `react` — must be zero matches |

---

## 14. Test Cases

### 14.1 Test Setup

All tests use a mocked `DatabaseConnection`. The mock:
- Maintains an in-memory `Map<string, string>` representing `app_metadata` key-value pairs
- Records all `execute()` and `query()` calls with their SQL and params
- Records `transaction()` calls and executes the callback with the mock instance
- Supports configurable error injection (`execute()` throws for specific SQL patterns)
- `query()` returns configurable results (empty table, specific rows)

Each test creates a `MigrationRunner` with the mock and a set of `Migration[]` fixtures:
```
const m1 = { version: 1, sql: "PRAGMA foreign_keys = ON;\nCREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);\nINSERT INTO app_metadata (key, value) VALUES ('schema_version', '0');" };
const m2 = { version: 2, sql: "CREATE TABLE artists (id TEXT PRIMARY KEY, ...);" };
```

### 14.2 Required Test Cases

#### Fresh Install (Version 0 → Latest)
```
Test: Fresh database runs all migrations
  → Mock: app_metadata table does not exist (query throws "no such table")
  → runner = new MigrationRunner(mockDb, [m1, m2])
  → report = await runner.run()
  → report.currentVersion === 0
  → report.finalVersion === 2
  → report.results.length === 2
  → report.results[0].status === 'SUCCESS', version === 1
  → report.results[1].status === 'SUCCESS', version === 2
  → mock records: execute("UPDATE app_metadata SET value = ? WHERE key = ?", ["1", "schema_version"]) called during migration 1
  → mock records: execute("UPDATE app_metadata SET value = ? WHERE key = ?", ["2", "schema_version"]) called during migration 2
  → query("PRAGMA integrity_check") called after migrations
  → query("PRAGMA foreign_key_check") called after migrations
```

#### Incremental Upgrade (Version 1 → 2)
```
Test: Database at version 1 runs only migration 2
  → Mock: app_metadata has schema_version = "1"
  → runner = new MigrationRunner(mockDb, [m1, m2])
  → report = await runner.run()
  → report.currentVersion === 1
  → report.finalVersion === 2
  → report.results.length === 1  (only migration 2)
  → report.results[0].version === 2
  → report.results[0].status === 'SUCCESS'
  → Migration 1's SQL was NEVER executed (not in mock call records)
```

#### Idempotency (Version 2 → 2, No Pending)
```
Test: Already up-to-date database is a no-op
  → Mock: app_metadata has schema_version = "2"
  → runner = new MigrationRunner(mockDb, [m1, m2])
  → report = await runner.run()
  → report.currentVersion === 2
  → report.finalVersion === 2
  → report.results.length === 0  (no migrations executed)
  → No execute() calls for migration SQL made
  → integrity_check and foreign_key_check still executed
```

#### Migration Error Rollback
```
Test: Failed migration rolls back, version unchanged
  → Mock: app_metadata has schema_version = "1"
  → Mock: execute() on "CREATE TABLE artists" throws DatabaseError("table already exists")
  → runner = new MigrationRunner(mockDb, [m1, m2])
  → await runner.run() throws DatabaseError
  → The thrown error contains "Migration 2 failed"
  → Mock verifies: transaction was rolled back (rollbackTransaction called OR callback threw)
  → Mock verifies: version UPDATE for migration 2 was NEVER committed
  → schema_version in mock is still "1"
```

#### Version Gap Detection
```
Test: Gap in migration versions throws error
  → Mock: app_metadata has schema_version = "1"
  → m3 = { version: 3, sql: "CREATE TABLE books (...);" }
  → runner = new MigrationRunner(mockDb, [m1, m3])
  → await runner.run() throws DatabaseError("Missing migration: version 2")
```

#### Missing schema_version Key
```
Test: Missing schema_version key throws error
  → Mock: app_metadata exists but has no 'schema_version' row (query returns [])
  → runner = new MigrationRunner(mockDb, [m1])
  → await runner.run() throws DatabaseError("schema_version key not found")
```

#### Invalid schema_version Value
```
Test: Non-numeric schema_version throws error
  → Mock: app_metadata has schema_version = "abc"
  → runner = new MigrationRunner(mockDb, [m1])
  → await runner.run() throws DatabaseError("Invalid schema_version value")
```

#### PRAGMA Routing
```
Test: PRAGMA statements are routed to query() not execute()
  → Mock: app_metadata table does not exist
  → m1 = { version: 1, sql: "PRAGMA foreign_keys = ON;\nCREATE TABLE t (id INT);" }
  → runner = new MigrationRunner(mockDb, [m1])
  → await runner.run()
  → query() was called with "PRAGMA foreign_keys = ON"
  → execute() was called with "CREATE TABLE t (id INT)"
  → execute() was NOT called with "PRAGMA foreign_keys = ON"
```

#### Multiple PRAGMA Statements
```
Test: Migration with multiple PRAGMAs routes all to query()
  → sql = "PRAGMA journal_mode = WAL;\nPRAGMA synchronous = NORMAL;\nCREATE TABLE t (id INT);"
  → All three statements execute; first two via query(), third via execute()
```

#### Empty Migrations Array
```
Test: No migrations provided completes cleanly
  → Mock: app_metadata has schema_version = "0"
  → runner = new MigrationRunner(mockDb, [])
  → report = await runner.run()
  → report.currentVersion === 0
  → report.finalVersion === 0
  → report.results.length === 0
  → No errors thrown
```

#### Statement Splitting
```
Test: splitStatements basic
  → splitStatements("CREATE TABLE a (id INT);\nINSERT INTO a VALUES (1);")
  → ["CREATE TABLE a (id INT)", "INSERT INTO a VALUES (1)"]

Test: splitStatements handles trailing semicolon
  → splitStatements("SELECT 1;\n")
  → ["SELECT 1"]

Test: splitStatements handles blank lines
  → splitStatements("SELECT 1;\n\nSELECT 2;")
  → ["SELECT 1", "SELECT 2"]

Test: splitStatements handles semicolon inside string literal
  → splitStatements("INSERT INTO t (val) VALUES ('hello;world');")
  → ["INSERT INTO t (val) VALUES ('hello;world')"]

Test: splitStatements handles multi-line statements
  → splitStatements("CREATE TABLE t (\n  id INT,\n  name TEXT\n);")
  → ["CREATE TABLE t (\n  id INT,\n  name TEXT\n)"]
```

#### isPragmaStatement
```
Test: isPragmaStatement detects PRAGMA
  → isPragmaStatement("PRAGMA foreign_keys = ON") → true
  → isPragmaStatement("pragma journal_mode = WAL") → true
  → isPragmaStatement("  PRAGMA synchronous = NORMAL") → true
  → isPragmaStatement("CREATE TABLE t (id INT)") → false
  → isPragmaStatement("SELECT * FROM pragma_table") → false
```

#### Version Update Order
```
Test: Version update is the last execute() call in the transaction
  → Migration 1 executes 3 statements: PRAGMA, CREATE TABLE, INSERT
  → Verify execute() call order: [CREATE, INSERT, UPDATE version]
  → The version UPDATE is the last execute() call before COMMIT
```

---

## 15. Definition Of Done

- [ ] `MigrationTypes.ts` exists at `packages/shared/src/data/database/MigrationTypes.ts` with `Migration`, `MigrationResult`, `MigrationReport`, `MigrationStatus` types
- [ ] `MigrationRunner.ts` exists at `packages/shared/src/data/database/MigrationRunner.ts`
- [ ] `MigrationRunner` class accepts `DatabaseConnection` + `Migration[]` via constructor
- [ ] `run()` returns `Promise<MigrationReport>` with complete results
- [ ] Version detection: handles missing table, missing key, invalid value, valid value
- [ ] Pending migration filtering: sorts by version, filters `> currentVersion`
- [ ] Version gap validation: rejects non-consecutive pending migrations
- [ ] Each migration executes inside a single `transaction()` call
- [ ] SQL splitting: migration file content split on `;` into individual statements
- [ ] PRAGMA routing: statements starting with `PRAGMA` routed to `db.query()`
- [ ] DDL/DML routing: non-PRAGMA statements routed to `db.execute()`
- [ ] Version update: `UPDATE app_metadata SET value = ? WHERE key = 'schema_version'` is the last statement in each migration's transaction
- [ ] Post-migration: `PRAGMA integrity_check` and `PRAGMA foreign_key_check` executed via `db.query()`
- [ ] Error handling: migration failures throw `DatabaseError` with version, SQL, and cause
- [ ] Failed migration does not prevent report generation (results include FAILED entries)
- [ ] `packages/shared/src/index.ts` re-exports `MigrationRunner` and types
- [ ] `pnpm --filter @collectio/shared typecheck` passes with zero errors
- [ ] `pnpm --filter @collectio/shared lint` passes with zero errors
- [ ] All unit tests pass with mocked `DatabaseConnection`
- [ ] Zero platform imports: no `fs`, `path`, `node:`, `@capacitor`, `electron`, `react` in runner or types files
- [ ] Zero file I/O: runner does not read or write files; all SQL content comes from constructor injection
- [ ] All acceptance criteria 1–24 verified
