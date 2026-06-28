import type { DatabaseConnection } from '../../../data/database/DatabaseConnection.js';
import { SongRepository } from '../../../data/repositories/SongRepository.js';
import type { Song } from '../../../domain/models/Song.js';

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

describe('SongRepository', () => {
  describe('create()', () => {
    it('generates UUID, sets added_at + updated_at, returns Song', async () => {
      const { mock } = createMockDb();
      const repo = new SongRepository(mock);

      const result = await repo.create({ name: 'Bohemian Rhapsody', album_name: 'A Night at the Opera', language_id: 30 });

      expect(result.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(result.name).toBe('Bohemian Rhapsody');
      expect(result.album_name).toBe('A Night at the Opera');
      expect(result.language_id).toBe(30);
      expect(result.added_at).toBeDefined();
      expect(result.updated_at).toBeDefined();
      expect(result.deleted_at).toBeNull();
    });

    it('with album_name = null inserts NULL', async () => {
      const { mock } = createMockDb();
      const repo = new SongRepository(mock);

      const result = await repo.create({ name: 'Test Song', album_name: null, language_id: 1 });

      expect(result.album_name).toBeNull();
    });

    it('with album_name = value inserts the value', async () => {
      const { mock } = createMockDb();
      const repo = new SongRepository(mock);

      const result = await repo.create({ name: 'Test Song', album_name: 'Test Album', language_id: 1 });

      expect(result.album_name).toBe('Test Album');
    });

    it('uses ? placeholders', async () => {
      const { mock, calls } = createMockDb();
      const repo = new SongRepository(mock);

      await repo.create({ name: 'Test', album_name: null, language_id: 1 });

      expect(calls[0].method).toBe('execute');
      expect(calls[0].sql).toContain('VALUES (?, ?, ?, ?, ?, ?, NULL)');
    });

    it('added_at is present in INSERT', async () => {
      const { mock, calls } = createMockDb();
      const repo = new SongRepository(mock);

      await repo.create({ name: 'Test', album_name: null, language_id: 1 });

      expect(calls[0].sql).toContain('added_at');
    });
  });

  describe('findById()', () => {
    it('returns Song when found', async () => {
      const song: Song = {
        id: 'song-1',
        name: 'Test Song',
        album_name: 'Test Album',
        language_id: 1,
        added_at: '2026-01-01',
        updated_at: '2026-01-01',
        deleted_at: null,
      };
      const { mock, calls } = createMockDb({ queryResult: [song] });
      const repo = new SongRepository(mock);

      const result = await repo.findById('song-1');

      expect(result).toEqual(song);
      expect(calls[0].sql).toContain('WHERE id = ? AND deleted_at IS NULL');
      expect(calls[0].params).toEqual(['song-1']);
    });

    it('uses WHERE id = ? AND deleted_at IS NULL', async () => {
      const { mock, calls } = createMockDb({ queryResult: [] });
      const repo = new SongRepository(mock);

      await repo.findById('song-1');

      expect(calls[0].sql).toContain('WHERE id = ? AND deleted_at IS NULL');
    });

    it('returns null when not found', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new SongRepository(mock);

      const result = await repo.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findSongWithArtists()', () => {
    it('returns SongWithArtists with artists array when artists exist', async () => {
      const rows = [
        {
          id: 'song-1', name: 'Test', album_name: 'Album', language_id: 1,
          added_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null,
          artist_id: 'artist-1', artist_display_name: 'Beatles', artist_sort_order: 1,
        },
        {
          id: 'song-1', name: 'Test', album_name: 'Album', language_id: 1,
          added_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null,
          artist_id: 'artist-2', artist_display_name: 'Stones', artist_sort_order: 2,
        },
      ];
      const { mock, calls } = createMockDb({ queryResult: rows });
      const repo = new SongRepository(mock);

      const result = await repo.findSongWithArtists('song-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('song-1');
      expect(result!.name).toBe('Test');
      expect(result!.artists).toHaveLength(2);
      expect(result!.artists[0].id).toBe('artist-1');
      expect(result!.artists[0].display_name).toBe('Beatles');
      expect(result!.artists[0].sort_order).toBe(1);
      expect(result!.artists[1].id).toBe('artist-2');
      expect(calls[0].sql).toContain('LEFT JOIN song_artists sa ON s.id = sa.song_id');
      expect(calls[0].sql).toContain('LEFT JOIN artists a ON sa.artist_id = a.id AND a.deleted_at IS NULL');
    });

    it('returns SongWithArtists with empty artists array when no artists', async () => {
      const rows = [
        {
          id: 'song-1', name: 'Test', album_name: null, language_id: 1,
          added_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null,
          artist_id: null, artist_display_name: null, artist_sort_order: null,
        },
      ];
      const { mock } = createMockDb({ queryResult: rows });
      const repo = new SongRepository(mock);

      const result = await repo.findSongWithArtists('song-1');

      expect(result).not.toBeNull();
      expect(result!.artists).toEqual([]);
    });

    it('returns null when song not found', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new SongRepository(mock);

      const result = await repo.findSongWithArtists('nonexistent');

      expect(result).toBeNull();
    });

    it('SQL contains LEFT JOIN song_artists and LEFT JOIN artists', async () => {
      const { mock, calls } = createMockDb({ queryResult: [] });
      const repo = new SongRepository(mock);

      await repo.findSongWithArtists('song-1');

      expect(calls[0].sql).toContain('LEFT JOIN song_artists sa');
      expect(calls[0].sql).toContain('LEFT JOIN artists a');
    });

    it('SQL filters a.deleted_at IS NULL', async () => {
      const { mock, calls } = createMockDb({ queryResult: [] });
      const repo = new SongRepository(mock);

      await repo.findSongWithArtists('song-1');

      expect(calls[0].sql).toContain('a.deleted_at IS NULL');
    });
  });

  describe('findAll()', () => {
    it('returns active songs ordered by updated_at DESC', async () => {
      const songs: Song[] = [
        { id: '2', name: 'B', album_name: null, language_id: 1, added_at: '2026-01-01', updated_at: '2026-02-01', deleted_at: null },
        { id: '1', name: 'A', album_name: null, language_id: 1, added_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null },
      ];
      const { mock, calls } = createMockDb({ queryResult: songs });
      const repo = new SongRepository(mock);

      const result = await repo.findAll();

      expect(result).toEqual(songs);
      expect(calls[0].sql).toContain('WHERE deleted_at IS NULL');
      expect(calls[0].sql).toContain('ORDER BY updated_at DESC');
    });

    it('uses WHERE deleted_at IS NULL', async () => {
      const { mock, calls } = createMockDb({ queryResult: [] });
      const repo = new SongRepository(mock);

      await repo.findAll();

      expect(calls[0].sql).toContain('WHERE deleted_at IS NULL');
    });
  });

  describe('findAllIncludingDeleted()', () => {
    it('returns all songs including soft-deleted', async () => {
      const songs: Song[] = [
        { id: '1', name: 'A', album_name: null, language_id: 1, added_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null },
        { id: '2', name: 'B', album_name: null, language_id: 1, added_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: '2026-06-01' },
      ];
      const { mock, calls } = createMockDb({ queryResult: songs });
      const repo = new SongRepository(mock);

      const result = await repo.findAllIncludingDeleted();

      expect(result).toHaveLength(2);
      expect(calls[0].sql).not.toContain('deleted_at IS NULL');
    });
  });

  describe('findByLanguageId()', () => {
    it('returns songs for a language', async () => {
      const songs: Song[] = [
        { id: '1', name: 'Italian Song', album_name: null, language_id: 30, added_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null },
      ];
      const { mock, calls } = createMockDb({ queryResult: songs });
      const repo = new SongRepository(mock);

      const result = await repo.findByLanguageId(30);

      expect(result).toEqual(songs);
      expect(calls[0].sql).toContain('WHERE language_id = ? AND deleted_at IS NULL');
      expect(calls[0].params).toEqual([30]);
    });

    it('uses WHERE language_id = ? AND deleted_at IS NULL', async () => {
      const { mock, calls } = createMockDb({ queryResult: [] });
      const repo = new SongRepository(mock);

      await repo.findByLanguageId(30);

      expect(calls[0].sql).toContain('WHERE language_id = ? AND deleted_at IS NULL');
    });
  });

  describe('update()', () => {
    it('SQL does NOT contain added_at anywhere', async () => {
      const { mock, calls } = createMockDb();
      const repo = new SongRepository(mock);

      await repo.update('song-1', { name: 'New Name', album_name: null, language_id: 1 });

      expect(calls[0].sql).not.toContain('added_at');
    });

    it('updates name, album_name, language_id, updated_at', async () => {
      const { mock, calls } = createMockDb();
      const repo = new SongRepository(mock);

      await repo.update('song-1', { name: 'New Name', album_name: 'New Album', language_id: 5 });

      expect(calls[0].method).toBe('execute');
      expect(calls[0].sql).toContain('UPDATE songs SET name = ?, album_name = ?, language_id = ?, updated_at = ?');
      expect(calls[0].params).toEqual(['New Name', 'New Album', 5, expect.any(String), 'song-1']);
    });

    it('uses WHERE id = ? AND deleted_at IS NULL', async () => {
      const { mock, calls } = createMockDb();
      const repo = new SongRepository(mock);

      await repo.update('song-1', { name: 'New', album_name: null, language_id: 1 });

      expect(calls[0].sql).toContain('WHERE id = ? AND deleted_at IS NULL');
    });

    it('with album_name = null sets NULL', async () => {
      const { mock, calls } = createMockDb();
      const repo = new SongRepository(mock);

      await repo.update('song-1', { name: 'New', album_name: null, language_id: 1 });

      expect(calls[0].params).toContain(null);
    });
  });

  describe('softDelete()', () => {
    it('sets deleted_at and updated_at', async () => {
      const { mock, calls } = createMockDb();
      const repo = new SongRepository(mock);

      await repo.softDelete('song-1');

      expect(calls[0].method).toBe('execute');
      expect(calls[0].sql).toContain('UPDATE songs SET deleted_at = ?, updated_at = ?');
      expect(calls[0].params).toEqual([expect.any(String), expect.any(String), 'song-1']);
    });

    it('uses WHERE deleted_at IS NULL', async () => {
      const { mock, calls } = createMockDb();
      const repo = new SongRepository(mock);

      await repo.softDelete('song-1');

      expect(calls[0].sql).toContain('WHERE id = ? AND deleted_at IS NULL');
    });
  });

  describe('restore()', () => {
    it('nullifies deleted_at', async () => {
      const { mock, calls } = createMockDb();
      const repo = new SongRepository(mock);

      await repo.restore('song-1');

      expect(calls[0].method).toBe('execute');
      expect(calls[0].sql).toContain('UPDATE songs SET deleted_at = NULL, updated_at = ?');
      expect(calls[0].params).toEqual([expect.any(String), 'song-1']);
    });

    it('uses WHERE deleted_at IS NOT NULL', async () => {
      const { mock, calls } = createMockDb();
      const repo = new SongRepository(mock);

      await repo.restore('song-1');

      expect(calls[0].sql).toContain('WHERE id = ? AND deleted_at IS NOT NULL');
    });
  });

  describe('count()', () => {
    it('returns number of active songs', async () => {
      const { mock } = createMockDb({ queryResult: [{ count: 10 }] });
      const repo = new SongRepository(mock);

      const result = await repo.count();

      expect(result).toBe(10);
    });

    it('count SQL includes WHERE deleted_at IS NULL', async () => {
      const { mock, calls } = createMockDb({ queryResult: [{ count: 0 }] });
      const repo = new SongRepository(mock);

      await repo.count();

      expect(calls[0].sql).toContain('WHERE deleted_at IS NULL');
    });
  });

  describe('async behavior', () => {
    it('all mutation methods return Promise instances', () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new SongRepository(mock);

      expect(repo.create({ name: 'T', album_name: null, language_id: 1 })).toBeInstanceOf(Promise);
      expect(repo.findById('1')).toBeInstanceOf(Promise);
      expect(repo.findSongWithArtists('1')).toBeInstanceOf(Promise);
      expect(repo.findAll()).toBeInstanceOf(Promise);
      expect(repo.findAllIncludingDeleted()).toBeInstanceOf(Promise);
      expect(repo.findByLanguageId(1)).toBeInstanceOf(Promise);
      expect(repo.update('1', { name: 'T', album_name: null, language_id: 1 })).toBeInstanceOf(Promise);
      expect(repo.softDelete('1')).toBeInstanceOf(Promise);
      expect(repo.restore('1')).toBeInstanceOf(Promise);
    });

    it('count returns a Promise', () => {
      const { mock } = createMockDb({ queryResult: [{ count: 0 }] });
      const repo = new SongRepository(mock);

      expect(repo.count()).toBeInstanceOf(Promise);
    });
  });

  describe('findFiltered()', () => {
    // SR-F-01: findFiltered() with empty filter + default sort
    it('SR-F-01: queries all active songs with empty filter', async () => {
      const resultSongs: Song[] = [
        { id: 's1', name: 'Test', album_name: null, language_id: 1, added_at: '2024-01-01', updated_at: '2024-01-01', deleted_at: null },
      ];
      const { mock } = createMockDb({ queryResult: resultSongs });
      const repo = new SongRepository(mock);

      const result = await repo.findFiltered(
        { whereClause: '', params: [], joins: [] },
        { orderByClause: '' },
      );

      expect(result).toEqual(resultSongs);
    });

    // SR-F-02: findFiltered() with WHERE clause and no joins
    it('SR-F-02: includes WHERE clause in SQL', async () => {
      const { mock, calls } = createMockDb();
      const repo = new SongRepository(mock);

      await repo.findFiltered(
        { whereClause: 's.name LIKE \'%\' || ? || \'%\'', params: ['hello'], joins: [] },
        { orderByClause: '' },
      );

      const queryCall = calls.find((c) => c.method === 'query');
      expect(queryCall?.sql).toContain('WHERE deleted_at IS NULL');
      expect(queryCall?.sql).toContain('AND s.name LIKE');
      expect(queryCall?.params).toEqual(['hello']);
    });

    // SR-F-03: findFiltered() with params passed correctly
    it('SR-F-03: params passed to db.query()', async () => {
      const { mock, calls } = createMockDb();
      const repo = new SongRepository(mock);

      await repo.findFiltered(
        { whereClause: 's.album_name IN (?, ?)', params: ['A', 'B'], joins: [] },
        { orderByClause: '' },
      );

      const queryCall = calls.find((c) => c.method === 'query');
      expect(queryCall?.params).toEqual(['A', 'B']);
    });

    // SR-F-04: findFiltered() preserves soft-delete filter
    it('SR-F-04: deleted_at IS NULL always present', async () => {
      const { mock, calls } = createMockDb();
      const repo = new SongRepository(mock);

      await repo.findFiltered(
        { whereClause: 's.name IN (?)', params: ['x'], joins: [] },
        { orderByClause: '' },
      );

      const queryCall = calls.find((c) => c.method === 'query');
      expect(queryCall?.sql).toContain('WHERE deleted_at IS NULL');
    });

    // SR-F-05: findFiltered() with sort
    it('SR-F-05: SQL ends with ORDER BY clause', async () => {
      const { mock, calls } = createMockDb();
      const repo = new SongRepository(mock);

      await repo.findFiltered(
        { whereClause: '', params: [], joins: [] },
        { orderByClause: 'ORDER BY name ASC' },
      );

      const queryCall = calls.find((c) => c.method === 'query');
      expect(queryCall?.sql).toContain('ORDER BY name ASC');
    });

    // SR-F-06: findFiltered() includes JOIN clauses from filter
    it('SR-F-06: includes JOIN clauses when filter has joins', async () => {
      const { mock, calls } = createMockDb();
      const repo = new SongRepository(mock);

      await repo.findFiltered(
        {
          whereClause: 'l.name IN (?, ?)',
          params: ['English', 'Japanese'],
          joins: ['LEFT JOIN languages l ON s.language_id = l.id'],
        },
        { orderByClause: '' },
      );

      const queryCall = calls.find((c) => c.method === 'query');
      expect(queryCall?.sql).toContain('LEFT JOIN languages l ON s.language_id = l.id');
      expect(queryCall?.sql).toContain('WHERE deleted_at IS NULL');
    });
  });
});
