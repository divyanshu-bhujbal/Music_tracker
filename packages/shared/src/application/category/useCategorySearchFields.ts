import { useMemo } from 'react';
import { useActiveCategory } from './useActiveCategory.js';

/**
 * Hook that returns the `searchFields` string array for the currently-active category,
 * or `[]` if no category is active.
 *
 * Convenience hook that delegates to `useActiveCategory()` and extracts `.searchFields`.
 */
export function useCategorySearchFields(): string[] {
  const activeCategory = useActiveCategory();

  return useMemo(
    () => activeCategory?.searchFields ?? [],
    [activeCategory],
  );
}
