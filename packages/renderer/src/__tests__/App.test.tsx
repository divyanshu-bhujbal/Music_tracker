import React from 'react';
import { render, screen } from '@testing-library/react';
import App from '../App';
import { AppRouter as RealAppRouter } from '../navigation/AppRouter.js';

jest.mock('../stores/useAppearanceStore.js', () => ({
  useAppearanceStore: jest.fn().mockImplementation((selector?: (s: unknown) => unknown) => {
    const state = { theme: 'light', setTheme: jest.fn() };
    return selector ? selector(state) : state;
  }),
}));

jest.mock('../navigation/AppRouter.js', () => ({
  AppRouter: jest.fn().mockReturnValue(
    <div data-testid="app-router">AppRouter</div>,
  ),
}));

jest.mock('@mui/material', () => {
  const actual = jest.requireActual('@mui/material');
  return {
    ...actual,
    ThemeProvider: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="theme-provider">{children}</div>
    ),
    CssBaseline: () => <div data-testid="css-baseline" />,
  };
});

jest.mock('../hooks/usePlatformAdapter.js', () => {
  const actual = jest.requireActual('../hooks/usePlatformAdapter.js');
  return {
    ...actual,
    PlatformAdapterContext: {
      ...actual.PlatformAdapterContext,
      Provider: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="platform-adapter-provider">{children}</div>
      ),
    },
  };
});

describe('App', () => {
  it('renders AppRouter', () => {
    render(<App />);
    expect(screen.getByTestId('app-router')).toBeInTheDocument();
  });

  it('AP-01: renders MUI theme wrapper', () => {
    render(<App />);
    expect(screen.getByTestId('theme-provider')).toBeInTheDocument();
    expect(screen.getByTestId('css-baseline')).toBeInTheDocument();
  });

  it('AP-02: passes routerType to AppRouter', () => {
    render(<App routerType="browser" />);
    expect(jest.mocked(RealAppRouter)).toHaveBeenCalledWith(
      expect.objectContaining({ routerType: 'browser' }),
      expect.anything(),
    );
  });

  it('AP-03: PlatformAdapterContext.Provider wraps children in component tree', () => {
    render(<App />);
    expect(screen.getByTestId('platform-adapter-provider')).toBeInTheDocument();
    expect(screen.getByTestId('theme-provider')).toBeInTheDocument();
    expect(screen.getByTestId('app-router')).toBeInTheDocument();
  });
});
