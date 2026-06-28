import type { DatabaseConnection } from '../../../data/database/DatabaseConnection.js';
import { CategoryRepository } from '../../../data/repositories/CategoryRepository.js';

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

describe('CategoryRepository', () => {
  describe('constructor', () => {
    it('stores DatabaseConnection', () => {
      const { mock } = createMockDb();
      const repo = new CategoryRepository(mock);

      expect(repo).toBeDefined();
    });
  });

  describe('findById()', () => {
    it('returns Category for songs', async () => {
      const category = {
        id: 'songs',
        display_name: 'Songs',
        icon_name: 'music-note',
        enabled: 1,
        sort_order: 1,
        introduced_in_version: '1.0.0',
      };
      const { mock } = createMockDb({ queryResult: [category] });
      const repo = new CategoryRepository(mock);

      const result = await repo.findById('songs');

      expect(result).toEqual(category);
      expect(mock.query).toHaveBeenCalledWith(
        'SELECT * FROM categories WHERE id = ?',
        ['songs'],
      );
    });

    it('returns null for unknown category', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new CategoryRepository(mock);

      const result = await repo.findById('books');

      expect(result).toBeNull();
    });
  });

  describe('findAll()', () => {
    it('returns all categories ordered by sort_order ASC', async () => {
      const categories = [
        { id: 'songs', display_name: 'Songs', icon_name: 'music-note', enabled: 1, sort_order: 1, introduced_in_version: '1.0.0' },
        { id: 'books', display_name: 'Books', icon_name: 'book', enabled: 0, sort_order: 2, introduced_in_version: '2.0.0' },
      ];
      const { mock } = createMockDb({ queryResult: categories });
      const repo = new CategoryRepository(mock);

      const result = await repo.findAll();

      expect(result).toEqual(categories);
      expect(mock.query).toHaveBeenCalledWith(
        'SELECT * FROM categories ORDER BY sort_order ASC',
      );
    });

    it('returns [] when empty', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new CategoryRepository(mock);

      const result = await repo.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findEnabled()', () => {
    it('returns only enabled=1, ordered by sort_order', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new CategoryRepository(mock);

      await repo.findEnabled();

      const sql = (mock.query as jest.Mock).mock.calls[0][0] as string;
      expect(sql).toContain('enabled = 1');
      expect(sql).toContain('ORDER BY sort_order ASC');
    });

    it('returns [] when no enabled categories', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new CategoryRepository(mock);

      const result = await repo.findEnabled();

      expect(result).toEqual([]);
    });
  });

  describe('count()', () => {
    it('returns correct number', async () => {
      const { mock } = createMockDb({ queryResult: [{ count: 1 }] });
      const repo = new CategoryRepository(mock);

      const result = await repo.count();

      expect(result).toBe(1);
    });

    it('returns 0 for empty table', async () => {
      const { mock } = createMockDb({ queryResult: [{ count: 0 }] });
      const repo = new CategoryRepository(mock);

      const result = await repo.count();

      expect(result).toBe(0);
    });
  });

  describe('no write methods', () => {
    it('CategoryRepository has no execute() calls', () => {
      const { mock } = createMockDb();
      const repo = new CategoryRepository(mock);

      // Access private db to verify it's stored
      expect((repo as unknown as { db: DatabaseConnection }).db).toBe(mock);

      // No execute method should be called through this repository
      expect(mock.execute).not.toHaveBeenCalled();
    });
  });

  describe('async behavior', () => {
    it('all methods return Promise instances', () => {
      const { mock } = createMockDb({ queryResult: [{ count: 0 }] });
      const repo = new CategoryRepository(mock);

      expect(repo.findById('songs')).toBeInstanceOf(Promise);
      expect(repo.findAll()).toBeInstanceOf(Promise);
      expect(repo.findEnabled()).toBeInstanceOf(Promise);
      expect(repo.count()).toBeInstanceOf(Promise);
    });
  });
});
