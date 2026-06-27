import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchBar } from '../SearchBar.js';

describe('SearchBar', () => {
  // SB-01: Renders TextField with placeholder
  it('SB-01: renders TextField with placeholder', () => {
    render(<SearchBar value="" onChange={jest.fn()} />);
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
  });

  // SB-02: Typing calls onChange
  it('SB-02: typing calls onChange', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(<SearchBar value="" onChange={onChange} />);

    const input = screen.getByRole('searchbox');
    await user.type(input, 'hello');

    expect(onChange).toHaveBeenCalled();
    // onChange is called once per keystroke (5 times for "hello")
    expect(onChange).toHaveBeenCalledTimes(5);
  });

  // SB-03: Empty value shows search icon
  it('SB-03: empty value shows search icon', () => {
    render(<SearchBar value="" onChange={jest.fn()} />);
    expect(screen.getByTestId('SearchIcon')).toBeInTheDocument();
  });

  // SB-04: Non-empty value shows clear button
  it('SB-04: non-empty value shows clear button', () => {
    render(<SearchBar value="test" onChange={jest.fn()} />);
    expect(screen.getByLabelText('clear search')).toBeInTheDocument();
  });

  // SB-05: Clicking clear button calls onChange("")
  it('SB-05: clicking clear button calls onChange with empty string', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(<SearchBar value="test" onChange={onChange} />);

    await user.click(screen.getByLabelText('clear search'));

    expect(onChange).toHaveBeenCalledWith('');
  });

  // SB-06: Disabled TextField when disabled prop true
  it('SB-06: disabled TextField when disabled prop true', () => {
    render(<SearchBar value="" onChange={jest.fn()} disabled />);
    expect(screen.getByRole('searchbox')).toBeDisabled();
  });

  // SB-07: Controlled value reflects prop change
  it('SB-07: controlled value reflects prop change', () => {
    const { rerender } = render(<SearchBar value="initial" onChange={jest.fn()} />);
    expect(screen.getByRole('searchbox')).toHaveValue('initial');

    rerender(<SearchBar value="updated" onChange={jest.fn()} />);
    expect(screen.getByRole('searchbox')).toHaveValue('updated');
  });
});
