/**
 * In-memory mutex preventing concurrent sync operations within a single process.
 *
 * A single holder can acquire the lock. Subsequent `acquire()` calls while held
 * return `false` — the caller must abort sync. Release returns the lock to
 * unheld state.
 *
 * No timeout — a stuck lock requires app restart (acceptable per V1).
 * No process-level or filesystem lock — V1 is single-process.
 */
export class SyncLock {
  private held = false;

  /**
   * Attempt to acquire the lock.
   *
   * @returns `true` if lock was acquired (was not held).
   *          `false` if already held — caller must abort sync.
   */
  acquire(): boolean {
    if (this.held) {
      console.warn('SyncLock: acquire denied — lock already held');
      return false;
    }
    this.held = true;
    return true;
  }

  /**
   * Release the lock. Safe to call if not held (no-op).
   * Must be called in `finally` to ensure cleanup.
   */
  release(): void {
    this.held = false;
  }

  /**
   * Whether the lock is currently held.
   */
  isHeld(): boolean {
    return this.held;
  }
}
