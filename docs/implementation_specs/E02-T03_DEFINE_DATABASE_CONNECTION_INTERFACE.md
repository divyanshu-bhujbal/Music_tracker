# E-02 T-03 — Define DatabaseConnection Interface

**Parent Epic:** E-02: Database Layer
**Type:** Interface Definition (Foundation)
**Criticality:** ARCHITECTURE-FOUNDATION — every repository implementation (T-02.9–T-02.15), both platform adapters (T-02.4, T-02.5), and the migration runner (T-02.6) depend on this interface

---

## 1. Goal

Define the async `DatabaseConnection` interface and typed error hierarchy at `packages/shared/src/data/database/`. This interface is the **single contract** between the Data Layer (repository implementations, migration runner) and the Platform Implementations Layer (`BetterSqlite3Connection`, `CapacitorSqliteConnection`). Every SQL operation in the application flows through this contract.

The interface is async because Capacitor's plugin bridge is inherently asynchronous (AD-01). Electron's synchronous `better-sqlite3` will be wrapped in `Promise.resolve()` to satisfy this contract.

---

## 2. Scope

| In Scope | Rationale |
|----------|-----------|
| `DatabaseConnection` interface with 5 async methods | Core contract: `open`, `close`, `execute`, `query`, `transaction` |
| `DatabaseError` base error class | All SQL-layer errors inherit from this |
| `ConstraintError` extending `DatabaseError` | FK violations, NOT NULL violations, UNIQUE violations |
| `ConnectionError` extending `DatabaseError` | Plugin not available, file permissions, database file corrupt/inaccessible |
| Barrel re-export from `packages/shared/src/index.ts` | Makes the interface consumable via `import { DatabaseConnection } from '@collectio/shared'` |
| Method-level JSDoc contracts | Documents preconditions, postconditions, exception guarantees, and platform expectations for each method |
| Input validation contract | `execute()` and `query()` reject multiple statements; require `?` placeholders only |

---

## 3. Out of Scope

| Out of Scope | Why | Where It Belongs |
|-------------|-----|-----------------|
| Concrete implementations | `BetterSqlite3Connection` and `CapacitorSqliteConnection` are separate tasks | E-02 T-02.4, T-02.5 |
| Repository interfaces (`IRepository<T>`, `ISongRepository`, etc.) | Domain-layer concerns — these consume `DatabaseConnection` but are defined separately | E-02 T-02.9–T-02.15 / E-05 |
| Migration runner implementation | Consumes `DatabaseConnection` via constructor injection | E-02 T-02.6 |
| `QueryBuilder` | Generates SQL strings; layer above `DatabaseConnection` | E-02 T-02.6 / future task |
| Platform-specific PRAGMA handling (AD-05) | Implementations handle PRAGMA routing internally — the interface just provides `execute()` and `query()` | E-02 T-02.4, T-02.5 |
| Connection pooling or multiple-database support | V1 uses a single database file per app instance | Future |
| TypeORM or query builder integration | Constitution §12 mandates raw SQL; no ORM | N/A |

---

## 4. Files To Create

| # | File | Purpose | Responsibility |
|---|------|---------|---------------|
| 1 | `packages/shared/src/data/database/DatabaseConnection.ts` | The `DatabaseConnection` interface — 5 async method signatures with full JSDoc contracts | Defines the contract that all platform adapters must implement. No runtime code — purely a TypeScript interface. Documents per-method parameter and return semantics, exception guarantees, and platform expectations. |
| 2 | `packages/shared/src/data/database/DatabaseError.ts` | Typed error hierarchy: `DatabaseError` (base), `ConstraintError` (FK/NOT NULL/UNIQUE), `ConnectionError` (file/plugin access) | Three error classes extending `Error`. Each carries an optional `code` property (for platform error code mapping by implementations). `ConstraintError` extends `DatabaseError`; `DatabaseError` extends standard `Error`. No platform imports — pure TypeScript. |

### 4.1 Public API — `DatabaseConnection.ts`

**Exported interface:**

```
interface DatabaseConnection {
  open(dbPath: string): Promise<void>;
  close(): Promise<void>;
  execute(sql: string, params?: unknown[]): Promise<void>;
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (db: DatabaseConnection) => Promise<T>): Promise<T>;
}
```

**Method Contracts (to be documented in JSDoc):**

#### `open(dbPath: string): Promise<void>`
- Creates or opens the SQLite database file at the given path
- Executes required PRAGMAs after opening: `foreign_keys = ON`, `journal_mode = WAL`, `synchronous = NORMAL`, `busy_timeout = 5000`
- Must be called before any `execute()`, `query()`, or `transaction()` calls
- Safe to call if the database file already exists (reopens existing database)
- Throws `ConnectionError` if the file cannot be opened, the plugin is unavailable, or permissions are insufficient

#### `close(): Promise<void>`
- Closes the database connection and releases all resources
- Safe to call even if already closed (idempotent — implementations must not throw on repeated calls)
- After close, further `execute()`/`query()`/`transaction()` calls throw `ConnectionError`

#### `execute(sql: string, params?: unknown[]): Promise<void>`
- Executes a single SQL statement that does NOT return rows: INSERT, UPDATE, DELETE, CREATE TABLE, DROP TABLE, ALTER TABLE, PRAGMA (non-querying)
- Uses `?` positional placeholders for parameter binding — never string interpolation
- Rejects multiple statements in a single string (implementations must detect semicolon-separated statements or call the underlying API's single-statement mode)
- Throws `ConstraintError` for FK/NOT NULL/UNIQUE violations
- Throws `DatabaseError` for SQL syntax errors or invalid table/column references
- Returns `void` — no result rows

#### `query<T>(sql: string, params?: unknown[]): Promise<T[]>`
- Executes a SELECT query or a result-returning PRAGMA statement (`PRAGMA integrity_check`, `PRAGMA foreign_key_check`)
- Uses `?` positional placeholders for parameter binding
- Returns typed array of result rows; empty result set returns `[]` (never `null` or `undefined`)
- Each row is a plain object with column names as keys and column values as values
- Throws `DatabaseError` for SQL syntax or invalid table/column references
- Rejects multiple statements in a single string

#### `transaction<T>(fn: (db: DatabaseConnection) => Promise<T>): Promise<T>`
- Begins a SQLite transaction (`BEGIN`)
- Executes the async callback `fn`, passing the same `DatabaseConnection` instance
- If `fn` resolves: executes `COMMIT` and returns the callback's return value
- If `fn` rejects (throws or returns rejected Promise): executes `ROLLBACK` and re-throws the error
- Nested transaction calls are not supported in V1 — behavior is undefined if `fn` calls `transaction()` again
- Throws `DatabaseError` if `BEGIN`/`COMMIT`/`ROLLBACK` fails at the SQL level

### 4.2 Public API — `DatabaseError.ts`

**Exported classes:**

```
class DatabaseError extends Error {
  sql?: string;          // The SQL that caused the error (if applicable)
  params?: unknown[];    // The params that were bound (if applicable)
  code?: string;         // Platform-specific error code (e.g., 'SQLITE_CONSTRAINT' for better-sqlite3)
}
```

```
class ConstraintError extends DatabaseError {
  constraint?: 'FOREIGN KEY' | 'NOT NULL' | 'UNIQUE' | 'CHECK';
}
```

```
class ConnectionError extends DatabaseError {
  // No additional fields beyond DatabaseError
}
```

**Error semantics:**
- `DatabaseError`: Generic SQL-layer failure — syntax errors, invalid table/column names, type mismatches
- `ConstraintError` (extends `DatabaseError`): Structural constraint violations — FOREIGN KEY, NOT NULL, UNIQUE, CHECK. Carries the `constraint` discriminant for programmatic handling
- `ConnectionError` (extends `DatabaseError`): Database file or plugin access failures — platform SQLite plugin unavailable, file permissions denied, database file corrupt, disk full

---

## 5. Files To Modify

| # | File | Change | Rationale |
|---|------|--------|-----------|
| 1 | `packages/shared/src/index.ts` | Add barrel re-exports: `export { DatabaseConnection } from './data/database/DatabaseConnection.js'` and `export { DatabaseError, ConstraintError, ConnectionError } from './data/database/DatabaseError.js'` | Makes the interface consumable via `import { DatabaseConnection } from '@collectio/shared'` |
| 2 | `packages/shared/package.json` | No change required | No new dependencies — pure TypeScript. `dependencies` remains empty. |
| 3 | `packages/shared/tsconfig.json` | No change required | `include: ["src"]` already covers the new `data/database/` directory |

---

## 6. Interfaces

### 6.1 DatabaseConnection

```
DatabaseConnection {
  open(dbPath: string): Promise<void>
  close(): Promise<void>
  execute(sql: string, params?: unknown[]): Promise<void>
  query<T>(sql: string, params?: unknown[]): Promise<T[]>
  transaction<T>(fn: (db: DatabaseConnection) => Promise<T>): Promise<T>
}
```

**Type parameters:**
- `query<T>`: Caller specifies the expected row shape as a type parameter. The implementation returns `T[]`. TypeScript infers `T` from the call site — no casting inside the implementation.
- `transaction<T>`: Caller specifies the return type of the transaction callback. The implementation returns the same type.

**Parameter binding:**
- `params` is `unknown[]` — implementation casts internally to the type expected by the underlying SQLite driver (e.g., `better-sqlite3` accepts `string | number | bigint | Buffer | null`; Capacitor plugin accepts `any[]`)
- This avoids leaking platform-specific parameter types into the interface

### 6.2 Error Hierarchy

```
Error
 └── DatabaseError (sql?, params?, code?)
      ├── ConstraintError (constraint?)
      └── ConnectionError
```

**Why `extends Error` instead of a discriminated union:**
- Implementations can throw platform-native errors that are wrapped into these types
- Callers can use `instanceof` to distinguish error types in catch blocks
- The error classes survive Promise rejection chains (stack traces are preserved through `cause`)

**`code` field on `DatabaseError`:**
- Platform implementations may set this to the native error code for diagnostics
- Electron (`better-sqlite3`): `'SQLITE_CONSTRAINT_FOREIGNKEY'`, `'SQLITE_ERROR'`, etc.
- Capacitor: message string inspection (the plugin doesn't expose structured error codes)
- This field is informational — caller logic should use `instanceof ConstraintError`, not string matching on `code`

---

## 7. Data Flow

```
┌─────────────────────────────────┐
│  Application Layer              │
│  (Category Framework, Sync)     │
└────────────┬────────────────────┘
             │  depends on
             ▼
┌─────────────────────────────────┐
│  Data Layer                     │
│  Repository implementations     │── invokes ──► DatabaseConnection.execute()
│  MigrationRunner                │── invokes ──► DatabaseConnection.query()
│  (packages/shared/src/data/)    │── invokes ──► DatabaseConnection.transaction()
└────────────┬────────────────────┘
             │  depends on (interface)
             ▼
┌─────────────────────────────────┐
│  Platform Implementations       │
│  BetterSqlite3Connection        │── implements ──► DatabaseConnection
│  CapacitorSqliteConnection      │── implements ──► DatabaseConnection
│  (packages/platform/src/)       │
└─────────────────────────────────┘
```

**Import chain:**
1. `packages/shared/src/data/database/DatabaseConnection.ts` — defines the interface (imports nothing external)
2. `packages/shared/src/data/database/DatabaseError.ts` — defines error classes (imports nothing external)
3. `packages/shared/src/index.ts` — re-exports both → consumable as `@collectio/shared`
4. `packages/platform/src/electron/BetterSqlite3Connection.ts` — imports `DatabaseConnection` from `@collectio/shared`, implements it
5. `packages/platform/src/capacitor/CapacitorSqliteConnection.ts` — same
6. Future repository files — import `DatabaseConnection` from `@collectio/shared`, receive via constructor

**No circular dependencies possible:** The interface lives in `shared/` which has zero dependencies. Platform packages depend on `shared/`. Repositories in `shared/data/` depend on the interface (same package).

---

## 8. State Changes

**No runtime state.** This task produces only TypeScript interface definitions and error classes. No database operations, no file writes, no process changes.

The only state change is compile-time: `packages/shared/src/index.ts` transitions from `export {}` (empty barrel) to exporting the first production interface.

After this task:
- `import { DatabaseConnection } from '@collectio/shared'` resolves and compiles
- `implements DatabaseConnection` is valid in platform packages
- Error classes can be thrown and caught with `instanceof` checks

---

## 9. Database Changes

**None.** No SQL, no schema changes, no migration files. This is an interface definition task only.

---

## 10. Error Handling

### 10.1 Error Class Constructors

Each error class constructor must accept:
- `message: string` — human-readable description
- `options?: ErrorOptions` — standard `{ cause?: unknown }` for error chaining

`DatabaseError` adds optional properties:
- `sql?: string` — the SQL statement that caused the error
- `params?: unknown[]` — the bound parameters
- `code?: string` — platform-specific error code

`ConstraintError` adds:
- `constraint?: 'FOREIGN KEY' | 'NOT NULL' | 'UNIQUE' | 'CHECK'` — discriminated constraint type

### 10.2 Caller Error Handling Pattern

Callers catch errors and use `instanceof`:

```typescript
try {
  await db.execute("INSERT INTO songs (id, name) VALUES (?, ?)", [id, name]);
} catch (err) {
  if (err instanceof ConstraintError) {
    // FK or NOT NULL violation — surface to user
  } else if (err instanceof ConnectionError) {
    // Database unavailable — retry or alert
  } else if (err instanceof DatabaseError) {
    // SQL syntax error — log and report
  } else {
    // Unexpected error — rethrow
  }
}
```

### 10.3 Implementation Error Mapping

Platform implementations (T-02.4, T-02.5) are responsible for mapping platform-native errors to these types:
- `better-sqlite3` `SqliteError` with `code === 'SQLITE_CONSTRAINT_FOREIGNKEY'` → `ConstraintError`
- `better-sqlite3` `SqliteError` with `code === 'SQLITE_CONSTRAINT_NOTNULL'` → `ConstraintError`
- `@capacitor-community/sqlite` error message containing `'FOREIGN KEY'` → `ConstraintError`
- Plugin initialization failure → `ConnectionError`

---

## 11. Logging Requirements

**None.** This task produces type definitions only. Logging is the responsibility of the implementations and the callers.

---

## 12. Security Requirements

| Requirement | Status |
|------------|--------|
| No secrets in the interface | PASS — the interface has no access tokens, keys, or credentials |
| Parameterized queries enforced | PASS — the interface signature mandates `params?: unknown[]` alongside `sql`; the JSDoc contract prohibits string interpolation |
| No eval or dynamic code execution | PASS — pure TypeScript interface with no runtime behavior |
| No file system access from interface | PASS — `open(dbPath: string)` takes a path parameter but does not open files itself (implementation responsibility) |

---

## 13. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `DatabaseConnection` interface compiles in `packages/shared/` | `pnpm --filter @collectio/shared typecheck` — zero errors |
| 2 | `DatabaseError`, `ConstraintError`, `ConnectionError` compile | Same typecheck pass |
| 3 | Barrel export compiles: `import { DatabaseConnection } from '@collectio/shared'` | TypeScript resolves the import without errors |
| 4 | `ConstraintError instanceof DatabaseError` evaluates to `true` | Unit test (see §14) |
| 5 | `DatabaseError instanceof Error` evaluates to `true` | Unit test |
| 6 | `ConnectionError instanceof DatabaseError` evaluates to `true` | Unit test |
| 7 | `implements DatabaseConnection` rejects implementations with missing methods | TypeScript compile error when trying to implement with wrong signatures |
| 8 | `implements DatabaseConnection` rejects implementations with wrong return types (e.g., sync `execute()` returning `void` instead of `Promise<void>`) | TypeScript compile error |
| 9 | Interface file has zero platform imports | Grep `packages/shared/src/data/database/DatabaseConnection.ts` for `better-sqlite3`, `@capacitor`, `electron`, `react` — must be zero matches |
| 10 | Error classes have zero platform imports | Same grep, same requirement |
| 11 | JSDoc on every method in the interface | Every method signature must have a `@param` and `@throws` JSDoc tag |
| 12 | `transaction<T>()` callback signature receives `DatabaseConnection` parameter | The generic parameter must be `(db: DatabaseConnection) => Promise<T>`, not `() => Promise<T>` |

---

## 14. Test Cases

### 14.1 TypeScript Compilation Test

```
Test: tsc --noEmit in packages/shared
Expected: Zero errors
Verification: pnpm --filter @collectio/shared typecheck
```

### 14.2 Error Inheritance Tests (unit tests)

```
Test: Error class instanceof checks
File: packages/shared/src/__tests__/database/DatabaseError.test.ts (or similar)

Test 1: new DatabaseError("msg") instanceof Error        → true
Test 2: new ConstraintError("msg") instanceof DatabaseError → true
Test 3: new ConstraintError("msg") instanceof Error      → true
Test 4: new ConnectionError("msg") instanceof DatabaseError → true
Test 5: new ConnectionError("msg") instanceof Error      → true
Test 6: new ConstraintError("msg") instanceof ConnectionError → false
```

### 14.3 Interface Shape Tests (compile-time, no runtime)

```
Test 1: A class "implements DatabaseConnection" with only 4 methods → compile error
Test 2: A class "implements DatabaseConnection" with execute() returning void instead of Promise<void> → compile error
Test 3: A class "implements DatabaseConnection" with all 5 async methods → compiles successfully
```

### 14.4 Import Resolution Tests

```
Test 1: import { DatabaseConnection } from '@collectio/shared' → resolves without error
Test 2: import { DatabaseError, ConstraintError, ConnectionError } from '@collectio/shared' → resolves without error
Test 3: import from '@collectio/shared/data/database/DatabaseConnection' → resolves (direct path import)
```

### 14.5 Platform Package Import Tests

```
Test: In packages/platform/src/index.ts (or a test file), add:
  import type { DatabaseConnection } from '@collectio/shared';
  → compiles successfully from another workspace package
```

---

## 15. Definition Of Done

- [ ] `packages/shared/src/data/database/DatabaseConnection.ts` exists with the `DatabaseConnection` interface and full JSDoc on all 5 methods
- [ ] `packages/shared/src/data/database/DatabaseError.ts` exists with `DatabaseError`, `ConstraintError`, `ConnectionError` classes
- [ ] `packages/shared/src/index.ts` re-exports `DatabaseConnection`, `DatabaseError`, `ConstraintError`, `ConnectionError`
- [ ] `pnpm --filter @collectio/shared typecheck` passes with zero errors
- [ ] `pnpm --filter @collectio/shared lint` passes with zero errors
- [ ] `pnpm --filter @collectio/shared test` passes (error inheritance tests)
- [ ] `ConstraintError` properly extends `DatabaseError` (verified by unit test)
- [ ] `DatabaseError` properly extends `Error` (verified by unit test)
- [ ] Zero platform imports in `packages/shared/src/data/database/` (grep verified)
- [ ] JSDoc on every interface method — `@param` for each parameter, `@throws` for each documented exception type
- [ ] `transaction<T>(fn: (db: DatabaseConnection) => Promise<T>)` signature passes the `DatabaseConnection` to the callback (not `() => Promise<T>`)
- [ ] All acceptance criteria 1–12 verified
