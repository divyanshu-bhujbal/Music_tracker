import type { DatabaseConnection } from '../../../data/database/DatabaseConnection.js';
import { ArtistRepository } from '../../../data/repositories/ArtistRepository.js';
import type { Artist } from '../../../domain/models/Artist.js';

function createMockDb(options?: { queryResult?: unknown[] }) {
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

describe('ArtistRepository', () => {
  describe('constructor', () => {
    it('stores DatabaseConnection', () => {
      const { mock } = createMockDb();
      const repo = new ArtistRepository(mock);
      expect(repo).toBeDefined();
    });
  });

  describe('create()', () => {
    it('generates UUID v4, sets created_at + updated_at, returns Artist', async () => {
      const { mock } = createMockDb();
      const repo = new ArtistRepository(mock);

      const result = await repo.create('The Beatles');

      expect(result.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(result.display_name).toBe('The Beatles');
      expect(result.created_at).toBeDefined();
      expect(result.updated_at).toBeDefined();
      expect(result.deleted_at).toBeNull();
    });

    it('uses ? placeholders, not string interpolation', async () => {
      const { mock, calls } = createMockDb();
      const repo = new ArtistRepository(mock);

      await repo.create('The Beatles');

      const call = calls[0];
      expect(call.method).toBe('execute');
      expect(call.sql).toContain('VALUES (?, ?, ?, ?, NULL)');
      expect(call.params).toEqual([
        expect.stringMatching(/^[0-9a-f-]+$/),
        'The Beatles',
        expect.any(String),
        expect.any(String),
      ]);
    });

    it('sets deleted_at = NULL', async () => {
      const { mock } = createMockDb();
      const repo = new ArtistRepository(mock);

      const result = await repo.create('Pink Floyd');

      expect(result.deleted_at).toBeNull();
    });

    it('returns Artist with all 5 fields populated', async () => {
      const { mock } = createMockDb();
      const repo = new ArtistRepository(mock);

      const result = await repo.create('Led Zeppelin');

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('display_name', 'Led Zeppelin');
      expect(result).toHaveProperty('created_at');
      expect(result).toHaveProperty('updated_at');
      expect(result).toHaveProperty('deleted_at', null);
    });
  });

  describe('findById()', () => {
    it('returns Artist when found (not soft-deleted)', async () => {
      const artist: Artist = {
        id: 'artist-1',
        display_name: 'The Beatles',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        deleted_at: null,
      };
      const { mock, calls } = createMockDb({ queryResult: [artist] });
      const repo = new ArtistRepository(mock);

      const result = await repo.findById('artist-1');

      expect(result).toEqual(artist);
      expect(calls[0].sql).toContain('WHERE id = ? AND deleted_at IS NULL');
      expect(calls[0].params).toEqual(['artist-1']);
    });

    it('uses WHERE id = ? AND deleted_at IS NULL', async () => {
      const { mock, calls } = createMockDb({ queryResult: [] });
      const repo = new ArtistRepository(mock);

      await repo.findById('artist-1');

      expect(calls[0].sql).toContain('WHERE id = ? AND deleted_at IS NULL');
    });

    it('returns null when not found', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new ArtistRepository(mock);

      const result = await repo.findById('nonexistent');

      expect(result).toBeNull();
    });

    it('returns null for soft-deleted artist', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new ArtistRepository(mock);

      const result = await repo.findById('deleted-artist');

      expect(result).toBeNull();
    });
  });

  describe('findByName()', () => {
    it('returns ALL matching artists', async () => {
      const artists: Artist[] = [
        { id: '1', display_name: 'Various Artists', created_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null },
        { id: '2', display_name: 'Various Artists', created_at: '2026-02-01', updated_at: '2026-02-01', deleted_at: null },
        { id: '3', display_name: 'Various Artists', created_at: '2026-03-01', updated_at: '2026-03-01', deleted_at: null },
      ];
      const { mock, calls } = createMockDb({ queryResult: artists });
      const repo = new ArtistRepository(mock);

      const result = await repo.findByName('Various Artists');

      expect(result).toHaveLength(3);
      expect(calls[0].sql).toContain('WHERE display_name = ? AND deleted_at IS NULL');
      expect(calls[0].params).toEqual(['Various Artists']);
    });

    it('uses WHERE display_name = ? AND deleted_at IS NULL', async () => {
      const { mock, calls } = createMockDb({ queryResult: [] });
      const repo = new ArtistRepository(mock);

      await repo.findByName('The Beatles');

      expect(calls[0].sql).toContain('WHERE display_name = ? AND deleted_at IS NULL');
    });

    it('returns [] when no matches', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new ArtistRepository(mock);

      const result = await repo.findByName('Nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('findAll()', () => {
    it('returns active artists ordered by display_name', async () => {
      const artists: Artist[] = [
        { id: '1', display_name: 'Beatles', created_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null },
        { id: '2', display_name: 'Pink Floyd', created_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null },
      ];
      const { mock, calls } = createMockDb({ queryResult: artists });
      const repo = new ArtistRepository(mock);

      const result = await repo.findAll();

      expect(result).toEqual(artists);
      expect(calls[0].sql).toContain('WHERE deleted_at IS NULL');
      expect(calls[0].sql).toContain('ORDER BY display_name ASC');
    });

    it('uses WHERE deleted_at IS NULL', async () => {
      const { mock, calls } = createMockDb({ queryResult: [] });
      const repo = new ArtistRepository(mock);

      await repo.findAll();

      expect(calls[0].sql).toContain('WHERE deleted_at IS NULL');
    });

    it('returns [] when empty', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new ArtistRepository(mock);

      const result = await repo.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findAllIncludingDeleted()', () => {
    it('returns ALL artists including soft-deleted', async () => {
      const artists: Artist[] = [
        { id: '1', display_name: 'Beatles', created_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null },
        { id: '2', display_name: 'Deleted Band', created_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: '2026-06-01' },
      ];
      const { mock, calls } = createMockDb({ queryResult: artists });
      const repo = new ArtistRepository(mock);

      const result = await repo.findAllIncludingDeleted();

      expect(result).toHaveLength(2);
      expect(calls[0].sql).not.toContain('deleted_at IS NULL');
      expect(calls[0].sql).toContain('ORDER BY display_name ASC');
    });

    it('SQL does NOT contain "deleted_at IS NULL"', async () => {
      const { mock, calls } = createMockDb({ queryResult: [] });
      const repo = new ArtistRepository(mock);

      await repo.findAllIncludingDeleted();

      expect(calls[0].sql).not.toContain('deleted_at IS NULL');
    });
  });

  describe('update()', () => {
    it('updates display_name and updated_at', async () => {
      const { mock, calls } = createMockDb();
      const repo = new ArtistRepository(mock);

      await repo.update('artist-1', 'New Name');

      expect(calls[0].method).toBe('execute');
      expect(calls[0].sql).toContain('UPDATE artists SET display_name = ?, updated_at = ?');
      expect(calls[0].params).toEqual(['New Name', expect.any(String), 'artist-1']);
    });

    it('uses WHERE id = ? AND deleted_at IS NULL', async () => {
      const { mock, calls } = createMockDb();
      const repo = new ArtistRepository(mock);

      await repo.update('artist-1', 'New Name');

      expect(calls[0].sql).toContain('WHERE id = ? AND deleted_at IS NULL');
    });

    it('uses ? placeholders', async () => {
      const { mock, calls } = createMockDb();
      const repo = new ArtistRepository(mock);

      await repo.update('artist-1', 'New Name');

      expect(calls[0].params).toEqual(['New Name', expect.any(String), 'artist-1']);
    });
  });

  describe('softDelete()', () => {
    it('sets deleted_at and updated_at', async () => {
      const { mock, calls } = createMockDb();
      const repo = new ArtistRepository(mock);

      await repo.softDelete('artist-1');

      expect(calls[0].method).toBe('execute');
      expect(calls[0].sql).toContain('UPDATE artists SET deleted_at = ?, updated_at = ?');
      expect(calls[0].params).toEqual([expect.any(String), expect.any(String), 'artist-1']);
    });

    it('uses WHERE id = ? AND deleted_at IS NULL', async () => {
      const { mock, calls } = createMockDb();
      const repo = new ArtistRepository(mock);

      await repo.softDelete('artist-1');

      expect(calls[0].sql).toContain('WHERE id = ? AND deleted_at IS NULL');
    });
  });

  describe('restore()', () => {
    it('sets deleted_at = NULL and updates updated_at', async () => {
      const { mock, calls } = createMockDb();
      const repo = new ArtistRepository(mock);

      await repo.restore('artist-1');

      expect(calls[0].method).toBe('execute');
      expect(calls[0].sql).toContain('UPDATE artists SET deleted_at = NULL, updated_at = ?');
      expect(calls[0].params).toEqual([expect.any(String), 'artist-1']);
    });

    it('uses WHERE id = ? AND deleted_at IS NOT NULL', async () => {
      const { mock, calls } = createMockDb();
      const repo = new ArtistRepository(mock);

      await repo.restore('artist-1');

      expect(calls[0].sql).toContain('WHERE id = ? AND deleted_at IS NOT NULL');
    });
  });

  describe('count()', () => {
    it('returns number of active artists', async () => {
      const { mock } = createMockDb({ queryResult: [{ count: 42 }] });
      const repo = new ArtistRepository(mock);

      const result = await repo.count();

      expect(result).toBe(42);
    });

    it('count SQL includes WHERE deleted_at IS NULL', async () => {
      const { mock, calls } = createMockDb({ queryResult: [{ count: 0 }] });
      const repo = new ArtistRepository(mock);

      await repo.count();

      expect(calls[0].sql).toContain('WHERE deleted_at IS NULL');
    });
  });

  describe('async behavior', () => {
    it('all mutation methods return Promise instances', () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new ArtistRepository(mock);

      expect(repo.create('Test')).toBeInstanceOf(Promise);
      expect(repo.findById('1')).toBeInstanceOf(Promise);
      expect(repo.findByName('Test')).toBeInstanceOf(Promise);
      expect(repo.findAll()).toBeInstanceOf(Promise);
      expect(repo.findAllIncludingDeleted()).toBeInstanceOf(Promise);
      expect(repo.update('1', 'Test')).toBeInstanceOf(Promise);
      expect(repo.softDelete('1')).toBeInstanceOf(Promise);
      expect(repo.restore('1')).toBeInstanceOf(Promise);
    });

    it('count returns a Promise', () => {
      const { mock } = createMockDb({ queryResult: [{ count: 0 }] });
      const repo = new ArtistRepository(mock);

      expect(repo.count()).toBeInstanceOf(Promise);
    });
  });
});
