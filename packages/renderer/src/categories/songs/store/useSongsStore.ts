import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query';
import type { DatabaseConnection } from '@collectio/shared';
import type { CreateSongInput, UpdateSongInput, SongWithArtists } from '@collectio/shared';
import type { Artist } from '@collectio/shared';
import type { Language } from '@collectio/shared';
import { SongRepository } from '@collectio/shared';
import { ArtistRepository } from '@collectio/shared';
import { SongArtistRepository } from '@collectio/shared';
import { LanguageRepository } from '@collectio/shared';
import { FilterEngine, SortEngine } from '@collectio/shared';
import { SongsCategory } from '../SongsCategory.js';

let _db: DatabaseConnection | null = null;
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

function getDb(): DatabaseConnection {
  if (!_db) {
    throw new Error(
      'Songs store not configured. Call configureSongsStore(db) first.',
    );
  }
  return _db;
}

function getSongRepo(): SongRepository {
  return new SongRepository(getDb());
}

function getArtistRepo(): ArtistRepository {
  return new ArtistRepository(getDb());
}

function getSongArtistRepo(): SongArtistRepository {
  return new SongArtistRepository(getDb());
}

function getLanguageRepo(): LanguageRepository {
  return new LanguageRepository(getDb());
}

export { getSongRepo, getArtistRepo, getSongArtistRepo, getLanguageRepo, getDb };

/**
 * Configure the songs store with a database connection.
 * Must be called once at app startup before using any store hooks.
 */
export function configureSongsStore(db: DatabaseConnection): void {
  _db = db;
}

/**
 * Get the QueryClient for wrapping the React tree with QueryClientProvider.
 */
export function getSongsQueryClient(): QueryClient {
  return queryClient;
}

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * Fetch all active songs with their artists.
 */
export function useSongs() {
  return useQuery({
    queryKey: ['songs'],
    queryFn: async (): Promise<SongWithArtists[]> => {
      const repo = getSongRepo();
      const songs = await repo.findAll();
      const results: SongWithArtists[] = [];
      for (const song of songs) {
        const songWithArtists = await repo.findSongWithArtists(song.id);
        if (songWithArtists) {
          results.push(songWithArtists);
        }
      }
      return results;
    },
  });
}

/**
 * Fetch artists, optionally filtered by query string.
 */
export function useArtists(query?: string) {
  return useQuery({
    queryKey: ['artists', query ?? ''],
    queryFn: async (): Promise<Artist[]> => {
      const repo = getArtistRepo();
      if (query && query.trim().length > 0) {
        const all = await repo.findAll();
        const lower = query.toLowerCase();
        return all.filter((a) => a.display_name.toLowerCase().includes(lower));
      }
      return repo.findAll();
    },
    staleTime: 30_000,
  });
}

/**
 * Fetch all languages.
 */
export function useLanguages() {
  return useQuery({
    queryKey: ['languages'],
    queryFn: async (): Promise<Language[]> => {
      return getLanguageRepo().findAll();
    },
    staleTime: 30_000,
  });
}

// ─── Mutations ──────────────────────────────────────────────────────────────

/**
 * Create a new song with associated artists.
 */
export function useCreateSong() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSongInput & { artistIds: string[] }) => {
      const songRepo = getSongRepo();
      const songArtistRepo = getSongArtistRepo();
      const song = await songRepo.create(input);
      for (let i = 0; i < input.artistIds.length; i++) {
        await songArtistRepo.add(song.id, input.artistIds[i], i);
      }
      return song;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['songs'] });
    },
  });
}

/**
 * Update an existing song. Handles artist set diffing externally.
 */
export function useUpdateSong() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string;
      input: UpdateSongInput;
    }) => {
      await getSongRepo().update(id, input);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['songs'] });
    },
  });
}

/**
 * Soft-delete a song.
 */
export function useDeleteSong() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await getSongRepo().softDelete(id);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['songs'] });
    },
  });
}

/**
 * Restore a soft-deleted song.
 */
export function useRestoreSong() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await getSongRepo().restore(id);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['songs'] });
    },
  });
}

/**
 * Create a new artist.
 */
export function useCreateArtist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (displayName: string): Promise<Artist> => {
      return getArtistRepo().create(displayName);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['artists'] });
    },
  });
}

// ─── Filtered Queries ──────────────────────────────────────────────────────

/**
 * Fetch songs matching the given search text, column filters, and sort.
 * Uses FilterEngine and SortEngine to build parameterized SQL.
 */
export function useFilteredSongs(
  searchText: string,
  columnFilters: Record<string, string[]>,
  sortKey: string | null,
  sortDirection: 'asc' | 'desc',
) {
  return useQuery({
    queryKey: ['songs', 'filtered', searchText, columnFilters, sortKey, sortDirection],
    queryFn: async (): Promise<SongWithArtists[]> => {
      const filter = FilterEngine.buildFilter(
        SongsCategory,
        searchText,
        columnFilters,
      );
      const sort = SortEngine.buildSort(
        sortKey,
        sortDirection,
        SongsCategory.tableColumns,
      );
      const repo = getSongRepo();
      const songs = await repo.findFiltered(filter, sort);
      const results: SongWithArtists[] = [];
      for (const song of songs) {
        const songWithArtists = await repo.findSongWithArtists(song.id);
        if (songWithArtists) {
          results.push(songWithArtists);
        }
      }
      return results;
    },
  });
}
