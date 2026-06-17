/**
 * Spike01_SQLite.ts
 *
 * T-00.1 SQLite Validation on Windows.
 * Implements all 12 test cases (SQ-01 through SQ-12) from E-00_TECHNICAL_SPIKE.md.
 *
 * Uses react-native-sqlite-storage with callback API (Windows-compatible).
 * Each test is self-contained and measures its own execution time.
 */

import SQLite from 'react-native-sqlite-storage';
import {
  SQLiteTestResult,
  SQLiteSpikeSummary,
  SQLiteDatabase,
} from './Spike01_Types';

// Enable verbose mode for debugging during spike
SQLite.enablePromise(false);

const DB_NAME = 'spike_test.db';
const PERFORMANCE_THRESHOLD_MS = 50;

/**
 * Helper: wraps a callback-based SQLite operation in a Promise.
 */
function openDatabase(
  name: string,
): Promise<SQLiteDatabase> {
  return new Promise((resolve, reject) => {
    const db = SQLite.openDatabase(
      name,
      '1.0',
      'Spike Test Database',
      200000,
      () => resolve(db as unknown as SQLiteDatabase),
      (error: Error) => reject(error),
    );
  });
}

/**
 * Helper: wraps transaction callback in a Promise.
 */
function runTransaction(
  db: SQLiteDatabase,
  callback: (tx: any) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    db.transaction(
      callback,
      (error: Error) => reject(error),
      () => resolve(),
    );
  });
}

/**
 * Helper: executes a single SQL statement and returns results.
 */
function executeSql(
  db: SQLiteDatabase,
  sql: string,
  args: any[] = [],
): Promise<any> {
  return new Promise((resolve, reject) => {
    db.transaction(
      (tx: any) => {
        tx.executeSql(
          sql,
          args,
          (_tx: any, results: any) => resolve(results),
          (_tx: any, error: Error) => {
            reject(error);
            return false;
          },
        );
      },
      (error: Error) => reject(error),
    );
  });
}

/**
 * Helper: wraps a test function with timing and error handling.
 */
async function runTest(
  id: string,
  name: string,
  fn: () => Promise<void>,
): Promise<SQLiteTestResult> {
  const start = performance.now();
  try {
    await fn();
    const durationMs = Math.round(performance.now() - start);
    return { id, name, passed: true, durationMs };
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    return {
      id,
      name,
      passed: false,
      durationMs,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Runs all 12 SQLite validation test cases sequentially.
 * Returns a summary with pass/fail for each test.
 */
export async function runSQLiteSpike(): Promise<SQLiteSpikeSummary> {
  const results: SQLiteTestResult[] = [];
  const startTime = performance.now();
  let db: SQLiteDatabase | null = null;

  // ─── SQ-01: Open database connection ───────────────────────────────
  results.push(
    await runTest('SQ-01', 'Open database connection', async () => {
      db = await openDatabase(DB_NAME);
      if (!db) {
        throw new Error('Database object is null or undefined');
      }
    }),
  );

  // ─── SQ-02: CREATE TABLE ───────────────────────────────────────────
  results.push(
    await runTest('SQ-02', 'CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT NOT NULL)', async () => {
      if (!db) throw new Error('No database connection');
      await executeSql(db, 'DROP TABLE IF EXISTS test');
      await executeSql(
        db,
        'CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT NOT NULL)',
      );
    }),
  );

  // ─── SQ-03: INSERT ─────────────────────────────────────────────────
  results.push(
    await runTest('SQ-03', "INSERT INTO test (value) VALUES ('hello')", async () => {
      if (!db) throw new Error('No database connection');
      const results = await executeSql(
        db,
        "INSERT INTO test (value) VALUES ('hello')",
      );
      if (results.rowsAffected !== 1) {
        throw new Error(`Expected 1 row affected, got ${results.rowsAffected}`);
      }
    }),
  );

  // ─── SQ-04: SELECT ─────────────────────────────────────────────────
  results.push(
    await runTest('SQ-04', "SELECT * FROM test → returns value = 'hello'", async () => {
      if (!db) throw new Error('No database connection');
      const results = await executeSql(db, 'SELECT * FROM test');
      if (results.rows.length !== 1) {
        throw new Error(`Expected 1 row, got ${results.rows.length}`);
      }
      const row = results.rows.item(0);
      if (row.value !== 'hello') {
        throw new Error(`Expected value 'hello', got '${row.value}'`);
      }
    }),
  );

  // ─── SQ-05: UPDATE ─────────────────────────────────────────────────
  results.push(
    await runTest('SQ-05', "UPDATE test SET value = 'world' WHERE id = 1", async () => {
      if (!db) throw new Error('No database connection');
      const results = await executeSql(
        db,
        "UPDATE test SET value = 'world' WHERE id = 1",
      );
      if (results.rowsAffected !== 1) {
        throw new Error(`Expected 1 row affected, got ${results.rowsAffected}`);
      }
      // Verify the update
      const selectResults = await executeSql(db, 'SELECT * FROM test WHERE id = 1');
      const row = selectResults.rows.item(0);
      if (row.value !== 'world') {
        throw new Error(`Expected value 'world', got '${row.value}'`);
      }
    }),
  );

  // ─── SQ-06: DELETE ─────────────────────────────────────────────────
  results.push(
    await runTest('SQ-06', 'DELETE FROM test WHERE id = 1 → returns empty', async () => {
      if (!db) throw new Error('No database connection');
      const deleteResults = await executeSql(db, 'DELETE FROM test WHERE id = 1');
      if (deleteResults.rowsAffected !== 1) {
        throw new Error(`Expected 1 row deleted, got ${deleteResults.rowsAffected}`);
      }
      const selectResults = await executeSql(db, 'SELECT * FROM test');
      if (selectResults.rows.length !== 0) {
        throw new Error(`Expected 0 rows after delete, got ${selectResults.rows.length}`);
      }
    }),
  );

  // ─── SQ-07: Multi-statement transaction (COMMIT) ───────────────────
  results.push(
    await runTest('SQ-07', 'Multi-statement transaction: BEGIN; INSERT; INSERT; COMMIT', async () => {
      if (!db) throw new Error('No database connection');
      await runTransaction(db, (tx: any) => {
        tx.executeSql('BEGIN');
        tx.executeSql("INSERT INTO test (value) VALUES ('row1')");
        tx.executeSql("INSERT INTO test (value) VALUES ('row2')");
        tx.executeSql('COMMIT');
      });
      // Verify both rows committed
      const results = await executeSql(db, 'SELECT * FROM test');
      if (results.rows.length !== 2) {
        throw new Error(`Expected 2 rows after commit, got ${results.rows.length}`);
      }
    }),
  );

  // ─── SQ-08: Multi-statement transaction with ROLLBACK ──────────────
  results.push(
    await runTest('SQ-08', 'Multi-statement transaction: BEGIN; INSERT; ROLLBACK', async () => {
      if (!db) throw new Error('No database connection');
      // Clear table first
      await executeSql(db, 'DELETE FROM test');
      await runTransaction(db, (tx: any) => {
        tx.executeSql('BEGIN');
        tx.executeSql("INSERT INTO test (value) VALUES ('should_not_persist')");
        tx.executeSql('ROLLBACK');
      });
      // Verify no rows persisted
      const results = await executeSql(db, 'SELECT * FROM test');
      if (results.rows.length !== 0) {
        throw new Error(`Expected 0 rows after rollback, got ${results.rows.length}`);
      }
    }),
  );

  // ─── SQ-09: FK violation (should reject) ───────────────────────────
  results.push(
    await runTest('SQ-09', 'PRAGMA foreign_keys = ON; FK violation → rejected', async () => {
      if (!db) throw new Error('No database connection');

      // Create parent and child tables for FK test
      await executeSql(db, 'DROP TABLE IF EXISTS child');
      await executeSql(db, 'DROP TABLE IF EXISTS parent');
      await executeSql(
        db,
        'CREATE TABLE parent (id INTEGER PRIMARY KEY, name TEXT NOT NULL)',
      );
      await executeSql(
        db,
        'CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL, FOREIGN KEY (parent_id) REFERENCES parent(id))',
      );

      // Enable foreign keys
      await executeSql(db, 'PRAGMA foreign_keys = ON');

      // Verify FK is enabled
      const pragmaResults = await executeSql(db, 'PRAGMA foreign_keys');
      const fkEnabled = pragmaResults.rows.item(0).foreign_keys;
      if (fkEnabled !== 1) {
        throw new Error(`Foreign keys not enabled: got ${fkEnabled}`);
      }

      // Attempt FK violation: insert child with non-existent parent
      let rejected = false;
      try {
        await executeSql(
          db,
          'INSERT INTO child (parent_id) VALUES (999)',
        );
      } catch (e) {
        rejected = true;
      }
      if (!rejected) {
        throw new Error('FK violation was not rejected — foreign keys may not be enforced');
      }
    }),
  );

  // ─── SQ-10: Valid FK insert ────────────────────────────────────────
  results.push(
    await runTest('SQ-10', 'Valid FK insert: parent + child → succeeds', async () => {
      if (!db) throw new Error('No database connection');

      // Insert valid parent
      await executeSql(db, "INSERT INTO parent (id, name) VALUES (1, 'Test Parent')");
      // Insert child referencing valid parent
      await executeSql(db, 'INSERT INTO child (parent_id) VALUES (1)');

      // Verify both exist
      const childResults = await executeSql(db, 'SELECT * FROM child WHERE parent_id = 1');
      if (childResults.rows.length !== 1) {
        throw new Error(`Expected 1 child row, got ${childResults.rows.length}`);
      }
    }),
  );

  // ─── SQ-11: Persistence (close and reopen) ─────────────────────────
  results.push(
    await runTest('SQ-11', 'Close connection, reopen, SELECT → data persists', async () => {
      if (!db) throw new Error('No database connection');

      // Insert a test row
      await executeSql(db, 'DELETE FROM test');
      await executeSql(db, "INSERT INTO test (value) VALUES ('persistent_data')");

      // Close the database
      db.close();

      // Reopen
      db = await openDatabase(DB_NAME);

      // Verify data persists
      const results = await executeSql(db, "SELECT * FROM test WHERE value = 'persistent_data'");
      if (results.rows.length !== 1) {
        throw new Error(
          `Expected 1 persistent row after reopen, got ${results.rows.length}`,
        );
      }
    }),
  );

  // ─── SQ-12: PRAGMA integrity_check ─────────────────────────────────
  results.push(
    await runTest('SQ-12', 'PRAGMA integrity_check → returns "ok"', async () => {
      if (!db) throw new Error('No database connection');
      const results = await executeSql(db, 'PRAGMA integrity_check');
      const checkResult = results.rows.item(0).integrity_check;
      if (checkResult !== 'ok') {
        throw new Error(`Integrity check failed: got "${checkResult}"`);
      }
    }),
  );

  // ─── Cleanup ───────────────────────────────────────────────────────
  if (db !== null) {
    try {
      await executeSql(db, 'DROP TABLE IF EXISTS test');
      await executeSql(db, 'DROP TABLE IF EXISTS child');
      await executeSql(db, 'DROP TABLE IF EXISTS parent');
      (db as SQLiteDatabase).close();
    } catch {
      // Cleanup errors are non-fatal
    }
  }

  const totalDurationMs = Math.round(performance.now() - startTime);
  const passed = results.filter((r) => r.passed).length;

  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
    spikePassed: passed === results.length,
    totalDurationMs,
  };
}
