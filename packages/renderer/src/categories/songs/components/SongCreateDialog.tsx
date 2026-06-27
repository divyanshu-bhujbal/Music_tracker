import { useState, useCallback } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Grid from '@mui/material/Grid';
import type { DatabaseConnection, Artist, Language, DuplicateCheckResult } from '@collectio/shared';
import { SongsCategory } from '../SongsCategory.js';
import { useCreateSong, getSongRepo, getSongArtistRepo } from '../store/useSongsStore.js';
import { ArtistAutocomplete } from './ArtistAutocomplete.js';
import { LanguagePicker } from './LanguagePicker.js';
import {
  DuplicateDetectionDialog,
  type DuplicateResolution,
} from './DuplicateDetectionDialog.js';

interface SongCreateDialogProps {
  open: boolean;
  onSave: (item: unknown) => void;
  onCancel: () => void;
  db: DatabaseConnection;
}

export function SongCreateDialog({ open, onSave, onCancel }: SongCreateDialogProps) {
  const [name, setName] = useState('');
  const [albumName, setAlbumName] = useState('');
  const [artists, setArtists] = useState<Artist[]>([]);
  const [language, setLanguage] = useState<Language | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateResults, setDuplicateResults] = useState<DuplicateCheckResult[]>([]);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'error' | 'success' }>({
    open: false,
    message: '',
    severity: 'error',
  });

  const createSong = useCreateSong();

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
      const artistIds = artists.map((a) => a.id);
      let results: DuplicateCheckResult[] = [];
      try {
        results = await SongsCategory.duplicateDetector({ name: name.trim(), artistIds });
      } catch {
        setSnackbar({
          open: true,
          message: 'Duplicate detection unavailable. Save anyway?',
          severity: 'error',
        });
        setIsSaving(false);
        return;
      }

      if (results.length > 0) {
        setDuplicateResults(results);
        setShowDuplicateDialog(true);
        setIsSaving(false);
        return;
      }

      const song = await createSong.mutateAsync({
        name: name.trim(),
        album_name: albumName.trim() || null,
        language_id: language!.id,
        artistIds,
      });
      onSave(song);
      resetForm();
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'Failed to save song',
        severity: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  }, [name, albumName, artists, language, validate, createSong, onSave]);

  const handleDuplicateResolve = useCallback(
    async (resolutions: DuplicateResolution[]) => {
      setShowDuplicateDialog(false);
      setIsSaving(true);
      try {
        const songRepo = getSongRepo();
        const songArtistRepo = getSongArtistRepo();

        for (const resolution of resolutions) {
          if (resolution.action === 'skip') continue;

          if (resolution.action === 'overwrite') {
            const existingSong = duplicateResults.find(
              (r) => (r.existingItem as { id: string }).id === resolution.existingSongId,
            )?.existingItem as { id: string } | undefined;
            if (existingSong) {
              await songRepo.update(existingSong.id, {
                name: name.trim(),
                album_name: albumName.trim() || null,
                language_id: language!.id,
              });
              const existingArtists = await songArtistRepo.findBySongId(existingSong.id);
              for (const ea of existingArtists) {
                await songArtistRepo.remove(existingSong.id, ea.artist_id);
              }
              for (let i = 0; i < artists.length; i++) {
                await songArtistRepo.add(existingSong.id, artists[i].id, i);
              }
            }
          } else if (resolution.action === 'create-separate') {
            // Save as new song (will be saved below)
          } else if (resolution.action === 'merge') {
            const existingSong = duplicateResults.find(
              (r) => (r.existingItem as { id: string }).id === resolution.existingSongId,
            )?.existingItem as { id: string } | undefined;
            if (existingSong) {
              const existingArtists = await songArtistRepo.findBySongId(existingSong.id);
              const existingIds = new Set(existingArtists.map((ea) => ea.artist_id));
              for (let i = 0; i < artists.length; i++) {
                if (!existingIds.has(artists[i].id)) {
                  await songArtistRepo.add(existingSong.id, artists[i].id, existingArtists.length + i);
                }
              }
            }
          }
        }

        // Save the new song
        const artistIds = artists.map((a) => a.id);
        const song = await createSong.mutateAsync({
          name: name.trim(),
          album_name: albumName.trim() || null,
          language_id: language!.id,
          artistIds,
        });
        onSave(song);
        resetForm();
      } catch (err) {
        setSnackbar({
          open: true,
          message: err instanceof Error ? err.message : 'Failed to save song',
          severity: 'error',
        });
      } finally {
        setIsSaving(false);
      }
    },
    [name, albumName, artists, language, createSong, onSave, duplicateResults],
  );

  const resetForm = () => {
    setName('');
    setAlbumName('');
    setArtists([]);
    setLanguage(null);
    setErrors({});
  };

  return (
    <>
      <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Song</DialogTitle>
        <DialogContent>
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
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancel} color="inherit">
            Cancel
          </Button>
          <Button onClick={handleSave} variant="contained" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <DuplicateDetectionDialog
        open={showDuplicateDialog}
        results={duplicateResults}
        onResolve={handleDuplicateResolve}
        onCancel={() => setShowDuplicateDialog(false)}
      />

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
