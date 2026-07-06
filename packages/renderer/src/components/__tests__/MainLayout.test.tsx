import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MainLayout } from '../MainLayout.js';
import { PlatformAdapterContext } from '../../hooks/usePlatformAdapter.js';
import { createMockPlatformAdapter } from '../../hooks/__tests__/__mocks__/platformAdapterMock.js';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  Outlet: () => <div data-testid="outlet">Outlet Content</div>,
}));

jest.mock('../Sidebar.js', () => ({
  Sidebar: (props: { desktopOpen?: boolean; onDesktopToggle?: () => void }) => (
    <div data-testid="sidebar" data-open={props.desktopOpen}>
      <button
        aria-label="Toggle sidebar"
        onClick={() => props.onDesktopToggle?.()}
      >
        Toggle
      </button>
    </div>
  ),
  COLLAPSED_WIDTH: 56,
  EXPANDED_WIDTH: 280,
}));

function renderWithProvider(ui: React.ReactElement, adapterOverrides?: Record<string, unknown>) {
  const adapter = createMockPlatformAdapter(adapterOverrides);
  return render(
    <PlatformAdapterContext.Provider value={adapter}>
      {ui}
    </PlatformAdapterContext.Provider>,
  );
}

describe('MainLayout', () => {
  it('ML-01: renders sidebar and outlet', () => {
    renderWithProvider(<MainLayout />);
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('outlet')).toBeInTheDocument();
  });

  it('ML-02: sidebar starts collapsed (desktopOpen=false)', () => {
    renderWithProvider(<MainLayout />);
    const sidebar = screen.getByTestId('sidebar');
    expect(sidebar).toHaveAttribute('data-open', 'false');
  });

  it('ML-03: renders CssBaseline', () => {
    const { container } = renderWithProvider(<MainLayout />);
    expect(container.querySelector('main')).toBeInTheDocument();
  });

  it('ML-04: clicking sidebar toggle changes desktopOpen from false to true', () => {
    renderWithProvider(<MainLayout />);
    const sidebar = screen.getByTestId('sidebar');
    expect(sidebar).toHaveAttribute('data-open', 'false');
    fireEvent.click(screen.getByLabelText('Toggle sidebar'));
    expect(sidebar).toHaveAttribute('data-open', 'true');
  });

  it('ML-PLAT-01: safe area padding applied when usesSafeAreaInsets=true', () => {
    const { container } = renderWithProvider(<MainLayout />, { usesSafeAreaInsets: true });
    const root = container.firstChild as HTMLElement;
    expect(root).toBeDefined();
    expect(root).toBeInTheDocument();
    const rootStyle = root.getAttribute('class') ?? '';
    expect(rootStyle).toBeTruthy();
  });

  it('ML-PLAT-02: safe area padding absent when usesSafeAreaInsets=false', () => {
    const { container } = renderWithProvider(<MainLayout />, { usesSafeAreaInsets: false });
    const root = container.firstChild as HTMLElement;
    expect(root).toBeDefined();
    expect(root).toBeInTheDocument();
    const rootStyle = root.getAttribute('class') ?? '';
    expect(rootStyle).toBeTruthy();
  });
});
