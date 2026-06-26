import type { OAuthConfig } from '@collectio/shared';

export type AuthTestStatus = 'PASS' | 'FAIL' | 'ERROR' | 'SKIP';

export interface TestResult {
  id: string;
  description: string;
  status: AuthTestStatus;
  expected: string;
  actual: string;
  durationMs: number;
  error?: string;
}

export interface VerifyReport {
  taskId: 'E-04-T-04.6';
  platform: 'electron-windows';
  packageName: '@collectio/platform';
  electronVersion: string;
  nodeVersion: string;
  tests: TestResult[];
  passed: number;
  failed: number;
  errored: number;
  skipped: number;
  timestamp: string;
}

export interface AuthTestConfig {
  oauth: OAuthConfig;
  userDataPath: string;
}
