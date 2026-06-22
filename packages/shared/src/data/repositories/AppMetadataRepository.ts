/**
 * Typed key-value data access layer for the `app_metadata` table.
 *
 * Validates keys against a closed enumerated set of well-known keys.
 * Reads and writes values using parameterized SQL via the injected
 * `DatabaseConnection`. All methods are async.
 *
 * Lifecycle: The repository does NOT call `open()` or `close()` —
 * the caller manages the connection lifecycle.
 */

import type { DatabaseConnection } from '../database/DatabaseConnection.js';
import { DatabaseError } from '../database/DatabaseError.js';
import type { AppMetadataKey } from '../../domain/models/AppMetadataKey.js';
import { APP_METADATA_KEYS } from '../../domain/models/AppMetadataKey.js';

export class AppMetadataRepository {
  private readonly db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  async get(key: AppMetadataKey): Promise<string | null> {
    this.validateKey(key);

    const rows = await this.db.query<{ value: string }>(
      'SELECT value FROM app_metadata WHERE key = ?',
      [key],
    );

    return rows.length > 0 ? rows[0].value : null;
  }

  async set(key: AppMetadataKey, value: string): Promise<void> {
    this.validateKey(key);

    await this.db.execute(
      'INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?, ?)',
      [key, value],
    );
  }

  async getAll(): Promise<Partial<Record<AppMetadataKey, string>>> {
    const rows = await this.db.query<{ key: string; value: string }>(
      'SELECT key, value FROM app_metadata',
    );

    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result as Partial<Record<AppMetadataKey, string>>;
  }

  async has(key: AppMetadataKey): Promise<boolean> {
    this.validateKey(key);

    const rows = await this.db.query<{ one: number }>(
      'SELECT 1 AS one FROM app_metadata WHERE key = ?',
      [key],
    );

    return rows.length > 0;
  }

  private validateKey(key: string): asserts key is AppMetadataKey {
    if (!APP_METADATA_KEYS.includes(key as AppMetadataKey)) {
      throw new DatabaseError(
        `Unknown app_metadata key: '${key}'`,
      );
    }
  }
}
