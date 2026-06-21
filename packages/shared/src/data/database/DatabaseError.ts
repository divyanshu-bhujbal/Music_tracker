/**
 * Base error class for all SQL-layer failures.
 *
 * Use for generic SQL errors: syntax errors, invalid table/column names,
 * type mismatches. Platform implementations wrap native errors into this
 * hierarchy so callers can use `instanceof` to distinguish error types.
 */
export class DatabaseError extends Error {
  /** The SQL statement that caused the error, if applicable. */
  sql?: string;

  /** The parameters that were bound to the statement, if applicable. */
  params?: unknown[];

  /** Platform-specific error code (e.g., 'SQLITE_CONSTRAINT' from better-sqlite3). */
  code?: string;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DatabaseError';
  }
}

/**
 * Structural constraint violation: FOREIGN KEY, NOT NULL, UNIQUE, or CHECK.
 *
 * Extends {@link DatabaseError}. Callers use `instanceof ConstraintError`
 * to distinguish constraint violations from other SQL errors.
 */
export class ConstraintError extends DatabaseError {
  /** The type of constraint that was violated. */
  constraint?: 'FOREIGN KEY' | 'NOT NULL' | 'UNIQUE' | 'CHECK';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ConstraintError';
  }
}

/**
 * Database file or plugin access failure.
 *
 * Thrown when the SQLite plugin is unavailable, the database file cannot
 * be opened, permissions are insufficient, the file is corrupt, or the
 * disk is full.
 *
 * Extends {@link DatabaseError}.
 */
export class ConnectionError extends DatabaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ConnectionError';
  }
}
