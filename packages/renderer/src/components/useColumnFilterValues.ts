import { useQuery } from '@tanstack/react-query';

/**
 * TanStack Query hook that fetches unique values for a given column
 * from the database.
 *
 * For Songs category:
 * - "language_id" → LanguageRepository.findAll() → display names
 * - "album_name" → SongRepository.findAll() → unique non-null album names
 * - "name" → returns [] (song name filter uses search text, not multi-select)
 * - "artists" → ArtistRepository.findAll() → display names
 *
 * Cache key: ['column-values', columnKey]
 * Stale time: 60 seconds (column values rarely change)
 */
export function useColumnFilterValues(columnKey: string) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['column-values', columnKey],
    queryFn: async (): Promise<string[]> => {
      const { getLanguageRepo, getArtistRepo, getSongRepo } = await import(
        '../categories/songs/store/useSongsStore.js'
      );

      switch (columnKey) {
        case 'language_id': {
          const repo = getLanguageRepo();
          const languages = await repo.findAll();
          return [...new Set(languages.map((l) => l.name))].sort();
        }

        case 'album_name': {
          const repo = getSongRepo();
          const songs = await repo.findAll();
          const albums = songs
            .map((s) => s.album_name)
            .filter((a): a is string => a !== null && a !== undefined);
          return [...new Set(albums)].sort();
        }

        case 'artists': {
          const repo = getArtistRepo();
          const artists = await repo.findAll();
          return [...new Set(artists.map((a) => a.display_name))].sort();
        }

        case 'name':
        default:
          return [];
      }
    },
    staleTime: 60_000,
    enabled: columnKey !== 'name',
  });

  return {
    values: data ?? [],
    isLoading,
    error: error as Error | null,
  };
}
