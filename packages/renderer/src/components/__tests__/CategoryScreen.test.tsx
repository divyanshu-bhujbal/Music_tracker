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

// Module-scope mock functions for per-test overrides (AD-T15.11-01)
const mockUseFilteredSongs = jest.fn().mockReturnValue({ data: [], isLoading: false, error: null });
const mockUseLanguages = jest.fn().mockReturnValue({ data: [], isLoading: false, error: null });
const mockUseSelectionCount = jest.fn().mockReturnValue(0);
const mockSetSort = jest.fn();
const mockClearSort = jest.fn();
let mockSortState = { sortKey: null as string | null, sortDirection: null as 'asc' | 'desc' | null };
const mockUseSearchText = jest.fn().mockReturnValue('');
let mockColumnFilters: Record<string, string[]> = {};

const mockStoreState = {
  searchText: '',
  columnFilters: {} as Record<string, string[]>,
  sortKey: null as string | null,
  sortDirection: 'desc' as string,
  setSearchText: jest.fn(),
  clearAllFilters: jest.fn(),
  toggleColumnFilter: jest.fn(),
  clearColumnFilter: jest.fn(),
  setSort: mockSetSort,
  clearSort: mockClearSort,
};

jest.mock('../useSearchFilterStore.js', () => ({
  useSearchFilterStore: Object.assign(
    jest.fn((selector: (state: typeof mockStoreState) => unknown) =>
      selector ? selector(mockStoreState) : mockStoreState,
    ),
    { getState: jest.fn(() => mockStoreState) },
  ),
  useSearchText: () => mockUseSearchText(),
  useColumnFilters: () => mockColumnFilters,
  useActiveSort: () => mockSortState,
}));

jest.mock('../../stores/useSelectionStore.js', () => ({
  useSelectionStore: Object.assign(
    jest.fn((selector: (state: { selectedIds: Set<string>; toggle: () => void; selectAll: () => void; clearAll: () => void; isSelected: () => boolean }) => unknown) =>
      selector ? selector({ selectedIds: new Set(), toggle: jest.fn(), selectAll: jest.fn(), clearAll: jest.fn(), isSelected: jest.fn() }) : { selectedIds: new Set(), toggle: jest.fn(), selectAll: jest.fn(), clearAll: jest.fn(), isSelected: jest.fn() },
    ),
    { getState: jest.fn(() => ({ selectedIds: new Set(), clearAll: jest.fn() })) },
  ),
  useSelectionCount: () => mockUseSelectionCount(),
}));

jest.mock('../../categories/songs/store/useSongsStore.js', () => ({
  useFilteredSongs: (...args: unknown[]) => mockUseFilteredSongs(...args),
  useLanguages: (...args: unknown[]) => mockUseLanguages(...args),
}));

jest.mock('../../ServiceProviderContext.js', () => ({
  useServiceProvider: () => ({ db: {} }),
}));

jest.mock('../TableView.js', () => ({
  TableView: (props: { error?: Error | null; isLoading?: boolean; category?: { tableColumns?: Array<{ key: string; label: string; sortable: boolean }> }; onSort?: (key: string) => void }) => (
    <div data-testid="table-view">
      TableView
      {props.isLoading && <div data-testid="loading-indicator">Loading</div>}
      {props.error && <div>{props.error.message}</div>}
      {props.category?.tableColumns?.map((col) =>
        col.sortable ? (
          <button key={col.key} onClick={() => props.onSort?.(col.key)}>
            {col.label}
          </button>
        ) : null,
      )}
    </div>
  ),
}));

jest.mock('../TileView.js', () => ({
  TileView: (props: { error?: Error | null; isLoading?: boolean }) => (
    <div data-testid="tile-view">
      TileView
      {props.isLoading && <div data-testid="loading-indicator">Loading</div>}
      {props.error && <div>{props.error.message}</div>}
    </div>
  ),
}));

jest.mock('../../categories/songs/components/SongCreateDialog.js', () => ({
  SongCreateDialog: (props: { open?: boolean; onCancel?: () => void }) =>
    props.open ? (
      <div data-testid="create-dialog">
        CreateDialog
        <button onClick={props.onCancel}>Cancel</button>
      </div>
    ) : null,
}));

jest.mock('../../categories/songs/components/SongEditDialog.js', () => ({
  SongEditDialog: (props: { open?: boolean }) => props.open ? <div data-testid="edit-dialog">EditDialog</div> : null,
}));

jest.mock('../../categories/songs/components/SongDetailDialog.js', () => ({
  SongDetailDialog: (props: { open?: boolean }) => props.open ? <div data-testid="detail-dialog">DetailDialog</div> : null,
}));

jest.mock('../SearchBar.js', () => ({
  SearchBar: (props: { placeholder?: string }) => <input data-testid="search-bar" placeholder={props.placeholder} />,
}));

jest.mock('../FilterBar.js', () => ({
  FilterBar: () => <div data-testid="filter-bar">FilterBar</div>,
}));

jest.mock('../SelectionModeBar.js', () => ({
  SelectionModeBar: (props: { selectionCount?: number }) => <div data-testid="selection-mode-bar">{props.selectionCount} selected</div>,
}));

describe('CategoryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFilteredSongs.mockReturnValue({ data: [], isLoading: false, error: null });
    mockUseLanguages.mockReturnValue({ data: [], isLoading: false, error: null });
    mockUseSelectionCount.mockReturnValue(0);
    mockUseSearchText.mockReturnValue('');
    mockSortState = { sortKey: null, sortDirection: null };
    mockColumnFilters = {};
    mockSetSort.mockClear();
    mockClearSort.mockClear();
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

  it('CS-07: error state displays error message', () => {
    mockUseFilteredSongs.mockReturnValue({
      data: [],
      isLoading: false,
      error: new Error('Database connection lost'),
    });
    render(<CategoryScreen category={mockCategory} />);
    expect(screen.getByText('Database connection lost')).toBeInTheDocument();
  });

  it('CS-08: loading state shows loading indicator', () => {
    mockUseFilteredSongs.mockReturnValue({ data: [], isLoading: true, error: null });
    render(<CategoryScreen category={mockCategory} />);
    expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();
  });

  it('CS-09: FilterBar visible when column filters are active', () => {
    mockColumnFilters = { language_id: ['en'] };
    render(<CategoryScreen category={mockCategory} />);
    expect(screen.getByTestId('filter-bar')).toBeInTheDocument();
  });

  it('CS-10: SelectionModeBar visible when selectionCount > 0', () => {
    mockUseSelectionCount.mockReturnValue(3);
    render(<CategoryScreen category={mockCategory} />);
    expect(screen.getByTestId('selection-mode-bar')).toBeInTheDocument();
    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });

  it('CS-11: sort toggle cycles asc -> desc -> none', () => {
    const { rerender } = render(<CategoryScreen category={mockCategory} />);

    // Click 1: no current sort -> setSort('name', 'asc')
    fireEvent.click(screen.getByText('Song Name'));
    expect(mockSetSort).toHaveBeenCalledWith('name', 'asc');
    expect(mockClearSort).not.toHaveBeenCalled();

    mockSetSort.mockClear();
    mockClearSort.mockClear();

    // Simulate sort state update after first click and re-render
    mockSortState = { sortKey: 'name', sortDirection: 'asc' };
    rerender(<CategoryScreen category={mockCategory} />);

    // Click 2: sortKey matches, sortDirection is 'asc' -> setSort('name', 'desc')
    fireEvent.click(screen.getByText('Song Name'));
    expect(mockSetSort).toHaveBeenCalledWith('name', 'desc');
    expect(mockClearSort).not.toHaveBeenCalled();

    mockSetSort.mockClear();
    mockClearSort.mockClear();

    // Simulate sort state update after second click and re-render
    mockSortState = { sortKey: 'name', sortDirection: 'desc' };
    rerender(<CategoryScreen category={mockCategory} />);

    // Click 3: sortKey matches, sortDirection is 'desc' -> clearSort()
    fireEvent.click(screen.getByText('Song Name'));
    expect(mockClearSort).toHaveBeenCalled();
    expect(mockSetSort).not.toHaveBeenCalled();
  });

  it('CS-12: create dialog cancel closes dialog', () => {
    render(<CategoryScreen category={mockCategory} />);
    fireEvent.click(screen.getByText('New Song'));
    expect(screen.getByTestId('create-dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByTestId('create-dialog')).not.toBeInTheDocument();
  });

  it('CS-13: rapid view toggle table -> tile -> table renders correct view', () => {
    render(<CategoryScreen category={mockCategory} />);
    expect(screen.getByTestId('table-view')).toBeInTheDocument();
    expect(screen.queryByTestId('tile-view')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Switch to tile view'));
    expect(screen.getByTestId('tile-view')).toBeInTheDocument();
    expect(screen.queryByTestId('table-view')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Switch to table view'));
    expect(screen.getByTestId('table-view')).toBeInTheDocument();
    expect(screen.queryByTestId('tile-view')).not.toBeInTheDocument();
  });
});
