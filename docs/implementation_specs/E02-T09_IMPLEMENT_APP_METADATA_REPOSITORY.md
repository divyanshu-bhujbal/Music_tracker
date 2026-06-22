# E-02 T-09 — Implement AppMetadataRepository

**Parent Epic:** E-02: Database Layer
**Type:** Production Implementation (Data Layer — Repository)
**Criticality:** FOUNDATION — this is the first repository implementation. It establishes the constructor-injection pattern, async query conventions, parameterized SQL approach, and test patterns that all subsequent repositories (T-02.10–T-02.15) follow. The `app_metadata` table stores critical application configuration including `schema_version` (migration tracking), `device_id`, and `kdf_salt`.

---

## 1. Goal

Implement `AppMetadataRepository` — a typed key-value data access layer for the `app_metadata` table. This repository validates keys against a closed enumerated set of well-known keys, reads and writes values using parameterized SQL via the injected `DatabaseConnection`, and returns typed results. All methods are async.

Create the `AppMetadataKey` domain model type as the first domain model in `packages/shared/src/domain/models/`. This type defines the 7 well-known `app_metadata` keys as a TypeScript string literal union.

Establish the directory structure for `packages/shared/src/data/repositories/` and `packages/shared/src/domain/models/` — the first files in directories that will house all subsequent repositories and domain models.

---

## 2. Scope

| In Scope | Rationale |
|----------|-----------|
| `AppMetadataKey` domain model type | String literal union of the 7 well-known keys. Pure TypeScript — zero imports |
| `AppMetadataRepository` class | Constructor takes `DatabaseConnection`; all methods async; parameterized SQL |
| `get(key)` — retrieve a single value by key | Returns `string` if found, `null` if key exists but no row (not set), throws `DatabaseError` for invalid key |
| `set(key, value)` — upsert a key-value pair | `INSERT OR REPLACE` with parameterized `?` placeholders; validates key is well-known |
| `getAll()` — retrieve all key-value pairs | Returns `Partial<Record<AppMetadataKey, string>>` — only keys that have rows |
| `has(key)` — check if a key has a value set | Returns `boolean`; convenience wrapper around existence query |
| Runtime key validation | Every method that accepts a key validates it against the known set before hitting the database |
| Barrel re-export from `packages/shared/src/index.ts` | Makes repository and key type importable via `@collectio/shared` |
| Unit tests with mocked `DatabaseConnection` | Verifies SQL correctness, parameter binding, key validation, null handling |

---

## 3. Out of Scope

| Out of Scope | Why | Where It Belongs |
|-------------|-----|-----------------|
| General EAV-style key creation | `app_metadata` is a closed key set per constitution §14.1. New keys are added via software updates, not user input | Migration files + code updates |
| Multi-key batch writes | V1 writes one key at a time | Could be added later |
| Value type coercion (e.g., parsing `schema_version` as integer) | The repository returns raw strings. Callers interpret values | Caller (MigrationRunner, SyncEngine, etc.) |
| `app_settings` repository | Separate table (`app_settings` has `updated_at` for LWW sync) | E-02 T-02.14 |
| Other repositories (Device, Language, Category, etc.) | Separate tasks | E-02 T-02.10–T-02.15 |
| Repository interface abstraction (`IAppMetadataRepository`) | Domain layer repository interfaces are a separate concern | Domain layer (`packages/shared/src/domain/repositories/`) — not required by this task |

---

## 4. Files To Create

| # | File | Purpose | Responsibility |
|---|------|---------|---------------|
| 1 | `packages/shared/src/domain/models/AppMetadataKey.ts` | Domain model: well-known `app_metadata` keys | Exports a `AppMetadataKey` type — a string literal union of the 7 keys: `'schema_version'`, `'device_id'`, `'kdf_salt'`, `'initialized'`, `'last_successful_sync'`, `'cloud_file_id'`, `'cloud_modified_time'`. Also exports an `APP_METADATA_KEYS` readonly array for runtime validation. Pure TypeScript — zero imports. |
| 2 | `packages/shared/src/data/repositories/AppMetadataRepository.ts` | Repository class: typed CRUD for `app_metadata` | Exports `AppMetadataRepository` class. Constructor takes `DatabaseConnection` from `@collectio/shared`. Methods: `get(key)`, `set(key, value)`, `getAll()`, `has(key)`. All methods return `Promise<T>`. All methods validate `key` against `APP_METADATA_KEYS` at runtime and throw `DatabaseError` for unknown keys. All SQL uses `?` placeholder parameterized queries. No soft-delete filtering (infrastructure table, not user-content entity). |
| 3 | `packages/shared/src/data/repositories/__tests__/AppMetadataRepository.test.ts` | Unit tests with mocked `DatabaseConnection` | Mocks `DatabaseConnection` to record calls and return configurable results. Tests: `get()` returns value / null, `set()` executes upsert with correct params, `getAll()` returns all rows, `has()` returns boolean, invalid key throws `DatabaseError`, parameter binding verified, empty database handled. |

### 4.1 Public API — `AppMetadataKey.ts`

**Exported type:**

```
type AppMetadataKey =
  | 'schema_version'
  | 'device_id'
  | 'kdf_salt'
  | 'initialized'
  | 'last_successful_sync'
  | 'cloud_file_id'
  | 'cloud_modified_time'
```

**Exported constant:**

```
const APP_METADATA_KEYS: readonly AppMetadataKey[] = [
  'schema_version',
  'device_id',
  'kdf_salt',
  'initialized',
  'last_successful_sync',
  'cloud_file_id',
  'cloud_modified_time',
]
```

**Rationale for runtime constant:** The TypeScript type provides compile-time safety, but callers could cast arbitrary strings to `AppMetadataKey`. The `APP_METADATA_KEYS` array enables runtime validation in the repository without duplicating the key list.

### 4.2 Public API — `AppMetadataRepository.ts`

**Exported class:**

```
class AppMetadataRepository
```

**Constructor:**

```
constructor(db: DatabaseConnection)
```

- `db`: An already-opened `DatabaseConnection` instance. The repository does NOT call `open()` or `close()` — lifecycle is managed by the caller (app entry)
- Stores `db` as a private readonly field
- No setup or initialization needed — the `app_metadata` table already exists from migration 001

**Method: `async get(key: AppMetadataKey): Promise<string | null>`**

- Validates `key` is in `APP_METADATA_KEYS` — throws `DatabaseError` if not
- Executes `SELECT value FROM app_metadata WHERE key = ?` with parameterized key
- If row found: returns `row.value` as `string`
- If no row found: returns `null` (key not yet set)
- Returns `null` — never `undefined`

**Method: `async set(key: AppMetadataKey, value: string): Promise<void>`**

- Validates `key` is in `APP_METADATA_KEYS` — throws `DatabaseError` if not
- Executes `INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?, ?)` with parameterized key and value
- `INSERT OR REPLACE` handles both insert (new key) and update (existing key)
- Returns `void`

**Method: `async getAll(): Promise<Partial<Record<AppMetadataKey, string>>>`**

- Executes `SELECT key, value FROM app_metadata`
- Returns a plain object mapping present keys to their values
- Empty database (0 rows) returns `{}`
- Does NOT include keys that have no row

**Method: `async has(key: AppMetadataKey): Promise<boolean>`**

- Validates `key` is in `APP_METADATA_KEYS` — throws `DatabaseError` if not
- Executes `SELECT 1 FROM app_metadata WHERE key = ?` and checks if any row returned
- Returns `true` if a row exists, `false` otherwise

**Private method: `validateKey(key: string): asserts key is AppMetadataKey`**

- Checks `APP_METADATA_KEYS.includes(key as AppMetadataKey)`
- Throws `DatabaseError("Unknown app_metadata key: '${key}'")` if not in set
- Called by every public method that accepts a key parameter

### 4.3 Public API — `AppMetadataRepository.test.ts`

Exports no public API — it is a Jest test file. Tests are structured as `describe`/`it` blocks covering:

- `get()`: returns value when key exists, returns `null` when key not set, throws on invalid key
- `set()`: insert new key, update existing key, throws on invalid key, verifies parameterized SQL with `?` placeholders
- `getAll()`: returns all rows, returns `{}` when empty, verifies only `AppMetadataKey` keys in result
- `has()`: returns `true` when key exists, `false` when not, throws on invalid key
- Constructor injection: verifies `DatabaseConnection` is stored
- Mock verification: all SQL uses `?` placeholders (no string interpolation)

---

## 5. Files To Modify

| # | File | Change | Rationale |
|---|------|--------|-----------|
| 1 | `packages/shared/src/index.ts` | Add barrel re-exports: `export type { AppMetadataKey } from './domain/models/AppMetadataKey.js'` and `export { APP_METADATA_KEYS } from './domain/models/AppMetadataKey.js'` and `export { AppMetadataRepository } from './data/repositories/AppMetadataRepository.js'` | Makes types and repository importable via `@collectio/shared` |
| 2 | `packages/shared/package.json` | No change required | No new dependencies — pure TypeScript |
| 3 | `packages/shared/tsconfig.json` | No change required | `include: ["src"]` already covers new directories |

---

## 6. Interfaces

### 6.1 Constructor Dependency

| Parameter | Type | Source | Notes |
|-----------|------|--------|-------|
| `db` | `DatabaseConnection` | `@collectio/shared` | Already-opened connection; repository calls `execute()` and `query()` |

### 6.2 Domain Model (AppMetadataKey)

```
AppMetadataKey = string literal union of 7 well-known keys
APP_METADATA_KEYS = readonly array of all AppMetadataKey values
```

The model file has zero imports. It is consumed by the repository and exported via the barrel.

### 6.3 Repository SQL Operations

| Operation | Interface Method | SQL |
|-----------|-----------------|-----|
| Get value by key | `db.query<{value: string}>("SELECT value FROM app_metadata WHERE key = ?", [key])` | Parameterized SELECT |
| Upsert key-value | `db.execute("INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?, ?)", [key, value])` | Parameterized INSERT OR REPLACE |
| Get all pairs | `db.query<{key: string; value: string}>("SELECT key, value FROM app_metadata")` | SELECT with no params |
| Check key existence | `db.query<{one: number}>("SELECT 1 AS one FROM app_metadata WHERE key = ?", [key])` | Parameterized SELECT |

### 6.4 Key Validation Contract

Every method that accepts a key parameter calls `validateKey(key)` before executing SQL. This ensures:
- At compile time: only `AppMetadataKey` values are accepted (TypeScript)
- At runtime: arbitrary strings passed via `as AppMetadataKey` or `any` casts are rejected

The validation uses `APP_METADATA_KEYS.includes(key as AppMetadataKey)`. Throws `DatabaseError` with the unknown key name in the message.

---

## 7. Data Flow

```
Caller (app entry, MigrationRunner, SyncEngine, etc.)
  │
  ├─ const repo = new AppMetadataRepository(db)
  │     └─ db is an already-opened DatabaseConnection
  │
  ├─ const version = await repo.get('schema_version')
  │     └─ validateKey('schema_version') → valid
  │     └─ db.query("SELECT value FROM app_metadata WHERE key = ?", ['schema_version'])
  │     └─ Returns '0' (string) or null
  │
  ├─ await repo.set('device_id', '550e8400-...')
  │     └─ validateKey('device_id') → valid
  │     └─ db.execute("INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?, ?)", ['device_id', '550e8400-...'])
  │     └─ Returns void
  │
  ├─ const all = await repo.getAll()
  │     └─ db.query("SELECT key, value FROM app_metadata")
  │     └─ Returns { schema_version: '0', device_id: '550e8400-...', ... }
  │
  └─ const exists = await repo.has('initialized')
        └─ validateKey('initialized') → valid
        └─ db.query("SELECT 1 AS one FROM app_metadata WHERE key = ?", ['initialized'])
        └─ Returns true or false
```

Import chain:
```
@collectio/shared (AppMetadataRepository + AppMetadataKey type)
        ↑
apps/* (main.ts / index.tsx — creates repository, injects connection)
```

---

## 8. State Changes

### 8.1 Repository Internal State

The repository is stateless beyond the stored `DatabaseConnection` reference. No caching, no in-memory key-value map, no dirty tracking.

| Field | Type | Purpose |
|-------|------|---------|
| `db` | `DatabaseConnection` (private readonly) | Injected connection; never replaced |

### 8.2 Database State

| Operation | Database Effect |
|-----------|----------------|
| `get(key)` | No change (read-only) |
| `set(key, value)` | Inserts new row or replaces existing row with same key. `INSERT OR REPLACE` is atomic |
| `getAll()` | No change (read-only) |
| `has(key)` | No change (read-only) |

### 8.3 Caller State Expectations

Callers interpret `app_metadata` values:
- `schema_version`: integer as string (`'0'`, `'1'`, `'2'`). Migrated by MigrationRunner
- `device_id`: UUID v4 string. Set once during first-launch setup
- `kdf_salt`: 32 bytes hex-encoded. Set during first-launch setup
- `initialized`: `'true'` string. Set after first-launch setup completes
- `last_successful_sync`: ISO-8601 timestamp string. Updated by SyncEngine
- `cloud_file_id`: Google Drive file ID string. Set after first cloud upload
- `cloud_modified_time`: Google Drive `modifiedTime` string. Updated by SyncEngine

The repository stores and retrieves raw strings. Type coercion and semantic interpretation are the caller's responsibility.

---

## 9. Database Changes

**None.** The repository only reads from and writes to the existing `app_metadata` table. No schema changes, no new tables, no index creation.

---

## 10. Error Handling

### 10.1 Error Classification

| Error Condition | Detection | Response |
|----------------|-----------|----------|
| Unknown key passed to `get`, `set`, or `has` | `APP_METADATA_KEYS.includes()` returns false | Throw `DatabaseError("Unknown app_metadata key: '${key}'")` |
| `DatabaseConnection` throws on `execute()` or `query()` | Catch and re-throw | Re-throw the original error as-is. The connection already wraps errors in `DatabaseError`/`ConstraintError` |
| Unreachable: `value` column is NULL | Schema enforces `NOT NULL` | If a row exists, `value` is guaranteed non-null. No null check needed on returned rows |
| `get()` called with key that has no row | `query()` returns `[]` | Return `null` — not an error. The key is valid but hasn't been set yet |

### 10.2 Error Message Format

```
DatabaseError: Unknown app_metadata key: 'invalid_key'
```

The message includes the offending key name for debugging.

### 10.3 SQL Error Propagation

If the underlying `DatabaseConnection` throws (e.g., database file corruption, disk full), the error is re-thrown as-is. The repository does not wrap or suppress connection-level errors — the `DatabaseConnection` implementation already wraps native errors into `DatabaseError`/`ConstraintError`.

---

## 11. Logging Requirements

**None.** The repository is a thin data access layer. Logging is the caller's responsibility.

---

## 12. Security Requirements

| Requirement | Status |
|------------|--------|
| Parameterized queries — no SQL injection | ENFORCED — all SQL uses `?` placeholders with parameter arrays. Zero string interpolation or template literals |
| No secrets stored by the repository | PASS — `value` content is the caller's responsibility; repository is a pass-through |
| Key validation prevents EAV abuse | ENFORCED — runtime validation rejects unknown keys; closed key set prevents arbitrary data storage |
| No connection lifecycle management | PASS — `open()`/`close()` are the caller's responsibility; repository never opens or closes connections |

---

## 13. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `AppMetadataKey` type compiles in `packages/shared/src/domain/models/` | `tsc --noEmit` — zero errors |
| 2 | `APP_METADATA_KEYS` array contains exactly 7 keys matching `02_DATABASE_SCHEMA.md` | Unit test: array length is 7; all documented keys present |
| 3 | `AppMetadataRepository` compiles and implements all 4 methods | `tsc --noEmit` |
| 4 | `get()` returns string when key exists | Unit test: mock query returns `[{value: 'test'}]` → `get('schema_version')` returns `'test'` |
| 5 | `get()` returns `null` when key has no row | Unit test: mock query returns `[]` → `get('schema_version')` returns `null` |
| 6 | `set()` calls `execute()` with correct parameterized SQL | Unit test: verify `db.execute()` called with `"INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?, ?)"` and params `['device_id', '550e8400-...']` |
| 7 | `getAll()` returns all rows as a key-value object | Unit test: mock query returns 2 rows → returns `{ schema_version: '0', device_id: 'abc' }` |
| 8 | `getAll()` returns `{}` when database is empty | Unit test: mock query returns `[]` → returns `{}` |
| 9 | `has()` returns `true` when key exists | Unit test: mock query returns `[{one: 1}]` → returns `true` |
| 10 | `has()` returns `false` when key not set | Unit test: mock query returns `[]` → returns `false` |
| 11 | Invalid key on `get()` throws `DatabaseError` | Unit test: `get('not_a_key' as AppMetadataKey)` → throws `DatabaseError` with "Unknown app_metadata key" |
| 12 | Invalid key on `set()` throws `DatabaseError` | Unit test: `set('not_a_key' as AppMetadataKey, 'val')` → throws `DatabaseError` |
| 13 | Invalid key on `has()` throws `DatabaseError` | Unit test: `has('not_a_key' as AppMetadataKey)` → throws `DatabaseError` |
| 14 | All SQL uses `?` placeholders (zero string interpolation) | Unit test: verify `db.execute()` params contain the user-provided values, not embedded in SQL string |
| 15 | Repository does not call `db.open()` or `db.close()` | Code review: grep for `open`/`close` in repository file |
| 16 | Barrel export compiles: `import { AppMetadataRepository } from '@collectio/shared'` | `tsc --noEmit` resolves |
| 17 | Domain model has zero imports | Grep `AppMetadataKey.ts` for `import` — must produce zero matches |
| 18 | `pnpm typecheck` passes from root | `pnpm typecheck` |
| 19 | `pnpm lint` passes for `packages/shared/` | `pnpm --filter @collectio/shared lint` |
| 20 | All unit tests pass with mocked `DatabaseConnection` | `pnpm --filter @collectio/shared test` |

---

## 14. Test Cases

### 14.1 Test Setup

All tests use a mocked `DatabaseConnection`. The mock:
- Stores the last `execute()` and `query()` calls with their SQL and params
- Returns configurable results from `query()` (array of rows or empty array)
- Tracks call counts per method
- Does NOT throw on its own (errors are injected per-test if needed)

Each test creates `new AppMetadataRepository(mockDb)` with a fresh mock.

### 14.2 Required Test Cases

#### Constructor
```
Test: constructor stores DatabaseConnection
  → Create repository with mock
  → Verify internal db field is set (indirectly via method calls working)
```

#### get()
```
Test: get returns value when key exists
  → Mock db.query to return [{value: '2'}]
  → const result = await repo.get('schema_version')
  → result === '2'
  → Verify db.query called with "SELECT value FROM app_metadata WHERE key = ?" and ['schema_version']

Test: get returns null when key not set
  → Mock db.query to return []
  → const result = await repo.get('initialized')
  → result === null

Test: get throws on invalid key
  → await repo.get('invalid' as AppMetadataKey)
  → Throws DatabaseError with message containing "Unknown app_metadata key"
  → db.query was NEVER called (validation happens before SQL)
```

#### set()
```
Test: set executes upsert with correct params
  → await repo.set('device_id', '550e8400-e29b-41d4-a716-446655440000')
  → Verify db.execute called with:
      sql: "INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?, ?)"
      params: ['device_id', '550e8400-e29b-41d4-a716-446655440000']

Test: set overwrites existing key
  → await repo.set('device_id', 'id-old')
  → await repo.set('device_id', 'id-new')
  → Verify db.execute called twice, second call params include 'id-new'

Test: set throws on invalid key
  → await repo.set('invalid' as AppMetadataKey, 'val')
  → Throws DatabaseError
  → db.execute was NEVER called

Test: set uses ? placeholders, not string interpolation
  → await repo.set('kdf_salt', 'deadbeef')
  → Verify db.execute's sql string does NOT contain the value 'deadbeef'
  → The value is only in the params array
```

#### getAll()
```
Test: getAll returns all rows
  → Mock db.query to return [
      {key: 'schema_version', value: '0'},
      {key: 'device_id', value: 'abc'},
      {key: 'initialized', value: 'true'}
    ]
  → const result = await repo.getAll()
  → result === { schema_version: '0', device_id: 'abc', initialized: 'true' }

Test: getAll returns empty object when no rows
  → Mock db.query to return []
  → const result = await repo.getAll()
  → result === {}

Test: getAll does not validate keys (reads whatever the database has)
  → (Implicit — no key validation for queries without key parameters)
```

#### has()
```
Test: has returns true when key exists
  → Mock db.query to return [{one: 1}]
  → const result = await repo.has('schema_version')
  → result === true

Test: has returns false when key not set
  → Mock db.query to return []
  → const result = await repo.has('cloud_file_id')
  → result === false

Test: has throws on invalid key
  → await repo.has('invalid' as AppMetadataKey)
  → Throws DatabaseError
```

#### APP_METADATA_KEYS constant
```
Test: APP_METADATA_KEYS contains all 7 well-known keys
  → APP_METADATA_KEYS.length === 7
  → APP_METADATA_KEYS.includes('schema_version') → true
  → APP_METADATA_KEYS.includes('device_id') → true
  → APP_METADATA_KEYS.includes('kdf_salt') → true
  → APP_METADATA_KEYS.includes('initialized') → true
  → APP_METADATA_KEYS.includes('last_successful_sync') → true
  → APP_METADATA_KEYS.includes('cloud_file_id') → true
  → APP_METADATA_KEYS.includes('cloud_modified_time') → true

Test: APP_METADATA_KEYS has no duplicate entries
  → new Set(APP_METADATA_KEYS).size === APP_METADATA_KEYS.length
```

#### Integration with DatabaseError types
```
Test: verify DatabaseError is importable from @collectio/shared
  → import { DatabaseError } from '@collectio/shared'
  → new DatabaseError('test') instanceof Error → true

Test: repository methods are async
  → typeof repo.get → 'function'
  → repo.get('schema_version') instanceof Promise → true
  → typeof repo.set → 'function'
  → repo.set('schema_version', 'v') instanceof Promise → true
```

---

## 15. Definition Of Done

- [ ] `packages/shared/src/domain/models/` directory exists
- [ ] `packages/shared/src/domain/models/AppMetadataKey.ts` exists with `AppMetadataKey` type and `APP_METADATA_KEYS` constant
- [ ] `AppMetadataKey` type is a string literal union of exactly 7 keys matching `02_DATABASE_SCHEMA.md` §3
- [ ] `APP_METADATA_KEYS` is a readonly array containing all 7 keys
- [ ] `AppMetadataKey.ts` has zero imports (pure TypeScript domain model)
- [ ] `packages/shared/src/data/repositories/` directory exists
- [ ] `packages/shared/src/data/repositories/AppMetadataRepository.ts` exists
- [ ] Repository constructor takes `DatabaseConnection` parameter
- [ ] Repository has 4 public methods: `get`, `set`, `getAll`, `has`
- [ ] All methods return `Promise<T>` (async per AD-01)
- [ ] `get()` returns `string | null` — never `undefined`
- [ ] `set()` uses `INSERT OR REPLACE` with `?` placeholders
- [ ] `getAll()` returns `Partial<Record<AppMetadataKey, string>>` — plain object
- [ ] `has()` returns `boolean`
- [ ] Runtime key validation on `get()`, `set()`, and `has()` using `APP_METADATA_KEYS`
- [ ] Invalid keys throw `DatabaseError("Unknown app_metadata key: '...'")`
- [ ] All SQL uses `?` parameterized placeholders — zero string interpolation
- [ ] Repository never calls `db.open()` or `db.close()`
- [ ] `packages/shared/src/index.ts` re-exports `AppMetadataKey`, `APP_METADATA_KEYS`, `AppMetadataRepository`
- [ ] Unit test file created with all test cases from §14
- [ ] `pnpm --filter @collectio/shared typecheck` passes with zero errors
- [ ] `pnpm --filter @collectio/shared lint` passes with zero errors
- [ ] `pnpm --filter @collectio/shared test` passes with zero failures
- [ ] No platform imports in repository or domain model files
- [ ] All acceptance criteria 1–20 verified
