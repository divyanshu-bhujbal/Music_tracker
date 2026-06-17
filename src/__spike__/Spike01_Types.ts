/**
 * Spike01_Types.ts
 *
 * Type definitions for T-00.1 SQLite Validation on Windows.
 * These types are used by Spike01_SQLite.ts and Spike01_Runner.tsx.
 */

/** Individual test result */
export interface SQLiteTestResult {
  /** Test ID (e.g., "SQ-01") */
  id: string;
  /** Human-readable test name */
  name: string;
  /** Whether the test passed */
  passed: boolean;
  /** Execution time in milliseconds */
  durationMs: number;
  /** Error message if failed */
  error?: string;
}

/** Summary of all test results */
export interface SQLiteSpikeSummary {
  /** Total number of tests */
  total: number;
  /** Number of passing tests */
  passed: number;
  /** Number of failing tests */
  failed: number;
  /** All individual results */
  results: SQLiteTestResult[];
  /** Whether the spike passed (all 12 tests) */
  spikePassed: boolean;
  /** Total execution time in milliseconds */
  totalDurationMs: number;
}

/** Spike execution state */
export type SpikeState = 'idle' | 'running' | 'completed';

/**
 * SQLite database handle type.
 * react-native-sqlite-storage returns a Database object with transaction support.
 * On Windows, only callback API is guaranteed.
 */
export interface SQLiteDatabase {
  transaction: (
    callback: (tx: SQLiteTransaction) => void,
    error?: (error: Error) => void,
    success?: () => void,
  ) => void;
  close: () => void;
}

export interface SQLiteTransaction {
  executeSql: (
    statement: string,
    args?: any[],
    callback?: (tx: SQLiteTransaction, results: SQLiteResultSet) => void,
    errorCallback?: (tx: SQLiteTransaction, error: Error) => boolean,
  ) => void;
}

export interface SQLiteResultSet {
  insertId: number;
  rowsAffected: number;
  rows: {
    length: number;
    item: (index: number) => any;
    raw: () => any[];
  };
}
