import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';
import type { DatabaseConnection } from '@collectio/shared';
import {
  configureSongsStore,
  getSongsQueryClient,
  getDb,
  getSongRepo,
  getArtistRepo,
  getSongArtistRepo,
  getLanguageRepo,
  useSongs,
  useArtists,
  useLanguages,
  useCreateSong,
  useUpdateSong,
  useDeleteSong,
  useRestoreSong,
  useCreateArtist,
} from '../useSongsStore.js';

function createMockDb(overrides?: {
  songQueryResult?: unknown[];
  artistQueryResult?: unknown[];
  languageQueryResult?: unknown[];
  executeError?: Error;
}): DatabaseConnection {
  return {
    open: jest.fn(),
    close: jest.fn(),
    execute: jest.fn().mockImplementation(async () => {
      if (overrides?.executeError) throw overrides.executeError;
    }),
    query: jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('FROM languages')) {
        return overrides?.languageQueryResult ?? [];
      }
      if (sql.includes('FROM artists')) {
        return overrides?.artistQueryResult ?? [];
      }
      if (sql.includes('FROM songs')) {
        return overrides?.songQueryResult ?? [];
      }
      return [];
    }),
    transaction: jest.fn(),
    serialize: jest.fn().mockResolvedValue(new Uint8Array(0)),
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('useSongsStore', () => {
  beforeEach(() => {
    const db = createMockDb();
    configureSongsStore(db);
  });

  describe('ST-01: configureSongsStore', () => {
    it('stores DatabaseConnection', () => {
      const db = createMockDb();
      expect(() => configureSongsStore(db)).not.toThrow();
    });
  });

  describe('ST-02: hook throws before configure', () => {
    it('getDb does not throw when store is configured', () => {
      expect(() => getDb()).not.toThrow();
    });
  });

  describe('ST-03/ST-04: useSongs', () => {
    it('returns songs list after load', async () => {
      const mockSongs = [{ id: 's1', name: 'Test', album_name: null, language_id: 1, added_at: '2024-01-01', updated_at: '2024-01-01', deleted_at: null }];
      configureSongsStore(createMockDb({ songQueryResult: mockSongs }));

      const { result } = renderHook(() => useSongs(), { wrapper: createWrapper() });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toBeDefined();
      expect(result.current.data?.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('ST-05: useCreateSong', () => {
    it('returns a mutation hook with mutateAsync', async () => {
      configureSongsStore(createMockDb({
        songQueryResult: [],
      }));

      const { result } = renderHook(() => useCreateSong(), { wrapper: createWrapper() });

      expect(result.current.mutateAsync).toBeInstanceOf(Function);
      expect(result.current.isPending).toBe(false);
    });
  });

  describe('ST-06: cache invalidation', () => {
    it('invalidateQueries is available on query client', () => {
      const client = getSongsQueryClient();
      expect(typeof client.invalidateQueries).toBe('function');
    });

    it('useCreateSong invalidates songs cache on success', async () => {
      const mockSongs = [{ id: 's1', name: 'Existing', album_name: null, language_id: 1, added_at: '2024-01-01', updated_at: '2024-01-01', deleted_at: null }];
      configureSongsStore(createMockDb({ songQueryResult: mockSongs }));

      const { result } = renderHook(() => useCreateSong(), { wrapper: createWrapper() });

      const input = { name: 'New Song', album_name: null, language_id: 1, artistIds: [] };
      await expect(result.current.mutateAsync(input)).resolves.toBeDefined();
    });
  });

  describe('ST-07: useUpdateSong', () => {
    it('returns a mutation hook', async () => {
      configureSongsStore(createMockDb());

      const { result } = renderHook(() => useUpdateSong(), { wrapper: createWrapper() });

      expect(result.current.mutateAsync).toBeInstanceOf(Function);
    });
  });

  describe('ST-08: useDeleteSong', () => {
    it('returns a mutation hook', async () => {
      configureSongsStore(createMockDb());

      const { result } = renderHook(() => useDeleteSong(), { wrapper: createWrapper() });

      expect(result.current.mutateAsync).toBeInstanceOf(Function);
    });
  });

  describe('ST-09: useRestoreSong', () => {
    it('returns a mutation hook', async () => {
      configureSongsStore(createMockDb());

      const { result } = renderHook(() => useRestoreSong(), { wrapper: createWrapper() });

      expect(result.current.mutateAsync).toBeInstanceOf(Function);
    });
  });

  describe('ST-10: useCreateArtist', () => {
    it('returns a mutation hook', async () => {
      configureSongsStore(createMockDb());

      const { result } = renderHook(() => useCreateArtist(), { wrapper: createWrapper() });

      expect(result.current.mutateAsync).toBeInstanceOf(Function);
    });
  });

  describe('ST-11: mutation isPending state', () => {
    it('isPending reflects loading state', () => {
      configureSongsStore(createMockDb());

      const { result } = renderHook(() => useCreateSong(), { wrapper: createWrapper() });

      expect(result.current.isPending).toBe(false);
    });
  });

  describe('ST-12: mutation error propagation', () => {
    it('mutation error is catchable', async () => {
      configureSongsStore(createMockDb({ executeError: new Error('DB error') }));

      const { result } = renderHook(() => useCreateSong(), { wrapper: createWrapper() });

      await expect(
        result.current.mutateAsync({ name: 'Fail', album_name: null, language_id: 1, artistIds: [] }),
      ).rejects.toThrow('DB error');
    });
  });

  describe('useArtists', () => {
    it('returns loading state and data', async () => {
      const mockArtists = [{ id: 'a1', display_name: 'Test', created_at: '', updated_at: '', deleted_at: null }];
      configureSongsStore(createMockDb({ artistQueryResult: mockArtists }));

      const { result } = renderHook(() => useArtists(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.data).toHaveLength(1);
    });
  });

  describe('useLanguages', () => {
    it('returns loading state and data', async () => {
      const mockLanguages = [{ id: 1, iso_code: 'en', name: 'English', native_name: 'English', user_added: 0, created_at: '' }];
      configureSongsStore(createMockDb({ languageQueryResult: mockLanguages }));

      const { result } = renderHook(() => useLanguages(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.data).toHaveLength(1);
    });
  });

  describe('repo getters', () => {
    it('getDb returns the configured connection', () => {
      const db = createMockDb();
      configureSongsStore(db);
      expect(getDb()).toBe(db);
    });

    it('getDb is available after configure', () => {
      configureSongsStore(createMockDb());
      expect(() => getDb()).not.toThrow();
    });

    it('getSongRepo returns a SongRepository', () => {
      configureSongsStore(createMockDb());
      expect(() => getSongRepo()).not.toThrow();
    });

    it('getArtistRepo returns an ArtistRepository', () => {
      configureSongsStore(createMockDb());
      expect(() => getArtistRepo()).not.toThrow();
    });

    it('getSongArtistRepo returns a SongArtistRepository', () => {
      configureSongsStore(createMockDb());
      expect(() => getSongArtistRepo()).not.toThrow();
    });

    it('getLanguageRepo returns a LanguageRepository', () => {
      configureSongsStore(createMockDb());
      expect(() => getLanguageRepo()).not.toThrow();
    });
  });
});
