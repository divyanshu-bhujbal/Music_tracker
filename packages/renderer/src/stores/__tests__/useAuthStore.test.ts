import { useAuthStore } from '../useAuthStore.js';

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({ isAuthenticated: true });
  });

  it('ST-01: default state is authenticated', () => {
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
  });

  it('ST-02: setAuthenticated(false) transitions to unauthenticated', () => {
    useAuthStore.getState().setAuthenticated(false);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('ST-03: setAuthenticated(true) transitions back after setAuthenticated(false)', () => {
    useAuthStore.getState().setAuthenticated(false);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    useAuthStore.getState().setAuthenticated(true);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('ST-04: store is a singleton — same reference across calls', () => {
    const ref1 = useAuthStore;
    const ref2 = useAuthStore;
    expect(ref1).toBe(ref2);
  });
});
