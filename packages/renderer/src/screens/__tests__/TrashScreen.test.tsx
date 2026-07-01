import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import { TrashScreen } from '../TrashScreen.js';
import type { SongWithArtists } from '@collectio/shared';

const mockUseDeletedSongs = jest.fn();
const mockUseRestoreSong = jest.fn();
const mockUseLanguages = jest.fn();

jest.mock('../../categories/songs/store/useSongsStore.js', () => ({
  useDeletedSongs: () => mockUseDeletedSongs(),
  useRestoreSong: () => mockUseRestoreSong(),
  useLanguages: () => mockUseLanguages(),
}));

jest.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: jest.fn().mockImplementation(({ count, estimateSize }: {
    count: number;
    estimateSize: () => number;
  }) => {
    const size = estimateSize();
    const items = Array.from({ length: count }, (_, i) => ({
      index: i,
      start: i * size,
      size,
      key: i,
      measureElement: jest.fn(),
    }));
    return {
      getVirtualItems: () => items,
      getTotalSize: () => count * size,
      measureElement: jest.fn(),
      scrollToIndex: jest.fn(),
    };
  }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <HashRouter>{children}</HashRouter>
    </QueryClientProvider>
  );
}

const deletedSong: SongWithArtists = {
  id: 'song-1',
  name: 'Deleted Song',
  album_name: 'Deleted Album',
  language_id: 1,
  added_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-06-15T00:00:00.000Z',
  deleted_at: '2026-06-15T00:00:00.000Z',
  artists: [{ id: 'artist-1', display_name: 'Deleted Artist', sort_order: 0 }],
};

describe('TrashScreen', () => {
  beforeEach(() => {
    mockUseLanguages.mockReturnValue({ data: [{ id: 1, name: 'English' }] });
    mockUseRestoreSong.mockReturnValue({
      mutateAsync: jest.fn().mockResolvedValue(undefined),
      isPending: false,
    });
  });

  it('TS-01: renders loading state', () => {
    mockUseDeletedSongs.mockReturnValue({ data: [], isLoading: true, error: null });

    render(<TrashScreen />, { wrapper: createWrapper() });

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('TS-02: renders empty state', () => {
    mockUseDeletedSongs.mockReturnValue({ data: [], isLoading: false, error: null });

    render(<TrashScreen />, { wrapper: createWrapper() });

    expect(screen.getByText('Trash is empty')).toBeInTheDocument();
  });

  it('TS-03: renders deleted song rows', () => {
    mockUseDeletedSongs.mockReturnValue({
      data: [deletedSong],
      isLoading: false,
      error: null,
    });

    render(<TrashScreen />, { wrapper: createWrapper() });

    expect(screen.getByText('Deleted Song')).toBeInTheDocument();
    expect(screen.getByText('Deleted Artist')).toBeInTheDocument();
    expect(screen.getByText('Deleted Album')).toBeInTheDocument();
    expect(screen.getByText('English')).toBeInTheDocument();
  });

  it('TS-04: renders error state', () => {
    mockUseDeletedSongs.mockReturnValue({
      data: [],
      isLoading: false,
      error: new Error('DB error'),
    });

    render(<TrashScreen />, { wrapper: createWrapper() });

    expect(screen.getByText('DB error')).toBeInTheDocument();
  });

  it('TS-05: restore button triggers mutation', async () => {
    const mutateAsync = jest.fn().mockResolvedValue(undefined);
    mockUseRestoreSong.mockReturnValue({ mutateAsync, isPending: false });
    mockUseDeletedSongs.mockReturnValue({
      data: [deletedSong],
      isLoading: false,
      error: null,
    });

    render(<TrashScreen />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByText('Restore'));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith('song-1');
    });
  });

  it('TS-06: restore button shows loading state after click', async () => {
    let resolveRestore: () => void;
    const restorePromise = new Promise<void>((resolve) => {
      resolveRestore = resolve;
    });
    const mutateAsync = jest.fn().mockReturnValue(restorePromise);
    mockUseRestoreSong.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
    mockUseDeletedSongs.mockReturnValue({
      data: [deletedSong],
      isLoading: false,
      error: null,
    });

    render(<TrashScreen />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByText('Restore'));

    await waitFor(() => {
      expect(screen.queryByText('Restore')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    resolveRestore!();
  });

  it('TS-07: displays trash count in header', () => {
    mockUseDeletedSongs.mockReturnValue({
      data: [deletedSong],
      isLoading: false,
      error: null,
    });

    render(<TrashScreen />, { wrapper: createWrapper() });

    expect(screen.getByText('Trash (1)')).toBeInTheDocument();
  });
});
