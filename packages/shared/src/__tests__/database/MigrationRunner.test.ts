/* eslint-disable @typescript-eslint/no-explicit-any -- Tests access private methods via `as any` for unit testing */

import type { DatabaseConnection } from '../../data/database/DatabaseConnection.js';
import { DatabaseError } from '../../data/database/DatabaseError.js';
import { MigrationRunner } from '../../data/database/MigrationRunner.js';
import type { Migration } from '../../data/database/MigrationTypes.js';

/**
 * Creates a mock DatabaseConnection backed by an in-memory app_metadata map.
 * Records all execute/query/transaction calls for assertion.
 */
function createMockDb(options?: {
  schemaVersion?: string | null;
  executeError?: string;
  queryError?: string;
  tableExists?: boolean;
}) {
  const metadata = new Map<string, string>();
  const tableExists = options?.tableExists ?? (options?.schemaVersion !== undefined);
  if (options?.schemaVersion !== undefined && options.schemaVersion !== null) {
    metadata.set('schema_version', options.schemaVersion);
  }

  const mock: DatabaseConnection = {
    open: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),

    execute: jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
      if (options?.executeError && sql.includes(options.executeError)) {
        throw new DatabaseError(`Mock execute error: ${options.executeError}`);
      }
      // Simulate version UPDATE
      if (sql.includes("UPDATE app_metadata SET value = ? WHERE key = 'schema_version'")) {
        if (params && params.length >= 1) {
          metadata.set('schema_version', params[0] as string);
        }
      }
    }),

    query: jest.fn().mockImplementation(async <T>(sql: string): Promise<T[]> => {
      // schema_version query
      if (sql.includes("SELECT value FROM app_metadata WHERE key = ?")) {
        if (!tableExists) {
          throw new Error('no such table: app_metadata');
        }
        const val = metadata.get('schema_version');
        if (val === undefined) {
          return [] as T[];
        }
        return [{ value: val }] as T[];
      }
      if (options?.queryError && sql.includes(options.queryError)) {
        throw new DatabaseError(`Mock query error: ${options.queryError}`);
      }
      // integrity_check
      if (sql.includes('PRAGMA integrity_check')) {
        return [{ integrity_check: 'ok' }] as T[];
      }
      // foreign_key_check
      if (sql.includes('PRAGMA foreign_key_check')) {
        return [] as T[];
      }
      // PRAGMAs (no result needed)
      return [] as T[];
    }),

    serialize: jest.fn().mockResolvedValue(new Uint8Array(0)),
    transaction: jest.fn().mockImplementation(
      async <T>(fn: (db: DatabaseConnection) => Promise<T>): Promise<T> => {
        return fn(mock);
      },
    ),
  };

  return { mock, metadata };
}

const m1: Migration = {
  version: 1,
  sql: [
    "INSERT INTO app_metadata (key, value) VALUES ('schema_version', '0')",
    'CREATE TABLE devices (id TEXT PRIMARY KEY)',
    'CREATE TABLE languages (id INTEGER PRIMARY KEY)',
  ].join(';\n'),
};

const m2: Migration = {
  version: 2,
  sql: [
    'CREATE TABLE artists (id TEXT PRIMARY KEY)',
    'CREATE TABLE songs (id TEXT PRIMARY KEY)',
  ].join(';\n'),
};

const m1WithPragma: Migration = {
  version: 1,
  sql: [
    'PRAGMA foreign_keys = ON',
    'CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
    "INSERT INTO app_metadata (key, value) VALUES ('schema_version', '0')",
  ].join(';\n'),
};

describe('MigrationRunner', () => {
  describe('fresh install (version 0)', () => {
    it('runs all migrations', async () => {
      const { mock } = createMockDb();
      const runner = new MigrationRunner(mock, [m1, m2]);

      const report = await runner.run();

      expect(report.currentVersion).toBe(0);
      expect(report.finalVersion).toBe(2);
      expect(report.results).toHaveLength(2);
      expect(report.results[0]).toMatchObject({ version: 1, status: 'SUCCESS' });
      expect(report.results[1]).toMatchObject({ version: 2, status: 'SUCCESS' });
      expect(report.integrityCheck).toBe('ok');
      expect(report.foreignKeyCheck).toBe('');
    });

    it('updates schema_version for each migration', async () => {
      const { mock } = createMockDb();
      const runner = new MigrationRunner(mock, [m1, m2]);

      await runner.run();

      const executeCalls = (mock.execute as jest.Mock).mock.calls;
      const versionUpdates = executeCalls.filter(
        (c: unknown[]) =>
          Array.isArray(c) &&
          typeof c[0] === 'string' &&
          c[0].includes("UPDATE app_metadata SET value = ? WHERE key = 'schema_version'"),
      );
      expect(versionUpdates).toHaveLength(2);
      expect(versionUpdates[0][1]).toEqual(['1']);
      expect(versionUpdates[1][1]).toEqual(['2']);
    });
  });

  describe('incremental upgrade (version 1 → 2)', () => {
    it('runs only migration 2', async () => {
      const { mock } = createMockDb({ schemaVersion: '1' });
      const runner = new MigrationRunner(mock, [m1, m2]);

      const report = await runner.run();

      expect(report.currentVersion).toBe(1);
      expect(report.finalVersion).toBe(2);
      expect(report.results).toHaveLength(1);
      expect(report.results[0]).toMatchObject({ version: 2, status: 'SUCCESS' });

      // Migration 1 SQL should NOT have been executed
      const executeCalls = (mock.execute as jest.Mock).mock.calls;
      const createTableCalls = executeCalls.filter(
        (c: unknown[]) =>
          Array.isArray(c) &&
          typeof c[0] === 'string' &&
          c[0].includes('CREATE TABLE devices'),
      );
      expect(createTableCalls).toHaveLength(0);
    });
  });

  describe('idempotency (version 2 → 2)', () => {
    it('no migrations run when already up-to-date', async () => {
      const { mock } = createMockDb({ schemaVersion: '2' });
      const runner = new MigrationRunner(mock, [m1, m2]);

      const report = await runner.run();

      expect(report.currentVersion).toBe(2);
      expect(report.finalVersion).toBe(2);
      expect(report.results).toHaveLength(0);

      // No migration SQL executed
      const executeCalls = (mock.execute as jest.Mock).mock.calls;
      const versionUpdates = executeCalls.filter(
        (c: unknown[]) =>
          Array.isArray(c) &&
          typeof c[0] === 'string' &&
          c[0].includes("UPDATE app_metadata SET value = ? WHERE key = 'schema_version'"),
      );
      expect(versionUpdates).toHaveLength(0);
    });

    it('integrity checks still run', async () => {
      const { mock } = createMockDb({ schemaVersion: '2' });
      const runner = new MigrationRunner(mock, [m1, m2]);

      await runner.run();

      const queryCalls = (mock.query as jest.Mock).mock.calls;
      const integrityCalls = queryCalls.filter(
        (c: unknown[]) =>
          Array.isArray(c) && typeof c[0] === 'string' && c[0].includes('PRAGMA integrity_check'),
      );
      expect(integrityCalls).toHaveLength(1);
    });
  });

  describe('migration error handling', () => {
    it('records FAILED status and stops processing', async () => {
      const { mock } = createMockDb({
        schemaVersion: '1',
        executeError: 'CREATE TABLE artists',
      });
      const runner = new MigrationRunner(mock, [m1, m2]);

      const report = await runner.run();

      expect(report.currentVersion).toBe(1);
      expect(report.finalVersion).toBe(1);
      expect(report.results).toHaveLength(1);
      expect(report.results[0]).toMatchObject({
        version: 2,
        status: 'FAILED',
      });
      expect(report.results[0].error).toContain('Mock execute error');
    });

    it('does not update schema_version on failure', async () => {
      const { mock, metadata } = createMockDb({
        schemaVersion: '1',
        executeError: 'CREATE TABLE artists',
      });
      const runner = new MigrationRunner(mock, [m1, m2]);

      await runner.run();

      expect(metadata.get('schema_version')).toBe('1');
    });
  });

  describe('version gap detection', () => {
    it('throws on non-consecutive pending versions', async () => {
      const { mock } = createMockDb({ schemaVersion: '0' });
      const m3: Migration = { version: 3, sql: 'CREATE TABLE books (id TEXT)' };
      const runner = new MigrationRunner(mock, [m1, m3]);

      await expect(runner.run()).rejects.toThrow('Missing migration: version 2');
    });

    it('throws when first pending version is not currentVersion + 1', async () => {
      const { mock } = createMockDb({ schemaVersion: '0' });
      const runner = new MigrationRunner(mock, [m2]);

      await expect(runner.run()).rejects.toThrow('Missing migration: version 1');
    });
  });

  describe('missing schema_version key', () => {
    it('throws when app_metadata exists but key is missing', async () => {
      const { mock } = createMockDb({ schemaVersion: null });
      const runner = new MigrationRunner(mock, [m1]);

      await expect(runner.run()).rejects.toThrow('schema_version key not found');
    });
  });

  describe('invalid schema_version value', () => {
    it('throws on non-numeric value', async () => {
      const { mock } = createMockDb({ schemaVersion: 'abc' });
      const runner = new MigrationRunner(mock, [m1]);

      await expect(runner.run()).rejects.toThrow('Invalid schema_version value');
    });
  });

  describe('PRAGMA routing', () => {
    it('routes PRAGMA statements to query() and DDL to execute()', async () => {
      const { mock } = createMockDb();
      const runner = new MigrationRunner(mock, [m1WithPragma]);

      await runner.run();

      const queryCalls = (mock.query as jest.Mock).mock.calls;
      const pragmaInQuery = queryCalls.some(
        (c: unknown[]) =>
          Array.isArray(c) &&
          typeof c[0] === 'string' &&
          c[0].includes('PRAGMA foreign_keys = ON'),
      );
      expect(pragmaInQuery).toBe(true);

      const executeCalls = (mock.execute as jest.Mock).mock.calls;
      const createInExecute = executeCalls.some(
        (c: unknown[]) =>
          Array.isArray(c) &&
          typeof c[0] === 'string' &&
          c[0].includes('CREATE TABLE app_metadata'),
      );
      expect(createInExecute).toBe(true);

      // PRAGMA should NOT be in execute calls
      const pragmaInExecute = executeCalls.some(
        (c: unknown[]) =>
          Array.isArray(c) &&
          typeof c[0] === 'string' &&
          c[0].includes('PRAGMA foreign_keys'),
      );
      expect(pragmaInExecute).toBe(false);
    });
  });

  describe('version update order', () => {
    it('version update is the last execute call in the transaction', async () => {
      const { mock } = createMockDb();
      const runner = new MigrationRunner(mock, [m1WithPragma]);

      await runner.run();

      // Get all execute calls inside the transaction
      const executeCalls = (mock.execute as jest.Mock).mock.calls;
      const versionUpdateIndex = executeCalls.findIndex(
        (c: unknown[]) =>
          Array.isArray(c) &&
          typeof c[0] === 'string' &&
          c[0].includes("UPDATE app_metadata SET value = ? WHERE key = 'schema_version'"),
      );
      const totalExecutes = executeCalls.length;

      // Version update should be the last execute call
      expect(versionUpdateIndex).toBe(totalExecutes - 1);
    });
  });

  describe('empty migrations array', () => {
    it('completes cleanly with no errors', async () => {
      const { mock } = createMockDb({ schemaVersion: '0' });
      const runner = new MigrationRunner(mock, []);

      const report = await runner.run();

      expect(report.currentVersion).toBe(0);
      expect(report.finalVersion).toBe(0);
      expect(report.results).toHaveLength(0);
      expect(report.integrityCheck).toBe('ok');
    });
  });

  describe('post-migration integrity checks', () => {
    it('PRAGMA integrity_check is always executed', async () => {
      const { mock } = createMockDb({ schemaVersion: '2' });
      const runner = new MigrationRunner(mock, [m1, m2]);

      await runner.run();

      const queryCalls = (mock.query as jest.Mock).mock.calls;
      const integrityCalls = queryCalls.filter(
        (c: unknown[]) =>
          Array.isArray(c) && typeof c[0] === 'string' && c[0].includes('PRAGMA integrity_check'),
      );
      expect(integrityCalls).toHaveLength(1);
    });

    it('PRAGMA foreign_key_check is always executed', async () => {
      const { mock } = createMockDb({ schemaVersion: '2' });
      const runner = new MigrationRunner(mock, [m1, m2]);

      await runner.run();

      const queryCalls = (mock.query as jest.Mock).mock.calls;
      const fkCalls = queryCalls.filter(
        (c: unknown[]) =>
          Array.isArray(c) &&
          typeof c[0] === 'string' &&
          c[0].includes('PRAGMA foreign_key_check'),
      );
      expect(fkCalls).toHaveLength(1);
    });
  });

  describe('MigrationReport shape', () => {
    it('contains all required fields', async () => {
      const { mock } = createMockDb();
      const runner = new MigrationRunner(mock, [m1]);

      const report = await runner.run();

      expect(report).toHaveProperty('startedAt');
      expect(report).toHaveProperty('completedAt');
      expect(report).toHaveProperty('currentVersion');
      expect(report).toHaveProperty('finalVersion');
      expect(report).toHaveProperty('results');
      expect(report).toHaveProperty('integrityCheck');
      expect(report).toHaveProperty('foreignKeyCheck');
      expect(typeof report.startedAt).toBe('string');
      expect(typeof report.completedAt).toBe('string');
      expect(report.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(report.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('splitStatements', () => {
    let runner: MigrationRunner;

    beforeEach(() => {
      const { mock } = createMockDb();
      runner = new MigrationRunner(mock, []);
    });

    it('splits basic semicolon-delimited SQL', () => {
      expect(
        (runner as any).splitStatements(
          'CREATE TABLE a (id INT);\nINSERT INTO a VALUES (1);',
        ),
      ).toEqual(['CREATE TABLE a (id INT)', 'INSERT INTO a VALUES (1)']);
    });

    it('handles trailing semicolon', () => {
      expect((runner as any).splitStatements('SELECT 1;\n')).toEqual(['SELECT 1']);
    });

    it('handles blank lines between statements', () => {
      expect(
        (runner as any).splitStatements('SELECT 1;\n\nSELECT 2;'),
      ).toEqual(['SELECT 1', 'SELECT 2']);
    });

    it('does not split inside single-quoted string literals', () => {
      expect(
        (runner as any).splitStatements(
          "INSERT INTO t (val) VALUES ('hello;world');",
        ),
      ).toEqual(["INSERT INTO t (val) VALUES ('hello;world')"]);
    });

    it('does not split inside double-quoted string literals', () => {
      expect(
        (runner as any).splitStatements(
          'INSERT INTO t (val) VALUES ("hello;world");',
        ),
      ).toEqual(['INSERT INTO t (val) VALUES ("hello;world")']);
    });

    it('handles multi-line statements', () => {
      expect(
        (runner as any).splitStatements(
          'CREATE TABLE t (\n  id INT,\n  name TEXT\n);',
        ),
      ).toEqual(['CREATE TABLE t (\n  id INT,\n  name TEXT\n)']);
    });

    it('handles statement without trailing semicolon', () => {
      expect((runner as any).splitStatements('SELECT 1')).toEqual(['SELECT 1']);
    });

    it('handles empty input', () => {
      expect((runner as any).splitStatements('')).toEqual([]);
    });

    it('handles whitespace-only input', () => {
      expect((runner as any).splitStatements('   \n  \n  ')).toEqual([]);
    });
  });

  describe('isPragmaStatement', () => {
    let runner: MigrationRunner;

    beforeEach(() => {
      const { mock } = createMockDb();
      runner = new MigrationRunner(mock, []);
    });

    it('detects PRAGMA statements', () => {
      expect((runner as any).isPragmaStatement('PRAGMA foreign_keys = ON')).toBe(true);
    });

    it('detects lowercase PRAGMA', () => {
      expect((runner as any).isPragmaStatement('pragma journal_mode = WAL')).toBe(true);
    });

    it('detects PRAGMA with leading whitespace', () => {
      expect((runner as any).isPragmaStatement('  PRAGMA synchronous = NORMAL')).toBe(true);
    });

    it('rejects non-PRAGMA statements', () => {
      expect((runner as any).isPragmaStatement('CREATE TABLE t (id INT)')).toBe(false);
    });

    it('rejects SELECT with pragma_table', () => {
      expect((runner as any).isPragmaStatement('SELECT * FROM pragma_table')).toBe(false);
    });
  });
});
