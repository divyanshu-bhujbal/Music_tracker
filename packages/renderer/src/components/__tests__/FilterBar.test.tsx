import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterBar } from '../FilterBar.js';

const defaultProps = {
  columnFilters: {} as Record<string, string[]>,
  columnLabels: {
    language_id: 'Language',
    album_name: 'Album',
    artists: 'Artist(s)',
  },
  onRemoveFilter: jest.fn(),
  onRemoveColumn: jest.fn(),
  onClearAll: jest.fn(),
};

function renderFilterBar(overrides: Record<string, unknown> = {}) {
  return render(<FilterBar {...defaultProps} {...overrides} />);
}

describe('FilterBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // FB-01: Renders when columnFilters has entries
  it('FB-01: renders when columnFilters has entries', () => {
    renderFilterBar({
      columnFilters: { language_id: ['English'] },
    });
    expect(screen.getByText(/Filters/)).toBeInTheDocument();
  });

  // FB-02: Hidden when columnFilters is empty
  it('FB-02: hidden when columnFilters is empty', () => {
    const { container } = renderFilterBar({
      columnFilters: {},
    });
    expect(container.innerHTML).toBe('');
  });

  // FB-03: Each filter value shown as Chip
  it('FB-03: each filter value shown as Chip', () => {
    renderFilterBar({
      columnFilters: { language_id: ['English', 'Japanese'] },
    });
    expect(screen.getByText('Language: English')).toBeInTheDocument();
    expect(screen.getByText('Language: Japanese')).toBeInTheDocument();
  });

  // FB-04: Chip delete calls onRemoveFilter
  it('FB-04: chip delete calls onRemoveFilter', async () => {
    const onRemoveFilter = jest.fn();
    const user = userEvent.setup();
    renderFilterBar({
      columnFilters: { language_id: ['English'] },
      onRemoveFilter,
    });

    // Find the chip and its delete button
    // MUI Chip uses a button with class MuiChip-deleteIcon
    const chip = screen.getByText('Language: English').closest('.MuiChip-root')!;
    const deleteButton = chip.querySelector('.MuiChip-deleteIcon') as HTMLElement;
    await user.click(deleteButton);

    expect(onRemoveFilter).toHaveBeenCalledWith('language_id', 'English');
  });

  // FB-05: On chip delete, chip removed from display
  it('FB-05: on chip delete, chip removed from display', async () => {
    const onRemoveFilter = jest.fn();
    const { rerender } = renderFilterBar({
      columnFilters: { language_id: ['English', 'Japanese'] },
      onRemoveFilter,
    });

    // Simulate removing English
    rerender(
      <FilterBar
        {...defaultProps}
        columnFilters={{ language_id: ['Japanese'] }}
        onRemoveFilter={onRemoveFilter}
      />,
    );

    expect(screen.queryByText('Language: English')).not.toBeInTheDocument();
    expect(screen.getByText('Language: Japanese')).toBeInTheDocument();
  });

  // FB-06: "Clear All" button visible
  it('FB-06: Clear All button visible', () => {
    renderFilterBar({
      columnFilters: { language_id: ['English'] },
    });
    expect(screen.getByText('Clear All')).toBeInTheDocument();
  });

  // FB-07: "Clear All" click calls onClearAll
  it('FB-07: Clear All click calls onClearAll', async () => {
    const onClearAll = jest.fn();
    const user = userEvent.setup();
    renderFilterBar({
      columnFilters: { language_id: ['English'] },
      onClearAll,
    });

    await user.click(screen.getByText('Clear All'));

    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  // FB-08: Multiple values for same column shown as multiple chips
  it('FB-08: multiple values for same column shown as multiple chips', () => {
    renderFilterBar({
      columnFilters: { language_id: ['English', 'Japanese', 'Spanish'] },
    });
    expect(screen.getByText('Language: English')).toBeInTheDocument();
    expect(screen.getByText('Language: Japanese')).toBeInTheDocument();
    expect(screen.getByText('Language: Spanish')).toBeInTheDocument();
  });

  // FB-09: Multiple columns shown with separators or grouping
  it('FB-09: multiple columns shown with visual distinction', () => {
    renderFilterBar({
      columnFilters: {
        language_id: ['English'],
        album_name: ['Abbey Road'],
      },
    });
    expect(screen.getByText('Language: English')).toBeInTheDocument();
    expect(screen.getByText('Album: Abbey Road')).toBeInTheDocument();
    // Filter count text should reflect total chips
    expect(screen.getByText('Filters (2):')).toBeInTheDocument();
  });

  // FB-10: Clear column button shown when multiple values for a column
  it('FB-10: clear column button shown for multi-value columns', () => {
    renderFilterBar({
      columnFilters: { language_id: ['English', 'Japanese'] },
    });
    expect(screen.getByText('Clear Language')).toBeInTheDocument();
  });
});
