import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';

export interface SelectionModeBarProps {
  selectionCount: number;
  onClear: () => void;
  onDeleteSelected: () => void;
}

export function SelectionModeBar({
  selectionCount,
  onClear,
  onDeleteSelected,
}: SelectionModeBarProps) {
  return (
    <Box
      sx={{
        position: 'sticky',
        bottom: 0,
        left: 0,
        right: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: 2,
        py: 1,
        bgcolor: 'primary.main',
        color: 'primary.contrastText',
        boxShadow: 3,
        zIndex: 10,
      }}
    >
      <Typography variant="body2" fontWeight={600}>
        {selectionCount} selected
      </Typography>
      <Box sx={{ flex: 1 }} />
      <Button
        variant="outlined"
        size="small"
        startIcon={<CloseIcon />}
        onClick={onClear}
        sx={{
          color: 'primary.contrastText',
          borderColor: 'rgba(255,255,255,0.5)',
          '&:hover': { borderColor: 'primary.contrastText', bgcolor: 'rgba(255,255,255,0.1)' },
        }}
      >
        Clear Selection
      </Button>
      <Button
        variant="contained"
        size="small"
        startIcon={<DeleteIcon />}
        onClick={onDeleteSelected}
        color="error"
      >
        Delete Selected
      </Button>
    </Box>
  );
}
