import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import FilterListOffIcon from '@mui/icons-material/FilterListOff';

export interface FilterBarProps {
  /** All active column filters */
  columnFilters: Record<string, string[]>;
  /** Column key → display label */
  columnLabels: Record<string, string>;
  /** Remove a single filter value */
  onRemoveFilter: (columnKey: string, value: string) => void;
  /** Remove all values for a column */
  onRemoveColumn: (columnKey: string) => void;
  /** Clear all filters */
  onClearAll: () => void;
}

/**
 * Horizontal bar showing active filter chips with "Clear All" action (FR-SEARCH-06).
 * Hidden when columnFilters has zero entries.
 */
export function FilterBar({
  columnFilters,
  columnLabels,
  onRemoveFilter,
  onRemoveColumn,
  onClearAll,
}: FilterBarProps) {
  const entries = Object.entries(columnFilters);
  if (entries.length === 0) {
    return null;
  }

  const totalChips = entries.reduce((sum, [, values]) => sum + values.length, 0);

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 0.5,
        py: 0.5,
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
        Filters ({totalChips}):
      </Typography>

      {entries.map(([columnKey, values], colIndex) => (
        <Box key={columnKey} sx={{ display: 'contents' }}>
          {colIndex > 0 && (
            <Divider
              orientation="vertical"
              flexItem
              sx={{ mx: 0.5, alignSelf: 'center' }}
            />
          )}
          {values.map((value) => (
            <Chip
              key={`${columnKey}:${value}`}
              label={`${columnLabels[columnKey] ?? columnKey}: ${value}`}
              size="small"
              variant="outlined"
              onDelete={() => onRemoveFilter(columnKey, value)}
            />
          ))}
          {values.length > 1 && (
            <Chip
              label={`Clear ${columnLabels[columnKey] ?? columnKey}`}
              size="small"
              variant="outlined"
              color="error"
              onClick={() => onRemoveColumn(columnKey)}
              onDelete={() => onRemoveColumn(columnKey)}
            />
          )}
        </Box>
      ))}

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, alignSelf: 'center' }} />

      <Button
        size="small"
        variant="text"
        startIcon={<FilterListOffIcon />}
        onClick={onClearAll}
      >
        Clear All
      </Button>
    </Box>
  );
}
