# E-02 T-05 — Implement CapacitorSqliteConnection (Android)

**Parent Epic:** E-02: Database Layer
**Type:** Production Implementation (Platform Adapter)
**Criticality:** FOUNDATION — this is the production database adapter for all Capacitor (Android) database operations. Every repository, the migration runner, and the sync engine depend on this for local data access on Android.

---

## 1. Goal

Implement `CapacitorSqliteConnection` — the Android platform adapter that wraps `@capacitor-community/sqlite` v6.0.2 behind the async `DatabaseConnection` interface defined in T-02.3. This adapter is created once at Capacitor app startup and injected into every repository, the migration runner, and the sync engine.

The E02-T02 verification script proved `@capacitor-community/sqlite` works correctly on a physical Android device with FK enforcement, WAL mode, transaction integrity, and data persistence. This task translates those verified raw plugin API patterns into the typed production interface.

This is the Capacitor counterpart to E02-T04 (`BetterSqlite3Connection`). Both adapters implement the same interface; they differ in the underlying SQLite driver and platform-specific behavioral rules.

---

## 2. Scope

| In Scope | Rationale |
|----------|-----------|
| `CapacitorSqliteConnection` class implementing `DatabaseConnection` | The 5 async methods wrapping `@capacitor-community/sqlite`'s native async plugin API |
| ESM imports from `@capacitor-community/sqlite` | Native ESM plugin — no `createRequire` needed (unlike `better-sqlite3` which is CJS) |
| Single `SQLiteConnection` instance lifecycle | Module-level singleton per AD-06 / Rule 4.4; `isConnection()`/`retrieveConnection()` pattern per IW-02 |
| PRAGMA setup in `open()` via `query()` | ALL PRAGMAs must use `query()` (Rule 4.1) — Android `execSQL()` rejects result-returning statements (PL-01) |
| `execute()` with explicit `transaction: false` | Plugin defaults `transaction = true` — must pass `false` to avoid implicit wrapping (Rule 4.2) |
| Transaction orchestration via `beginTransaction()`/`commitTransaction()`/`rollbackTransaction()` | Plugin provides native transaction API — use it instead of manual `BEGIN`/`COMMIT`/`ROLLBACK` |
| Error mapping: plugin `Error` → typed error hierarchy | Inspect error message for "FOREIGN KEY" / "SQLITE_CONSTRAINT" → `ConstraintError`; all others → `DatabaseError`; plugin/connection init failure → `ConnectionError` |
| Input validation | Reject SQL strings containing multiple statements (semicolons); param count correctness |
| Result casting to explicit interfaces | Plugin returns loosely-typed objects — must cast `execute()` and `query()` results per Rule 4.6 / PL-09 |
| `execute()` via `dbConn.execute(sql, false)` | Returns `Promise<void>` after discarding the `changes` result |
| `query<T>()` via `dbConn.query(sql)` and `result.values` | Extracts rows from the nested `values` property |
| Barrel re-export from `packages/platform/src/capacitor/index.ts` | Makes the class importable by the Capacitor app entry |

---

## 3. Out of Scope

| Out of Scope | Why | Where It Belongs |
|-------------|-----|-----------------|
| Electron SQLite adapter | Separate platform adapter, already implemented | E-02 T-02.4 |
| Database file path resolution | The Capacitor app entry resolves the database path and passes it to `open()` | App entry / DI container |
| `DatabaseConnection` interface definition | Already defined in T-02.3 | E-02 T-02.3 |
| Migration runner integration | The migration runner receives `DatabaseConnection` via constructor injection; this task just creates the adapter | E-02 T-02.6 |
| Repository implementations | Repositories call the adapter's methods; not created yet | E-02 T-02.9–T-02.15 |
| Capacitor plugin registration in `MainActivity.java` | Already verified in T-02.2 | Capacitor app config |
| `androidIsEncryption: false` in `capacitor.config.ts` | Already verified in T-02.2; this adapter does not control plugin-level configuration | Capacitor app config |
| Connection pooling or multiple databases | V1 uses a single database file | Future |
| WAL checkpointing or VACUUM | SQLite manages WAL automatically; VACUUM is a maintenance operation | Future |
| React Strict Mode double-mount handling in the adapter itself | The adapter uses `isConnection()`/`retrieveConnection()` which handles this (IW-02); the responsibility to call this correctly is on the adapter, not the app entry | E-02 T-02.5 |
| Unit tests running on-device | Unit tests use mocked `@capacitor-community/sqlite` imports only; on-device testing was completed in T-02.2 | E-02 T-02.2 |

---

## 4. Files To Create

| # | File | Purpose | Responsibility |
|---|------|---------|---------------|
| 1 | `packages/platform/src/capacitor/CapacitorSqliteConnection.ts` | Production Capacitor database adapter class | Implements the `DatabaseConnection` interface from `@collectio/shared`. Imports `SQLiteConnection`, `CapacitorSQLite`, `SQLiteDBConnection` from `@capacitor-community/sqlite` as ESM. Uses module-level singleton `SQLiteConnection` instance. Handles `open()` lifecycle: `isConnection()` → `createConnection()`/`retrieveConnection()` → `dbConn.open()` → PRAGMA setup via `query()`. `execute()` uses `dbConn.execute(sql, false)` with explicit `transaction: false`. `query<T>()` uses `dbConn.query(sql)` and extracts `result.values`. `transaction<T>()` uses `beginTransaction()`/`commitTransaction()`/`rollbackTransaction()`. Maps plugin `Error` messages to `ConstraintError`/`DatabaseError`/`ConnectionError`. Validates input SQL (rejects multi-statement, validates param count). |
| 2 | `packages/platform/src/capacitor/__tests__/CapacitorSqliteConnection.test.ts` | Unit tests using mocked `@capacitor-community/sqlite` | Mocks all `@capacitor-community/sqlite` exports (`SQLiteConnection`, `CapacitorSQLite`) to avoid requiring native Android runtime. Tests all 5 interface methods, error mapping (FK violation → `ConstraintError`), transaction rollback (rows not persisted after throw), idempotent close, PRAGMA values after open, input validation, lifecycle states. Tests MUST compile under `tsc --noEmit`. |

### 4.1 Public API — `CapacitorSqliteConnection.ts`

**Exported class:**

```
class CapacitorSqliteConnection implements DatabaseConnection
```

**Constructor:**
```
constructor()
```
- Takes no arguments — the database name is passed to `open()`, not the constructor
- Stores internal state: `dbName: string | null`, `dbConn: SQLiteDBConnection | null`, `open: boolean`
- Does NOT load or initialize the `SQLiteConnection` in the constructor (lazy init on first `open()`)
- The `SQLiteConnection` instance is a module-level variable (not instance-level) to satisfy AD-06 (single shared instance across all `CapacitorSqliteConnection` instances)
- `open` flag tracks connection state; `dbConn` holds the active `SQLiteDBConnection` handle

**Method: `async open(dbPath: string): Promise<void>`**
- The `dbPath` parameter serves as the database name (e.g., `'collectio'`) — the Capacitor plugin resolves the actual file path internally to the app's private data directory
- If `this.open` is `true`: close existing connection first, then reopen (handles re-open scenario)
- Creates or retrieves the module-level `SQLiteConnection` singleton: `new SQLiteConnection(CapacitorSQLite)` if not already created
- Checks `sqlite.isConnection(dbPath, false)` — if `result` is truthy, calls `sqlite.retrieveConnection(dbPath, false)`; otherwise calls `sqlite.createConnection(dbPath, false, 'no-encryption', 1, false)`
- Calls `await dbConn.open()` to open the database file
- Executes PRAGMAs via `dbConn.query()` (Rule 4.1):
  - `PRAGMA foreign_keys = ON`
  - `PRAGMA journal_mode = WAL`
  - `PRAGMA synchronous = NORMAL`
  - `PRAGMA busy_timeout = 5000`
- Sets `this.dbName = dbPath`, `this.dbConn = dbConn`, `this.open = true`
- Returns `Promise<void>`
- Throws `ConnectionError` if plugin is unavailable, connection creation fails, `open()` fails, or PRAGMAs fail

**Method: `async close(): Promise<void>`**
- If `this.open` is `false` (not opened or already closed): return silently (idempotent)
- Calls `await this.dbConn.close()` — catches and suppresses close errors
- Calls `await sqlite.closeConnection(this.dbName, false)` — catches and suppresses close errors
- Sets `this.dbConn = null`, `this.dbName = null`, `this.open = false`
- Idempotent: safe to call multiple times; second call is a no-op

**Method: `async execute(sql: string, params?: unknown[]): Promise<void>`**
- Checks `this.open` is `true` (throws `ConnectionError` if not open)
- Validates input: rejects multiple statements (detects semicolons), validates parameter count matches `?` count
- **Critical routing (Rule 4.7):** The Capacitor plugin has two separate mutation methods:
  - `dbConn.execute(sql, false)` — for **unparameterized** DML/DDL only; does NOT accept parameters
  - `dbConn.run(sql, params, false)` — for **parameterized** DML with `?` placeholders
- Routing logic:
  - If `params` is non-empty: calls `dbConn.run(sql, params, false)` (parameterized path)
  - If `params` is empty/undefined: calls `dbConn.execute(sql, false)` (unparameterized path)
- **Never** forward params to `dbConn.execute()` — its signature is `execute(statements: string, transaction?: boolean)` only; passing params silently discards them, leaving unbound `?` in the SQL
- Discards the result (the `changes` object) — returns `Promise<void>`
- Catches errors: inspects `err.message` for `'FOREIGN KEY'`, `'SQLITE_CONSTRAINT'`, `'constraint'`, `'CONSTRAINT'` → throws `ConstraintError`; all other errors → throws `DatabaseError`
- Non-`Error` exceptions (unlikely but defensive): wraps in `DatabaseError`

**Method: `async query<T>(sql: string, params?: unknown[]): Promise<T[]>`**
- Checks `this.open` is `true` (throws `ConnectionError` if not open)
- Validates input: rejects multiple statements, validates parameter count
- Calls `dbConn.query(sql, params)` if params provided; otherwise `dbConn.query(sql)`
- Casts result to `{ values?: Record<string, unknown>[] }`
- Returns `(result.values ?? []) as T[]` — empty array for no results
- Error mapping: same as `execute()` (SQL syntax errors → `DatabaseError`)

**Method: `async transaction<T>(fn: (db: DatabaseConnection) => Promise<T>): Promise<T>`**
- Checks `this.open` is `true` (throws `ConnectionError` if not open)
- Calls `await this.dbConn.beginTransaction()`
- Calls `await fn(this)` — passes `this` (the `CapacitorSqliteConnection` instance) as the `DatabaseConnection` argument
- If `fn` resolves: calls `await this.dbConn.commitTransaction()`, returns the callback's value
- If `fn` rejects: calls `await this.dbConn.rollbackTransaction()`, re-throws the original error
- If `beginTransaction()`/`commitTransaction()`/`rollbackTransaction()` themselves fail: maps to `DatabaseError`
- Does NOT support nested transactions

### 4.2 Public API — `CapacitorSqliteConnection.test.ts`

Exports no public API — it is a Jest test file. Tests are structured as `describe`/`it` blocks covering:

- `CapacitorSqliteConnection` class instantiation
- `open()` — verifies `isConnection()`/`createConnection()` calls, PRAGMA setup
- `execute()` — INSERT/UPDATE/DELETE return void, change count verification
- `query()` — SELECT returns typed rows from `result.values`
- `transaction()` — commit path (rows persisted) and rollback path (rows not persisted)
- Error mapping — FK violation throws `ConstraintError`, syntax error throws `DatabaseError`, methods after close throw `ConnectionError`
- `close()` — idempotent (second call no error)
- Input validation — multi-statement SQL rejected, parameter count mismatch
- Lifecycle — `execute()` before `open()` throws `ConnectionError`, after `close()` throws `ConnectionError`, can reopen after close

**Mocking strategy:** Tests mock `@capacitor-community/sqlite` at the module level to avoid requiring a physical Android device or native plugin runtime. The mock provides fake implementations of `SQLiteConnection`, `createConnection`, `retrieveConnection`, `isConnection`, `open`, `close`, `execute`, `query`, `beginTransaction`, `commitTransaction`, `rollbackTransaction`, and `closeConnection` that behave like the real plugin but run in Node.js.

---

## 5. Files To Modify

| # | File | Change | Rationale |
|---|------|--------|-----------|
| 1 | `packages/platform/src/capacitor/index.ts` | Replace `export {};` with `export { CapacitorSqliteConnection } from './CapacitorSqliteConnection.js';` | Makes the adapter importable by the Capacitor app entry and DI container |
| 2 | `packages/platform/package.json` | No change required | `@capacitor-community/sqlite@6.0.2` already in `dependencies`; `@collectio/shared` already in `devDependencies` |
| 3 | `packages/platform/tsconfig.json` | No change required | `include: ["src"]` covers the new file. `lib: ["ES2022", "DOM"]` already set — the adapter must use only ES2022 APIs. DOM libs are present but must not be used by the adapter. |
| 4 | `packages/platform/jest.config.ts` or jest configuration | May need to add `@capacitor-community/sqlite` to `transformIgnorePatterns` or `moduleNameMapper` | Jest must be configured to mock the `@capacitor-community/sqlite` module since it contains native Android code that cannot run in Node.js |

---

## 6. Interfaces

### 6.1 Interface Being Implemented

The adapter implements `DatabaseConnection` from `@collectio/shared`:

```
interface DatabaseConnection {
  open(dbPath: string): Promise<void>
  close(): Promise<void>
  execute(sql: string, params?: unknown[]): Promise<void>
  query<T>(sql: string, params?: unknown[]): Promise<T[]>
  transaction<T>(fn: (db: DatabaseConnection) => Promise<T>): Promise<T>
}
```

### 6.2 Internal Dependencies

| Dependency | Source | Usage |
|-----------|--------|-------|
| `SQLiteConnection` | `import { SQLiteConnection } from '@capacitor-community/sqlite'` | Module-level singleton connection manager |
| `CapacitorSQLite` | `import { CapacitorSQLite } from '@capacitor-community/sqlite'` | Plugin instance passed to `SQLiteConnection` constructor |
| `SQLiteDBConnection` | `import type { SQLiteDBConnection } from '@capacitor-community/sqlite'` | Type annotation for internal `dbConn` field |
| `DatabaseConnection` | `import type { DatabaseConnection } from '@collectio/shared'` | `implements` clause |
| `DatabaseError`, `ConstraintError`, `ConnectionError` | `import { ... } from '@collectio/shared'` | Thrown in error mapping |

### 6.3 Internal Result Type Interfaces (Rule 4.6)

Per PL-09, the plugin's TypeScript declarations are loosely typed. The adapter must define and use these explicit interfaces internally when casting raw plugin results:

```
interface PluginExecResult {
  changes?: { changes?: number; lastId?: number };
}

interface PluginQueryResult {
  values?: Record<string, unknown>[];
}
```

These interfaces are internal to `CapacitorSqliteConnection.ts` — not exported. Callers of the adapter never see raw plugin results.

### 6.4 Singleton SQLiteConnection

The `SQLiteConnection` instance must be a module-level variable, not an instance field:

```
let _sqlite: SQLiteConnection | null = null;

export class CapacitorSqliteConnection implements DatabaseConnection {
  // ...
}
```

On first `open()`, if `_sqlite` is `null`, create `new SQLiteConnection(CapacitorSQLite)` and assign to `_sqlite`. Subsequent `open()` calls on any `CapacitorSqliteConnection` instance reuse the same `_sqlite`. This satisfies AD-06 (single shared instance) and Rule 4.4 (one `SQLiteConnection` instance).

### 6.5 Parameter Binding

The Capacitor SQLite plugin supports parameter binding via `dbConn.query(sql, params)` and `dbConn.run(sql, params, false)`. The adapter should:

- For `execute()` with params: use `dbConn.run(sql, params, false)` if available in the plugin API; otherwise use `dbConn.query(sql, params)` for parameterized execution
- For `query()` with params: use `dbConn.query(sql, params)`
- If no params: use `dbConn.execute(sql, false)` for DDL/DML and `dbConn.query(sql)` for SELECT/PRAGMA

The exact API surface depends on the plugin's exported methods on `SQLiteDBConnection`. The verify script (T-02.2) confirmed `dbConn.execute(sql, false)` and `dbConn.query(sql)` work; parameter binding via `query(sql, params)` should be verified during implementation.

---

## 7. Data Flow

```
Capacitor App Entry (apps/capacitor/src/index.tsx)
  │
  ├─ import { CapacitorSqliteConnection } from '@collectio/platform/capacitor'
  ├─ const db = new CapacitorSqliteConnection()
  ├─ await db.open('collectio')
  │     │
  │     ├─ new SQLiteConnection(CapacitorSQLite) → module-level singleton
  │     ├─ sqlite.isConnection('collectio', false) → check existing
  │     ├─ sqlite.createConnection('collectio', false, 'no-encryption', 1, false)
  │     │   OR sqlite.retrieveConnection('collectio', false)
  │     ├─ dbConn.open() → opens file in app private data directory
  │     └─ dbConn.query('PRAGMA foreign_keys = ON') etc. → 4 PRAGMAs set
  │
  ├─ await db.query<Song>("SELECT * FROM songs WHERE deleted_at IS NULL")
  │     └─ dbConn.query(sql) → { values: [...] } → extract values → typed rows
  │
  ├─ await db.execute("INSERT INTO songs (id, name) VALUES (?, ?)", [id, name])
  │     └─ dbConn.execute(sql, false) → { changes: { changes: 1 } } → discard → void
  │
  ├─ await db.transaction(async (conn) => {
  │     await conn.execute(...);
  │     await conn.execute(...);
  │     return result;
  │   })
  │     ├─ dbConn.beginTransaction()
  │     ├─ await fn(this) → execute()/query() calls on same dbConn
  │     ├─ dbConn.commitTransaction() OR dbConn.rollbackTransaction()
  │     └─ return result (or throw)
  │
  └─ await db.close()
        ├─ dbConn.close()
        ├─ sqlite.closeConnection('collectio', false)
        └─ nullifies internal state
```

Import chain:
```
@collectio/shared  (DatabaseConnection interface + error classes)
        ↑
@collectio/platform  (CapacitorSqliteConnection implements DatabaseConnection)
        ↑
apps/capacitor  (index.tsx creates and injects CapacitorSqliteConnection)
```

---

## 8. State Changes

### 8.1 Internal State Machine

```
┌─────────────┐  open(dbPath)  ┌─────────────┐  close()  ┌──────────┐
│   CLOSED    │───────────────►│    OPEN     │──────────►│  CLOSED  │
│ open=false  │                │ open=true   │           │ open=false│
│ dbConn=null │                │ dbConn set  │           │ dbConn=null│
│ dbName=null │                │ dbName set  │           │ dbName=null│
└─────────────┘                └─────────────┘           └──────────┘
       ▲                          │   ▲
       │                          │   │ open() again
       │                          │   │ (close existing,
       │                          │   │ then reopen)
       │                          └───┘
       │
       └──────── after close()
```

| State | `open` | `dbConn` | Method behavior |
|-------|--------|---------|----------------|
| CLOSED | `false` | `null` | `open()` → transitions to OPEN. `close()` → no-op. `execute()`/`query()`/`transaction()` → throw `ConnectionError` |
| OPEN | `true` | `SQLiteDBConnection` instance | `open()` → close existing, then reopen. `close()` → transitions to CLOSED. `execute()`/`query()`/`transaction()` → operate normally |

### 8.2 Plugin Connection State (Module-Level)

| State | `_sqlite` value | Behavior |
|-------|----------------|----------|
| First `open()` call | `null` | Creates `new SQLiteConnection(CapacitorSQLite)`, assigns to `_sqlite`, creates/retrieves `SQLiteDBConnection` |
| Subsequent `open()` calls | `SQLiteConnection` instance | Reuses `_sqlite`, checks `isConnection()` → `retrieveConnection()` or `createConnection()` |
| After `closeConnection()` | `SQLiteConnection` instance (stays) | `_sqlite` remains alive; `isConnection()` for that dbName will return false next time |

### 8.3 Database File State

| Operation | File System Effect |
|-----------|-------------------|
| `open(dbName)` | Creates SQLite file in app's private data directory if it doesn't exist; opens if it does |
| `execute(INSERT/UPDATE/DELETE)` | Writes to WAL file; eventually checkpoints to main DB file |
| `close()` | Releases file lock; calls `sqlite.closeConnection()` which may checkpoint WAL frames |
| Multiple calls to `open()` with same dbName | Opens the same file — Capacitor SQLite plugin handles multiple opens safely |

---

## 9. Database Changes

**None in production schema.** The adapter manages a connection — it does not create tables, run migrations, or seed data. Those are the responsibility of the migration runner (T-02.6) and repository implementations (T-02.9–T-02.15).

The adapter does execute DDL during `open()` (setting PRAGMAs) but these are connection-level settings, not schema changes.

---

## 10. Error Handling

### 10.1 Error Mapping Table

| Plugin Error | Mapped To | Detection Method |
|-------------|-----------|-----------------|
| `Error` with message containing `'FOREIGN KEY'` | `ConstraintError(constraint: 'FOREIGN KEY')` | `msg.includes('FOREIGN KEY')` |
| `Error` with message containing `'SQLITE_CONSTRAINT'` | `ConstraintError` | `msg.includes('SQLITE_CONSTRAINT')` |
| `Error` with message containing `'constraint'` (case-insensitive) | `ConstraintError` | `msg.toLowerCase().includes('constraint')` |
| `Error` with message containing `'NOT NULL'` | `ConstraintError(constraint: 'NOT NULL')` | `msg.includes('NOT NULL')` |
| Plugin initialization failure (`SQLiteConnection` constructor throws) | `ConnectionError` | Catch during `open()` |
| `isConnection()`/`createConnection()`/`retrieveConnection()` throws | `ConnectionError` | Catch during `open()` |
| `dbConn.open()` throws | `ConnectionError` | Catch during `open()` |
| `dbConn.query()` for PRAGMA fails | `ConnectionError` | Catch during `open()` PRAGMA setup |
| Any other error from `execute()`/`query()` | `DatabaseError` | Catch all |
| Non-`Error` exceptions (unlikely) | `DatabaseError` | Wrap in `DatabaseError(String(err))` |

### 10.2 Error Message Inspection Strategy

Unlike `better-sqlite3` which provides structured `SqliteError.code` (e.g., `'SQLITE_CONSTRAINT_FOREIGNKEY'`), the Capacitor plugin wraps Android's `SQLiteConstraintException` into a standard `Error` with only a message string. The adapter must inspect the message:

```
function isConstraintError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return (
    msg.includes('FOREIGN KEY') ||
    msg.includes('SQLITE_CONSTRAINT') ||
    msg.includes('NOT NULL') ||
    msg.includes('UNIQUE constraint') ||
    msg.includes('CHECK constraint') ||
    (msg.toLowerCase().includes('constraint') && !msg.includes('no such'))
  );
}
```

The `!msg.includes('no such')` guard prevents misclassifying "no such table" errors as constraint violations.

### 10.3 Error Object Construction

Every mapped error must carry:
- `message`: plugin error message (from `err.message`)
- `sql`: the SQL string that caused the error (from the `execute()`/`query()` call)
- `params`: the bound parameters (from the call)
- `code`: `undefined` for Capacitor (plugin does not expose structured error codes), unless a code string can be extracted from the message
- `cause`: the original `Error` instance (for stack trace preservation)

### 10.4 Transaction Rollback Error Handling

If `fn` rejects:
1. Catch the rejection
2. Execute `await this.dbConn.rollbackTransaction()`
3. If `rollbackTransaction()` succeeds: re-throw the original error from `fn`
4. If `rollbackTransaction()` fails: throw a new `DatabaseError` wrapping the ROLLBACK failure — this is an unresolvable state. The original error from `fn` is attached as `cause`

Same pattern if `commitTransaction()` fails after `fn` resolves: attempt rollback, then throw `DatabaseError`.

### 10.5 Input Validation Errors

| Validation | Error |
|-----------|-------|
| SQL contains `;` (multi-statement) | `DatabaseError("Multiple statements are not allowed")` |
| `params.length !== count of ? in sql` | `DatabaseError("Parameter count mismatch: expected N, got M")` |
| SQL is empty or whitespace-only | `DatabaseError("SQL string is empty")` |

### 10.6 Connection State Errors

| Condition | Error |
|-----------|-------|
| `execute()`/`query()`/`transaction()` called when `this.open === false` | `ConnectionError("Database connection is not open. Call open() first.")` |
| `open()` fails due to plugin load failure | `ConnectionError("Failed to initialize SQLite plugin: ...")` |
| `open()` fails due to connection creation failure | `ConnectionError("Failed to create database connection: ...")` |
| `open()` fails due to PRAGMA error | `ConnectionError("Failed to set PRAGMAs: ...")` |

---

## 11. Logging Requirements

**No logging from the adapter itself.** Logging is the responsibility of the repository layer and application layer. The adapter throws typed errors — callers decide whether to log them.

Exception: If the `SQLiteConnection` constructor throws during `open()`, the `ConnectionError` thrown is the only diagnostic. The Capacitor app entry may log this, but the adapter does not.

---

## 12. Security Requirements

| Requirement | Status |
|------------|--------|
| Parameterized queries only | ENFORCED — `execute()` and `query()` accept `params?: unknown[]` and pass them to the plugin API. String interpolation is impossible through the API surface |
| No SQL string concatenation | ENFORCED — the `sql` parameter is passed directly to the plugin. No concatenation, no template literals |
| Multi-statement rejection | ENFORCED — semicolon detection in `execute()`/`query()` prevents SQL injection via stacked queries |
| No raw database access from renderer | ARCHITECTURAL — the Capacitor renderer (WebView) accesses data through the plugin bridge, not by importing `CapacitorSqliteConnection` directly. The adapter runs in the WebView context but communicates with native code only through the Capacitor plugin bridge |
| Database file in app-private directory | PLATFORM — Capacitor stores databases in Android's internal storage (`/data/data/com.collectio.app/databases/`), restricted to the app process by Android sandboxing. The adapter passes the database name, not a filesystem path |
| `androidIsEncryption: false` in capacitor.config.ts | CALLER RESPONSIBILITY — verified in T-02.2. The adapter does not control plugin-level configuration |
| No secrets in the adapter | PASS — no passwords, tokens, or keys. The database is unencrypted per constitution Section 16.4 |

---

## 13. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `implements DatabaseConnection` compiles without error | `tsc --noEmit` in `packages/platform/` |
| 2 | `open()` succeeds and all 4 PRAGMAs are set | Unit test: stub query to return expected PRAGMA values |
| 3 | `execute()` inserts a row — `query()` returns it | Unit test: mock INSERT → mock SELECT returns matching row |
| 4 | `execute()` updates a row — `query()` returns updated value | Unit test: mock UPDATE → mock SELECT returns changed value |
| 5 | `execute()` deletes a row — `query()` returns empty | Unit test: mock DELETE → mock SELECT returns `[]` |
| 6 | `transaction()` commit: rows persisted after callback resolves | Unit test: mock begin/commit; verify `fn` receives `this`; verify return value passes through |
| 7 | `transaction()` rollback: rollback called when callback rejects | Unit test: mock begin; callback throws; verify `rollbackTransaction()` called; original error re-thrown |
| 8 | FK violation throws `ConstraintError` | Unit test: mock `execute()` to throw `Error("FOREIGN KEY constraint failed")` → catch `ConstraintError` |
| 9 | `ConstraintError instanceof DatabaseError` is `true` | Unit test: `instanceof` check on caught error |
| 10 | `close()` is idempotent — second call does not throw | Unit test: open → close → close (again) → assert no error |
| 11 | `execute()` after `close()` throws `ConnectionError` | Unit test: open → close → execute → catch `ConnectionError` |
| 12 | `execute()` before `open()` throws `ConnectionError` | Unit test: new instance → execute → catch `ConnectionError` |
| 13 | Multi-statement SQL rejected | Unit test: `execute("INSERT ...; DROP TABLE ...")` → catch `DatabaseError` with "multiple" in message |
| 14 | Parameter count mismatch rejected | Unit test: `execute("INSERT ... VALUES (?, ?)", ["x"])` → catch `DatabaseError` |
| 15 | `tsc --noEmit` passes across all workspace packages | `pnpm typecheck` from root |
| 16 | `pnpm lint` passes for `packages/platform/` | `pnpm --filter @collectio/platform lint` |
| 17 | All unit tests pass with mocked `@capacitor-community/sqlite` | `pnpm --filter @collectio/platform test` |
| 18 | `query()` returns rows from `result.values`, empty array when no rows | Unit test: mock query returns `{ values: [{id: 1}] }` → adapter returns `[{id: 1}]` |
| 19 | `execute()` discards the `changes` result correctly | Unit test: mock execute; verify return is `void` |
| 20 | Module-level `SQLiteConnection` singleton reused across instances | Unit test: create two `CapacitorSqliteConnection` instances; `open()` on both; verify `SQLiteConnection` constructor called only once |
| 21 | `open()` uses `isConnection()` → `retrieveConnection()` when connection exists | Unit test: open twice with same dbName; verify `retrieveConnection` called on second open |
| 22 | `open()` handles `createConnection()` when no connection exists | Unit test: mock `isConnection` returns `{ result: false }`; verify `createConnection` called |
| 23 | All PRAGMAs in `open()` use `query()` not `execute()` | Code review: grep for `PRAGMA` in `open()` → all must use `this.dbConn.query()`, never `this.dbConn.execute()` |
| 24 | All `execute()` calls to the raw plugin pass explicit `transaction: false` | Code review: every `dbConn.execute(sql, false)` must have explicit `false` second argument |

---

## 14. Test Cases

### 14.1 Test Setup

All tests use mocked `@capacitor-community/sqlite` to avoid requiring a physical Android device or native runtime. The mock is configured at the module level before each test suite:

- `SQLiteConnection` constructor: records calls; returns mock connection manager
- `isConnection()`: returns configurable `{ result: boolean }`
- `createConnection()`: returns mock `SQLiteDBConnection`
- `retrieveConnection()`: returns mock `SQLiteDBConnection`
- Mock `SQLiteDBConnection`:
  - `open()`: resolves; records call
  - `close()`: resolves; records call
  - `execute(sql, transaction)`: verifies `transaction === false`; returns configurable `{ changes: { changes: N } }` or throws
  - `query(sql, params?)`: returns configurable `{ values: [...] }` or throws
  - `beginTransaction()`: resolves
  - `commitTransaction()`: resolves or throws
  - `rollbackTransaction()`: resolves
- `closeConnection()`: resolves

Each test:
1. Creates `new CapacitorSqliteConnection()`
2. Calls `await db.open('test-db')`
3. Runs the test scenario
4. Calls `await db.close()` (or verifies close behavior)

### 14.2 Required Test Cases

#### Open and PRAGMAs
```
Test: open() succeeds with PRAGMA setup
  → db.open flag is true after open
  → SQLiteConnection constructor called once (module-level singleton)
  → isConnection() called with ('test-db', false)
  → createConnection() called with ('test-db', false, 'no-encryption', 1, false)
  → dbConn.open() called
  → dbConn.query('PRAGMA foreign_keys = ON') called
  → dbConn.query('PRAGMA journal_mode = WAL') called
  → dbConn.query('PRAGMA synchronous = NORMAL') called
  → dbConn.query('PRAGMA busy_timeout = 5000') called

Test: open() reuses existing connection via retrieveConnection
  → First open() calls createConnection
  → Second open() on different instance (same dbName) calls retrieveConnection
  → verify createConnection called once, retrieveConnection called once

Test: open() with plugin loading failure → ConnectionError
  → Mock SQLiteConnection constructor to throw Error("Plugin not available")
  → await db.open('test-db') → catch ConnectionError
  → db.open flag remains false

Test: open() with PRAGMA failure → ConnectionError
  → Mock query to throw on PRAGMA busy_timeout
  → await db.open('test-db') → catch ConnectionError
  → verify dbConn.close() was called (cleanup)
  → db.open flag remains false
```

#### Execute — INSERT / UPDATE / DELETE
```
Test: execute INSERT passes explicit transaction:false
  → await db.execute("INSERT INTO t (val) VALUES (?)", ["hello"])
  → verify dbConn.execute() called with ('INSERT ...', false)
  → returns undefined (void)

Test: execute UPDATE
  → await db.execute("UPDATE t SET val = ? WHERE id = ?", ["world", 1])
  → verify dbConn.execute() called with explicit false

Test: execute DELETE
  → await db.execute("DELETE FROM t WHERE id = ?", [1])
  → verify dbConn.execute() called with explicit false
```

#### Query — SELECT
```
Test: query returns rows from result.values
  → Mock dbConn.query to return { values: [{id: 1, name: 'test'}] }
  → const rows = await db.query<{id: number; name: string}>("SELECT * FROM t")
  → rows → [{id: 1, name: 'test'}]

Test: query returns empty array when no rows
  → Mock dbConn.query to return { values: [] }
  → const rows = await db.query("SELECT * FROM t WHERE id = 999")
  → rows → []

Test: query returns empty array when values is undefined
  → Mock dbConn.query to return {} (no values property)
  → const rows = await db.query("SELECT * FROM t")
  → rows → []
```

#### Transaction — commit and rollback
```
Test: transaction commit path
  → Mock beginTransaction, commitTransaction to resolve
  → const result = await db.transaction(async (conn) => {
      expect(conn).toBe(db);
      await conn.execute("INSERT INTO t (val) VALUES (?)", ["a"]);
      return 42;
    })
  → result === 42
  → beginTransaction called
  → commitTransaction called
  → rollbackTransaction NOT called

Test: transaction rollback path
  → Mock beginTransaction to resolve
  → await db.transaction(async (conn) => {
      await conn.execute("INSERT INTO t (val) VALUES (?)", ["a"]);
      throw new Error("intentional rollback");
    }).catch(() => {})  // swallow expected error
  → beginTransaction called
  → rollbackTransaction called
  → commitTransaction NOT called
  → Original error re-thrown (caught by catch)

Test: transaction commit failure → rollback
  → Mock commitTransaction to throw Error("commit failed")
  → await db.transaction(async () => 42).catch(() => {})
  → rollbackTransaction called (attempted cleanup)
  → Error thrown is DatabaseError
```

#### Error mapping
```
Test: FK violation → ConstraintError
  → Mock dbConn.execute to throw Error("FOREIGN KEY constraint failed")
  → await db.execute("INSERT INTO child (pid) VALUES (?)", [999])
  → catch err
  → assert err instanceof ConstraintError
  → assert err instanceof DatabaseError
  → assert err.constraint === 'FOREIGN KEY'
  → assert err.sql === 'INSERT INTO child (pid) VALUES (?)'
  → assert err.cause is the original Error

Test: NOT NULL violation → ConstraintError
  → Mock dbConn.execute to throw Error("NOT NULL constraint failed: t.val")
  → await db.execute(...) → catch err
  → assert err instanceof ConstraintError
  → assert err.constraint === 'NOT NULL'

Test: UNIQUE violation → ConstraintError
  → Mock dbConn.execute to throw Error("UNIQUE constraint failed: t.id")
  → await db.execute(...) → catch err
  → assert err instanceof ConstraintError

Test: SQL syntax error → DatabaseError (not ConstraintError)
  → Mock dbConn.execute to throw Error("near \"INVALID\": syntax error")
  → await db.execute("INVALID SQL") → catch err
  → assert err instanceof DatabaseError
  → assert !(err instanceof ConstraintError)
```

#### Connection lifecycle and idempotency
```
Test: close is idempotent
  → await db.close() → resolves
  → db.open flag is false
  → await db.close() → resolves (no error, no throw)

Test: execute after close throws ConnectionError
  → await db.close()
  → await db.execute("SELECT 1") → catch err
  → assert err instanceof ConnectionError
  → assert err.message includes "not open"

Test: execute before open throws ConnectionError
  → const db2 = new CapacitorSqliteConnection()
  → await db2.execute("SELECT 1") → catch err
  → assert err instanceof ConnectionError

Test: re-open after close
  → await db.close()
  → await db.open('test-db')
  → verify createConnection called (or retrieveConnection)
  → db.open flag is true
  → execute/query work after reopen
```

#### Input validation
```
Test: multi-statement rejected
  → await db.execute("INSERT INTO t (val) VALUES (?); DROP TABLE t", ["x"])
  → catch err
  → assert err instanceof DatabaseError
  → assert err.message includes "multiple"

Test: parameter count mismatch
  → await db.execute("INSERT INTO t (val) VALUES (?, ?)", ["x"])
  → catch err
  → assert err instanceof DatabaseError
  → assert err.message includes "Parameter count"

Test: empty SQL rejected
  → await db.execute("   ") → catch err
  → assert err instanceof DatabaseError
  → assert err.message includes "empty"
```

#### Module-level singleton
```
Test: SQLiteConnection singleton reused
  → const db1 = new CapacitorSqliteConnection()
  → const db2 = new CapacitorSqliteConnection()
  → await db1.open('db-a')
  → await db1.close()
  → await db2.open('db-b')
  → verify SQLiteConnection constructor called exactly once
```

---

## 15. Definition Of Done

- [ ] `CapacitorSqliteConnection.ts` exists at `packages/platform/src/capacitor/CapacitorSqliteConnection.ts`
- [ ] Class declaration: `export class CapacitorSqliteConnection implements DatabaseConnection`
- [ ] All 5 interface methods implemented with correct signatures and `async` keyword
- [ ] Module-level `SQLiteConnection` singleton used (not instance-level)
- [ ] `open()` uses `isConnection()` → `createConnection()` / `retrieveConnection()` pattern
- [ ] `open()` executes all 4 PRAGMAs via `dbConn.query()` — NOT `execute()` (Rule 4.1)
- [ ] `execute()` calls `dbConn.execute(sql, false)` with explicit `false` second argument (Rule 4.2)
- [ ] `execute()` discards the changes result and returns `Promise<void>`
- [ ] `query<T>()` calls `dbConn.query(sql)` and extracts `result.values ?? []` as `T[]`
- [ ] `transaction<T>()` uses `beginTransaction()` / `commitTransaction()` / `rollbackTransaction()`
- [ ] Error mapping: plugin `Error` messages mapped to `ConstraintError`/`DatabaseError`/`ConnectionError`
- [ ] Input validation: multi-statement detection, parameter count check, empty SQL check
- [ ] Internal `PluginExecResult` and `PluginQueryResult` interfaces for casting raw plugin results (Rule 4.6)
- [ ] `packages/platform/src/capacitor/index.ts` re-exports `CapacitorSqliteConnection`
- [ ] `pnpm --filter @collectio/platform typecheck` passes with zero errors
- [ ] `pnpm --filter @collectio/platform lint` passes with zero errors
- [ ] All unit tests pass with mocked `@capacitor-community/sqlite`
- [ ] Zero platform conditionals: no `if (platform === 'electron')` or `better-sqlite3` references
- [ ] Zero React/renderer imports: no `react`, `@collectio/renderer`, or DOM API usage
- [ ] Zero `import.meta.dirname` or bare `__dirname` usage (not relevant for Capacitor but enforced project-wide)
- [ ] Zero `Promise.withResolvers`, `Object.groupBy`, or other ES2024+ APIs
- [ ] `err.sql` and `err.params` set on every thrown database error for diagnostics
- [ ] `err.cause` set to the original plugin error on every mapped error
- [ ] `close()` is idempotent: safe to call multiple times
- [ ] All acceptance criteria 1–24 verified
