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
import { useAppearanceStore } from './stores/useAppearanceStore.js';
import { AppRouter } from './navigation/AppRouter.js';

export default function App() {
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
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <AppRouter authenticated={true} />
    </ThemeProvider>
  );
}
