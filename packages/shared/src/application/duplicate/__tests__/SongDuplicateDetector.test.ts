import type { DatabaseConnection } from '../../../data/database/DatabaseConnection.js';
import { SongDuplicateDetector } from '../SongDuplicateDetector.js';
import type { Song } from '../../../domain/models/Song.js';
import type { SongArtist } from '../../../domain/models/SongArtist.js';

function createMockDb(options?: {
  findAllResult?: Song[];
  findBySongIdResult?: Record<string, SongArtist[]>;
}) {
  const calls: { method: string; sql: string; params?: unknown[] }[] = [];
  const findBySongIdResult = options?.findBySongIdResult ?? {};

  const mock: DatabaseConnection = {
    open: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    execute: jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
      calls.push({ method: 'execute', sql, params });
    }),
    query: jest.fn().mockImplementation(async <T>(sql: string, params?: unknown[]): Promise<T[]> => {
      calls.push({ method: 'query', sql, params });

      // Route to different results based on SQL pattern
      if (sql.includes('FROM songs') && sql.includes('deleted_at IS NULL')) {
        return (options?.findAllResult ?? []) as T[];
      }

      if (sql.includes('FROM song_artists')) {
        const songId = params?.[0] as string | undefined;
        return (songId ? (findBySongIdResult[songId] ?? []) : []) as T[];
      }

      return [] as T[];
    }),
    transaction: jest.fn().mockImplementation(
      async <T>(fn: (db: DatabaseConnection) => Promise<T>): Promise<T> => {
        return fn(mock);
      },
    ),
  };
  return { mock, calls };
}

function makeSong(overrides: Partial<Song> & { id: string; name: string }): Song {
  return {
    album_name: null,
    language_id: 1,
    added_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

function makeSongArtist(overrides: Partial<SongArtist> & { song_id: string; artist_id: string }): SongArtist {
  return {
    sort_order: 0,
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('SongDuplicateDetector', () => {
  describe('DUP-01: Empty candidate name', () => {
    it('returns empty array without querying database', async () => {
      const { mock, calls } = createMockDb();
      const detector = new SongDuplicateDetector(mock);

      const results = await detector.checkForDuplicates({ name: '', artistIds: [] });

      expect(results).toEqual([]);
      // No database queries should be made
      expect(calls).toHaveLength(0);
    });
  });

  describe('Normalization pipeline', () => {
    it('DUP-02: NFC normalization composes characters', async () => {
      // "café" as NFC (single codepoint) vs "cafe\u0301" (NFD decomposition)
      const { findAllResult, findBySongIdResult } = setupForSingleSong({
        id: 's1',
        name: 'café',
        artistIds: [],
      });
      const { mock } = createMockDb({ findAllResult, findBySongIdResult });
      const detector = new SongDuplicateDetector(mock);

      // "cafe\u0301" is the NFD form (e + combining acute accent)
      const results = await detector.checkForDuplicates({ name: 'cafe\u0301', artistIds: [] });

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('exact');
    });

    it('DUP-03: lowercase normalization', async () => {
      const { findAllResult, findBySongIdResult } = setupForSingleSong({
        id: 's1',
        name: 'Test Song',
        artistIds: [],
      });
      const { mock } = createMockDb({ findAllResult, findBySongIdResult });
      const detector = new SongDuplicateDetector(mock);

      const results = await detector.checkForDuplicates({ name: 'TEST SONG', artistIds: [] });

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('exact');
    });

    it('DUP-04: trim whitespace', async () => {
      const { findAllResult, findBySongIdResult } = setupForSingleSong({
        id: 's1',
        name: 'Hello',
        artistIds: [],
      });
      const { mock } = createMockDb({ findAllResult, findBySongIdResult });
      const detector = new SongDuplicateDetector(mock);

      const results = await detector.checkForDuplicates({ name: '  Hello  ', artistIds: [] });

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('exact');
    });

    it('DUP-05: collapse internal whitespace', async () => {
      const { findAllResult, findBySongIdResult } = setupForSingleSong({
        id: 's1',
        name: 'Hello World',
        artistIds: [],
      });
      const { mock } = createMockDb({ findAllResult, findBySongIdResult });
      const detector = new SongDuplicateDetector(mock);

      const results = await detector.checkForDuplicates({ name: 'Hello   World', artistIds: [] });

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('exact');
    });

    it('DUP-06: combined normalization pipeline', async () => {
      const { findAllResult, findBySongIdResult } = setupForSingleSong({
        id: 's1',
        name: 'café au lait',
        artistIds: [],
      });
      const { mock } = createMockDb({ findAllResult, findBySongIdResult });
      const detector = new SongDuplicateDetector(mock);

      // Extra spaces + uppercase + NFD + trailing space
      const results = await detector.checkForDuplicates({ name: '  CAFÉ   AU  LAIT  ', artistIds: [] });

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('exact');
    });

    it('DUP-15: handles non-ASCII Unicode strings', async () => {
      const { findAllResult, findBySongIdResult } = setupForSingleSong({
        id: 's1',
        name: '日本語',
        artistIds: [],
      });
      const { mock } = createMockDb({ findAllResult, findBySongIdResult });
      const detector = new SongDuplicateDetector(mock);

      const results = await detector.checkForDuplicates({ name: '日本語', artistIds: [] });

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('exact');
    });

    it('DUP-16: handles emoji strings', async () => {
      const { findAllResult, findBySongIdResult } = setupForSingleSong({
        id: 's1',
        name: '🎵',
        artistIds: [],
      });
      const { mock } = createMockDb({ findAllResult, findBySongIdResult });
      const detector = new SongDuplicateDetector(mock);

      const results = await detector.checkForDuplicates({ name: '🎵', artistIds: [] });

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('exact');
    });
  });

  describe('Scenario A: exact duplicate', () => {
    it('DUP-07: same name + same artist set returns type: exact', async () => {
      const { findAllResult, findBySongIdResult } = setupForSingleSong({
        id: 's1',
        name: 'Bohemian Rhapsody',
        artistIds: ['a1', 'a2'],
      });
      const { mock } = createMockDb({ findAllResult, findBySongIdResult });
      const detector = new SongDuplicateDetector(mock);

      const results = await detector.checkForDuplicates({
        name: 'Bohemian Rhapsody',
        artistIds: ['a1', 'a2'],
      });

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('exact');
      expect(results[0].existingItem).toEqual(findAllResult[0]);
    });

    it('DUP-14: both with no artists returns type: exact', async () => {
      const { findAllResult, findBySongIdResult } = setupForSingleSong({
        id: 's1',
        name: 'Solo Song',
        artistIds: [],
      });
      const { mock } = createMockDb({ findAllResult, findBySongIdResult });
      const detector = new SongDuplicateDetector(mock);

      const results = await detector.checkForDuplicates({ name: 'Solo Song', artistIds: [] });

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('exact');
    });

    it('DUP-18: resolution options include Overwrite Existing and Skip Creation', async () => {
      const { findAllResult, findBySongIdResult } = setupForSingleSong({
        id: 's1',
        name: 'Test',
        artistIds: [],
      });
      const { mock } = createMockDb({ findAllResult, findBySongIdResult });
      const detector = new SongDuplicateDetector(mock);

      const results = await detector.checkForDuplicates({ name: 'Test', artistIds: [] });

      expect(results[0].resolutionOptions).toContain('Overwrite Existing');
      expect(results[0].resolutionOptions).toContain('Skip Creation');
    });
  });

  describe('Scenario B: partial overlap', () => {
    it('DUP-08: same name + different artists returns type: partial', async () => {
      const { findAllResult, findBySongIdResult } = setupForSingleSong({
        id: 's1',
        name: 'Test Song',
        artistIds: ['a1'],
      });
      const { mock } = createMockDb({ findAllResult, findBySongIdResult });
      const detector = new SongDuplicateDetector(mock);

      const results = await detector.checkForDuplicates({ name: 'Test Song', artistIds: ['a2'] });

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('partial');
    });

    it('DUP-09: same name + overlapping artists returns type: partial', async () => {
      const { findAllResult, findBySongIdResult } = setupForSingleSong({
        id: 's1',
        name: 'Test Song',
        artistIds: ['a1', 'a2'],
      });
      const { mock } = createMockDb({ findAllResult, findBySongIdResult });
      const detector = new SongDuplicateDetector(mock);

      // Overlap: a1 is shared, but a3 is different from a2
      const results = await detector.checkForDuplicates({ name: 'Test Song', artistIds: ['a1', 'a3'] });

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('partial');
    });

    it('DUP-13: candidate with no artists matches song with artists', async () => {
      const { findAllResult, findBySongIdResult } = setupForSingleSong({
        id: 's1',
        name: 'Test Song',
        artistIds: ['a1'],
      });
      const { mock } = createMockDb({ findAllResult, findBySongIdResult });
      const detector = new SongDuplicateDetector(mock);

      const results = await detector.checkForDuplicates({ name: 'Test Song', artistIds: [] });

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('partial');
    });

    it('DUP-19: resolution options include Merge Artists and Create Separate Entry', async () => {
      const { findAllResult, findBySongIdResult } = setupForSingleSong({
        id: 's1',
        name: 'Test',
        artistIds: ['a1'],
      });
      const { mock } = createMockDb({ findAllResult, findBySongIdResult });
      const detector = new SongDuplicateDetector(mock);

      const results = await detector.checkForDuplicates({ name: 'Test', artistIds: ['a2'] });

      expect(results[0].resolutionOptions).toContain('Merge Artists onto Existing Song');
      expect(results[0].resolutionOptions).toContain('Create Separate Entry');
    });
  });

  describe('No matches', () => {
    it('DUP-10: different name returns empty array', async () => {
      const { findAllResult, findBySongIdResult } = setupForSingleSong({
        id: 's1',
        name: 'Other Song',
        artistIds: [],
      });
      const { mock } = createMockDb({ findAllResult, findBySongIdResult });
      const detector = new SongDuplicateDetector(mock);

      const results = await detector.checkForDuplicates({ name: 'Different Song', artistIds: [] });

      expect(results).toEqual([]);
    });

    it('DUP-11: no songs in database returns empty array', async () => {
      const { mock } = createMockDb({ findAllResult: [], findBySongIdResult: {} });
      const detector = new SongDuplicateDetector(mock);

      const results = await detector.checkForDuplicates({ name: 'Any Song', artistIds: [] });

      expect(results).toEqual([]);
    });
  });

  describe('Multiple matches', () => {
    it('DUP-12: two songs with same normalized name returns 2 results', async () => {
      const song1 = makeSong({ id: 's1', name: 'Test Song' });
      const song2 = makeSong({ id: 's2', name: 'Test Song' });
      const findBySongIdResult: Record<string, SongArtist[]> = {
        s1: [],
        s2: [],
      };
      const { mock } = createMockDb({
        findAllResult: [song1, song2],
        findBySongIdResult,
      });
      const detector = new SongDuplicateDetector(mock);

      const results = await detector.checkForDuplicates({ name: 'Test Song', artistIds: [] });

      expect(results).toHaveLength(2);
      expect(results[0].type).toBe('exact');
      expect(results[1].type).toBe('exact');
    });
  });

  describe('Error handling', () => {
    it('DUP-20: database error propagates', async () => {
      const mock: DatabaseConnection = {
        open: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
        execute: jest.fn(),
        query: jest.fn().mockRejectedValue(new Error('DB error')),
        transaction: jest.fn(),
      };
      const detector = new SongDuplicateDetector(mock);

      await expect(
        detector.checkForDuplicates({ name: 'Test', artistIds: [] }),
      ).rejects.toThrow('DB error');
    });
  });
});

/**
 * Helper to set up mock data for a single song scenario.
 */
function setupForSingleSong(options: {
  id: string;
  name: string;
  artistIds: string[];
}): {
  findAllResult: Song[];
  findBySongIdResult: Record<string, SongArtist[]>;
} {
  const song = makeSong({ id: options.id, name: options.name });
  const artistEntries: SongArtist[] = options.artistIds.map((artistId, index) =>
    makeSongArtist({ song_id: options.id, artist_id: artistId, sort_order: index }),
  );

  return {
    findAllResult: [song],
    findBySongIdResult: { [options.id]: artistEntries },
  };
}
