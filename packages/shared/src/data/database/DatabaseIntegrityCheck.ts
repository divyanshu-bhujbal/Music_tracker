/**
 * Standalone SQLite health check utility.
 *
 * Runs `PRAGMA integrity_check` + `PRAGMA foreign_key_check` on demand
 * and returns a structured report. Does NOT depend on cloud or sync —
 * pure local SQLite PRAGMAs.
 *
 * Distinct from MigrationRunner's post-migration check: that runs only
 * at startup after migrations. This is callable from Settings, Recovery,
 * or any diagnostic flow.
 */

import type { DatabaseConnection } from './DatabaseConnection.js';

export interface IntegrityReport {
  /** Whether the database is structurally healthy. */
  healthy: boolean;
  /** Raw PRAGMA integrity_check output (e.g., "ok" or error list). */
  integrityResult: string;
  /** Count of rows returned by PRAGMA foreign_key_check. */
  foreignKeyViolations: number;
  /** JSON string of violation rows, or "" if none. */
  foreignKeyDetails: string;
  /** ISO-8601 timestamp of when the check ran. */
  checkedAt: string;
}

export class DatabaseIntegrityCheck {
  private readonly db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  /**
   * Run SQLite integrity and foreign key checks.
   *
   * Both PRAGMAs are always executed — an early failure in integrity_check
   * does not skip foreign_key_check. Unexpected errors (DB closed, connection
   * error) are caught and reported as healthy: false.
   */
  async check(): Promise<IntegrityReport> {
    let integrityResult = '';
    let healthy = true;
    let checkError = false;

    // Run PRAGMA integrity_check
    try {
      const rows = await this.db.query<{ integrity_check: string }>(
        'PRAGMA integrity_check',
      );
      integrityResult = rows[0]?.integrity_check ?? 'unknown';
      if (integrityResult !== 'ok') {
        healthy = false;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      integrityResult = `check failed: ${msg}`;
      healthy = false;
      checkError = true;
    }

    // Run PRAGMA foreign_key_check (always, even if integrity failed)
    let foreignKeyViolations = 0;
    let foreignKeyDetails = '';

    try {
      const rows = await this.db.query<Record<string, unknown>>(
        'PRAGMA foreign_key_check',
      );
      if (rows.length > 0) {
        foreignKeyViolations = rows.length;
        foreignKeyDetails = JSON.stringify(rows);
        healthy = false;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      foreignKeyDetails = `check failed: ${msg}`;
      healthy = false;
      checkError = true;
    }

    const checkedAt = new Date().toISOString();

    if (healthy) {
      console.debug(
        `DatabaseIntegrityCheck: healthy — integrity_check='ok', FK violations=0`,
      );
    } else if (checkError) {
      console.error(
        `DatabaseIntegrityCheck: check failed — integrity_check='${integrityResult}', FK violations=${foreignKeyViolations}`,
      );
    } else {
      console.warn(
        `DatabaseIntegrityCheck: CORRUPT — integrity_check='${integrityResult}', FK violations=${foreignKeyViolations}`,
      );
    }

    return {
      healthy,
      integrityResult,
      foreignKeyViolations,
      foreignKeyDetails,
      checkedAt,
    };
  }
}
