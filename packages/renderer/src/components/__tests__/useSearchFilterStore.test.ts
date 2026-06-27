import { renderHook, act } from '@testing-library/react';
import { useSearchFilterStore } from '../useSearchFilterStore.js';

// Reset store state before each test
beforeEach(() => {
  useSearchFilterStore.setState({
    searchText: '',
    columnFilters: {},
    sortKey: null,
    sortDirection: 'desc',
  });
});

describe('useSearchFilterStore', () => {
  // ST-01: Initial state has empty searchText
  it('ST-01: initial state has empty searchText', () => {
    const { result } = renderHook(() => useSearchFilterStore());
    expect(result.current.searchText).toBe('');
  });

  // ST-02: Initial state has empty columnFilters
  it('ST-02: initial state has empty columnFilters', () => {
    const { result } = renderHook(() => useSearchFilterStore());
    expect(result.current.columnFilters).toEqual({});
  });

  // ST-03: Initial state has null sortKey
  it('ST-03: initial state has null sortKey', () => {
    const { result } = renderHook(() => useSearchFilterStore());
    expect(result.current.sortKey).toBeNull();
  });

  // ST-04: setSearchText() updates state
  it('ST-04: setSearchText updates state', () => {
    const { result } = renderHook(() => useSearchFilterStore());

    act(() => {
      result.current.setSearchText('hello');
    });

    expect(result.current.searchText).toBe('hello');
  });

  // ST-05: toggleColumnFilter() adds value when not present
  it('ST-05: toggleColumnFilter adds value when not present', () => {
    const { result } = renderHook(() => useSearchFilterStore());

    act(() => {
      result.current.toggleColumnFilter('lang', 'en');
    });

    expect(result.current.columnFilters).toEqual({ lang: ['en'] });
  });

  // ST-06: toggleColumnFilter() removes value when present
  it('ST-06: toggleColumnFilter removes value when present', () => {
    const { result } = renderHook(() => useSearchFilterStore());

    act(() => {
      result.current.toggleColumnFilter('lang', 'en');
    });
    expect(result.current.columnFilters).toEqual({ lang: ['en'] });

    act(() => {
      result.current.toggleColumnFilter('lang', 'en');
    });
    // Empty array should remove the key entirely
    expect(result.current.columnFilters).toEqual({});
  });

  // ST-07: setColumnFilters() replaces all values for a column
  it('ST-07: setColumnFilters replaces all values for a column', () => {
    const { result } = renderHook(() => useSearchFilterStore());

    act(() => {
      result.current.toggleColumnFilter('lang', 'en');
    });
    act(() => {
      result.current.toggleColumnFilter('lang', 'ja');
    });

    act(() => {
      result.current.setColumnFilters('lang', ['fr', 'de']);
    });

    expect(result.current.columnFilters).toEqual({ lang: ['fr', 'de'] });
  });

  // ST-08: clearColumnFilter() removes entire column entry
  it('ST-08: clearColumnFilter removes entire column entry', () => {
    const { result } = renderHook(() => useSearchFilterStore());

    act(() => {
      result.current.toggleColumnFilter('lang', 'en');
    });
    act(() => {
      result.current.toggleColumnFilter('album', 'test');
    });

    act(() => {
      result.current.clearColumnFilter('lang');
    });

    expect(result.current.columnFilters).toEqual({ album: ['test'] });
  });

  // ST-09: clearAllFilters() resets searchText and columnFilters
  it('ST-09: clearAllFilters resets searchText and columnFilters', () => {
    const { result } = renderHook(() => useSearchFilterStore());

    act(() => {
      result.current.setSearchText('hello');
    });
    act(() => {
      result.current.toggleColumnFilter('lang', 'en');
    });

    act(() => {
      result.current.clearAllFilters();
    });

    expect(result.current.searchText).toBe('');
    expect(result.current.columnFilters).toEqual({});
  });

  // ST-10: setSort() updates sortKey and sortDirection
  it('ST-10: setSort updates sortKey and sortDirection', () => {
    const { result } = renderHook(() => useSearchFilterStore());

    act(() => {
      result.current.setSort('name', 'asc');
    });

    expect(result.current.sortKey).toBe('name');
    expect(result.current.sortDirection).toBe('asc');
  });

  // ST-11: clearSort() resets to default
  it('ST-11: clearSort resets to default', () => {
    const { result } = renderHook(() => useSearchFilterStore());

    act(() => {
      result.current.setSort('name', 'asc');
    });
    act(() => {
      result.current.clearSort();
    });

    expect(result.current.sortKey).toBeNull();
    expect(result.current.sortDirection).toBe('desc');
  });

  // ST-12: Multiple component subscriptions re-render correctly
  it('ST-12: multiple component subscriptions re-render correctly', () => {
    const { result: result1 } = renderHook(() => useSearchFilterStore());
    const { result: result2 } = renderHook(() => useSearchFilterStore());

    act(() => {
      result1.current.setSearchText('test');
    });

    // Both hooks should see the updated state
    expect(result1.current.searchText).toBe('test');
    expect(result2.current.searchText).toBe('test');
  });

  // Additional: toggleColumnFilter with multiple values
  it('toggleColumnFilter accumulates values', () => {
    const { result } = renderHook(() => useSearchFilterStore());

    act(() => {
      result.current.toggleColumnFilter('lang', 'en');
    });
    act(() => {
      result.current.toggleColumnFilter('lang', 'ja');
    });

    expect(result.current.columnFilters).toEqual({ lang: ['en', 'ja'] });
  });

  // Additional: setColumnFilters with empty array removes key
  it('setColumnFilters with empty array removes key', () => {
    const { result } = renderHook(() => useSearchFilterStore());

    act(() => {
      result.current.toggleColumnFilter('lang', 'en');
    });
    act(() => {
      result.current.setColumnFilters('lang', []);
    });

    expect(result.current.columnFilters).toEqual({});
  });
});
