import { useEffect, useRef, useState } from 'react';
import { runVerify } from './capacitor-sqlite-verify.js';
import type { VerifyReport, TestResult } from './capacitor-sqlite-types.js';

const STATUS_COLORS: Record<string, string> = {
  PASS: '#4caf50',
  FAIL: '#f44336',
  ERROR: '#ff9800',
};

export function VerifyRunner() {
  const [report, setReport] = useState<VerifyReport | null>(null);
  const [running, setRunning] = useState(true);
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    runVerify('collectio-verify')
      .then((r) => {
        setReport(r);
        setRunning(false);
        console.log(JSON.stringify(r, null, 2));
        (window as unknown as Record<string, unknown>).__verifyReport = r;
      })
      .catch((err: unknown) => {
        console.error('Verify failed:', err);
        setRunning(false);
      });
  }, []);

  const copyReport = () => {
    if (report) {
      navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    }
  };

  if (running) {
    return (
      <div style={{ padding: 24, fontFamily: 'monospace' }}>
        <h2>Running 12 SQLite tests...</h2>
        <div style={{ fontSize: 18, color: '#666' }}>
          Initializing @capacitor-community/sqlite on Android...
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div style={{ padding: 24, fontFamily: 'monospace' }}>
        <h2 style={{ color: '#f44336' }}>Verification Failed</h2>
        <p>runVerify() did not return a report.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, fontFamily: 'monospace', maxWidth: 1200 }}>
      <h2>E-02 T-02: @capacitor-community/sqlite Verification</h2>
      <div style={{ marginBottom: 16, fontSize: 14, color: '#666' }}>
        <div>Capacitor: {report.capacitorVersion}</div>
        <div>
          {report.packageName}: {report.packageVersion}
        </div>
        <div>WebView: {report.webViewVersion}</div>
        <div>Database: {report.dbName}</div>
      </div>

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
            <th style={{ textAlign: 'left', padding: '8px 12px' }}>
              Description
            </th>
            <th style={{ textAlign: 'left', padding: '8px 12px' }}>Status</th>
            <th style={{ textAlign: 'left', padding: '8px 12px' }}>Expected</th>
            <th style={{ textAlign: 'left', padding: '8px 12px' }}>Actual</th>
            <th style={{ textAlign: 'right', padding: '8px 12px' }}>
              Duration
            </th>
          </tr>
        </thead>
        <tbody>
          {report.tests.map((t: TestResult) => (
            <tr
              key={t.id}
              style={{
                borderBottom: '1px solid #ddd',
                backgroundColor:
                  t.id === 'SQ-09' ? 'rgba(255,152,0,0.08)' : undefined,
              }}
            >
              <td style={{ padding: '6px 12px', fontWeight: 'bold' }}>
                {t.id}
              </td>
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
              <td style={{ padding: '6px 12px', color: '#666' }}>
                {t.expected}
              </td>
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
          {report.passed}/12 passed. {report.failed}/12 failed.{' '}
          {report.errored}/12 errors.
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
          CRITICAL FAILURE: Foreign key enforcement is not working. Capacitor
          SQLite cannot be used for this project.
        </div>
      )}

      {!report.criticalFailed &&
        report.tests.some(
          (t) => t.id === 'SQ-09' && t.status === 'PASS',
        ) && (
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
            CRITICAL TEST PASSED: Foreign key enforcement confirmed on
            Capacitor Android.
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
