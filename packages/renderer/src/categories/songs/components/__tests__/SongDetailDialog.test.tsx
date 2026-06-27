import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SongDetailDialog } from '../SongDetailDialog.js';
import type { SongWithArtists, Language } from '@collectio/shared';
import { configureSongsStore } from '../../store/useSongsStore.js';
import type { DatabaseConnection } from '@collectio/shared';

const mockSong: SongWithArtists = {
  id: 'song-1',
  name: 'Test Song',
  album_name: 'Test Album',
  language_id: 1,
  added_at: '2024-01-15T10:30:00.000Z',
  updated_at: '2024-01-15T10:30:00.000Z',
  deleted_at: null,
  artists: [
    { id: 'artist-1', display_name: 'Artist One', sort_order: 0 },
    { id: 'artist-2', display_name: 'Artist Two', sort_order: 1 },
  ],
};

const mockLanguages: Language[] = [
  { id: 1, iso_code: 'en', name: 'English', native_name: 'English', user_added: 0, created_at: '2024-01-01' },
];

function createMockDb(): DatabaseConnection {
  return {
    open: jest.fn(),
    close: jest.fn(),
    execute: jest.fn(),
    query: jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('FROM languages')) {
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

describe('SongDetailDialog', () => {
  it('DD-01: renders all item fields', async () => {
    renderWithProviders(
      <SongDetailDialog
        open={true}
        item={mockSong}
        onClose={jest.fn()}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Test Song')).toBeInTheDocument();
    });

    expect(screen.getByText('Test Album')).toBeInTheDocument();
    expect(screen.getByText('Artist One')).toBeInTheDocument();
    expect(screen.getByText('Artist Two')).toBeInTheDocument();
  });

  it('DD-02: Date Added is visible but not editable', async () => {
    renderWithProviders(
      <SongDetailDialog
        open={true}
        item={mockSong}
        onClose={jest.fn()}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Date Added/)).toBeInTheDocument();
    });

    // Date should be displayed as text, not input
    const dateText = screen.getByText(/15\/1\/2024|1\/15\/2024/);
    expect(dateText.tagName).not.toBe('INPUT');
  });

  it('DD-03: Edit button calls onEdit', async () => {
    const onEdit = jest.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <SongDetailDialog
        open={true}
        item={mockSong}
        onClose={jest.fn()}
        onEdit={onEdit}
        onDelete={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Edit'));
    expect(onEdit).toHaveBeenCalledWith(mockSong);
  });

  it('DD-04: Delete button shows confirmation', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <SongDetailDialog
        open={true}
        item={mockSong}
        onClose={jest.fn()}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Delete'));
    expect(screen.getByText('Confirm Delete')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
  });

  it('DD-05: Confirm delete calls onDelete', async () => {
    const onDelete = jest.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <SongDetailDialog
        open={true}
        item={mockSong}
        onClose={jest.fn()}
        onEdit={jest.fn()}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByText('Delete'));
    await user.click(screen.getByText('Delete', { selector: '.MuiButton-containedError' }));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith('song-1');
    });
  });

  it('DD-06: Close button calls onClose', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <SongDetailDialog
        open={true}
        item={mockSong}
        onClose={onClose}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    await user.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('DD-07: Cancel delete does not call onDelete', async () => {
    const onDelete = jest.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <SongDetailDialog
        open={true}
        item={mockSong}
        onClose={jest.fn()}
        onEdit={jest.fn()}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByText('Delete'));
    await user.click(screen.getByText('Cancel', { selector: '.MuiDialogActions-root .MuiButton-root' }));

    expect(onDelete).not.toHaveBeenCalled();
  });
});
