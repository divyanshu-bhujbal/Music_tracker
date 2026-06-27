import { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import Divider from '@mui/material/Divider';
import Box from '@mui/material/Box';
import type { DuplicateCheckResult, Song } from '@collectio/shared';

export interface DuplicateResolution {
  existingSongId: string;
  action: 'overwrite' | 'skip' | 'merge' | 'create-separate';
}

interface DuplicateDetectionDialogProps {
  open: boolean;
  results: DuplicateCheckResult[];
  onResolve: (actions: DuplicateResolution[]) => void;
  onCancel: () => void;
}

export function DuplicateDetectionDialog({
  open,
  results,
  onResolve,
  onCancel,
}: DuplicateDetectionDialogProps) {
  const [resolutions, setResolutions] = useState<Map<string, DuplicateResolution>>(
    new Map(),
  );

  const handleResolutionChange = (
    existingSongId: string,
    action: DuplicateResolution['action'],
  ) => {
    setResolutions((prev) => {
      const next = new Map(prev);
      next.set(existingSongId, { existingSongId, action });
      return next;
    });
  };

  const handleApply = () => {
    onResolve(Array.from(resolutions.values()));
  };

  const allResolved = results.every((r) => {
    const existing = r.existingItem as Song;
    return resolutions.has(existing.id);
  });

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Duplicate Songs Found</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The following songs have similar names. Please choose how to handle each duplicate.
        </Typography>
        {results.map((result, index) => {
          const existing = result.existingItem as Song;
          const resolution = resolutions.get(existing.id);
          const isExact = result.type === 'exact';

          return (
            <Box key={existing.id} sx={{ mb: 2 }}>
              {index > 0 && <Divider sx={{ mb: 2 }} />}
              <Typography variant="subtitle2" gutterBottom>
                {existing.name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {isExact ? 'Exact match' : 'Partial match'} — Album: {existing.album_name ?? 'None'}
              </Typography>
              <RadioGroup
                row
                value={resolution?.action ?? ''}
                onChange={(e) => {
                  handleResolutionChange(
                    existing.id,
                    e.target.value as DuplicateResolution['action'],
                  );
                }}
                sx={{ mt: 1 }}
              >
                {result.resolutionOptions.map((option) => {
                  let actionValue: DuplicateResolution['action'];
                  if (option === 'Overwrite Existing') actionValue = 'overwrite';
                  else if (option === 'Skip Creation') actionValue = 'skip';
                  else if (option === 'Merge Artists onto Existing Song') actionValue = 'merge';
                  else actionValue = 'create-separate';

                  return (
                    <FormControlLabel
                      key={option}
                      value={actionValue}
                      control={<Radio size="small" />}
                      label={option}
                    />
                  );
                })}
              </RadioGroup>
            </Box>
          );
        })}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} color="inherit">
          Cancel
        </Button>
        <Button onClick={handleApply} variant="contained" disabled={!allResolved}>
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
}
