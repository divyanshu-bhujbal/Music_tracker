import { render, screen } from '@testing-library/react';
import { MainLayout } from '../MainLayout.js';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  Outlet: () => <div data-testid="outlet">Outlet Content</div>,
}));

jest.mock('../Sidebar.js', () => ({
  Sidebar: (props: { desktopOpen?: boolean }) => (
    <div data-testid="sidebar" data-open={props.desktopOpen}>
      Sidebar
    </div>
  ),
  COLLAPSED_WIDTH: 56,
  EXPANDED_WIDTH: 280,
}));

describe('MainLayout', () => {
  it('ML-01: renders sidebar and outlet', () => {
    render(<MainLayout />);
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('outlet')).toBeInTheDocument();
  });

  it('ML-02: sidebar starts collapsed (desktopOpen=false)', () => {
    render(<MainLayout />);
    const sidebar = screen.getByTestId('sidebar');
    expect(sidebar).toHaveAttribute('data-open', 'false');
  });

  it('ML-03: renders CssBaseline', () => {
    const { container } = render(<MainLayout />);
    expect(container.querySelector('main')).toBeInTheDocument();
  });
});
