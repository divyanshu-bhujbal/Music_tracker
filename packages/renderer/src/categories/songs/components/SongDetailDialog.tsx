import { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Box from '@mui/material/Box';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import type { SongWithArtists } from '@collectio/shared';
import { useDeleteSong, useLanguages } from '../store/useSongsStore.js';

interface SongDetailDialogProps {
  open: boolean;
  item: unknown;
  onClose: () => void;
  onEdit: (item: unknown) => void;
  onDelete: (id: string) => void;
}

export function SongDetailDialog({ open, item, onClose, onEdit, onDelete }: SongDetailDialogProps) {
  const song = item as SongWithArtists;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'error' | 'success' }>({
    open: false,
    message: '',
    severity: 'error',
  });

  const deleteSong = useDeleteSong();
  const { data: languages = [] } = useLanguages();

  const languageName = languages.find((l) => l.id === song.language_id)?.name ?? 'Unknown';

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteSong.mutateAsync(song.id);
      onDelete(song.id);
      setShowDeleteConfirm(false);
      onClose();
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'Failed to delete song',
        severity: 'error',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>Song Details</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">Song Name</Typography>
              <Typography variant="body1">{song.name}</Typography>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary">Album</Typography>
              <Typography variant="body1">{song.album_name ?? '—'}</Typography>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary">Artists</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                {song.artists.length > 0 ? (
                  song.artists.map((artist) => (
                    <Chip key={artist.id} label={artist.display_name} size="small" />
                  ))
                ) : (
                  <Typography variant="body2" color="text.secondary">No artists</Typography>
                )}
              </Box>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary">Language</Typography>
              <Typography variant="body1">{languageName}</Typography>
            </Box>

            <Divider />

            <Box>
              <Typography variant="caption" color="text.secondary">Date Added</Typography>
              <Typography variant="body1">
                {new Date(song.added_at).toLocaleDateString()}
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} color="inherit">
            Close
          </Button>
          <Button onClick={() => onEdit(song)} variant="outlined">
            Edit
          </Button>
          <Button
            onClick={() => setShowDeleteConfirm(true)}
            variant="outlined"
            color="error"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{song.name}"? This will move it to Trash.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDeleteConfirm(false)} color="inherit">
            Cancel
          </Button>
          <Button onClick={handleDelete} variant="contained" color="error" disabled={isDeleting}>
            {isDeleting ? 'Deleting...' : 'Delete'}
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
