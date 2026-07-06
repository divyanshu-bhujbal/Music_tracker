/**
 * App root component.
 *
 * Wraps the application with MUI ThemeProvider + CssBaseline,
 * controlled by the useAppearanceStore theme setting.
 * Renders the AppRouter for navigation.
 *
 * Source: E14 Implementation Specification §16.1
 */

import { useMemo } from 'react';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import type { PlatformAdapter } from '@collectio/shared';
import { useAppearanceStore } from './stores/useAppearanceStore.js';
import { PlatformAdapterContext } from './hooks/usePlatformAdapter.js';
import { AppRouter } from './navigation/AppRouter.js';

interface AppProps {
  routerType?: 'browser' | 'hash';
  platformAdapter?: PlatformAdapter;
}

function noopPlatformAdapter(): PlatformAdapter {
  return {
    supportsHover: false,
    supportsContextMenu: false,
    supportsKeyboardShortcuts: false,
    hasBackButton: false,
    touchTargetSize: 0,
    columnWidthScale: 1.0,
    usesSafeAreaInsets: false,
    showContextMenu: () => {},
    onKeyboardShortcut: () => () => {},
    onBackButton: () => () => {},
  };
}

const DEFAULT_ADAPTER = noopPlatformAdapter();

export default function App({ routerType = 'hash', platformAdapter }: AppProps) {
  const themeMode = useAppearanceStore((s) => s.theme);

  const muiTheme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: themeMode,
        },
      }),
    [themeMode],
  );

  return (
    <PlatformAdapterContext.Provider value={platformAdapter ?? DEFAULT_ADAPTER}>
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        <AppRouter routerType={routerType} />
      </ThemeProvider>
    </PlatformAdapterContext.Provider>
  );
}
