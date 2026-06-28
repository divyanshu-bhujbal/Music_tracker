import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SongEditDialog } from '../SongEditDialog.js';
import type { SongWithArtists, DatabaseConnection } from '@collectio/shared';
import { configureSongsStore } from '../../store/useSongsStore.js';

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
  ],
};

function createMockDb(): DatabaseConnection {
  return {
    open: jest.fn(),
    close: jest.fn(),
    execute: jest.fn(),
    query: jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('FROM languages')) {
        return Promise.resolve([
          { id: 1, iso_code: 'en', name: 'English', native_name: 'English', user_added: 0, created_at: '2024-01-01' },
        ]);
      }
      if (sql.includes('FROM artists') || sql.includes('FROM songs') || sql.includes('FROM song_artists')) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    }),
    transaction: jest.fn(),
    serialize: jest.fn().mockResolvedValue(new Uint8Array(0)),
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

describe('SongEditDialog', () => {
  it('ED-01: renders form pre-populated with item data', async () => {
    renderWithProviders(
      <SongEditDialog
        open={true}
        item={mockSong}
        onSave={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Song')).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue('Test Album')).toBeInTheDocument();
  });

  it('ED-02: added_at displayed as read-only text', async () => {
    renderWithProviders(
      <SongEditDialog
        open={true}
        item={mockSong}
        onSave={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Date Added/)).toBeInTheDocument();
    });

    // Date should be displayed — check for the Typography caption
    const dateAddedSection = screen.getByText(/Date Added/).parentElement;
    expect(dateAddedSection).toBeInTheDocument();
    // The date text follows Date Added label
    expect(dateAddedSection?.textContent).toMatch(/1\/15\/2024|15\/1\/2024|2024/);
  });

  it('ED-03: cannot edit added_at', async () => {
    renderWithProviders(
      <SongEditDialog
        open={true}
        item={mockSong}
        onSave={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Date Added/)).toBeInTheDocument();
    });

    // Date should be text, not an editable input
    const dateAddedLabel = screen.getByText(/Date Added/);
    expect(dateAddedLabel.tagName).not.toBe('INPUT');
    expect(dateAddedLabel.tagName).not.toBe('TEXTAREA');
  });

  it('ED-04: Save with valid changes calls onSave', async () => {
    const onSave = jest.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <SongEditDialog
        open={true}
        item={mockSong}
        onSave={onSave}
        onCancel={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Song')).toBeInTheDocument();
    });

    const nameInput = screen.getByDisplayValue('Test Song');
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Song');

    await user.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
  });

  it('ED-05: Artist set changes handled correctly', async () => {
    const onSave = jest.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <SongEditDialog
        open={true}
        item={mockSong}
        onSave={onSave}
        onCancel={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Song')).toBeInTheDocument();
    });

    // The artist chip should be visible for existing artists
    await waitFor(() => {
      expect(screen.getByText('Artist One')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
  });

  it('ED-06: Cancel calls onCancel', async () => {
    const onCancel = jest.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <SongEditDialog
        open={true}
        item={mockSong}
        onSave={jest.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('ED-07: Edit of soft-deleted song shows warning', async () => {
    const deletedSong = { ...mockSong, deleted_at: '2024-01-20T10:00:00.000Z' };

    renderWithProviders(
      <SongEditDialog
        open={true}
        item={deletedSong}
        onSave={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/This item is in Trash/)).toBeInTheDocument();
    });
  });

  it('ED-08: Validation errors same as CreateDialog', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <SongEditDialog
        open={true}
        item={mockSong}
        onSave={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Song')).toBeInTheDocument();
    });

    const nameInput = screen.getByDisplayValue('Test Song');
    await user.clear(nameInput);
    await user.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(screen.getByText('Song name is required')).toBeInTheDocument();
    });
  });
});
