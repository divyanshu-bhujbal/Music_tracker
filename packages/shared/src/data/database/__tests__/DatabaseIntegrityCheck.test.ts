import type { DatabaseConnection } from '../../../data/database/DatabaseConnection.js';
import { DatabaseIntegrityCheck } from '../DatabaseIntegrityCheck.js';

function createMockDb(queryImpl?: {
  integrity_check?: { integrity_check: string }[];
  foreign_key_check?: Record<string, unknown>[];
  error?: Error;
}): { db: DatabaseConnection; queryCalls: string[] } {
  const queryCalls: string[] = [];

  const db: DatabaseConnection = {
    open: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    execute: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockImplementation(async <T>(sql: string): Promise<T[]> => {
      queryCalls.push(sql);
      if (queryImpl?.error) {
        throw queryImpl.error;
      }
      if (sql.includes('PRAGMA integrity_check')) {
        return (queryImpl?.integrity_check ?? [{ integrity_check: 'ok' }]) as T[];
      }
      if (sql.includes('PRAGMA foreign_key_check')) {
        return (queryImpl?.foreign_key_check ?? []) as T[];
      }
      return [] as T[];
    }),
    transaction: jest.fn().mockImplementation(
      async <R>(fn: (db: DatabaseConnection) => Promise<R>): Promise<R> => {
        return fn(db);
      },
    ),
    serialize: jest.fn().mockResolvedValue(new Uint8Array(0)),
  };

  return { db, queryCalls };
}

describe('DatabaseIntegrityCheck', () => {
  describe('check()', () => {
    it('IC-01: healthy database returns healthy: true', async () => {
      const { db } = createMockDb();
      const checker = new DatabaseIntegrityCheck(db);

      const report = await checker.check();

      expect(report.healthy).toBe(true);
      expect(report.integrityResult).toBe('ok');
      expect(report.foreignKeyViolations).toBe(0);
      expect(report.foreignKeyDetails).toBe('');
    });

    it('IC-02: corrupt database returns healthy: false with error text', async () => {
      const { db } = createMockDb({
        integrity_check: [{ integrity_check: 'row 42 missing from index idx_songs_name' }],
      });
      const checker = new DatabaseIntegrityCheck(db);

      const report = await checker.check();

      expect(report.healthy).toBe(false);
      expect(report.integrityResult).toContain('row 42 missing');
    });

    it('IC-03: FK violations set healthy: false with count', async () => {
      const { db } = createMockDb({
        foreign_key_check: [{ table: 'songs', rowid: 1, parent: 'languages' }],
      });
      const checker = new DatabaseIntegrityCheck(db);

      const report = await checker.check();

      expect(report.healthy).toBe(false);
      expect(report.foreignKeyViolations).toBe(1);
      expect(report.foreignKeyDetails).toContain('songs');
    });

    it('IC-04: both integrity and FK violations captured', async () => {
      const { db } = createMockDb({
        integrity_check: [{ integrity_check: 'malformed page 5' }],
        foreign_key_check: [{ table: 'songs', rowid: 1, parent: 'languages' }],
      });
      const checker = new DatabaseIntegrityCheck(db);

      const report = await checker.check();

      expect(report.healthy).toBe(false);
      expect(report.integrityResult).toContain('malformed');
      expect(report.foreignKeyViolations).toBe(1);
    });

    it('IC-05: query throws → healthy: false with error', async () => {
      const { db } = createMockDb({ error: new Error('connection closed') });
      const checker = new DatabaseIntegrityCheck(db);

      const report = await checker.check();

      expect(report.healthy).toBe(false);
      expect(report.integrityResult).toContain('connection closed');
    });

    it('IC-06: checkedAt is a valid ISO-8601 string', async () => {
      const { db } = createMockDb();
      const checker = new DatabaseIntegrityCheck(db);

      const report = await checker.check();

      expect(report.checkedAt).toBeDefined();
      expect(new Date(report.checkedAt).toISOString()).toBe(report.checkedAt);
    });

    it('IC-07: both PRAGMAs are always executed', async () => {
      const { db, queryCalls } = createMockDb();
      const checker = new DatabaseIntegrityCheck(db);

      await checker.check();

      expect(queryCalls).toContain('PRAGMA integrity_check');
      expect(queryCalls).toContain('PRAGMA foreign_key_check');
    });

    it('IC-08: malformed integrity_check result is not healthy', async () => {
      const { db } = createMockDb({
        integrity_check: [{ integrity_check: 'unknown' }],
      });
      const checker = new DatabaseIntegrityCheck(db);

      const report = await checker.check();

      expect(report.healthy).toBe(false);
      expect(report.integrityResult).toBe('unknown');
    });
  });
});
