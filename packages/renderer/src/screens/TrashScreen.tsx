import { useState, useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import Table from '@mui/material/Table';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RestoreFromTrashIcon from '@mui/icons-material/RestoreFromTrash';
import { useDeletedSongs, useRestoreSong, useLanguages } from '../categories/songs/store/useSongsStore.js';

const COLUMN_TEMPLATE = '3fr 2fr 2fr 120px 130px 100px';

export function TrashScreen() {
  const { data: deletedSongs = [], isLoading, error } = useDeletedSongs();
  const { data: languages = [] } = useLanguages();
  const restoreSong = useRestoreSong();
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const languageMap = new Map(languages.map((l) => [l.id, l.name]));

  const handleRestore = useCallback(async (id: string) => {
    setRestoringId(id);
    try {
      await restoreSong.mutateAsync(id);
      setSnackbar({ open: true, message: 'Song restored', severity: 'success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to restore song';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setRestoringId(null);
    }
  }, [restoreSong]);

  const virtualizer = useVirtualizer({
    count: deletedSongs.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 48,
    overscan: 5,
  });

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">{error.message}</Alert>
      </Box>
    );
  }

  if (deletedSongs.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          gap: 1,
        }}
      >
        <DeleteOutlineIcon sx={{ fontSize: 48, color: 'text.secondary' }} />
        <Typography variant="h6" color="text.secondary">
          Trash is empty
        </Typography>
      </Box>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box
        sx={{
          px: 2,
          py: 1,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="h6">
          Trash ({deletedSongs.length})
        </Typography>
      </Box>

      <Box ref={tableContainerRef} sx={{ flex: 1, overflow: 'auto' }}>
        <Table size="small" sx={{ tableLayout: 'fixed' }}>
          <TableHead>
            <TableRow sx={{ display: 'grid', gridTemplateColumns: COLUMN_TEMPLATE }}>
              <TableCell>Song Name</TableCell>
              <TableCell>Artist(s)</TableCell>
              <TableCell>Album</TableCell>
              <TableCell sx={{ width: 120 }}>Language</TableCell>
              <TableCell sx={{ width: 130 }}>Date Deleted</TableCell>
              <TableCell sx={{ width: 100 }} align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
        </Table>

        <Box sx={{ position: 'relative', height: virtualizer.getTotalSize() }}>
          {virtualItems.map((virtualRow) => {
            const song = deletedSongs[virtualRow.index];
            return (
              <Box
                key={song.id}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: COLUMN_TEMPLATE,
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  borderBottom: 1,
                  borderColor: 'divider',
                  alignItems: 'center',
                  minHeight: 48,
                  px: 2,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <Typography variant="body2" noWrap>{song.name}</Typography>
                <Typography variant="body2" noWrap>
                  {song.artists.map((a) => a.display_name).join(', ') || '\u2014'}
                </Typography>
                <Typography variant="body2" noWrap>
                  {song.album_name ?? '\u2014'}
                </Typography>
                <Typography variant="body2" noWrap>
                  {languageMap.get(song.language_id) ?? '\u2014'}
                </Typography>
                <Typography variant="body2" noWrap>
                  {song.deleted_at
                    ? new Date(song.deleted_at).toLocaleDateString()
                    : '\u2014'}
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                  {restoringId === song.id ? (
                    <CircularProgress size={20} />
                  ) : (
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<RestoreFromTrashIcon />}
                      onClick={() => handleRestore(song.id)}
                    >
                      Restore
                    </Button>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
