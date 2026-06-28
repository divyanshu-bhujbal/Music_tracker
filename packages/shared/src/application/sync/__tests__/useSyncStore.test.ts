import {
  useSyncStore,
} from '../useSyncStore.js';

describe('useSyncStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useSyncStore.getState().reset();
  });

  // US-01
  it('initial state is IDLE, clean', () => {
    const state = useSyncStore.getState();
    expect(state.syncState).toBe('IDLE');
    expect(state.isDirty).toBe(false);
    expect(state.pendingCount).toBe(0);
    expect(state.lastSyncTime).toBeNull();
    expect(state.errorMessage).toBeNull();
    expect(state.isOnline).toBe(true);
  });

  // US-02
  it('setDirty(true, 5) updates state', () => {
    useSyncStore.getState().setDirty(true, 5);
    const state = useSyncStore.getState();
    expect(state.syncState).toBe('DIRTY');
    expect(state.isDirty).toBe(true);
    expect(state.pendingCount).toBe(5);
  });

  // US-03
  it('setSyncState(SYNCING) updates state', () => {
    useSyncStore.getState().setSyncState('SYNCING');
    expect(useSyncStore.getState().syncState).toBe('SYNCING');
  });

  // US-04
  it('setOnline(false) sets offline', () => {
    useSyncStore.getState().setOnline(false);
    const state = useSyncStore.getState();
    expect(state.syncState).toBe('OFFLINE');
    expect(state.isOnline).toBe(false);
  });

  // US-05
  it('setOnline(true) restores IDLE when clean', () => {
    useSyncStore.getState().setOnline(false);
    useSyncStore.getState().setOnline(true);
    const state = useSyncStore.getState();
    expect(state.syncState).toBe('IDLE');
    expect(state.isOnline).toBe(true);
  });

  // US-06
  it('setOnline(true) restores DIRTY when dirty', () => {
    useSyncStore.getState().setDirty(true, 3);
    useSyncStore.getState().setOnline(false);
    useSyncStore.getState().setOnline(true);
    const state = useSyncStore.getState();
    expect(state.syncState).toBe('DIRTY');
    expect(state.isOnline).toBe(true);
  });

  // US-07
  it('setError(msg) sets errorMessage', () => {
    useSyncStore.getState().setError('test error');
    expect(useSyncStore.getState().errorMessage).toBe('test error');
  });

  // US-08
  it('setLastSyncTime stores value', () => {
    useSyncStore.getState().setLastSyncTime('2026-01-01T00:00:00Z');
    expect(useSyncStore.getState().lastSyncTime).toBe('2026-01-01T00:00:00Z');
  });

  // US-09
  it('skipSync is a no-op on state', () => {
    useSyncStore.getState().setSyncState('SYNCING');
    useSyncStore.getState().skipSync();
    expect(useSyncStore.getState().syncState).toBe('SYNCING');
  });

  // US-10
  it('reset() clears all state', () => {
    useSyncStore.getState().setDirty(true, 5);
    useSyncStore.getState().setSyncState('WARNING');
    useSyncStore.getState().setError('error');
    useSyncStore.getState().setLastSyncTime('2026-01-01T00:00:00Z');
    useSyncStore.getState().setOnline(false);

    useSyncStore.getState().reset();

    const state = useSyncStore.getState();
    expect(state.syncState).toBe('IDLE');
    expect(state.isDirty).toBe(false);
    expect(state.pendingCount).toBe(0);
    expect(state.lastSyncTime).toBeNull();
    expect(state.errorMessage).toBeNull();
    expect(state.isOnline).toBe(true);
  });

  // US-11
  it('triggerSync sets state to SYNCING', () => {
    useSyncStore.getState().setDirty(true, 3);
    useSyncStore.getState().triggerSync();
    expect(useSyncStore.getState().syncState).toBe('SYNCING');
  });

  it('triggerSync is no-op when already SYNCING', () => {
    useSyncStore.getState().setSyncState('SYNCING');
    useSyncStore.getState().triggerSync();
    expect(useSyncStore.getState().syncState).toBe('SYNCING');
  });
});
