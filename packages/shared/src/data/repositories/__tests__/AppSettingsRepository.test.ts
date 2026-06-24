import type { DatabaseConnection } from '../../../data/database/DatabaseConnection.js';
import { DatabaseError } from '../../../data/database/DatabaseError.js';
import { AppSettingsRepository } from '../../../data/repositories/AppSettingsRepository.js';
import type { AppSettingsKey } from '../../../domain/models/AppSettingsKey.js';
import { APP_SETTINGS_KEYS } from '../../../domain/models/AppSettingsKey.js';

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

describe('AppSettingsRepository', () => {
  describe('constructor', () => {
    it('stores DatabaseConnection', () => {
      const { mock } = createMockDb();
      const repo = new AppSettingsRepository(mock);

      expect(repo).toBeDefined();
    });
  });

  describe('get()', () => {
    it('returns value when key exists', async () => {
      const { mock } = createMockDb({ queryResult: [{ value: 'dark' }] });
      const repo = new AppSettingsRepository(mock);

      const result = await repo.get('theme');

      expect(result).toBe('dark');
      expect(mock.query).toHaveBeenCalledWith(
        'SELECT value FROM app_settings WHERE key = ?',
        ['theme'],
      );
    });

    it('returns null when key not set', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new AppSettingsRepository(mock);

      const result = await repo.get('theme');

      expect(result).toBeNull();
    });

    it('throws DatabaseError on invalid key', async () => {
      const { mock, calls } = createMockDb();
      const repo = new AppSettingsRepository(mock);

      await expect(
        repo.get('invalid' as AppSettingsKey),
      ).rejects.toThrow(DatabaseError);

      await expect(
        repo.get('invalid' as AppSettingsKey),
      ).rejects.toThrow('Unknown app_settings key');

      expect(calls).toHaveLength(0);
    });
  });

  describe('set()', () => {
    it('executes INSERT OR REPLACE with key, value, timestamp', async () => {
      const { mock } = createMockDb();
      const repo = new AppSettingsRepository(mock);

      await repo.set('theme', 'dark');

      expect(mock.execute).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)',
        ['theme', 'dark', expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)],
      );
    });

    it('generates ISO-8601 updated_at as third parameter', async () => {
      const { mock } = createMockDb();
      const repo = new AppSettingsRepository(mock);

      await repo.set('theme', 'dark');

      const params = (mock.execute as jest.Mock).mock.calls[0][1] as unknown[];
      expect(params[2]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('overwrites existing key', async () => {
      const { mock } = createMockDb();
      const repo = new AppSettingsRepository(mock);

      await repo.set('theme', 'light');
      await repo.set('theme', 'dark');

      expect(mock.execute).toHaveBeenCalledTimes(2);
      const secondCall = (mock.execute as jest.Mock).mock.calls[1];
      expect(secondCall[1][1]).toBe('dark');
    });

    it('throws DatabaseError on invalid key', async () => {
      const { mock, calls } = createMockDb();
      const repo = new AppSettingsRepository(mock);

      await expect(
        repo.set('invalid' as AppSettingsKey, 'val'),
      ).rejects.toThrow(DatabaseError);

      expect(calls).toHaveLength(0);
    });

    it('uses ? placeholders, not string interpolation', async () => {
      const { mock } = createMockDb();
      const repo = new AppSettingsRepository(mock);

      await repo.set('theme', 'dark');

      const sql = (mock.execute as jest.Mock).mock.calls[0][0] as string;
      expect(sql).not.toContain('dark');
      expect(sql).toContain('?, ?, ?');
    });
  });

  describe('getAll()', () => {
    it('returns all rows as key-value object', async () => {
      const { mock } = createMockDb({
        queryResult: [
          { key: 'theme', value: 'dark' },
          { key: 'sync_on_startup', value: 'true' },
          { key: 'auto_sync_delay_seconds', value: '120' },
        ],
      });
      const repo = new AppSettingsRepository(mock);

      const result = await repo.getAll();

      expect(result).toEqual({
        theme: 'dark',
        sync_on_startup: 'true',
        auto_sync_delay_seconds: '120',
      });
    });

    it('returns {} when no rows', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new AppSettingsRepository(mock);

      const result = await repo.getAll();

      expect(result).toEqual({});
    });
  });

  describe('has()', () => {
    it('returns true when key exists', async () => {
      const { mock } = createMockDb({ queryResult: [{ one: 1 }] });
      const repo = new AppSettingsRepository(mock);

      const result = await repo.has('theme');

      expect(result).toBe(true);
      expect(mock.query).toHaveBeenCalledWith(
        'SELECT 1 AS one FROM app_settings WHERE key = ?',
        ['theme'],
      );
    });

    it('returns false when key not set', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new AppSettingsRepository(mock);

      const result = await repo.has('theme');

      expect(result).toBe(false);
    });

    it('throws DatabaseError on invalid key', async () => {
      const { mock, calls } = createMockDb();
      const repo = new AppSettingsRepository(mock);

      await expect(
        repo.has('invalid' as AppSettingsKey),
      ).rejects.toThrow(DatabaseError);

      expect(calls).toHaveLength(0);
    });
  });

  describe('APP_SETTINGS_KEYS constant', () => {
    it('contains all 5 well-known keys', () => {
      expect(APP_SETTINGS_KEYS).toHaveLength(5);
      expect(APP_SETTINGS_KEYS).toContain('trash_retention_days');
      expect(APP_SETTINGS_KEYS).toContain('theme');
      expect(APP_SETTINGS_KEYS).toContain('default_view');
      expect(APP_SETTINGS_KEYS).toContain('sync_on_startup');
      expect(APP_SETTINGS_KEYS).toContain('auto_sync_delay_seconds');
    });

    it('has no duplicate entries', () => {
      expect(new Set(APP_SETTINGS_KEYS).size).toBe(APP_SETTINGS_KEYS.length);
    });
  });

  describe('async behavior', () => {
    it('get returns a Promise', () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new AppSettingsRepository(mock);

      const result = repo.get('theme');
      expect(result).toBeInstanceOf(Promise);
    });

    it('set returns a Promise', () => {
      const { mock } = createMockDb();
      const repo = new AppSettingsRepository(mock);

      const result = repo.set('theme', 'dark');
      expect(result).toBeInstanceOf(Promise);
    });
  });
});
