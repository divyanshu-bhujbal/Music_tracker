/**
 * Async SQLite database connection interface.
 *
 * The single contract between the Data Layer (repositories, migration runner)
 * and the Platform Implementations Layer (BetterSqlite3Connection, CapacitorSqliteConnection).
 * Every SQL operation in the application flows through this contract.
 *
 * The interface is async because Capacitor's plugin bridge is inherently
 * asynchronous (AD-01). Electron's synchronous better-sqlite3 is wrapped
 * in Promise.resolve() to satisfy this contract.
 */
export interface DatabaseConnection {
  /**
   * Opens or creates the SQLite database file at the given path.
   *
   * Executes required PRAGMAs after opening: `foreign_keys = ON`,
   * `journal_mode = WAL`, `synchronous = NORMAL`, `busy_timeout = 5000`.
   *
   * Must be called before any `execute()`, `query()`, or `transaction()` calls.
   * Safe to call if the database file already exists (reopens existing database).
   *
   * @param dbPath - Absolute or relative path to the SQLite database file.
   * @throws {ConnectionError} If the file cannot be opened, the plugin is unavailable,
   *   or permissions are insufficient.
   */
  open(dbPath: string): Promise<void>;

  /**
   * Closes the database connection and releases all resources.
   *
   * Safe to call even if already closed (idempotent — implementations must
   * not throw on repeated calls).
   * After close, further `execute()`/`query()`/`transaction()` calls throw
   * {@link ConnectionError}.
   *
   * @throws {ConnectionError} Never thrown (idempotent). Present for interface
   *   consistency.
   */
  close(): Promise<void>;

  /**
   * Executes a single SQL statement that does NOT return rows.
   *
   * Use for INSERT, UPDATE, DELETE, CREATE TABLE, DROP TABLE, ALTER TABLE,
   * and non-querying PRAGMA statements.
   *
   * Uses `?` positional placeholders for parameter binding — never string
   * interpolation. Rejects multiple statements in a single string.
   *
   * @param sql - A single SQL statement with optional `?` placeholders.
   * @param params - Optional positional parameters to bind to the `?` placeholders.
   * @throws {ConstraintError} For FOREIGN KEY, NOT NULL, UNIQUE, or CHECK violations.
   * @throws {DatabaseError} For SQL syntax errors or invalid table/column references.
   */
  execute(sql: string, params?: unknown[]): Promise<void>;

  /**
   * Executes a SELECT query or a result-returning PRAGMA statement
   * (e.g., `PRAGMA integrity_check`, `PRAGMA foreign_key_check`).
   *
   * Uses `?` positional placeholders for parameter binding. Returns typed
   * array of result rows; empty result set returns `[]` (never `null` or
   * `undefined`). Each row is a plain object with column names as keys and
   * column values as values.
   *
   * Rejects multiple statements in a single string.
   *
   * @typeParam T - The expected shape of each result row.
   * @param sql - A single SELECT statement or result-returning PRAGMA with optional `?` placeholders.
   * @param params - Optional positional parameters to bind to the `?` placeholders.
   * @returns Array of result rows, empty array if no matches.
   * @throws {DatabaseError} For SQL syntax errors or invalid table/column references.
   */
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;

  /**
   * Executes an async callback within a SQLite transaction.
   *
   * Begins a transaction (`BEGIN`), executes the async callback `fn` passing
   * the same `DatabaseConnection` instance, then commits (`COMMIT`) if `fn`
   * resolves, or rolls back (`ROLLBACK`) if `fn` rejects.
   *
   * Nested transaction calls are not supported in V1 — behavior is undefined
   * if `fn` calls `transaction()` again.
   *
   * @typeParam T - The return type of the transaction callback.
   * @param fn - Async callback that receives this connection and performs
   *   read/write operations within the transaction.
   * @returns The return value of the callback.
   * @throws {DatabaseError} If `BEGIN`, `COMMIT`, or `ROLLBACK` fails at the SQL level.
   * @throws {*} Re-throws any error thrown by `fn` after rolling back.
   */
  transaction<T>(fn: (db: DatabaseConnection) => Promise<T>): Promise<T>;
}
