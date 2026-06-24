import type { DatabaseConnection } from '../../../data/database/DatabaseConnection.js';
import { SyncLogRepository } from '../../../data/repositories/SyncLogRepository.js';

function createMockDb(options?: {
  queryResult?: Record<string, unknown>[];
}) {
  const calls: { method: string; sql: string; params?: unknown[] }[] = [];

  const mock: DatabaseConnection = {
    open: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),

    execute: jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
      calls.push({ method: 'execute', sql, params });
    }),

    query: jest.fn().mockImplementation(async <T>(_sql: string, _params?: unknown[]): Promise<T[]> => {
      calls.push({ method: 'query', sql: _sql, params: _params });
      return (options?.queryResult ?? []) as T[];
    }),

    transaction: jest.fn().mockImplementation(
      async <T>(fn: (db: DatabaseConnection) => Promise<T>): Promise<T> => {
        return fn(mock);
      },
    ),
  };

  return { mock, calls };
}

describe('SyncLogRepository', () => {
  describe('constructor', () => {
    it('stores DatabaseConnection', () => {
      const { mock } = createMockDb();
      const repo = new SyncLogRepository(mock);

      expect(repo).toBeDefined();
    });
  });

  describe('findById()', () => {
    it('returns SyncLog when found', async () => {
      const log = {
        id: 1,
        device_id: 'device-1',
        started_at: '2026-01-01T00:00:00.000Z',
        completed_at: '2026-01-01T00:01:00.000Z',
        direction: 'MERGE',
        status: 'SUCCESS',
        records_affected: 15,
        error_message: null,
      };
      const { mock } = createMockDb({ queryResult: [log] });
      const repo = new SyncLogRepository(mock);

      const result = await repo.findById(1);

      expect(result).toEqual(log);
      expect(mock.query).toHaveBeenCalledWith(
        'SELECT * FROM sync_log WHERE id = ?',
        [1],
      );
    });

    it('returns SyncLog with nullable completed_at and error_message', async () => {
      const log = {
        id: 1,
        device_id: 'device-1',
        started_at: '2026-01-01T00:00:00.000Z',
        completed_at: null,
        direction: 'UPLOAD',
        status: 'IN_PROGRESS',
        records_affected: 0,
        error_message: null,
      };
      const { mock } = createMockDb({ queryResult: [log] });
      const repo = new SyncLogRepository(mock);

      const result = await repo.findById(1);

      expect(result).not.toBeNull();
      expect(result!.completed_at).toBeNull();
      expect(result!.error_message).toBeNull();
    });

    it('returns null when not found', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new SyncLogRepository(mock);

      const result = await repo.findById(999);

      expect(result).toBeNull();
    });
  });

  describe('findByDeviceId()', () => {
    it('returns logs for device, ordered by started_at DESC', async () => {
      const logs = [
        { id: 2, device_id: 'd1', started_at: '2026-01-02', completed_at: null, direction: 'MERGE', status: 'IN_PROGRESS', records_affected: 0, error_message: null },
        { id: 1, device_id: 'd1', started_at: '2026-01-01', completed_at: '2026-01-01', direction: 'UPLOAD', status: 'SUCCESS', records_affected: 5, error_message: null },
      ];
      const { mock } = createMockDb({ queryResult: logs });
      const repo = new SyncLogRepository(mock);

      const result = await repo.findByDeviceId('d1');

      expect(result).toEqual(logs);
      expect(mock.query).toHaveBeenCalledWith(
        'SELECT * FROM sync_log WHERE device_id = ? ORDER BY started_at DESC',
        ['d1'],
      );
    });

    it('returns [] for device with no logs', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new SyncLogRepository(mock);

      const result = await repo.findByDeviceId('no-device');

      expect(result).toEqual([]);
    });
  });

  describe('findRecent()', () => {
    it('returns logs ordered by started_at DESC', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new SyncLogRepository(mock);

      await repo.findRecent();

      const sql = (mock.query as jest.Mock).mock.calls[0][0] as string;
      expect(sql).toContain('ORDER BY started_at DESC');
    });

    it('defaults to LIMIT 20', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new SyncLogRepository(mock);

      await repo.findRecent();

      const params = (mock.query as jest.Mock).mock.calls[0][1] as unknown[];
      expect(params[0]).toBe(20);
    });

    it('uses LIMIT 5 when specified', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new SyncLogRepository(mock);

      await repo.findRecent(5);

      const params = (mock.query as jest.Mock).mock.calls[0][1] as unknown[];
      expect(params[0]).toBe(5);
    });

    it('returns [] when no logs', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new SyncLogRepository(mock);

      const result = await repo.findRecent();

      expect(result).toEqual([]);
    });
  });

  describe('create()', () => {
    it('sets status=IN_PROGRESS literal', async () => {
      const { mock } = createMockDb({ queryResult: [{ id: 5 }] });
      const repo = new SyncLogRepository(mock);

      await repo.create({ device_id: 'd1', direction: 'MERGE' });

      const params = (mock.execute as jest.Mock).mock.calls[0][1] as unknown[];
      expect(params[3]).toBe('IN_PROGRESS');
    });

    it('sets started_at to ISO-8601 timestamp', async () => {
      const { mock } = createMockDb({ queryResult: [{ id: 5 }] });
      const repo = new SyncLogRepository(mock);

      await repo.create({ device_id: 'd1', direction: 'UPLOAD' });

      const params = (mock.execute as jest.Mock).mock.calls[0][1] as unknown[];
      expect(params[1]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('sets records_affected=0, completed_at=NULL, error_message=NULL', async () => {
      const { mock } = createMockDb({ queryResult: [{ id: 5 }] });
      const repo = new SyncLogRepository(mock);

      await repo.create({ device_id: 'd1', direction: 'DOWNLOAD' });

      const sql = (mock.execute as jest.Mock).mock.calls[0][0] as string;
      expect(sql).toContain('completed_at,');
      expect(sql).toContain('?, ?, 0, NULL)');
    });

    it('retrieves auto-generated id via last_insert_rowid()', async () => {
      const { mock } = createMockDb({ queryResult: [{ id: 5 }] });
      const repo = new SyncLogRepository(mock);

      const result = await repo.create({ device_id: 'd1', direction: 'MERGE' });

      expect(result.id).toBe(5);
      expect(mock.query).toHaveBeenCalledWith(
        'SELECT last_insert_rowid() AS id',
      );
    });

    it('returns full SyncLog with generated id', async () => {
      const { mock } = createMockDb({ queryResult: [{ id: 10 }] });
      const repo = new SyncLogRepository(mock);

      const result = await repo.create({ device_id: 'abc', direction: 'UPLOAD' });

      expect(result).toEqual({
        id: 10,
        device_id: 'abc',
        started_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        completed_at: null,
        direction: 'UPLOAD',
        status: 'IN_PROGRESS',
        records_affected: 0,
        error_message: null,
      });
    });

    it('uses ? placeholders', async () => {
      const { mock } = createMockDb({ queryResult: [{ id: 1 }] });
      const repo = new SyncLogRepository(mock);

      await repo.create({ device_id: 'test-id', direction: 'MERGE' });

      const sql = (mock.execute as jest.Mock).mock.calls[0][0] as string;
      expect(sql).not.toContain('test-id');
      expect(sql).toContain('?, ?, NULL, ?, ?, 0, NULL');
    });
  });

  describe('markCompleted()', () => {
    it('sets completed_at, status, records_affected', async () => {
      const { mock } = createMockDb();
      const repo = new SyncLogRepository(mock);

      await repo.markCompleted(1, 'SUCCESS', 15);

      const call = (mock.execute as jest.Mock).mock.calls[0];
      const sql = call[0] as string;
      const params = call[1] as unknown[];

      expect(sql).toContain('UPDATE sync_log SET');
      expect(params[0]).toBe('SUCCESS');
      expect(params[1]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(params[2]).toBe(15);
    });

    it('sets error_message=null when not provided', async () => {
      const { mock } = createMockDb();
      const repo = new SyncLogRepository(mock);

      await repo.markCompleted(1, 'SUCCESS', 0);

      const params = (mock.execute as jest.Mock).mock.calls[0][1] as unknown[];
      expect(params[3]).toBeNull();
    });

    it('sets error_message when provided (FAILURE case)', async () => {
      const { mock } = createMockDb();
      const repo = new SyncLogRepository(mock);

      await repo.markCompleted(1, 'FAILURE', 0, 'Connection timeout');

      const params = (mock.execute as jest.Mock).mock.calls[0][1] as unknown[];
      expect(params[3]).toBe('Connection timeout');
    });

    it('uses ? placeholders', async () => {
      const { mock } = createMockDb();
      const repo = new SyncLogRepository(mock);

      await repo.markCompleted(1, 'SUCCESS', 5);

      const sql = (mock.execute as jest.Mock).mock.calls[0][0] as string;
      expect(sql).toContain('WHERE id = ?');
    });

    it('does not throw for non-existent id', async () => {
      const { mock } = createMockDb();
      const repo = new SyncLogRepository(mock);

      await expect(
        repo.markCompleted(999, 'SUCCESS', 0),
      ).resolves.toBeUndefined();
    });
  });

  describe('count()', () => {
    it('returns correct number', async () => {
      const { mock } = createMockDb({ queryResult: [{ count: 42 }] });
      const repo = new SyncLogRepository(mock);

      const result = await repo.count();

      expect(result).toBe(42);
    });

    it('returns 0 for empty table', async () => {
      const { mock } = createMockDb({ queryResult: [{ count: 0 }] });
      const repo = new SyncLogRepository(mock);

      const result = await repo.count();

      expect(result).toBe(0);
    });
  });

  describe('async behavior', () => {
    it('all methods return Promise instances', () => {
      const { mock } = createMockDb({ queryResult: [{ count: 0 }] });
      const repo = new SyncLogRepository(mock);

      expect(repo.findById(1)).toBeInstanceOf(Promise);
      expect(repo.findByDeviceId('d')).toBeInstanceOf(Promise);
      expect(repo.findRecent()).toBeInstanceOf(Promise);
      expect(repo.create({ device_id: 'd', direction: 'MERGE' })).toBeInstanceOf(Promise);
      expect(repo.markCompleted(1, 'SUCCESS', 0)).toBeInstanceOf(Promise);
      expect(repo.count()).toBeInstanceOf(Promise);
    });
  });
});
