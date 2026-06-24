/**
 * Typed key-value data access layer for the `app_settings` table.
 *
 * Validates keys against a closed enumerated set of well-known keys.
 * Every write updates `updated_at` for Last-Write-Wins sync merging.
 * Reads and writes values using parameterized SQL via the injected
 * `DatabaseConnection`. All methods are async.
 *
 * Lifecycle: The repository does NOT call `open()` or `close()` —
 * the caller manages the connection lifecycle.
 */

import type { DatabaseConnection } from '../database/DatabaseConnection.js';
import { DatabaseError } from '../database/DatabaseError.js';
import type { AppSettingsKey } from '../../domain/models/AppSettingsKey.js';
import { APP_SETTINGS_KEYS } from '../../domain/models/AppSettingsKey.js';

export class AppSettingsRepository {
  private readonly db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  async get(key: AppSettingsKey): Promise<string | null> {
    this.validateKey(key);

    const rows = await this.db.query<{ value: string }>(
      'SELECT value FROM app_settings WHERE key = ?',
      [key],
    );

    return rows.length > 0 ? rows[0].value : null;
  }

  async set(key: AppSettingsKey, value: string): Promise<void> {
    this.validateKey(key);

    const updatedAt = new Date().toISOString();

    await this.db.execute(
      'INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)',
      [key, value, updatedAt],
    );
  }

  async getAll(): Promise<Partial<Record<AppSettingsKey, string>>> {
    const rows = await this.db.query<{ key: string; value: string }>(
      'SELECT key, value FROM app_settings',
    );

    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result as Partial<Record<AppSettingsKey, string>>;
  }

  async has(key: AppSettingsKey): Promise<boolean> {
    this.validateKey(key);

    const rows = await this.db.query<{ one: number }>(
      'SELECT 1 AS one FROM app_settings WHERE key = ?',
      [key],
    );

    return rows.length > 0;
  }

  private validateKey(key: string): asserts key is AppSettingsKey {
    if (!APP_SETTINGS_KEYS.includes(key as AppSettingsKey)) {
      throw new DatabaseError(
        `Unknown app_settings key: '${key}'`,
      );
    }
  }
}
