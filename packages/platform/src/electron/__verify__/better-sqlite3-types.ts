export type SQStatus = 'PASS' | 'FAIL' | 'ERROR';

export interface TestResult {
  id: string;
  description: string;
  status: SQStatus;
  expected: string;
  actual: string;
  durationMs: number;
  error?: string;
}

export interface VerifyReport {
  taskId: 'E-02-T-02.1';
  platform: 'electron-windows';
  packageName: 'better-sqlite3';
  packageVersion: string;
  electronVersion: string;
  nodeVersion: string;
  dbPath: string;
  tests: TestResult[];
  passed: number;
  failed: number;
  errored: number;
  criticalFailed: boolean;
  timestamp: string;
}
