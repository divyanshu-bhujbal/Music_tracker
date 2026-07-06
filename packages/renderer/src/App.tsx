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
import { PlatformAdapterContext, noopPlatformAdapter } from './hooks/usePlatformAdapter.js';
import { AppRouter } from './navigation/AppRouter.js';

interface AppProps {
  routerType?: 'browser' | 'hash';
  platformAdapter?: PlatformAdapter;
}

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
    <PlatformAdapterContext.Provider value={platformAdapter ?? noopPlatformAdapter}>
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        <AppRouter routerType={routerType} />
      </ThemeProvider>
    </PlatformAdapterContext.Provider>
  );
}
