import { useState, useEffect, useCallback } from "react";
import { runSqliteSpike } from "./Spike0b1_SQLite";
import type { SpikeReport, TestResult } from "./Spike0b1_Types";

const statusColor = (status: TestResult["status"]): string => {
  switch (status) {
    case "PASS":
      return "#4caf50";
    case "FAIL":
      return "#f44336";
    case "ERROR":
      return "#ff9800";
  }
};

function ReportTable({ tests }: { tests: TestResult[] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "monospace", fontSize: "14px" }}>
      <thead>
        <tr style={{ borderBottom: "2px solid #333" }}>
          <th style={thStyle}>ID</th>
          <th style={thStyle}>Description</th>
          <th style={thStyle}>Status</th>
          <th style={thStyle}>Duration</th>
          <th style={thStyle}>Expected</th>
          <th style={thStyle}>Actual</th>
        </tr>
      </thead>
      <tbody>
        {tests.map((t) => (
          <tr key={t.id} style={{ backgroundColor: statusColor(t.status) + "22", borderBottom: "1px solid #ddd" }}>
            <td style={tdStyle}><strong>{t.id}</strong></td>
            <td style={tdStyle}>{t.description}</td>
            <td style={{ ...tdStyle, color: statusColor(t.status), fontWeight: "bold" }}>{t.status}</td>
            <td style={tdStyle}>{t.durationMs.toFixed(1)}ms</td>
            <td style={tdStyle}>{t.expected}</td>
            <td style={tdStyle}>{t.actual}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const thStyle: React.CSSProperties = {
  padding: "8px 12px",
  textAlign: "left",
  fontWeight: "bold",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
};

export function Spike0b1Runner() {
  const [report, setReport] = useState<SpikeReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(true);

  const runSpike = useCallback(async () => {
    try {
      setRunning(true);
      const spikeReport = await runSqliteSpike();
      setReport(spikeReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    runSpike();
  }, [runSpike]);

  const copyReport = () => {
    if (report) {
      navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    }
  };

  if (running) {
    return (
      <div style={{ padding: "24px", fontFamily: "sans-serif" }}>
        <h1>Running SQLite Spike (T-00b.1)...</h1>
        <p>Executing 12 test cases against @capacitor-community/sqlite</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "24px", fontFamily: "sans-serif", backgroundColor: "#f4433622" }}>
        <h1>Spike Execution Error</h1>
        <pre>{error}</pre>
        <button onClick={runSpike} style={buttonStyle}>Retry</button>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div style={{ padding: "24px", fontFamily: "sans-serif", maxWidth: "1200px", margin: "0 auto" }}>
      <h1>E-00b T-00b.1 — SQLite via Capacitor Plugin</h1>
      <p><strong>Package:</strong> {report.packageName} v{report.packageVersion}</p>
      <p><strong>Platform:</strong> {report.platform}</p>
      <p><strong>Device:</strong> {report.deviceInfo.model} (API {report.deviceInfo.apiLevel}, WebView {report.deviceInfo.webViewVersion})</p>
      <p><strong>Timestamp:</strong> {report.timestamp}</p>

      <div style={{ margin: "20px 0", padding: "16px", backgroundColor: "#f5f5f5", borderRadius: "8px" }}>
        <h2>Result: {report.passed}/{report.tests.length} passed, {report.failed} failed</h2>
        {report.criticalFailed && (
          <div style={{ padding: "12px", backgroundColor: "#f44336", color: "white", borderRadius: "4px", fontWeight: "bold", marginTop: "8px" }}>
            CRITICAL FAILURE: Foreign key enforcement is not working. Capacitor SQLite cannot be used for this project.
          </div>
        )}
        {!report.criticalFailed && report.failed === 0 && (
          <div style={{ padding: "12px", backgroundColor: "#4caf50", color: "white", borderRadius: "4px", fontWeight: "bold", marginTop: "8px" }}>
            ALL 12 TESTS PASSED. Option D SQLite is validated for Capacitor Android.
          </div>
        )}
      </div>

      <ReportTable tests={report.tests} />

      {report.tests.filter((t) => t.error).length > 0 && (
        <div style={{ marginTop: "20px" }}>
          <h3>Error Details</h3>
          {report.tests.filter((t) => t.error).map((t) => (
            <pre key={t.id} style={{ backgroundColor: "#f4433611", padding: "8px", fontSize: "12px", whiteSpace: "pre-wrap" }}>
              {t.id}: {t.error}
            </pre>
          ))}
        </div>
      )}

      <div style={{ marginTop: "20px" }}>
        <button onClick={copyReport} style={buttonStyle}>Copy Report (JSON)</button>
        <button onClick={runSpike} style={{ ...buttonStyle, marginLeft: "8px" }}>Re-run Spike</button>
      </div>
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: "10px 20px",
  fontSize: "14px",
  cursor: "pointer",
  border: "1px solid #333",
  borderRadius: "4px",
  backgroundColor: "#fff",
};
