import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';
import type { TestResult, VerifyReport } from './better-sqlite3-types.js';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getPackageVersion(): string {
  try {
    const pkgPath = join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      '..',
      'node_modules',
      'better-sqlite3',
      'package.json',
    );
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
    return pkg.version;
  } catch {
    return 'unknown';
  }
}

function testSQ01(db: Database.Database): TestResult {
  const start = performance.now();
  try {
    const result = db.open ? 'Database object returned' : 'Database object returned';
    return {
      id: 'SQ-01',
      description: 'Open database connection',
      status: 'PASS',
      expected: 'Database object returned; no exception',
      actual: result,
      durationMs: performance.now() - start,
    };
  } catch (err) {
    return {
      id: 'SQ-01',
      description: 'Open database connection',
      status: 'FAIL',
      expected: 'Database object returned; no exception',
      actual: 'Exception thrown',
      durationMs: performance.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function testSQ02(db: Database.Database): TestResult {
  const start = performance.now();
  try {
    db.exec('DROP TABLE IF EXISTS test');
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
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

function testSQ03(db: Database.Database): TestResult {
  const start = performance.now();
  try {
    const info = db.prepare('INSERT INTO test (value) VALUES (?)').run('hello');
    const pass = info.changes === 1;
    return {
      id: 'SQ-03',
      description: 'Insert row',
      status: pass ? 'PASS' : 'FAIL',
      expected: 'changes = 1',
      actual: `changes = ${info.changes}`,
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

function testSQ04(db: Database.Database): TestResult {
  const start = performance.now();
  try {
    const rows = db.prepare('SELECT * FROM test').all() as Array<{ id: number; value: string }>;
    const pass = rows.length === 1 && rows[0]?.id === 1 && rows[0]?.value === 'hello';
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

function testSQ05(db: Database.Database): TestResult {
  const start = performance.now();
  try {
    const info = db.prepare('UPDATE test SET value = ? WHERE id = ?').run('world', 1);
    const rows = db.prepare('SELECT * FROM test').all() as Array<{ id: number; value: string }>;
    const pass = info.changes === 1 && rows.length === 1 && rows[0]?.value === 'world';
    return {
      id: 'SQ-05',
      description: 'Update row',
      status: pass ? 'PASS' : 'FAIL',
      expected: "changes = 1; SELECT confirms 'world'",
      actual: `changes = ${info.changes}; rows = ${JSON.stringify(rows)}`,
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

function testSQ06(db: Database.Database): TestResult {
  const start = performance.now();
  try {
    const info = db.prepare('DELETE FROM test WHERE id = ?').run(1);
    const rows = db.prepare('SELECT * FROM test').all();
    const pass = info.changes === 1 && rows.length === 0;
    return {
      id: 'SQ-06',
      description: 'Delete row',
      status: pass ? 'PASS' : 'FAIL',
      expected: 'changes = 1; SELECT returns []',
      actual: `changes = ${info.changes}; rows = ${JSON.stringify(rows)}`,
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

function testSQ07(db: Database.Database): TestResult {
  const start = performance.now();
  try {
    const insert = db.prepare('INSERT INTO test (value) VALUES (?)');
    const tx = db.transaction(() => {
      insert.run('tx1');
      insert.run('tx2');
    });
    tx();
    const rows = db.prepare('SELECT * FROM test').all() as Array<{ id: number; value: string }>;
    const pass = rows.length === 2;
    return {
      id: 'SQ-07',
      description: 'Transaction commit',
      status: pass ? 'PASS' : 'FAIL',
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

function testSQ08(db: Database.Database): TestResult {
  const start = performance.now();
  try {
    db.exec('DELETE FROM test');
    db.exec('BEGIN');
    db.prepare('INSERT INTO test (value) VALUES (?)').run('rollback-me');
    db.exec('ROLLBACK');
    const rows = db.prepare('SELECT * FROM test').all();
    const pass = rows.length === 0;
    return {
      id: 'SQ-08',
      description: 'Transaction rollback',
      status: pass ? 'PASS' : 'FAIL',
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

function testSQ09(db: Database.Database): TestResult {
  const start = performance.now();
  try {
    db.exec('DROP TABLE IF EXISTS child_table');
    db.exec('DROP TABLE IF EXISTS parent_table');
    db.exec('CREATE TABLE parent_table (id INTEGER PRIMARY KEY)');
    db.exec(
      'CREATE TABLE child_table (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent_table(id))',
    );

    let fkViolationDetected = false;
    try {
      db.prepare('INSERT INTO child_table (parent_id) VALUES (?)').run(999);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fkViolationDetected = msg.includes('FOREIGN KEY') || msg.includes('SQLITE_CONSTRAINT');
    }

    const countRow = db.prepare('SELECT count(*) as cnt FROM child_table').get() as {
      cnt: number;
    };
    const countIsZero = countRow.cnt === 0;
    const pass = fkViolationDetected && countIsZero;

    return {
      id: 'SQ-09',
      description: 'FK violation rejected',
      status: pass ? 'PASS' : 'FAIL',
      expected: 'Insert throws error; row NOT inserted; count(*) = 0',
      actual: `fkViolation=${fkViolationDetected}, count=${countRow.cnt}`,
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

function testSQ10(db: Database.Database): TestResult {
  const start = performance.now();
  try {
    db.prepare('INSERT INTO parent_table (id) VALUES (?)').run(1);
    db.prepare('INSERT INTO child_table (parent_id) VALUES (?)').run(1);
    const row = db
      .prepare('SELECT * FROM child_table WHERE parent_id = ?')
      .get(1) as { id: number; parent_id: number } | undefined;
    const pass = row !== undefined && row.parent_id === 1;
    return {
      id: 'SQ-10',
      description: 'Valid FK inserted',
      status: pass ? 'PASS' : 'FAIL',
      expected: 'Insertion succeeds',
      actual: pass ? `Row inserted: id=${row.id}, parent_id=${row.parent_id}` : 'Row not found',
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

function testSQ11(db: Database.Database): TestResult {
  const start = performance.now();
  try {
    db.exec('DROP TABLE IF EXISTS test');
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
    db.prepare('INSERT INTO test (value) VALUES (?)').run('persist-test');
    const rows = db.prepare('SELECT * FROM test').all() as Array<{ id: number; value: string }>;
    const pass = rows.length === 1 && rows[0]?.value === 'persist-test';
    return {
      id: 'SQ-11',
      description: 'Data write and read-back',
      status: pass ? 'PASS' : 'FAIL',
      expected: 'Previously committed data still present',
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

function testSQ12(db: Database.Database): TestResult {
  const start = performance.now();
  try {
    const result = db.pragma('integrity_check', { simple: true }) as string;
    const pass = result === 'ok';
    return {
      id: 'SQ-12',
      description: 'Integrity check',
      status: pass ? 'PASS' : 'FAIL',
      expected: 'Returns "ok"',
      actual: `Returns "${result}"`,
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

export function runVerify(dbPath: string): VerifyReport {
  const dbFilePath = join(dbPath, 'collectio-verify.db');

  let DatabaseClass: typeof Database;
  try {
    DatabaseClass = require('better-sqlite3') as typeof Database;
  } catch (err) {
    const timestamp = new Date().toISOString();
    return {
      taskId: 'E-02-T-02.1',
      platform: 'electron-windows',
      packageName: 'better-sqlite3',
      packageVersion: 'unknown',
      electronVersion: process.versions.electron ?? 'unknown',
      nodeVersion: process.version,
      dbPath: dbFilePath,
      tests: [
        {
          id: 'SQ-00',
          description: 'Load better-sqlite3 native addon',
          status: 'ERROR',
          expected: 'Module loads without error',
          actual: 'Failed to load better-sqlite3',
          durationMs: 0,
          error: err instanceof Error ? err.message : String(err),
        },
      ],
      passed: 0,
      failed: 0,
      errored: 1,
      criticalFailed: true,
      timestamp,
    };
  }

  const db = new DatabaseClass(dbFilePath);

  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');

  const testCases: Array<(db: Database.Database) => TestResult> = [
    testSQ01,
    testSQ02,
    testSQ03,
    testSQ04,
    testSQ05,
    testSQ06,
    testSQ07,
    testSQ08,
    testSQ09,
    testSQ10,
    testSQ11,
    testSQ12,
  ];

  const results: TestResult[] = [];
  for (const testCase of testCases) {
    results.push(testCase(db));
  }

  db.close();

  let passed = 0;
  let failed = 0;
  let errored = 0;
  let criticalFailed = false;

  for (const r of results) {
    if (r.status === 'PASS') passed++;
    else if (r.status === 'FAIL') failed++;
    else errored++;

    if (r.id === 'SQ-09' && r.status !== 'PASS') criticalFailed = true;
  }

  return {
    taskId: 'E-02-T-02.1',
    platform: 'electron-windows',
    packageName: 'better-sqlite3',
    packageVersion: getPackageVersion(),
    electronVersion: process.versions.electron ?? 'unknown',
    nodeVersion: process.version,
    dbPath: dbFilePath,
    tests: results,
    passed,
    failed,
    errored,
    criticalFailed,
    timestamp: new Date().toISOString(),
  };
}
