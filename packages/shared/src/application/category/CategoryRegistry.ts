import type { CategoryDefinition } from '../../domain/interfaces/CategoryDefinition.js';

/**
 * Singleton registry for all category definitions registered at app startup.
 *
 * The registry is an in-memory Map<string, CategoryDefinition>. It does NOT
 * read from the database — the `categories` table is a separate concern
 * (reference table for sync). The registry is a compile-time/startup
 * registration map that represents which categories are compiled into
 * the current app version.
 *
 * Categories are registered once at startup (before the UI renders).
 * There is no unregister or clear — registration is monotonic.
 */
const registry = new Map<string, CategoryDefinition>();

export const CategoryRegistry = {
  /**
   * Register a category definition. Throws if an ID is already registered.
   *
   * @throws {Error} If a category with the same ID is already registered.
   */
  register(definition: CategoryDefinition): void {
    if (registry.has(definition.id)) {
      throw new Error(`Category '${definition.id}' is already registered.`);
    }
    registry.set(definition.id, definition);
  },

  /**
   * Retrieve a category definition by ID.
   *
   * @returns The registered definition, or `undefined` if not found.
   */
  get(id: string): CategoryDefinition | undefined {
    return registry.get(id);
  },

  /**
   * Return all registered category definitions (shallow copy).
   */
  getAll(): CategoryDefinition[] {
    return Array.from(registry.values());
  },

  /**
   * Check if a category with the given ID is registered.
   */
  has(id: string): boolean {
    return registry.has(id);
  },

  /**
   * Clear all registered categories. For testing only.
   * @internal
   */
  _clearForTesting(): void {
    registry.clear();
  },
};
