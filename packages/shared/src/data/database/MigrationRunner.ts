/**
 * Versioned database migration executor.
 *
 * Implements the Flyway/Liquibase pattern at the SQLite level.
 * Reads schema_version from app_metadata, discovers pending migrations,
 * executes each in a transaction, and updates the version atomically.
 *
 * Platform-agnostic: receives DatabaseConnection and Migration[] via
 * constructor injection. Zero platform imports, zero file I/O.
 */

/* eslint-disable no-console -- Migration strategy requires console logging (04_MIGRATION_STRATEGY.md §7) */

import type { DatabaseConnection } from './DatabaseConnection.js';
import { DatabaseError } from './DatabaseError.js';
import type { Migration, MigrationReport, MigrationResult } from './MigrationTypes.js';

export class MigrationRunner {
  private readonly db: DatabaseConnection;
  private readonly migrations: Migration[];

  constructor(db: DatabaseConnection, migrations: Migration[]) {
    this.db = db;
    this.migrations = migrations;
  }

  async run(): Promise<MigrationReport> {
    const startedAt = new Date().toISOString();

    // 1. Detect current schema version
    const currentVersion = await this.detectCurrentVersion();

    // 2. Filter pending migrations
    const pending = this.migrations
      .filter((m) => m.version > currentVersion)
      .sort((a, b) => a.version - b.version);

    // 3. Validate no version gaps
    this.validateNoGaps(currentVersion, pending);

    // 4. Execute pending migrations
    const results: MigrationResult[] = [];

    if (pending.length > 0) {
      console.log(
        `MigrationRunner: starting. Current schema version: ${currentVersion}. ` +
          `${pending.length} pending migration(s): versions [${pending.map((m) => m.version).join(', ')}]`,
      );
    } else {
      console.log(
        `MigrationRunner: database is up-to-date at version ${currentVersion}`,
      );
    }

    let lastCompletedVersion = currentVersion;

    for (const migration of pending) {
      const result = await this.executeMigration(migration);
      results.push(result);

      if (result.status === 'SUCCESS') {
        lastCompletedVersion = migration.version;
      } else {
        // Stop processing on failure
        break;
      }
    }

    // 5. Post-migration integrity checks
    const integrityCheck = await this.runIntegrityCheck();
    const foreignKeyCheck = await this.runForeignKeyCheck();

    const completedAt = new Date().toISOString();

    console.log(
      `MigrationRunner: completed. Version ${currentVersion} → ${lastCompletedVersion}`,
    );

    return {
      startedAt,
      completedAt,
      currentVersion,
      finalVersion: lastCompletedVersion,
      results,
      integrityCheck,
      foreignKeyCheck,
    };
  }

  private async detectCurrentVersion(): Promise<number> {
    try {
      const rows = await this.db.query<{ value: string }>(
        "SELECT value FROM app_metadata WHERE key = ?",
        ["schema_version"],
      );

      if (rows.length === 0) {
        throw new DatabaseError(
          'schema_version key not found in app_metadata. Database may be corrupt.',
        );
      }

      const value = rows[0].value;
      const version = parseInt(value, 10);

      if (isNaN(version)) {
        throw new DatabaseError(`Invalid schema_version value: '${value}'`);
      }

      return version;
    } catch (err) {
      if (err instanceof DatabaseError) {
        throw err;
      }
      // Table does not exist — fresh database
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('no such table')) {
        return 0;
      }
      throw err;
    }
  }

  private validateNoGaps(currentVersion: number, pending: Migration[]): void {
    if (pending.length === 0) return;

    const expected = currentVersion + 1;
    if (pending[0].version !== expected) {
      throw new DatabaseError(
        `Missing migration: version ${expected}`,
      );
    }

    for (let i = 1; i < pending.length; i++) {
      if (pending[i].version !== pending[i - 1].version + 1) {
        throw new DatabaseError(
          `Missing migration: version ${pending[i - 1].version + 1}`,
        );
      }
    }
  }

  private async executeMigration(
    migration: Migration,
  ): Promise<MigrationResult> {
    const startMs = performance.now();
    console.log(`MigrationRunner: executing migration ${migration.version}`);

    try {
      const statementsExecuted = await this.db.transaction(
        async (conn: DatabaseConnection) => {
          const statements = this.splitStatements(migration.sql);
          let count = 0;

          for (const stmt of statements) {
            if (this.isPragmaStatement(stmt)) {
              await conn.query(stmt);
            } else {
              await conn.execute(stmt);
            }
            count++;
          }

          // Version update is the LAST statement in the transaction
          await conn.execute(
            "UPDATE app_metadata SET value = ? WHERE key = 'schema_version'",
            [String(migration.version)],
          );

          return count;
        },
      );

      const durationMs = performance.now() - startMs;
      console.log(
        `MigrationRunner: migration ${migration.version} completed (${durationMs.toFixed(0)}ms, ${statementsExecuted} statements)`,
      );

      return {
        version: migration.version,
        status: 'SUCCESS',
        durationMs,
        statementsExecuted,
      };
    } catch (err) {
      const durationMs = performance.now() - startMs;
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(
        `MigrationRunner: migration ${migration.version} FAILED: ${errorMsg}`,
      );

      return {
        version: migration.version,
        status: 'FAILED',
        durationMs,
        error: errorMsg,
        statementsExecuted: 0,
      };
    }
  }

  private async runIntegrityCheck(): Promise<string> {
    try {
      const rows = await this.db.query<{ integrity_check: string }>(
        'PRAGMA integrity_check',
      );
      const value = rows[0]?.integrity_check ?? 'unknown';
      if (value !== 'ok') {
        console.warn(
          `MigrationRunner: PRAGMA integrity_check returned: "${value}"`,
        );
      }
      return value;
    } catch {
      return 'check failed';
    }
  }

  private async runForeignKeyCheck(): Promise<string> {
    try {
      const rows = await this.db.query<Record<string, unknown>>(
        'PRAGMA foreign_key_check',
      );
      if (rows.length > 0) {
        console.warn(
          `MigrationRunner: PRAGMA foreign_key_check found ${rows.length} violation(s)`,
        );
      }
      return rows.length > 0 ? JSON.stringify(rows) : '';
    } catch {
      return 'check failed';
    }
  }

  /**
   * Splits raw migration SQL content on semicolon separators.
   *
   * Handles:
   * - Simple semicolon-delimited SQL
   * - Multi-line statements
   * - Empty statements (blank lines, trailing semicolons)
   * - Semicolons inside single-quoted and double-quoted string literals
   * - SQL comments (-- to end of line) preserved as part of their statement
   */
  private splitStatements(sql: string): string[] {
    const statements: string[] = [];
    let current = '';
    let inSingleQuote = false;
    let inDoubleQuote = false;

    for (let i = 0; i < sql.length; i++) {
      const ch = sql[i];

      if (inSingleQuote) {
        current += ch;
        if (ch === "'" && sql[i + 1] !== "'") {
          inSingleQuote = false;
        }
        continue;
      }

      if (inDoubleQuote) {
        current += ch;
        if (ch === '"') {
          inDoubleQuote = false;
        }
        continue;
      }

      if (ch === "'") {
        inSingleQuote = true;
        current += ch;
        continue;
      }

      if (ch === '"') {
        inDoubleQuote = true;
        current += ch;
        continue;
      }

      if (ch === ';') {
        const trimmed = current.trim();
        if (trimmed.length > 0) {
          statements.push(trimmed);
        }
        current = '';
        continue;
      }

      current += ch;
    }

    // Handle trailing statement without semicolon
    const trimmed = current.trim();
    if (trimmed.length > 0) {
      statements.push(trimmed);
    }

    return statements;
  }

  /**
   * Checks if a trimmed SQL statement starts with PRAGMA (case-insensitive).
   */
  private isPragmaStatement(stmt: string): boolean {
    return stmt.trimStart().toUpperCase().startsWith('PRAGMA');
  }
}
