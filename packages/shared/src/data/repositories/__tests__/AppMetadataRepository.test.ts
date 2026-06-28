import type { DatabaseConnection } from '../../../data/database/DatabaseConnection.js';
import { DatabaseError } from '../../../data/database/DatabaseError.js';
import { AppMetadataRepository } from '../../../data/repositories/AppMetadataRepository.js';
import type { AppMetadataKey } from '../../../domain/models/AppMetadataKey.js';
import { APP_METADATA_KEYS } from '../../../domain/models/AppMetadataKey.js';

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

describe('AppMetadataRepository', () => {
  describe('get()', () => {
    it('returns value when key exists', async () => {
      const { mock } = createMockDb({ queryResult: [{ value: '2' }] });
      const repo = new AppMetadataRepository(mock);

      const result = await repo.get('schema_version');

      expect(result).toBe('2');
      expect(mock.query).toHaveBeenCalledWith(
        'SELECT value FROM app_metadata WHERE key = ?',
        ['schema_version'],
      );
    });

    it('returns null when key not set', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new AppMetadataRepository(mock);

      const result = await repo.get('initialized');

      expect(result).toBeNull();
    });

    it('throws DatabaseError on invalid key', async () => {
      const { mock, calls } = createMockDb();
      const repo = new AppMetadataRepository(mock);

      await expect(
        repo.get('invalid' as AppMetadataKey),
      ).rejects.toThrow(DatabaseError);

      await expect(
        repo.get('invalid' as AppMetadataKey),
      ).rejects.toThrow('Unknown app_metadata key');

      expect(calls).toHaveLength(0);
    });
  });

  describe('set()', () => {
    it('executes upsert with correct params', async () => {
      const { mock } = createMockDb();
      const repo = new AppMetadataRepository(mock);

      await repo.set('device_id', '550e8400-e29b-41d4-a716-446655440000');

      expect(mock.execute).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?, ?)',
        ['device_id', '550e8400-e29b-41d4-a716-446655440000'],
      );
    });

    it('overwrites existing key', async () => {
      const { mock } = createMockDb();
      const repo = new AppMetadataRepository(mock);

      await repo.set('device_id', 'id-old');
      await repo.set('device_id', 'id-new');

      expect(mock.execute).toHaveBeenCalledTimes(2);
      const secondCall = (mock.execute as jest.Mock).mock.calls[1];
      expect(secondCall[1]).toEqual(['device_id', 'id-new']);
    });

    it('throws DatabaseError on invalid key', async () => {
      const { mock, calls } = createMockDb();
      const repo = new AppMetadataRepository(mock);

      await expect(
        repo.set('invalid' as AppMetadataKey, 'val'),
      ).rejects.toThrow(DatabaseError);

      expect(calls).toHaveLength(0);
    });

    it('uses ? placeholders, not string interpolation', async () => {
      const { mock } = createMockDb();
      const repo = new AppMetadataRepository(mock);

      await repo.set('kdf_salt', 'deadbeef');

      const sql = (mock.execute as jest.Mock).mock.calls[0][0] as string;
      expect(sql).not.toContain('deadbeef');
      expect(sql).toContain('?, ?');
    });
  });

  describe('getAll()', () => {
    it('returns all rows as key-value object', async () => {
      const { mock } = createMockDb({
        queryResult: [
          { key: 'schema_version', value: '0' },
          { key: 'device_id', value: 'abc' },
          { key: 'initialized', value: 'true' },
        ],
      });
      const repo = new AppMetadataRepository(mock);

      const result = await repo.getAll();

      expect(result).toEqual({
        schema_version: '0',
        device_id: 'abc',
        initialized: 'true',
      });
    });

    it('returns empty object when no rows', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new AppMetadataRepository(mock);

      const result = await repo.getAll();

      expect(result).toEqual({});
    });
  });

  describe('has()', () => {
    it('returns true when key exists', async () => {
      const { mock } = createMockDb({ queryResult: [{ one: 1 }] });
      const repo = new AppMetadataRepository(mock);

      const result = await repo.has('schema_version');

      expect(result).toBe(true);
      expect(mock.query).toHaveBeenCalledWith(
        'SELECT 1 AS one FROM app_metadata WHERE key = ?',
        ['schema_version'],
      );
    });

    it('returns false when key not set', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new AppMetadataRepository(mock);

      const result = await repo.has('cloud_file_id');

      expect(result).toBe(false);
    });

    it('throws DatabaseError on invalid key', async () => {
      const { mock, calls } = createMockDb();
      const repo = new AppMetadataRepository(mock);

      await expect(
        repo.has('invalid' as AppMetadataKey),
      ).rejects.toThrow(DatabaseError);

      expect(calls).toHaveLength(0);
    });
  });

  describe('APP_METADATA_KEYS constant', () => {
    it('contains all 7 well-known keys', () => {
      expect(APP_METADATA_KEYS).toHaveLength(7);
      expect(APP_METADATA_KEYS).toContain('schema_version');
      expect(APP_METADATA_KEYS).toContain('device_id');
      expect(APP_METADATA_KEYS).toContain('kdf_salt');
      expect(APP_METADATA_KEYS).toContain('initialized');
      expect(APP_METADATA_KEYS).toContain('last_successful_sync');
      expect(APP_METADATA_KEYS).toContain('cloud_file_id');
      expect(APP_METADATA_KEYS).toContain('cloud_modified_time');
    });

    it('has no duplicate entries', () => {
      expect(new Set(APP_METADATA_KEYS).size).toBe(APP_METADATA_KEYS.length);
    });
  });

  describe('async behavior', () => {
    it('get returns a Promise', () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new AppMetadataRepository(mock);

      const result = repo.get('schema_version');
      expect(result).toBeInstanceOf(Promise);
    });

    it('set returns a Promise', () => {
      const { mock } = createMockDb();
      const repo = new AppMetadataRepository(mock);

      const result = repo.set('schema_version', 'v');
      expect(result).toBeInstanceOf(Promise);
    });
  });
});
