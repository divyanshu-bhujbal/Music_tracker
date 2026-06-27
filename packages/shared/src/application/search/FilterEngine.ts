import type {
  CategoryDefinition,
  FilterDefinition,
} from '../../domain/interfaces/CategoryDefinition.js';

/**
 * Result of building a SQL WHERE clause fragment.
 */
export interface FilterResult {
  /** SQL WHERE fragment without the leading WHERE keyword. Empty string when no filters apply. */
  whereClause: string;
  /** Parameterized values matching ? placeholders in order. */
  params: unknown[];
  /** JOIN clauses required by the column references in the whereClause. */
  joins: string[];
}

/**
 * Pure-function engine that builds parameterized SQL WHERE clauses
 * from global search text and per-column filter selections.
 *
 * Stateless, synchronous, never throws. Invalid or empty inputs
 * produce neutral results (empty clause, empty params).
 */
export class FilterEngine {
  /**
   * Build a SQL WHERE clause fragment from search text and column filters.
   *
   * @param category - Provides searchFields and filterFields metadata
   * @param searchText - Raw search bar input. Empty string = no search.
   * @param columnFilters - Map of filter key → selected values. Missing keys or empty arrays = no filter.
   * @returns FilterResult with whereClause (no leading WHERE) and params array
   */
  static buildFilter(
    category: Pick<CategoryDefinition, 'searchFields' | 'filterFields'>,
    searchText: string,
    columnFilters: Record<string, string[]>,
  ): FilterResult {
    const parts: string[] = [];
    const params: unknown[] = [];
    const joins: string[] = [];

    // ── Global search ──────────────────────────────────────────────────
    const trimmed = (searchText ?? '').trim();
    if (trimmed.length > 0 && category.searchFields.length > 0) {
      const likeParts: string[] = [];
      for (const field of category.searchFields) {
        likeParts.push(`s.${field} LIKE '%' || ? || '%'`);
        params.push(trimmed);
      }
      parts.push(`(${likeParts.join(' OR ')})`);
    }

    // ── Column filters ─────────────────────────────────────────────────
    if (category.filterFields && columnFilters) {
      for (const filterDef of category.filterFields) {
        const values = columnFilters[filterDef.key];
        if (!values || values.length === 0) continue;

        const resolved = resolveSqlColumn(filterDef);
        if (!resolved) continue;

        const [sqlCol, joinClause] = resolved;
        if (joinClause) {
          joins.push(joinClause);
        }

        const placeholders = values.map(() => '?').join(', ');
        parts.push(`${sqlCol} IN (${placeholders})`);
        params.push(...values);
      }
    }

    if (parts.length === 0) {
      return { whereClause: '', params: [], joins: [] };
    }

    return {
      whereClause: parts.join(' AND '),
      params,
      joins,
    };
  }
}

/**
 * Resolve the SQL column reference and required JOIN clause for a filter definition.
 *
 * Returns a tuple of [sqlColumnReference, joinClause] or null if unresolvable.
 * Join clauses use LEFT JOIN to avoid dropping rows that don't have related records.
 */
function resolveSqlColumn(filterDef: FilterDefinition): [string, string] | null {
  const { key, sourceField } = filterDef;

  if (!key || !sourceField) return null;

  // Direct column on songs table: key matches sourceField (e.g. name→name, album_name→album_name)
  if (key === sourceField) {
    return [`s.${key}`, ''];
  }

  // Foreign key: key ends with _id (e.g. language_id → l.name)
  if (key.endsWith('_id')) {
    const tableName = key.slice(0, -3); // "language_id" → "language"
    const alias = tableName.charAt(0);   // "language" → "l"
    return [
      `${alias}.${sourceField}`,
      `LEFT JOIN ${tableName}s ${alias} ON s.${key} = ${alias}.id`,
    ];
  }

  // Joined column: key is entity name (e.g. artists → a.display_name)
  const alias = key.charAt(0);
  return [
    `${alias}.${sourceField}`,
    `LEFT JOIN ${key} ${alias} ON s.id = song_artists.song_id LEFT JOIN song_artists ON ${alias}.id = song_artists.artist_id`,
  ];
}
