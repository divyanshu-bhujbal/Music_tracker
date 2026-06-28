import type { DatabaseConnection } from '../../data/database/DatabaseConnection.js';
import type { ChangeSet } from './ChangeTracker.js';

/**
 * Result of an LWW merge operation.
 */
export interface MergeResult {
  /** Winning records grouped by table name. Each entry includes the schema
   *  and the winning rows. These are the records that should be applied
   *  to the merged database. */
  winners: ChangeSet;
  /** Number of records present in both local and remote (conflicts resolved by LWW). */
  conflictsResolved: number;
  /** Number of records present only in local changes (new local creations). */
  newLocalOnly: number;
  /** Number of records present only in remote changes (new remote creations). */
  newRemoteOnly: number;
  /** Total number of winning records across all tables. */
  totalRecordsAffected: number;
}

/**
 * Result of orphaned FK resolution.
 */
export interface OrphanReport {
  /** Number of orphaned records found and resolved. */
  orphansFound: number;
  /** Human-readable details for sync_log error_message.
   *  Each string describes one orphan resolution. */
  details: string[];
}

/** Tables that are infrastructure or reference — not checked for FK orphans. */
const IGNORED_FK_TABLES = new Set([
  'app_metadata',
  'devices',
  'sync_log',
  'languages',
  'categories',
]);

/**
 * Applies the Last-Write-Wins (LWW) merge algorithm to resolve conflicts
 * between local and remote change sets. After merge, detects and resolves
 * orphaned foreign key references.
 *
 * `resolve()` is a pure function — no database access.
 * `resolveOrphans()` accepts a `DatabaseConnection` parameter for FK scanning.
 */
export class ConflictResolver {
  /**
   * Pure computation. Takes local and remote change sets; returns winning
   * records + statistics. No DB access.
   */
  resolve(localChanges: ChangeSet, remoteChanges: ChangeSet): MergeResult {
    console.debug(
      `ConflictResolver: merging ${localChanges.size} local tables, ${remoteChanges.size} remote tables`,
    );

    const allTableNames = new Set([
      ...localChanges.keys(),
      ...remoteChanges.keys(),
    ]);

    const winners: ChangeSet = new Map();
    let conflictsResolved = 0;
    let newLocalOnly = 0;
    let newRemoteOnly = 0;
    let totalRecordsAffected = 0;

    for (const tableName of allTableNames) {
      const local = localChanges.get(tableName);
      const remote = remoteChanges.get(tableName);

      // Use schema from whichever side has it; prefer local
      const schema = local?.schema ?? remote?.schema;
      if (!schema) continue;

      if (schema.primaryKeyColumns.length === 0) {
        console.error(
          `ConflictResolver: table ${tableName} has no primary key columns — cannot merge`,
        );
        continue;
      }

      const localRows = local?.rows ?? [];
      const remoteRows = remote?.rows ?? [];

      const localMap = this.indexByPk(localRows, schema.primaryKeyColumns);
      const remoteMap = this.indexByPk(remoteRows, schema.primaryKeyColumns);

      const allPks = new Set([...localMap.keys(), ...remoteMap.keys()]);

      const tableWinners: Record<string, unknown>[] = [];

      for (const pkKey of allPks) {
        const localRow = localMap.get(pkKey);
        const remoteRow = remoteMap.get(pkKey);

        let winner: Record<string, unknown>;

        if (localRow && remoteRow) {
          // Both exist — LWW comparison
          const localTs = this.getTimestamp(localRow);
          const remoteTs = this.getTimestamp(remoteRow);

          if (localTs > remoteTs) {
            winner = localRow;
          } else if (remoteTs > localTs) {
            winner = remoteRow;
          } else {
            // Equal timestamps — deterministic tiebreak: local wins
            winner = localRow;
            console.debug(
              `ConflictResolver: tiebreak on ${tableName}.${pkKey} — equal timestamps (${localTs}), local wins`,
            );
          }
          conflictsResolved++;
        } else if (localRow) {
          winner = localRow;
          newLocalOnly++;
        } else {
          winner = remoteRow!;
          newRemoteOnly++;
        }

        tableWinners.push(winner);
        totalRecordsAffected++;
      }

      if (tableWinners.length > 0) {
        winners.set(tableName, { schema, rows: tableWinners });
      }
    }

    console.info(
      `ConflictResolver: merge complete — ${conflictsResolved} conflicts, ${newLocalOnly} local-only, ${newRemoteOnly} remote-only, ${totalRecordsAffected} total`,
    );

    return {
      winners,
      conflictsResolved,
      newLocalOnly,
      newRemoteOnly,
      totalRecordsAffected,
    };
  }

  /**
   * Query the given database for orphaned FK references.
   * Must be called AFTER winners have been applied.
   *
   * Discovers FK relationships dynamically via `PRAGMA foreign_key_list`.
   * Filters out infrastructure/reference table FKs.
   */
  async resolveOrphans(db: DatabaseConnection): Promise<OrphanReport> {
    const details: string[] = [];
    let orphansFound = 0;

    // Discover entity tables (tables with updated_at)
    const entityTableRows = await db.query<{ name: string }>(
      `SELECT m.name FROM sqlite_master m
       WHERE m.type = 'table'
       AND m.name NOT IN ('sqlite_sequence')
       AND EXISTS (SELECT 1 FROM pragma_table_info(m.name) WHERE name = 'updated_at')`,
    );
    const entityTables = new Set(entityTableRows.map((r) => r.name));

    // For each entity table, discover FK relationships
    for (const tableName of entityTables) {
      const fkRows = await db.query<{
        id: number;
        seq: number;
        table: string;
        from: string;
        to: string;
      }>(`PRAGMA foreign_key_list("${tableName}")`);

      for (const fk of fkRows) {
        const toTable = fk.table;

        // Skip FKs to infrastructure/reference tables
        if (IGNORED_FK_TABLES.has(toTable)) continue;

        // Check if the referenced table is an entity table (has updated_at)
        // If not, skip (e.g., future reference tables)
        if (!entityTables.has(toTable)) continue;

        // Check if toTable has deleted_at column
        const toTableInfo = await db.query<{ name: string }>(
          `SELECT name FROM pragma_table_info("${toTable}") WHERE name = 'deleted_at'`,
        );
        const toTableHasDeletedAt = toTableInfo.length > 0;

        // Find orphaned rows
        let orphanRows: Record<string, unknown>[];
        if (toTableHasDeletedAt) {
          // Find rows where referenced record is soft-deleted
          orphanRows = await db.query<Record<string, unknown>>(
            `SELECT "${tableName}".* FROM "${tableName}"
             LEFT JOIN "${toTable}" ON "${tableName}"."${fk.from}" = "${toTable}"."${fk.to}"
             WHERE "${toTable}"."${fk.to}" IS NULL
                OR ("${toTable}"."deleted_at" IS NOT NULL
                    AND "${tableName}"."${fk.from}" = "${toTable}"."${fk.to}")`,
          );
        } else {
          // Find rows where referenced record doesn't exist at all
          orphanRows = await db.query<Record<string, unknown>>(
            `SELECT "${tableName}".* FROM "${tableName}"
             LEFT JOIN "${toTable}" ON "${tableName}"."${fk.from}" = "${toTable}"."${fk.to}"
             WHERE "${toTable}"."${fk.to}" IS NULL`,
          );
        }

        if (orphanRows.length === 0) continue;

        // Check if fromTable has deleted_at column
        const fromTableInfo = await db.query<{ name: string }>(
          `SELECT name FROM pragma_table_info("${tableName}") WHERE name = 'deleted_at'`,
        );
        const fromTableHasDeletedAt = fromTableInfo.length > 0;

        const now = new Date().toISOString();

        for (const orphanRow of orphanRows) {
          // Build PK key for logging
          const pkParts: string[] = [];
          const pkInfo = await db.query<{ name: string }>(
            `SELECT name FROM pragma_table_info("${tableName}") WHERE pk > 0 ORDER BY pk`,
          );
          for (const pk of pkInfo) {
            pkParts.push(`${pk.name}=${orphanRow[pk.name]}`);
          }
          const pkStr = pkParts.join(', ');

          if (fromTableHasDeletedAt) {
            // Soft-delete the orphan
            const pkCols = pkInfo.map((r) => r.name);
            const whereClause = pkCols.map((c) => `"${c}" = ?`).join(' AND ');
            const pkValues = pkCols.map((c) => orphanRow[c]);

            await db.execute(
              `UPDATE "${tableName}" SET deleted_at = ? WHERE ${whereClause}`,
              [now, ...pkValues],
            );
            details.push(
              `${tableName}(${pkStr}): referenced ${toTable} record soft-deleted — orphan soft-deleted`,
            );
          } else {
            // Hard-delete junction row
            const pkCols = pkInfo.map((r) => r.name);
            const whereClause = pkCols.map((c) => `"${c}" = ?`).join(' AND ');
            const pkValues = pkCols.map((c) => orphanRow[c]);

            await db.execute(
              `DELETE FROM "${tableName}" WHERE ${whereClause}`,
              pkValues,
            );
            details.push(
              `${tableName}(${pkStr}): referenced ${toTable} record soft-deleted — junction row deleted`,
            );
          }

          orphansFound++;
        }
      }
    }

    if (orphansFound > 0) {
      console.info(
        `ConflictResolver: resolved ${orphansFound} orphaned FK references`,
      );
    }

    return { orphansFound, details };
  }

  /**
   * Build a composite PK key string from a row.
   * Keys are joined with "|" for deterministic ordering.
   */
  private indexByPk(
    rows: Record<string, unknown>[],
    pkColumns: string[],
  ): Map<string, Record<string, unknown>> {
    const map = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      const key = pkColumns.map((col) => String(row[col])).join('|');
      map.set(key, row);
    }
    return map;
  }

  /**
   * Extract the updated_at timestamp from a row.
   * Returns epoch 0 string if null/undefined.
   */
  private getTimestamp(row: Record<string, unknown>): string {
    const ts = row.updated_at;
    if (ts === null || ts === undefined) {
      console.warn(
        'ConflictResolver: row has null updated_at — treating as epoch 0',
      );
      return '1970-01-01T00:00:00.000Z';
    }
    return String(ts);
  }
}
