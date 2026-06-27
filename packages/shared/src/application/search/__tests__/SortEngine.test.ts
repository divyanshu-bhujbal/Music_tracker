import { SortEngine } from '../SortEngine.js';
import type { ColumnDefinition } from '../../../domain/interfaces/CategoryDefinition.js';

const songsColumns: ColumnDefinition[] = [
  { key: 'selection', label: '', sortable: false, filterable: false, flex: 0, fixedWidth: 48 },
  { key: 'name', label: 'Song Name', sortable: true, filterable: true, flex: 3 },
  { key: 'artists', label: 'Artist(s)', sortable: true, filterable: true, flex: 2 },
  { key: 'album_name', label: 'Album', sortable: true, filterable: true, flex: 2 },
  { key: 'language_id', label: 'Language', sortable: true, filterable: true, flex: 1, fixedWidth: 120 },
  { key: 'added_at', label: 'Date Added', sortable: true, filterable: false, flex: 1, fixedWidth: 140 },
];

describe('SortEngine', () => {
  // SE-01: Valid sortable column ascending
  it('SE-01: returns ORDER BY for valid sortable column ascending', () => {
    const result = SortEngine.buildSort('name', 'asc', songsColumns);
    expect(result).toEqual({ orderByClause: 'ORDER BY name ASC' });
  });

  // SE-02: Valid sortable column descending
  it('SE-02: returns ORDER BY for valid sortable column descending', () => {
    const result = SortEngine.buildSort('name', 'desc', songsColumns);
    expect(result).toEqual({ orderByClause: 'ORDER BY name DESC' });
  });

  // SE-03: null columnKey → default
  it('SE-03: returns default sort for null columnKey', () => {
    const result = SortEngine.buildSort(null, 'desc', songsColumns);
    expect(result).toEqual({ orderByClause: 'ORDER BY updated_at DESC' });
  });

  // SE-04: Column not in list → default
  it('SE-04: returns default sort for nonexistent column', () => {
    const result = SortEngine.buildSort('nonexistent', 'asc', songsColumns);
    expect(result).toEqual({ orderByClause: 'ORDER BY updated_at DESC' });
  });

  // SE-05: Column exists but sortable: false → default
  it('SE-05: returns default sort for non-sortable column', () => {
    const result = SortEngine.buildSort('selection', 'asc', songsColumns);
    expect(result).toEqual({ orderByClause: 'ORDER BY updated_at DESC' });
  });

  // SE-06: Invalid direction → default direction
  it('SE-06: returns default direction for invalid direction string', () => {
    const result = SortEngine.buildSort('name', 'sideways' as 'asc' | 'desc', songsColumns);
    expect(result).toEqual({ orderByClause: 'ORDER BY name DESC' });
  });

  // SE-07: Valid column with uppercase direction
  it('SE-07: normalizes uppercase direction to lowercase', () => {
    const result = SortEngine.buildSort('name', 'ASC' as 'asc' | 'desc', songsColumns);
    expect(result).toEqual({ orderByClause: 'ORDER BY name ASC' });
  });

  // SE-08: Empty columns array
  it('SE-08: returns default sort for empty columns array', () => {
    const result = SortEngine.buildSort('name', 'asc', []);
    expect(result).toEqual({ orderByClause: 'ORDER BY updated_at DESC' });
  });

  // SE-09: All sortable columns produce correct clauses
  it('SE-09: produces correct clause for each sortable column', () => {
    const sortableCols = songsColumns.filter((c) => c.sortable);
    for (const col of sortableCols) {
      const asc = SortEngine.buildSort(col.key, 'asc', songsColumns);
      expect(asc.orderByClause).toBe(`ORDER BY ${col.key} ASC`);

      const desc = SortEngine.buildSort(col.key, 'desc', songsColumns);
      expect(desc.orderByClause).toBe(`ORDER BY ${col.key} DESC`);
    }
  });

  // SE-10: added_at column sorts correctly
  it('SE-10: added_at column produces ORDER BY added_at', () => {
    const result = SortEngine.buildSort('added_at', 'asc', songsColumns);
    expect(result).toEqual({ orderByClause: 'ORDER BY added_at ASC' });
  });
});
