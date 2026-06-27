import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from '../components/MainLayout.js';
import { CategoryScreen } from '../components/CategoryScreen.js';
import { SongsCategory } from '../categories/songs/SongsCategory.js';
import { CategoryRegistry } from '@collectio/shared';

interface AppRouterProps {
  authenticated?: boolean;
}

export function AppRouter({ authenticated = true }: AppRouterProps) {
  if (!authenticated) {
    return (
      <HashRouter>
        <Routes>
          <Route path="/setup" element={<div>SetupScreen (not yet implemented)</div>} />
          <Route path="/unlock" element={<div>UnlockScreen (not yet implemented)</div>} />
          <Route path="*" element={<Navigate to="/setup" replace />} />
        </Routes>
      </HashRouter>
    );
  }

  return (
    <HashRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route
            index
            element={
              <CategoryScreen
                category={CategoryRegistry.get('songs') ?? SongsCategory}
              />
            }
          />
          <Route
            path="songs"
            element={
              <CategoryScreen
                category={CategoryRegistry.get('songs') ?? SongsCategory}
              />
            }
          />
          <Route path="trash" element={<div>TrashScreen (not yet implemented)</div>} />
          <Route path="settings" element={<div>SettingsScreen (not yet implemented)</div>} />
          <Route path="*" element={<Navigate to="/songs" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
