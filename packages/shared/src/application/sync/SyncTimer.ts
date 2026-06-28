const MIN_DELAY_MS = 30_000; // 30 seconds
const MAX_DELAY_MS = 600_000; // 10 minutes

/**
 * Countdown timer that fires a callback after a configurable delay.
 *
 * Subsequent calls to `reset()` restart the countdown. This prevents
 * rapid consecutive edits from triggering multiple sync operations.
 *
 * Lifecycle: IDLE → COUNTING → EXPIRED (callback called, back to IDLE)
 *           COUNTING → PAUSED → COUNTING (resume from remaining)
 *           COUNTING/PAUSED → IDLE (cancel)
 */
export class SyncTimer {
  private delayMs: number;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private startTime = 0;
  private remainingMs = 0;
  private paused = false;
  private onExpiry: () => void;

  constructor(
    onExpiry: () => void,
    delayMs: number,
  ) {
    this.onExpiry = onExpiry;
    this.delayMs = clampDelay(delayMs);
  }

  /**
   * Replace the expiry callback without restarting the timer.
   *
   * @param callback - New callback to invoke on expiry.
   */
  setCallback(callback: () => void): void {
    this.onExpiry = callback;
    console.debug('SyncTimer: callback replaced');
  }

  /**
   * Start the timer. If already running, restarts with new delay.
   * Optional delay overrides the configured default.
   */
  start(delayMs?: number): void {
    if (delayMs !== undefined) {
      this.delayMs = delayMs;
    }
    this.cancelInternal();
    this.paused = false;
    this.startTime = Date.now();
    this.timerId = setTimeout(() => {
      this.timerId = null;
      console.debug('SyncTimer: expired');
      this.onExpiry();
    }, this.delayMs);
    console.debug(`SyncTimer: started (${this.delayMs}ms)`);
  }

  /**
   * Restart timer with the originally configured delay.
   */
  reset(): void {
    this.start(this.delayMs);
  }

  /**
   * Stop timer. Does NOT fire callback. No-op if not running.
   */
  cancel(): void {
    if (this.timerId !== null) {
      console.debug('SyncTimer: cancelled');
    }
    this.cancelInternal();
    this.paused = false;
  }

  /**
   * Stop timer and remember remaining milliseconds.
   * Next `resume()` continues from saved time.
   */
  pause(): void {
    if (this.timerId === null) {
      return; // no-op when not running
    }
    const elapsed = Date.now() - this.startTime;
    this.remainingMs = Math.max(0, this.delayMs - elapsed);
    this.cancelInternal();
    this.paused = true;
    console.debug(`SyncTimer: paused (${this.remainingMs}ms remaining)`);
  }

  /**
   * Restart timer from saved remaining time (from last `pause()`).
   * Throws if not paused.
   */
  resume(): void {
    if (!this.paused) {
      throw new Error('Timer is not paused');
    }
    this.paused = false;
    this.startTime = Date.now();
    this.timerId = setTimeout(() => {
      this.timerId = null;
      console.debug('SyncTimer: expired');
      this.onExpiry();
    }, this.remainingMs);
    console.debug(`SyncTimer: resumed (${this.remainingMs}ms remaining)`);
  }

  /**
   * Whether timer is currently counting down.
   */
  isRunning(): boolean {
    return this.timerId !== null;
  }

  /**
   * Estimated milliseconds remaining, or `0` if not running.
   */
  getRemainingMs(): number {
    if (this.timerId === null) return 0;
    const elapsed = Date.now() - this.startTime;
    return Math.max(0, this.delayMs - elapsed);
  }

  /**
   * Change the default delay without restarting.
   */
  setDelay(ms: number): void {
    this.delayMs = clampDelay(ms);
  }

  private cancelInternal(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }
}

function clampDelay(ms: number): number {
  return Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, ms));
}
