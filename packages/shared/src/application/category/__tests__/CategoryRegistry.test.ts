import { CategoryRegistry } from '../CategoryRegistry.js';
import type { CategoryDefinition } from '../../../domain/interfaces/CategoryDefinition.js';

function mockCategoryDefinition(
  overrides?: Partial<CategoryDefinition>,
): CategoryDefinition {
  return {
    id: 'test-category',
    displayName: 'Test Category',
    iconName: 'test-icon',
    migrations: [],
    repositories: {},
    tableColumns: [],
    searchFields: [],
    filterFields: [],
    createForm: () => null,
    editForm: () => null,
    detailView: () => null,
    duplicateDetector: async () => [],
    ...overrides,
  };
}

describe('CategoryRegistry', () => {
  beforeEach(() => {
    CategoryRegistry._clearForTesting();
  });

  it('REG-01: getAll() on fresh registry returns empty array', () => {
    expect(CategoryRegistry.getAll()).toEqual([]);
  });

  it('REG-02: has("songs") on fresh registry returns false', () => {
    expect(CategoryRegistry.has('songs')).toBe(false);
  });

  it('REG-03: get("songs") on fresh registry returns undefined', () => {
    expect(CategoryRegistry.get('songs')).toBeUndefined();
  });

  it('REG-04: register then getAll() returns array containing the definition', () => {
    const def = mockCategoryDefinition({ id: 'songs' });
    CategoryRegistry.register(def);
    const result = CategoryRegistry.getAll();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('songs');
  });

  it('REG-05: register then has(id) returns true', () => {
    CategoryRegistry.register(mockCategoryDefinition({ id: 'songs' }));
    expect(CategoryRegistry.has('songs')).toBe(true);
  });

  it('REG-06: register then get(id) returns the exact same object reference', () => {
    const def = mockCategoryDefinition({ id: 'songs' });
    CategoryRegistry.register(def);
    expect(CategoryRegistry.get('songs')).toBe(def);
  });

  it('REG-07: register two definitions — getAll returns both, has true for both', () => {
    CategoryRegistry.register(mockCategoryDefinition({ id: 'songs' }));
    CategoryRegistry.register(mockCategoryDefinition({ id: 'books' }));
    expect(CategoryRegistry.getAll()).toHaveLength(2);
    expect(CategoryRegistry.has('songs')).toBe(true);
    expect(CategoryRegistry.has('books')).toBe(true);
  });

  it('REG-08: register duplicate id throws Error containing the id', () => {
    CategoryRegistry.register(mockCategoryDefinition({ id: 'songs' }));
    expect(() =>
      CategoryRegistry.register(mockCategoryDefinition({ id: 'songs' })),
    ).toThrow('already registered');
    expect(() =>
      CategoryRegistry.register(mockCategoryDefinition({ id: 'songs' })),
    ).toThrow('songs');
  });

  it('REG-09: duplicate registration — first registration preserved', () => {
    const first = mockCategoryDefinition({ id: 'songs', displayName: 'First' });
    CategoryRegistry.register(first);
    try {
      CategoryRegistry.register(
        mockCategoryDefinition({ id: 'songs', displayName: 'Second' }),
      );
    } catch {
      // expected
    }
    expect(CategoryRegistry.get('songs')!.displayName).toBe('First');
  });

  it('REG-10: getAll returns a copy — mutating does not affect registry', () => {
    CategoryRegistry.register(mockCategoryDefinition({ id: 'songs' }));
    const all = CategoryRegistry.getAll();
    all.push(mockCategoryDefinition({ id: 'books' }));
    expect(CategoryRegistry.getAll()).toHaveLength(1);
  });

  it('REG-11: register with all optional fields empty is accepted', () => {
    expect(() =>
      CategoryRegistry.register(
        mockCategoryDefinition({
          id: 'empty',
          searchFields: [],
          filterFields: [],
          migrations: [],
          repositories: {},
          tableColumns: [],
        }),
      ),
    ).not.toThrow();
  });
});
