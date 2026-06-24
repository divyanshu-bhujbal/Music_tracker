/**
 * Typed data access layer for the `devices` table.
 *
 * Manages device registration and lifecycle for sync infrastructure.
 * Each device is registered with a UUID v4, a name, a platform
 * identifier, and registration/last-seen timestamps.
 *
 * Lifecycle: The repository does NOT call `open()` or `close()` —
 * the caller manages the connection lifecycle.
 */

import type { DatabaseConnection } from '../database/DatabaseConnection.js';
import type { Device, Platform } from '../../domain/models/Device.js';

export class DeviceRepository {
  private readonly db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  async register(name: string, platform: Platform): Promise<Device> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.db.execute(
      'INSERT INTO devices (id, name, platform, registered_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
      [id, name, platform, now, now],
    );

    return { id, name, platform, registered_at: now, last_seen_at: now };
  }

  async findById(id: string): Promise<Device | null> {
    const rows = await this.db.query<Device>(
      'SELECT * FROM devices WHERE id = ?',
      [id],
    );

    return rows.length > 0 ? rows[0] : null;
  }

  async findAll(): Promise<Device[]> {
    return this.db.query<Device>(
      'SELECT * FROM devices ORDER BY registered_at DESC',
    );
  }

  async updateLastSeen(id: string): Promise<void> {
    const now = new Date().toISOString();

    await this.db.execute(
      'UPDATE devices SET last_seen_at = ? WHERE id = ?',
      [now, id],
    );
  }

  async findByPlatform(platform: Platform): Promise<Device[]> {
    return this.db.query<Device>(
      'SELECT * FROM devices WHERE platform = ? ORDER BY registered_at DESC',
      [platform],
    );
  }

  async count(): Promise<number> {
    const rows = await this.db.query<{ count: number }>(
      'SELECT COUNT(*) AS count FROM devices',
    );

    return rows[0].count;
  }
}
