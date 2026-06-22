jest.mock('@capacitor-community/sqlite', () => {
  const mockDbConn = {
    open: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    execute: jest.fn().mockResolvedValue({ changes: { changes: 0 } }),
    run: jest.fn().mockResolvedValue({ changes: { changes: 0 } }),
    query: jest.fn().mockResolvedValue({ values: [] }),
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
  };

  const mockSqlite = {
    isConnection: jest.fn().mockResolvedValue({ result: false }),
    createConnection: jest.fn().mockResolvedValue(mockDbConn),
    retrieveConnection: jest.fn().mockResolvedValue(mockDbConn),
    closeConnection: jest.fn().mockResolvedValue(undefined),
  };

  return {
    SQLiteConnection: jest.fn().mockImplementation(() => mockSqlite),
    CapacitorSQLite: {},
    __mockDbConn: mockDbConn,
    __mockSqlite: mockSqlite,
  };
});

import { CapacitorSqliteConnection } from '../CapacitorSqliteConnection.js';
import { DatabaseError, ConstraintError, ConnectionError } from '@collectio/shared';

interface MockDbConn {
  open: jest.Mock;
  close: jest.Mock;
  execute: jest.Mock;
  run: jest.Mock;
  query: jest.Mock;
  beginTransaction: jest.Mock;
  commitTransaction: jest.Mock;
  rollbackTransaction: jest.Mock;
}

interface MockSqlite {
  isConnection: jest.Mock;
  createConnection: jest.Mock;
  retrieveConnection: jest.Mock;
  closeConnection: jest.Mock;
}

interface MockModule {
  SQLiteConnection: jest.Mock;
  __mockDbConn: MockDbConn;
  __mockSqlite: MockSqlite;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mocks: MockModule = require('@capacitor-community/sqlite');
const mockDbConn = mocks.__mockDbConn;
const mockSqlite = mocks.__mockSqlite;

describe('CapacitorSqliteConnection', () => {
  let conn: CapacitorSqliteConnection;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDbConn.open.mockResolvedValue(undefined);
    mockDbConn.close.mockResolvedValue(undefined);
    mockDbConn.execute.mockResolvedValue({ changes: { changes: 0 } });
    mockDbConn.run.mockResolvedValue({ changes: { changes: 0 } });
    mockDbConn.query.mockResolvedValue({ values: [] });
    mockDbConn.beginTransaction.mockResolvedValue(undefined);
    mockDbConn.commitTransaction.mockResolvedValue(undefined);
    mockDbConn.rollbackTransaction.mockResolvedValue(undefined);
    mockSqlite.isConnection.mockResolvedValue({ result: false });
    mockSqlite.createConnection.mockResolvedValue(mockDbConn);
    mockSqlite.retrieveConnection.mockResolvedValue(mockDbConn);
    mockSqlite.closeConnection.mockResolvedValue(undefined);

    conn = new CapacitorSqliteConnection();
  });

  afterEach(async () => {
    await conn.close();
  });

  describe('open', () => {
    it('succeeds and calls createConnection on first open', async () => {
      await conn.open('test-db');

      expect(mocks.SQLiteConnection).toHaveBeenCalled();
      expect(mockSqlite.isConnection).toHaveBeenCalledWith('test-db', false);
      expect(mockSqlite.createConnection).toHaveBeenCalledWith(
        'test-db',
        false,
        'no-encryption',
        1,
        false,
      );
      expect(mockDbConn.open).toHaveBeenCalled();
    });

    it('sets all 4 PRAGMAs via query() and verifies return values', async () => {
      mockDbConn.query
        .mockResolvedValueOnce({ values: [{ foreign_keys: 1 }] })
        .mockResolvedValueOnce({ values: [{ journal_mode: 'wal' }] })
        .mockResolvedValueOnce({ values: [{ synchronous: 1 }] })
        .mockResolvedValueOnce({ values: [{ busy_timeout: 5000 }] });

      await conn.open('test-db');

      expect(mockDbConn.query).toHaveBeenCalledWith('PRAGMA foreign_keys = ON');
      expect(mockDbConn.query).toHaveBeenCalledWith('PRAGMA journal_mode = WAL');
      expect(mockDbConn.query).toHaveBeenCalledWith(
        'PRAGMA synchronous = NORMAL',
      );
      expect(mockDbConn.query).toHaveBeenCalledWith(
        'PRAGMA busy_timeout = 5000',
      );
    });

    it('uses retrieveConnection when connection already exists', async () => {
      mockSqlite.isConnection.mockResolvedValue({ result: true });

      await conn.open('test-db');

      expect(mockSqlite.retrieveConnection).toHaveBeenCalledWith(
        'test-db',
        false,
      );
      expect(mockSqlite.createConnection).not.toHaveBeenCalled();
    });

    it('uses createConnection when no connection exists', async () => {
      mockSqlite.isConnection.mockResolvedValue({ result: false });

      await conn.open('test-db');

      expect(mockSqlite.createConnection).toHaveBeenCalled();
      expect(mockSqlite.retrieveConnection).not.toHaveBeenCalled();
    });

    it('throws ConnectionError on plugin load failure', async () => {
      // Need fresh module to get _sqlite = null
      jest.resetModules();
      jest.doMock('@capacitor-community/sqlite', () => ({
        SQLiteConnection: jest.fn().mockImplementation(() => {
          throw new Error('Plugin not available');
        }),
        CapacitorSQLite: {},
      }));

      const { CapacitorSqliteConnection: FreshClass } = await import(
        '../CapacitorSqliteConnection.js'
      );
      const c = new FreshClass();
      try {
        await c.open('test-db');
        fail('should have thrown');
      } catch (err) {
        expect((err as Error).name).toBe('ConnectionError');
        expect((err as Error).message).toContain(
          'Failed to initialize SQLite plugin',
        );
      }
    });

    it('throws ConnectionError on connection creation failure', async () => {
      mockSqlite.createConnection.mockRejectedValueOnce(
        new Error('create failed'),
      );

      const c = new CapacitorSqliteConnection();
      try {
        await c.open('test-db');
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ConnectionError);
        expect((err as ConnectionError).message).toContain(
          'Failed to create database connection',
        );
      }
    });

    it('throws ConnectionError on dbConn.open() failure', async () => {
      mockDbConn.open.mockRejectedValueOnce(new Error('open failed'));

      const c = new CapacitorSqliteConnection();
      try {
        await c.open('test-db');
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ConnectionError);
        expect((err as ConnectionError).message).toContain(
          'Failed to open database',
        );
      }
    });

    it('throws ConnectionError on PRAGMA failure and cleans up', async () => {
      mockDbConn.query
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('PRAGMA failed'));

      const c = new CapacitorSqliteConnection();
      try {
        await c.open('test-db');
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ConnectionError);
        expect((err as ConnectionError).message).toContain(
          'Failed to set PRAGMAs',
        );
        expect(mockDbConn.close).toHaveBeenCalled();
      }
    });

    it('reuses module-level SQLiteConnection singleton', async () => {
      // Need fresh module to get _sqlite = null
      jest.resetModules();
      const mockDbConnLocal = {
        open: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
        execute: jest.fn().mockResolvedValue({ changes: { changes: 0 } }),
        query: jest.fn().mockResolvedValue({ values: [] }),
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        commitTransaction: jest.fn().mockResolvedValue(undefined),
        rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      };
      const mockSqliteLocal = {
        isConnection: jest.fn().mockResolvedValue({ result: false }),
        createConnection: jest.fn().mockResolvedValue(mockDbConnLocal),
        retrieveConnection: jest.fn().mockResolvedValue(mockDbConnLocal),
        closeConnection: jest.fn().mockResolvedValue(undefined),
      };
      const mockConstructor = jest.fn().mockImplementation(() => mockSqliteLocal);
      jest.doMock('@capacitor-community/sqlite', () => ({
        SQLiteConnection: mockConstructor,
        CapacitorSQLite: {},
      }));

      const { CapacitorSqliteConnection: FreshClass } = await import(
        '../CapacitorSqliteConnection.js'
      );
      const c1 = new FreshClass();
      const c2 = new FreshClass();

      await c1.open('db-a');
      await c1.close();
      await c2.open('db-b');

      expect(mockConstructor).toHaveBeenCalledTimes(1);
    });

    it('closes existing connection on re-open', async () => {
      await conn.open('test-db');
      expect(mockDbConn.close).not.toHaveBeenCalled();

      await conn.open('test-db');
      expect(mockDbConn.close).toHaveBeenCalled();
    });
  });

  describe('execute', () => {
    beforeEach(async () => {
      await conn.open('test-db');
    });

    it('INSERT with params uses run() with explicit transaction:false', async () => {
      mockDbConn.run.mockResolvedValueOnce({
        changes: { changes: 1 },
      });

      await conn.execute("INSERT INTO t (val) VALUES (?)", ['hello']);

      expect(mockDbConn.run).toHaveBeenCalledWith(
        "INSERT INTO t (val) VALUES (?)",
        ['hello'],
        false,
      );
    });

    it('UPDATE with params uses run() with explicit transaction:false', async () => {
      mockDbConn.run.mockResolvedValueOnce({
        changes: { changes: 1 },
      });

      await conn.execute('UPDATE t SET val = ? WHERE id = ?', ['world', 1]);

      expect(mockDbConn.run).toHaveBeenCalledWith(
        'UPDATE t SET val = ? WHERE id = ?',
        ['world', 1],
        false,
      );
    });

    it('DELETE with params uses run() with explicit transaction:false', async () => {
      mockDbConn.run.mockResolvedValueOnce({
        changes: { changes: 1 },
      });

      await conn.execute('DELETE FROM t WHERE id = ?', [1]);

      expect(mockDbConn.run).toHaveBeenCalledWith(
        'DELETE FROM t WHERE id = ?',
        [1],
        false,
      );
    });

    it('returns void', async () => {
      mockDbConn.run.mockResolvedValueOnce({
        changes: { changes: 1 },
      });

      const result = await conn.execute('INSERT INTO t (val) VALUES (?)', [
        'hello',
      ]);
      expect(result).toBeUndefined();
    });

    it('execute without params uses dbConn.execute()', async () => {
      mockDbConn.execute.mockResolvedValueOnce({
        changes: { changes: 0 },
      });

      await conn.execute('CREATE TABLE t (id INTEGER PRIMARY KEY)');

      expect(mockDbConn.execute).toHaveBeenCalledWith(
        'CREATE TABLE t (id INTEGER PRIMARY KEY)',
        false,
      );
      expect(mockDbConn.run).not.toHaveBeenCalled();
    });

    it('throws ConnectionError when not open', async () => {
      const c = new CapacitorSqliteConnection();
      try {
        await c.execute('SELECT 1');
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ConnectionError);
        expect((err as ConnectionError).message).toContain('not open');
      }
    });

    it('throws ConnectionError after close', async () => {
      await conn.close();
      try {
        await conn.execute('SELECT 1');
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ConnectionError);
      }
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      await conn.open('test-db');
    });

    it('returns rows from result.values', async () => {
      mockDbConn.query.mockResolvedValueOnce({
        values: [{ id: 1, name: 'test' }],
      });

      const rows = await conn.query<{ id: number; name: string }>(
        'SELECT * FROM t',
      );
      expect(rows).toEqual([{ id: 1, name: 'test' }]);
    });

    it('returns empty array when no rows', async () => {
      mockDbConn.query.mockResolvedValueOnce({ values: [] });

      const rows = await conn.query('SELECT * FROM t WHERE id = 999');
      expect(rows).toEqual([]);
    });

    it('returns empty array when values is undefined', async () => {
      mockDbConn.query.mockResolvedValueOnce({});

      const rows = await conn.query('SELECT * FROM t');
      expect(rows).toEqual([]);
    });

    it('passes params to dbConn.query()', async () => {
      mockDbConn.query.mockResolvedValueOnce({ values: [{ id: 1 }] });

      await conn.query('SELECT * FROM t WHERE id = ?', [1]);

      expect(mockDbConn.query).toHaveBeenCalledWith('SELECT * FROM t WHERE id = ?', [1]);
    });

    it('throws ConnectionError when not open', async () => {
      const c = new CapacitorSqliteConnection();
      try {
        await c.query('SELECT 1');
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ConnectionError);
      }
    });
  });

  describe('transaction', () => {
    beforeEach(async () => {
      await conn.open('test-db');
    });

    it('commit path: calls beginTransaction and commitTransaction', async () => {
      mockDbConn.run.mockResolvedValueOnce({
        changes: { changes: 1 },
      });

      const result = await conn.transaction(async (db) => {
        expect(db).toBe(conn);
        await db.execute('INSERT INTO t (val) VALUES (?)', ['a']);
        return 42;
      });

      expect(result).toBe(42);
      expect(mockDbConn.beginTransaction).toHaveBeenCalled();
      expect(mockDbConn.commitTransaction).toHaveBeenCalled();
      expect(mockDbConn.rollbackTransaction).not.toHaveBeenCalled();
    });

    it('rollback path: calls rollbackTransaction when callback throws', async () => {
      mockDbConn.run.mockResolvedValueOnce({
        changes: { changes: 1 },
      });

      try {
        await conn.transaction(async (db) => {
          await db.execute('INSERT INTO t (val) VALUES (?)', ['a']);
          throw new Error('intentional rollback');
        });
        fail('should have thrown');
      } catch (err) {
        expect((err as Error).message).toBe('intentional rollback');
      }

      expect(mockDbConn.beginTransaction).toHaveBeenCalled();
      expect(mockDbConn.rollbackTransaction).toHaveBeenCalled();
      expect(mockDbConn.commitTransaction).not.toHaveBeenCalled();
    });

    it('re-throws the original error after rollback', async () => {
      const originalError = new Error('test error');
      try {
        await conn.transaction(async (db) => {
          await db.execute('INSERT INTO t (val) VALUES (?)', ['x']);
          throw originalError;
        });
        fail('should have thrown');
      } catch (err) {
        expect(err).toBe(originalError);
      }
    });

    it('throws DatabaseError when beginTransaction fails', async () => {
      mockDbConn.beginTransaction.mockRejectedValueOnce(
        new Error('begin failed'),
      );

      try {
        await conn.transaction(async () => 42);
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DatabaseError);
        expect((err as DatabaseError).message).toContain(
          'Failed to begin transaction',
        );
      }
    });

    it('throws DatabaseError when commitTransaction fails', async () => {
      mockDbConn.commitTransaction.mockRejectedValueOnce(
        new Error('commit failed'),
      );

      try {
        await conn.transaction(async () => 42);
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DatabaseError);
        expect((err as DatabaseError).message).toContain(
          'Failed to commit transaction',
        );
        expect(mockDbConn.rollbackTransaction).toHaveBeenCalled();
      }
    });

    it('throws ConnectionError when not open', async () => {
      const c = new CapacitorSqliteConnection();
      try {
        await c.transaction(async () => 42);
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ConnectionError);
      }
    });
  });

  describe('error mapping', () => {
    beforeEach(async () => {
      await conn.open('test-db');
    });

    it('FK violation throws ConstraintError', async () => {
      mockDbConn.run.mockRejectedValueOnce(
        new Error('FOREIGN KEY constraint failed'),
      );

      try {
        await conn.execute('INSERT INTO child (pid) VALUES (?)', [999]);
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ConstraintError);
        expect(err).toBeInstanceOf(DatabaseError);
        expect((err as ConstraintError).constraint).toBe('FOREIGN KEY');
        expect((err as ConstraintError).sql).toBe(
          'INSERT INTO child (pid) VALUES (?)',
        );
        expect((err as ConstraintError).params).toEqual([999]);
        expect((err as ConstraintError).cause).toBeInstanceOf(Error);
      }
    });

    it('NOT NULL violation throws ConstraintError', async () => {
      mockDbConn.run.mockRejectedValueOnce(
        new Error('NOT NULL constraint failed: t.val'),
      );

      try {
        await conn.execute('INSERT INTO t (id) VALUES (?)', [1]);
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ConstraintError);
        expect((err as ConstraintError).constraint).toBe('NOT NULL');
      }
    });

    it('UNIQUE violation throws ConstraintError', async () => {
      mockDbConn.run.mockRejectedValueOnce(
        new Error('UNIQUE constraint failed: t.id'),
      );

      try {
        await conn.execute('INSERT INTO t (id, val) VALUES (?, ?)', [
          1,
          'a',
        ]);
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ConstraintError);
        expect((err as ConstraintError).constraint).toBe('UNIQUE');
      }
    });

    it('SQL syntax error throws DatabaseError (not ConstraintError)', async () => {
      mockDbConn.execute.mockRejectedValueOnce(
        new Error('near "INVALID": syntax error'),
      );

      try {
        await conn.execute('INVALID SQL');
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DatabaseError);
        expect(err).not.toBeInstanceOf(ConstraintError);
      }
    });

    it('non-Error exception wraps in DatabaseError', async () => {
      mockDbConn.execute.mockRejectedValueOnce('string error');

      try {
        await conn.execute('INSERT INTO t VALUES (1)');
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DatabaseError);
      }
    });

    it('carries sql and params on thrown errors', async () => {
      mockDbConn.run.mockRejectedValueOnce(
        new Error('some error'),
      );

      try {
        await conn.execute('INSERT INTO t (val) VALUES (?)', ['x']);
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DatabaseError);
        const errObj = err as Record<string, unknown>;
        expect(errObj.sql).toBe('INSERT INTO t (val) VALUES (?)');
        expect(errObj.params).toEqual(['x']);
      }
    });
  });

  describe('close', () => {
    it('is idempotent', async () => {
      await conn.open('test-db');
      await conn.close();
      await conn.close();
    });

    it('calls dbConn.close()', async () => {
      await conn.open('test-db');
      await conn.close();
      expect(mockDbConn.close).toHaveBeenCalled();
    });

    it('calls sqlite.closeConnection()', async () => {
      await conn.open('test-db');
      await conn.close();
      expect(mockSqlite.closeConnection).toHaveBeenCalledWith(
        'test-db',
        false,
      );
    });
  });

  describe('input validation', () => {
    beforeEach(async () => {
      await conn.open('test-db');
    });

    it('rejects multi-statement SQL', async () => {
      try {
        await conn.execute("INSERT INTO t (val) VALUES (?); DROP TABLE t", [
          'x',
        ]);
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DatabaseError);
        expect((err as DatabaseError).message).toContain('Multiple statements');
      }
    });

    it('rejects parameter count mismatch', async () => {
      try {
        await conn.execute('INSERT INTO t (val) VALUES (?, ?)', ['x']);
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DatabaseError);
        expect((err as DatabaseError).message).toContain(
          'Parameter count mismatch',
        );
      }
    });

    it('rejects empty SQL', async () => {
      try {
        await conn.execute('   ');
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DatabaseError);
        expect((err as DatabaseError).message).toContain('empty');
      }
    });

    it('rejects multi-statement in query', async () => {
      try {
        await conn.query('SELECT 1; SELECT 2');
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DatabaseError);
        expect((err as DatabaseError).message).toContain('Multiple statements');
      }
    });
  });

  describe('lifecycle', () => {
    it('execute before open throws ConnectionError', async () => {
      const c = new CapacitorSqliteConnection();
      try {
        await c.execute('SELECT 1');
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ConnectionError);
      }
    });

    it('query before open throws ConnectionError', async () => {
      const c = new CapacitorSqliteConnection();
      try {
        await c.query('SELECT 1');
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ConnectionError);
      }
    });

    it('transaction before open throws ConnectionError', async () => {
      const c = new CapacitorSqliteConnection();
      try {
        await c.transaction(async () => 42);
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ConnectionError);
      }
    });

    it('can reopen after close', async () => {
      await conn.open('test-db');
      await conn.close();

      mockSqlite.isConnection.mockResolvedValue({ result: false });
      await conn.open('test-db');

      mockDbConn.query.mockResolvedValueOnce({ values: [{ val: 1 }] });
      const rows = await conn.query<{ val: number }>('SELECT 1 as val');
      expect(rows).toEqual([{ val: 1 }]);
    });
  });
});
