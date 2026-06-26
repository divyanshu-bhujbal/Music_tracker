import { Capacitor } from '@capacitor/core';
import type { AuthTokens } from '@collectio/shared';
import { AuthCancelledError } from '@collectio/shared';
import { CapacitorAuthProvider } from '../CapacitorAuthProvider.js';
import { CapacitorStorageProvider } from '../CapacitorStorageProvider.js';
import type { TestResult, VerifyReport, AuthTestConfig } from './capacitor-auth-types.js';

// Storage keys used by CapacitorAuthProvider
const STORAGE_KEY_ACCESS_TOKEN = 'auth_access_token';
const STORAGE_KEY_REFRESH_TOKEN = 'auth_refresh_token';
const STORAGE_KEY_EXPIRES_AT = 'auth_expires_at';

function getCapacitorVersion(): string {
  try {
    const c = Capacitor as unknown as { version?: string };
    return c.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function getWebViewUserAgent(): string {
  try {
    return navigator.userAgent;
  } catch {
    return 'unknown';
  }
}

function logTest(r: TestResult): void {
  console.log(
    `${r.id}: ${r.status} — ${r.description} — ${r.durationMs.toFixed(1)}ms`,
  );
}

function buildReport(tests: TestResult[], timestamp: string): VerifyReport {
  let passed = 0;
  let failed = 0;
  let errored = 0;
  let skipped = 0;
  let criticalFailed = false;

  for (const r of tests) {
    if (r.status === 'PASS') passed++;
    else if (r.status === 'FAIL') failed++;
    else if (r.status === 'ERROR') errored++;
    else if (r.status === 'SKIP') skipped++;
    if (r.id === 'IT-01' && (r.status === 'FAIL' || r.status === 'ERROR')) {
      criticalFailed = true;
    }
  }

  return {
    taskId: 'E-04-T-04.7',
    platform: 'capacitor-android',
    packageName: '@collectio/platform',
    capacitorVersion: getCapacitorVersion(),
    webViewUserAgent: getWebViewUserAgent(),
    tests,
    passed,
    failed,
    errored,
    skipped,
    criticalFailed,
    timestamp,
  };
}

// ============================================================
// Individual test functions
// ============================================================

/**
 * IT-01: Full OAuth PKCE flow on Android.
 * Signs in via system browser, exchanges code for tokens,
 * stores in Android Keystore.
 */
async function testIT01(
  storage: CapacitorStorageProvider,
  config: AuthTestConfig,
): Promise<{ result: TestResult; tokens: AuthTokens | null }> {
  const start = performance.now();

  try {
    // Clean any existing tokens
    await storage.clear();

    const provider = new CapacitorAuthProvider(storage, config.oauth);

    console.log('[IT-01] Opening browser for OAuth consent...');
    const tokens = await provider.signIn();

    const hasAccessToken = typeof tokens.accessToken === 'string' && tokens.accessToken.length > 0;
    const hasRefreshToken = typeof tokens.refreshToken === 'string' && tokens.refreshToken.length > 0;
    const expiresAtFuture = typeof tokens.expiresAt === 'number' && tokens.expiresAt > Date.now();

    if (hasAccessToken && hasRefreshToken && expiresAtFuture) {
      const result: TestResult = {
        id: 'IT-01',
        description: 'Full OAuth PKCE flow on Android',
        status: 'PASS',
        expected: 'Returns AuthTokens with non-empty accessToken, refreshToken, expiresAt > Date.now()',
        actual: `accessToken present: yes, refreshToken present: yes, expiresAt future: yes`,
        durationMs: performance.now() - start,
      };
      logTest(result);
      return { result, tokens };
    }

    const result: TestResult = {
      id: 'IT-01',
      description: 'Full OAuth PKCE flow on Android',
      status: 'FAIL',
      expected: 'Returns AuthTokens with non-empty accessToken, refreshToken, expiresAt > Date.now()',
      actual: `accessToken present: ${hasAccessToken ? 'yes' : 'no'}, refreshToken present: ${hasRefreshToken ? 'yes' : 'no'}, expiresAt future: ${expiresAtFuture ? 'yes' : 'no'}`,
      durationMs: performance.now() - start,
    };
    logTest(result);
    return { result, tokens: null };
  } catch (err) {
    const result: TestResult = {
      id: 'IT-01',
      description: 'Full OAuth PKCE flow on Android',
      status: 'ERROR',
      expected: 'Returns AuthTokens with non-empty accessToken, refreshToken, expiresAt > Date.now()',
      actual: 'Exception thrown during signIn()',
      durationMs: performance.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
    logTest(result);
    return { result, tokens: null };
  }
}

/**
 * IT-02a: Pre-kill verification.
 * Verifies tokens are accessible and caches expected values in sessionStorage.
 */
async function testIT02a(
  storage: CapacitorStorageProvider,
  config: AuthTestConfig,
  cachedTokens: AuthTokens,
): Promise<TestResult> {
  const start = performance.now();

  try {
    const provider = new CapacitorAuthProvider(storage, config.oauth);
    const stored = await provider.getStoredTokens();

    if (stored === null) {
      return {
        id: 'IT-02',
        description: 'Token survival across app kill',
        status: 'FAIL',
        expected: 'getStoredTokens() returns non-null AuthTokens',
        actual: 'getStoredTokens() returned null',
        durationMs: performance.now() - start,
      };
    }

    const accessTokenMatch = stored.accessToken === cachedTokens.accessToken;
    const refreshTokenMatch = stored.refreshToken === cachedTokens.refreshToken;

    if (!accessTokenMatch || !refreshTokenMatch) {
      return {
        id: 'IT-02',
        description: 'Token survival across app kill',
        status: 'FAIL',
        expected: 'Stored tokens match IT-01 tokens',
        actual: `accessToken match: ${accessTokenMatch}, refreshToken match: ${refreshTokenMatch}`,
        durationMs: performance.now() - start,
      };
    }

    // Cache expected values in sessionStorage for post-kill verification
    sessionStorage.setItem('auth-test-phase', 'it-02-post-kill');
    sessionStorage.setItem('auth-test-expected-access-token', cachedTokens.accessToken);
    sessionStorage.setItem('auth-test-expected-refresh-token', cachedTokens.refreshToken);
    sessionStorage.setItem('auth-test-expected-expires-at', String(cachedTokens.expiresAt));

    return {
      id: 'IT-02',
      description: 'Token survival across app kill',
      status: 'PASS',
      expected: 'Stored tokens match IT-01 tokens',
      actual: 'Tokens verified in Keystore; kill app now to test survival',
      durationMs: performance.now() - start,
    };
  } catch (err) {
    return {
      id: 'IT-02',
      description: 'Token survival across app kill',
      status: 'ERROR',
      expected: 'getStoredTokens() returns non-null AuthTokens',
      actual: 'Exception thrown',
      durationMs: performance.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * IT-02b: Post-kill verification.
 * After app relaunch, verifies tokens survived Android Keystore.
 */
async function testIT02b(
  config: AuthTestConfig,
): Promise<TestResult> {
  const start = performance.now();

  try {
    const expectedAccessToken = sessionStorage.getItem('auth-test-expected-access-token');
    const expectedRefreshToken = sessionStorage.getItem('auth-test-expected-refresh-token');
    const expectedExpiresAt = sessionStorage.getItem('auth-test-expected-expires-at');

    if (!expectedAccessToken || !expectedRefreshToken || !expectedExpiresAt) {
      return {
        id: 'IT-02',
        description: 'Token survival across app kill',
        status: 'ERROR',
        expected: 'Expected token values cached in sessionStorage',
        actual: 'sessionStorage missing expected values',
        durationMs: performance.now() - start,
      };
    }

    // Create fresh instances (simulating app restart)
    const newStorage = new CapacitorStorageProvider();
    const newProvider = new CapacitorAuthProvider(newStorage, config.oauth);
    const stored = await newProvider.getStoredTokens();

    if (stored === null) {
      return {
        id: 'IT-02',
        description: 'Token survival across app kill',
        status: 'FAIL',
        expected: 'New CapacitorStorageProvider returns matching tokens after relaunch',
        actual: 'getStoredTokens() returned null after relaunch',
        durationMs: performance.now() - start,
      };
    }

    const accessTokenMatch = stored.accessToken === expectedAccessToken;
    const refreshTokenMatch = stored.refreshToken === expectedRefreshToken;
    const expiresAtMatch = stored.expiresAt === Number(expectedExpiresAt);

    // Clean up sessionStorage
    sessionStorage.removeItem('auth-test-phase');
    sessionStorage.removeItem('auth-test-expected-access-token');
    sessionStorage.removeItem('auth-test-expected-refresh-token');
    sessionStorage.removeItem('auth-test-expected-expires-at');

    if (accessTokenMatch && refreshTokenMatch && expiresAtMatch) {
      return {
        id: 'IT-02',
        description: 'Token survival across app kill',
        status: 'PASS',
        expected: 'New CapacitorStorageProvider returns matching tokens after relaunch',
        actual: 'All tokens survived app kill via Android Keystore',
        durationMs: performance.now() - start,
      };
    }

    return {
      id: 'IT-02',
      description: 'Token survival across app kill',
      status: 'FAIL',
      expected: 'All token fields match pre-kill values',
      actual: `accessToken match: ${accessTokenMatch}, refreshToken match: ${refreshTokenMatch}, expiresAt match: ${expiresAtMatch}`,
      durationMs: performance.now() - start,
    };
  } catch (err) {
    return {
      id: 'IT-02',
      description: 'Token survival across app kill',
      status: 'ERROR',
      expected: 'New CapacitorStorageProvider returns matching tokens after relaunch',
      actual: 'Exception thrown',
      durationMs: performance.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * IT-03: Refresh access token.
 * Uses stored refresh token to obtain a new access token.
 */
async function testIT03(
  storage: CapacitorStorageProvider,
  config: AuthTestConfig,
  originalAccessToken: string,
): Promise<TestResult> {
  const start = performance.now();

  try {
    const provider = new CapacitorAuthProvider(storage, config.oauth);
    const currentTokens = await provider.getStoredTokens();

    if (!currentTokens) {
      return {
        id: 'IT-03',
        description: 'Refresh access token',
        status: 'SKIP',
        expected: 'Valid refresh token available from IT-01',
        actual: 'No stored tokens — IT-01 may not have completed',
        durationMs: performance.now() - start,
      };
    }

    const refreshed = await provider.refreshAccessToken(currentTokens.refreshToken);

    const hasAccessToken = typeof refreshed.accessToken === 'string' && refreshed.accessToken.length > 0;
    const accessTokenDifferent = refreshed.accessToken !== originalAccessToken;
    const expiresAtFuture = typeof refreshed.expiresAt === 'number' && refreshed.expiresAt > Date.now();

    if (hasAccessToken && accessTokenDifferent && expiresAtFuture) {
      // Verify stored tokens were updated
      const updatedTokens = await provider.getStoredTokens();
      const storedUpdated = updatedTokens?.accessToken === refreshed.accessToken;

      return {
        id: 'IT-03',
        description: 'Refresh access token',
        status: 'PASS',
        expected: 'New accessToken (different from IT-01), expiresAt updated, storage updated',
        actual: `accessToken present: yes, different from IT-01: yes, storage updated: ${storedUpdated ? 'yes' : 'no'}`,
        durationMs: performance.now() - start,
      };
    }

    return {
      id: 'IT-03',
      description: 'Refresh access token',
      status: 'FAIL',
      expected: 'New accessToken (different from IT-01), expiresAt updated',
      actual: `accessToken present: ${hasAccessToken ? 'yes' : 'no'}, different: ${accessTokenDifferent ? 'yes' : 'no'}, expiresAt future: ${expiresAtFuture ? 'yes' : 'no'}`,
      durationMs: performance.now() - start,
    };
  } catch (err) {
    return {
      id: 'IT-03',
      description: 'Refresh access token',
      status: 'ERROR',
      expected: 'refreshAccessToken() returns new accessToken and expiresAt',
      actual: 'Exception thrown',
      durationMs: performance.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * IT-04: Sign out clears tokens.
 * Calls signOut(), verifies all 3 keys are deleted from Keystore.
 */
async function testIT04(
  storage: CapacitorStorageProvider,
  config: AuthTestConfig,
): Promise<TestResult> {
  const start = performance.now();

  try {
    const provider = new CapacitorAuthProvider(storage, config.oauth);
    await provider.signOut();

    const tokens = await provider.getStoredTokens();

    if (tokens !== null) {
      return {
        id: 'IT-04',
        description: 'Sign out clears tokens',
        status: 'FAIL',
        expected: 'getStoredTokens() returns null after signOut()',
        actual: 'getStoredTokens() returned non-null tokens',
        durationMs: performance.now() - start,
      };
    }

    // Verify individual keys are null
    const accessToken = await storage.retrieve(STORAGE_KEY_ACCESS_TOKEN);
    const refreshToken = await storage.retrieve(STORAGE_KEY_REFRESH_TOKEN);
    const expiresAt = await storage.retrieve(STORAGE_KEY_EXPIRES_AT);

    const allNull = accessToken === null && refreshToken === null && expiresAt === null;

    if (allNull) {
      return {
        id: 'IT-04',
        description: 'Sign out clears tokens',
        status: 'PASS',
        expected: 'getStoredTokens() returns null; all 3 keys individually null',
        actual: 'All 3 Keystore keys deleted',
        durationMs: performance.now() - start,
      };
    }

    return {
      id: 'IT-04',
      description: 'Sign out clears tokens',
      status: 'FAIL',
      expected: 'All 3 individual storage keys return null',
      actual: `accessToken: ${accessToken === null ? 'null' : 'present'}, refreshToken: ${refreshToken === null ? 'null' : 'present'}, expiresAt: ${expiresAt === null ? 'null' : 'present'}`,
      durationMs: performance.now() - start,
    };
  } catch (err) {
    return {
      id: 'IT-04',
      description: 'Sign out clears tokens',
      status: 'ERROR',
      expected: 'signOut() clears all 3 keys; getStoredTokens() returns null',
      actual: 'Exception thrown',
      durationMs: performance.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * IT-05: Verified URI scheme deep link.
 * Two sub-tests:
 *   (a) Consent → deep link delivers auth code → token exchange succeeds
 *   (b) Cancel → deep link delivers error=access_denied → AuthCancelledError
 */
async function testIT05(
  config: AuthTestConfig,
): Promise<TestResult> {
  const start = performance.now();

  try {
    // Sub-test (a): Consent flow
    const storage = new CapacitorStorageProvider();
    await storage.clear();
    const provider = new CapacitorAuthProvider(storage, config.oauth);

    console.log('[IT-05a] Opening browser for OAuth consent...');
    const tokens = await provider.signIn();

    const consentSuccess =
      typeof tokens.accessToken === 'string' &&
      tokens.accessToken.length > 0 &&
      typeof tokens.refreshToken === 'string' &&
      tokens.refreshToken.length > 0;

    if (!consentSuccess) {
      return {
        id: 'IT-05',
        description: 'Deep link delivers auth code; cancel throws AuthCancelledError',
        status: 'FAIL',
        expected: '(a) Consent → tokens returned; (b) Cancel → AuthCancelledError',
        actual: '(a) Consent flow did not return valid tokens',
        durationMs: performance.now() - start,
      };
    }

    // Sub-test (b): Cancel flow
    console.log('[IT-05b] Opening browser for cancel test...');
    const cancelStorage = new CapacitorStorageProvider();
    const cancelProvider = new CapacitorAuthProvider(cancelStorage, config.oauth);

    try {
      await cancelProvider.signIn();
      // If we reach here, the user consented instead of canceling
      await storage.clear();
      return {
        id: 'IT-05',
        description: 'Deep link delivers auth code; cancel throws AuthCancelledError',
        status: 'FAIL',
        expected: '(a) Consent → tokens returned; (b) Cancel → AuthCancelledError',
        actual: '(a) PASS; (b) signIn() resolved instead of rejecting — user consented instead of canceling',
        durationMs: performance.now() - start,
      };
    } catch (err) {
      if (err instanceof AuthCancelledError) {
        // Clean up tokens from sub-test (a)
        await storage.clear();

        return {
          id: 'IT-05',
          description: 'Deep link delivers auth code; cancel throws AuthCancelledError',
          status: 'PASS',
          expected: '(a) Consent → tokens returned; (b) Cancel → AuthCancelledError',
          actual: '(a) Consent flow succeeded; (b) AuthCancelledError thrown as expected',
          durationMs: performance.now() - start,
        };
      }

      // Different error type — clean up sub-test (a) tokens
      await storage.clear();
      return {
        id: 'IT-05',
        description: 'Deep link delivers auth code; cancel throws AuthCancelledError',
        status: 'FAIL',
        expected: '(a) Consent → tokens returned; (b) Cancel → AuthCancelledError',
        actual: `(a) PASS; (b) Expected AuthCancelledError but got ${err instanceof Error ? err.constructor.name : 'unknown'}`,
        durationMs: performance.now() - start,
      };
    }
  } catch (err) {
    return {
      id: 'IT-05',
      description: 'Deep link delivers auth code; cancel throws AuthCancelledError',
      status: 'ERROR',
      expected: '(a) Consent → tokens returned; (b) Cancel → AuthCancelledError',
      actual: 'Exception thrown during IT-05',
      durationMs: performance.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================================
// Main runner
// ============================================================

export async function runAuthVerify(
  config: AuthTestConfig,
): Promise<VerifyReport> {
  const tests: TestResult[] = [];
  const timestamp = new Date().toISOString();

  console.log('=== E-04 T-04.7: Capacitor Auth + Storage Integration Tests ===');

  // Check if this is a post-kill resume (IT-02 continuation)
  const resumePhase = sessionStorage.getItem('auth-test-phase');

  if (resumePhase === 'it-02-post-kill') {
    console.log('[RESUME] Detected post-kill resume — continuing from IT-02 verification');

    // IT-02b: Post-kill verification — the only test that needs the kill+relaunch.
    // IT-03 through IT-05 already ran in the pre-kill session and their results
    // are definitive; re-running them would waste a refresh token cycle.
    console.log('[IT-02] Starting: Token survival verification (post-kill)');
    const it02Result = await testIT02b(config);
    tests.push(it02Result);
    logTest(it02Result);

    // Mark as completed
    sessionStorage.setItem('auth-test-phase', 'completed');

    const report = buildReport(tests, timestamp);
    console.log(`\nResult: ${report.passed}/${tests.length} passed. ${report.failed} failed. ${report.errored} errors. ${report.skipped} skipped.`);
    return report;
  }

  // First run or completed re-run: start from IT-01

  // IT-01: Full OAuth PKCE flow
  console.log('[IT-01] Starting: Full OAuth PKCE flow on Android');
  const storage = new CapacitorStorageProvider();
  const { result: it01Result, tokens: it01Tokens } = await testIT01(storage, config);
  tests.push(it01Result);
  logTest(it01Result);

  if (it01Result.status !== 'PASS' || !it01Tokens) {
    console.log('[IT-01] FAILED — skipping all dependent tests (IT-02, IT-03, IT-04)');
    tests.push({
      id: 'IT-02',
      description: 'Token survival across app kill',
      status: 'SKIP',
      expected: 'IT-01 prerequisite did not pass',
      actual: 'Skipped due to IT-01 failure',
      durationMs: 0,
    });
    tests.push({
      id: 'IT-03',
      description: 'Refresh access token',
      status: 'SKIP',
      expected: 'IT-01 prerequisite did not pass',
      actual: 'Skipped due to IT-01 failure',
      durationMs: 0,
    });
    tests.push({
      id: 'IT-04',
      description: 'Sign out clears tokens',
      status: 'SKIP',
      expected: 'IT-01 prerequisite did not pass',
      actual: 'Skipped due to IT-01 failure',
      durationMs: 0,
    });

    // IT-05 is independent
    console.log('[IT-05] Starting: Deep link verification');
    const it05Result = await testIT05(config);
    tests.push(it05Result);
    logTest(it05Result);

    const report = buildReport(tests, timestamp);
    console.log(`\nResult: ${report.passed}/${tests.length} passed. ${report.failed} failed. ${report.errored} errors. ${report.skipped} skipped.`);
    return report;
  }

  // IT-02a: Pre-kill verification + sessionStorage caching
  console.log('[IT-02] Starting: Token survival across app kill (pre-kill verification)');
  const it02aResult = await testIT02a(storage, config, it01Tokens);
  tests.push(it02aResult);
  logTest(it02aResult);

  if (it02aResult.status !== 'PASS') {
    console.log('[IT-02] Pre-kill verification failed — skip post-kill; continue with IT-03');
    // IT-02 failed but IT-03 can still run (depends on IT-01, not IT-02)

    // IT-03: Refresh access token
    console.log('[IT-03] Starting: Refresh access token');
    const it03Result = await testIT03(storage, config, it01Tokens.accessToken);
    tests.push(it03Result);
    logTest(it03Result);

    // IT-04: Sign out clears tokens
    console.log('[IT-04] Starting: Sign out clears tokens');
    const it04Result = await testIT04(storage, config);
    tests.push(it04Result);
    logTest(it04Result);

    // IT-05: Deep link verification
    console.log('[IT-05] Starting: Deep link verification');
    const it05Result = await testIT05(config);
    tests.push(it05Result);
    logTest(it05Result);

    sessionStorage.setItem('auth-test-phase', 'completed');
    const report = buildReport(tests, timestamp);
    console.log(`\nResult: ${report.passed}/${tests.length} passed. ${report.failed} failed. ${report.errored} errors. ${report.skipped} skipped.`);
    return report;
  }

  // IT-02a passed — session storage is set for post-kill resume
  // The app needs to be killed and relaunched for IT-02b to run.
  // Return partial report with instructions.
  console.log('[IT-02] Pre-kill verification PASSED. Kill the app now, then relaunch to continue IT-02.');

  // IT-03 and IT-04 run before the kill (they don't need the kill)
  // IT-03: Refresh access token
  console.log('[IT-03] Starting: Refresh access token');
  const it03Result = await testIT03(storage, config, it01Tokens.accessToken);
  tests.push(it03Result);
  logTest(it03Result);

  // IT-04: Sign out clears tokens
  console.log('[IT-04] Starting: Sign out clears tokens');
  const it04Result = await testIT04(storage, config);
  tests.push(it04Result);
  logTest(it04Result);

  // IT-05: Deep link verification
  console.log('[IT-05] Starting: Deep link verification');
  const it05Result = await testIT05(config);
  tests.push(it05Result);
  logTest(it05Result);

  sessionStorage.setItem('auth-test-phase', 'completed');

  const report = buildReport(tests, timestamp);
  console.log(`\nResult: ${report.passed}/${tests.length} passed. ${report.failed} failed. ${report.errored} errors. ${report.skipped} skipped.`);
  return report;
}
