import { useState, useCallback } from 'react';
import IconButton from '@mui/material/IconButton';
import Badge from '@mui/material/Badge';
import Popover from '@mui/material/Popover';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import FilterListIcon from '@mui/icons-material/FilterList';

export interface ColumnFilterPopoverProps {
  /** Column key matching ColumnDefinition.key */
  columnKey: string;
  /** Human-readable column label */
  columnLabel: string;
  /** Whether this column supports filtering */
  filterable: boolean;
  /** Unique values for this column (fetched externally) */
  values: string[];
  /** Currently selected filter values */
  selectedValues: string[];
  /** Emits on checkbox toggle */
  onChange: (columnKey: string, values: string[]) => void;
  /** Loading state for unique values */
  isLoading?: boolean;
  /** Error state from query failure */
  error?: Error | null;
}

/**
 * Per-column filter popover with multi-select checkboxes (FR-SEARCH-03).
 * Active filter indicator on the trigger icon (FR-SEARCH-05, T-08.5).
 * Returns null when filterable is false.
 */
export function ColumnFilterPopover({
  columnKey,
  columnLabel,
  filterable,
  values,
  selectedValues,
  onChange,
  isLoading = false,
  error = null,
}: ColumnFilterPopoverProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  const handleOpen = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      setAnchorEl(event.currentTarget);
    },
    [],
  );

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleToggle = useCallback(
    (value: string) => {
      const next = selectedValues.includes(value)
        ? selectedValues.filter((v) => v !== value)
        : [...selectedValues, value];
      onChange(columnKey, next);
    },
    [columnKey, selectedValues, onChange],
  );

  const handleSelectAll = useCallback(() => {
    onChange(columnKey, values);
  }, [columnKey, values, onChange]);

  const handleDeselectAll = useCallback(() => {
    onChange(columnKey, []);
  }, [columnKey, onChange]);

  if (!filterable) {
    return null;
  }

  const open = Boolean(anchorEl);
  const activeCount = selectedValues.length;

  return (
    <>
      <IconButton
        aria-label={`Filter ${columnLabel}`}
        size="small"
        onClick={handleOpen}
        color={activeCount > 0 ? 'primary' : 'default'}
      >
        <Badge
          badgeContent={activeCount}
          color="primary"
          invisible={activeCount === 0}
          max={99}
        >
          <FilterListIcon fontSize="small" />
        </Badge>
      </IconButton>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <Box sx={{ p: 1, minWidth: 180 }}>
          <Typography variant="subtitle2" sx={{ px: 1, pb: 0.5 }}>
            {columnLabel}
          </Typography>

          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={24} />
            </Box>
          ) : error ? (
            <Typography variant="body2" color="error" sx={{ py: 1, px: 1 }}>
              Failed to load values
            </Typography>
          ) : values.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 1, px: 1 }}>
              No values available
            </Typography>
          ) : (
            <>
              <Box sx={{ display: 'flex', gap: 1, pb: 0.5 }}>
                <Button size="small" onClick={handleSelectAll}>
                  Select All
                </Button>
                <Button size="small" onClick={handleDeselectAll}>
                  Deselect All
                </Button>
              </Box>
              <Divider sx={{ mb: 0.5 }} />
              <FormGroup>
                {values.map((value) => (
                  <FormControlLabel
                    key={value}
                    control={
                      <Checkbox
                        size="small"
                        checked={selectedValues.includes(value)}
                        onChange={() => handleToggle(value)}
                      />
                    }
                    label={value}
                  />
                ))}
              </FormGroup>
            </>
          )}
        </Box>
      </Popover>
    </>
  );
}
