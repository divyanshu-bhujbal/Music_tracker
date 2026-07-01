/**
 * Integration tests for SettingsScreen.
 *
 * Tests form rendering, loading values, persists changes, shows validation errors.
 * Source: E14 Implementation Specification §14.2
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import { SettingsScreen } from '../SettingsScreen.js';
import type { DatabaseConnection } from '@collectio/shared';

// Mock ServiceProvider
const mockDb = {} as DatabaseConnection;
const mockServiceProvider = { db: mockDb } as never;

jest.mock('../../ServiceProviderContext.js', () => ({
  useServiceProvider: () => mockServiceProvider,
}));

// Mock SettingsManager
const mockGetAll = jest.fn();
const mockSet = jest.fn();
jest.mock('@collectio/shared', () => {
  const actual = jest.requireActual('@collectio/shared');
  return {
    ...actual,
    AppSettingsRepository: jest.fn().mockImplementation(() => ({})),
    SettingsManager: jest.fn().mockImplementation(() => ({
      getAll: mockGetAll,
      set: mockSet,
    })),
  };
});

// Mock appearance store
const mockSetTheme = jest.fn();
jest.mock('../../stores/useAppearanceStore.js', () => ({
  useAppearanceStore: jest.fn().mockImplementation((selector?: (s: unknown) => unknown) => {
    const state = { theme: 'light', setTheme: mockSetTheme };
    return selector ? selector(state) : state;
  }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <HashRouter>{children}</HashRouter>
    </QueryClientProvider>
  );
}

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAll.mockResolvedValue({
      theme: 'light',
      default_view: 'table',
      sync_on_startup: true,
      auto_sync_delay_seconds: 120,
      trash_retention_days: -1,
    });
    mockSet.mockResolvedValue(undefined);
  });

  it('SS-01: renders all settings sections', async () => {
    render(<SettingsScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    expect(screen.getByText('Theme')).toBeInTheDocument();
    expect(screen.getByText(/Choose the default view/)).toBeInTheDocument();
    expect(screen.getByText('Sync on Startup')).toBeInTheDocument();
    expect(screen.getByText('Auto-Sync Delay')).toBeInTheDocument();
    expect(screen.getByText('Trash Retention')).toBeInTheDocument();
  });

  it('SS-02: theme switch reflects current value (light)', async () => {
    mockGetAll.mockResolvedValue({
      theme: 'light',
      default_view: 'table',
      sync_on_startup: true,
      auto_sync_delay_seconds: 120,
      trash_retention_days: -1,
    });

    render(<SettingsScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    const themeSwitch = screen.getByRole('checkbox', { name: /theme/i });
    expect(themeSwitch).not.toBeChecked();
  });

  it('SS-03: theme switch toggles on click', async () => {
    render(<SettingsScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    const themeSwitch = screen.getByRole('checkbox', { name: /theme/i });
    fireEvent.click(themeSwitch);

    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith('theme', 'dark');
    });
  });

  it('SS-04: sync-on-startup switch reflects stored value (false)', async () => {
    mockGetAll.mockResolvedValue({
      theme: 'light',
      default_view: 'table',
      sync_on_startup: false,
      auto_sync_delay_seconds: 120,
      trash_retention_days: -1,
    });

    render(<SettingsScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    const syncSwitch = screen.getByRole('checkbox', { name: /sync on startup/i });
    expect(syncSwitch).not.toBeChecked();
  });

  it('SS-05: default view select shows options', async () => {
    render(<SettingsScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    const select = screen.getByLabelText('Default View');
    fireEvent.mouseDown(select);

    await waitFor(() => {
      expect(screen.getAllByText('Table').length).toBeGreaterThan(1);
      expect(screen.getByText('Tile')).toBeInTheDocument();
    });
  });

  it('SS-06: auto-sync delay slider reflects stored value', async () => {
    mockGetAll.mockResolvedValue({
      theme: 'light',
      default_view: 'table',
      sync_on_startup: true,
      auto_sync_delay_seconds: 300,
      trash_retention_days: -1,
    });

    render(<SettingsScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    const delayInput = screen.getByRole('spinbutton', { name: /auto-sync delay/i });
    expect(delayInput).toHaveValue(300);
  });

  it('SS-07: auto-sync delay TextField validates input', async () => {
    render(<SettingsScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    const delayInput = screen.getByRole('spinbutton', { name: /auto-sync delay/i });
    fireEvent.change(delayInput, { target: { value: '700' } });
    fireEvent.blur(delayInput);

    await waitFor(() => {
      expect(screen.getByText(/Must be between 30 and 600/)).toBeInTheDocument();
    });
    expect(mockSet).not.toHaveBeenCalledWith('auto_sync_delay_seconds', 700);
  });

  it('SS-08: auto-sync delay Slider commits on drag end', async () => {
    render(<SettingsScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    const slider = screen.getByRole('slider');
    // Simulate slider change and commit
    fireEvent.change(slider, { target: { value: 200 } });

    await waitFor(() => {
      expect(mockSet).toHaveBeenCalled();
    });
  });

  it('SS-09: trash retention shows Indefinite', async () => {
    render(<SettingsScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    const trashField = screen.getByDisplayValue('Indefinite');
    expect(trashField).toBeInTheDocument();
    expect(trashField).toBeDisabled();
  });

  it('SS-10: success snackbar on save', async () => {
    render(<SettingsScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    const themeSwitch = screen.getByRole('checkbox', { name: /theme/i });
    fireEvent.click(themeSwitch);

    await waitFor(() => {
      expect(screen.getByText('Theme updated')).toBeInTheDocument();
    });
  });

  it('SS-11: error snackbar on save failure', async () => {
    mockSet.mockRejectedValue(new Error('DB error'));

    render(<SettingsScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    const themeSwitch = screen.getByRole('checkbox', { name: /theme/i });
    fireEvent.click(themeSwitch);

    await waitFor(() => {
      expect(screen.getByText('DB error')).toBeInTheDocument();
    });
  });

  it('SS-12: loading state on mount', () => {
    mockGetAll.mockReturnValue(new Promise(() => {})); // Never resolves

    render(<SettingsScreen />, { wrapper: createWrapper() });

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('SS-13: error state on mount failure', async () => {
    mockGetAll.mockRejectedValue(new Error('DB connection failed'));

    render(<SettingsScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/Failed to load settings/)).toBeInTheDocument();
    });
  });
});
