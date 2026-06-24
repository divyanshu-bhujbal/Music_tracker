/**
 * Typed data access layer for the `sync_log` table.
 *
 * Manages the insert-then-update lifecycle of sync event logging.
 * A log entry is created with status IN_PROGRESS, then updated to
 * SUCCESS or FAILURE when the sync operation completes.
 *
 * Lifecycle: The repository does NOT call `open()` or `close()` —
 * the caller manages the connection lifecycle.
 */

import type { DatabaseConnection } from '../database/DatabaseConnection.js';
import type {
  SyncLog,
  SyncStatus,
  CreateSyncLogInput,
} from '../../domain/models/SyncLog.js';

export class SyncLogRepository {
  private readonly db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  async findById(id: number): Promise<SyncLog | null> {
    const rows = await this.db.query<SyncLog>(
      'SELECT * FROM sync_log WHERE id = ?',
      [id],
    );

    return rows.length > 0 ? rows[0] : null;
  }

  async findByDeviceId(deviceId: string): Promise<SyncLog[]> {
    return this.db.query<SyncLog>(
      'SELECT * FROM sync_log WHERE device_id = ? ORDER BY started_at DESC',
      [deviceId],
    );
  }

  async findRecent(limit: number = 20): Promise<SyncLog[]> {
    return this.db.query<SyncLog>(
      'SELECT * FROM sync_log ORDER BY started_at DESC LIMIT ?',
      [limit],
    );
  }

  async create(input: CreateSyncLogInput): Promise<SyncLog> {
    const startedAt = new Date().toISOString();

    await this.db.execute(
      'INSERT INTO sync_log (device_id, started_at, completed_at, direction, status, records_affected, error_message) VALUES (?, ?, NULL, ?, ?, 0, NULL)',
      [input.device_id, startedAt, input.direction, 'IN_PROGRESS'],
    );

    const rows = await this.db.query<{ id: number }>(
      'SELECT last_insert_rowid() AS id',
    );
    const id = rows[0].id;

    return {
      id,
      device_id: input.device_id,
      started_at: startedAt,
      completed_at: null,
      direction: input.direction,
      status: 'IN_PROGRESS',
      records_affected: 0,
      error_message: null,
    };
  }

  async markCompleted(
    id: number,
    status: SyncStatus,
    recordsAffected: number,
    errorMessage?: string,
  ): Promise<void> {
    const completedAt = new Date().toISOString();

    await this.db.execute(
      'UPDATE sync_log SET status = ?, completed_at = ?, records_affected = ?, error_message = ? WHERE id = ?',
      [status, completedAt, recordsAffected, errorMessage ?? null, id],
    );
  }

  async count(): Promise<number> {
    const rows = await this.db.query<{ count: number }>(
      'SELECT COUNT(*) AS count FROM sync_log',
    );

    return rows[0].count;
  }
}
