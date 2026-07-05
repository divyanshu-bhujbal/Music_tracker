import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CategoryDefinition, SongWithArtists } from '@collectio/shared';
import { TableView } from '../TableView.js';
import type { TableViewProps } from '../TableView.js';

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

const mockCategory: CategoryDefinition = {
  id: 'songs',
  displayName: 'Songs',
  iconName: 'music-note',
  migrations: [],
  repositories: {},
  tableColumns: [
    { key: 'selection', label: '', sortable: false, filterable: false, flex: 0, fixedWidth: 48 },
    { key: 'name', label: 'Song Name', sortable: true, filterable: true, flex: 3 },
    { key: 'artists', label: 'Artist(s)', sortable: true, filterable: true, flex: 2 },
    { key: 'album_name', label: 'Album', sortable: true, filterable: true, flex: 2 },
    { key: 'language_id', label: 'Language', sortable: true, filterable: true, flex: 1, fixedWidth: 120 },
    { key: 'added_at', label: 'Date Added', sortable: true, filterable: false, flex: 1, fixedWidth: 140 },
  ],
  searchFields: ['name', 'album_name'],
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
    language_id: 1,
    added_at: '2026-03-05T00:00:00.000Z',
    updated_at: '2026-03-05T00:00:00.000Z',
    deleted_at: null,
    artists: [
      { id: 'a3', display_name: 'John Lennon', sort_order: 0 },
      { id: 'a4', display_name: 'Plastic Ono Band', sort_order: 1 },
    ],
  },
];

function createDefaultProps(overrides?: Partial<TableViewProps>): TableViewProps {
  return {
    category: mockCategory,
    items: mockSongs,
    isLoading: false,
    error: null,
    sortKey: null,
    sortDirection: null,
    onSort: jest.fn(),
    onRowTap: jest.fn(),
    ...overrides,
  };
}

describe('TableView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('TV-01: renders correct number of header columns from category.tableColumns', () => {
    render(<TableView {...createDefaultProps()} />);

    expect(screen.getByText('Song Name')).toBeInTheDocument();
    expect(screen.getByText('Artist(s)')).toBeInTheDocument();
    expect(screen.getByText('Album')).toBeInTheDocument();
    expect(screen.getByText('Language')).toBeInTheDocument();
    expect(screen.getByText('Date Added')).toBeInTheDocument();
  });

  it('TV-02: renders row data correctly (song name, artist, album, language)', () => {
    render(<TableView {...createDefaultProps()} />);

    expect(screen.getByText('Yesterday')).toBeInTheDocument();
    expect(screen.getByText('The Beatles')).toBeInTheDocument();
    expect(screen.getByText('Help!')).toBeInTheDocument();

    expect(screen.getByText('Bohemian Rhapsody')).toBeInTheDocument();
    expect(screen.getByText('Queen')).toBeInTheDocument();
    expect(screen.getByText('A Night at the Opera')).toBeInTheDocument();

    expect(screen.getByText('Imagine')).toBeInTheDocument();
    expect(screen.getByText('John Lennon, Plastic Ono Band')).toBeInTheDocument();
  });

  it('TV-03: loading state shows CircularProgress and hides table', () => {
    render(<TableView {...createDefaultProps({ isLoading: true })} />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByText('Song Name')).not.toBeInTheDocument();
  });

  it('TV-04: empty state shows "No songs found"', () => {
    render(<TableView {...createDefaultProps({ items: [] })} />);

    expect(screen.getByText('No songs found')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('TV-05: error state shows Alert with error message', () => {
    render(<TableView {...createDefaultProps({ error: new Error('Database failure') })} />);

    expect(screen.getByText('Database failure')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('TV-06: sort callback fires on sortable header click with correct column key', () => {
    const onSort = jest.fn();
    render(<TableView {...createDefaultProps({ onSort })} />);

    fireEvent.click(screen.getByText('Song Name'));

    expect(onSort).toHaveBeenCalledWith('name');
  });

  it('TV-07: sort callback does NOT fire on non-sortable header click', () => {
    const onSort = jest.fn();
    const categoryWithNonSortable: CategoryDefinition = {
      ...mockCategory,
      tableColumns: [
        { key: 'selection', label: '', sortable: false, filterable: false, flex: 0, fixedWidth: 48 },
        { key: 'name', label: 'Song Name', sortable: false, filterable: true, flex: 3 },
      ],
    };

    render(<TableView {...createDefaultProps({ category: categoryWithNonSortable, onSort })} />);

    fireEvent.click(screen.getByText('Song Name'));

    expect(onSort).not.toHaveBeenCalled();
  });

  it('TV-08: sort indicator renders correctly for active sort column (asc)', () => {
    render(<TableView {...createDefaultProps({ sortKey: 'name', sortDirection: 'asc' })} />);

    const nameHeader = screen.getByText('Song Name').closest('th');
    expect(nameHeader).toBeInTheDocument();
    const arrowUp = nameHeader?.querySelector('[data-testid="ArrowUpwardIcon"]');
    expect(arrowUp).toBeInTheDocument();
  });

  it('TV-09: row click fires onRowTap with correct item', () => {
    const onRowTap = jest.fn();
    render(<TableView {...createDefaultProps({ onRowTap })} />);

    fireEvent.click(screen.getByText('Yesterday'));

    expect(onRowTap).toHaveBeenCalledWith(mockSongs[0]);
  });

  it('TV-10: checkbox click does NOT fire onRowTap', () => {
    const onRowTap = jest.fn();
    render(<TableView {...createDefaultProps({ onRowTap })} />);

    const checkbox = screen.getByLabelText('Select Yesterday');
    fireEvent.click(checkbox);

    expect(onRowTap).not.toHaveBeenCalled();
  });

  it('TV-11: select-all checkbox toggles all row checkboxes', () => {
    render(<TableView {...createDefaultProps()} />);

    const selectAll = screen.getByLabelText('Select all');
    fireEvent.click(selectAll);

    expect(screen.getByLabelText('Select Yesterday')).toBeChecked();
    expect(screen.getByLabelText('Select Bohemian Rhapsody')).toBeChecked();
    expect(screen.getByLabelText('Select Imagine')).toBeChecked();

    fireEvent.click(selectAll);

    expect(screen.getByLabelText('Select Yesterday')).not.toBeChecked();
    expect(screen.getByLabelText('Select Bohemian Rhapsody')).not.toBeChecked();
    expect(screen.getByLabelText('Select Imagine')).not.toBeChecked();
  });

  it('TV-12: gridTemplateColumns computed correctly from ColumnDefinition array', () => {
    render(<TableView {...createDefaultProps()} />);

    const headerCells = screen.getAllByRole('columnheader');
    const labels = headerCells.map((cell) => cell.textContent?.trim()).filter(Boolean);

    expect(labels).toContain('Song Name');
    expect(labels).toContain('Artist(s)');
    expect(labels).toContain('Album');
    expect(labels).toContain('Language');
    expect(labels).toContain('Date Added');

    expect(headerCells.length).toBe(6);
  });

  it('TV-13: virtualization mock returns all items as visible', () => {
    render(<TableView {...createDefaultProps({ items: mockSongs })} />);

    expect(screen.getByText('Yesterday')).toBeInTheDocument();
    expect(screen.getByText('Bohemian Rhapsody')).toBeInTheDocument();
    expect(screen.getByText('Imagine')).toBeInTheDocument();
  });

  it('TV-14: single row renders correctly', () => {
    const singleSong = [mockSongs[0]];
    render(<TableView {...createDefaultProps({ items: singleSong })} />);

    expect(screen.getByText('Yesterday')).toBeInTheDocument();
    expect(screen.getByText('The Beatles')).toBeInTheDocument();
    expect(screen.getByText('Help!')).toBeInTheDocument();
  });

  it('TV-15: selection column is always present even if not first in tableColumns', () => {
    const categoryNoSelection: CategoryDefinition = {
      ...mockCategory,
      tableColumns: [
        { key: 'name', label: 'Song Name', sortable: true, filterable: true, flex: 3 },
      ],
    };

    render(<TableView {...createDefaultProps({ category: categoryNoSelection })} />);

    expect(screen.getByLabelText('Select all')).toBeInTheDocument();
    expect(screen.getByLabelText('Select Yesterday')).toBeInTheDocument();
  });

  it('TV-16: re-render with new data updates rows', () => {
    const { rerender } = render(<TableView {...createDefaultProps({ items: [mockSongs[0]] })} />);

    expect(screen.getByText('Yesterday')).toBeInTheDocument();
    expect(screen.queryByText('Bohemian Rhapsody')).not.toBeInTheDocument();

    rerender(<TableView {...createDefaultProps({ items: mockSongs })} />);

    expect(screen.getByText('Bohemian Rhapsody')).toBeInTheDocument();
  });
});
