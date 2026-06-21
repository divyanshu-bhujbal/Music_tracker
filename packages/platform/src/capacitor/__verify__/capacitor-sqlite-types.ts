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
  taskId: 'E-02-T-02.2';
  platform: 'capacitor-android';
  packageName: '@capacitor-community/sqlite';
  packageVersion: string;
  capacitorVersion: string;
  webViewVersion: string;
  dbName: string;
  tests: TestResult[];
  passed: number;
  failed: number;
  errored: number;
  criticalFailed: boolean;
  timestamp: string;
}
