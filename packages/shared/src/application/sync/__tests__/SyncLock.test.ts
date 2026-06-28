import { SyncLock } from '../SyncLock.js';

describe('SyncLock', () => {
  // LK-01
  it('acquire() returns true when not held', () => {
    const lock = new SyncLock();
    expect(lock.acquire()).toBe(true);
  });

  // LK-02
  it('acquire() returns false when already held', () => {
    const lock = new SyncLock();
    expect(lock.acquire()).toBe(true);
    expect(lock.acquire()).toBe(false);
  });

  // LK-03
  it('isHeld() returns true after acquire', () => {
    const lock = new SyncLock();
    lock.acquire();
    expect(lock.isHeld()).toBe(true);
  });

  // LK-04
  it('isHeld() returns false after release', () => {
    const lock = new SyncLock();
    lock.acquire();
    lock.release();
    expect(lock.isHeld()).toBe(false);
  });

  // LK-05
  it('release() on unlocked lock is safe', () => {
    const lock = new SyncLock();
    expect(() => lock.release()).not.toThrow();
  });

  // LK-06
  it('re-acquire after release succeeds', () => {
    const lock = new SyncLock();
    expect(lock.acquire()).toBe(true);
    lock.release();
    expect(lock.acquire()).toBe(true);
  });

  // LK-07
  it('double release is safe', () => {
    const lock = new SyncLock();
    lock.acquire();
    lock.release();
    expect(() => lock.release()).not.toThrow();
  });

  // LK-08
  it('concurrent acquire attempts see consistent state', () => {
    const lock = new SyncLock();
    const first = lock.acquire();
    const second = lock.acquire();
    expect(first).toBe(true);
    expect(second).toBe(false);
  });
});
