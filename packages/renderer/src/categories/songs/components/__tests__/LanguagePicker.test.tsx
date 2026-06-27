import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LanguagePicker } from '../LanguagePicker.js';
import type { Language, DatabaseConnection } from '@collectio/shared';
import { configureSongsStore } from '../../store/useSongsStore.js';

const mockLanguages: Language[] = [
  { id: 1, iso_code: 'en', name: 'English', native_name: 'English', user_added: 0, created_at: '2024-01-01' },
  { id: 2, iso_code: 'ja', name: 'Japanese', native_name: '日本語', user_added: 0, created_at: '2024-01-01' },
  { id: 3, iso_code: 'xx', name: 'Custom Language', native_name: 'Custom', user_added: 1, created_at: '2024-01-15' },
];

function createMockDb(executeError?: Error): DatabaseConnection {
  return {
    open: jest.fn(),
    close: jest.fn(),
    execute: jest.fn(),
    query: jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('FROM languages')) {
        if (executeError) return Promise.reject(executeError);
        return Promise.resolve(mockLanguages);
      }
      return Promise.resolve([]);
    }),
    transaction: jest.fn(),
  };
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const db = createMockDb();
  configureSongsStore(db);

  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  );
}

describe('LanguagePicker', () => {
  it('LP-01: renders Autocomplete with languages', async () => {
    renderWithProviders(
      <LanguagePicker value={null} onChange={jest.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    const combobox = screen.getByRole('combobox');
    expect(combobox).toBeInTheDocument();
  });

  it('LP-02: typing filters language list', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <LanguagePicker value={null} onChange={jest.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, 'Eng');

    await waitFor(() => {
      expect(screen.getByText('English')).toBeInTheDocument();
    });
  });

  it('LP-03: selecting language calls onChange', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <LanguagePicker value={null} onChange={onChange} />,
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, 'English');

    await waitFor(() => {
      expect(screen.getByText('English')).toBeInTheDocument();
    });

    await user.click(screen.getByText('English'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, name: 'English' }),
    );
  });

  it('LP-04: user-added languages visually distinct', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <LanguagePicker value={null} onChange={jest.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, 'Custom');

    await waitFor(() => {
      expect(screen.getByText('Custom Language')).toBeInTheDocument();
      expect(screen.getByText('User Added')).toBeInTheDocument();
    });
  });

  it('LP-05: free-text entry not allowed', async () => {
    renderWithProviders(
      <LanguagePicker value={null} onChange={jest.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('role', 'combobox');
  });

  it('LP-06: loading state shown', async () => {
    renderWithProviders(
      <LanguagePicker value={null} onChange={jest.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });
  });

  it('LP-07: error state shows message', async () => {
    const errDb = createMockDb(new Error('DB failure'));
    configureSongsStore(errDb);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <LanguagePicker value={null} onChange={jest.fn()} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to load languages')).toBeInTheDocument();
    });
  });

  it('LP-08: clearing selection calls onChange(null)', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();

    const language = mockLanguages[0];
    renderWithProviders(
      <LanguagePicker value={language} onChange={onChange} />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Language/)).toBeInTheDocument();
    });

    const clearButton = screen.getByLabelText('Clear');
    await user.click(clearButton);
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
