import type { DatabaseConnection } from '@collectio/shared';
import { DatabaseError, ConstraintError, ConnectionError } from '@collectio/shared';
import { writeFileSync } from 'node:fs';
import type { SqliteDb } from './better-sqlite3-loader.js';
import { loadBetterSqlite3 } from './better-sqlite3-loader.js';

interface SqliteError extends Error {
  code: string;
}

const CONSTRAINT_MAP: Record<string, 'FOREIGN KEY' | 'NOT NULL' | 'UNIQUE' | 'CHECK'> = {
  SQLITE_CONSTRAINT_FOREIGNKEY: 'FOREIGN KEY',
  SQLITE_CONSTRAINT_NOTNULL: 'NOT NULL',
  SQLITE_CONSTRAINT_UNIQUE: 'UNIQUE',
  SQLITE_CONSTRAINT_CHECK: 'CHECK',
};

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

function mapError(err: unknown, sql: string, params?: unknown[]): DatabaseError {
  const error = err instanceof Error ? err : new Error(String(err));
  const sqliteErr = err as SqliteError | undefined;
  const code = sqliteErr?.code;
  const message = error.message;

  if (code && code in CONSTRAINT_MAP) {
    const constraintErr = new ConstraintError(message, { cause: error });
    constraintErr.sql = sql;
    constraintErr.params = params;
    constraintErr.code = code;
    constraintErr.constraint = CONSTRAINT_MAP[code];
    return constraintErr;
  }

  const dbErr = new DatabaseError(message, { cause: error });
  dbErr.sql = sql;
  dbErr.params = params;
  if (code) dbErr.code = code;
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

export class BetterSqlite3Connection implements DatabaseConnection {
  private db: SqliteDb | null = null;
  private dbPath: string | null = null;

  /**
   * Create an in-memory instance from a serialized database buffer.
   * Used by the SyncEngine to create merge copies without touching the live DB.
   * Skips PRAGMA setup — the copy is temporary and read/write only.
   */
  static async fromBuffer(buffer: Buffer): Promise<BetterSqlite3Connection> {
    let Database: ReturnType<typeof loadBetterSqlite3>;
    try {
      Database = loadBetterSqlite3();
    } catch (err) {
      throw new ConnectionError(
        `Failed to load better-sqlite3 native addon: ${String(err)}`,
        { cause: err },
      );
    }

    const conn = new BetterSqlite3Connection();
    try {
      conn.db = new Database(buffer);
    } catch (err) {
      throw new ConnectionError(
        `Failed to open in-memory database from buffer: ${String(err)}`,
        { cause: err },
      );
    }
    return conn;
  }

  async open(dbPath: string): Promise<void> {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        // ignore close errors during reopen
      }
    }

    let Database: ReturnType<typeof loadBetterSqlite3>;
    try {
      Database = loadBetterSqlite3();
    } catch (err) {
      throw new ConnectionError(
        `Failed to load better-sqlite3 native addon: ${String(err)}`,
        { cause: err },
      );
    }

    try {
      this.db = new Database(dbPath);
    } catch (err) {
      this.db = null;
      throw new ConnectionError(`Failed to open database: ${String(err)}`, {
        cause: err,
      });
    }

    try {
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('busy_timeout = 5000');
    } catch (err) {
      this.db.close();
      this.db = null;
      throw new ConnectionError(`Failed to set PRAGMAs: ${String(err)}`, {
        cause: err,
      });
    }

    this.dbPath = dbPath;
  }

  async close(): Promise<void> {
    if (!this.db) return;
    try {
      this.db.close();
    } catch (err) {
      throw new ConnectionError(`Failed to close database: ${String(err)}`, {
        cause: err,
      });
    } finally {
      this.db = null;
      this.dbPath = null;
    }
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    this.ensureOpen();
    validateInput(sql, params);
    try {
      this.db!.prepare(sql).run(...(params ?? []));
    } catch (err) {
      throw mapError(err, sql, params);
    }
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    this.ensureOpen();
    validateInput(sql, params);
    try {
      return this.db!.prepare(sql).all(...(params ?? [])) as T[];
    } catch (err) {
      throw mapError(err, sql, params);
    }
  }

  async serialize(): Promise<Uint8Array> {
    this.ensureOpen();
    try {
      const buffer = this.db!.serialize();
      return new Uint8Array(buffer);
    } catch (err) {
      throw new DatabaseError(
        `Failed to serialize database: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
  }

  async replaceWithBytes(bytes: Uint8Array): Promise<void> {
    this.ensureOpen();
    if (!this.dbPath) {
      throw new ConnectionError(
        'Cannot replace database: no file path available. Database was opened from buffer, not a file.',
      );
    }

    const path = this.dbPath;

    // Close existing connection
    try {
      this.db!.close();
    } catch {
      // ignore close errors — we are replacing the file
    }
    this.db = null;

    // Write replacement bytes to disk
    try {
      writeFileSync(path, Buffer.from(bytes));
    } catch (err) {
      throw new DatabaseError(
        `Failed to write replacement database: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }

    // Re-open from the new file
    await this.open(path);
  }

  async transaction<T>(fn: (db: DatabaseConnection) => Promise<T>): Promise<T> {
    this.ensureOpen();

    try {
      this.db!.exec('BEGIN');
    } catch (err) {
      throw mapError(err, 'BEGIN');
    }

    let result: T;
    try {
      result = await fn(this);
    } catch (fnError) {
      try {
        this.db!.exec('ROLLBACK');
      } catch {
        throw new DatabaseError('ROLLBACK failed after transaction error', {
          cause: fnError,
        });
      }
      throw fnError;
    }

    try {
      this.db!.exec('COMMIT');
    } catch (err) {
      try {
        this.db!.exec('ROLLBACK');
      } catch {
        // rollback also failed — unresolvable state
      }
      throw mapError(err, 'COMMIT');
    }

    return result;
  }

  private ensureOpen(): void {
    if (!this.db) {
      throw new ConnectionError('Database connection is not open. Call open() first.');
    }
  }
}
