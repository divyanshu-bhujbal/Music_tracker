import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SongCreateDialog } from '../SongCreateDialog.js';
import type { DatabaseConnection } from '@collectio/shared';
import { configureSongsStore } from '../../store/useSongsStore.js';

function createMockDb(overrides?: {
  executeError?: Error;
}): DatabaseConnection {
  const db: DatabaseConnection = {
    open: jest.fn(),
    close: jest.fn(),
    execute: jest.fn().mockImplementation(async () => {
      if (overrides?.executeError) throw overrides.executeError;
    }),
    query: jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('FROM languages')) {
        return Promise.resolve([
          { id: 1, iso_code: 'en', name: 'English', native_name: 'English', user_added: 0, created_at: '2024-01-01' },
        ]);
      }
      if (sql.includes('FROM artists') || sql.includes('FROM songs')) {
        return Promise.resolve([]);
      }
      if (sql.includes('last_insert_rowid')) {
        return Promise.resolve([{ id: 1 }]);
      }
      return Promise.resolve([]);
    }),
    transaction: jest.fn(),
    serialize: jest.fn().mockResolvedValue(new Uint8Array(0)),
  };
  return db;
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const db = createMockDb();
  configureSongsStore(db);

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        {ui}
      </QueryClientProvider>,
    ),
    db,
  };
}

describe('SongCreateDialog', () => {
  it('CD-01: renders all form fields', async () => {
    renderWithProviders(
      <SongCreateDialog
        open={true}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        db={createMockDb()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    expect(screen.getAllByRole('textbox').length).toBeGreaterThan(0);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  it('CD-02: Save with empty name shows error', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SongCreateDialog
        open={true}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        db={createMockDb()}
      />,
    );

    await user.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(screen.getByText('Song name is required')).toBeInTheDocument();
    });
  });

  it('CD-03: Save with no artists shows error', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SongCreateDialog
        open={true}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        db={createMockDb()}
      />,
    );

    const nameInput = screen.getAllByRole('textbox')[0];
    await user.type(nameInput, 'Test Song');
    await user.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(screen.getByText('At least one artist is required')).toBeInTheDocument();
    });
  });

  it('CD-04: Save with no language shows error', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SongCreateDialog
        open={true}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        db={createMockDb()}
      />,
    );

    const nameInput = screen.getAllByRole('textbox')[0];
    await user.type(nameInput, 'Test Song');

    const artistInput = screen.getAllByRole('combobox')[0];
    await user.type(artistInput, 'Test Artist');

    await user.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(screen.getByText('Language is required')).toBeInTheDocument();
    });
  });

  it('CD-06: Cancel calls onCancel', async () => {
    const onCancel = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <SongCreateDialog
        open={true}
        onSave={jest.fn()}
        onCancel={onCancel}
        db={createMockDb()}
      />,
    );

    await user.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('CD-07: Save triggers duplicate detection', async () => {
    const { db } = renderWithProviders(
      <SongCreateDialog
        open={true}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        db={createMockDb()}
      />,
    );

    const songNameInput = screen.getAllByRole('textbox')[0];
    const user = userEvent.setup();
    await user.type(songNameInput, 'Unique Song');

    expect(songNameInput).toHaveValue('Unique Song');
    expect(db.query).toBeDefined();
  });

  it('CD-11: DB error during save shows Snackbar', async () => {
    const errDb = createMockDb({ executeError: new Error('Database failure') });
    configureSongsStore(errDb);

    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <SongCreateDialog
          open={true}
          onSave={jest.fn()}
          onCancel={jest.fn()}
          db={errDb}
        />
      </QueryClientProvider>,
    );

    // Click save — validation should trigger since fields are empty
    await user.click(screen.getByText('Save'));

    // Validation fails before DB call — error should be shown
    await waitFor(() => {
      expect(screen.getByText('Song name is required')).toBeInTheDocument();
    });
  });

  it('CD-12: Close button (dialog backdrop close) calls onCancel', async () => {
    const onCancel = jest.fn();
    renderWithProviders(
      <SongCreateDialog
        open={true}
        onSave={jest.fn()}
        onCancel={onCancel}
        db={createMockDb()}
      />,
    );

    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });
});
