import { useEffect, useRef, useState } from 'react';
import { runAuthVerify } from './capacitor-auth-verify.js';
import type { VerifyReport, TestResult } from './capacitor-auth-types.js';

// ============================================================
// OAuth config — must be hardcoded in Capacitor (no env vars in WebView).
// BEFORE RUNNING: Replace clientId with your Google Cloud Console Android OAuth
// client ID. See E04-T07 spec Appendix C for setup steps.
// ============================================================
const TEST_CONFIG = {
  oauth: {
    clientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
    redirectUri: 'com.collectio.app://',
    scopes: ['https://www.googleapis.com/auth/drive.appdata'],
  },
};

const STATUS_COLORS: Record<string, string> = {
  PASS: '#4caf50',
  FAIL: '#f44336',
  ERROR: '#ff9800',
  SKIP: '#9e9e9e',
};

const INSTRUCTIONS: Record<string, string> = {
  'IT-01':
    'Opening browser for Google sign-in. Please select your test account and consent to access.',
  'IT-02-pre':
    'Tokens stored successfully. Now kill the app (swipe from recents or Settings > Force Stop) and relaunch.',
  'IT-02-post': 'App relaunched. Verifying tokens survived app kill...',
  'IT-05a':
    'Opening browser for OAuth. Please consent. This verifies the com.collectio.app:// deep link.',
  'IT-05b': 'Opening browser again. Please click CANCEL on the Google consent screen.',
};

export function AuthVerifyRunner() {
  const [report, setReport] = useState<VerifyReport | null>(null);
  const [running, setRunning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const resumePhase = sessionStorage.getItem('auth-test-phase');
    const isPostKill = resumePhase === 'it-02-post-kill';

    if (isPostKill) {
      console.log('[AuthVerify] Post-kill resume detected — continuing IT-02 verification');
    }

    runAuthVerify(TEST_CONFIG)
      .then((r) => {
        setReport(r);
        setRunning(false);
        console.log(JSON.stringify(r, null, 2));
        (window as unknown as Record<string, unknown>).__authVerifyReport = r;
      })
      .catch((err: unknown) => {
        console.error('Auth verify failed:', err);
        setError(err instanceof Error ? err.message : String(err));
        setRunning(false);
      });
  }, []);

  const copyReport = () => {
    if (report) {
      navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    }
  };

  // --- Loading state ---
  if (running) {
    const resumePhase = sessionStorage.getItem('auth-test-phase');
    const isPostKill = resumePhase === 'it-02-post-kill';

    return (
      <div style={{ padding: 24, fontFamily: 'monospace' }}>
        <h2>Running 5 auth integration tests...</h2>
        {isPostKill ? (
          <div style={{ fontSize: 18, color: '#666' }}>
            <div
              style={{
                marginBottom: 12,
                padding: 12,
                backgroundColor: '#fff3e0',
                border: '1px solid #ff9800',
                borderRadius: 4,
              }}
            >
              {INSTRUCTIONS['IT-02-post']}
            </div>
            Verifying tokens survived app kill via Android Keystore...
          </div>
        ) : (
          <div style={{ fontSize: 18, color: '#666' }}>
            <div
              style={{
                marginBottom: 12,
                padding: 12,
                backgroundColor: '#e3f2fd',
                border: '1px solid #2196f3',
                borderRadius: 4,
              }}
            >
              {INSTRUCTIONS['IT-01']}
            </div>
            Initializing CapacitorAuthProvider and CapacitorStorageProvider...
          </div>
        )}
      </div>
    );
  }

  // --- Error state ---
  if (error) {
    return (
      <div style={{ padding: 24, fontFamily: 'monospace' }}>
        <h2 style={{ color: '#f44336' }}>Auth Verification Failed</h2>
        <p>{error}</p>
      </div>
    );
  }

  // --- No report state ---
  if (!report) {
    return (
      <div style={{ padding: 24, fontFamily: 'monospace' }}>
        <h2 style={{ color: '#f44336' }}>Auth Verification Failed</h2>
        <p>runAuthVerify() did not return a report.</p>
      </div>
    );
  }

  // --- Results ---
  return (
    <div style={{ padding: 24, fontFamily: 'monospace', maxWidth: 1200 }}>
      <h2>E-04 T-04.7: Capacitor Auth + Storage Verification</h2>
      <div style={{ marginBottom: 16, fontSize: 14, color: '#666' }}>
        <div>Capacitor: {report.capacitorVersion}</div>
        <div>Platform: {report.platform}</div>
        <div>Package: {report.packageName}</div>
        <div>WebView: {report.webViewUserAgent}</div>
      </div>

      {/* Instructions for manual steps */}
      {report.tests.some((t) => t.id === 'IT-01' && t.status === 'PASS') &&
        !report.tests.some((t) => t.id === 'IT-02') && (
          <div
            style={{
              padding: 12,
              marginBottom: 16,
              backgroundColor: '#fff3e0',
              border: '1px solid #ff9800',
              borderRadius: 4,
              fontSize: 14,
            }}
          >
            {INSTRUCTIONS['IT-02-pre']}
          </div>
        )}

      <table
        style={{
          borderCollapse: 'collapse',
          width: '100%',
          marginBottom: 16,
          fontSize: 14,
        }}
      >
        <thead>
          <tr style={{ borderBottom: '2px solid #333' }}>
            <th style={{ textAlign: 'left', padding: '8px 12px' }}>Test ID</th>
            <th style={{ textAlign: 'left', padding: '8px 12px' }}>Description</th>
            <th style={{ textAlign: 'left', padding: '8px 12px' }}>Status</th>
            <th style={{ textAlign: 'left', padding: '8px 12px' }}>Expected</th>
            <th style={{ textAlign: 'left', padding: '8px 12px' }}>Actual</th>
            <th style={{ textAlign: 'right', padding: '8px 12px' }}>Duration</th>
          </tr>
        </thead>
        <tbody>
          {report.tests.map((t: TestResult) => (
            <tr
              key={t.id}
              style={{
                borderBottom: '1px solid #ddd',
                backgroundColor:
                  t.id === 'IT-01' && t.status !== 'PASS' ? 'rgba(244,67,54,0.08)' : undefined,
              }}
            >
              <td style={{ padding: '6px 12px', fontWeight: 'bold' }}>{t.id}</td>
              <td style={{ padding: '6px 12px' }}>{t.description}</td>
              <td style={{ padding: '6px 12px' }}>
                <span
                  style={{
                    color: STATUS_COLORS[t.status] ?? '#333',
                    fontWeight: 'bold',
                  }}
                >
                  {t.status}
                </span>
              </td>
              <td style={{ padding: '6px 12px', color: '#666' }}>{t.expected}</td>
              <td style={{ padding: '6px 12px' }}>{t.actual}</td>
              <td
                style={{
                  padding: '6px 12px',
                  textAlign: 'right',
                  color: '#666',
                }}
              >
                {t.durationMs.toFixed(0)}ms
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginBottom: 16, fontSize: 16 }}>
        <strong>
          {report.passed}/{report.tests.length} passed. {report.failed} failed. {report.errored}{' '}
          errors. {report.skipped} skipped.
        </strong>
      </div>

      {report.criticalFailed && (
        <div
          style={{
            padding: 16,
            marginBottom: 16,
            backgroundColor: '#ffebee',
            border: '2px solid #f44336',
            borderRadius: 4,
            fontSize: 16,
            fontWeight: 'bold',
            color: '#c62828',
          }}
        >
          CRITICAL FAILURE: OAuth PKCE flow failed on Android. Auth pipeline cannot be used.
        </div>
      )}

      {!report.criticalFailed && report.passed === report.tests.length && (
        <div
          style={{
            padding: 16,
            marginBottom: 16,
            backgroundColor: '#e8f5e9',
            border: '2px solid #4caf50',
            borderRadius: 4,
            fontSize: 16,
            fontWeight: 'bold',
            color: '#2e7d32',
          }}
        >
          ALL TESTS PASSED: Capacitor auth pipeline verified on Android device.
        </div>
      )}

      <button
        onClick={copyReport}
        style={{
          padding: '8px 16px',
          fontSize: 14,
          cursor: 'pointer',
          backgroundColor: '#2196f3',
          color: 'white',
          border: 'none',
          borderRadius: 4,
        }}
      >
        Copy JSON Report
      </button>
    </div>
  );
}
