import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CategoryScreen } from '../CategoryScreen.js';
import type { CategoryDefinition } from '@collectio/shared';

const mockCategory: CategoryDefinition = {
  id: 'songs',
  displayName: 'Songs',
  iconName: 'music-note',
  migrations: [],
  repositories: {},
  tableColumns: [
    { key: 'selection', label: '', sortable: false, filterable: false, flex: 0, fixedWidth: 48 },
    { key: 'name', label: 'Song Name', sortable: true, filterable: true, flex: 3 },
  ],
  searchFields: ['name'],
  filterFields: [],
  createForm: (() => null) as React.FC<{ onSave: (item: unknown) => void; onCancel: () => void }>,
  editForm: (() => null) as React.FC<{ item: unknown; onSave: (item: unknown) => void; onCancel: () => void }>,
  detailView: (() => null) as React.FC<{ item: unknown; onClose: () => void }>,
  duplicateDetector: async () => [],
};

const mockStoreState = {
  searchText: '',
  columnFilters: {},
  sortKey: null,
  sortDirection: 'desc',
  setSearchText: jest.fn(),
  clearAllFilters: jest.fn(),
  toggleColumnFilter: jest.fn(),
  clearColumnFilter: jest.fn(),
  setSort: jest.fn(),
  clearSort: jest.fn(),
};

jest.mock('../useSearchFilterStore.js', () => ({
  useSearchFilterStore: Object.assign(
    jest.fn((selector: any) => selector ? selector(mockStoreState) : mockStoreState),
    { getState: jest.fn(() => mockStoreState) }
  ),
  useSearchText: () => '',
  useColumnFilters: () => ({}),
  useActiveSort: () => ({ sortKey: null, sortDirection: null }),
}));

jest.mock('../../categories/songs/store/useSongsStore.js', () => ({
  useFilteredSongs: () => ({ data: [], isLoading: false, error: null }),
  useLanguages: () => ({ data: [], isLoading: false, error: null }),
}));

jest.mock('../../ServiceProviderContext.js', () => ({
  useServiceProvider: () => ({ db: {} }),
}));

jest.mock('../TableView.js', () => ({
  TableView: (props: any) => <div data-testid="table-view">TableView</div>,
}));

jest.mock('../TileView.js', () => ({
  TileView: (props: any) => <div data-testid="tile-view">TileView</div>,
}));

jest.mock('../../categories/songs/components/SongCreateDialog.js', () => ({
  SongCreateDialog: (props: any) => props.open ? <div data-testid="create-dialog">CreateDialog</div> : null,
}));

jest.mock('../../categories/songs/components/SongEditDialog.js', () => ({
  SongEditDialog: (props: any) => props.open ? <div data-testid="edit-dialog">EditDialog</div> : null,
}));

jest.mock('../../categories/songs/components/SongDetailDialog.js', () => ({
  SongDetailDialog: (props: any) => props.open ? <div data-testid="detail-dialog">DetailDialog</div> : null,
}));

jest.mock('../SearchBar.js', () => ({
  SearchBar: (props: any) => <input data-testid="search-bar" placeholder={props.placeholder} />,
}));

jest.mock('../FilterBar.js', () => ({
  FilterBar: (props: any) => <div data-testid="filter-bar">FilterBar</div>,
}));

describe('CategoryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('CS-01: renders search bar with category placeholder', () => {
    render(<CategoryScreen category={mockCategory} />);
    expect(screen.getByTestId('search-bar')).toHaveAttribute('placeholder', 'Search songs...');
  });

  it('CS-02: renders "New Song" button', () => {
    render(<CategoryScreen category={mockCategory} />);
    expect(screen.getByText('New Song')).toBeInTheDocument();
  });

  it('CS-03: default view is table view', () => {
    render(<CategoryScreen category={mockCategory} />);
    expect(screen.getByTestId('table-view')).toBeInTheDocument();
    expect(screen.queryByTestId('tile-view')).not.toBeInTheDocument();
  });

  it('CS-04: view toggle switches to tile view', () => {
    render(<CategoryScreen category={mockCategory} />);
    fireEvent.click(screen.getByLabelText('Switch to tile view'));
    expect(screen.getByTestId('tile-view')).toBeInTheDocument();
    expect(screen.queryByTestId('table-view')).not.toBeInTheDocument();
  });

  it('CS-05: view toggle switches back to table view', () => {
    render(<CategoryScreen category={mockCategory} />);
    fireEvent.click(screen.getByLabelText('Switch to tile view'));
    expect(screen.getByTestId('tile-view')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Switch to table view'));
    expect(screen.getByTestId('table-view')).toBeInTheDocument();
    expect(screen.queryByTestId('tile-view')).not.toBeInTheDocument();
  });

  it('CS-06: create button opens create dialog', () => {
    render(<CategoryScreen category={mockCategory} />);
    fireEvent.click(screen.getByText('New Song'));
    expect(screen.getByTestId('create-dialog')).toBeInTheDocument();
  });
});
