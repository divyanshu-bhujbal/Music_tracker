import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar, COLLAPSED_WIDTH, EXPANDED_WIDTH } from '../Sidebar.js';
import type { SidebarProps } from '../Sidebar.js';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
  useLocation: () => ({ pathname: '/songs' }),
}));

jest.mock('../CategoryNav.js', () => ({
  CategoryNav: ({ collapsed }: { collapsed: boolean }) => (
    <div data-testid="category-nav" data-collapsed={collapsed}>CategoryNav</div>
  ),
}));

jest.mock('../SyncStatusPanel.js', () => ({
  SyncStatusPanel: ({ status, collapsed }: { status: string; collapsed: boolean }) => (
    <div data-testid="sync-status-panel" data-status={status} data-collapsed={collapsed}>
      SyncStatusPanel
    </div>
  ),
}));

function createDefaultProps(overrides?: Partial<SidebarProps>): SidebarProps {
  return {
    desktopOpen: true,
    mobileOpen: false,
    onDesktopToggle: jest.fn(),
    onMobileClose: jest.fn(),
    syncStatus: 'synced',
    lastSyncTime: null,
    pendingChanges: 0,
    onSync: jest.fn(),
    ...overrides,
  };
}

describe('Sidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('SB-01: renders Collectio title when expanded', () => {
    render(<Sidebar {...createDefaultProps()} />);
    expect(screen.getAllByText('Collectio').length).toBeGreaterThanOrEqual(1);
  });

  it('SB-02: toggle button calls onDesktopToggle', () => {
    const onDesktopToggle = jest.fn();
    render(<Sidebar {...createDefaultProps({ onDesktopToggle })} />);
    const toggleButtons = screen.getAllByLabelText('Toggle sidebar');
    fireEvent.click(toggleButtons[0]);
    expect(onDesktopToggle).toHaveBeenCalledTimes(1);
  });

  it('SB-03: renders CategoryNav with collapsed prop', () => {
    render(<Sidebar {...createDefaultProps({ desktopOpen: false })} />);
    const navs = screen.getAllByTestId('category-nav');
    const collapsedNav = navs.find((n) => n.getAttribute('data-collapsed') === 'true');
    expect(collapsedNav).toBeInTheDocument();
  });

  it('SB-04: renders SyncStatusPanel with correct status', () => {
    render(<Sidebar {...createDefaultProps({ syncStatus: 'error', pendingChanges: 3 })} />);
    const panels = screen.getAllByTestId('sync-status-panel');
    const errorPanel = panels.find((p) => p.getAttribute('data-status') === 'error');
    expect(errorPanel).toBeInTheDocument();
  });

  it('SB-05: renders Trash link when expanded', () => {
    render(<Sidebar {...createDefaultProps()} />);
    const trashButtons = screen.getAllByText('Trash');
    expect(trashButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('SB-06: renders Settings link when expanded', () => {
    render(<Sidebar {...createDefaultProps()} />);
    const settingsButtons = screen.getAllByText('Settings');
    expect(settingsButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('SB-07: collapsed mode shows Trash icon button', () => {
    render(<Sidebar {...createDefaultProps({ desktopOpen: false })} />);
    const trashButtons = screen.getAllByLabelText('Trash');
    expect(trashButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('SB-08: collapsed mode shows Settings icon button', () => {
    render(<Sidebar {...createDefaultProps({ desktopOpen: false })} />);
    const settingsButtons = screen.getAllByLabelText('Settings');
    expect(settingsButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('SB-09: mobile drawer renders sidebar content', () => {
    render(<Sidebar {...createDefaultProps({ mobileOpen: true })} />);
    expect(screen.getAllByText('Collectio').length).toBeGreaterThanOrEqual(1);
  });

  it('SB-10: exports COLLAPSED_WIDTH and EXPANDED_WIDTH constants', () => {
    expect(COLLAPSED_WIDTH).toBe(56);
    expect(EXPANDED_WIDTH).toBe(280);
  });
});
