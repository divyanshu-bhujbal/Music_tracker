/**
 * Settings defaults, allowed values, and validation schemas.
 *
 * Single source of truth for every setting's default value, type, allowed values,
 * and validation rules. Consumed by SettingsManager and SettingsScreen.
 *
 * Source: E14 Implementation Specification §6.2
 */

import type { AppSettingsKey } from '../../domain/models/AppSettingsKey.js';

export interface SettingSchema {
  type: 'string' | 'boolean' | 'number';
  allowedValues?: readonly string[];
  min?: number;
  max?: number;
  label: string;
  description: string;
}

/**
 * Default string values for every settings key.
 * Used when a key is not stored in `app_settings`.
 */
export const SETTINGS_DEFAULTS: Record<AppSettingsKey, string> = {
  theme: 'light',
  default_view: 'table',
  sync_on_startup: 'true',
  auto_sync_delay_seconds: '120',
  trash_retention_days: '-1',
};

/**
 * Validation and schema metadata for every settings key.
 */
export const SETTINGS_SCHEMA: Record<AppSettingsKey, SettingSchema> = {
  theme: {
    type: 'string',
    allowedValues: ['light', 'dark'],
    label: 'Theme',
    description: 'Switch between light and dark mode.',
  },
  default_view: {
    type: 'string',
    allowedValues: ['table', 'tile'],
    label: 'Default View',
    description: 'Choose the default view when opening a category.',
  },
  sync_on_startup: {
    type: 'boolean',
    label: 'Sync on Startup',
    description: 'Automatically sync when the app launches. Changes take effect on next app launch.',
  },
  auto_sync_delay_seconds: {
    type: 'number',
    min: 30,
    max: 600,
    label: 'Auto-Sync Delay',
    description: 'Seconds of inactivity before auto-sync triggers (30–600). Changes take effect on next app launch.',
  },
  trash_retention_days: {
    type: 'number',
    label: 'Trash Retention',
    description: 'Deleted items are kept indefinitely. Automatic purge is not available in this version.',
  },
};
