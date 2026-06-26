/**
 * E-04 T-04.6 — Integration Tests: Electron Auth + Storage
 *
 * This is a MANUAL integration test script that runs inside the Electron
 * main process. It is NOT a Jest test. It exercises ElectronAuthProvider
 * and ElectronStorageProvider together against real Google OAuth.
 *
 * Usage:
 *   Set env vars VERIFY_AUTH=true and GOOGLE_CLIENT_ID=<your-client-id>
 *   Then run the Electron app. The script will walk through 6 test cases.
 *
 * IMPORTANT: This file must be excluded from Jest via testPathIgnorePatterns.
 */
import { join } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { AuthCancelledError } from '@collectio/shared';
import type { AuthTokens } from '@collectio/shared';
import { ElectronAuthProvider } from '../ElectronAuthProvider.js';
import { ElectronStorageProvider } from '../ElectronStorageProvider.js';
import type { TestResult, VerifyReport, AuthTestConfig } from './electron-auth-types.js';

const STORAGE_NAME = 'auth-verify-test';

function elapsed(start: number): number {
  return Math.round(performance.now() - start);
}

function result(
  id: string,
  description: string,
  status: TestResult['status'],
  expected: string,
  actual: string,
  start: number,
  error?: string,
): TestResult {
  return {
    id,
    description,
    status,
    expected,
    actual,
    durationMs: elapsed(start),
    ...(error !== undefined ? { error } : {}),
  };
}

// ---------------------------------------------------------------------------
// IT-01: Full OAuth Flow
// ---------------------------------------------------------------------------
async function testIT01(
  storage: ElectronStorageProvider,
  config: AuthTestConfig,
): Promise<TestResult & { tokens?: AuthTokens }> {
  const id = 'IT-01';
  const description = 'Full OAuth flow with test Google account';
  const start = performance.now();
  const expected = 'Returns AuthTokens with non-empty accessToken, refreshToken, expiresAt > Date.now()';

  try {
    const provider = new ElectronAuthProvider(storage, config.oauth);
    console.log('[IT-01] Opening browser for OAuth...');
    console.log('[IT-01] Please consent in the browser window. You have 5 minutes.');

    const tokens = await provider.signIn();

    const hasAccessToken = typeof tokens.accessToken === 'string' && tokens.accessToken.length > 0;
    const hasRefreshToken = typeof tokens.refreshToken === 'string' && tokens.refreshToken.length > 0;
    const expiresAtFuture = typeof tokens.expiresAt === 'number' && tokens.expiresAt > Date.now();

    if (hasAccessToken && hasRefreshToken && expiresAtFuture) {
      console.log(`[IT-01] PASS — access token present: yes, refresh token present: yes, expiresAt valid`);
      return { ...result(id, description, 'PASS', expected, `access token present: yes, refresh token present: yes, expiresAt > Date.now()`, start), tokens };
    }

    const actual = `accessToken: ${hasAccessToken ? 'present' : 'missing'}, refreshToken: ${hasRefreshToken ? 'present' : 'missing'}, expiresAt: ${expiresAtFuture ? 'future' : 'past or invalid'}`;
    return result(id, description, 'FAIL', expected, actual, start);
  } catch (err) {
    return result(id, description, 'ERROR', expected, 'Exception thrown', start, err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// IT-02: Token Survival Across Restart
// ---------------------------------------------------------------------------
async function testIT02(
  config: AuthTestConfig,
  firstTokens: AuthTokens,
): Promise<TestResult> {
  const id = 'IT-02';
  const description = 'Token survival across simulated restart';
  const start = performance.now();
  const expected = 'New ElectronStorageProvider instance returns matching AuthTokens';

  try {
    // Simulate restart: create a new storage instance pointing to same directory
    const newStorage = new ElectronStorageProvider(STORAGE_NAME);
    const newProvider = new ElectronAuthProvider(newStorage, config.oauth);

    const stored = await newProvider.getStoredTokens();

    if (stored === null) {
      return result(id, description, 'FAIL', expected, 'getStoredTokens() returned null', start);
    }

    const accessTokenMatch = stored.accessToken === firstTokens.accessToken;
    const refreshTokenMatch = stored.refreshToken === firstTokens.refreshToken;

    if (accessTokenMatch && refreshTokenMatch) {
      console.log('[IT-02] PASS — tokens survived simulated restart');
      return result(id, description, 'PASS', expected, 'Tokens match across instances', start);
    }

    const actual = `accessToken match: ${accessTokenMatch}, refreshToken match: ${refreshTokenMatch}`;
    return result(id, description, 'FAIL', expected, actual, start);
  } catch (err) {
    return result(id, description, 'ERROR', expected, 'Exception thrown', start, err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// IT-03: Refresh Access Token
// ---------------------------------------------------------------------------
async function testIT03(
  storage: ElectronStorageProvider,
  config: AuthTestConfig,
  originalAccessToken: string,
): Promise<TestResult> {
  const id = 'IT-03';
  const description = 'Refresh access token';
  const start = performance.now();
  const expected = 'Returns new accessToken (different from IT-01), expiresAt updated';

  try {
    const provider = new ElectronAuthProvider(storage, config.oauth);
    const stored = await provider.getStoredTokens();

    if (stored === null) {
      return result(id, description, 'ERROR', expected, 'No stored tokens to refresh from', start);
    }

    const refreshed = await provider.refreshAccessToken(stored.refreshToken);

    const accessTokenDifferent = refreshed.accessToken !== originalAccessToken;
    const expiresAtFuture = refreshed.expiresAt > Date.now();

    // Verify storage was updated
    const updatedStored = await provider.getStoredTokens();
    const storageUpdated = updatedStored !== null && updatedStored.accessToken === refreshed.accessToken;

    if (accessTokenDifferent && expiresAtFuture && storageUpdated) {
      console.log('[IT-03] PASS — access token refreshed and stored');
      return result(id, description, 'PASS', expected, 'New access token received, storage updated', start);
    }

    const actual = `accessToken different: ${accessTokenDifferent}, expiresAt future: ${expiresAtFuture}, storage updated: ${storageUpdated}`;
    return result(id, description, 'FAIL', expected, actual, start);
  } catch (err) {
    return result(id, description, 'ERROR', expected, 'Exception thrown', start, err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// IT-04: Sign Out Clears Tokens
// ---------------------------------------------------------------------------
async function testIT04(
  storage: ElectronStorageProvider,
  config: AuthTestConfig,
): Promise<TestResult> {
  const id = 'IT-04';
  const description = 'Sign out clears all tokens';
  const start = performance.now();
  const expected = 'getStoredTokens() returns null; all 3 keys individually return null';

  try {
    const provider = new ElectronAuthProvider(storage, config.oauth);
    await provider.signOut();

    const tokens = await provider.getStoredTokens();
    if (tokens !== null) {
      return result(id, description, 'FAIL', expected, 'getStoredTokens() returned tokens after signOut()', start);
    }

    // Verify each key individually
    const access = await storage.retrieve('auth_access_token');
    const refresh = await storage.retrieve('auth_refresh_token');
    const expires = await storage.retrieve('auth_expires_at');

    const allNull = access === null && refresh === null && expires === null;

    if (allNull) {
      console.log('[IT-04] PASS — all tokens cleared after signOut()');
      return result(id, description, 'PASS', expected, 'All 3 keys are null', start);
    }

    const actual = `access: ${access === null ? 'null' : 'present'}, refresh: ${refresh === null ? 'null' : 'present'}, expires: ${expires === null ? 'null' : 'present'}`;
    return result(id, description, 'FAIL', expected, actual, start);
  } catch (err) {
    return result(id, description, 'ERROR', expected, 'Exception thrown', start, err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// IT-05: Cancelled Consent → AuthCancelledError
// ---------------------------------------------------------------------------
async function testIT05(
  config: AuthTestConfig,
): Promise<TestResult> {
  const id = 'IT-05';
  const description = 'Cancelled consent throws AuthCancelledError';
  const start = performance.now();
  const expected = 'signIn() rejects with AuthCancelledError';

  try {
    const storage = new ElectronStorageProvider(STORAGE_NAME);
    const provider = new ElectronAuthProvider(storage, config.oauth);

    console.log('=== IT-05: Cancelled Consent ===');
    console.log('When the browser opens, please CLOSE THE TAB (do not consent).');
    console.log('The script expects an AuthCancelledError. You have 5 minutes.');

    await provider.signIn();

    // If we reach here, the user consented instead of cancelling
    return result(id, description, 'FAIL', expected, 'signIn() resolved (user consented instead of cancelling)', start);
  } catch (err) {
    if (err instanceof AuthCancelledError) {
      // Verify no tokens were stored
      const storage = new ElectronStorageProvider(STORAGE_NAME);
      const tokens = await storage.retrieve('auth_access_token');
      const noTokens = tokens === null;

      if (noTokens) {
        console.log('[IT-05] PASS — AuthCancelledError thrown, no tokens stored');
        return result(id, description, 'PASS', expected, 'AuthCancelledError thrown; no tokens stored', start);
      }

      return result(id, description, 'FAIL', expected, 'AuthCancelledError thrown but tokens were stored', start);
    }

    return result(id, description, 'ERROR', expected, 'Different error type thrown', start, err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// IT-06: Verify drive.appdata Scope
// ---------------------------------------------------------------------------
async function testIT06(
  storage: ElectronStorageProvider,
  config: AuthTestConfig,
): Promise<TestResult> {
  const id = 'IT-06';
  const description = 'Verify drive.appdata scope';
  const start = performance.now();
  const expected = 'scope includes drive.appdata; no broader Drive scopes';

  try {
    const provider = new ElectronAuthProvider(storage, config.oauth);
    const tokens = await provider.getStoredTokens();

    if (tokens === null) {
      return result(id, description, 'ERROR', expected, 'No stored tokens available', start);
    }

    const response = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${tokens.accessToken}`,
    );

    if (!response.ok) {
      return result(id, description, 'FAIL', expected, `tokeninfo returned HTTP ${response.status}`, start);
    }

    const info = (await response.json()) as { scope?: string };
    const scope = info.scope ?? '';

    const hasAppData = scope.includes('https://www.googleapis.com/auth/drive.appdata');
    const hasBroaderDrive = scope.includes('https://www.googleapis.com/auth/drive') &&
      !scope.includes('https://www.googleapis.com/auth/drive.appdata');
    const hasDriveFile = scope.includes('https://www.googleapis.com/auth/drive.file');
    const hasDriveReadonly = scope.includes('https://www.googleapis.com/auth/drive.readonly');

    if (hasAppData && !hasBroaderDrive && !hasDriveFile && !hasDriveReadonly) {
      console.log('[IT-06] PASS — scope is drive.appdata only');
      return result(id, description, 'PASS', expected, `scope: ${scope}`, start);
    }

    const actual = `has drive.appdata: ${hasAppData}, has broader drive: ${hasBroaderDrive}, has drive.file: ${hasDriveFile}, has drive.readonly: ${hasDriveReadonly}`;
    return result(id, description, 'FAIL', expected, actual, start);
  } catch (err) {
    return result(id, description, 'ERROR', expected, 'Exception thrown', start, err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------
export async function runAuthVerify(config: AuthTestConfig): Promise<VerifyReport> {
  console.log('=== E-04 T-04.6: Electron Auth + Storage Integration Tests ===');

  const results: TestResult[] = [];
  let firstTokens: AuthTokens | null = null;
  let storage: ElectronStorageProvider | null = null;

  // Ensure reports directory exists
  const reportsDir = join(config.userDataPath, 'reports');
  try {
    mkdirSync(reportsDir, { recursive: true });
  } catch {
    // Directory may already exist
  }

  // --- IT-01: Full OAuth Flow ---
  console.log('');
  console.log('[IT-01] Starting: Full OAuth flow');
  try {
    storage = new ElectronStorageProvider(STORAGE_NAME);
    const it01 = await testIT01(storage, config);
    results.push(it01);
    console.log(`[IT-01] ${it01.status} (${it01.durationMs}ms) — ${it01.description}`);
    if (it01.tokens) {
      firstTokens = it01.tokens;
    }
  } catch (err) {
    results.push(result('IT-01', 'Full OAuth flow', 'ERROR', '', 'Unexpected script error', 0, err instanceof Error ? err.message : String(err)));
    console.log(`[IT-01] ERROR — Unexpected script error`);
  }

  const it01Passed = firstTokens !== null;

  // --- IT-02: Token Survival Across Restart ---
  console.log('');
  console.log('[IT-02] Starting: Token survival across simulated restart');
  if (!it01Passed) {
    results.push(result('IT-02', 'Token survival across simulated restart', 'SKIP', '', 'IT-01 prerequisite did not pass', 0));
    console.log('[IT-02] SKIP — IT-01 prerequisite did not pass');
  } else {
    try {
      const it02 = await testIT02(config, firstTokens!);
      results.push(it02);
      console.log(`[IT-02] ${it02.status} (${it02.durationMs}ms) — ${it02.description}`);
    } catch (err) {
      results.push(result('IT-02', 'Token survival across simulated restart', 'ERROR', '', 'Unexpected script error', 0, err instanceof Error ? err.message : String(err)));
      console.log(`[IT-02] ERROR — Unexpected script error`);
    }
  }

  // --- IT-03: Refresh Access Token ---
  console.log('');
  console.log('[IT-03] Starting: Refresh access token');
  if (!it01Passed) {
    results.push(result('IT-03', 'Refresh access token', 'SKIP', '', 'IT-01 prerequisite did not pass', 0));
    console.log('[IT-03] SKIP — IT-01 prerequisite did not pass');
  } else {
    try {
      const it03 = await testIT03(storage!, config, firstTokens!.accessToken);
      results.push(it03);
      console.log(`[IT-03] ${it03.status} (${it03.durationMs}ms) — ${it03.description}`);
    } catch (err) {
      results.push(result('IT-03', 'Refresh access token', 'ERROR', '', 'Unexpected script error', 0, err instanceof Error ? err.message : String(err)));
      console.log(`[IT-03] ERROR — Unexpected script error`);
    }
  }

  // --- IT-06: Verify drive.appdata Scope (BEFORE IT-04 clears tokens) ---
  console.log('');
  console.log('[IT-06] Starting: Verify drive.appdata scope');
  if (!it01Passed) {
    results.push(result('IT-06', 'Verify drive.appdata scope', 'SKIP', '', 'IT-01 prerequisite did not pass', 0));
    console.log('[IT-06] SKIP — IT-01 prerequisite did not pass');
  } else {
    try {
      const it06 = await testIT06(storage!, config);
      results.push(it06);
      console.log(`[IT-06] ${it06.status} (${it06.durationMs}ms) — ${it06.description}`);
    } catch (err) {
      results.push(result('IT-06', 'Verify drive.appdata scope', 'ERROR', '', 'Unexpected script error', 0, err instanceof Error ? err.message : String(err)));
      console.log(`[IT-06] ERROR — Unexpected script error`);
    }
  }

  // --- IT-04: Sign Out Clears Tokens ---
  console.log('');
  console.log('[IT-04] Starting: Sign out clears all tokens');
  if (!it01Passed) {
    results.push(result('IT-04', 'Sign out clears all tokens', 'SKIP', '', 'IT-01 prerequisite did not pass', 0));
    console.log('[IT-04] SKIP — IT-01 prerequisite did not pass');
  } else {
    try {
      const it04 = await testIT04(storage!, config);
      results.push(it04);
      console.log(`[IT-04] ${it04.status} (${it04.durationMs}ms) — ${it04.description}`);
    } catch (err) {
      results.push(result('IT-04', 'Sign out clears all tokens', 'ERROR', '', 'Unexpected script error', 0, err instanceof Error ? err.message : String(err)));
      console.log(`[IT-04] ERROR — Unexpected script error`);
    }
  }

  // --- IT-05: Cancelled Consent (independent — run last) ---
  console.log('');
  console.log('[IT-05] Starting: Cancelled consent throws AuthCancelledError');
  try {
    const it05 = await testIT05(config);
    results.push(it05);
    console.log(`[IT-05] ${it05.status} (${it05.durationMs}ms) — ${it05.description}`);
  } catch (err) {
    results.push(result('IT-05', 'Cancelled consent throws AuthCancelledError', 'ERROR', '', 'Unexpected script error', 0, err instanceof Error ? err.message : String(err)));
    console.log(`[IT-05] ERROR — Unexpected script error`);
  }

  // --- Aggregate results ---
  let passed = 0;
  let failed = 0;
  let errored = 0;
  let skipped = 0;

  for (const r of results) {
    switch (r.status) {
      case 'PASS': passed++; break;
      case 'FAIL': failed++; break;
      case 'ERROR': errored++; break;
      case 'SKIP': skipped++; break;
    }
  }

  console.log('');
  console.log(`Result: ${passed}/${results.length} passed. ${failed} failed. ${errored} errors. ${skipped} skipped.`);

  const report: VerifyReport = {
    taskId: 'E-04-T-04.6',
    platform: 'electron-windows',
    packageName: '@collectio/platform',
    electronVersion: process.versions.electron ?? 'unknown',
    nodeVersion: process.version,
    tests: results,
    passed,
    failed,
    errored,
    skipped,
    timestamp: new Date().toISOString(),
  };

  // Write JSON report
  const reportPath = join(reportsDir, `auth-verify-${report.timestamp.replace(/[:.]/g, '-')}.json`);
  try {
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`Report written to: ${reportPath}`);
  } catch (err) {
    console.error(`Failed to write report: ${err instanceof Error ? err.message : String(err)}`);
  }

  return report;
}
