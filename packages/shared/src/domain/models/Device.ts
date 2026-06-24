/**
 * Device entity for sync participant tracking.
 *
 * Every device that participates in synchronization is registered
 * with a UUID, a user-assigned or auto-generated name, a platform
 * identifier, and registration/last-seen timestamps.
 *
 * Source: PROJECT_CONSTITUTION.md §14.1, 02_DATABASE_SCHEMA.md §3
 */

export type Platform = 'ANDROID' | 'WINDOWS';

export interface Device {
  id: string;
  name: string;
  platform: Platform;
  registered_at: string;
  last_seen_at: string;
}
