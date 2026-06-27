import { create } from 'zustand';

/**
 * Zustand store for search, filter, and sort state.
 * Module-level singleton — no props, no context.
 *
 * Consumed by SearchBar, ColumnFilterPopover, FilterBar,
 * and E15 CategoryScreen (reads searchText, columnFilters,
 * sortKey, sortDirection to pass to useFilteredSongs()).
 */
export interface SearchFilterState {
  searchText: string;
  columnFilters: Record<string, string[]>;
  sortKey: string | null;
  sortDirection: 'asc' | 'desc';

  // Actions
  setSearchText: (text: string) => void;
  toggleColumnFilter: (key: string, value: string) => void;
  setColumnFilters: (key: string, values: string[]) => void;
  clearColumnFilter: (key: string) => void;
  clearAllFilters: () => void;
  setSort: (key: string | null, direction: 'asc' | 'desc') => void;
  clearSort: () => void;
}

export const useSearchFilterStore = create<SearchFilterState>((set) => ({
  searchText: '',
  columnFilters: {},
  sortKey: null,
  sortDirection: 'desc',

  setSearchText: (text: string) => set({ searchText: text }),

  toggleColumnFilter: (key: string, value: string) =>
    set((state) => {
      const current = state.columnFilters[key] ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      const columnFilters = { ...state.columnFilters };
      if (next.length === 0) {
        delete columnFilters[key];
      } else {
        columnFilters[key] = next;
      }
      return { columnFilters };
    }),

  setColumnFilters: (key: string, values: string[]) =>
    set((state) => {
      const columnFilters = { ...state.columnFilters };
      if (values.length === 0) {
        delete columnFilters[key];
      } else {
        columnFilters[key] = values;
      }
      return { columnFilters };
    }),

  clearColumnFilter: (key: string) =>
    set((state) => {
      const columnFilters = { ...state.columnFilters };
      delete columnFilters[key];
      return { columnFilters };
    }),

  clearAllFilters: () => set({ searchText: '', columnFilters: {} }),

  setSort: (key: string | null, direction: 'asc' | 'desc') =>
    set({ sortKey: key, sortDirection: direction }),

  clearSort: () => set({ sortKey: null, sortDirection: 'desc' }),
}));

/** Selector: current search text only */
export function useSearchText() {
  return useSearchFilterStore((s) => s.searchText);
}

/** Selector: column filters only */
export function useColumnFilters() {
  return useSearchFilterStore((s) => s.columnFilters);
}

/** Selector: sort state only */
export function useActiveSort() {
  return useSearchFilterStore((s) => ({ sortKey: s.sortKey, sortDirection: s.sortDirection }));
}
