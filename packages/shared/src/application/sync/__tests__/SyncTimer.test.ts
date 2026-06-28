import { SyncTimer } from '../SyncTimer.js';

describe('SyncTimer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // TM-01
  it('start() fires callback after delay', () => {
    const cb = jest.fn();
    const timer = new SyncTimer(cb, 1000);

    timer.start(1000);
    jest.advanceTimersByTime(1000);

    expect(cb).toHaveBeenCalledTimes(1);
  });

  // TM-02
  it('start() does not fire before delay', () => {
    const cb = jest.fn();
    const timer = new SyncTimer(cb, 5000);

    timer.start(5000);
    jest.advanceTimersByTime(4000);

    expect(cb).not.toHaveBeenCalled();
  });

  // TM-03
  it('reset() restarts countdown', () => {
    const cb = jest.fn();
    const timer = new SyncTimer(cb, 1000);

    timer.start(1000);
    jest.advanceTimersByTime(500);
    timer.reset();
    jest.advanceTimersByTime(500);

    expect(cb).not.toHaveBeenCalled();
  });

  // TM-04
  it('reset() fires after full new delay', () => {
    const cb = jest.fn();
    const timer = new SyncTimer(cb, 1000);

    timer.start(1000);
    jest.advanceTimersByTime(500);
    timer.reset();
    jest.advanceTimersByTime(1000);

    expect(cb).toHaveBeenCalledTimes(1);
  });

  // TM-05
  it('cancel() prevents callback', () => {
    const cb = jest.fn();
    const timer = new SyncTimer(cb, 1000);

    timer.start(1000);
    timer.cancel();
    jest.advanceTimersByTime(5000);

    expect(cb).not.toHaveBeenCalled();
  });

  // TM-06
  it('pause() prevents callback', () => {
    const cb = jest.fn();
    const timer = new SyncTimer(cb, 1000);

    timer.start(1000);
    jest.advanceTimersByTime(300);
    timer.pause();
    jest.advanceTimersByTime(5000);

    expect(cb).not.toHaveBeenCalled();
  });

  // TM-07
  it('resume() after pause() fires with remaining time', () => {
    const cb = jest.fn();
    const timer = new SyncTimer(cb, 1000);

    timer.start(1000);
    jest.advanceTimersByTime(300);
    timer.pause();
    timer.resume();
    jest.advanceTimersByTime(700);

    expect(cb).toHaveBeenCalledTimes(1);
  });

  // TM-08
  it('pause() then cancel() then resume() throws', () => {
    const cb = jest.fn();
    const timer = new SyncTimer(cb, 1000);

    timer.start(1000);
    timer.pause();
    timer.cancel();

    expect(() => timer.resume()).toThrow('Timer is not paused');
  });

  // TM-09
  it('resume() without pause() throws', () => {
    const cb = jest.fn();
    const timer = new SyncTimer(cb, 1000);

    timer.start(1000);

    expect(() => timer.resume()).toThrow('Timer is not paused');
  });

  // TM-10
  it('isRunning() returns correct state', () => {
    const cb = jest.fn();
    const timer = new SyncTimer(cb, 1000);

    expect(timer.isRunning()).toBe(false);

    timer.start(1000);
    expect(timer.isRunning()).toBe(true);

    timer.cancel();
    expect(timer.isRunning()).toBe(false);

    timer.start(1000);
    timer.pause();
    expect(timer.isRunning()).toBe(false);

    timer.resume();
    expect(timer.isRunning()).toBe(true);

    jest.advanceTimersByTime(1000);
    expect(timer.isRunning()).toBe(false);
  });

  // TM-11
  it('getRemainingMs() returns estimate', () => {
    const cb = jest.fn();
    const timer = new SyncTimer(cb, 10000);

    timer.start(10000);
    jest.advanceTimersByTime(3000);

    const remaining = timer.getRemainingMs();
    expect(remaining).toBeGreaterThanOrEqual(6900);
    expect(remaining).toBeLessThanOrEqual(7100);
  });

  // TM-12
  it('setDelay() changes delay without restarting', () => {
    const cb = jest.fn();
    const timer = new SyncTimer(cb, 1000);

    timer.start(1000);
    timer.setDelay(5000);
    jest.advanceTimersByTime(1000);

    expect(cb).toHaveBeenCalledTimes(1);
  });

  // TM-13
  it('delay clamped below 30s', () => {
    const cb = jest.fn();
    const timer = new SyncTimer(cb, 1000);

    // Timer should use 30000ms (clamped)
    timer.start();
    jest.advanceTimersByTime(29999);
    expect(cb).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  // TM-14
  it('delay clamped above 600s', () => {
    const cb = jest.fn();
    const timer = new SyncTimer(cb, 999999);

    // Timer should use 600000ms (clamped)
    timer.start();
    jest.advanceTimersByTime(599999);
    expect(cb).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  // TM-15
  it('double start() restarts timer', () => {
    const cb = jest.fn();
    const timer = new SyncTimer(cb, 1000);

    timer.start(1000);
    jest.advanceTimersByTime(500);
    timer.start(1000);
    jest.advanceTimersByTime(500);

    expect(cb).not.toHaveBeenCalled();
    jest.advanceTimersByTime(500);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  // TM-16
  it('cancel() on idle timer is safe', () => {
    const cb = jest.fn();
    const timer = new SyncTimer(cb, 1000);

    expect(() => timer.cancel()).not.toThrow();
  });

  // TM-17
  it('timer only fires once per start()', () => {
    const cb = jest.fn();
    const timer = new SyncTimer(cb, 1000);

    timer.start(1000);
    jest.advanceTimersByTime(2000);

    expect(cb).toHaveBeenCalledTimes(1);
  });

  // TM-18
  it('setCallback() replaces callback', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    const timer = new SyncTimer(cb1, 1000);

    timer.setCallback(cb2);
    timer.start(1000);
    jest.advanceTimersByTime(1000);

    expect(cb2).toHaveBeenCalledTimes(1);
    expect(cb1).not.toHaveBeenCalled();
  });
});
