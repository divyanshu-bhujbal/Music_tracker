import { create } from 'zustand';
import type { CategoryDefinition } from '../../domain/interfaces/CategoryDefinition.js';
import { CategoryRegistry } from './CategoryRegistry.js';

/**
 * Zustand store for tracking the currently-selected category.
 * Module-level singleton — not a React context.
 */
interface CategoryStore {
  /** ID of the currently-selected category, or null if none selected */
  activeCategoryId: string | null;
  /** Set the active category by ID */
  setActiveCategory: (id: string) => void;
}

export const useActiveCategoryStore = create<CategoryStore>((set) => ({
  activeCategoryId: null,
  setActiveCategory: (id: string) => set({ activeCategoryId: id }),
}));

/**
 * Hook that returns the `CategoryDefinition` for the currently-selected category,
 * or `undefined` if none is selected or the active ID doesn't match a registered category.
 *
 * Re-renders when the active category changes via Zustand reactivity.
 */
export function useActiveCategory(): CategoryDefinition | undefined {
  const activeCategoryId = useActiveCategoryStore(
    (state) => state.activeCategoryId,
  );

  if (activeCategoryId === null) {
    return undefined;
  }

  return CategoryRegistry.get(activeCategoryId);
}
