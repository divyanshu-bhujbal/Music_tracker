/**
 * Interface for network connectivity monitoring.
 *
 * Defined in shared/ so SyncEngine can depend on it without
 * importing the platform-specific NetworkMonitor implementation.
 * The platform package provides the concrete implementation.
 */
export interface NetworkMonitorInterface {
  isOnline(): boolean;
  onStatusChange(callback: (status: { isOnline: boolean }) => void): () => void;
  destroy(): void;
}
