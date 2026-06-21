# E-02 T-04 — Implement BetterSqlite3Connection (Electron)

**Parent Epic:** E-02: Database Layer
**Type:** Production Implementation (Platform Adapter)
**Criticality:** FOUNDATION — this is the production database adapter for all Electron (Windows) database operations. Every repository, the migration runner, and the sync engine depend on this for local data access.

---

## 1. Goal

Implement `BetterSqlite3Connection` — the Electron platform adapter that wraps `better-sqlite3` v12.11.1 (a synchronous C++ native addon) behind the async `DatabaseConnection` interface defined in T-02.3. This adapter is created once at Electron app startup and injected into every repository, the migration runner, and the sync engine.

The E02-T01 verification script proved `better-sqlite3` works correctly on Electron with FK enforcement, WAL mode, and transaction integrity. This task translates those verified raw API patterns into the typed production interface.

---

## 2. Scope

| In Scope | Rationale |
|----------|-----------|
| `BetterSqlite3Connection` class implementing `DatabaseConnection` | The 5 async methods wrapping `better-sqlite3`'s sync API |
| CJS native addon loading via `createRequire` | `better-sqlite3` is a C++ addon distributed as CJS; the platform package is ESM (`"type": "module"`) |
| PRAGMA setup in `open()` | `foreign_keys = ON`, `journal_mode = WAL`, `synchronous = NORMAL`, `busy_timeout = 5000` |
| Transaction BEGIN/COMMIT/ROLLBACK orchestration | Async `transaction()` wrapping sync SQL operations |
| Error mapping: `SqliteError` → typed error hierarchy | `SQLITE_CONSTRAINT_FOREIGNKEY`/`NOTNULL`/`UNIQUE` → `ConstraintError`; all others → `DatabaseError`; load/constructor failure → `ConnectionError` |
| Input validation | Reject SQL strings containing multiple statements (semicolons); param count correctness |
| `execute()` via `db.prepare(sql).run(params)` | Returns `Promise<void>` |
| `query<T>()` via `db.prepare(sql).all(params)` | Returns `Promise<T[]>` |
| Unit tests | In-memory `:memory:` database; all 5 methods + error mapping + rollback + idempotent close + PRAGMA verification |
| Barrel re-export from `packages/platform/src/electron/index.ts` | Makes the class importable by the Electron app entry |

---

## 3. Out of Scope

| Out of Scope | Why | Where It Belongs |
|-------------|-----|-----------------|
| Capacitor SQLite adapter | Separate platform adapter | E-02 T-02.5 |
| Database file path resolution | The Electron app entry (`main.ts`) resolves `app.getPath('userData')` and passes the path to `open()` | E-15 / app entry |
| `DatabaseConnection` interface definition | Already defined in T-02.3 | E-02 T-02.3 |
| Migration runner integration | The migration runner receives `DatabaseConnection` via constructor injection; this task just creates the adapter | E-02 T-02.6 |
| Repository implementations | Repositories call the adapter's methods; not created yet | E-02 T-02.9–T-02.15 |
| Connection pooling or multiple databases | V1 uses a single database file | Future |
| WAL checkpointing or VACUUM | SQLite manages WAL automatically; VACUUM is a maintenance operation | Future |
| Electron main process integration test | The adapter compiles and unit-tests in the platform package; integration with the full Electron app is a separate test | E-16 |

---

## 4. Files To Create

| # | File | Purpose | Responsibility |
|---|------|---------|---------------|
| 1 | `packages/platform/src/electron/BetterSqlite3Connection.ts` | Production Electron database adapter class | Implements the `DatabaseConnection` interface from `@collectio/shared`. Loads `better-sqlite3` via `createRequire(import.meta.url)`. Wraps all sync API calls in `Promise.resolve()`. Handles `open()` PRAGMA setup, `close()` cleanup, `execute()` via `prepare().run()`, `query<T>()` via `prepare().all()`, and `transaction()` via manual BEGIN/COMMIT/ROLLBACK. Maps `SqliteError` codes to `ConstraintError`/`DatabaseError`/`ConnectionError`. Validates input SQL (rejects multi-statement, validates param count). |
| 2 | `packages/platform/src/electron/__tests__/BetterSqlite3Connection.test.ts` | Unit tests using in-memory database | Creates a `BetterSqlite3Connection`, opens `:memory:` database, tests all 5 interface methods, verifies error mapping (FK violation → ConstraintError), tests transaction rollback (rows not persisted after throw), tests idempotent close, verifies PRAGMA values after open. Uses Jest + `@types/jest`. Tests MUST compile under `tsc --noEmit`. |

### 4.1 Public API — `BetterSqlite3Connection.ts`

**Exported class:**

```
class BetterSqlite3Connection implements DatabaseConnection
```

**Constructor:**
```
constructor()
```
- Takes no arguments — the database path is passed to `open()`, not the constructor
- Does NOT load `better-sqlite3` in the constructor (lazy load on `open()`) — or loads it immediately. The check script already proves loading works in the Electron main process, so immediate loading is acceptable and fails-fast if the native addon is missing.
- Internal state: `db: Database | null` (the better-sqlite3 connection), `dbPath: string | null`

**Method: `async open(dbPath: string): Promise<void>`**
- Loads `better-sqlite3` via `createRequire(import.meta.url)('better-sqlite3')` if not already loaded
- Creates `new Database(dbPath)` — may throw synchronously (file permissions, directory not found)
- Stores the `db` instance and `dbPath`
- Executes PRAGMAs via `db.pragma()`:
  - `PRAGMA foreign_keys = ON`
  - `PRAGMA journal_mode = WAL`
  - `PRAGMA synchronous = NORMAL`
  - `PRAGMA busy_timeout = 5000`
- Returns `Promise<void>`
- If `db` is already set (connection already open), closes existing connection and reopens (or throws `ConnectionError` with message "Connection already open. Call close() first.")
- Throws `ConnectionError` if `better-sqlite3` cannot be loaded, the database file cannot be opened, or PRAGMAs fail

**Method: `async close(): Promise<void>`**
- Calls `db.close()` on the stored instance
- Sets `db = null` and `dbPath = null`
- Idempotent: if `db` is already `null`, returns silently (no error)
- Wraps in try/catch — any error is caught and mapped to `ConnectionError`

**Method: `async execute(sql: string, params?: unknown[]): Promise<void>`**
- Checks `db` is not null (throws `ConnectionError` if not open)
- Validates input: rejects multiple statements (detects semicolons), validates parameter count matches `?` count
- Calls `db.prepare(sql).run(...(params ?? []))`
- Returns `Promise.resolve()` on success
- Catches `SqliteError`: maps `code === 'SQLITE_CONSTRAINT_FOREIGNKEY'` → `ConstraintError`, `code === 'SQLITE_CONSTRAINT_NOTNULL'` → `ConstraintError`, `code === 'SQLITE_CONSTRAINT_UNIQUE'` → `ConstraintError`; all other codes → `DatabaseError`
- Catches non-`SqliteError`: wrapps in `DatabaseError`

**Method: `async query<T>(sql: string, params?: unknown[]): Promise<T[]>`**
- Checks `db` is not null (throws `ConnectionError` if not open)
- Validates input: rejects multiple statements, validates parameter count
- Calls `db.prepare(sql).all(...(params ?? []))`
- Casts result to `T[]`
- Returns `Promise.resolve(rows)` — empty array for no results
- Error mapping: same as `execute()` (SQL syntax errors → `DatabaseError`)

**Method: `async transaction<T>(fn: (db: DatabaseConnection) => Promise<T>): Promise<T>`**
- Checks `db` is not null
- Executes `db.exec('BEGIN')`
- Calls `await fn(this)` — passes `this` (the `BetterSqlite3Connection` instance) as the `DatabaseConnection` argument
- If `fn` resolves: executes `db.exec('COMMIT')`, returns the callback's value
- If `fn` rejects: executes `db.exec('ROLLBACK')`, re-throws the original error
- If BEGIN/COMMIT/ROLLBACK itself fails: maps to `DatabaseError`
- Does NOT support nested transactions (if `db.exec('BEGIN')` while a transaction is already active, SQLite starts a savepoint — behavior is undefined for this adapter)

### 4.2 Public API — `BetterSqlite3Connection.test.ts`

Exports no public API — it is a Jest test file. Tests are structured as `describe`/`it` blocks covering:

- `BetterSqlite3Connection` class instantiation
- `open(':memory:')` — creates in-memory database, verifies PRAGMAs
- `execute()` — INSERT/UPDATE/DELETE return void
- `query()` — SELECT returns typed rows
- `transaction()` — commit path (rows persisted) and rollback path (rows not persisted)
- Error mapping — FK violation throws `ConstraintError`, syntax error throws `DatabaseError`
- `close()` — idempotent (second call no error)
- Input validation — multi-statement SQL rejected

---

## 5. Files To Modify

| # | File | Change | Rationale |
|---|------|--------|-----------|
| 1 | `packages/platform/src/electron/index.ts` | Replace `export {};` with `export { BetterSqlite3Connection } from './BetterSqlite3Connection.js';` | Makes the adapter importable by Electron app entry and DI container |
| 2 | `packages/platform/package.json` | No change required | `better-sqlite3@12.11.1` already in dependencies; `@types/better-sqlite3@7.6.13` already in devDependencies; `@collectio/shared` already in devDependencies |
| 3 | `packages/platform/tsconfig.json` | No change required | `include: ["src"]` covers the new file. `lib: ["ES2022", "DOM"]` already set — the adapter must use only ES2022 APIs (Node.js context) despite DOM libs being present |

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
| `better-sqlite3` (CJS native addon) | `createRequire(import.meta.url)('better-sqlite3')` | `Database` constructor |
| `Database` type | `import type Database from 'better-sqlite3'` | Type annotation for internal `db` field |
| `DatabaseConnection` | `import type { DatabaseConnection } from '@collectio/shared'` | `implements` clause |
| `DatabaseError`, `ConstraintError`, `ConnectionError` | `import { ... } from '@collectio/shared'` | Thrown in error mapping |
| `node:module` | `import { createRequire } from 'node:module'` | ESM → CJS bridge |
| `node:url` | `import { fileURLToPath } from 'node:url'` | `__dirname` computation (Rule 15.2) |

### 6.3 Thread Safety

`better-sqlite3` is single-threaded — all operations on a `Database` instance are serialized by SQLite's internal mutex. The adapter wrapping each sync call in `Promise.resolve()` does not introduce concurrency — Node.js's event loop serializes Promise resolution. Multiple `await` calls to the same adapter are safe without explicit locking.

---

## 7. Data Flow

```
Electron Main Process (apps/electron/src/main.ts)
  │
  ├─ import { BetterSqlite3Connection } from '@collectio/platform/electron'
  ├─ const db = new BetterSqlite3Connection()
  ├─ await db.open(join(app.getPath('userData'), 'collectio.db'))
  │     │
  │     ├─ createRequire(import.meta.url)('better-sqlite3') → Database class
  │     ├─ new Database(dbPath) → opens file
  │     └─ db.pragma('foreign_keys = ON') etc. → 4 PRAGMAs set
  │
  ├─ await db.query<Song>("SELECT * FROM songs WHERE deleted_at IS NULL")
  │     └─ db.prepare(sql).all() → typed rows
  │
  ├─ await db.execute("INSERT INTO songs (id, name) VALUES (?, ?)", [id, name])
  │     └─ db.prepare(sql).run(params) → void
  │
  ├─ await db.transaction(async (conn) => {
  │     await conn.execute(...);
  │     await conn.execute(...);
  │     return result;
  │   })
  │     ├─ db.exec('BEGIN')
  │     ├─ await fn(this) → execute() calls run on same `db` instance
  │     ├─ db.exec('COMMIT') OR db.exec('ROLLBACK')
  │     └─ return result (or throw)
  │
  └─ await db.close()
        └─ db.close() → nullifies internal state
```

Import chain:
```
@collectio/shared  (DatabaseConnection interface + error classes)
        ↑
@collectio/platform  (BetterSqlite3Connection implements DatabaseConnection)
        ↑
apps/electron  (main.ts creates and injects BetterSqlite3Connection)
```

---

## 8. State Changes

### 8.1 Internal State Machine

```
┌───────────┐  open(dbPath)  ┌───────────┐  close()  ┌──────────┐
│   NULL    │───────────────►│   OPEN    │──────────►│  CLOSED  │
│ db=null   │                │ db=Database│          │ db=null  │
└───────────┘                └───────────┘          └──────────┘
                                  │   ▲
                                  │   │ open() again
                                  │   │ (close existing,
                                  │   │ reopen)
                                  └───┘
```

| State | `db` value | Method behavior |
|-------|-----------|----------------|
| NULL | `null` | `open()` → transitions to OPEN. `close()` → no-op. `execute()`/`query()`/`transaction()` → throw `ConnectionError` |
| OPEN | `Database` instance | `open()` → throw `ConnectionError` ("already open") OR close+reopen (design decision — spec says: close existing and reopen). `close()` → transitions to CLOSED. `execute()`/`query()`/`transaction()` → operate normally |
| CLOSED | `null` (after close) | Same as NULL — connection can be reopened via `open()`. `close()` → no-op |

### 8.2 Database File State

| Operation | File System Effect |
|-----------|-------------------|
| `open(dbPath)` | Creates SQLite file if it doesn't exist; opens if it does |
| `execute(INSERT/UPDATE/DELETE)` | Writes to WAL file; eventually checkpoints to main DB file |
| `close()` | Releases file lock; WAL frames are checkpointed |
| Multiple calls to `open()` with same path | Opens the same file — SQLite handles multiple opens safely on one process |

### 8.3 Test Database

Unit tests use `':memory:'` — no file system interaction. Each test creates a fresh `BetterSqlite3Connection`, opens `:memory:`, runs operations, and closes. No cross-test state leakage.

---

## 9. Database Changes

**None in production schema.** The adapter manages a connection — it does not create tables, run migrations, or seed data. Those are the responsibility of the migration runner (T-02.6) and repository implementations (T-02.9–T-02.15).

The adapter does execute DDL during `open()` (setting PRAGMAs) but these are connection-level settings, not schema changes.

---

## 10. Error Handling

### 10.1 Error Mapping Table

| `better-sqlite3` Error | Mapped To | Notes |
|------------------------|-----------|-------|
| `SqliteError` with `code: 'SQLITE_CONSTRAINT_FOREIGNKEY'` | `ConstraintError(constraint: 'FOREIGN KEY')` | FK violation |
| `SqliteError` with `code: 'SQLITE_CONSTRAINT_NOTNULL'` | `ConstraintError(constraint: 'NOT NULL')` | NULL in NOT NULL column |
| `SqliteError` with `code: 'SQLITE_CONSTRAINT_UNIQUE'` | `ConstraintError(constraint: 'UNIQUE')` | Duplicate unique value |
| `SqliteError` with any other `code` | `DatabaseError` | SQL syntax, type mismatch, etc. |
| Non-`SqliteError` throw from `db.prepare()`/`db.exec()` | `DatabaseError` | Unexpected internal error |
| `createRequire('better-sqlite3')` throws | `ConnectionError` | Native addon not installed or ABI mismatch |
| `new Database(dbPath)` throws | `ConnectionError` | File permissions, disk full, directory not found |
| `db.pragma()` throws | `ConnectionError` | PRAGMA rejected (extremely rare on `better-sqlite3`) |

### 10.2 Error Object Construction

Every mapped error must carry:
- `message`: platform error message (from `SqliteError.message` or `err.message`)
- `sql`: the SQL string that caused the error (from the `execute()`/`query()` call)
- `params`: the bound parameters (from the call)
- `code`: the platform error code (from `SqliteError.code`)
- `cause`: the original `SqliteError` instance (for stack trace preservation)

### 10.3 Transaction Rollback Error Handling

If `fn` rejects:
1. Catch the rejection
2. Execute `db.exec('ROLLBACK')`
3. If `ROLLBACK` succeeds: re-throw the original error from `fn`
4. If `ROLLBACK` fails: throw a new `DatabaseError` wrapping the ROLLBACK failure — this is an unresolvable state (database is stuck in a broken transaction). This situation is extremely rare on `better-sqlite3`.
5. The original error from `fn` is attached as `cause` on the `DatabaseError` if ROLLBACK fails

### 10.4 Input Validation Errors

| Validation | Error |
|-----------|-------|
| SQL contains `;` (multi-statement) | `DatabaseError("Multiple statements are not allowed")` |
| `params.length !== count of ? in sql` | `DatabaseError("Parameter count mismatch: expected N, got M")` |
| SQL is empty or whitespace-only | `DatabaseError("SQL string is empty")` |
| `?` placeholder count is zero for `execute()` (INSERT with no values) | Not an error — `INSERT INTO t DEFAULT VALUES` is valid |

---

## 11. Logging Requirements

**No logging from the adapter itself.** Logging is the responsibility of the repository layer and application layer. The adapter throws typed errors — callers decide whether to log them.

Exception: If `createRequire('better-sqlite3')` fails at `open()` time, the `ConnectionError` thrown is the only diagnostic. The Electron main process may log this, but the adapter does not.

---

## 12. Security Requirements

| Requirement | Status |
|------------|--------|
| Parameterized queries only | ENFORCED — `execute()` and `query()` accept `params?: unknown[]` and use `db.prepare(sql).run(params)` / `.all(params)`. String interpolation is impossible through the API surface |
| No SQL string concatenation | ENFORCED — the `sql` parameter is passed directly to `db.prepare()`. No concatenation, no template literals |
| Multi-statement rejection | ENFORCED — semicolon detection in `execute()`/`query()` prevents SQL injection via stacked queries |
| No raw database access from renderer | ARCHITECTURAL — the Electron renderer accesses data through the context bridge (preload), not by importing `BetterSqlite3Connection` directly. The adapter compiles in the platform package, not the renderer package |
| Database file in app-private directory | CALLER RESPONSIBILITY — the adapter receives `dbPath` from the caller. `main.ts` must pass `app.getPath('userData')` (restricted to the Windows user) |
| `contextIsolation: true` + `nodeIntegration: false` | CALLER RESPONSIBILITY — enforced by `main.ts` (Rule 15.3). The adapter runs in the main process, not the renderer |

---

## 13. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `implements DatabaseConnection` compiles without error | `tsc --noEmit` in `packages/platform/` |
| 2 | `open(':memory:')` succeeds and all 4 PRAGMAs are set | Unit test: query `PRAGMA foreign_keys`, `PRAGMA journal_mode` etc. |
| 3 | `execute()` inserts a row — `query()` returns it | Unit test: INSERT → SELECT → assert row matches |
| 4 | `execute()` updates a row — `query()` returns updated value | Unit test: INSERT → UPDATE → SELECT → assert value changed |
| 5 | `execute()` deletes a row — `query()` returns empty | Unit test: INSERT → DELETE → SELECT → assert `[]` |
| 6 | `transaction()` commit: rows persisted after callback resolves | Unit test: transaction with INSERT → query after transaction → rows present |
| 7 | `transaction()` rollback: rows NOT persisted after callback rejects | Unit test: transaction with INSERT → callback throws → query → assert `[]` |
| 8 | FK violation throws `ConstraintError` | Unit test: INSERT child with nonexistent parent → catch `ConstraintError` |
| 9 | `ConstraintError instanceof DatabaseError` is `true` | Unit test: `instanceof` check on caught error |
| 10 | `close()` is idempotent — second call does not throw | Unit test: open → close → close (again) → assert no error |
| 11 | `execute()` after `close()` throws `ConnectionError` | Unit test: open → close → execute → catch `ConnectionError` |
| 12 | Multi-statement SQL rejected | Unit test: `execute("INSERT ...; DROP TABLE ...")` → catch `DatabaseError` |
| 13 | `PRAGMA integrity_check` returns `"ok"` after operations | Unit test: post-operations query |
| 14 | Parallel reads work (WAL mode) | Unit test: two `query()` calls in `Promise.all()` → both resolve with correct data |
| 15 | `tsc --noEmit` passes across all workspace packages | `pnpm typecheck` from root |
| 16 | `pnpm lint` passes for `packages/platform/` | `pnpm --filter @collectio/platform lint` |

---

## 14. Test Cases

### 14.1 Test Setup

All tests use an in-memory database (`:memory:`) to avoid filesystem dependencies and cross-test contamination. Each test:

1. Creates `new BetterSqlite3Connection()`
2. Calls `await db.open(':memory:')`
3. Runs the test scenario
4. Calls `await db.close()` (or verifies close behavior)

### 14.2 Required Test Cases

#### Open and PRAGMAs
```
Test: open(':memory:') succeeds
  → db is not null after open
  → query PRAGMA foreign_keys → returns [{foreign_keys: 1}]
  → query PRAGMA journal_mode → returns [{journal_mode: 'wal'}]
  → query PRAGMA synchronous → returns [{synchronous: 1}] (NORMAL = 1)
  → query PRAGMA busy_timeout → returns [{busy_timeout: 5000}]
```

#### Execute — INSERT / UPDATE / DELETE
```
Test: execute INSERT + query SELECT
  → execute("CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)") → resolves
  → execute("INSERT INTO t (val) VALUES (?)", ["hello"]) → resolves
  → query("SELECT * FROM t") → returns [{id: 1, val: "hello"}]

Test: execute UPDATE
  → execute("UPDATE t SET val = ? WHERE id = ?", ["world", 1]) → resolves
  → query("SELECT val FROM t WHERE id = ?", [1]) → returns [{val: "world"}]

Test: execute DELETE
  → execute("DELETE FROM t WHERE id = ?", [1]) → resolves
  → query("SELECT * FROM t") → returns []
```

#### Transaction — commit and rollback
```
Test: transaction commit
  → execute("CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)")
  → await db.transaction(async (conn) => {
      await conn.execute("INSERT INTO t (val) VALUES (?)", ["a"]);
      await conn.execute("INSERT INTO t (val) VALUES (?)", ["b"]);
      return 42;
    })
  → returns 42
  → query("SELECT count(*) as cnt FROM t") → returns [{cnt: 2}]

Test: transaction rollback
  → await db.transaction(async (conn) => {
      await conn.execute("INSERT INTO t (val) VALUES (?)", ["rollback-me"]);
      throw new Error("intentional rollback");
    }).catch(() => {})  // swallow expected error
  → query("SELECT count(*) as cnt FROM t") → returns [{cnt: 0}]
```

#### Error mapping
```
Test: FK violation → ConstraintError
  → execute("CREATE TABLE parent (id INTEGER PRIMARY KEY)")
  → execute("CREATE TABLE child (id INTEGER PRIMARY KEY, pid INTEGER REFERENCES parent(id))")
  → await execute("INSERT INTO child (pid) VALUES (?)", [999])
  → catch err
  → assert err instanceof ConstraintError
  → assert err instanceof DatabaseError
  → assert err.constraint === 'FOREIGN KEY'

Test: SQL syntax error → DatabaseError
  → await execute("INVALID SQL SYNTAX")
  → catch err
  → assert err instanceof DatabaseError
  → assert !(err instanceof ConstraintError)
```

#### Connection lifecycle and idempotency
```
Test: close is idempotent
  → await db.close() → resolves
  → await db.close() → resolves (no error)

Test: execute after close throws ConnectionError
  → await db.close()
  → await db.execute("SELECT 1")
  → catch err
  → assert err instanceof ConnectionError

Test: re-open after close
  → await db.close()
  → await db.open(':memory:')  → resolves (new connection)
  → query("SELECT 1") → works
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
```

#### Integrity
```
Test: integrity check passes
  → execute some operations
  → query("PRAGMA integrity_check")
  → returns [{integrity_check: "ok"}]
```

#### Parallel reads
```
Test: WAL mode concurrent reads
  → insert test data
  → const [r1, r2] = await Promise.all([
      db.query("SELECT * FROM t"),
      db.query("SELECT * FROM t")
    ])
  → r1 and r2 both contain the test data
```

---

## 15. Definition Of Done

- [ ] `BetterSqlite3Connection.ts` exists at `packages/platform/src/electron/BetterSqlite3Connection.ts`
- [ ] Class declaration: `export class BetterSqlite3Connection implements DatabaseConnection`
- [ ] All 5 interface methods implemented with correct signatures and `async` keyword
- [ ] `better-sqlite3` loaded via `createRequire(import.meta.url)('better-sqlite3')` — NOT `import` (CJS addon in ESM)
- [ ] `open()` executes all 4 PRAGMAs via `db.pragma()` or `db.exec()`
- [ ] `execute()` uses `db.prepare(sql).run(params)` and returns `Promise<void>`
- [ ] `query<T>()` uses `db.prepare(sql).all(params)` and returns `Promise<T[]>`
- [ ] `transaction<T>()` orchestrates BEGIN → callback → COMMIT/ROLLBACK manually
- [ ] Error mapping: `SqliteError` codes mapped to `ConstraintError`/`DatabaseError`/`ConnectionError`
- [ ] Input validation: multi-statement detection, parameter count check
- [ ] `packages/platform/src/electron/index.ts` re-exports `BetterSqlite3Connection`
- [ ] `pnpm --filter @collectio/platform typecheck` passes with zero errors
- [ ] `pnpm --filter @collectio/platform lint` passes with zero errors
- [ ] All unit tests pass (in-memory database, all methods, error mapping, lifecycle)
- [ ] Zero platform conditionals: no `if (platform === 'android')` or `Capacitor` references
- [ ] Zero React/renderer imports: no `react`, `@collectio/renderer`, or DOM API usage
- [ ] No `import.meta.dirname` usage (Rule 15.2)
- [ ] No `Promise.withResolvers`, `Object.groupBy`, or other ES2024+ APIs (Rule 15.2b)
- [ ] `test.sql` and `test.params` set on every thrown error for diagnostics
- [ ] All acceptance criteria 1–16 verified
