import { createRequire } from 'node:module';

export interface SqliteDb {
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    all(...params: unknown[]): unknown[];
  };
  exec(sql: string): unknown;
  pragma(source: string, options?: { simple?: boolean }): unknown;
  serialize(): Buffer;
  close(): unknown;
  open: boolean;
}

export interface DatabaseConstructor {
  new (filename?: string | Buffer, options?: Record<string, unknown>): SqliteDb;
}

export function loadBetterSqlite3(): DatabaseConstructor {
  try {
    const require = createRequire(import.meta.url);
    return require('better-sqlite3') as DatabaseConstructor;
  } catch (err) {
    throw new Error(
      `Failed to load better-sqlite3: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
