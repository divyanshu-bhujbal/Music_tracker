/**
 * Detect network connectivity state and notify subscribers on changes.
 *
 * Uses `navigator.onLine` for initial state and `window` `online`/`offline`
 * events for status changes. Works identically in Electron BrowserWindow
 * and Capacitor WebView.
 *
 * The 10-second debounce on offline→online transition (per sync state machine)
 * is implemented by the sync engine, not by NetworkMonitor.
 */
export class NetworkMonitor {
  private online: boolean;
  private subscribers: Array<(status: { isOnline: boolean }) => void> = [];
  private readonly onlineHandler: () => void;
  private readonly offlineHandler: () => void;

  constructor() {
    this.online = typeof navigator !== 'undefined' ? navigator.onLine : true;

    this.onlineHandler = () => {
      this.online = true;
      console.info('NetworkMonitor: online');
      this.notifySubscribers();
    };

    this.offlineHandler = () => {
      this.online = false;
      console.info('NetworkMonitor: offline');
      this.notifySubscribers();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onlineHandler);
      window.addEventListener('offline', this.offlineHandler);
    }

    console.debug(
      `NetworkMonitor: initialized (${this.online ? 'online' : 'offline'})`,
    );
  }

  /**
   * Current connectivity state.
   */
  isOnline(): boolean {
    return this.online;
  }

  /**
   * Register a callback for connectivity status changes.
   * Returns an unsubscribe function.
   */
  onStatusChange(
    callback: (status: { isOnline: boolean }) => void,
  ): () => void {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== callback);
    };
  }

  /**
   * Remove all event listeners. Call on app shutdown.
   */
  destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onlineHandler);
      window.removeEventListener('offline', this.offlineHandler);
    }
    this.subscribers = [];
  }

  private notifySubscribers(): void {
    for (const subscriber of this.subscribers) {
      subscriber({ isOnline: this.online });
    }
  }
}
