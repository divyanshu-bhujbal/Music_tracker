/**
 * Well-known keys for the `app_settings` table.
 *
 * This is a closed key set — new keys are added via software updates,
 * not user input. The TypeScript type provides compile-time safety;
 * the runtime array enables validation against arbitrary string casts.
 *
 * Source: PROJECT_CONSTITUTION.md §14.1, 02_DATABASE_SCHEMA.md §3
 */

export type AppSettingsKey =
  | 'trash_retention_days'
  | 'theme'
  | 'default_view'
  | 'sync_on_startup'
  | 'auto_sync_delay_seconds';

export const APP_SETTINGS_KEYS: readonly AppSettingsKey[] = [
  'trash_retention_days',
  'theme',
  'default_view',
  'sync_on_startup',
  'auto_sync_delay_seconds',
];
