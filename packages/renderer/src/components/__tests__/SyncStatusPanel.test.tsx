import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SyncStatusPanel } from '../SyncStatusPanel.js';
import type { SyncStatusPanelProps, SyncStatus } from '../SyncStatusPanel.js';

function createDefaultProps(overrides?: Partial<SyncStatusPanelProps>): SyncStatusPanelProps {
  return {
    status: 'synced',
    lastSyncTime: null,
    pendingChanges: 0,
    onSync: jest.fn(),
    ...overrides,
  };
}

describe('SyncStatusPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('SP-01: renders synced status with check icon', () => {
    render(<SyncStatusPanel {...createDefaultProps()} />);
    expect(screen.getByText('Synced')).toBeInTheDocument();
    expect(screen.getByTestId('CheckCircleIcon')).toBeInTheDocument();
  });

  it('SP-02: renders pending status with sync icon', () => {
    render(<SyncStatusPanel {...createDefaultProps({ status: 'pending' })} />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByTestId('SyncIcon')).toBeInTheDocument();
  });

  it('SP-03: renders warning status with warning icon', () => {
    render(<SyncStatusPanel {...createDefaultProps({ status: 'warning' })} />);
    expect(screen.getByText('Sync warning')).toBeInTheDocument();
    expect(screen.getByTestId('WarningIcon')).toBeInTheDocument();
  });

  it('SP-04: renders error status with error icon', () => {
    render(<SyncStatusPanel {...createDefaultProps({ status: 'error' })} />);
    expect(screen.getByText('Sync error')).toBeInTheDocument();
    expect(screen.getByTestId('ErrorIcon')).toBeInTheDocument();
  });

  it('SP-05: renders offline status with cloud off icon', () => {
    render(<SyncStatusPanel {...createDefaultProps({ status: 'offline' })} />);
    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(screen.getByTestId('CloudOffIcon')).toBeInTheDocument();
  });

  it('SP-06: onSync fires when sync button clicked', () => {
    const onSync = jest.fn();
    render(<SyncStatusPanel {...createDefaultProps({ onSync })} />);
    fireEvent.click(screen.getByLabelText('Sync status: Synced'));
    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it('SP-07: shows last sync time when provided', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    render(<SyncStatusPanel {...createDefaultProps({ lastSyncTime: fiveMinAgo })} />);
    expect(screen.getByText(/Last sync:/)).toBeInTheDocument();
    expect(screen.getByText(/5m ago/)).toBeInTheDocument();
  });

  it('SP-08: shows "just now" for recent sync time', () => {
    const justNow = new Date(Date.now() - 10 * 1000).toISOString();
    render(<SyncStatusPanel {...createDefaultProps({ lastSyncTime: justNow })} />);
    expect(screen.getByText(/just now/)).toBeInTheDocument();
  });

  it('SP-09: shows hours ago for older sync time', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    render(<SyncStatusPanel {...createDefaultProps({ lastSyncTime: twoHoursAgo })} />);
    expect(screen.getByText(/2h ago/)).toBeInTheDocument();
  });

  it('SP-10: shows days ago for very old sync time', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    render(<SyncStatusPanel {...createDefaultProps({ lastSyncTime: threeDaysAgo })} />);
    expect(screen.getByText(/3d ago/)).toBeInTheDocument();
  });

  it('SP-11: shows pending changes count when > 0', () => {
    render(<SyncStatusPanel {...createDefaultProps({ pendingChanges: 5 })} />);
    expect(screen.getByText('5 pending changes')).toBeInTheDocument();
  });

  it('SP-12: shows singular "pending change" when count is 1', () => {
    render(<SyncStatusPanel {...createDefaultProps({ pendingChanges: 1 })} />);
    expect(screen.getByText('1 pending change')).toBeInTheDocument();
  });

  it('SP-13: hides pending changes text when count is 0', () => {
    render(<SyncStatusPanel {...createDefaultProps({ pendingChanges: 0 })} />);
    expect(screen.queryByText(/pending change/)).not.toBeInTheDocument();
  });

  it('SP-14: collapsed mode renders icon button without text labels', () => {
    render(<SyncStatusPanel {...createDefaultProps({ collapsed: true })} />);
    expect(screen.queryByText('Synced')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Sync status: Synced')).toBeInTheDocument();
  });

  it('SP-15: collapsed mode onSync fires', () => {
    const onSync = jest.fn();
    render(<SyncStatusPanel {...createDefaultProps({ collapsed: true, onSync })} />);
    fireEvent.click(screen.getByLabelText('Sync status: Synced'));
    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it('SP-16: collapsed mode shows badge when pending changes > 0', () => {
    render(<SyncStatusPanel {...createDefaultProps({ collapsed: true, pendingChanges: 3 })} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('SP-17: collapsed mode hides badge when pending changes is 0', () => {
    render(<SyncStatusPanel {...createDefaultProps({ collapsed: true, pendingChanges: 0 })} />);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('SP-18: does not show last sync time when null', () => {
    render(<SyncStatusPanel {...createDefaultProps({ lastSyncTime: null })} />);
    expect(screen.queryByText(/Last sync/)).not.toBeInTheDocument();
  });
});
