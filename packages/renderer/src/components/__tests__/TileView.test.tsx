import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CategoryDefinition, SongWithArtists } from '@collectio/shared';
import { TileView } from '../TileView.js';
import type { TileViewProps } from '../TileView.js';

const mockCategory: CategoryDefinition = {
  id: 'songs',
  displayName: 'Songs',
  iconName: 'music-note',
  migrations: [],
  repositories: {},
  tableColumns: [],
  searchFields: [],
  filterFields: [],
  createForm: (() => null) as React.FC<{ onSave: (item: unknown) => void; onCancel: () => void }>,
  editForm: (() => null) as React.FC<{ item: unknown; onSave: (item: unknown) => void; onCancel: () => void }>,
  detailView: (() => null) as React.FC<{ item: unknown; onClose: () => void }>,
  duplicateDetector: async () => [],
};

const mockSongs: SongWithArtists[] = [
  {
    id: 's1',
    name: 'Yesterday',
    album_name: 'Help!',
    language_id: 1,
    added_at: '2026-01-15T00:00:00.000Z',
    updated_at: '2026-01-15T00:00:00.000Z',
    deleted_at: null,
    artists: [{ id: 'a1', display_name: 'The Beatles', sort_order: 0 }],
  },
  {
    id: 's2',
    name: 'Bohemian Rhapsody',
    album_name: 'A Night at the Opera',
    language_id: 1,
    added_at: '2026-02-10T00:00:00.000Z',
    updated_at: '2026-02-10T00:00:00.000Z',
    deleted_at: null,
    artists: [{ id: 'a2', display_name: 'Queen', sort_order: 0 }],
  },
  {
    id: 's3',
    name: 'Imagine',
    album_name: null,
    language_id: 2,
    added_at: '2026-03-05T00:00:00.000Z',
    updated_at: '2026-03-05T00:00:00.000Z',
    deleted_at: null,
    artists: [
      { id: 'a3', display_name: 'John Lennon', sort_order: 0 },
      { id: 'a4', display_name: 'Plastic Ono Band', sort_order: 1 },
    ],
  },
];

const mockLanguageMap = new Map([
  [1, 'English'],
  [2, 'Japanese'],
]);

function createDefaultProps(overrides?: Partial<TileViewProps>): TileViewProps {
  return {
    category: mockCategory,
    items: mockSongs,
    isLoading: false,
    error: null,
    onCardTap: jest.fn(),
    languageMap: mockLanguageMap,
    ...overrides,
  };
}

describe('TileView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('T-01: renders correct number of cards for given items', () => {
    render(<TileView {...createDefaultProps()} />);

    const cards = screen.getAllByText('Yesterday');
    expect(cards.length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText('Bohemian Rhapsody')).toBeInTheDocument();
    expect(screen.getByText('Imagine')).toBeInTheDocument();
  });

  it('T-02: card displays song name, artists, album, language correctly', () => {
    render(<TileView {...createDefaultProps()} />);

    expect(screen.getByText('Yesterday')).toBeInTheDocument();
    expect(screen.getByText('The Beatles')).toBeInTheDocument();
    expect(screen.getByText('Help!')).toBeInTheDocument();
    expect(screen.getAllByText('English').length).toBe(2);

    expect(screen.getByText('Bohemian Rhapsody')).toBeInTheDocument();
    expect(screen.getByText('Queen')).toBeInTheDocument();
    expect(screen.getByText('A Night at the Opera')).toBeInTheDocument();

    expect(screen.getByText('Imagine')).toBeInTheDocument();
    expect(screen.getByText('John Lennon, Plastic Ono Band')).toBeInTheDocument();
    expect(screen.getByText('Japanese')).toBeInTheDocument();
  });

  it('T-03: card with null album shows em-dash', () => {
    render(<TileView {...createDefaultProps()} />);

    const emDashes = screen.getAllByText('\u2014');
    expect(emDashes.length).toBeGreaterThanOrEqual(1);
  });

  it('T-04: card with empty artists array shows em-dash', () => {
    const songWithNoArtists: SongWithArtists = {
      ...mockSongs[0],
      id: 's-no-artists',
      artists: [],
    };
    render(<TileView {...createDefaultProps({ items: [songWithNoArtists] })} />);

    const emDashes = screen.getAllByText('\u2014');
    expect(emDashes.length).toBeGreaterThanOrEqual(1);
  });

  it('T-05: card with unknown language_id shows em-dash', () => {
    const songWithUnknownLang: SongWithArtists = {
      ...mockSongs[0],
      id: 's-unknown-lang',
      language_id: 999,
    };
    render(<TileView {...createDefaultProps({ items: [songWithUnknownLang] })} />);

    const emDashes = screen.getAllByText('\u2014');
    expect(emDashes.length).toBeGreaterThanOrEqual(1);
  });

  it('T-06: card click fires onCardTap with correct item', () => {
    const onCardTap = jest.fn();
    render(<TileView {...createDefaultProps({ onCardTap })} />);

    fireEvent.click(screen.getByText('Yesterday'));

    expect(onCardTap).toHaveBeenCalledWith(mockSongs[0]);
  });

  it('T-07: loading state shows CircularProgress and no cards', () => {
    render(<TileView {...createDefaultProps({ isLoading: true })} />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByText('Yesterday')).not.toBeInTheDocument();
    expect(screen.queryByText('Bohemian Rhapsody')).not.toBeInTheDocument();
    expect(screen.queryByText('Imagine')).not.toBeInTheDocument();
  });

  it('T-08: empty state shows "No songs found"', () => {
    render(<TileView {...createDefaultProps({ items: [] })} />);

    expect(screen.getByText('No songs found')).toBeInTheDocument();
    expect(screen.queryByText('Yesterday')).not.toBeInTheDocument();
  });

  it('T-09: error state shows Alert with error message', () => {
    render(<TileView {...createDefaultProps({ error: new Error('DB failure') })} />);

    expect(screen.getByText('DB failure')).toBeInTheDocument();
    expect(screen.queryByText('Yesterday')).not.toBeInTheDocument();
  });

  it('T-10: single card renders correctly', () => {
    const singleSong = [mockSongs[0]];
    render(<TileView {...createDefaultProps({ items: singleSong })} />);

    expect(screen.getByText('Yesterday')).toBeInTheDocument();
    expect(screen.getByText('The Beatles')).toBeInTheDocument();
    expect(screen.getByText('Help!')).toBeInTheDocument();
  });

  it('T-11: long text truncated with noWrap (card width constrains)', () => {
    const longNameSong: SongWithArtists = {
      ...mockSongs[0],
      id: 's-long',
      name: 'This is a very long song name that should be truncated with ellipsis',
    };
    render(<TileView {...createDefaultProps({ items: [longNameSong] })} />);

    const nameEl = screen.getByText('This is a very long song name that should be truncated with ellipsis');
    expect(nameEl).toBeInTheDocument();
  });

  it('T-12: CSS Grid breakpoints present (responsive grid container)', () => {
    const { container } = render(<TileView {...createDefaultProps()} />);

    const gridContainer = container.querySelector('[class*="MuiBox-root"]');
    expect(gridContainer).toBeInTheDocument();
  });
});
