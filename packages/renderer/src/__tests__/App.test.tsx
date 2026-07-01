import { render, screen } from '@testing-library/react';
import App from '../App';

// Mock the stores
jest.mock('../stores/useAppearanceStore.js', () => ({
  useAppearanceStore: jest.fn().mockImplementation((selector?: (s: unknown) => unknown) => {
    const state = { theme: 'light', setTheme: jest.fn() };
    return selector ? selector(state) : state;
  }),
}));

// Mock AppRouter to avoid routing setup
jest.mock('../navigation/AppRouter.js', () => ({
  AppRouter: () => <div data-testid="app-router">AppRouter</div>,
}));

describe('App', () => {
  it('renders AppRouter', () => {
    render(<App />);
    expect(screen.getByTestId('app-router')).toBeInTheDocument();
  });
});
