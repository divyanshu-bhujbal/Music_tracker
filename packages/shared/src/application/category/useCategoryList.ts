import { useMemo } from 'react';
import type { CategoryDefinition } from '../../domain/interfaces/CategoryDefinition.js';
import { CategoryRegistry } from './CategoryRegistry.js';

/**
 * Hook that returns all registered `CategoryDefinition[]`.
 *
 * The list is static after startup in V1 — registration happens once.
 * The hook pattern preserves extensibility for dynamic registration
 * in future versions.
 */
export function useCategoryList(): CategoryDefinition[] {
  return useMemo(() => CategoryRegistry.getAll(), []);
}
