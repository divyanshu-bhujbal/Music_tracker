import type { DatabaseConnection } from '../../../data/database/DatabaseConnection.js';
import { LanguageRepository } from '../../../data/repositories/LanguageRepository.js';

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

describe('LanguageRepository', () => {
  describe('constructor', () => {
    it('stores DatabaseConnection', () => {
      const { mock } = createMockDb();
      const repo = new LanguageRepository(mock);

      expect(repo).toBeDefined();
    });
  });

  describe('findById()', () => {
    it('returns Language when found', async () => {
      const lang = {
        id: 1,
        iso_code: 'en',
        name: 'English',
        native_name: 'English',
        user_added: 0,
        created_at: '2026-01-01T00:00:00.000Z',
      };
      const { mock } = createMockDb({ queryResult: [lang] });
      const repo = new LanguageRepository(mock);

      const result = await repo.findById(1);

      expect(result).toEqual(lang);
      expect(mock.query).toHaveBeenCalledWith(
        'SELECT * FROM languages WHERE id = ?',
        [1],
      );
    });

    it('returns null when not found', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new LanguageRepository(mock);

      const result = await repo.findById(999);

      expect(result).toBeNull();
    });
  });

  describe('findByIsoCode()', () => {
    it('returns Language for valid code', async () => {
      const lang = {
        id: 28,
        iso_code: 'ja',
        name: 'Japanese',
        native_name: '日本語',
        user_added: 0,
        created_at: '2026-01-01T00:00:00.000Z',
      };
      const { mock } = createMockDb({ queryResult: [lang] });
      const repo = new LanguageRepository(mock);

      const result = await repo.findByIsoCode('ja');

      expect(result).toEqual(lang);
      expect(mock.query).toHaveBeenCalledWith(
        'SELECT * FROM languages WHERE iso_code = ?',
        ['ja'],
      );
    });

    it('returns null for nonexistent code', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new LanguageRepository(mock);

      const result = await repo.findByIsoCode('zz');

      expect(result).toBeNull();
    });
  });

  describe('findAll()', () => {
    it('returns all languages ordered by name ASC', async () => {
      const langs = [
        { id: 1, iso_code: 'de', name: 'German', native_name: 'Deutsch', user_added: 0, created_at: '2026-01-01' },
        { id: 2, iso_code: 'en', name: 'English', native_name: 'English', user_added: 0, created_at: '2026-01-01' },
      ];
      const { mock } = createMockDb({ queryResult: langs });
      const repo = new LanguageRepository(mock);

      const result = await repo.findAll();

      expect(result).toEqual(langs);
      expect(mock.query).toHaveBeenCalledWith(
        'SELECT * FROM languages ORDER BY name ASC',
      );
    });

    it('returns [] when empty', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new LanguageRepository(mock);

      const result = await repo.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findSeeded()', () => {
    it('returns only user_added=0 languages', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new LanguageRepository(mock);

      await repo.findSeeded();

      expect(mock.query).toHaveBeenCalledWith(
        'SELECT * FROM languages WHERE user_added = 0 ORDER BY name ASC',
      );
    });

    it('expects correct WHERE clause', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new LanguageRepository(mock);

      await repo.findSeeded();

      const sql = (mock.query as jest.Mock).mock.calls[0][0] as string;
      expect(sql).toContain('user_added = 0');
      expect(sql).not.toContain('user_added = 1');
    });
  });

  describe('findUserAdded()', () => {
    it('returns only user_added=1 languages', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new LanguageRepository(mock);

      await repo.findUserAdded();

      expect(mock.query).toHaveBeenCalledWith(
        'SELECT * FROM languages WHERE user_added = 1 ORDER BY created_at DESC',
      );
    });

    it('expects correct WHERE clause', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new LanguageRepository(mock);

      await repo.findUserAdded();

      const sql = (mock.query as jest.Mock).mock.calls[0][0] as string;
      expect(sql).toContain('user_added = 1');
      expect(sql).not.toContain('user_added = 0');
    });
  });

  describe('search()', () => {
    it('wraps query in % wildcards on both sides', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new LanguageRepository(mock);

      await repo.search('jap');

      const sql = (mock.query as jest.Mock).mock.calls[0][0] as string;
      const params = (mock.query as jest.Mock).mock.calls[0][1] as unknown[];

      expect(sql).toContain('LIKE ?');
      expect(params[0]).toBe('%jap%');
      expect(params[1]).toBe('%jap%');
    });

    it('queries both name AND native_name columns', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new LanguageRepository(mock);

      await repo.search('test');

      const sql = (mock.query as jest.Mock).mock.calls[0][0] as string;
      expect(sql).toContain('name LIKE ?');
      expect(sql).toContain('native_name LIKE ?');
    });

    it('returns [] for empty query string', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new LanguageRepository(mock);

      const result = await repo.search('');

      expect(result).toEqual([]);
      expect(mock.query).not.toHaveBeenCalled();
    });

    it('returns [] for no matches', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new LanguageRepository(mock);

      const result = await repo.search('zzzzz');

      expect(result).toEqual([]);
    });
  });

  describe('create()', () => {
    it('sets user_added=1 literal in SQL', async () => {
      const { mock } = createMockDb({ queryResult: [{ id: 61 }] });
      const repo = new LanguageRepository(mock);

      await repo.create('xx', 'CustomLang', 'CustomLang');

      const sql = (mock.execute as jest.Mock).mock.calls[0][0] as string;
      expect(sql).toContain('user_added, created_at)');
      expect(sql).toContain(', 1, ?)');
    });

    it('sets created_at to ISO-8601 timestamp', async () => {
      const { mock } = createMockDb({ queryResult: [{ id: 61 }] });
      const repo = new LanguageRepository(mock);

      await repo.create('xx', 'CustomLang', 'CustomLang');

      const params = (mock.execute as jest.Mock).mock.calls[0][1] as unknown[];
      expect(params[3]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('retrieves auto-generated id via last_insert_rowid()', async () => {
      const { mock } = createMockDb({ queryResult: [{ id: 61 }] });
      const repo = new LanguageRepository(mock);

      const result = await repo.create('xx', 'CustomLang', 'CustomLang');

      expect(result.id).toBe(61);
      expect(mock.query).toHaveBeenCalledWith(
        'SELECT last_insert_rowid() AS id',
      );
    });

    it('uses ? placeholders', async () => {
      const { mock } = createMockDb({ queryResult: [{ id: 1 }] });
      const repo = new LanguageRepository(mock);

      await repo.create('xx', 'Test', 'Test');

      const sql = (mock.execute as jest.Mock).mock.calls[0][0] as string;
      expect(sql).not.toContain('xx');
      expect(sql).toContain('?, ?, ?, 1, ?');
    });

    it('returns full Language with generated id', async () => {
      const { mock } = createMockDb({ queryResult: [{ id: 42 }] });
      const repo = new LanguageRepository(mock);

      const result = await repo.create('ko', 'Korean', '한국어');

      expect(result).toEqual({
        id: 42,
        iso_code: 'ko',
        name: 'Korean',
        native_name: '한국어',
        user_added: 1,
        created_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      });
    });
  });

  describe('count()', () => {
    it('returns correct number', async () => {
      const { mock } = createMockDb({ queryResult: [{ count: 60 }] });
      const repo = new LanguageRepository(mock);

      const result = await repo.count();

      expect(result).toBe(60);
    });

    it('returns 0 for empty table', async () => {
      const { mock } = createMockDb({ queryResult: [{ count: 0 }] });
      const repo = new LanguageRepository(mock);

      const result = await repo.count();

      expect(result).toBe(0);
    });
  });

  describe('async behavior', () => {
    it('all methods return Promise instances', () => {
      const { mock } = createMockDb({ queryResult: [{ count: 0 }] });
      const repo = new LanguageRepository(mock);

      expect(repo.findById(1)).toBeInstanceOf(Promise);
      expect(repo.findByIsoCode('en')).toBeInstanceOf(Promise);
      expect(repo.findAll()).toBeInstanceOf(Promise);
      expect(repo.findSeeded()).toBeInstanceOf(Promise);
      expect(repo.findUserAdded()).toBeInstanceOf(Promise);
      expect(repo.search('a')).toBeInstanceOf(Promise);
      expect(repo.create('x', 'y', 'z')).toBeInstanceOf(Promise);
      expect(repo.count()).toBeInstanceOf(Promise);
    });
  });
});
