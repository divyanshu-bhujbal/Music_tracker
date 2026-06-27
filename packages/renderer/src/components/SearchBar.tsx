import { useCallback } from 'react';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';

export interface SearchBarProps {
  /** Current search text (controlled) */
  value: string;
  /** Fires on every keystroke (no internal debounce) */
  onChange: (value: string) => void;
  /** Placeholder text (default: "Search...") */
  placeholder?: string;
  /** Disabled when no category has searchFields */
  disabled?: boolean;
}

/**
 * Global search input bar (FR-SEARCH-01).
 * Controlled MUI TextField with search icon and clear button.
 * Fires onChange on each keystroke — debouncing is a consumer concern (E15).
 */
export function SearchBar({
  value,
  onChange,
  placeholder = 'Search...',
  disabled = false,
}: SearchBarProps) {
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange(event.target.value);
    },
    [onChange],
  );

  const handleClear = useCallback(() => {
    onChange('');
  }, [onChange]);

  return (
    <TextField
      type="search"
      fullWidth
      size="small"
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
          endAdornment: value.length > 0 ? (
            <InputAdornment position="end">
              <IconButton
                aria-label="clear search"
                size="small"
                onClick={handleClear}
                edge="end"
              >
                <ClearIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ) : undefined,
        },
      }}
    />
  );
}
