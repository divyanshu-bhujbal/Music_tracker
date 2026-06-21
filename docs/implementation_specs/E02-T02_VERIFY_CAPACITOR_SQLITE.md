# E-02 T-02 — Verify @capacitor-community/sqlite on Android

**Parent Epic:** E-02: Database Layer
**Type:** Verification (Platform Adapter Validation)
**Criticality:** ARCHITECTURE-GATING — this task confirms the Capacitor Android platform can enforce foreign keys, the failure that caused Option A to be rejected

---

## 1. Goal

Validate that `@capacitor-community/sqlite` v6.0.2 can perform full CRUD operations and enforce foreign key constraints in a Capacitor + React web app running on a **physical Android device**. Answer the single yes/no question:

> **Can @capacitor-community/sqlite — with foreign key enforcement — serve as the SQLite adapter for Capacitor Android?**

This is the Capacitor counterpart to E02-T01 (Verify better-sqlite3 on Electron). Both platform verifications must pass before T-02.3 (Define DatabaseConnection Interface) can proceed. If SQ-09 (FK enforcement) fails, this task blocks the entire Option D architecture — the same failure that killed Option A in E-00.

**Already validated in E-00b T-00b.1:** The spike proved FK enforcement works with `@capacitor-community/sqlite` v6.0.2 on Android API level 16. This task re-validates in the production monorepo, against the production `packages/platform` structure, using the same verify file conventions established by E02-T01.

---

## 2. Scope

| In Scope | Rationale |
|----------|-----------|
| Verify `@capacitor-community/sqlite@6.0.2` is installed in both `apps/capacitor/` (AD-11) and `packages/platform/` | Dual dependency required — `cap sync` only scans app deps for Gradle includes; platform package needs types |
| Run 12 SQ test cases | Identical logical tests to E-00b T-00b.1 and E02-T01 (CREATE, INSERT, SELECT, UPDATE, DELETE, transactions, FK enforcement, persistence, integrity) |
| FK enforcement (SQ-09) | The critical architecture gate. Must confirm `PRAGMA foreign_keys = ON` is honored via Android's `SQLiteDatabase` |
| Database persistence (SQ-11) | File must survive app kill via `DROP TABLE IF EXISTS` cleanup + re-verify on relaunch |
| `PRAGMA integrity_check` (SQ-12) | Must return `"ok"` |
| React Strict Mode resilience | Verify `isConnection()`/`retrieveConnection()` pattern handles double-mounting (PL-07, IW-02) |
| PRAGMA routing via `query()` | Android `execSQL()` rejects result-returning statements — ALL PRAGMAs must use `query()` (AD-05, Rule 4.1) |
| `transaction: false` on `execute()` | Plugin defaults `transaction = true` — must explicitly pass `false` to avoid nested transaction errors (Rule 4.2) |
| Single `SQLiteConnection` instance | Must reuse one instance across all tests (AD-06, Rule 4.4) |
| `DROP TABLE IF EXISTS` cleanup | Never call `deleteDatabase()` — it fails silently (Rule 4.5, IW-01) |
| Verify `MainActivity.java` registration | `registerPlugin(CapacitorSQLitePlugin.class)` must be present (Rule 10.1, RC-05) |
| Verify `capacitor.config.ts` | `androidIsEncryption: false` must be present (Rule 10.2, RC-02) |
| Display results in WebView | Results rendered as colored pass/fail rows in the React UI (mirroring E-00b spike runner pattern), plus logged to browser console |
| Temporary modification of `apps/capacitor/src/index.tsx` | Verify component is mounted instead of the normal app entry; reverted after validation |

---

## 3. Out of Scope

| Out of Scope | Why | Where It Belongs |
|-------------|-----|-----------------|
| Async `DatabaseConnection` interface | The verify script uses `@capacitor-community/sqlite`'s raw async plugin API. Production async interface is T-02.3's concern | E-02 T-02.3 |
| Production schema (app_metadata, songs, etc.) | Verify script uses a temporary `test` table + `parent_table`/`child_table` for FK tests | E-02 T-02.7 (Migration 001) |
| Migration runner | No schema versioning or migration execution | E-02 T-02.6 |
| Typed repository pattern | Raw `db.execute(sql, false)` / `db.query(sql)` calls | E-02 T-02.9–T-02.15 |
| Better-sqlite3 comparison | This task validates Capacitor only. Electron validation is T-02.1 | E-02 T-02.1 |
| Cross-platform SQL comparison | Not comparing byte-level output between Electron and Capacitor | E-02 T-02.4 / T-02.5 |
| Emulator testing | Physical Android device required per epic AC. Emulator behavior may differ for filesystem and WebView | N/A |
| WAL mode concurrent read/write stress test | PRAGMA set but not deeply tested | E-02 T-02.5 |
| Large dataset performance | Tests use <10 rows | E-15 T-15.7 |
| OAuth or network operations | The verify script is entirely local — no cloud, no HTTP | E-09 |
| CI automation | Manual verification on physical Android device | E-16 |
| React component library (MUI) styling | Plain HTML/CSS for the verify runner display (matching E-00b spike pattern) | E-15 |

---

## 4. Files To Create

| # | File | Purpose | Responsibility |
|---|------|---------|---------------|
| 1 | `packages/platform/src/capacitor/__verify__/capacitor-sqlite-verify.ts` | Core verification module: initializes `SQLiteConnection`, creates `SQLiteDBConnection`, runs all 12 SQ tests in sequence, returns typed `VerifyReport`. Exports `runVerify()` as the single public function. | Executes all 12 SQ test cases against `@capacitor-community/sqlite` raw plugin API. Handles connection lifecycle: `isConnection()` → `createConnection()` or `retrieveConnection()`, PRAGMA setup via `query()`, per-test `DROP TABLE IF EXISTS` cleanup, `closeConnection()` on completion. Each test runs in its own try/catch — a failure in one test does not prevent subsequent tests. |
| 2 | `packages/platform/src/capacitor/__verify__/capacitor-sqlite-types.ts` | Type definitions: `SQStatus`, `TestResult`, `TestCase`, `VerifyReport`. | Pure types, no runtime code. Mirrors E02-T01's `better-sqlite3-types.ts` but `VerifyReport.platform` is `'capacitor-android'`, `VerifyReport.packageName` is `'@capacitor-community/sqlite'`. |
| 3 | `packages/platform/src/capacitor/__verify__/VerifyRunner.tsx` | React component that imports `runVerify()` from the verify module, executes it on mount, and renders a colored pass/fail table in the WebView. | Handles React Strict Mode double-mounting (uses `useRef` to prevent double execution). Displays each test result row (green PASS, red FAIL, yellow ERROR), summary section, critical FK gate status, and a "Copy JSON Report" button. No MUI — plain HTML/CSS to avoid dependency on renderer package. |

### 4.1 Public API

#### `capacitor-sqlite-verify.ts`

**Exported function:**

```
runVerify(dbName: string): Promise<VerifyReport>
```

**Contract:**
- Takes a database name string (e.g., `'collectio-verify'`)
- Creates or retrieves a `SQLiteConnection` using the `isConnection()`/`createConnection()`/`retrieveConnection()` pattern
- Opens the database connection via `dbConn.open()`
- Executes `PRAGMA foreign_keys = ON`, `PRAGMA journal_mode = WAL`, `PRAGMA synchronous = NORMAL`, `PRAGMA busy_timeout = 5000` — ALL via `query()` (Rule 4.1)
- Runs all 12 test cases in sequence, each receiving the open `SQLiteDBConnection`
- Each test case: measure `performance.now()` duration, capture result or exception, handle errors gracefully
- Closes the database connection via `dbConn.close()` and the plugin via `sqlite.closeConnection(dbName, false)`
- Returns a `VerifyReport` with all results
- Does NOT delete the database file itself (SQ-11 persistence test needs it to survive)
- Does NOT import React, MUI, or any renderer-package code

#### `capacitor-sqlite-types.ts`

Exports these types (mirroring E02-T01's `better-sqlite3-types.ts`):

```
SQStatus = 'PASS' | 'FAIL' | 'ERROR'

TestResult {
  id: string              // 'SQ-01' through 'SQ-12'
  description: string     // Human-readable test description
  status: SQStatus
  expected: string        // Expected behavior description
  actual: string          // Actual result description
  durationMs: number      // Execution time in milliseconds
  error?: string          // Stack trace if FAIL or ERROR
}

VerifyReport {
  taskId: 'E-02-T-02.2'
  platform: 'capacitor-android'
  packageName: '@capacitor-community/sqlite'
  packageVersion: string
  capacitorVersion: string
  webViewVersion: string
  dbName: string
  tests: TestResult[]
  passed: number
  failed: number
  errored: number
  criticalFailed: boolean   // true if SQ-09 FAIL or ERROR
  timestamp: string         // ISO-8601
}
```

#### `VerifyRunner.tsx`

**Component:** `<VerifyRunner />`

**Contract:**
- On mount, calls `runVerify('collectio-verify')` once (guarded by `useRef` to survive React Strict Mode double-mount)
- While tests are running: displays "Running 12 SQLite tests..." with a simple progress indicator
- When complete: renders a table with columns: Test ID, Description, Status (colored), Expected, Actual, Duration
- Renders summary: "N/12 passed. M/12 failed. 0/12 errors."
- If `criticalFailed` is true: renders prominent red warning: "CRITICAL FAILURE: Foreign key enforcement is not working. Capacitor SQLite cannot be used for this project."
- "Copy JSON Report" button: copies `VerifyReport` as formatted JSON to clipboard
- Exports no props — self-contained verification component

---

## 5. Files To Modify

| # | File | Change | Revert After? |
|---|------|--------|---------------|
| 1 | `apps/capacitor/src/index.tsx` | Temporarily import `<VerifyRunner />` from `@collectio/platform` and render it in place of the normal app entry: `root.render(<VerifyRunner />)` | **YES** — revert to render the normal `<App />` component after verification passes |
| 2 | `packages/platform/package.json` | Verify `@capacitor-community/sqlite@6.0.2` is in `dependencies` | N/A — should already be present from E01-T04 scaffold |
| 3 | `apps/capacitor/package.json` | Verify `@capacitor-community/sqlite@6.0.2` is in `dependencies` (AD-11: MUST be a direct dep for `cap sync` to detect native plugin) | N/A — should already be present from E01-T06 scaffold |
| 4 | `apps/capacitor/capacitor.config.ts` | Verify `androidIsEncryption: false` is present in `plugins.CapacitorSQLite` (RC-02, Rule 10.2) | N/A — verify-only; add if missing |
| 5 | `apps/capacitor/android/app/src/main/java/com/collectio/app/MainActivity.java` | Verify `registerPlugin(CapacitorSQLitePlugin.class)` is present before `super.onCreate()` (RC-05, Rule 10.1) | N/A — verify-only; add if missing |
| 6 | `packages/platform/tsconfig.json` | Verify `include` covers `src/capacitor/__verify__/` — the tsconfig glob `src/**/*.ts` should already catch it | N/A |

---

## 6. Interfaces

### 6.1 Plugin API (Raw — Not Production DatabaseConnection)

The verify script uses `@capacitor-community/sqlite`'s raw plugin API directly. The production `CapacitorSqliteConnection` (T-02.5) will wrap this behind the `DatabaseConnection` interface.

| Operation | Plugin API Call | Notes |
|-----------|----------------|-------|
| Init plugin | `new SQLiteConnection(CapacitorSQLite)` | Single instance reused (AD-06) |
| Check connection | `sqlite.isConnection(dbName, false)` | Returns `{ result: boolean }` (IW-02) |
| Create connection | `sqlite.createConnection(dbName, false, 'no-encryption', 1, false)` | `false` = not encrypted |
| Retrieve connection | `sqlite.retrieveConnection(dbName, false)` | For reusing existing connections |
| Open database | `dbConn.open()` | Must be called before queries |
| Execute (DDL/DML) | `dbConn.execute(sql, false)` | `false` = no auto-transaction (Rule 4.2) |
| Query (SELECT/PRAGMA) | `dbConn.query(sql)` | All PRAGMAs must use this (Rule 4.1) |
| Close database | `dbConn.close()` | Cleanup after tests |
| Close plugin | `sqlite.closeConnection(dbName, false)` | Release plugin resources |

### 6.2 SQ-09 FK Test Assertion

The FK enforcement test is a **negative test** — the `INSERT INTO child_table (parent_id) VALUES (999)` MUST throw an error. The verify function MUST catch the error and confirm:

1. An exception was thrown (any error type — `Error`, plugin error object, or string)
2. After catching, execute `SELECT count(*) FROM child_table` and confirm the result is `0` (the row was NOT silently inserted)
3. If no exception thrown → FAIL (false pass)
4. If exception thrown but count > 0 → FAIL (plugin rejected but row was still inserted — inconsistent state)
5. If exception thrown AND count === 0 → PASS

---

## 7. Data Flow

```
apps/capacitor/src/index.tsx (Capacitor WebView entry)
  │
  ├─ import { VerifyRunner } from '@collectio/platform/capacitor/__verify__/VerifyRunner'
  │
  ├─ root.render(<VerifyRunner />)
  │
  └─ VerifyRunner (on mount):
       │
       ├─ import { runVerify } from '@collectio/platform/capacitor/__verify__/capacitor-sqlite-verify'
       │
       ├─ const report = await runVerify('collectio-verify')
       │
       ├─ setState(report) → triggers re-render
       │
       └─ Renders:
            ├─ Colored test result table (green PASS / red FAIL / yellow ERROR)
            ├─ Summary: "N/12 passed, M/12 failed"
            ├─ Critical FK gate status (prominent red if failed)
            └─ "Copy JSON Report" button → navigator.clipboard.writeText(JSON.stringify(report, null, 2))
```

**All execution happens in the Capacitor WebView.** No Electron, no Node.js APIs, no filesystem writes (console.log is used for diagnostic output). The `VerifyReport` object is the canonical record — it can be copied to clipboard or logged.

**SQ-11 (persistence) procedure:**
1. First launch: run verify → all 12 tests execute → data committed → results displayed
2. Kill the app (swipe from recents / Force Stop)
3. Second launch: run verify again → SQ-11 queries data from the previous run's database file → must confirm rows exist
4. The `collectio-verify` database name must be the same across both launches

---

## 8. State Changes

| State | Before Verify | After Verify (First Launch) | After Verify (Second Launch — SQ-11) |
|-------|--------------|----------------------------|--------------------------------------|
| Capacitor SQLite plugin | Initialized at app startup (or on first plugin call) | Plugin connection dictionary has `collectio-verify` entry | Plugin connection dictionary has `collectio-verify` entry |
| Database file (`collectio-verify`) | Does not exist | Created in app's data directory. Contains `test`, `parent_table`, `child_table` (all dropped by final cleanup except data left for SQ-11) | Opened from app's data directory. SQ-11 verifies previously committed data exists, then all tables are dropped |
| `VerifyReport` in memory | Not yet computed | Contains all 12 test results | Contains all 12 test results (SQ-11 reflects second-launch verification) |

All state is temporary. The verify database uses a dedicated database name (`collectio-verify`) — distinct from the production database name. After verification succeeds, the `__verify__/` directory remains in the codebase for future re-validation (e.g., plugin upgrade, new Android version).

---

## 9. Database Changes

**None in production.** The verification uses a separate database named `collectio-verify` managed through `@capacitor-community/sqlite`. The production database uses a different name per constitution.

Tables created during verification (all temporary, dropped by cleanup):
- `test` — simple key-value table: `id INTEGER PRIMARY KEY, value TEXT NOT NULL` — for SQ-02 through SQ-08, SQ-11, SQ-12
- `parent_table` — `id INTEGER PRIMARY KEY` — for FK tests SQ-09 and SQ-10
- `child_table` — `id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent_table(id)` — for FK tests SQ-09 and SQ-10

All tables are dropped with `DROP TABLE IF EXISTS` at the end of each test case's cleanup. SQ-11's data (committed during the first launch) persists because the database file itself is not deleted between launches.

---

## 10. Error Handling

### 10.1 Error Classification

| Error Type | Detection | Handling |
|-----------|-----------|----------|
| Plugin not registered (`CapacitorSQLitePlugin: null`) | `new SQLiteConnection(...)` returns unusable object; first `isConnection()` call throws | Catch, mark all subsequent tests as ERROR with message "Plugin not registered. Check MainActivity.java: registerPlugin(CapacitorSQLitePlugin.class)" |
| Plugin native code not compiled (ClassNotFoundException) | App crashes on plugin access; in WebView context, plugin call throws `Error` | Catch, mark all subsequent tests as ERROR with message "Plugin native code not compiled. Run cap sync and rebuild from Android Studio" |
| `androidIsEncryption` not set to false | Plugin initializes but `open()` throws null-message error (PL-05) | Catch, mark SQ-01 as FAIL with message "Encryption mode error. Verify androidIsEncryption: false in capacitor.config.ts" |
| PRAGMA via `execute()` throws | Android `execSQL()` rejects result-returning statements: "Queries cannot be performed using execSQL(), use query() instead" | Must be caught during development — all PRAGMAs must use `query()`. If this error occurs, the verify script has a bug (violates Rule 4.1) |
| Connection already exists (Strict Mode double-mount) | `createConnection()` throws "Connection collectio-verify already exists" | Prevented by `isConnection()`/`retrieveConnection()` pattern (IW-02). If it occurs: mark SQ-01 as FAIL with diagnostic message |
| SQL execution error (expected for SQ-09) | `dbConn.execute(sql, false)` throws on FK violation | Catch, check this is SQ-09. Verify `SELECT count(*) FROM child_table` returns 0. If both true: mark PASS. If count > 0: mark FAIL (false pass) |
| SQL execution error (unexpected) | `dbConn.execute()` or `dbConn.query()` throws on non-SQ-09 test | Catch, mark test as FAIL, log the error message in `TestResult.error` |
| `deleteDatabase()` used anywhere | This function is banned (Rule 4.5) — it fails silently | Replace with `DROP TABLE IF EXISTS`. Verify script should never call `deleteDatabase()` |
| `transaction` flag omitted on `execute()` | Plugin wraps in implicit transaction → PRAGMAs fail or nested transaction errors | All `execute()` calls must pass explicit `false` (Rule 4.2). Verify script must never omit this parameter |

### 10.2 Per-Test Isolation

Each test case MUST:
- Run in its own try/catch block
- NOT prevent subsequent tests from executing on failure
- Clean up data at the END of each test (not the beginning), using `DROP TABLE IF EXISTS test`, `DROP TABLE IF EXISTS parent_table`, `DROP TABLE IF EXISTS child_table`
- Report an explicit `TestResult` regardless of outcome (no uncaught exceptions escaping to the caller)
- For SQ-09 specifically: after the expected FK violation error, `DROP TABLE IF EXISTS child_table; DROP TABLE IF EXISTS parent_table` to clean up

### 10.3 React Strict Mode Resilience

The `VerifyRunner` component MUST handle React Strict Mode double-mounting (which occurs in development mode only):
- Use a `useRef<boolean>` flag to track whether `runVerify()` has already been called
- On mount, check the ref — if already `true`, skip execution
- This prevents duplicate verification runs and "Connection already exists" errors (PL-07)

### 10.4 Missing Configuration Recovery

If the verify script fails due to missing `MainActivity.java` registration or missing `capacitor.config.ts` settings:

1. Log the specific error with the exact fix required (e.g., "Add `registerPlugin(CapacitorSQLitePlugin.class)` before `super.onCreate()` in MainActivity.java")
2. Mark SQ-01 as FAIL with the configuration error in `TestResult.error`
3. Do NOT attempt to modify configuration files automatically
4. The developer fixes the config manually, runs `cap sync`, rebuilds from Android Studio, and re-launches

---

## 11. Logging Requirements

### 11.1 Console Output Format (Browser Console)

The verify script logs to the Capacitor WebView's browser console (accessible via Chrome DevTools remote debugging or Android Studio Logcat). Each test result is logged immediately as it completes:

```
=== E-02 T-02: @capacitor-community/sqlite Verification ===
Capacitor: 6.2.1
@capacitor-community/sqlite: 6.0.2
WebView: (user agent)
Database: collectio-verify

SQ-01: PASS — Open database connection — 12ms
SQ-02: PASS — Create table — 5ms
SQ-03: PASS — Insert row — 3ms
SQ-04: PASS — Select row — 2ms
SQ-05: PASS — Update row — 3ms
SQ-06: PASS — Delete row — 2ms
SQ-07: PASS — Transaction commit — 6ms
SQ-08: PASS — Transaction rollback — 4ms
SQ-09: PASS — FK violation rejected — 4ms  ← CRITICAL
SQ-10: PASS — Valid FK inserted — 3ms
SQ-11: PASS — Data persistence — 8ms
SQ-12: PASS — Integrity check — 3ms

Result: 12/12 passed. 0 failed. 0 errors.
Critical FK test: PASS
JSON report available via "Copy Report" button or console.log(report).
```

### 11.2 JSON Report

The `VerifyReport` object is the canonical record. It is:
1. Logged to console via `console.log(JSON.stringify(report, null, 2))` after all tests complete
2. Available via the "Copy JSON Report" button in the `<VerifyRunner />` UI
3. Accessible via `window.__verifyReport` (attached by the runner for Chrome DevTools inspection)

No file is written to disk from the Capacitor WebView context (the WebView has no direct filesystem access via the Capacitor Filesystem plugin — and this verify script does not import any Capacitor plugins beyond `@capacitor-community/sqlite`).

---

## 12. Security Requirements

| Requirement | Why |
|------------|-----|
| Database file is in the app's private data directory | Capacitor stores databases in the app's internal storage (`/data/data/com.collectio.app/databases/`) — restricted to the app process by Android sandboxing |
| No secrets in the verify script | No passwords, tokens, or keys. The test database is unencrypted and contains dummy data only |
| No network access | The verify script uses only the local `@capacitor-community/sqlite` plugin. No HTTP, no cloud, no Google Drive |
| No IPC to native code beyond the plugin bridge | The only native interaction is through `@capacitor-community/sqlite`'s plugin bridge — which is the subject of the verification |
| No `capacitor-secure-storage-plugin` or OAuth involvement | These are separate spike/implementation tasks. This verification is SQLite only |

---

## 13. Acceptance Criteria

### 13.1 All 12 SQ Tests

| ID | Test | SQL / Operation | Pass Condition |
|----|------|----------------|----------------|
| SQ-01 | Open connection | Initialize `SQLiteConnection`, `isConnection()` → `createConnection()`/`retrieveConnection()`, `dbConn.open()` | Database connection object returned; no exception |
| SQ-02 | Create table | `CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT NOT NULL)` | Statement executes without error |
| SQ-03 | Insert row | `INSERT INTO test (value) VALUES ('hello')` | `changes.changes === 1` (from plugin result) |
| SQ-04 | Select row | `SELECT * FROM test` | Returns `[{id: 1, value: 'hello'}]` |
| SQ-05 | Update row | `UPDATE test SET value = 'world' WHERE id = 1` | `changes.changes === 1`; SELECT confirms 'world' |
| SQ-06 | Delete row | `DELETE FROM test WHERE id = 1` | `changes.changes === 1`; SELECT returns `[]` |
| SQ-07 | Multi-insert transaction | `BEGIN; INSERT INTO test (value) VALUES ('a'); INSERT INTO test (value) VALUES ('b'); COMMIT` | Both rows committed; SELECT returns 2 rows |
| SQ-08 | Transaction rollback | `BEGIN; INSERT INTO test (value) VALUES ('a'); ROLLBACK` | No rows persisted; SELECT returns `[]` |
| SQ-09 | **FK violation (CRITICAL)** | `INSERT INTO child_table (parent_id) VALUES (999)` — parent does not exist | **Throws error. Row NOT inserted.** Double-check: `SELECT count(*) FROM child_table` returns 0 |
| SQ-10 | Valid FK insertion | `INSERT INTO parent_table (id) VALUES (1); INSERT INTO child_table (parent_id) VALUES (1)` | Insertion succeeds; `SELECT * FROM child_table` returns `[{id: 1, parent_id: 1}]` |
| SQ-11 | Data persistence | First launch: insert `persist-test` data. Kill app. Second launch: open same `collectio-verify` database | Previously committed data still present via `SELECT * FROM test` |
| SQ-12 | Integrity check | `PRAGMA integrity_check` | Returns `"ok"` |

### 13.2 SQ-09 in Detail

```
-- Enable FK enforcement (must be done via query(), not execute())
PRAGMA foreign_keys = ON;

CREATE TABLE parent_table (
    id INTEGER PRIMARY KEY
);

CREATE TABLE child_table (
    id INTEGER PRIMARY KEY,
    parent_id INTEGER REFERENCES parent_table(id)
);

-- Attempt insert with non-existent parent
INSERT INTO child_table (parent_id) VALUES (999);
```

**Expected:** The plugin throws an error (the exact error type varies: the Capacitor plugin wraps Android's `SQLiteConstraintException`). The insertion is rejected.

**Verification (double-check):** After catching the error, execute `SELECT count(*) FROM child_table`. Must return `[{ 'count(*)': 0 }]`. If count > 0, the row was silently inserted — this is a **false pass** and must be marked FAIL.

**Cleanup after SQ-09:**
```
DROP TABLE IF EXISTS child_table;
DROP TABLE IF EXISTS parent_table;
```

### 13.3 SQ-11 (Persistence) Procedure

```
FIRST LAUNCH:
  1. Run SQ-02 (CREATE TABLE test)
  2. Run SQ-03 (INSERT INTO test (value) VALUES ('persist-test'))
  3. Run SQ-12 (PRAGMA integrity_check → "ok")
  4. Close database connection
  5. Kill app (swipe from recents or Settings → Force Stop)

SECOND LAUNCH:
  1. Open same database name ('collectio-verify')
  2. Run SQ-11: SELECT * FROM test
  3. Must return [{id: 1, value: 'persist-test'}]
  4. If table does not exist → FAIL (database file was deleted)
  5. If table exists but is empty → FAIL (data was lost)
  6. If data matches → PASS
```

**Note:** The verify script automatically detects whether it's the first or second launch: if `SELECT * FROM test` returns rows before any INSERT is performed, it's the second launch and SQ-11 is verified. The script must handle both the "fresh install" case (no prior data) and the "re-launch" case (prior data exists).

### 13.4 Pass/Fail Thresholds

| Outcome | Decision |
|---------|----------|
| 12/12 PASS | Task complete. Proceed to T-02.3 |
| SQ-09 FAIL, others pass | **Critical failure.** Verify `PRAGMA foreign_keys = ON` is executed via `query()` before the FK test. Check plugin version is 6.0.2 (not 5.x or 8.x). If all configuration is correct and FK still not enforced, escalate architecture decision |
| 1–2 non-critical failures | Document. Assess whether failures are env/config issues (missing MainActivity registration, missing androidIsEncryption) |
| 3+ failures | Verification failure. Investigate root cause. Check `cap sync` was run, Gradle build succeeded, plugin is compiled into APK |
| Plugin `null` at runtime | Verify `MainActivity.java` registration, `androidIsEncryption: false`, `cap sync` was run, app was rebuilt from Android Studio |

---

## 14. Test Cases

### 14.1 Unit-Level Verification (In-Code)

Each of the 12 SQ test cases is defined as a `TestCase` object with an inline `run(db: SQLiteDBConnection): Promise<TestResult>` function. The test runner iterates in order, measuring `performance.now()` duration and catching exceptions per test. A FAIL in one test does not prevent subsequent tests from running.

### 14.2 Manual Verification Procedure

```
 1. Verify pnpm install completed — @capacitor-community/sqlite@6.0.2 is in apps/capacitor/node_modules
 2. Verify apps/capacitor/capacitor.config.ts has androidIsEncryption: false (RC-02)
 3. Verify MainActivity.java has registerPlugin(CapacitorSQLitePlugin.class) (RC-05)
 4. Verify apps/capacitor/package.json lists @capacitor-community/sqlite as direct dependency (AD-11)
 5. pnpm --filter @collectio/platform typecheck      # Verify TypeScript compiles
 6. pnpm --filter @collectio/capacitor-app build      # Build web assets
 7. npx cap sync                                       # Generate Gradle configs
 8. Open Android Studio: Build > Clean Project → Build > Rebuild Project (Rule 9.3)
 9. Connect physical Android device via USB with debugging enabled
10. Run 'app' on device
11. Observe VerifyRunner UI in WebView — all 12 tests display
12. Confirm SQ-09 status is PASS (green) — check browser console for count(*) = 0 verification
13. Kill the app (swipe from recents)
14. Re-launch the app
15. Confirm SQ-11 passes (data from first launch still present)
16. Tap "Copy JSON Report" — paste into a text file for documentation
17. Revert apps/capacitor/src/index.tsx to original content
18. pnpm --filter @collectio/platform typecheck      # Confirm clean
```

### 14.3 Gradle Sync Verification

After `cap sync`, verify `capacitor.settings.gradle` (located in `apps/capacitor/android/`) includes:
```
include ':capacitor-community-sqlite'
project(':capacitor-community-sqlite').projectDir = new File('../../../../node_modules/@capacitor-community/sqlite/android')
```

If this include is absent, `cap sync` did not detect the plugin — check AD-11 (plugin must be direct dep of `apps/capacitor/`).

### 14.4 Plugin Registration Verification

Verify `apps/capacitor/android/app/src/main/java/com/collectio/app/MainActivity.java` contains:
```java
import com.getcapacitor.community.database.sqlite.CapacitorSQLitePlugin;

@Override
public void onCreate(Bundle savedInstanceState) {
    registerPlugin(CapacitorSQLitePlugin.class);
    super.onCreate(savedInstanceState);
}
```

**Correct import:** `com.getcapacitor.community.database.sqlite.CapacitorSQLitePlugin`
**NOT:** `com.getcapacitor.community.sqlite.CapacitorSQLite`

---

## 15. Definition Of Done

- [ ] `@capacitor-community/sqlite@6.0.2` is in both `apps/capacitor/package.json` `dependencies` AND `packages/platform/package.json` `dependencies`
- [ ] `androidIsEncryption: false` is present in `apps/capacitor/capacitor.config.ts` `plugins.CapacitorSQLite`
- [ ] `registerPlugin(CapacitorSQLitePlugin.class)` is present in `MainActivity.java` before `super.onCreate()`
- [ ] `capacitor.settings.gradle` includes `capacitor-community-sqlite` after `cap sync`
- [ ] `pnpm --filter @collectio/platform typecheck` passes with zero errors
- [ ] All 12 SQ test cases pass on a physical Android device
- [ ] SQ-09 (FK enforcement) passes — the critical architecture gate
- [ ] SQ-09 is double-checked: `SELECT count(*) FROM child_table` returns 0 after failed insert
- [ ] SQ-11 (persistence) data survives app kill (swipe from recents)
- [ ] SQ-12 (`PRAGMA integrity_check`) returns `"ok"`
- [ ] React Strict Mode does not break verification (no "Connection already exists" errors)
- [ ] `VerifyReport` JSON is copyable from the "Copy Report" button
- [ ] `apps/capacitor/src/index.tsx` is reverted to its original content
- [ ] No production files were modified
- [ ] `__verify__/` directory contains only the three specified files
- [ ] Any new Capacitor-specific configuration requirements discovered during verification are documented in `06_IMPLEMENTATION_DECISIONS.md`
