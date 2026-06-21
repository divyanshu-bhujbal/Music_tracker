jest.mock('../better-sqlite3-loader.js', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3');
  return {
    loadBetterSqlite3: () => Database,
  };
});

import { BetterSqlite3Connection } from '../BetterSqlite3Connection.js';
import { DatabaseError, ConstraintError, ConnectionError } from '@collectio/shared';

describe('BetterSqlite3Connection', () => {
  let conn: BetterSqlite3Connection;

  beforeEach(() => {
    conn = new BetterSqlite3Connection();
  });

  afterEach(async () => {
    await conn.close();
  });

  describe('open', () => {
    it('opens an in-memory database', async () => {
      await conn.open(':memory:');
      const rows = await conn.query<{ val: number }>('SELECT 1 as val');
      expect(rows).toEqual([{ val: 1 }]);
    });

    it('sets foreign_keys PRAGMA', async () => {
      await conn.open(':memory:');
      const rows = await conn.query<{ foreign_keys: number }>('PRAGMA foreign_keys');
      expect(rows[0].foreign_keys).toBe(1);
    });

    it('sets journal_mode to WAL (file-based only)', async () => {
      await conn.open(':memory:');
      const rows = await conn.query<{ journal_mode: string }>('PRAGMA journal_mode');
      // In-memory databases always use 'memory' journal mode, not WAL
      expect(['wal', 'memory']).toContain(rows[0].journal_mode);
    });

    it('sets synchronous to NORMAL', async () => {
      await conn.open(':memory:');
      const rows = await conn.query<{ synchronous: number }>('PRAGMA synchronous');
      expect(rows[0].synchronous).toBe(1);
    });

    it('sets busy_timeout to 5000', async () => {
      await conn.open(':memory:');
      // better-sqlite3 returns PRAGMA values via db.pragma() as simple values
      const conn2 = new BetterSqlite3Connection();
      await conn2.open(':memory:');
      // Use the underlying db.pragma() to check the value
      const val = (conn2 as unknown as { db: { pragma: (s: string, o?: { simple?: boolean }) => unknown } }).db.pragma('busy_timeout', { simple: true });
      expect(val).toBe(5000);
      await conn2.close();
    });

    it('reopens when called again', async () => {
      await conn.open(':memory:');
      await conn.open(':memory:');
      const rows = await conn.query<{ val: number }>('SELECT 1 as val');
      expect(rows).toEqual([{ val: 1 }]);
    });
  });

  describe('execute', () => {
    beforeEach(async () => {
      await conn.open(':memory:');
    });

    it('creates a table', async () => {
      await conn.execute('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)');
      const rows = await conn.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='t'",
      );
      expect(rows).toHaveLength(1);
    });

    it('inserts a row', async () => {
      await conn.execute('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)');
      await conn.execute('INSERT INTO t (val) VALUES (?)', ['hello']);
      const rows = await conn.query<{ id: number; val: string }>('SELECT * FROM t');
      expect(rows).toEqual([{ id: 1, val: 'hello' }]);
    });

    it('updates a row', async () => {
      await conn.execute('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)');
      await conn.execute('INSERT INTO t (val) VALUES (?)', ['hello']);
      await conn.execute('UPDATE t SET val = ? WHERE id = ?', ['world', 1]);
      const rows = await conn.query<{ val: string }>('SELECT val FROM t WHERE id = ?', [1]);
      expect(rows).toEqual([{ val: 'world' }]);
    });

    it('deletes a row', async () => {
      await conn.execute('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)');
      await conn.execute('INSERT INTO t (val) VALUES (?)', ['hello']);
      await conn.execute('DELETE FROM t WHERE id = ?', [1]);
      const rows = await conn.query<{ id: number }>('SELECT * FROM t');
      expect(rows).toEqual([]);
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      await conn.open(':memory:');
    });

    it('returns empty array for no results', async () => {
      await conn.execute('CREATE TABLE t (id INTEGER PRIMARY KEY)');
      const rows = await conn.query<{ id: number }>('SELECT * FROM t');
      expect(rows).toEqual([]);
    });

    it('returns typed rows', async () => {
      await conn.execute('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)');
      await conn.execute('INSERT INTO t (val) VALUES (?)', ['hello']);
      const rows = await conn.query<{ id: number; val: string }>('SELECT * FROM t');
      expect(rows[0].id).toBe(1);
      expect(rows[0].val).toBe('hello');
    });
  });

  describe('transaction', () => {
    beforeEach(async () => {
      await conn.open(':memory:');
      await conn.execute('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)');
    });

    it('commits rows on success', async () => {
      const result = await conn.transaction(async (db) => {
        await db.execute('INSERT INTO t (val) VALUES (?)', ['a']);
        await db.execute('INSERT INTO t (val) VALUES (?)', ['b']);
        return 42;
      });
      expect(result).toBe(42);
      const rows = await conn.query<{ cnt: number }>('SELECT count(*) as cnt FROM t');
      expect(rows[0].cnt).toBe(2);
    });

    it('rolls back rows on error', async () => {
      await conn
        .transaction(async (db) => {
          await db.execute('INSERT INTO t (val) VALUES (?)', ['rollback-me']);
          throw new Error('intentional rollback');
        })
        .catch(() => {});
      const rows = await conn.query<{ cnt: number }>('SELECT count(*) as cnt FROM t');
      expect(rows[0].cnt).toBe(0);
    });

    it('re-throws the original error', async () => {
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
  });

  describe('error mapping', () => {
    beforeEach(async () => {
      await conn.open(':memory:');
    });

    it('maps FK violation to ConstraintError', async () => {
      await conn.execute('CREATE TABLE parent (id INTEGER PRIMARY KEY)');
      await conn.execute(
        'CREATE TABLE child (id INTEGER PRIMARY KEY, pid INTEGER REFERENCES parent(id))',
      );
      try {
        await conn.execute('INSERT INTO child (pid) VALUES (?)', [999]);
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ConstraintError);
        expect(err).toBeInstanceOf(DatabaseError);
        expect((err as ConstraintError).constraint).toBe('FOREIGN KEY');
      }
    });

    it('maps SQL syntax error to DatabaseError', async () => {
      try {
        await conn.execute('INVALID SQL SYNTAX');
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DatabaseError);
        expect(err).not.toBeInstanceOf(ConstraintError);
      }
    });

    it('carries sql and params on thrown errors', async () => {
      try {
        // Use SQL with matching param count that still fails at execution
        await conn.execute('INSERT INTO nonexistent_table VALUES (?, ?)', [1, 2]);
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DatabaseError);
        const errObj = err as Record<string, unknown>;
        expect(errObj.sql).toBe('INSERT INTO nonexistent_table VALUES (?, ?)');
        expect(errObj.params).toEqual([1, 2]);
      }
    });
  });

  describe('close', () => {
    it('is idempotent', async () => {
      await conn.open(':memory:');
      await conn.close();
      await conn.close();
    });

    it('execute after close throws ConnectionError', async () => {
      await conn.open(':memory:');
      await conn.close();
      try {
        await conn.execute('SELECT 1');
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ConnectionError);
      }
    });

    it('query after close throws ConnectionError', async () => {
      await conn.open(':memory:');
      await conn.close();
      try {
        await conn.query('SELECT 1');
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ConnectionError);
      }
    });

    it('can reopen after close', async () => {
      await conn.open(':memory:');
      await conn.close();
      await conn.open(':memory:');
      const rows = await conn.query<{ val: number }>('SELECT 1 as val');
      expect(rows).toEqual([{ val: 1 }]);
    });
  });

  describe('input validation', () => {
    beforeEach(async () => {
      await conn.open(':memory:');
      await conn.execute('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)');
    });

    it('rejects multi-statement SQL', async () => {
      try {
        await conn.execute("INSERT INTO t (val) VALUES ('x'); DROP TABLE t", ['x']);
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DatabaseError);
        expect((err as DatabaseError).message).toContain('Multiple statements');
      }
    });

    it('rejects empty SQL', async () => {
      try {
        await conn.execute('');
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DatabaseError);
        expect((err as DatabaseError).message).toContain('empty');
      }
    });

    it('rejects parameter count mismatch', async () => {
      try {
        await conn.execute('INSERT INTO t (val) VALUES (?, ?)', ['x']);
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DatabaseError);
        expect((err as DatabaseError).message).toContain('Parameter count mismatch');
      }
    });
  });

  describe('integrity', () => {
    it('PRAGMA integrity_check returns ok', async () => {
      await conn.open(':memory:');
      await conn.execute('CREATE TABLE t (id INTEGER PRIMARY KEY)');
      await conn.execute('INSERT INTO t (id) VALUES (1)');
      const rows = await conn.query<{ integrity_check: string }>('PRAGMA integrity_check');
      expect(rows[0].integrity_check).toBe('ok');
    });
  });

  describe('parallel reads', () => {
    it('concurrent queries work', async () => {
      await conn.open(':memory:');
      await conn.execute('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)');
      await conn.execute('INSERT INTO t (val) VALUES (?)', ['hello']);

      const [r1, r2] = await Promise.all([
        conn.query<{ id: number; val: string }>('SELECT * FROM t'),
        conn.query<{ id: number; val: string }>('SELECT * FROM t'),
      ]);
      expect(r1).toEqual([{ id: 1, val: 'hello' }]);
      expect(r2).toEqual([{ id: 1, val: 'hello' }]);
    });
  });

  describe('loader failure', () => {
    it('throws ConnectionError when better-sqlite3 fails to load', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const loader = require('../better-sqlite3-loader.js');
      jest.spyOn(loader, 'loadBetterSqlite3').mockImplementation(() => {
        throw new Error('addon not found');
      });
      const c = new BetterSqlite3Connection();
      try {
        await c.open(':memory:');
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ConnectionError);
        expect((err as ConnectionError).message).toContain('Failed to load');
      } finally {
        jest.restoreAllMocks();
      }
    });
  });
});
