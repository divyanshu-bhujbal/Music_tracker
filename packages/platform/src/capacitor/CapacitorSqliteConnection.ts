import type { DatabaseConnection } from '@collectio/shared';
import { DatabaseError, ConstraintError, ConnectionError } from '@collectio/shared';
import { SQLiteConnection, CapacitorSQLite } from '@capacitor-community/sqlite';
import type { SQLiteDBConnection } from '@capacitor-community/sqlite';

interface PluginQueryResult {
  values?: Record<string, unknown>[];
}

let _sqlite: SQLiteConnection | null = null;

function countPlaceholders(sql: string): number {
  let count = 0;
  let inString = false;
  let stringChar = '';
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inString) {
      if (ch === stringChar && sql[i - 1] !== '\\') inString = false;
    } else if (ch === "'" || ch === '"') {
      inString = true;
      stringChar = ch;
    } else if (ch === '?') {
      count++;
    }
  }
  return count;
}

function hasMultipleStatements(sql: string): boolean {
  let inString = false;
  let stringChar = '';
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inString) {
      if (ch === stringChar && sql[i - 1] !== '\\') inString = false;
    } else if (ch === "'" || ch === '"') {
      inString = true;
      stringChar = ch;
    } else if (ch === ';') {
      const rest = sql.slice(i + 1).trim();
      if (rest.length > 0) return true;
    }
  }
  return false;
}

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

function getConstraintType(
  err: unknown,
): 'FOREIGN KEY' | 'NOT NULL' | 'UNIQUE' | 'CHECK' | undefined {
  if (!(err instanceof Error)) return undefined;
  const msg = err.message;
  if (msg.includes('FOREIGN KEY')) return 'FOREIGN KEY';
  if (msg.includes('NOT NULL')) return 'NOT NULL';
  if (msg.includes('UNIQUE constraint')) return 'UNIQUE';
  if (msg.includes('CHECK constraint')) return 'CHECK';
  return undefined;
}

function mapError(
  err: unknown,
  sql: string,
  params?: unknown[],
): DatabaseError {
  const error = err instanceof Error ? err : new Error(String(err));

  if (isConstraintError(error)) {
    const constraintErr = new ConstraintError(error.message, { cause: error });
    constraintErr.sql = sql;
    constraintErr.params = params;
    constraintErr.constraint = getConstraintType(error);
    return constraintErr;
  }

  const dbErr = new DatabaseError(error.message, { cause: error });
  dbErr.sql = sql;
  dbErr.params = params;
  return dbErr;
}

function validateInput(sql: string, params?: unknown[]): void {
  if (!sql || sql.trim().length === 0) {
    throw new DatabaseError('SQL string is empty');
  }
  if (hasMultipleStatements(sql)) {
    throw new DatabaseError('Multiple statements are not allowed');
  }
  const placeholderCount = countPlaceholders(sql);
  const paramCount = params?.length ?? 0;
  if (placeholderCount !== paramCount) {
    throw new DatabaseError(
      `Parameter count mismatch: expected ${placeholderCount}, got ${paramCount}`,
    );
  }
}

function ensureOpen(open: boolean): void {
  if (!open) {
    throw new ConnectionError(
      'Database connection is not open. Call open() first.',
    );
  }
}

export class CapacitorSqliteConnection implements DatabaseConnection {
  private dbName: string | null = null;
  private dbConn: SQLiteDBConnection | null = null;
  private isOpen = false;

  async open(dbPath: string): Promise<void> {
    if (this.isOpen) {
      try {
        await this.dbConn?.close();
      } catch {
        // ignore close errors during reopen
      }
      try {
        if (this.dbName) {
          await _sqlite?.closeConnection(this.dbName, false);
        }
      } catch {
        // ignore close errors during reopen
      }
      this.dbConn = null;
      this.dbName = null;
      this.isOpen = false;
    }

    if (!_sqlite) {
      try {
        _sqlite = new SQLiteConnection(CapacitorSQLite);
      } catch (err) {
        throw new ConnectionError(
          `Failed to initialize SQLite plugin: ${String(err)}`,
          { cause: err },
        );
      }
    }

    let dbConn: SQLiteDBConnection;
    try {
      const existing = await _sqlite.isConnection(dbPath, false);
      if (existing.result) {
        dbConn = await _sqlite.retrieveConnection(dbPath, false);
      } else {
        dbConn = await _sqlite.createConnection(
          dbPath,
          false,
          'no-encryption',
          1,
          false,
        );
      }
    } catch (err) {
      throw new ConnectionError(
        `Failed to create database connection: ${String(err)}`,
        { cause: err },
      );
    }

    try {
      await dbConn.open();
    } catch (err) {
      try {
        await _sqlite.closeConnection(dbPath, false);
      } catch {
        // ignore cleanup errors
      }
      throw new ConnectionError(
        `Failed to open database: ${String(err)}`,
        { cause: err },
      );
    }

    try {
      await dbConn.query('PRAGMA foreign_keys = ON');
      await dbConn.query('PRAGMA journal_mode = WAL');
      await dbConn.query('PRAGMA synchronous = NORMAL');
      await dbConn.query('PRAGMA busy_timeout = 5000');
    } catch (err) {
      try {
        await dbConn.close();
      } catch {
        // ignore cleanup errors
      }
      try {
        await _sqlite.closeConnection(dbPath, false);
      } catch {
        // ignore cleanup errors
      }
      throw new ConnectionError(
        `Failed to set PRAGMAs: ${String(err)}`,
        { cause: err },
      );
    }

    this.dbName = dbPath;
    this.dbConn = dbConn;
    this.isOpen = true;
  }

  async close(): Promise<void> {
    if (!this.isOpen) return;

    try {
      await this.dbConn?.close();
    } catch {
      // suppress close errors
    }

    try {
      if (this.dbName && _sqlite) {
        await _sqlite.closeConnection(this.dbName, false);
      }
    } catch {
      // suppress close errors
    }

    this.dbConn = null;
    this.dbName = null;
    this.isOpen = false;
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    ensureOpen(this.isOpen);
    validateInput(sql, params);

    try {
      if (params && params.length > 0) {
        await this.dbConn!.run(sql, params, false);
      } else {
        await this.dbConn!.execute(sql, false);
      }
    } catch (err) {
      throw mapError(err, sql, params);
    }
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    ensureOpen(this.isOpen);
    validateInput(sql, params);

    try {
      const result = (await this.dbConn!.query(
        sql,
        params,
      )) as PluginQueryResult;
      return (result.values ?? []) as T[];
    } catch (err) {
      throw mapError(err, sql, params);
    }
  }

  async serialize(): Promise<Uint8Array> {
    ensureOpen(this.isOpen);
    // Capacitor SQLite plugin does not expose a native serialize/backup API.
    // For V1, the SyncEngine uses the serializeDb callback in DI to handle
    // platform-specific serialization. This stub will be replaced when the
    // Capacitor plugin adds export support.
    throw new DatabaseError(
      'CapacitorSqliteConnection.serialize() is not yet implemented — use the serializeDb DI callback',
    );
  }

  async transaction<T>(
    fn: (db: DatabaseConnection) => Promise<T>,
  ): Promise<T> {
    ensureOpen(this.isOpen);

    try {
      await this.dbConn!.beginTransaction();
    } catch (err) {
      throw new DatabaseError(`Failed to begin transaction: ${String(err)}`, {
        cause: err,
      });
    }

    let result: T;
    try {
      result = await fn(this);
    } catch (fnError) {
      try {
        await this.dbConn!.rollbackTransaction();
      } catch {
        // rollback also failed — unresolvable state
        throw new DatabaseError('ROLLBACK failed after transaction error', {
          cause: fnError,
        });
      }
      throw fnError;
    }

    try {
      await this.dbConn!.commitTransaction();
    } catch (commitErr) {
      try {
        await this.dbConn!.rollbackTransaction();
      } catch {
        // rollback also failed — unresolvable state
      }
      throw new DatabaseError(
        `Failed to commit transaction: ${String(commitErr)}`,
        { cause: commitErr },
      );
    }

    return result;
  }
}
