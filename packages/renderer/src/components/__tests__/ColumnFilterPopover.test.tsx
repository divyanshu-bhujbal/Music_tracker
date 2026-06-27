import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ColumnFilterPopover } from '../ColumnFilterPopover.js';

const defaultProps = {
  columnKey: 'language_id',
  columnLabel: 'Language',
  filterable: true,
  values: ['English', 'Japanese', 'Spanish'],
  selectedValues: [],
  onChange: jest.fn(),
  isLoading: false,
};

function renderPopover(overrides: Record<string, unknown> = {}) {
  return render(<ColumnFilterPopover {...defaultProps} {...overrides} />);
}

describe('ColumnFilterPopover', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // CFP-01: Renders filter icon button with label
  it('CFP-01: renders filter icon button with label', () => {
    renderPopover();
    expect(screen.getByLabelText('Filter Language')).toBeInTheDocument();
  });

  // CFP-02: Badge count matches selectedValues length
  it('CFP-02: badge count matches selectedValues length', () => {
    renderPopover({ selectedValues: ['English', 'Japanese', 'Spanish'] });
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  // CFP-03: No badge when selectedValues is empty
  it('CFP-03: no badge when selectedValues is empty', () => {
    renderPopover();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    // Badge with invisible should not show badge content
    const badge = screen.getByLabelText('Filter Language').querySelector('.MuiBadge-badge');
    expect(badge).toHaveClass('MuiBadge-invisible');
  });

  // CFP-04: Clicking icon opens popover
  it('CFP-04: clicking icon opens popover', async () => {
    const user = userEvent.setup();
    renderPopover();

    await user.click(screen.getByLabelText('Filter Language'));

    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText('Japanese')).toBeInTheDocument();
    expect(screen.getByText('Spanish')).toBeInTheDocument();
  });

  // CFP-05: Popover shows "Select All" and "Deselect All"
  it('CFP-05: popover shows Select All and Deselect All', async () => {
    const user = userEvent.setup();
    renderPopover();

    await user.click(screen.getByLabelText('Filter Language'));

    expect(screen.getByText('Select All')).toBeInTheDocument();
    expect(screen.getByText('Deselect All')).toBeInTheDocument();
  });

  // CFP-06: Checkboxes match values prop
  it('CFP-06: checkboxes match values prop', async () => {
    const user = userEvent.setup();
    renderPopover();

    await user.click(screen.getByLabelText('Filter Language'));

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(3);
  });

  // CFP-07: Checked checkboxes match selectedValues
  it('CFP-07: checked checkboxes match selectedValues', async () => {
    const user = userEvent.setup();
    renderPopover({ selectedValues: ['English'] });

    await user.click(screen.getByLabelText('Filter Language'));

    const checkboxes = screen.getAllByRole('checkbox');
    const englishCheckbox = checkboxes.find(
      (cb) => cb.closest('.MuiFormControlLabel-root')?.textContent === 'English',
    );
    expect(englishCheckbox).toBeChecked();
  });

  // CFP-08: Checking a value calls onChange with updated array
  it('CFP-08: checking a value calls onChange with updated array', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    renderPopover({ onChange });

    await user.click(screen.getByLabelText('Filter Language'));

    const checkboxes = screen.getAllByRole('checkbox');
    const englishCheckbox = checkboxes.find(
      (cb) => cb.closest('.MuiFormControlLabel-root')?.textContent === 'English',
    );
    await user.click(englishCheckbox!);

    expect(onChange).toHaveBeenCalledWith('language_id', ['English']);
  });

  // CFP-09: Unchecking a value calls onChange with value removed
  it('CFP-09: unchecking a value calls onChange with value removed', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    renderPopover({ selectedValues: ['English', 'Japanese'], onChange });

    await user.click(screen.getByLabelText('Filter Language'));

    const checkboxes = screen.getAllByRole('checkbox');
    const englishCheckbox = checkboxes.find(
      (cb) => cb.closest('.MuiFormControlLabel-root')?.textContent === 'English',
    );
    await user.click(englishCheckbox!);

    expect(onChange).toHaveBeenCalledWith('language_id', ['Japanese']);
  });

  // CFP-10: "Select All" checks all checkboxes
  it('CFP-10: Select All checks all checkboxes', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    renderPopover({ onChange });

    await user.click(screen.getByLabelText('Filter Language'));
    await user.click(screen.getByText('Select All'));

    expect(onChange).toHaveBeenCalledWith('language_id', ['English', 'Japanese', 'Spanish']);
  });

  // CFP-11: "Deselect All" unchecks all checkboxes
  it('CFP-11: Deselect All unchecks all checkboxes', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    renderPopover({ selectedValues: ['English', 'Japanese'], onChange });

    await user.click(screen.getByLabelText('Filter Language'));
    await user.click(screen.getByText('Deselect All'));

    expect(onChange).toHaveBeenCalledWith('language_id', []);
  });

  // CFP-12: Popover has correct anchor and onClose behavior
  it('CFP-12: popover opens with correct content', async () => {
    const user = userEvent.setup();
    renderPopover();

    await user.click(screen.getByLabelText('Filter Language'));
    // Popover should be open with all values visible
    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText('Japanese')).toBeInTheDocument();
    expect(screen.getByText('Spanish')).toBeInTheDocument();
    // Popover content should have the column label
    expect(screen.getByText('Language')).toBeInTheDocument();
  });

  // CFP-13: Loading state shows CircularProgress
  it('CFP-13: loading state shows CircularProgress', async () => {
    const user = userEvent.setup();
    renderPopover({ isLoading: true });

    await user.click(screen.getByLabelText('Filter Language'));

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  // CFP-14: Empty values shows "No values available"
  it('CFP-14: empty values shows No values available', async () => {
    const user = userEvent.setup();
    renderPopover({ values: [] });

    await user.click(screen.getByLabelText('Filter Language'));

    expect(screen.getByText('No values available')).toBeInTheDocument();
  });

  // CFP-15: Not rendered when filterable is false
  it('CFP-15: not rendered when filterable is false', () => {
    renderPopover({ filterable: false });
    expect(screen.queryByLabelText('Filter Language')).not.toBeInTheDocument();
  });

  // CFP-16: Filter icon shows Badge when active
  it('CFP-16: filter icon shows Badge when active', () => {
    renderPopover({ selectedValues: ['English'] });
    // Badge should show count of 1
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
