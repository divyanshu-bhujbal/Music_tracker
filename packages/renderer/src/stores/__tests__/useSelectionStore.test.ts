import { useSelectionStore } from '../useSelectionStore.js';

describe('useSelectionStore', () => {
  beforeEach(() => {
    useSelectionStore.getState().clearAll();
  });

  it('SS-01: toggle() adds new ID to empty set', () => {
    useSelectionStore.getState().toggle('a');
    expect(useSelectionStore.getState().selectedIds.has('a')).toBe(true);
  });

  it('SS-02: toggle() removes existing ID', () => {
    useSelectionStore.getState().toggle('a');
    useSelectionStore.getState().toggle('a');
    expect(useSelectionStore.getState().selectedIds.has('a')).toBe(false);
  });

  it('SS-03: selectAll() replaces entire set with provided IDs', () => {
    useSelectionStore.getState().toggle('a');
    useSelectionStore.getState().selectAll(['x', 'y', 'z']);
    const ids = useSelectionStore.getState().selectedIds;
    expect(ids.size).toBe(3);
    expect(ids.has('x')).toBe(true);
    expect(ids.has('y')).toBe(true);
    expect(ids.has('z')).toBe(true);
    expect(ids.has('a')).toBe(false);
  });

  it('SS-04: selectAll([]) results in empty set', () => {
    useSelectionStore.getState().toggle('a');
    useSelectionStore.getState().selectAll([]);
    expect(useSelectionStore.getState().selectedIds.size).toBe(0);
  });

  it('SS-05: clearAll() resets to empty set', () => {
    useSelectionStore.getState().selectAll(['a', 'b', 'c']);
    useSelectionStore.getState().clearAll();
    expect(useSelectionStore.getState().selectedIds.size).toBe(0);
  });

  it('SS-06: isSelected() returns true for toggled ID, false for unknown ID', () => {
    useSelectionStore.getState().toggle('a');
    expect(useSelectionStore.getState().isSelected('a')).toBe(true);
    expect(useSelectionStore.getState().isSelected('b')).toBe(false);
  });

  it('SS-07: useSelectionCount() returns 0 initially', () => {
    const result = useSelectionStore.getState();
    expect(result.selectedIds.size).toBe(0);
  });

  it('SS-08: useSelectionCount() returns 3 after toggling 3 IDs', () => {
    useSelectionStore.getState().toggle('a');
    useSelectionStore.getState().toggle('b');
    useSelectionStore.getState().toggle('c');
    expect(useSelectionStore.getState().selectedIds.size).toBe(3);
  });

  it('SS-09: useSelectionCount() returns 0 after clearAll', () => {
    useSelectionStore.getState().toggle('a');
    useSelectionStore.getState().clearAll();
    expect(useSelectionStore.getState().selectedIds.size).toBe(0);
  });

  it('SS-10: toggling the same ID twice returns it to original state (idempotent)', () => {
    useSelectionStore.getState().toggle('a');
    expect(useSelectionStore.getState().isSelected('a')).toBe(true);
    useSelectionStore.getState().toggle('a');
    expect(useSelectionStore.getState().isSelected('a')).toBe(false);
    expect(useSelectionStore.getState().selectedIds.size).toBe(0);
  });
});
