import type { DatabaseConnection } from '../../../data/database/DatabaseConnection.js';
import { DeviceRepository } from '../../../data/repositories/DeviceRepository.js';
import type { Platform } from '../../../domain/models/Device.js';

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

    serialize: jest.fn().mockResolvedValue(new Uint8Array(0)),
    transaction: jest.fn().mockImplementation(
      async <T>(fn: (db: DatabaseConnection) => Promise<T>): Promise<T> => {
        return fn(mock);
      },
    ),
  };

  return { mock, calls };
}

describe('DeviceRepository', () => {
  describe('constructor', () => {
    it('stores DatabaseConnection', () => {
      const { mock } = createMockDb();
      const repo = new DeviceRepository(mock);

      expect(repo).toBeDefined();
    });
  });

  describe('register()', () => {
    it('generates UUID v4, sets timestamps, returns Device', async () => {
      const { mock } = createMockDb();
      const repo = new DeviceRepository(mock);

      const result = await repo.register('My Laptop', 'WINDOWS');

      expect(result.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(result.name).toBe('My Laptop');
      expect(result.platform).toBe('WINDOWS');
      expect(result.registered_at).toBeDefined();
      expect(result.last_seen_at).toBeDefined();
      expect(new Date(result.registered_at).toISOString()).toBe(
        result.registered_at,
      );
    });

    it('uses ? placeholders, not string interpolation', async () => {
      const { mock } = createMockDb();
      const repo = new DeviceRepository(mock);

      await repo.register('Device', 'ANDROID');

      const sql = (mock.execute as jest.Mock).mock.calls[0][0] as string;
      expect(sql).toContain('?, ?, ?, ?, ?');
      expect(sql).not.toContain('Device');
    });

    it('returns Device with correct name and platform', async () => {
      const { mock } = createMockDb();
      const repo = new DeviceRepository(mock);

      const result = await repo.register('Galaxy S23', 'ANDROID');

      expect(result.name).toBe('Galaxy S23');
      expect(result.platform).toBe('ANDROID');
    });
  });

  describe('findById()', () => {
    it('returns Device when found', async () => {
      const device = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Test Device',
        platform: 'WINDOWS' as Platform,
        registered_at: '2026-01-01T00:00:00.000Z',
        last_seen_at: '2026-01-01T00:00:00.000Z',
      };
      const { mock } = createMockDb({ queryResult: [device] });
      const repo = new DeviceRepository(mock);

      const result = await repo.findById('550e8400-e29b-41d4-a716-446655440000');

      expect(result).toEqual(device);
      expect(mock.query).toHaveBeenCalledWith(
        'SELECT * FROM devices WHERE id = ?',
        ['550e8400-e29b-41d4-a716-446655440000'],
      );
    });

    it('returns null when not found', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new DeviceRepository(mock);

      const result = await repo.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findAll()', () => {
    it('returns all devices ordered by registered_at DESC', async () => {
      const devices = [
        { id: '2', name: 'Device 2', platform: 'ANDROID', registered_at: '2026-01-02', last_seen_at: '2026-01-02' },
        { id: '1', name: 'Device 1', platform: 'WINDOWS', registered_at: '2026-01-01', last_seen_at: '2026-01-01' },
      ];
      const { mock } = createMockDb({ queryResult: devices });
      const repo = new DeviceRepository(mock);

      const result = await repo.findAll();

      expect(result).toEqual(devices);
      expect(mock.query).toHaveBeenCalledWith(
        'SELECT * FROM devices ORDER BY registered_at DESC',
      );
    });

    it('returns [] when no devices', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new DeviceRepository(mock);

      const result = await repo.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('updateLastSeen()', () => {
    it('executes UPDATE with ISO-8601 timestamp', async () => {
      const { mock } = createMockDb();
      const repo = new DeviceRepository(mock);

      await repo.updateLastSeen('550e8400-e29b-41d4-a716-446655440000');

      const call = (mock.execute as jest.Mock).mock.calls[0];
      const sql = call[0] as string;
      const params = call[1] as unknown[];

      expect(sql).toBe('UPDATE devices SET last_seen_at = ? WHERE id = ?');
      expect(params[0]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(params[1]).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('uses ? placeholders', async () => {
      const { mock } = createMockDb();
      const repo = new DeviceRepository(mock);

      await repo.updateLastSeen('some-id');

      const sql = (mock.execute as jest.Mock).mock.calls[0][0] as string;
      expect(sql).toContain('WHERE id = ?');
    });

    it('does not throw for non-existent device', async () => {
      const { mock } = createMockDb();
      const repo = new DeviceRepository(mock);

      await expect(
        repo.updateLastSeen('nonexistent'),
      ).resolves.toBeUndefined();
    });
  });

  describe('findByPlatform()', () => {
    it('returns only matching platform devices', async () => {
      const devices = [
        { id: '1', name: 'Android 1', platform: 'ANDROID', registered_at: '2026-01-01', last_seen_at: '2026-01-01' },
      ];
      const { mock } = createMockDb({ queryResult: devices });
      const repo = new DeviceRepository(mock);

      const result = await repo.findByPlatform('ANDROID');

      expect(result).toEqual(devices);
      expect(mock.query).toHaveBeenCalledWith(
        'SELECT * FROM devices WHERE platform = ? ORDER BY registered_at DESC',
        ['ANDROID'],
      );
    });

    it('returns [] when no matches', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new DeviceRepository(mock);

      const result = await repo.findByPlatform('WINDOWS');

      expect(result).toEqual([]);
    });
  });

  describe('count()', () => {
    it('returns correct number', async () => {
      const { mock } = createMockDb({ queryResult: [{ count: 3 }] });
      const repo = new DeviceRepository(mock);

      const result = await repo.count();

      expect(result).toBe(3);
    });

    it('returns 0 for empty table', async () => {
      const { mock } = createMockDb({ queryResult: [{ count: 0 }] });
      const repo = new DeviceRepository(mock);

      const result = await repo.count();

      expect(result).toBe(0);
    });
  });

  describe('async behavior', () => {
    it('all methods return Promise instances', () => {
      const { mock } = createMockDb({ queryResult: [{ count: 0 }] });
      const repo = new DeviceRepository(mock);

      expect(repo.register('d', 'WINDOWS')).toBeInstanceOf(Promise);
      expect(repo.findById('x')).toBeInstanceOf(Promise);
      expect(repo.findAll()).toBeInstanceOf(Promise);
      expect(repo.updateLastSeen('x')).toBeInstanceOf(Promise);
      expect(repo.findByPlatform('WINDOWS')).toBeInstanceOf(Promise);
      expect(repo.count()).toBeInstanceOf(Promise);
    });
  });
});
