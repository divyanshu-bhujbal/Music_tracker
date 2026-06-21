import { SQLiteConnection } from '@capacitor-community/sqlite';
import { CapacitorSQLite } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
import type { SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { TestResult, VerifyReport } from './capacitor-sqlite-types.js';

interface ExecResult {
  changes?: { changes?: number };
}

interface QueryResult {
  values?: Record<string, unknown>[];
}

function getCapacitorVersion(): string {
  try {
    const c = Capacitor as unknown as { version?: string };
    return c.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function getPackageVersion(): string {
  try {
    const sqlite = CapacitorSQLite as unknown as { version?: string };
    return sqlite.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function getWebViewVersion(): string {
  try {
    return navigator.userAgent;
  } catch {
    return 'unknown';
  }
}

function logTest(r: TestResult): void {
  console.log(
    `${r.id}: ${r.status} — ${r.description} — ${r.durationMs.toFixed(1)}ms`,
  );
}

async function getChanges(result: ExecResult): Promise<number> {
  return result.changes?.changes ?? 0;
}

async function runVerify(dbName: string): Promise<VerifyReport> {
  const tests: TestResult[] = [];
  const timestamp = new Date().toISOString();

  const sqlite = new SQLiteConnection(CapacitorSQLite);
  let dbConn: SQLiteDBConnection | undefined;

  // --- SQ-01: Open connection ---
  const sq01Start = performance.now();
  try {
    const existing = await sqlite.isConnection(dbName, false);
    if (existing.result) {
      dbConn = await sqlite.retrieveConnection(dbName, false);
    } else {
      dbConn = await sqlite.createConnection(dbName, false, 'no-encryption', 1, false);
    }
    await dbConn.open();
    tests.push({
      id: 'SQ-01',
      description: 'Open database connection',
      status: 'PASS',
      expected: 'Database connection object returned; no exception',
      actual: 'Connection opened',
      durationMs: performance.now() - sq01Start,
    });
    logTest(tests[tests.length - 1]);
  } catch (err) {
    tests.push({
      id: 'SQ-01',
      description: 'Open database connection',
      status: 'ERROR',
      expected: 'Database connection object returned; no exception',
      actual: 'Failed to open connection',
      durationMs: performance.now() - sq01Start,
      error: err instanceof Error ? err.message : String(err),
    });
    logTest(tests[tests.length - 1]);
    return buildReport(dbName, tests, timestamp);
  }

  // --- Setup PRAGMAs via query() (Rule 4.1) ---
  try {
    await dbConn.query('PRAGMA foreign_keys = ON');
    await dbConn.query('PRAGMA journal_mode = WAL');
    await dbConn.query('PRAGMA synchronous = NORMAL');
    await dbConn.query('PRAGMA busy_timeout = 5000');
  } catch (err) {
    tests.push({
      id: 'SQ-PRAGMA',
      description: 'PRAGMA setup',
      status: 'ERROR',
      expected: 'All PRAGMAs execute without error',
      actual: 'PRAGMA setup failed',
      durationMs: 0,
      error: err instanceof Error ? err.message : String(err),
    });
    logTest(tests[tests.length - 1]);
    await cleanupConnection(sqlite, dbConn, dbName);
    return buildReport(dbName, tests, timestamp);
  }

  // --- SQ-02: Create table ---
  tests.push(await testSQ02(dbConn));
  logTest(tests[tests.length - 1]);

  // --- SQ-03: Insert row ---
  tests.push(await testSQ03(dbConn));
  logTest(tests[tests.length - 1]);

  // --- SQ-04: Select row ---
  tests.push(await testSQ04(dbConn));
  logTest(tests[tests.length - 1]);

  // --- SQ-05: Update row ---
  tests.push(await testSQ05(dbConn));
  logTest(tests[tests.length - 1]);

  // --- SQ-06: Delete row ---
  tests.push(await testSQ06(dbConn));
  logTest(tests[tests.length - 1]);

  // --- SQ-07: Transaction commit ---
  tests.push(await testSQ07(dbConn));
  logTest(tests[tests.length - 1]);

  // --- SQ-08: Transaction rollback ---
  tests.push(await testSQ08(dbConn));
  logTest(tests[tests.length - 1]);

  // --- SQ-09: FK violation (CRITICAL) ---
  tests.push(await testSQ09(dbConn));
  logTest(tests[tests.length - 1]);

  // --- SQ-10: Valid FK inserted ---
  tests.push(await testSQ10(dbConn));
  logTest(tests[tests.length - 1]);

  // --- SQ-11: Data persistence ---
  tests.push(await testSQ11(dbConn));
  logTest(tests[tests.length - 1]);

  // --- SQ-12: Integrity check ---
  tests.push(await testSQ12(dbConn));
  logTest(tests[tests.length - 1]);

  // --- Cleanup connection ---
  await cleanupConnection(sqlite, dbConn, dbName);

  return buildReport(dbName, tests, timestamp);
}

async function cleanupConnection(
  sqlite: SQLiteConnection,
  dbConn: SQLiteDBConnection | undefined,
  dbName: string,
): Promise<void> {
  try {
    if (dbConn) await dbConn.close();
  } catch {
    // ignore close errors
  }
  try {
    await sqlite.closeConnection(dbName, false);
  } catch {
    // ignore close errors
  }
}

function buildReport(
  dbName: string,
  tests: TestResult[],
  timestamp: string,
): VerifyReport {
  let passed = 0;
  let failed = 0;
  let errored = 0;
  let criticalFailed = false;

  for (const r of tests) {
    if (r.status === 'PASS') passed++;
    else if (r.status === 'FAIL') failed++;
    else errored++;
    if (r.id === 'SQ-09' && r.status !== 'PASS') criticalFailed = true;
  }

  return {
    taskId: 'E-02-T-02.2',
    platform: 'capacitor-android',
    packageName: '@capacitor-community/sqlite',
    packageVersion: getPackageVersion(),
    capacitorVersion: getCapacitorVersion(),
    webViewVersion: getWebViewVersion(),
    dbName,
    tests,
    passed,
    failed,
    errored,
    criticalFailed,
    timestamp,
  };
}

// ============================================================
// Individual test functions
// ============================================================

async function testSQ02(db: SQLiteDBConnection): Promise<TestResult> {
  const start = performance.now();
  try {
    await db.execute('DROP TABLE IF EXISTS test', false);
    await db.execute(
      'CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT NOT NULL)',
      false,
    );
    return {
      id: 'SQ-02',
      description: 'Create table',
      status: 'PASS',
      expected: 'Statement executes without error',
      actual: 'Table created',
      durationMs: performance.now() - start,
    };
  } catch (err) {
    return {
      id: 'SQ-02',
      description: 'Create table',
      status: 'FAIL',
      expected: 'Statement executes without error',
      actual: 'Exception thrown',
      durationMs: performance.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function testSQ03(db: SQLiteDBConnection): Promise<TestResult> {
  const start = performance.now();
  try {
    const result = (await db.execute(
      "INSERT INTO test (value) VALUES ('hello')",
      false,
    )) as ExecResult;
    const changes = await getChanges(result);
    return {
      id: 'SQ-03',
      description: 'Insert row',
      status: changes === 1 ? 'PASS' : 'FAIL',
      expected: 'changes = 1',
      actual: `changes = ${changes}`,
      durationMs: performance.now() - start,
    };
  } catch (err) {
    return {
      id: 'SQ-03',
      description: 'Insert row',
      status: 'FAIL',
      expected: 'changes = 1',
      actual: 'Exception thrown',
      durationMs: performance.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function testSQ04(db: SQLiteDBConnection): Promise<TestResult> {
  const start = performance.now();
  try {
    const result = (await db.query('SELECT * FROM test')) as QueryResult;
    const rows = result.values ?? [];
    const pass =
      rows.length === 1 &&
      (rows[0] as Record<string, unknown>)?.id === 1 &&
      (rows[0] as Record<string, unknown>)?.value === 'hello';
    return {
      id: 'SQ-04',
      description: 'Select row',
      status: pass ? 'PASS' : 'FAIL',
      expected: "Returns [{id: 1, value: 'hello'}]",
      actual: JSON.stringify(rows),
      durationMs: performance.now() - start,
    };
  } catch (err) {
    return {
      id: 'SQ-04',
      description: 'Select row',
      status: 'FAIL',
      expected: "Returns [{id: 1, value: 'hello'}]",
      actual: 'Exception thrown',
      durationMs: performance.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function testSQ05(db: SQLiteDBConnection): Promise<TestResult> {
  const start = performance.now();
  try {
    const result = (await db.execute(
      "UPDATE test SET value = 'world' WHERE id = 1",
      false,
    )) as ExecResult;
    const changes = await getChanges(result);
    const qResult = (await db.query('SELECT * FROM test')) as QueryResult;
    const rows = qResult.values ?? [];
    const val = (rows[0] as Record<string, unknown>)?.value;
    const pass = changes === 1 && rows.length === 1 && val === 'world';
    return {
      id: 'SQ-05',
      description: 'Update row',
      status: pass ? 'PASS' : 'FAIL',
      expected: "changes = 1; SELECT confirms 'world'",
      actual: `changes = ${changes}; rows = ${JSON.stringify(rows)}`,
      durationMs: performance.now() - start,
    };
  } catch (err) {
    return {
      id: 'SQ-05',
      description: 'Update row',
      status: 'FAIL',
      expected: "changes = 1; SELECT confirms 'world'",
      actual: 'Exception thrown',
      durationMs: performance.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function testSQ06(db: SQLiteDBConnection): Promise<TestResult> {
  const start = performance.now();
  try {
    const result = (await db.execute(
      'DELETE FROM test WHERE id = 1',
      false,
    )) as ExecResult;
    const changes = await getChanges(result);
    const qResult = (await db.query('SELECT * FROM test')) as QueryResult;
    const rows = qResult.values ?? [];
    const pass = changes === 1 && rows.length === 0;
    return {
      id: 'SQ-06',
      description: 'Delete row',
      status: pass ? 'PASS' : 'FAIL',
      expected: 'changes = 1; SELECT returns []',
      actual: `changes = ${changes}; rows = ${JSON.stringify(rows)}`,
      durationMs: performance.now() - start,
    };
  } catch (err) {
    return {
      id: 'SQ-06',
      description: 'Delete row',
      status: 'FAIL',
      expected: 'changes = 1; SELECT returns []',
      actual: 'Exception thrown',
      durationMs: performance.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function testSQ07(db: SQLiteDBConnection): Promise<TestResult> {
  const start = performance.now();
  try {
    await db.beginTransaction();
    await db.execute("INSERT INTO test (value) VALUES ('tx1')", false);
    await db.execute("INSERT INTO test (value) VALUES ('tx2')", false);
    await db.commitTransaction();
    const qResult = (await db.query('SELECT * FROM test')) as QueryResult;
    const rows = qResult.values ?? [];
    return {
      id: 'SQ-07',
      description: 'Transaction commit',
      status: rows.length === 2 ? 'PASS' : 'FAIL',
      expected: 'Both rows committed; SELECT returns 2',
      actual: `rows = ${rows.length}`,
      durationMs: performance.now() - start,
    };
  } catch (err) {
    return {
      id: 'SQ-07',
      description: 'Transaction commit',
      status: 'FAIL',
      expected: 'Both rows committed; SELECT returns 2',
      actual: 'Exception thrown',
      durationMs: performance.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function testSQ08(db: SQLiteDBConnection): Promise<TestResult> {
  const start = performance.now();
  try {
    await db.execute('DELETE FROM test', false);
    await db.beginTransaction();
    await db.execute("INSERT INTO test (value) VALUES ('rollback-me')", false);
    await db.rollbackTransaction();
    const qResult = (await db.query('SELECT * FROM test')) as QueryResult;
    const rows = qResult.values ?? [];
    return {
      id: 'SQ-08',
      description: 'Transaction rollback',
      status: rows.length === 0 ? 'PASS' : 'FAIL',
      expected: 'No rows persisted; SELECT returns []',
      actual: `rows = ${rows.length}`,
      durationMs: performance.now() - start,
    };
  } catch (err) {
    return {
      id: 'SQ-08',
      description: 'Transaction rollback',
      status: 'FAIL',
      expected: 'No rows persisted; SELECT returns []',
      actual: 'Exception thrown',
      durationMs: performance.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function testSQ09(db: SQLiteDBConnection): Promise<TestResult> {
  const start = performance.now();
  try {
    await db.execute('DROP TABLE IF EXISTS child_table', false);
    await db.execute('DROP TABLE IF EXISTS parent_table', false);
    await db.execute(
      'CREATE TABLE parent_table (id INTEGER PRIMARY KEY)',
      false,
    );
    await db.execute(
      'CREATE TABLE child_table (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent_table(id))',
      false,
    );

    let fkViolationDetected = false;
    try {
      await db.execute(
        'INSERT INTO child_table (parent_id) VALUES (999)',
        false,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fkViolationDetected =
        msg.includes('FOREIGN KEY') ||
        msg.includes('SQLITE_CONSTRAINT') ||
        msg.includes('constraint');
    }

    const countResult = (await db.query(
      'SELECT count(*) as cnt FROM child_table',
    )) as QueryResult;
    const countRow = (countResult.values ?? [])[0] as
      | Record<string, unknown>
      | undefined;
    const count = (countRow?.cnt as number) ?? -1;
    const countIsZero = count === 0;
    const pass = fkViolationDetected && countIsZero;

    await db.execute('DROP TABLE IF EXISTS child_table', false);
    await db.execute('DROP TABLE IF EXISTS parent_table', false);

    return {
      id: 'SQ-09',
      description: 'FK violation rejected',
      status: pass ? 'PASS' : 'FAIL',
      expected: 'Insert throws error; row NOT inserted; count(*) = 0',
      actual: `fkViolation=${fkViolationDetected}, count=${count}`,
      durationMs: performance.now() - start,
    };
  } catch (err) {
    return {
      id: 'SQ-09',
      description: 'FK violation rejected',
      status: 'FAIL',
      expected: 'Insert throws error; row NOT inserted; count(*) = 0',
      actual: 'Unexpected exception',
      durationMs: performance.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function testSQ10(db: SQLiteDBConnection): Promise<TestResult> {
  const start = performance.now();
  try {
    await db.execute(
      'CREATE TABLE IF NOT EXISTS parent_table (id INTEGER PRIMARY KEY)',
      false,
    );
    await db.execute(
      'CREATE TABLE IF NOT EXISTS child_table (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent_table(id))',
      false,
    );
    await db.execute('INSERT INTO parent_table (id) VALUES (1)', false);
    await db.execute(
      'INSERT INTO child_table (parent_id) VALUES (1)',
      false,
    );
    const qResult = (await db.query(
      'SELECT * FROM child_table WHERE parent_id = 1',
    )) as QueryResult;
    const rows = qResult.values ?? [];
    const row = rows[0] as Record<string, unknown> | undefined;
    const pass = row !== undefined && row.parent_id === 1;

    await db.execute('DROP TABLE IF EXISTS child_table', false);
    await db.execute('DROP TABLE IF EXISTS parent_table', false);

    return {
      id: 'SQ-10',
      description: 'Valid FK inserted',
      status: pass ? 'PASS' : 'FAIL',
      expected: 'Insertion succeeds',
      actual: pass
        ? `Row inserted: id=${row?.id}, parent_id=${row?.parent_id}`
        : 'Row not found',
      durationMs: performance.now() - start,
    };
  } catch (err) {
    return {
      id: 'SQ-10',
      description: 'Valid FK inserted',
      status: 'FAIL',
      expected: 'Insertion succeeds',
      actual: 'Exception thrown',
      durationMs: performance.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function testSQ11(db: SQLiteDBConnection): Promise<TestResult> {
  const start = performance.now();
  try {
    // Try to read persisted data — handle "no such table" as first launch
    let existingRows: Record<string, unknown>[] = [];
    try {
      const checkResult = (await db.query(
        'SELECT * FROM sq11_persist',
      )) as QueryResult;
      existingRows = checkResult.values ?? [];
    } catch (checkErr) {
      const msg =
        checkErr instanceof Error ? checkErr.message : String(checkErr);
      if (!msg.includes('no such table')) {
        throw checkErr;
      }
    }

    if (existingRows.length > 0) {
      // Second launch — verify persisted data
      const row = existingRows[0] as Record<string, unknown>;
      const pass =
        existingRows.length === 1 && row.value === 'persist-test';
      return {
        id: 'SQ-11',
        description: 'Data persistence',
        status: pass ? 'PASS' : 'FAIL',
        expected: 'Previously committed data still present',
        actual: `rows = ${JSON.stringify(existingRows)}`,
        durationMs: performance.now() - start,
      };
    }

    // First launch — write data for persistence test (uses dedicated table
    // that SQ-02's DROP TABLE IF EXISTS test won't touch)
    await db.execute(
      'CREATE TABLE sq11_persist (id INTEGER PRIMARY KEY, value TEXT NOT NULL)',
      false,
    );
    await db.execute(
      "INSERT INTO sq11_persist (value) VALUES ('persist-test')",
      false,
    );
    const qResult = (await db.query(
      'SELECT * FROM sq11_persist',
    )) as QueryResult;
    const rows = qResult.values ?? [];
    const pass =
      rows.length === 1 &&
      (rows[0] as Record<string, unknown>)?.value === 'persist-test';
    return {
      id: 'SQ-11',
      description: 'Data persistence',
      status: pass ? 'PASS' : 'FAIL',
      expected: 'Data written for future persistence check',
      actual: `rows = ${JSON.stringify(rows)}`,
      durationMs: performance.now() - start,
    };
  } catch (err) {
    return {
      id: 'SQ-11',
      description: 'Data persistence',
      status: 'FAIL',
      expected: 'Previously committed data still present',
      actual: 'Exception thrown',
      durationMs: performance.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function testSQ12(db: SQLiteDBConnection): Promise<TestResult> {
  const start = performance.now();
  try {
    const result = (await db.query('PRAGMA integrity_check')) as QueryResult;
    const rows = result.values ?? [];
    const row = rows[0] as Record<string, unknown> | undefined;
    // The PRAGMA result comes as { integrity_check: 'ok' } or similar
    const value = row?.integrity_check ?? row?.['PRAGMA integrity_check'] ?? Object.values(row ?? {})[0];
    const pass = value === 'ok';
    return {
      id: 'SQ-12',
      description: 'Integrity check',
      status: pass ? 'PASS' : 'FAIL',
      expected: 'Returns "ok"',
      actual: `Returns "${String(value)}"`,
      durationMs: performance.now() - start,
    };
  } catch (err) {
    return {
      id: 'SQ-12',
      description: 'Integrity check',
      status: 'FAIL',
      expected: 'Returns "ok"',
      actual: 'Exception thrown',
      durationMs: performance.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export { runVerify };
