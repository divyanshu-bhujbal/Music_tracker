export interface TestResult {
  id: string;
  description: string;
  status: "PASS" | "FAIL" | "ERROR";
  expected: string;
  actual: string;
  durationMs: number;
  error?: string;
}

export interface TestCase {
  id: string;
  description: string;
  run: () => Promise<TestResult>;
}

export interface SpikeReport {
  taskId: "T-00b.1";
  platform: "capacitor-android";
  deviceInfo: { model: string; apiLevel: number; webViewVersion: string };
  packageName: string;
  packageVersion: string;
  tests: TestResult[];
  passed: number;
  failed: number;
  criticalFailed: boolean;
  timestamp: string;
}
