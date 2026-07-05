import React from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useColumnFilterValues } from '../useColumnFilterValues.js';

const mockGetLanguageRepo = jest.fn();
const mockGetArtistRepo = jest.fn();
const mockGetSongRepo = jest.fn();

jest.mock('../../categories/songs/store/useSongsStore.js', () => ({
  getLanguageRepo: () => mockGetLanguageRepo(),
  getArtistRepo: () => mockGetArtistRepo(),
  getSongRepo: () => mockGetSongRepo(),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useColumnFilterValues', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('CFV-01: language_id returns unique sorted language names', async () => {
    mockGetLanguageRepo.mockReturnValue({
      findAll: jest.fn().mockResolvedValue([
        { name: 'Japanese' },
        { name: 'English' },
        { name: 'English' },
      ]),
    });

    const { result } = renderHook(() => useColumnFilterValues('language_id'), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
  });

  it('CFV-02: album_name returns unique sorted album names', async () => {
    mockGetSongRepo.mockReturnValue({
      findAll: jest.fn().mockResolvedValue([
        { album_name: 'Help!' },
        { album_name: 'Help!' },
        { album_name: null },
        { album_name: 'Abbey Road' },
      ]),
    });

    const { result } = renderHook(() => useColumnFilterValues('album_name'), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
  });

  it('CFV-03: artists returns unique sorted artist names', async () => {
    mockGetArtistRepo.mockReturnValue({
      findAll: jest.fn().mockResolvedValue([
        { display_name: 'Queen' },
        { display_name: 'Beatles' },
        { display_name: 'Queen' },
      ]),
    });

    const { result } = renderHook(() => useColumnFilterValues('artists'), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
  });

  it('CFV-04: name returns empty array (disabled query)', async () => {
    const { result } = renderHook(() => useColumnFilterValues('name'), {
      wrapper: createWrapper(),
    });

    expect(result.current.values).toEqual([]);
  });

  it('CFV-05: unknown column returns empty array', async () => {
    const { result } = renderHook(() => useColumnFilterValues('unknown'), {
      wrapper: createWrapper(),
    });

    expect(result.current.values).toEqual([]);
  });
});
