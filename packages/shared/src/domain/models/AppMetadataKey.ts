/**
 * Well-known keys for the `app_metadata` table.
 *
 * This is a closed key set — new keys are added via software updates,
 * not user input. The TypeScript type provides compile-time safety;
 * the runtime array enables validation against arbitrary string casts.
 *
 * Source: PROJECT_CONSTITUTION.md §14.1, 02_DATABASE_SCHEMA.md §3
 */

export type AppMetadataKey =
  | 'schema_version'
  | 'device_id'
  | 'kdf_salt'
  | 'initialized'
  | 'last_successful_sync'
  | 'cloud_file_id'
  | 'cloud_modified_time';

export const APP_METADATA_KEYS: readonly AppMetadataKey[] = [
  'schema_version',
  'device_id',
  'kdf_salt',
  'initialized',
  'last_successful_sync',
  'cloud_file_id',
  'cloud_modified_time',
];
