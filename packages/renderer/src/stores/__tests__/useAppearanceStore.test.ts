/**
 * Basic store tests for useAppearanceStore.
 *
 * Source: E14 Implementation Specification §14.3
 */

import { useAppearanceStore } from '../useAppearanceStore.js';

describe('useAppearanceStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useAppearanceStore.setState({ theme: 'light' });
  });

  it('AS-01: default theme is "light"', () => {
    const theme = useAppearanceStore.getState().theme;
    expect(theme).toBe('light');
  });

  it('AS-02: setTheme("dark") updates theme', () => {
    useAppearanceStore.getState().setTheme('dark');
    expect(useAppearanceStore.getState().theme).toBe('dark');
  });
});
