/**
 * Spike01_Runner.tsx
 *
 * T-00.1 SQLite Validation on Windows — Test Runner UI.
 * Displays all 12 test cases with pass/fail state, execution time, and error messages.
 * Provides a "Run Tests" action that executes all SQLite tests sequentially.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { runSQLiteSpike } from './Spike01_SQLite';
import {
  SQLiteTestResult,
  SQLiteSpikeSummary,
  SpikeState,
} from './Spike01_Types';

const PASS_COLOR = '#2e7d32';
const FAIL_COLOR = '#c62828';
const HEADER_BG = '#1a237e';
const CARD_BG = '#f5f5f5';
const BORDER_COLOR = '#e0e0e0';

/**
 * Renders a single test result row.
 */
function TestResultRow({ result }: { result: SQLiteTestResult }) {
  return (
    <View style={[styles.testRow, result.passed ? styles.testRowPass : styles.testRowFail]}>
      <View style={styles.testHeader}>
        <Text style={styles.testId}>{result.id}</Text>
        <Text style={styles.testName} numberOfLines={2}>
          {result.name}
        </Text>
        <Text style={styles.testDuration}>{result.durationMs}ms</Text>
        <Text style={[styles.testStatus, result.passed ? styles.statusPass : styles.statusFail]}>
          {result.passed ? '\u2713 PASS' : '\u2717 FAIL'}
        </Text>
      </View>
      {result.error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{result.error}</Text>
        </View>
      )}
    </View>
  );
}

/**
 * Renders the spike summary header.
 */
function SummaryHeader({ summary }: { summary: SQLiteSpikeSummary }) {
  return (
    <View style={styles.summaryContainer}>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Total:</Text>
        <Text style={styles.summaryValue}>{summary.total}</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={[styles.summaryValue, styles.passCount]}>{summary.passed} passed</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={[styles.summaryValue, styles.failCount]}>{summary.failed} failed</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Time:</Text>
        <Text style={styles.summaryValue}>{summary.totalDurationMs}ms</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Platform:</Text>
        <Text style={styles.summaryValue}>{Platform.OS}</Text>
      </View>
      <View style={[styles.summaryRow, styles.verdictRow]}>
        <Text
          style={[styles.verdict, summary.spikePassed ? styles.verdictPass : styles.verdictFail]}
        >
          {summary.spikePassed ? 'SPIKE PASSED' : 'SPIKE FAILED'}
        </Text>
      </View>
    </View>
  );
}

/**
 * Main runner component for T-00.1 SQLite Validation.
 */
export default function Spike01Runner() {
  const [state, setState] = useState<SpikeState>('idle');
  const [summary, setSummary] = useState<SQLiteSpikeSummary | null>(null);

  const handleRunTests = useCallback(async () => {
    setState('running');
    setSummary(null);
    try {
      const result = await runSQLiteSpike();
      setSummary(result);
    } catch (err) {
      setSummary({
        total: 0,
        passed: 0,
        failed: 1,
        results: [
          {
            id: 'ERR',
            name: 'Spike execution error',
            passed: false,
            durationMs: 0,
            error: err instanceof Error ? err.message : String(err),
          },
        ],
        spikePassed: false,
        totalDurationMs: 0,
      });
    } finally {
      setState('completed');
    }
  }, []);

  const handleReset = useCallback(() => {
    setState('idle');
    setSummary(null);
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>T-00.1 SQLite Validation</Text>
        <Text style={styles.subtitle}>React Native Windows Spike</Text>
      </View>

      {/* Action Buttons */}
      <View style={styles.buttonRow}>
        {state !== 'running' && (
          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary]}
            onPress={state === 'completed' ? handleReset : handleRunTests}
          >
            <Text style={styles.buttonText}>
              {state === 'completed' ? 'Re-run Tests' : 'Run Tests'}
            </Text>
          </TouchableOpacity>
        )}
        {state === 'running' && (
          <View style={styles.runningIndicator}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.runningText}>Running tests...</Text>
          </View>
        )}
      </View>

      {/* Performance threshold note */}
      <View style={styles.noteContainer}>
        <Text style={styles.noteText}>
          Performance threshold: each SQL operation {'<'} {50}ms
        </Text>
      </View>

      {/* Results */}
      {summary && (
        <>
          <SummaryHeader summary={summary} />
          {summary.results.map((result) => (
            <TestResultRow key={result.id} result={result} />
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    backgroundColor: HEADER_BG,
    padding: 20,
    borderRadius: 8,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#b0bec5',
  },
  buttonRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 6,
    alignItems: 'center',
  },
  buttonPrimary: {
    backgroundColor: '#1565c0',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  runningIndicator: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#455a64',
    paddingVertical: 14,
    borderRadius: 6,
    gap: 10,
  },
  runningText: {
    fontSize: 16,
    color: '#fff',
  },
  noteContainer: {
    backgroundColor: '#fff8e1',
    padding: 10,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#f9a825',
    marginBottom: 16,
  },
  noteText: {
    fontSize: 12,
    color: '#5d4037',
  },
  summaryContainer: {
    backgroundColor: CARD_BG,
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#616161',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
  },
  passCount: {
    color: PASS_COLOR,
  },
  failCount: {
    color: FAIL_COLOR,
  },
  verdictRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER_COLOR,
    justifyContent: 'center',
  },
  verdict: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  verdictPass: {
    color: PASS_COLOR,
  },
  verdictFail: {
    color: FAIL_COLOR,
  },
  testRow: {
    backgroundColor: CARD_BG,
    padding: 12,
    borderRadius: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
  },
  testRowPass: {
    borderLeftWidth: 4,
    borderLeftColor: PASS_COLOR,
  },
  testRowFail: {
    borderLeftWidth: 4,
    borderLeftColor: FAIL_COLOR,
  },
  testHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  testId: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#455a64',
    width: 50,
  },
  testName: {
    flex: 1,
    fontSize: 13,
    color: '#212121',
  },
  testDuration: {
    fontSize: 12,
    color: '#757575',
    marginLeft: 8,
    marginRight: 8,
    minWidth: 45,
    textAlign: 'right',
  },
  testStatus: {
    fontSize: 12,
    fontWeight: 'bold',
    minWidth: 70,
    textAlign: 'right',
  },
  statusPass: {
    color: PASS_COLOR,
  },
  statusFail: {
    color: FAIL_COLOR,
  },
  errorContainer: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#ffebee',
    borderRadius: 4,
  },
  errorText: {
    fontSize: 11,
    color: FAIL_COLOR,
    fontFamily: Platform.OS === 'windows' ? 'Consolas' : 'monospace',
  },
});
