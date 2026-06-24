/**
 * Sync audit trail types for the `sync_log` table.
 *
 * Provides logging of sync events for diagnostics and UI display.
 * The sync lifecycle is: create (IN_PROGRESS) → markCompleted (SUCCESS/FAILURE).
 *
 * Source: PROJECT_CONSTITUTION.md §14.1, 02_DATABASE_SCHEMA.md §3
 */

export type SyncDirection = 'UPLOAD' | 'DOWNLOAD' | 'MERGE';

export type SyncStatus = 'SUCCESS' | 'FAILURE' | 'IN_PROGRESS';

export interface SyncLog {
  id: number;
  device_id: string;
  started_at: string;
  completed_at: string | null;
  direction: SyncDirection;
  status: SyncStatus;
  records_affected: number;
  error_message: string | null;
}

export interface CreateSyncLogInput {
  device_id: string;
  direction: SyncDirection;
}
