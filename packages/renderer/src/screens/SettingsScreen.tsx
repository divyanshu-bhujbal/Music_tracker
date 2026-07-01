/**
 * Settings screen — MUI form for user preferences.
 *
 * Renders interactive controls for each setting. Each control fires
 * SettingsManager.set() directly on change (immediate save pattern).
 * Shows success/error snackbar feedback.
 *
 * Source: E14 Implementation Specification §6.3
 */

import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import Slider from '@mui/material/Slider';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import type { AlertColor } from '@mui/material/Alert';
import { useServiceProvider } from '../ServiceProviderContext.js';
import type { AppSettingsKey } from '@collectio/shared';
import { AppSettingsRepository, SettingsManager, SETTINGS_SCHEMA } from '@collectio/shared';
import { useAppearanceStore, type ThemeMode } from '../stores/useAppearanceStore.js';

export function SettingsScreen() {
  const { db } = useServiceProvider();
  const setTheme = useAppearanceStore((s) => s.setTheme);

  const [manager, setManager] = useState<SettingsManager | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [theme, setThemeValue] = useState<ThemeMode>('light');
  const [defaultView, setDefaultView] = useState<'table' | 'tile'>('table');
  const [syncOnStartup, setSyncOnStartup] = useState(true);
  const [autoSyncDelay, setAutoSyncDelay] = useState(120);
  const [autoSyncDelayInput, setAutoSyncDelayInput] = useState('120');
  const [delayError, setDelayError] = useState<string | null>(null);

  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: AlertColor }>({
    open: false,
    message: '',
    severity: 'success',
  });

  // Initialize manager and load settings
  useEffect(() => {
    const repo = new AppSettingsRepository(db);
    const mgr = new SettingsManager(repo);
    setManager(mgr);

    mgr.getAll()
      .then((values) => {
        setThemeValue(values.theme);
        setDefaultView(values.default_view);
        setSyncOnStartup(values.sync_on_startup);
        setAutoSyncDelay(values.auto_sync_delay_seconds);
        setAutoSyncDelayInput(String(values.auto_sync_delay_seconds));
        // Initialize appearance store from DB
        setTheme(values.theme);
        setLoading(false);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to load settings';
        setError(msg);
        setLoading(false);
      });
  }, [db, setTheme]);

  const handleSave = useCallback(async (key: AppSettingsKey, value: unknown, successMsg: string) => {
    if (!manager) return;
    try {
      await manager.set(key, value);
      setSnackbar({ open: true, message: successMsg, severity: 'success' });
      console.debug(`SettingsScreen: saved '${key}' = '${String(value)}'`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setSnackbar({ open: true, message: msg, severity: 'error' });
      console.error(`SettingsScreen: failed to save '${key}': ${msg}`);
    }
  }, [manager]);

  const handleThemeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newTheme: ThemeMode = e.target.checked ? 'dark' : 'light';
    setThemeValue(newTheme);
    setTheme(newTheme);
    void handleSave('theme', newTheme, 'Theme updated');
  }, [handleSave, setTheme]);

  const handleDefaultViewChange = useCallback((e: { target: { value: string } }) => {
    const val = e.target.value as 'table' | 'tile';
    setDefaultView(val);
    void handleSave('default_view', val, 'Default view updated');
  }, [handleSave]);

  const handleSyncOnStartupChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.checked;
    setSyncOnStartup(val);
    void handleSave('sync_on_startup', val, val ? 'Sync on startup enabled. Changes take effect on next app launch.' : 'Sync on startup disabled. Changes take effect on next app launch.');
  }, [handleSave]);

  const validateDelay = useCallback((value: number): string | null => {
    if (Number.isNaN(value)) return 'Must be a number between 30 and 600.';
    if (value < 30 || value > 600) return 'Must be between 30 and 600.';
    return null;
  }, []);

  const handleDelayCommit = useCallback(() => {
    const num = Number(autoSyncDelayInput);
    const err = validateDelay(num);
    if (err) {
      setDelayError(err);
      return;
    }
    setDelayError(null);
    setAutoSyncDelay(num);
    void handleSave('auto_sync_delay_seconds', num, 'Auto-sync delay updated. Changes take effect on next app launch.');
  }, [autoSyncDelayInput, validateDelay, handleSave]);

  const handleDelayInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setAutoSyncDelayInput(e.target.value);
    const num = Number(e.target.value);
    if (!Number.isNaN(num)) {
      setDelayError(validateDelay(num));
    }
  }, [validateDelay]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Failed to load settings. Please restart the app. {error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 600 }}>
      <Typography variant="h5" gutterBottom>
        Settings
      </Typography>

      {/* Theme */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          {SETTINGS_SCHEMA.theme.label}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {SETTINGS_SCHEMA.theme.description}
        </Typography>
        <FormGroup>
          <FormControlLabel
            control={
              <Switch
                checked={theme === 'dark'}
                onChange={handleThemeChange}
                inputProps={{ 'aria-label': 'Theme toggle' }}
              />
            }
            label={theme === 'dark' ? 'Dark' : 'Light'}
          />
        </FormGroup>
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* Default View */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          {SETTINGS_SCHEMA.default_view.label}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {SETTINGS_SCHEMA.default_view.description}
        </Typography>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel id="default-view-label">Default View</InputLabel>
          <Select
            labelId="default-view-label"
            value={defaultView}
            label="Default View"
            onChange={handleDefaultViewChange}
          >
            <MenuItem value="table">Table</MenuItem>
            <MenuItem value="tile">Tile</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* Sync on Startup */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          {SETTINGS_SCHEMA.sync_on_startup.label}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {SETTINGS_SCHEMA.sync_on_startup.description}
        </Typography>
        <FormGroup>
          <FormControlLabel
            control={
              <Switch
                checked={syncOnStartup}
                onChange={handleSyncOnStartupChange}
                inputProps={{ 'aria-label': 'Sync on startup toggle' }}
              />
            }
            label={syncOnStartup ? 'On' : 'Off'}
          />
        </FormGroup>
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* Auto-Sync Delay */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          {SETTINGS_SCHEMA.auto_sync_delay_seconds.label}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {SETTINGS_SCHEMA.auto_sync_delay_seconds.description}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Slider
            value={autoSyncDelay}
            min={30}
            max={600}
            step={10}
            onChange={(_e, value) => {
              const num = value as number;
              setAutoSyncDelay(num);
              setAutoSyncDelayInput(String(num));
            }}
            onChangeCommitted={(_e, value) => {
              const num = value as number;
              setAutoSyncDelay(num);
              setAutoSyncDelayInput(String(num));
              void handleSave('auto_sync_delay_seconds', num, 'Auto-sync delay updated. Changes take effect on next app launch.');
            }}
            sx={{ flex: 1 }}
          />
          <TextField
            size="small"
            type="number"
            value={autoSyncDelayInput}
            onChange={handleDelayInputChange}
            onBlur={handleDelayCommit}
            error={delayError !== null}
            helperText={delayError}
            inputProps={{ min: 30, max: 600, 'aria-label': 'Auto-sync delay seconds' }}
            sx={{ width: 100 }}
          />
        </Box>
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* Trash Retention */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          {SETTINGS_SCHEMA.trash_retention_days.label}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {SETTINGS_SCHEMA.trash_retention_days.description}
        </Typography>
        <TextField
          size="small"
          value="Indefinite"
          disabled
          sx={{ width: 200 }}
          inputProps={{ readOnly: true }}
        />
      </Box>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
