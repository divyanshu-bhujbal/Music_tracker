import { useState, useEffect, useCallback } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Grid from '@mui/material/Grid';
import CircularProgress from '@mui/material/CircularProgress';
import type {
  DatabaseConnection,
  SongWithArtists,
  Artist,
  Language,
} from '@collectio/shared';
import { useUpdateSong, useLanguages, useArtists, getSongArtistRepo } from '../store/useSongsStore.js';
import { ArtistAutocomplete } from './ArtistAutocomplete.js';
import { LanguagePicker } from './LanguagePicker.js';

interface SongEditDialogProps {
  open: boolean;
  item: unknown;
  onSave: (item: unknown) => void;
  onCancel: () => void;
  db?: DatabaseConnection;
}

export function SongEditDialog({ open, item, onSave, onCancel }: SongEditDialogProps) {
  const songItem = item as SongWithArtists;
  const [name, setName] = useState('');
  const [albumName, setAlbumName] = useState('');
  const [artists, setArtists] = useState<Artist[]>([]);
  const [language, setLanguage] = useState<Language | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [originalArtistIds, setOriginalArtistIds] = useState<string[]>([]);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'error' | 'success' }>({
    open: false,
    message: '',
    severity: 'error',
  });

  const updateSong = useUpdateSong();
  const { data: languages = [] } = useLanguages();
  const { data: allArtists = [], isLoading: artistsLoading } = useArtists();

  useEffect(() => {
    if (open && songItem) {
      setName(songItem.name);
      setAlbumName(songItem.album_name ?? '');
      setLanguage(null);
      setErrors({});
      setIsLoading(true);
    }
  }, [open, songItem]);

  useEffect(() => {
    if (open && songItem && !artistsLoading) {
      const songArtists: Artist[] = songItem.artists.map((sa) => {
        const full = allArtists.find((a) => a.id === sa.id);
        return full ?? {
          id: sa.id,
          display_name: sa.display_name,
          created_at: '',
          updated_at: '',
          deleted_at: null,
        };
      });
      setArtists(songArtists);
      setOriginalArtistIds(songArtists.map((a) => a.id));
      setIsLoading(false);
    }
  }, [open, songItem, allArtists, artistsLoading]);

  useEffect(() => {
    if (open && songItem && languages.length > 0) {
      const lang = languages.find((l) => l.id === songItem.language_id);
      setLanguage(lang ?? null);
    }
  }, [open, songItem, languages]);

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) {
      newErrors.name = 'Song name is required';
    }
    if (artists.length === 0) {
      newErrors.artists = 'At least one artist is required';
    }
    if (!language) {
      newErrors.language = 'Language is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name, artists, language]);

  const handleSave = useCallback(async () => {
    if (!validate()) return;

    setIsSaving(true);
    try {
      await updateSong.mutateAsync({
        id: songItem.id,
        input: {
          name: name.trim(),
          album_name: albumName.trim() || null,
          language_id: language!.id,
        },
      });

      const newArtistIds = artists.map((a) => a.id);
      const removed = originalArtistIds.filter((id) => !newArtistIds.includes(id));
      const added = newArtistIds.filter((id) => !originalArtistIds.includes(id));

      const songArtistRepo = getSongArtistRepo();
      for (const artistId of removed) {
        await songArtistRepo.remove(songItem.id, artistId);
      }
      for (let i = 0; i < added.length; i++) {
        await songArtistRepo.add(songItem.id, added[i], i);
      }

      onSave({ ...songItem, name: name.trim(), album_name: albumName.trim() || null, language_id: language!.id });
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'Failed to update song',
        severity: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  }, [name, albumName, artists, language, validate, updateSong, songItem, originalArtistIds, onSave]);

  return (
    <>
      <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Song</DialogTitle>
        <DialogContent>
          {isLoading ? (
            <CircularProgress />
          ) : (
            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              <Grid item xs={12}>
                <TextField
                  label="Song Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  error={!!errors.name}
                  helperText={errors.name}
                  required
                  fullWidth
                  autoFocus
                />
              </Grid>
              <Grid item xs={12}>
                <ArtistAutocomplete value={artists} onChange={setArtists} />
                {errors.artists && (
                  <Alert severity="error" sx={{ mt: 1 }}>{errors.artists}</Alert>
                )}
              </Grid>
              <Grid item xs={12}>
                <LanguagePicker value={language} onChange={setLanguage} />
                {errors.language && (
                  <Alert severity="error" sx={{ mt: 1 }}>{errors.language}</Alert>
                )}
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Album Name (optional)"
                  value={albumName}
                  onChange={(e) => setAlbumName(e.target.value)}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12}>
                <Typography variant="caption" color="text.secondary">
                  Date Added: {new Date(songItem.added_at).toLocaleDateString()}
                </Typography>
              </Grid>
              {songItem.deleted_at && (
                <Grid item xs={12}>
                  <Alert severity="warning">This item is in Trash. Edit to restore it.</Alert>
                </Grid>
              )}
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancel} color="inherit">
            Cancel
          </Button>
          <Button onClick={handleSave} variant="contained" disabled={isSaving || isLoading}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}
