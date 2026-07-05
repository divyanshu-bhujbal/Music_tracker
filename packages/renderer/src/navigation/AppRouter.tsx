import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from '../components/MainLayout.js';
import { CategoryScreen } from '../components/CategoryScreen.js';
import { TrashScreen } from '../screens/TrashScreen.js';
import { SettingsScreen } from '../screens/SettingsScreen.js';
import { SetupScreen } from '../screens/SetupScreen.js';
import { UnlockScreen } from '../screens/UnlockScreen.js';
import { SongsCategory } from '../categories/songs/SongsCategory.js';
import { CategoryRegistry } from '@collectio/shared';
import { useAuthStore } from '../stores/useAuthStore.js';

interface AppRouterProps {
  routerType?: 'browser' | 'hash';
}

function UnauthenticatedRoutes() {
  return (
    <Routes>
      <Route path="/setup" element={<SetupScreen />} />
      <Route path="/unlock" element={<UnlockScreen />} />
      <Route path="*" element={<Navigate to="/setup" replace />} />
    </Routes>
  );
}

function AuthenticatedRoutes() {
  return (
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
        <Route path="trash" element={<TrashScreen />} />
        <Route path="settings" element={<SettingsScreen />} />
        <Route path="*" element={<Navigate to="/songs" replace />} />
      </Route>
    </Routes>
  );
}

export function AppRouter({ routerType = 'hash' }: AppRouterProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (routerType === 'browser') {
    return (
      <BrowserRouter>
        {isAuthenticated ? <AuthenticatedRoutes /> : <UnauthenticatedRoutes />}
      </BrowserRouter>
    );
  }

  if (routerType === 'hash') {
    return (
      <HashRouter>
        {isAuthenticated ? <AuthenticatedRoutes /> : <UnauthenticatedRoutes />}
      </HashRouter>
    );
  }

  // eslint-disable-next-line no-console
  console.warn(`AppRouter: unknown routerType "${routerType}", falling back to HashRouter`);
  return (
    <HashRouter>
      {isAuthenticated ? <AuthenticatedRoutes /> : <UnauthenticatedRoutes />}
    </HashRouter>
  );
}
