import type { DatabaseConnection } from '../../../data/database/DatabaseConnection.js';
import { SongArtistRepository } from '../../../data/repositories/SongArtistRepository.js';
import type { SongArtist } from '../../../domain/models/SongArtist.js';

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

describe('SongArtistRepository', () => {
  describe('findBySongId()', () => {
    it('returns all rows for a song ordered by sort_order ASC', async () => {
      const rows: SongArtist[] = [
        { song_id: 'song-1', artist_id: 'artist-2', sort_order: 2, updated_at: '2026-01-01' },
        { song_id: 'song-1', artist_id: 'artist-1', sort_order: 1, updated_at: '2026-01-01' },
      ];
      const { mock, calls } = createMockDb({ queryResult: rows });
      const repo = new SongArtistRepository(mock);

      const result = await repo.findBySongId('song-1');

      expect(result).toEqual(rows);
      expect(calls[0].sql).toContain('WHERE song_id = ?');
      expect(calls[0].sql).toContain('ORDER BY sort_order ASC');
      expect(calls[0].params).toEqual(['song-1']);
    });

    it('returns [] for song with no artists', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new SongArtistRepository(mock);

      const result = await repo.findBySongId('song-without-artists');

      expect(result).toEqual([]);
    });

    it('includes rows even if song is soft-deleted', async () => {
      const { mock, calls } = createMockDb({ queryResult: [] });
      const repo = new SongArtistRepository(mock);

      await repo.findBySongId('deleted-song');

      expect(calls[0].sql).not.toContain('deleted_at');
    });
  });

  describe('findByArtistId()', () => {
    it('returns all rows for an artist', async () => {
      const rows: SongArtist[] = [
        { song_id: 'song-1', artist_id: 'artist-1', sort_order: 1, updated_at: '2026-01-01' },
        { song_id: 'song-2', artist_id: 'artist-1', sort_order: 1, updated_at: '2026-01-01' },
      ];
      const { mock, calls } = createMockDb({ queryResult: rows });
      const repo = new SongArtistRepository(mock);

      const result = await repo.findByArtistId('artist-1');

      expect(result).toEqual(rows);
      expect(calls[0].sql).toContain('WHERE artist_id = ?');
      expect(calls[0].sql).toContain('ORDER BY sort_order ASC');
      expect(calls[0].params).toEqual(['artist-1']);
    });

    it('returns [] for artist with no songs', async () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new SongArtistRepository(mock);

      const result = await repo.findByArtistId('artist-without-songs');

      expect(result).toEqual([]);
    });
  });

  describe('add()', () => {
    it('inserts song_id, artist_id, sort_order, updated_at', async () => {
      const { mock, calls } = createMockDb();
      const repo = new SongArtistRepository(mock);

      await repo.add('song-1', 'artist-1', 1);

      expect(calls[0].method).toBe('execute');
      expect(calls[0].sql).toContain('INSERT INTO song_artists');
      expect(calls[0].sql).toContain('VALUES (?, ?, ?, ?)');
      expect(calls[0].params).toEqual(['song-1', 'artist-1', 1, expect.any(String)]);
    });

    it('returns full SongArtist object', async () => {
      const { mock } = createMockDb();
      const repo = new SongArtistRepository(mock);

      const result = await repo.add('song-1', 'artist-1', 1);

      expect(result.song_id).toBe('song-1');
      expect(result.artist_id).toBe('artist-1');
      expect(result.sort_order).toBe(1);
      expect(result.updated_at).toBeDefined();
    });

    it('add uses ? placeholders', async () => {
      const { mock, calls } = createMockDb();
      const repo = new SongArtistRepository(mock);

      await repo.add('song-1', 'artist-1', 1);

      expect(calls[0].sql).toContain('VALUES (?, ?, ?, ?)');
    });
  });

  describe('remove()', () => {
    it('executes DELETE with both PK columns', async () => {
      const { mock, calls } = createMockDb();
      const repo = new SongArtistRepository(mock);

      await repo.remove('song-1', 'artist-1');

      expect(calls[0].method).toBe('execute');
      expect(calls[0].sql).toContain('DELETE FROM song_artists WHERE song_id = ? AND artist_id = ?');
      expect(calls[0].params).toEqual(['song-1', 'artist-1']);
    });

    it('does not throw for non-existent pair', async () => {
      const { mock } = createMockDb();
      const repo = new SongArtistRepository(mock);

      await expect(repo.remove('nonexistent', 'nonexistent')).resolves.toBeUndefined();
    });

    it('remove uses ? placeholders', async () => {
      const { mock, calls } = createMockDb();
      const repo = new SongArtistRepository(mock);

      await repo.remove('song-1', 'artist-1');

      expect(calls[0].sql).toContain('DELETE FROM song_artists WHERE song_id = ? AND artist_id = ?');
    });
  });

  describe('updateSortOrder()', () => {
    it('updates sort_order and updated_at', async () => {
      const { mock, calls } = createMockDb();
      const repo = new SongArtistRepository(mock);

      await repo.updateSortOrder('song-1', 'artist-1', 3);

      expect(calls[0].method).toBe('execute');
      expect(calls[0].sql).toContain('UPDATE song_artists SET sort_order = ?, updated_at = ?');
      expect(calls[0].params).toEqual([3, expect.any(String), 'song-1', 'artist-1']);
    });

    it('uses WHERE song_id = ? AND artist_id = ?', async () => {
      const { mock, calls } = createMockDb();
      const repo = new SongArtistRepository(mock);

      await repo.updateSortOrder('song-1', 'artist-1', 3);

      expect(calls[0].sql).toContain('WHERE song_id = ? AND artist_id = ?');
    });

    it('does not throw for non-existent pair', async () => {
      const { mock } = createMockDb();
      const repo = new SongArtistRepository(mock);

      await expect(repo.updateSortOrder('nonexistent', 'nonexistent', 1)).resolves.toBeUndefined();
    });

    it('sets updated_at to ISO-8601 timestamp', async () => {
      const { mock, calls } = createMockDb();
      const repo = new SongArtistRepository(mock);

      await repo.updateSortOrder('song-1', 'artist-1', 3);

      const updatedAt = calls[0].params?.[1] as string;
      expect(updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('count()', () => {
    it('returns total junction rows', async () => {
      const { mock } = createMockDb({ queryResult: [{ count: 5 }] });
      const repo = new SongArtistRepository(mock);

      const result = await repo.count();

      expect(result).toBe(5);
    });

    it('count returns 0 for empty table', async () => {
      const { mock } = createMockDb({ queryResult: [{ count: 0 }] });
      const repo = new SongArtistRepository(mock);

      const result = await repo.count();

      expect(result).toBe(0);
    });
  });

  describe('async behavior', () => {
    it('all methods return Promise instances', () => {
      const { mock } = createMockDb({ queryResult: [] });
      const repo = new SongArtistRepository(mock);

      expect(repo.findBySongId('1')).toBeInstanceOf(Promise);
      expect(repo.findByArtistId('1')).toBeInstanceOf(Promise);
      expect(repo.add('1', '1', 1)).toBeInstanceOf(Promise);
      expect(repo.remove('1', '1')).toBeInstanceOf(Promise);
      expect(repo.updateSortOrder('1', '1', 1)).toBeInstanceOf(Promise);
    });

    it('count returns a Promise', () => {
      const { mock } = createMockDb({ queryResult: [{ count: 0 }] });
      const repo = new SongArtistRepository(mock);

      expect(repo.count()).toBeInstanceOf(Promise);
    });
  });
});
