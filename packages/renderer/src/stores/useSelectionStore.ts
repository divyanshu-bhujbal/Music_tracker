import { create } from 'zustand';

export interface SelectionState {
  selectedIds: Set<string>;
  toggle: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearAll: () => void;
  isSelected: (id: string) => boolean;
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  selectedIds: new Set<string>(),

  toggle: (id: string) => {
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { selectedIds: next };
    });
  },

  selectAll: (ids: string[]) => {
    set({ selectedIds: new Set(ids) });
  },

  clearAll: () => {
    set({ selectedIds: new Set<string>() });
  },

  isSelected: (id: string) => {
    return get().selectedIds.has(id);
  },
}));

export function useSelectionCount(): number {
  return useSelectionStore((s) => s.selectedIds.size);
}
