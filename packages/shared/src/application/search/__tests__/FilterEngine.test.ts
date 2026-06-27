import { FilterEngine } from '../FilterEngine.js';
import type { CategoryDefinition } from '../../../domain/interfaces/CategoryDefinition.js';

/**
 * Minimal CategoryDefinition subset used by FilterEngine.
 */
type FilterCategory = Pick<CategoryDefinition, 'searchFields' | 'filterFields'>;

const songsCategory: FilterCategory = {
  searchFields: ['name', 'album_name'],
  filterFields: [
    { key: 'name', label: 'Song Name', sourceField: 'name' },
    { key: 'artists', label: 'Artist(s)', sourceField: 'display_name' },
    { key: 'album_name', label: 'Album', sourceField: 'album_name' },
    { key: 'language_id', label: 'Language', sourceField: 'name' },
  ],
};

describe('FilterEngine', () => {
  // FE-01: Empty search + no filters
  it('FE-01: returns empty clause for empty search and no filters', () => {
    const result = FilterEngine.buildFilter(songsCategory, '', {});
    expect(result).toEqual({ whereClause: '', params: [], joins: [] });
  });

  // FE-02: Search with one search field
  it('FE-02: builds LIKE clause for single search field', () => {
    const category: FilterCategory = {
      searchFields: ['name'],
      filterFields: [],
    };
    const result = FilterEngine.buildFilter(category, 'hello', {});
    expect(result.whereClause).toContain("s.name LIKE '%' || ? || '%'");
    expect(result.params).toEqual(['hello']);
    expect(result.joins).toEqual([]);
  });

  // FE-03: Search with multiple search fields
  it('FE-03: builds OR-clause for multiple search fields', () => {
    const result = FilterEngine.buildFilter(songsCategory, 'hello', {});
    expect(result.whereClause).toContain('s.name LIKE');
    expect(result.whereClause).toContain('s.album_name LIKE');
    expect(result.whereClause).toContain(' OR ');
    expect(result.params).toEqual(['hello', 'hello']);
  });

  // FE-04: Single column filter with one value
  it('FE-04: builds IN clause for single filter value', () => {
    const result = FilterEngine.buildFilter(
      songsCategory,
      '',
      { name: ['English'] },
    );
    expect(result.whereClause).toContain('s.name IN (?)');
    expect(result.params).toEqual(['English']);
  });

  // FE-05: Single column filter with multiple values
  it('FE-05: builds IN clause for multiple filter values', () => {
    const result = FilterEngine.buildFilter(
      songsCategory,
      '',
      { album_name: ['A', 'B'] },
    );
    expect(result.whereClause).toContain('s.album_name IN (?, ?)');
    expect(result.params).toEqual(['A', 'B']);
  });

  // FE-06: Search + one column filter (AND composition)
  it('FE-06: combines search and filter with AND', () => {
    const result = FilterEngine.buildFilter(
      songsCategory,
      'x',
      { name: ['en'] },
    );
    expect(result.whereClause).toContain(' AND ');
    expect(result.whereClause).toContain("s.name LIKE '%' || ? || '%'");
    expect(result.whereClause).toContain('s.name IN (?)');
    // 2 search fields (name, album_name) produce 2 'x' params, then 1 filter param
    expect(result.params).toEqual(['x', 'x', 'en']);
  });

  // FE-07: Two column filters (AND between columns)
  it('FE-07: combines two column filters with AND', () => {
    const result = FilterEngine.buildFilter(
      songsCategory,
      '',
      { name: ['en'], album_name: ['A'] },
    );
    expect(result.whereClause).toContain('s.name IN (?)');
    expect(result.whereClause).toContain(' AND ');
    expect(result.whereClause).toContain('s.album_name IN (?)');
    expect(result.params).toEqual(['en', 'A']);
  });

  // FE-08: All parameters in order
  it('FE-08: params match placeholder order', () => {
    const result = FilterEngine.buildFilter(
      songsCategory,
      'hello',
      { name: ['en', 'ja'], album_name: ['X'] },
    );
    // Search params come first (one per search field), then filter params
    expect(result.params).toEqual(['hello', 'hello', 'en', 'ja', 'X']);
  });

  // FE-09: Empty filter value array ignored
  it('FE-09: ignores empty filter value array', () => {
    const result = FilterEngine.buildFilter(
      songsCategory,
      '',
      { name: [] },
    );
    expect(result).toEqual({ whereClause: '', params: [], joins: [] });
  });

  // FE-10: Unknown column key in filter
  it('FE-10: ignores unknown column keys', () => {
    const result = FilterEngine.buildFilter(
      songsCategory,
      '',
      { nonexistent: ['x'] },
    );
    expect(result).toEqual({ whereClause: '', params: [], joins: [] });
  });

  // FE-11: Search with empty searchFields array
  it('FE-11: returns empty clause when searchFields is empty', () => {
    const category: FilterCategory = {
      searchFields: [],
      filterFields: [],
    };
    const result = FilterEngine.buildFilter(category, 'x', {});
    expect(result).toEqual({ whereClause: '', params: [], joins: [] });
  });

  // FE-12: Search text with special characters
  it('FE-12: passes special characters as parameters safely', () => {
    const result = FilterEngine.buildFilter(
      songsCategory,
      '100% sure (test)',
      {},
    );
    // 2 search fields produce 2 params
    expect(result.params).toEqual(['100% sure (test)', '100% sure (test)']);
    expect(result.whereClause).not.toContain('100%');
  });

  // FE-13: Whitespace-only search text is trimmed
  it('FE-13: treats whitespace-only search as empty', () => {
    const result = FilterEngine.buildFilter(songsCategory, '   ', {});
    expect(result).toEqual({ whereClause: '', params: [], joins: [] });
  });

  // FE-14: Empty filterFields with active columnFilters
  it('FE-14: ignores columnFilters when filterFields is empty', () => {
    const category: FilterCategory = {
      searchFields: ['name'],
      filterFields: [],
    };
    const result = FilterEngine.buildFilter(category, '', { x: ['y'] });
    expect(result).toEqual({ whereClause: '', params: [], joins: [] });
  });

  // FE-15: language_id filter uses subquery-style column reference
  it('FE-15: language_id filter resolves to l.name column with join', () => {
    const result = FilterEngine.buildFilter(
      songsCategory,
      '',
      { language_id: ['English', 'Japanese'] },
    );
    expect(result.whereClause).toContain('l.name IN (?, ?)');
    expect(result.params).toEqual(['English', 'Japanese']);
    expect(result.joins).toContain('LEFT JOIN languages l ON s.language_id = l.id');
  });

  // FE-16: artists filter resolves to a.display_name column with join
  it('FE-16: artists filter resolves to a.display_name column with join', () => {
    const result = FilterEngine.buildFilter(
      songsCategory,
      '',
      { artists: ['Beatles'] },
    );
    expect(result.whereClause).toContain('a.display_name IN (?)');
    expect(result.params).toEqual(['Beatles']);
    expect(result.joins.length).toBeGreaterThan(0);
  });

  // FE-17: null searchText is treated as empty
  it('FE-17: null searchText is treated as empty', () => {
    const result = FilterEngine.buildFilter(songsCategory, null as unknown as string, {});
    expect(result).toEqual({ whereClause: '', params: [], joins: [] });
  });

  // FE-18: undefined columnFilters is treated as empty
  it('FE-18: undefined columnFilters is treated as empty', () => {
    const result = FilterEngine.buildFilter(songsCategory, '', undefined as unknown as Record<string, string[]>);
    expect(result).toEqual({ whereClause: '', params: [], joins: [] });
  });
});
