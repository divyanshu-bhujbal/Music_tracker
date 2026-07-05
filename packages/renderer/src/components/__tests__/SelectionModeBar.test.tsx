import { render, screen, fireEvent } from '@testing-library/react';
import { SelectionModeBar } from '../SelectionModeBar.js';

describe('SelectionModeBar', () => {
  it('SB-01: renders selection count text', () => {
    render(<SelectionModeBar selectionCount={5} onClear={jest.fn()} onDeleteSelected={jest.fn()} />);
    expect(screen.getByText('5 selected')).toBeInTheDocument();
  });

  it('SB-02: renders "Clear Selection" button', () => {
    render(<SelectionModeBar selectionCount={1} onClear={jest.fn()} onDeleteSelected={jest.fn()} />);
    expect(screen.getByText('Clear Selection')).toBeInTheDocument();
  });

  it('SB-03: renders "Delete Selected" button', () => {
    render(<SelectionModeBar selectionCount={1} onClear={jest.fn()} onDeleteSelected={jest.fn()} />);
    expect(screen.getByText('Delete Selected')).toBeInTheDocument();
  });

  it('SB-04: clicking "Clear Selection" fires onClear', () => {
    const onClear = jest.fn();
    render(<SelectionModeBar selectionCount={3} onClear={onClear} onDeleteSelected={jest.fn()} />);
    fireEvent.click(screen.getByText('Clear Selection'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('SB-05: clicking "Delete Selected" fires onDeleteSelected', () => {
    const onDeleteSelected = jest.fn();
    render(<SelectionModeBar selectionCount={2} onClear={jest.fn()} onDeleteSelected={onDeleteSelected} />);
    fireEvent.click(screen.getByText('Delete Selected'));
    expect(onDeleteSelected).toHaveBeenCalledTimes(1);
  });

  it('SB-06: bar renders with correct layout', () => {
    render(<SelectionModeBar selectionCount={1} onClear={jest.fn()} onDeleteSelected={jest.fn()} />);
    const bar = screen.getByText('1 selected').closest('[class*="MuiBox-root"]');
    expect(bar).toBeInTheDocument();
    expect(bar).toHaveStyle({ position: 'sticky' });
  });
});
