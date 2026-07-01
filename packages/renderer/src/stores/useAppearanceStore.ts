/**
 * Appearance store for theme management.
 *
 * Controls the MUI theme mode (light/dark) across the entire application.
 * SettingsScreen calls setTheme() after successful persistence.
 * App.tsx subscribes to theme and passes to MUI createTheme().
 *
 * Source: E14 Implementation Specification §8.2
 */

import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark';

interface AppearanceState {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
}

export const useAppearanceStore = create<AppearanceState>((set) => ({
  theme: 'light',
  setTheme: (theme: ThemeMode) => set({ theme }),
}));
