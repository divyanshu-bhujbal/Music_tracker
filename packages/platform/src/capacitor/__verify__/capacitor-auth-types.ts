import type { OAuthConfig } from '@collectio/shared';

export type AuthStatus = 'PASS' | 'FAIL' | 'ERROR' | 'SKIP';

export interface TestResult {
  id: string;
  description: string;
  status: AuthStatus;
  expected: string;
  actual: string;
  durationMs: number;
  error?: string;
}

export interface VerifyReport {
  taskId: 'E-04-T-04.7';
  platform: 'capacitor-android';
  packageName: '@collectio/platform';
  capacitorVersion: string;
  webViewUserAgent: string;
  tests: TestResult[];
  passed: number;
  failed: number;
  errored: number;
  skipped: number;
  criticalFailed: boolean;
  timestamp: string;
}

export interface AuthTestConfig {
  oauth: OAuthConfig;
}
