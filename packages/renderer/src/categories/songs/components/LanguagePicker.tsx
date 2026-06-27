import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import { useLanguages } from '../store/useSongsStore.js';
import type { Language } from '@collectio/shared';
import type { DatabaseConnection } from '@collectio/shared';

interface LanguagePickerProps {
  value: Language | null;
  onChange: (language: Language | null) => void;
  /** Database connection (optional — the store must already be configured via configureSongsStore) */
  db?: DatabaseConnection;
}

export function LanguagePicker({ value, onChange }: LanguagePickerProps) {
  const { data: languages = [], isLoading, error } = useLanguages();

  if (error) {
    return <Alert severity="error">Failed to load languages</Alert>;
  }

  return (
    <Autocomplete
      options={languages}
      value={value}
      onChange={(_event, newValue) => {
        onChange(newValue);
      }}
      getOptionLabel={(option) => option.name}
      isOptionEqualToValue={(option, val) => option.id === val.id}
      loading={isLoading}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Language"
          required
          fullWidth
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
      renderOption={(props, option) => (
        <li {...props} key={option.id}>
          <Typography variant="body2" component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {option.name}
            {option.user_added === 1 && (
              <Chip label="User Added" size="small" color="secondary" variant="outlined" />
            )}
          </Typography>
        </li>
      )}
      renderTags={(value, getTagProps) =>
        value.map((option, index) => {
          const { key, ...tagProps } = getTagProps({ index });
          return (
            <Chip
              key={key}
              label={option.name}
              size="small"
              {...tagProps}
            />
          );
        })
      }
    />
  );
}
