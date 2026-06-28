import type { DatabaseConnection } from '../../data/database/DatabaseConnection.js';

/**
 * Computes whether the local database has pending changes that need syncing.
 *
 * The dirty flag is computed at runtime by comparing the maximum `updated_at`
 * across all entity tables against the stored `last_successful_sync` timestamp
 * from `app_metadata`. It is never stored as a separate row.
 *
 * Entity tables are discovered automatically via `sqlite_master` introspection —
 * any table with an `updated_at` column is included. Adding a new category
 * (e.g., `books`) in a future migration automatically includes it.
 */
export class DirtyStateTracker {
  private entityTables: string[] | null = null;

  constructor(private readonly db: DatabaseConnection) {}

  /**
   * Returns `true` if the local database has changes newer than the last sync.
   *
   * Algorithm:
   * 1. Get `latestChange` via `getLatestChange()`
   * 2. If `null` → no records exist → not dirty (return `false`)
   * 3. Read `last_successful_sync` from `app_metadata`
   * 4. If `last_successful_sync` is `null` → dirty (return `true`)
   * 5. Compare: `latestChange > last_successful_sync`
   */
  async isDirty(): Promise<boolean> {
    const latestChange = await this.getLatestChange();

    if (latestChange === null) {
      console.debug('DirtyStateTracker: isDirty=false (no records)');
      return false;
    }

    const lastSync = await this.getLastSuccessfulSync();

    if (lastSync === null) {
      console.debug('DirtyStateTracker: isDirty=true (never synced)');
      return true;
    }

    const dirty = latestChange > lastSync;
    console.debug(
      `DirtyStateTracker: isDirty=${dirty} (latest=${latestChange}, lastSync=${lastSync})`,
    );
    return dirty;
  }

  /**
   * Returns the count of records across all entity tables where
   * `updated_at > last_successful_sync`.
   *
   * If `last_successful_sync` is null, counts all records (all pending first sync).
   */
  async getPendingCount(): Promise<number> {
    const tables = await this.getEntityTables();
    if (tables.length === 0) return 0;

    const lastSync = await this.getLastSuccessfulSync();

    let totalCount = 0;

    for (const table of tables) {
      if (lastSync === null) {
        const rows = await this.db.query<{ count: number }>(
          `SELECT COUNT(*) AS count FROM "${table}"`,
        );
        totalCount += rows[0]?.count ?? 0;
      } else {
        const rows = await this.db.query<{ count: number }>(
          `SELECT COUNT(*) AS count FROM "${table}" WHERE updated_at > ?`,
          [lastSync],
        );
        totalCount += rows[0]?.count ?? 0;
      }
    }

    return totalCount;
  }

  /**
   * Returns the ISO-8601 timestamp of the newest `updated_at` across all
   * entity tables, or `null` if no records exist.
   */
  async getLatestChange(): Promise<string | null> {
    const tables = await this.getEntityTables();
    if (tables.length === 0) return null;

    const subqueries = tables
      .map((t) => `SELECT MAX(updated_at) AS updated_at FROM "${t}"`)
      .join(' UNION ALL ');

    const rows = await this.db.query<{ updated_at: string | null }>(
      `SELECT MAX(updated_at) AS updated_at FROM (${subqueries})`,
    );

    return rows[0]?.updated_at ?? null;
  }

  /**
   * Discovers entity tables — tables with an `updated_at` column.
   * Cached after first call.
   */
  private async getEntityTables(): Promise<string[]> {
    if (this.entityTables !== null) return this.entityTables;

    const rows = await this.db.query<{ name: string }>(
      `SELECT m.name FROM sqlite_master m
       WHERE m.type = 'table'
       AND m.name NOT IN ('sqlite_sequence')
       AND EXISTS (SELECT 1 FROM pragma_table_info(m.name) WHERE name = 'updated_at')`,
    );

    this.entityTables = rows.map((r) => r.name);
    console.debug(
      `DirtyStateTracker: discovered ${this.entityTables.length} entity tables: [${this.entityTables.join(', ')}]`,
    );
    return this.entityTables;
  }

  /**
   * Reads `last_successful_sync` from `app_metadata`.
   */
  private async getLastSuccessfulSync(): Promise<string | null> {
    const rows = await this.db.query<{ value: string }>(
      `SELECT value FROM app_metadata WHERE key = 'last_successful_sync'`,
    );
    return rows.length > 0 ? rows[0].value : null;
  }
}
