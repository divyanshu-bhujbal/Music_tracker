import { useState, useCallback } from 'react';
import Autocomplete, { createFilterOptions } from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import { useArtists, useCreateArtist } from '../store/useSongsStore.js';
import type { Artist } from '@collectio/shared';
import type { DatabaseConnection } from '@collectio/shared';

interface ArtistAutocompleteProps {
  value: Artist[];
  onChange: (artists: Artist[]) => void;
  /** Database connection (optional — the store must already be configured via configureSongsStore) */
  db?: DatabaseConnection;
}

const filter = createFilterOptions<string>();

export function ArtistAutocomplete({ value, onChange }: ArtistAutocompleteProps) {
  const [inputValue, setInputValue] = useState('');
  const { data: artists = [], isLoading, error } = useArtists(inputValue);
  const createArtist = useCreateArtist();

  const handleChange = useCallback(
    async (_event: unknown, newValue: (string | Artist)[]) => {
      const result: Artist[] = [];
      for (const item of newValue) {
        if (typeof item === 'string') {
          // User typed a new artist name
          const created = await createArtist.mutateAsync(item);
          result.push(created);
        } else {
          // Existing artist selected
          result.push(item);
        }
      }
      onChange(result);
    },
    [onChange, createArtist],
  );

  if (error) {
    return <Alert severity="error">Failed to load artists</Alert>;
  }

  return (
    <Autocomplete
      multiple
      freeSolo
      options={artists.map((a) => a.display_name)}
      value={value.map((a) => a.display_name)}
      onChange={handleChange}
      inputValue={inputValue}
      onInputChange={(_event, newInputValue) => {
        setInputValue(newInputValue);
      }}
      filterOptions={(options, params) => {
        const filtered = filter(options, params);

        const { inputValue: val } = params;
        const isExisting = options.some((option) => option === val);
        if (val !== '' && !isExisting) {
          filtered.push(`Create "${val}"`);
        }

        return filtered;
      }}
      renderTags={(tagValue, getTagProps) =>
        tagValue.map((option, index) => {
          const { key, ...tagProps } = getTagProps({ index });
          return <Chip key={key} label={option} size="small" {...tagProps} />;
        })
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label="Artists"
          required
          fullWidth
          placeholder="Search or create artists..."
          slotProps={{
            input: {
              ...params.InputProps,
              endAdornment: (
                <>
                  {isLoading ? <CircularProgress color="inherit" size={20} /> : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            },
          }}
        />
      )}
    />
  );
}
