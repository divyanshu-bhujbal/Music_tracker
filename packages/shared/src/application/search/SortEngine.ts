import type { ColumnDefinition } from '../../domain/interfaces/CategoryDefinition.js';

/**
 * Result of building a SQL ORDER BY clause fragment.
 */
export interface SortResult {
  /** SQL ORDER BY fragment including the keyword. Always valid. */
  orderByClause: string;
}

const VALID_DIRECTIONS = new Set(['asc', 'desc']);
const DEFAULT_SORT = 'updated_at';
const DEFAULT_DIRECTION = 'DESC';

/**
 * Pure-function engine that builds SQL ORDER BY clauses
 * from a column key and sort direction.
 *
 * Stateless, synchronous, never throws. Invalid inputs
 * produce the default sort (ORDER BY updated_at DESC).
 */
export class SortEngine {
  /**
   * Build a SQL ORDER BY clause from a column key and direction.
   *
   * @param columnKey - Column to sort by, or null for default sort
   * @param direction - Sort direction: 'asc' or 'desc'
   * @param columns - Category's tableColumns array (validates column exists and is sortable)
   * @returns SortResult with orderByClause (always valid SQL)
   */
  static buildSort(
    columnKey: string | null,
    direction: 'asc' | 'desc',
    columns: ColumnDefinition[],
  ): SortResult {
    // Default sort when columnKey is null
    if (columnKey === null) {
      return { orderByClause: `ORDER BY ${DEFAULT_SORT} ${DEFAULT_DIRECTION}` };
    }

    // Normalize direction; default to DESC if invalid
    const dir = VALID_DIRECTIONS.has(direction.toLowerCase())
      ? direction.toUpperCase()
      : DEFAULT_DIRECTION.toUpperCase();

    // Find the column definition
    const col = columns.find((c) => c.key === columnKey);

    // Column not found or not sortable → default sort
    if (!col || !col.sortable) {
      return { orderByClause: `ORDER BY ${DEFAULT_SORT} ${DEFAULT_DIRECTION}` };
    }

    return { orderByClause: `ORDER BY ${columnKey} ${dir}` };
  }
}
