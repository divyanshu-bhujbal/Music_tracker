import { create } from 'zustand';

/**
 * Sync state machine states.
 * Matches 03_SYNC_STATE_MACHINE.md §2.
 */
export type SyncState = 'IDLE' | 'DIRTY' | 'SYNCING' | 'WARNING' | 'ALERT' | 'OFFLINE';

/**
 * State shape for the sync Zustand store.
 */
export interface SyncStoreState {
  /** Current sync state machine state */
  syncState: SyncState;
  /** Whether local DB has changes pending sync */
  isDirty: boolean;
  /** Number of records changed since last sync */
  pendingCount: number;
  /** ISO-8601 timestamp of last successful sync, or null if never synced */
  lastSyncTime: string | null;
  /** Error message from last failed sync (set on WARNING/ALERT) */
  errorMessage: string | null;
  /** Whether the device is currently online */
  isOnline: boolean;

  /** Reference to the SyncEngine instance, set during initialization */
  _syncEngineRef: unknown;

  // Actions
  setSyncState: (state: SyncState) => void;
  setDirty: (dirty: boolean, pendingCount?: number) => void;
  setOnline: (online: boolean) => void;
  setLastSyncTime: (time: string) => void;
  setError: (message: string | null) => void;
  setSyncEngine: (engine: unknown) => void;
  triggerSync: () => void;
  skipSync: () => void;
  reset: () => void;
}

/**
 * Zustand store managing sync state for the entire application.
 *
 * Consumed by the sidebar SyncStatusPanel, the sync button,
 * and the startup screen. Module-level singleton — no props, no context.
 *
 * State machine: IDLE → DIRTY → SYNCING → IDLE (success)
 *                SYNCING → WARNING (network/server failure)
 *                SYNCING → ALERT (decrypt/auth failure)
 *                Any → OFFLINE (network lost)
 */
export const useSyncStore = create<SyncStoreState>((set, get) => ({
  syncState: 'IDLE',
  isDirty: false,
  pendingCount: 0,
  lastSyncTime: null,
  errorMessage: null,
  isOnline: true,
  _syncEngineRef: null,

  setSyncState: (state: SyncState) => set({ syncState: state }),

  setDirty: (dirty: boolean, pendingCount?: number) =>
    set((s) => ({
      isDirty: dirty,
      pendingCount: pendingCount ?? s.pendingCount,
      syncState: dirty ? 'DIRTY' : s.syncState === 'DIRTY' ? 'IDLE' : s.syncState,
    })),

  setOnline: (online: boolean) =>
    set((s) => ({
      isOnline: online,
      syncState: online
        ? s.isDirty ? 'DIRTY' : 'IDLE'
        : 'OFFLINE',
    })),

  setLastSyncTime: (time: string) => set({ lastSyncTime: time }),

  setError: (message: string | null) => set({ errorMessage: message }),

  setSyncEngine: (engine: unknown) => {
    set({ _syncEngineRef: engine });
    console.debug('SyncEngine: store reference wired');
  },

  triggerSync: () => {
    const state = get();
    if (state.syncState === 'SYNCING') return;
    set({ syncState: 'SYNCING', errorMessage: null });
    if (state._syncEngineRef) {
      (state._syncEngineRef as { execute: () => void }).execute();
    }
  },

  skipSync: () => {
    // Store is unchanged — sync engine handles actual skip logic
  },

  reset: () =>
    set({
      syncState: 'IDLE',
      isDirty: false,
      pendingCount: 0,
      lastSyncTime: null,
      errorMessage: null,
      isOnline: true,
      _syncEngineRef: null,
    }),
}));

// ─── Selector hooks ─────────────────────────────────────────────────

/** Returns current sync state only */
export function useSyncState(): SyncState {
  return useSyncStore((s) => s.syncState);
}

/** Returns pending change count */
export function useSyncPendingCount(): number {
  return useSyncStore((s) => s.pendingCount);
}

/** Returns last successful sync time */
export function useSyncLastSyncTime(): string | null {
  return useSyncStore((s) => s.lastSyncTime);
}

/** Returns online status */
export function useSyncIsOnline(): boolean {
  return useSyncStore((s) => s.isOnline);
}

/** Returns error message from last failed sync */
export function useSyncError(): string | null {
  return useSyncStore((s) => s.errorMessage);
}
