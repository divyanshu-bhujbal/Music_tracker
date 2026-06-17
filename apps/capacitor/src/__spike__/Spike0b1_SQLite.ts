import { CapacitorSQLite, SQLiteConnection } from "@capacitor-community/sqlite";
import {
  DatabaseConnection,
  DatabaseError,
  ConstraintError,
} from "./Spike0b1_DatabaseConnection";
import type { TestResult, TestCase, SpikeReport } from "./Spike0b1_Types";

class CapacitorSqliteConnection implements DatabaseConnection {
  private sqlite: SQLiteConnection;
  private db: unknown = null;
  private dbName: string;

  constructor(sqlite: SQLiteConnection, dbName: string = "spike_test") {
    this.sqlite = sqlite;
    this.dbName = dbName;
  }

  async open(_dbPath: string): Promise<void> {
    const existing = await this.sqlite.isConnection(this.dbName, false);
    let dbConn;
    if (existing.result) {
      dbConn = await this.sqlite.retrieveConnection(this.dbName, false);
    } else {
      dbConn = await this.sqlite.createConnection(
        this.dbName,
        false,
        "no-encryption",
        1,
        false
      );
    }
    await dbConn.open();
    this.db = dbConn;
    // All PRAGMAs via query() — Android's execSQL() rejects any statement
    // that returns data, and Android SQLite returns a row for every PRAGMA.
    await this.query("PRAGMA foreign_keys = ON");
    await this.query("PRAGMA journal_mode = WAL");
    await this.query("PRAGMA synchronous = NORMAL");
    await this.query("PRAGMA busy_timeout = 5000");
  }

  async close(): Promise<void> {
    if (this.db) {
      const dbConn = this.db as { close(): Promise<void> };
      await dbConn.close();
    }
    await this.sqlite.closeConnection(this.dbName, false);
    this.db = null;
  }

  private async execSQL(sql: string): Promise<void> {
    if (!this.db) throw new DatabaseError("Database not open");
    const dbConn = this.db as {
      execute(statements: string, transaction: boolean): Promise<unknown>;
    };
    // transaction: false — no implicit wrapping, each statement auto-commits
    await dbConn.execute(sql, false);
  }

  async execute(sql: string, _params?: unknown[]): Promise<void> {
    if (!this.db) throw new DatabaseError("Database not open");
    try {
      await this.execSQL(sql);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("FOREIGN KEY") ||
        msg.includes("constraint") ||
        msg.includes("CONSTRAINT") ||
        msg.includes("FOREIGN")
      ) {
        throw new ConstraintError(msg);
      }
      throw new DatabaseError(msg);
    }
  }

  async query<T>(sql: string, _params?: unknown[]): Promise<T[]> {
    if (!this.db) throw new DatabaseError("Database not open");
    try {
      const dbConn = this.db as {
        query(statement: string): Promise<{ values?: T[] }>;
      };
      const res = await dbConn.query(sql);
      return (res?.values ?? []) as T[];
    } catch (err) {
      throw new DatabaseError(
        `Query failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.db) throw new DatabaseError("Database not open");
    const dbConn = this.db as {
      beginTransaction(): Promise<unknown>;
      commitTransaction(): Promise<unknown>;
      rollbackTransaction(): Promise<unknown>;
    };
    await dbConn.beginTransaction();
    try {
      const result = await fn();
      await dbConn.commitTransaction();
      return result;
    } catch (err) {
      await dbConn.rollbackTransaction();
      throw err;
    }
  }
}

function measureTime(start: number): number {
  return performance.now() - start;
}

function result(
  id: string,
  description: string,
  status: "PASS" | "FAIL" | "ERROR",
  expected: string,
  actual: string,
  durationMs: number,
  error?: string
): TestResult {
  return { id, description, status, expected, actual, durationMs, error };
}

const sqlite = new SQLiteConnection(CapacitorSQLite);

async function freshConn(): Promise<CapacitorSqliteConnection> {
  const conn = new CapacitorSqliteConnection(sqlite);
  await conn.open("spike_test.db");
  return conn;
}

async function closeConn(conn: CapacitorSqliteConnection | null): Promise<void> {
  if (!conn) return;
  try { await conn.close(); } catch { /* best-effort */ }
}

async function cleanupTables(conn: CapacitorSqliteConnection): Promise<void> {
  await conn.query("DROP TABLE IF EXISTS test");
  await conn.query("DROP TABLE IF EXISTS child_table");
  await conn.query("DROP TABLE IF EXISTS parent_table");
}

const tests: TestCase[] = [
  {
    id: "SQ-01",
    description: "Open database connection",
    run: async () => {
      const start = performance.now();
      let conn: CapacitorSqliteConnection | null = null;
      try {
        conn = new CapacitorSqliteConnection(sqlite);
        await conn.open("spike_test.db");
        return result(
          "SQ-01",
          "Open database connection",
          "PASS",
          "Connection object returned; no exception",
          "Connection object returned",
          measureTime(start)
        );
      } catch (err) {
        return result(
          "SQ-01",
          "Open database connection",
          "ERROR",
          "Connection object returned; no exception",
          `Exception: ${err instanceof Error ? err.message : String(err)}`,
          measureTime(start),
          err instanceof Error ? err.stack : String(err)
        );
      } finally {
        await closeConn(conn);
      }
    },
  },
  {
    id: "SQ-02",
    description: "Create table",
    run: async () => {
      let conn: CapacitorSqliteConnection | null = null;
      const start = performance.now();
      try {
        conn = await freshConn();
        await cleanupTables(conn);
        await conn.execute(
          "CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT NOT NULL)"
        );
        return result(
          "SQ-02",
          "Create table",
          "PASS",
          "Statement executes without error",
          "Statement executes without error",
          measureTime(start)
        );
      } catch (err) {
        return result(
          "SQ-02",
          "Create table",
          "ERROR",
          "Statement executes without error",
          `Exception: ${err instanceof Error ? err.message : String(err)}`,
          measureTime(start),
          err instanceof Error ? err.stack : String(err)
        );
      } finally {
        await closeConn(conn);
      }
    },
  },
  {
    id: "SQ-03",
    description: "Insert row",
    run: async () => {
      let conn: CapacitorSqliteConnection | null = null;
      const start = performance.now();
      try {
        conn = await freshConn();
        await cleanupTables(conn);
        await conn.execute(
          "CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT NOT NULL)"
        );
        await conn.execute("INSERT INTO test (value) VALUES ('hello')");
        return result(
          "SQ-03",
          "Insert row",
          "PASS",
          "1 row inserted",
          "1 row inserted",
          measureTime(start)
        );
      } catch (err) {
        return result(
          "SQ-03",
          "Insert row",
          "ERROR",
          "1 row inserted",
          `Exception: ${err instanceof Error ? err.message : String(err)}`,
          measureTime(start),
          err instanceof Error ? err.stack : String(err)
        );
      } finally {
        await closeConn(conn);
      }
    },
  },
  {
    id: "SQ-04",
    description: "Select row",
    run: async () => {
      let conn: CapacitorSqliteConnection | null = null;
      const start = performance.now();
      try {
        conn = await freshConn();
        await cleanupTables(conn);
        await conn.execute(
          "CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT NOT NULL)"
        );
        await conn.execute("INSERT INTO test (value) VALUES ('hello')");
        const rows = await conn.query<{ id: number; value: string }>(
          "SELECT * FROM test"
        );
        const pass =
          rows.length === 1 && rows[0].id === 1 && rows[0].value === "hello";
        return result(
          "SQ-04",
          "Select row",
          pass ? "PASS" : "FAIL",
          "[{id: 1, value: 'hello'}]",
          JSON.stringify(rows),
          measureTime(start)
        );
      } catch (err) {
        return result(
          "SQ-04",
          "Select row",
          "ERROR",
          "[{id: 1, value: 'hello'}]",
          `Exception: ${err instanceof Error ? err.message : String(err)}`,
          measureTime(start),
          err instanceof Error ? err.stack : String(err)
        );
      } finally {
        await closeConn(conn);
      }
    },
  },
  {
    id: "SQ-05",
    description: "Update row",
    run: async () => {
      let conn: CapacitorSqliteConnection | null = null;
      const start = performance.now();
      try {
        conn = await freshConn();
        await cleanupTables(conn);
        await conn.execute(
          "CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT NOT NULL)"
        );
        await conn.execute("INSERT INTO test (value) VALUES ('hello')");
        await conn.execute("UPDATE test SET value = 'world' WHERE id = 1");
        const rows = await conn.query<{ id: number; value: string }>(
          "SELECT * FROM test"
        );
        const pass = rows.length === 1 && rows[0].value === "world";
        return result(
          "SQ-05",
          "Update row",
          pass ? "PASS" : "FAIL",
          "[{id: 1, value: 'world'}]",
          JSON.stringify(rows),
          measureTime(start)
        );
      } catch (err) {
        return result(
          "SQ-05",
          "Update row",
          "ERROR",
          "[{id: 1, value: 'world'}]",
          `Exception: ${err instanceof Error ? err.message : String(err)}`,
          measureTime(start),
          err instanceof Error ? err.stack : String(err)
        );
      } finally {
        await closeConn(conn);
      }
    },
  },
  {
    id: "SQ-06",
    description: "Delete row",
    run: async () => {
      let conn: CapacitorSqliteConnection | null = null;
      const start = performance.now();
      try {
        conn = await freshConn();
        await cleanupTables(conn);
        await conn.execute(
          "CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT NOT NULL)"
        );
        await conn.execute("INSERT INTO test (value) VALUES ('hello')");
        await conn.execute("DELETE FROM test WHERE id = 1");
        const rows = await conn.query<{ id: number }>("SELECT * FROM test");
        const pass = rows.length === 0;
        return result(
          "SQ-06",
          "Delete row",
          pass ? "PASS" : "FAIL",
          "0 rows",
          `${rows.length} rows`,
          measureTime(start)
        );
      } catch (err) {
        return result(
          "SQ-06",
          "Delete row",
          "ERROR",
          "0 rows",
          `Exception: ${err instanceof Error ? err.message : String(err)}`,
          measureTime(start),
          err instanceof Error ? err.stack : String(err)
        );
      } finally {
        await closeConn(conn);
      }
    },
  },
  {
    id: "SQ-07",
    description: "Multi-insert transaction",
    run: async () => {
      let conn: CapacitorSqliteConnection | null = null;
      const start = performance.now();
      try {
        conn = await freshConn();
        await cleanupTables(conn);
        await conn.execute(
          "CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT NOT NULL)"
        );
        await conn.transaction(async () => {
          await conn!.execute("INSERT INTO test (value) VALUES ('a')");
          await conn!.execute("INSERT INTO test (value) VALUES ('b')");
        });
        const rows = await conn.query<{ id: number }>("SELECT * FROM test");
        const pass = rows.length === 2;
        return result(
          "SQ-07",
          "Multi-insert transaction",
          pass ? "PASS" : "FAIL",
          "2 rows committed",
          `${rows.length} rows`,
          measureTime(start)
        );
      } catch (err) {
        return result(
          "SQ-07",
          "Multi-insert transaction",
          "ERROR",
          "2 rows committed",
          `Exception: ${err instanceof Error ? err.message : String(err)}`,
          measureTime(start),
          err instanceof Error ? err.stack : String(err)
        );
      } finally {
        await closeConn(conn);
      }
    },
  },
  {
    id: "SQ-08",
    description: "Transaction rollback",
    run: async () => {
      let conn: CapacitorSqliteConnection | null = null;
      const start = performance.now();
      try {
        conn = await freshConn();
        await cleanupTables(conn);
        await conn.execute(
          "CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT NOT NULL)"
        );
        try {
          await conn.transaction(async () => {
            await conn!.execute("INSERT INTO test (value) VALUES ('a')");
            throw new Error("Intentional rollback");
          });
        } catch {
          // Expected
        }
        const rows = await conn.query<{ id: number }>("SELECT * FROM test");
        const pass = rows.length === 0;
        return result(
          "SQ-08",
          "Transaction rollback",
          pass ? "PASS" : "FAIL",
          "0 rows persisted",
          `${rows.length} rows`,
          measureTime(start)
        );
      } catch (err) {
        return result(
          "SQ-08",
          "Transaction rollback",
          "ERROR",
          "0 rows persisted",
          `Exception: ${err instanceof Error ? err.message : String(err)}`,
          measureTime(start),
          err instanceof Error ? err.stack : String(err)
        );
      } finally {
        await closeConn(conn);
      }
    },
  },
  {
    id: "SQ-09",
    description: "FK violation rejected (CRITICAL)",
    run: async () => {
      let conn: CapacitorSqliteConnection | null = null;
      const start = performance.now();
      try {
        conn = await freshConn();
        await cleanupTables(conn);
        await conn.execute("PRAGMA foreign_keys = ON");
        await conn.execute(
          "CREATE TABLE parent_table (id INTEGER PRIMARY KEY)"
        );
        await conn.execute(
          "CREATE TABLE child_table (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent_table(id))"
        );
        try {
          await conn.execute(
            "INSERT INTO child_table (parent_id) VALUES (999)"
          );
          // Reached here — FK was NOT enforced
          const rows = await conn.query<{ parent_id: number }>(
            "SELECT * FROM child_table"
          );
          return result(
            "SQ-09",
            "FK violation rejected (CRITICAL)",
            "FAIL",
            "Insertion REJECTED with ConstraintError",
            `Insertion SUCCEEDED (${rows.length} rows). FK enforcement NOT working.`,
            measureTime(start),
            "Foreign key constraint was not enforced. GATING FAILURE."
          );
        } catch (err) {
          if (err instanceof ConstraintError) {
            const rows = await conn.query<{ parent_id: number }>(
              "SELECT * FROM child_table"
            );
            if (rows.length > 0) {
              return result(
                "SQ-09",
                "FK violation rejected (CRITICAL)",
                "FAIL",
                "Insertion REJECTED — no orphan row",
                `Insertion rejected but orphan row exists (${rows.length} rows). FALSE PASS.`,
                measureTime(start),
                "Plugin threw error but did not prevent insertion."
              );
            }
            return result(
              "SQ-09",
              "FK violation rejected (CRITICAL)",
              "PASS",
              "Insertion REJECTED with ConstraintError",
              "Insertion REJECTED — no orphan row persisted",
              measureTime(start)
            );
          }
          // Other error type
          const rows = await conn.query<{ parent_id: number }>(
            "SELECT * FROM child_table"
          );
          if (rows.length > 0) {
            return result(
              "SQ-09",
              "FK violation rejected (CRITICAL)",
              "FAIL",
              "Insertion REJECTED with ConstraintError",
              `Insertion SUCCEEDED despite error (${err instanceof Error ? err.message : String(err)}). Orphan row present.`,
              measureTime(start),
              "Foreign key constraint was not enforced."
            );
          }
          return result(
            "SQ-09",
            "FK violation rejected (CRITICAL)",
            "PASS",
            "Insertion REJECTED with error",
            `Insertion REJECTED: ${err instanceof Error ? err.message : String(err)}`,
            measureTime(start)
          );
        }
      } catch (err) {
        return result(
          "SQ-09",
          "FK violation rejected (CRITICAL)",
          "ERROR",
          "Insertion REJECTED with ConstraintError",
          `Exception: ${err instanceof Error ? err.message : String(err)}`,
          measureTime(start),
          err instanceof Error ? err.stack : String(err)
        );
      } finally {
        await closeConn(conn);
      }
    },
  },
  {
    id: "SQ-10",
    description: "Valid FK insertion",
    run: async () => {
      let conn: CapacitorSqliteConnection | null = null;
      const start = performance.now();
      try {
        conn = await freshConn();
        await cleanupTables(conn);
        await conn.execute("PRAGMA foreign_keys = ON");
        await conn.execute(
          "CREATE TABLE parent_table (id INTEGER PRIMARY KEY)"
        );
        await conn.execute(
          "CREATE TABLE child_table (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent_table(id))"
        );
        await conn.execute("INSERT INTO parent_table (id) VALUES (1)");
        await conn.execute("INSERT INTO child_table (parent_id) VALUES (1)");
        const rows = await conn.query<{ id: number; parent_id: number }>(
          "SELECT * FROM child_table"
        );
        const pass = rows.length === 1 && rows[0].parent_id === 1;
        return result(
          "SQ-10",
          "Valid FK insertion",
          pass ? "PASS" : "FAIL",
          "[{id: 1, parent_id: 1}]",
          JSON.stringify(rows),
          measureTime(start)
        );
      } catch (err) {
        return result(
          "SQ-10",
          "Valid FK insertion",
          "ERROR",
          "[{id: 1, parent_id: 1}]",
          `Exception: ${err instanceof Error ? err.message : String(err)}`,
          measureTime(start),
          err instanceof Error ? err.stack : String(err)
        );
      } finally {
        await closeConn(conn);
      }
    },
  },
  {
    id: "SQ-11",
    description: "Data persistence after app restart",
    run: async () => {
      let conn: CapacitorSqliteConnection | null = null;
      const start = performance.now();
      try {
        // Session 1: write data and close
        conn = await freshConn();
        await cleanupTables(conn);
        await conn.execute(
          "CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT NOT NULL)"
        );
        await conn.execute(
          "INSERT INTO test (value) VALUES ('persist_test')"
        );
        await conn.close();
        conn = null;

        // Session 2: reopen and read
        const conn2 = await freshConn();
        const rows = await conn2.query<{ id: number; value: string }>(
          "SELECT * FROM test"
        );
        const pass = rows.length === 1 && rows[0].value === "persist_test";
        const actual = JSON.stringify(rows);
        await closeConn(conn2);
        return result(
          "SQ-11",
          "Data persistence after app restart",
          pass ? "PASS" : "FAIL",
          "[{id: 1, value: 'persist_test'}]",
          actual,
          measureTime(start)
        );
      } catch (err) {
        return result(
          "SQ-11",
          "Data persistence after app restart",
          "ERROR",
          "[{id: 1, value: 'persist_test'}]",
          `Exception: ${err instanceof Error ? err.message : String(err)}`,
          measureTime(start),
          err instanceof Error ? err.stack : String(err)
        );
      } finally {
        // conn was set to null after session 1 close; nothing to close
        // but if an error occurred during session 1, conn is still open
        await closeConn(conn);
      }
    },
  },
  {
    id: "SQ-12",
    description: "Integrity check",
    run: async () => {
      let conn: CapacitorSqliteConnection | null = null;
      const start = performance.now();
      try {
        conn = await freshConn();
        await cleanupTables(conn);
        await conn.execute(
          "CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT NOT NULL)"
        );
        await conn.execute(
          "INSERT INTO test (value) VALUES ('integrity')"
        );
        const rows = await conn.query<{ integrity_check: string }>(
          "PRAGMA integrity_check"
        );
        const pass =
          rows.length > 0 && rows[0].integrity_check === "ok";
        return result(
          "SQ-12",
          "Integrity check",
          pass ? "PASS" : "FAIL",
          "ok",
          JSON.stringify(rows),
          measureTime(start)
        );
      } catch (err) {
        return result(
          "SQ-12",
          "Integrity check",
          "ERROR",
          "ok",
          `Exception: ${err instanceof Error ? err.message : String(err)}`,
          measureTime(start),
          err instanceof Error ? err.stack : String(err)
        );
      } finally {
        await closeConn(conn);
      }
    },
  },
];

function getDeviceInfo(): {
  model: string;
  apiLevel: number;
  webViewVersion: string;
} {
  const ua = navigator.userAgent;
  let model = "Unknown";
  let apiLevel = 0;
  let webViewVersion = "Unknown";

  const androidMatch = ua.match(/Android\s([\d.]+)/);
  if (androidMatch) {
    apiLevel = parseInt(androidMatch[1].split(".")[0], 10);
  }

  const webViewMatch = ua.match(/Chrome\/([\d.]+)/);
  if (webViewMatch) {
    webViewVersion = webViewMatch[1];
  }

  return { model, apiLevel, webViewVersion };
}

export async function runSqliteSpike(): Promise<SpikeReport> {
  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;
  let criticalFailed = false;

  for (const testCase of tests) {
    const testResult = await testCase.run();
    results.push(testResult);

    if (testResult.status === "PASS") {
      passed++;
    } else {
      failed++;
      if (testResult.id === "SQ-09") {
        criticalFailed = true;
      }
    }
  }

  const deviceInfo = getDeviceInfo();

  return {
    taskId: "T-00b.1",
    platform: "capacitor-android",
    deviceInfo,
    packageName: "@capacitor-community/sqlite",
    packageVersion: "6.0.2",
    tests: results,
    passed,
    failed,
    criticalFailed,
    timestamp: new Date().toISOString(),
  };
}
