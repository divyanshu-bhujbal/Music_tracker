import type { DatabaseConnection } from '../../data/database/DatabaseConnection.js';

/**
 * Schema metadata for a single entity table.
 */
export interface TableSchema {
  /** SQLite table name (e.g., "artists", "songs", "song_artists", "app_settings") */
  name: string;
  /** Primary key column names in order. Single column for entity tables
   *  (["id"]), multi-column for junction tables (["song_id", "artist_id"]). */
  primaryKeyColumns: string[];
}

/**
 * A set of changed rows for one table, including its schema.
 */
export interface EntityChanges {
  schema: TableSchema;
  /** Full rows as returned by SELECT *. Each row is a plain object with column
   *  names as keys. Includes all columns: id, name, updated_at, deleted_at, etc. */
  rows: Record<string, unknown>[];
}

/**
 * Complete change set keyed by table name.
 */
export type ChangeSet = Map<string, EntityChanges>;

/**
 * Identifies changed records in a database since a given point in time.
 *
 * Used by the sync engine to find local changes (from the device's SQLite DB)
 * and remote changes (from the decrypted cloud DB opened as an in-memory
 * SQLite connection).
 *
 * Entity tables are discovered automatically via `sqlite_master` introspection.
 * Primary key columns are discovered via `PRAGMA table_info`. Discovery runs
 * per call — no instance-level cache — so different DB connections (local vs.
 * in-memory merge copy) query their own schemas independently.
 */
export class ChangeTracker {
  constructor(private readonly db: DatabaseConnection) {}

  /**
   * Identify records changed locally since `lastSyncTime`.
   *
   * If `lastSyncTime` is `null` (never synced), returns ALL records
   * across all entity tables.
   */
  async getLocalChanges(lastSyncTime: string | null): Promise<ChangeSet> {
    return this.getChangesForDb(this.db, lastSyncTime, 'local');
  }

  /**
   * Identify records changed in the cloud (in-memory) database since `lastSyncTime`.
   *
   * Accepts a `DatabaseConnection` to the decrypted cloud DB — queries that
   * connection, not the constructor's local DB.
   */
  async getRemoteChanges(
    cloudDb: DatabaseConnection,
    lastSyncTime: string | null,
  ): Promise<ChangeSet> {
    return this.getChangesForDb(cloudDb, lastSyncTime, 'remote');
  }

  /**
   * Internal: query changed records from a given database connection.
   */
  private async getChangesForDb(
    db: DatabaseConnection,
    lastSyncTime: string | null,
    source: string,
  ): Promise<ChangeSet> {
    const schemas = await this.getTableSchemas(db);
    const changeSet: ChangeSet = new Map();
    let totalRows = 0;

    for (const [tableName, schema] of schemas) {
      let rows: Record<string, unknown>[];
      if (lastSyncTime === null) {
        rows = await db.query<Record<string, unknown>>(
          `SELECT * FROM "${tableName}"`,
        );
      } else {
        rows = await db.query<Record<string, unknown>>(
          `SELECT * FROM "${tableName}" WHERE updated_at > ?`,
          [lastSyncTime],
        );
      }

      if (rows.length > 0) {
        changeSet.set(tableName, { schema, rows });
        totalRows += rows.length;
      } else {
        // Include table with empty rows — schema is still useful
        changeSet.set(tableName, { schema, rows: [] });
      }
    }

    console.debug(
      `ChangeTracker: ${source} changes — ${schemas.size} tables with ${totalRows} rows (since ${lastSyncTime ?? 'beginning'})`,
    );
    return changeSet;
  }

  /**
   * Discovers entity tables and their PK columns via SQLite introspection.
   * Per-call discovery — no instance-level cache — so different DBs
   * (local vs. in-memory merge copy) are handled correctly.
   */
  private async getTableSchemas(
    db: DatabaseConnection,
  ): Promise<Map<string, TableSchema>> {
    const tableRows = await db.query<{ name: string }>(
      `SELECT m.name FROM sqlite_master m
       WHERE m.type = 'table'
       AND m.name NOT IN ('sqlite_sequence')
       AND EXISTS (SELECT 1 FROM pragma_table_info(m.name) WHERE name = 'updated_at')`,
    );

    const schemas = new Map<string, TableSchema>();

    for (const { name } of tableRows) {
      const pkRows = await db.query<{ name: string }>(
        `SELECT name FROM pragma_table_info('${name}') WHERE pk > 0 ORDER BY pk`,
      );
      const primaryKeyColumns = pkRows.map((r) => r.name);
      schemas.set(name, { name, primaryKeyColumns });
    }

    console.debug(
      `ChangeTracker: discovered ${schemas.size} entity tables: [${Array.from(schemas.keys()).join(', ')}]`,
    );
    return schemas;
  }
}
