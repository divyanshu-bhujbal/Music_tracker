/**
 * Type definitions for the versioned migration system.
 *
 * MigrationRunner consumes Migration[] and produces MigrationReport.
 * All types are pure data — no runtime code, no platform imports.
 */

/**
 * Status of an individual migration execution.
 *
 * - PENDING: Not yet attempted (e.g., skipped due to earlier failure)
 * - SUCCESS: Migration executed and committed successfully
 * - FAILED: Migration execution failed; transaction rolled back
 * - SKIPPED: Migration was not needed (version <= currentVersion)
 */
export type MigrationStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';

/**
 * A single migration definition.
 *
 * The caller loads .sql file content and pairs it with the version number.
 * MigrationRunner does not perform file I/O.
 */
export interface Migration {
  /** Integer migration version (1, 2, 3...). Must be unique and sequential. */
  version: number;
  /** Raw content of the .sql migration file. May contain multiple statements separated by semicolons. */
  sql: string;
}

/**
 * Outcome of a single migration execution.
 */
export interface MigrationResult {
  /** Migration version that was attempted. */
  version: number;
  /** Final status of this migration. */
  status: MigrationStatus;
  /** Wall-clock duration of this migration in milliseconds. */
  durationMs: number;
  /** Error message if status is FAILED. Undefined otherwise. */
  error?: string;
  /** Number of individual SQL statements executed in this migration (excluding the version UPDATE). */
  statementsExecuted: number;
}

/**
 * Complete report returned by MigrationRunner.run().
 *
 * Contains the full migration history for this run, integrity check results,
 * and the schema version before and after execution.
 */
export interface MigrationReport {
  /** ISO-8601 timestamp when the runner started. */
  startedAt: string;
  /** ISO-8601 timestamp when the runner completed. */
  completedAt: string;
  /** Schema version before this run. 0 if the database was fresh. */
  currentVersion: number;
  /** Schema version after this run. Same as currentVersion if no migrations ran. */
  finalVersion: number;
  /** Per-migration outcomes. Empty array if no migrations were attempted. */
  results: MigrationResult[];
  /** Result of PRAGMA integrity_check after all migrations. 'ok' means healthy. */
  integrityCheck: string;
  /** Result of PRAGMA foreign_key_check. Empty string means no violations. */
  foreignKeyCheck: string;
}
