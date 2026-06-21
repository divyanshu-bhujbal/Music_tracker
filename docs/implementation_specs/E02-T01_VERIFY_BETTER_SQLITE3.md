# E-02 T-01 — Verify better-sqlite3 on Electron

**Parent Epic:** E-02: Database Layer
**Type:** Verification (Platform Adapter Validation)
**Criticality:** ARCHITECTURE-GATING — this task confirms the Electron platform can enforce foreign keys, the failure that caused Option A to be rejected

---

## 1. Goal

Validate that `better-sqlite3` can perform full CRUD operations and enforce foreign key constraints in the Electron main process. Answer the single yes/no question:

> **Can better-sqlite3 — with foreign key enforcement — serve as the SQLite adapter for Electron on Windows?**

If SQ-09 (FK enforcement) fails, this task blocks the entire Option D architecture — the same failure that killed Option A.

---

## 2. Scope

| In Scope | Rationale |
|----------|-----------|
| Install `better-sqlite3` and `@types/better-sqlite3` | Dependencies already declared in `packages/platform/package.json`; `pnpm install` must complete successfully |
| Rebuild for Electron ABI if needed | `better-sqlite3` is a native Node.js addon; Electron 30 ships Node.js 20.x — the prebuilt binary may or may not match. Use `@electron/rebuild` if the module fails to load |
| Run 12 SQ test cases | Identical logical tests to E-00b T-00b.1 (CREATE, INSERT, SELECT, UPDATE, DELETE, transactions, FK enforcement, persistence, integrity) |
| FK enforcement (SQ-09) | The critical architecture gate. Must confirm `PRAGMA foreign_keys = ON` is honored |
| Database persistence | File must survive in `app.getPath('userData')` |
| `PRAGMA integrity_check` | Must return `"ok"` |
| Console-log results | The verify script runs in the Electron main process — results are logged to stdout and written to a JSON file |
| Temporary modification of `main.ts` | The verify function is invoked from the main process entry point; reverted after validation |

---

## 3. Out of Scope

| Out of Scope | Why | Where It Belongs |
|-------------|-----|-----------------|
| Async `DatabaseConnection` interface | The verify script uses `better-sqlite3`'s synchronous API directly. The async wrapper is T-02.4's concern | E-02 T-02.4 |
| Production schema (app_metadata, songs, etc.) | Verify script uses a temporary `test` table | E-02 T-02.7 (Migration 001) |
| Migration runner | No schema versioning or migration execution | E-02 T-02.6 |
| Typed repository pattern | Raw `db.prepare().run()` / `.all()` calls | E-02 T-02.9–T-02.15 |
| Capacitor SQLite comparison | This task validates Electron only. Capacitor validation is T-02.2 | E-02 T-02.2 |
| Cross-platform SQL comparison | Not comparing byte-level output between Electron and Capacitor | E-02 T-02.4 / T-02.5 |
| React UI for results display | Results logged to main process console + JSON file. No renderer involvement | N/A |
| WAL mode concurrent read/write stress test | PRAGMA set but not deeply tested | E-02 T-02.4 |
| Large dataset performance | Tests use <10 rows | E-15 T-15.7 |
| CI automation | Manual verification on Windows development machine | E-16 |

---

## 4. Files To Create

| # | File | Purpose |
|---|------|---------|
| 1 | `packages/platform/src/electron/__verify__/better-sqlite3-verify.ts` | Core verification module: opens database, runs 12 SQ tests, returns typed report |
| 2 | `packages/platform/src/electron/__verify__/better-sqlite3-types.ts` | Type definitions: `TestResult`, `TestCase`, `VerifyReport`, `SQStatus` |

---

## 5. Files To Modify

| # | File | Change | Revert After? |
|---|------|--------|---------------|
| 1 | `apps/electron/src/main.ts` | Temporarily import and invoke `runVerify()` after `createWindow()`; log results to console; write JSON report to `userData` | **YES** — revert to current content after verification passes |
| 2 | `packages/platform/package.json` | No change — `better-sqlite3` and `@types/better-sqlite3` are already declared | N/A |
| 3 | `apps/electron/package.json` | No change — `@collectio/platform` is already a dependency | N/A |

---

## 6. Interfaces

### 6.1 Type Definitions (`better-sqlite3-types.ts`)

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
  taskId: 'E-02-T-02.1'
  platform: 'electron-windows'
  packageName: 'better-sqlite3'
  packageVersion: string
  electronVersion: string
  nodeVersion: string
  dbPath: string
  tests: TestResult[]
  passed: number
  failed: number
  errored: number
  criticalFailed: boolean   // true if SQ-09 FAIL or ERROR
  timestamp: string         // ISO-8601
}
```

### 6.2 Verify Function (`better-sqlite3-verify.ts`)

**Exported function:**

```
runVerify(dbPath: string): VerifyReport
```

**Contract:**
- Takes a filesystem path to the database file
- Creates/opens the database using `better-sqlite3`
- Executes `PRAGMA foreign_keys = ON`, `PRAGMA journal_mode = WAL`, `PRAGMA synchronous = NORMAL`, `PRAGMA busy_timeout = 5000`
- Runs all 12 test cases in sequence
- Each test case: measure duration, capture result, handle errors gracefully (a FAIL in one test does not prevent subsequent tests from running)
- Closes the database connection
- Returns a `VerifyReport` with all results
- Does NOT delete the database file (the persistence test SQ-11 needs it to survive)
- Does NOT import Electron APIs — the `dbPath` parameter is passed from `main.ts`

**Internal test case structure:**

```
TestCases = [
  { id: 'SQ-01', description: 'Open database connection', ... },
  { id: 'SQ-02', description: 'Create table', ... },
  ...
]
```

Each test case's `run(db)` function receives an open `better-sqlite3.Database` instance.

---

## 7. Data Flow

```
main.ts (Electron main process)
  │
  ├─ app.getPath('userData') → dbPath
  │
  ├─ import { runVerify } from '@platform/electron/__verify__/better-sqlite3-verify'
  │
  ├─ const report = runVerify(dbPath)
  │
  ├─ console.log(formatted results)
  │
  └─ fs.writeFileSync(join(dbPath, 'verify-report.json'), JSON.stringify(report, null, 2))
```

**No renderer involvement.** The verify script runs entirely in the Electron main process. No IPC, no context bridge, no React components. Results are observable via:
1. Main process console output (`stdout`)
2. `verify-report.json` written to `userData` directory

---

## 8. State Changes

| State | Before Verify | After Verify |
|-------|--------------|-------------|
| `userData` directory | May or may not exist | Created by SQLite if needed |
| Database file (`collectio-verify.db`) | Does not exist | Created, contains test tables and data |
| `verify-report.json` | Does not exist | Written with full test results |

All state is temporary. The verify database file and report are left in `userData` for inspection. The production database uses a different filename (`collectio.db`).

---

## 9. Database Changes

**None in production.** The verification uses a separate database file named `collectio-verify.db` in Electron's `userData` directory.

Tables created during verification (all temporary):
- `test` — simple key-value table for SQ-02 through SQ-08, SQ-11, SQ-12
- `parent_table` / `child_table` — for FK enforcement tests SQ-09 and SQ-10

All tables are created and dropped within the verification run. The database file is left on disk for post-mortem inspection but is not the production database.

---

## 10. Error Handling

### 10.1 Error Classification

| Error Type | Detection | Handling |
|-----------|-----------|----------|
| Native addon load failure (`better-sqlite3` cannot be required) | `require('better-sqlite3')` throws | Catch, log the error, abort verify. Instruct user to run `npx @electron/rebuild -f -w better-sqlite3` |
| Database open failure | `new Database(dbPath)` throws | Catch, log, mark all subsequent tests as ERROR with message "Database not available" |
| SQL execution error (expected for SQ-09) | `db.prepare().run()` throws | Catch, check if this is SQ-09 (FK violation — expected). If expected: mark PASS. If unexpected: mark FAIL |
| SQL execution error (unexpected) | `db.prepare().run()` throws on non-SQ-09 test | Catch, mark test as FAIL, log the error message |
| `userData` path inaccessible | `app.getPath('userData')` throws | Handled by `main.ts` before calling `runVerify()` |

### 10.2 Per-Test Isolation

Each test case MUST:
- Run in its own try/catch block
- NOT prevent subsequent tests from executing on failure
- Clean up its own data where possible (DROP TABLE before CREATE)
- Report an explicit `TestResult` regardless of outcome

### 10.3 ABI Mismatch Recovery

If `better-sqlite3` fails to load with an error containing `NODE_MODULE_VERSION` or `The specified module could not be found`:

1. Document the error in the verify report
2. Instruct: `npx @electron/rebuild -f -w better-sqlite3`
3. Re-run verify after rebuild succeeds

---

## 11. Logging Requirements

### 11.1 Console Output Format

```
=== E-02 T-01: better-sqlite3 Verification ===
Electron: 30.5.1
Node: v20.x.x
better-sqlite3: 12.11.1
Database: C:\Users\...\AppData\Roaming\Collectio\collectio-verify.db

SQ-01: PASS — Open database connection — 3ms
SQ-02: PASS — Create table — 2ms
SQ-03: PASS — Insert row — 1ms
SQ-04: PASS — Select row — 1ms
SQ-05: PASS — Update row — 1ms
SQ-06: PASS — Delete row — 1ms
SQ-07: PASS — Transaction commit — 2ms
SQ-08: PASS — Transaction rollback — 1ms
SQ-09: PASS — FK violation rejected — 1ms  ← CRITICAL
SQ-10: PASS — Valid FK inserted — 1ms
SQ-11: PASS — Data persistence — 5ms
SQ-12: PASS — Integrity check — 2ms

Result: 12/12 passed. 0 failed. 0 errors.
Critical FK test: PASS
Report written to: C:\Users\...\AppData\Roaming\Collectio\verify-report.json
```

### 11.2 JSON Report

The `verify-report.json` file contains the complete `VerifyReport` object as formatted JSON. This is the canonical record of the verification run.

---

## 12. Security Requirements

| Requirement | Why |
|------------|-----|
| Database file must NOT be in a world-readable location | `app.getPath('userData')` resolves to `%APPDATA%/Collectio` — restricted to the current Windows user by OS permissions |
| No secrets in the verify script | No passwords, tokens, or keys are used. The test database is unencrypted and contains dummy data only |
| No network access | The verify script uses only local filesystem and `better-sqlite3`. No HTTP, no cloud |
| No IPC to renderer | The verify script runs entirely in the main process. No exposed API surface |

---

## 13. Acceptance Criteria

### 13.1 All 12 SQ Tests

| ID | Test | SQL / Operation | Pass Condition |
|----|------|----------------|----------------|
| SQ-01 | Open connection | `new Database(dbPath)` | Database object returned; no exception |
| SQ-02 | Create table | `CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT NOT NULL)` | Statement executes without error |
| SQ-03 | Insert row | `INSERT INTO test (value) VALUES ('hello')` | `changes` = 1 |
| SQ-04 | Select row | `SELECT * FROM test` | Returns `[{id: 1, value: 'hello'}]` |
| SQ-05 | Update row | `UPDATE test SET value = 'world' WHERE id = 1` | `changes` = 1; SELECT confirms 'world' |
| SQ-06 | Delete row | `DELETE FROM test WHERE id = 1` | `changes` = 1; SELECT returns `[]` |
| SQ-07 | Multi-insert transaction | `BEGIN; INSERT ...; INSERT ...; COMMIT` | Both rows committed; SELECT returns 2 |
| SQ-08 | Transaction rollback | `BEGIN; INSERT ...; ROLLBACK` | No rows persisted; SELECT returns `[]` |
| SQ-09 | **FK violation (CRITICAL)** | `INSERT INTO child_table (parent_id) VALUES (999)` — parent does not exist | **Throws error. Row NOT inserted.** |
| SQ-10 | Valid FK insertion | `INSERT INTO parent ...; INSERT INTO child ...` | Insertion succeeds |
| SQ-11 | Data persistence | Kill process, relaunch, SELECT | Previously committed data still present |
| SQ-12 | Integrity check | `PRAGMA integrity_check` | Returns `"ok"` |

### 13.2 SQ-09 in Detail

```
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

**Expected:** `better-sqlite3` throws `SqliteError` with code `SQLITE_CONSTRAINT_FOREIGNKEY`. The insertion is rejected.

**Verification (double-check):** After the error, execute `SELECT count(*) FROM child_table`. Must return `[{ 'count(*)': 0 }]`. If count > 0, the row was silently inserted — this is a **false pass** and must be marked FAIL.

### 13.3 SQ-11 (Persistence) Procedure

```
Run 1:
  1. Execute SQ-02 (CREATE TABLE test)
  2. Execute SQ-03 (INSERT INTO test (value) VALUES ('persist-test'))
  3. Close database
  4. Exit Electron process

Run 2:
  1. Open same database file
  2. SELECT * FROM test
  3. Must return [{id: 1, value: 'persist-test'}]
```

### 13.4 Pass/Fail Thresholds

| Outcome | Decision |
|---------|----------|
| 12/12 PASS | Task complete. Proceed to T-02.3 |
| SQ-09 FAIL, others pass | **Critical failure.** Investigate `better-sqlite3` configuration. If `PRAGMA foreign_keys = ON` is confirmed but FK still not enforced, escalate architecture decision |
| 1–2 non-critical failures | Document. Assess whether failures are env/config issues |
| 3+ failures | Spike failure. Investigate root cause |
| `better-sqlite3` fails to load | Run `@electron/rebuild`. If rebuild fails, escalate |

---

## 14. Test Cases

### 14.1 Unit-Level Verification (in-code)

Each of the 12 SQ test cases is defined as a `TestCase` object with an inline `run(db: Database): TestResult` function. The test runner iterates in order, measuring duration and catching exceptions per test.

### 14.2 Manual Verification Procedure

```
1. pnpm install                    # Install better-sqlite3 + compile native addon
2. pnpm --filter @collectio/platform typecheck  # Verify TypeScript compiles
3. Temporarily modify apps/electron/src/main.ts (see Section 5)
4. pnpm --filter @collectio/electron-app dev     # Launch Electron in dev mode
5. Observe console output for 12/12 PASS
6. Open verify-report.json in userData
7. Verify SQ-09 status is PASS with count(*) = 0
8. Close Electron
9. Re-launch (pnpm dev again) to verify SQ-11 persistence
10. Revert main.ts to original content
11. pnpm --filter @collectio/platform typecheck  # Confirm clean
```

### 14.3 ABI Mismatch Procedure

If step 4 fails with native module load error:

```
a. npx @electron/rebuild -f -w better-sqlite3
b. Re-run from step 4
```

---

## 15. Definition Of Done

- [ ] `pnpm install` completes with `better-sqlite3` native addon compiled
- [ ] `pnpm --filter @collectio/platform typecheck` passes with zero errors
- [ ] All 12 SQ test cases pass on Windows (Electron 30, Node.js 20.x)
- [ ] SQ-09 (FK enforcement) passes — the critical architecture gate
- [ ] SQ-09 is double-checked: `SELECT count(*) FROM child_table` returns 0 after failed insert
- [ ] SQ-11 (persistence) data survives app restart
- [ ] SQ-12 (`PRAGMA integrity_check`) returns `"ok"`
- [ ] `verify-report.json` is written to `userData` with all test results
- [ ] `main.ts` is reverted to its original content
- [ ] Any Electron-specific configuration requirements (native addon rebuild steps) are documented in this spec or `06_IMPLEMENTATION_DECISIONS.md`
- [ ] No production files were modified
- [ ] `__verify__/` directory contains only the two specified files
