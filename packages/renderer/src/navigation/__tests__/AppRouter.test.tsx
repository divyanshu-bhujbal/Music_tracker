import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAuthStore } from '../../stores/useAuthStore.js';
import { AppRouter } from '../AppRouter.js';
import { PlatformAdapterContext } from '../../hooks/usePlatformAdapter.js';
import { createMockPlatformAdapter } from '../../hooks/__tests__/__mocks__/platformAdapterMock.js';

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    BrowserRouter: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="browser-router">{children}</div>
    ),
    HashRouter: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="hash-router">{children}</div>
    ),
  };
});

jest.mock('../../components/MainLayout.js', () => {
  const { Outlet } = jest.requireActual('react-router-dom');
  return {
    MainLayout: () => (
      <div data-testid="main-layout">
        <Outlet />
      </div>
    ),
  };
});

jest.mock('../../components/CategoryScreen.js', () => ({
  CategoryScreen: () => <div data-testid="category-screen">CategoryScreen</div>,
}));

jest.mock('../../screens/TrashScreen.js', () => ({
  TrashScreen: () => <div data-testid="trash-screen">TrashScreen</div>,
}));

jest.mock('../../screens/SettingsScreen.js', () => ({
  SettingsScreen: () => <div data-testid="settings-screen">SettingsScreen</div>,
}));

jest.mock('../../screens/SetupScreen.js', () => ({
  SetupScreen: () => <div data-testid="setup-screen">SetupScreen</div>,
}));

jest.mock('../../screens/UnlockScreen.js', () => ({
  UnlockScreen: () => <div data-testid="unlock-screen">UnlockScreen</div>,
}));

jest.mock('../../categories/songs/SongsCategory.js', () => ({
  SongsCategory: { id: 'songs', displayName: 'Songs' },
  configure: jest.fn(),
  getDb: jest.fn(),
}));

function renderRouter(initialEntries: string[], routerType?: 'browser' | 'hash', adapterOverrides?: Record<string, unknown>) {
  const adapter = createMockPlatformAdapter(adapterOverrides);
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <PlatformAdapterContext.Provider value={adapter}>
        <AppRouter routerType={routerType} />
      </PlatformAdapterContext.Provider>
    </MemoryRouter>,
  );
}

describe('AppRouter — authenticated branch', () => {
  beforeEach(() => {
    useAuthStore.setState({ isAuthenticated: true });
  });

  it('RT-01: index route renders CategoryScreen', () => {
    renderRouter(['/']);
    expect(screen.getByTestId('main-layout')).toBeInTheDocument();
    expect(screen.getByTestId('category-screen')).toBeInTheDocument();
  });

  it('RT-02: /songs route renders CategoryScreen', () => {
    renderRouter(['/songs']);
    expect(screen.getByTestId('main-layout')).toBeInTheDocument();
    expect(screen.getByTestId('category-screen')).toBeInTheDocument();
  });

  it('RT-03: /trash route renders TrashScreen', () => {
    renderRouter(['/trash']);
    expect(screen.getByTestId('main-layout')).toBeInTheDocument();
    expect(screen.getByTestId('trash-screen')).toBeInTheDocument();
  });

  it('RT-04: /settings route renders SettingsScreen', () => {
    renderRouter(['/settings']);
    expect(screen.getByTestId('main-layout')).toBeInTheDocument();
    expect(screen.getByTestId('settings-screen')).toBeInTheDocument();
  });

  it('RT-05: unknown route redirects to /songs', () => {
    renderRouter(['/nonexistent']);
    expect(screen.getByTestId('main-layout')).toBeInTheDocument();
    expect(screen.getByTestId('category-screen')).toBeInTheDocument();
    expect(screen.queryByTestId('trash-screen')).not.toBeInTheDocument();
  });

  it('RT-06: MainLayout wraps authenticated routes', () => {
    renderRouter(['/songs']);
    expect(screen.getByTestId('main-layout')).toBeInTheDocument();
  });
});

describe('AppRouter — unauthenticated branch', () => {
  beforeEach(() => {
    useAuthStore.setState({ isAuthenticated: false });
  });

  it('RT-07: /setup renders SetupScreen', () => {
    renderRouter(['/setup']);
    expect(screen.getByTestId('setup-screen')).toBeInTheDocument();
  });

  it('RT-08: /unlock renders UnlockScreen', () => {
    renderRouter(['/unlock']);
    expect(screen.getByTestId('unlock-screen')).toBeInTheDocument();
  });

  it('RT-09: unknown route redirects to /setup', () => {
    renderRouter(['/nonexistent']);
    expect(screen.getByTestId('setup-screen')).toBeInTheDocument();
  });
});

describe('AppRouter — router type', () => {
  beforeEach(() => {
    useAuthStore.setState({ isAuthenticated: true });
  });

  it('RT-10: default router type is HashRouter', () => {
    const adapter = createMockPlatformAdapter();
    render(
      <MemoryRouter initialEntries={['/songs']}>
        <PlatformAdapterContext.Provider value={adapter}>
          <AppRouter />
        </PlatformAdapterContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('hash-router')).toBeInTheDocument();
    expect(screen.queryByTestId('browser-router')).not.toBeInTheDocument();
  });

  it('RT-11: routerType="hash" uses HashRouter', () => {
    renderRouter(['/songs'], 'hash');
    expect(screen.getByTestId('hash-router')).toBeInTheDocument();
    expect(screen.queryByTestId('browser-router')).not.toBeInTheDocument();
  });

  it('RT-12: routerType="browser" uses BrowserRouter', () => {
    renderRouter(['/songs'], 'browser');
    expect(screen.getByTestId('browser-router')).toBeInTheDocument();
    expect(screen.queryByTestId('hash-router')).not.toBeInTheDocument();
  });
});

describe('AppRouter — platform back button', () => {
  beforeEach(() => {
    useAuthStore.setState({ isAuthenticated: true });
  });

  it('RT-PLAT-01: onBackButton registered when hasBackButton=true', () => {
    const onBackButton = jest.fn().mockReturnValue(jest.fn());
    renderRouter(['/songs'], 'hash', { hasBackButton: true, onBackButton });
    expect(onBackButton).toHaveBeenCalled();
  });

  it('RT-PLAT-04: onBackButton NOT called when hasBackButton=false', () => {
    const onBackButton = jest.fn().mockReturnValue(jest.fn());
    renderRouter(['/songs'], 'hash', { hasBackButton: false, onBackButton });
    expect(onBackButton).not.toHaveBeenCalled();
  });
});
