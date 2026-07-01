/**
 * Unit tests for SettingsManager.
 *
 * Tests defaults, type coercion, validation, get/set/getAll/reset.
 * Source: E14 Implementation Specification §14.1
 */

import type { DatabaseConnection } from '../../../data/database/DatabaseConnection.js';
import { AppSettingsRepository } from '../../../data/repositories/AppSettingsRepository.js';
import { SettingsManager } from '../SettingsManager.js';

function createMockDb(rows: { key: string; value: string }[] = []) {
  const calls: { method: string; sql: string; params: unknown[] }[] = [];

  const db: DatabaseConnection = {
    open: jest.fn(),
    close: jest.fn(),
    execute: jest.fn().mockImplementation(async (sql: string, params: unknown[]) => {
      calls.push({ method: 'execute', sql, params });
    }),
    query: jest.fn().mockImplementation(async (_sql: string, params: unknown[]) => {
      calls.push({ method: 'query', sql: _sql, params });
      if (_sql.includes('SELECT value FROM app_settings WHERE key')) {
        const key = params[0] as string;
        const match = rows.find((r) => r.key === key);
        return match ? [match] : [];
      }
      if (_sql.includes('SELECT key, value FROM app_settings')) {
        return rows;
      }
      return [];
    }),
    transaction: jest.fn().mockImplementation(async (fn: (db: DatabaseConnection) => Promise<void>) => {
      await fn(db);
    }),
    serialize: jest.fn().mockResolvedValue(new Uint8Array(0)),
  };

  return { db, calls };
}

describe('SettingsManager', () => {
  describe('get()', () => {
    it('SM-01: returns default "light" for theme when not stored', async () => {
      const { db } = createMockDb([]);
      const repo = new AppSettingsRepository(db);
      const manager = new SettingsManager(repo);

      const result = await manager.get('theme');

      expect(result).toBe('light');
    });

    it('SM-02: returns stored value "dark" for theme', async () => {
      const { db } = createMockDb([{ key: 'theme', value: 'dark' }]);
      const repo = new AppSettingsRepository(db);
      const manager = new SettingsManager(repo);

      const result = await manager.get('theme');

      expect(result).toBe('dark');
    });

    it('SM-03: returns boolean false when stored "false" for sync_on_startup', async () => {
      const { db } = createMockDb([{ key: 'sync_on_startup', value: 'false' }]);
      const repo = new AppSettingsRepository(db);
      const manager = new SettingsManager(repo);

      const result = await manager.get('sync_on_startup');

      expect(result).toBe(false);
      expect(typeof result).toBe('boolean');
    });

    it('SM-04: returns boolean true (default) when sync_on_startup not stored', async () => {
      const { db } = createMockDb([]);
      const repo = new AppSettingsRepository(db);
      const manager = new SettingsManager(repo);

      const result = await manager.get('sync_on_startup');

      expect(result).toBe(true);
    });

    it('SM-05: returns number 120 (default) for auto_sync_delay_seconds', async () => {
      const { db } = createMockDb([]);
      const repo = new AppSettingsRepository(db);
      const manager = new SettingsManager(repo);

      const result = await manager.get('auto_sync_delay_seconds');

      expect(result).toBe(120);
      expect(typeof result).toBe('number');
    });

    it('SM-06: parses stored "300" to number 300 for auto_sync_delay_seconds', async () => {
      const { db } = createMockDb([{ key: 'auto_sync_delay_seconds', value: '300' }]);
      const repo = new AppSettingsRepository(db);
      const manager = new SettingsManager(repo);

      const result = await manager.get('auto_sync_delay_seconds');

      expect(result).toBe(300);
      expect(typeof result).toBe('number');
    });

    it('SM-07: returns default 120 for corrupt "abc" auto_sync_delay_seconds', async () => {
      const { db } = createMockDb([{ key: 'auto_sync_delay_seconds', value: 'abc' }]);
      const repo = new AppSettingsRepository(db);
      const manager = new SettingsManager(repo);
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await manager.get('auto_sync_delay_seconds');

      expect(result).toBe(120);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('set()', () => {
    it('SM-08: persists theme "dark" successfully', async () => {
      const { db, calls } = createMockDb([]);
      const repo = new AppSettingsRepository(db);
      const manager = new SettingsManager(repo);

      await manager.set('theme', 'dark');

      expect(calls[0].method).toBe('execute');
      expect(calls[0].sql).toContain('INSERT OR REPLACE');
      expect(calls[0].params).toContain('theme');
      expect(calls[0].params).toContain('dark');
    });

    it('SM-09: throws for theme "invalid"', async () => {
      const { db } = createMockDb([]);
      const repo = new AppSettingsRepository(db);
      const manager = new SettingsManager(repo);

      await expect(manager.set('theme', 'invalid')).rejects.toThrow('Invalid value');
    });

    it('SM-10: throws for auto_sync_delay_seconds 29 (below min)', async () => {
      const { db } = createMockDb([]);
      const repo = new AppSettingsRepository(db);
      const manager = new SettingsManager(repo);

      await expect(manager.set('auto_sync_delay_seconds', 29)).rejects.toThrow('between 30 and 600');
    });

    it('SM-11: throws for auto_sync_delay_seconds 601 (above max)', async () => {
      const { db } = createMockDb([]);
      const repo = new AppSettingsRepository(db);
      const manager = new SettingsManager(repo);

      await expect(manager.set('auto_sync_delay_seconds', 601)).rejects.toThrow('between 30 and 600');
    });

    it('SM-12: succeeds for auto_sync_delay_seconds 120', async () => {
      const { db } = createMockDb([]);
      const repo = new AppSettingsRepository(db);
      const manager = new SettingsManager(repo);

      await expect(manager.set('auto_sync_delay_seconds', 120)).resolves.toBeUndefined();
    });

    it('SM-13: persists sync_on_startup true as string "true"', async () => {
      const { db, calls } = createMockDb([]);
      const repo = new AppSettingsRepository(db);
      const manager = new SettingsManager(repo);

      await manager.set('sync_on_startup', true);

      expect(calls[0].params).toContain('sync_on_startup');
      expect(calls[0].params).toContain('true');
    });

    it('SM-14: succeeds for default_view "tile"', async () => {
      const { db } = createMockDb([]);
      const repo = new AppSettingsRepository(db);
      const manager = new SettingsManager(repo);

      await expect(manager.set('default_view', 'tile')).resolves.toBeUndefined();
    });

    it('SM-15: throws for default_view "cards"', async () => {
      const { db } = createMockDb([]);
      const repo = new AppSettingsRepository(db);
      const manager = new SettingsManager(repo);

      await expect(manager.set('default_view', 'cards')).rejects.toThrow('Expected one of: table, tile');
    });
  });

  describe('getAll()', () => {
    it('SM-16: returns all 5 keys with defaults when DB is empty', async () => {
      const { db } = createMockDb([]);
      const repo = new AppSettingsRepository(db);
      const manager = new SettingsManager(repo);

      const result = await manager.getAll();

      expect(result).toEqual({
        theme: 'light',
        default_view: 'table',
        sync_on_startup: true,
        auto_sync_delay_seconds: 120,
        trash_retention_days: -1,
      });
    });

    it('SM-17: returns mix of stored and default values', async () => {
      const { db } = createMockDb([{ key: 'theme', value: 'dark' }]);
      const repo = new AppSettingsRepository(db);
      const manager = new SettingsManager(repo);

      const result = await manager.getAll();

      expect(result.theme).toBe('dark');
      expect(result.default_view).toBe('table');
      expect(result.sync_on_startup).toBe(true);
      expect(result.auto_sync_delay_seconds).toBe(120);
      expect(result.trash_retention_days).toBe(-1);
    });
  });

  describe('resetAll()', () => {
    it('SM-18: writes 5 default values in a transaction', async () => {
      const { db } = createMockDb([]);
      const repo = new AppSettingsRepository(db);
      const manager = new SettingsManager(repo);

      await manager.resetAll();

      expect(db.transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('getDefault()', () => {
    it('SM-19: returns "light" synchronously for theme', () => {
      const { db } = createMockDb([]);
      const repo = new AppSettingsRepository(db);
      const manager = new SettingsManager(repo);

      const result = manager.getDefault('theme');

      expect(result).toBe('light');
    });
  });
});
