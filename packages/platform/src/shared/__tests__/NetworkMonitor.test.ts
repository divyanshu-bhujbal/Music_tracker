import { NetworkMonitor } from '../NetworkMonitor.js';

function createMockWindow() {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    addEventListener: jest.fn((event: string, handler: () => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    }),
    removeEventListener: jest.fn((event: string, handler: () => void) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((h) => h !== handler);
      }
    }),
    dispatchEvent: jest.fn((event: Event) => {
      const handlers = listeners[event.type] ?? [];
      for (const handler of handlers) handler();
    }),
    _listeners: listeners,
  };
}

describe('NetworkMonitor', () => {
  const originalWindow = globalThis.window;
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      globalThis.window = originalWindow;
    }
    if (originalNavigator === undefined) {
      delete (globalThis as Record<string, unknown>).navigator;
    } else {
      globalThis.navigator = originalNavigator;
    }
  });

  function setupWindow(onLine = true) {
    const mockWindow = createMockWindow();
    (globalThis as Record<string, unknown>).window = mockWindow;
    (globalThis as Record<string, unknown>).navigator = { onLine };
    return mockWindow;
  }

  // NM-01
  it('isOnline() returns navigator.onLine value', () => {
    setupWindow(true);
    const monitor = new NetworkMonitor();
    expect(monitor.isOnline()).toBe(true);
    monitor.destroy();
  });

  // NM-02
  it('isOnline() returns false when offline', () => {
    setupWindow(false);
    const monitor = new NetworkMonitor();
    expect(monitor.isOnline()).toBe(false);
    monitor.destroy();
  });

  // NM-03
  it('registers online event listener on construction', () => {
    const mockWindow = setupWindow();
    const monitor = new NetworkMonitor();
    expect(mockWindow.addEventListener).toHaveBeenCalledWith('online', expect.any(Function));
    monitor.destroy();
  });

  // NM-04
  it('registers offline event listener on construction', () => {
    const mockWindow = setupWindow();
    const monitor = new NetworkMonitor();
    expect(mockWindow.addEventListener).toHaveBeenCalledWith('offline', expect.any(Function));
    monitor.destroy();
  });

  // NM-05
  it('onStatusChange callback fires on online event', () => {
    const mockWindow = setupWindow(false);
    const monitor = new NetworkMonitor();
    const cb = jest.fn();
    monitor.onStatusChange(cb);

    mockWindow.dispatchEvent(new Event('online'));

    expect(cb).toHaveBeenCalledWith({ isOnline: true });
    monitor.destroy();
  });

  // NM-06
  it('onStatusChange callback fires on offline event', () => {
    const mockWindow = setupWindow(true);
    const monitor = new NetworkMonitor();
    const cb = jest.fn();
    monitor.onStatusChange(cb);

    mockWindow.dispatchEvent(new Event('offline'));

    expect(cb).toHaveBeenCalledWith({ isOnline: false });
    monitor.destroy();
  });

  // NM-07
  it('multiple subscribers all receive notification', () => {
    const mockWindow = setupWindow();
    const monitor = new NetworkMonitor();
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    monitor.onStatusChange(cb1);
    monitor.onStatusChange(cb2);

    mockWindow.dispatchEvent(new Event('online'));

    expect(cb1).toHaveBeenCalledWith({ isOnline: true });
    expect(cb2).toHaveBeenCalledWith({ isOnline: true });
    monitor.destroy();
  });

  // NM-08
  it('unsubscribe removes callback', () => {
    const mockWindow = setupWindow();
    const monitor = new NetworkMonitor();
    const cb = jest.fn();
    const unsubscribe = monitor.onStatusChange(cb);

    unsubscribe();
    mockWindow.dispatchEvent(new Event('online'));

    expect(cb).not.toHaveBeenCalled();
    monitor.destroy();
  });

  // NM-09
  it('destroy() removes all DOM listeners', () => {
    const mockWindow = setupWindow();
    const monitor = new NetworkMonitor();
    const cb = jest.fn();
    monitor.onStatusChange(cb);

    monitor.destroy();
    mockWindow.dispatchEvent(new Event('online'));

    expect(cb).not.toHaveBeenCalled();
    expect(mockWindow.removeEventListener).toHaveBeenCalledWith('online', expect.any(Function));
    expect(mockWindow.removeEventListener).toHaveBeenCalledWith('offline', expect.any(Function));
  });

  // NM-10
  it('destroy() multiple times is safe', () => {
    setupWindow();
    const monitor = new NetworkMonitor();
    expect(() => {
      monitor.destroy();
      monitor.destroy();
    }).not.toThrow();
  });

  // NM-11
  it('callback fires synchronously on event', () => {
    const mockWindow = setupWindow();
    const monitor = new NetworkMonitor();
    const order: string[] = [];
    monitor.onStatusChange(() => {
      order.push('callback');
    });

    order.push('before');
    mockWindow.dispatchEvent(new Event('online'));
    order.push('after');

    expect(order).toEqual(['before', 'callback', 'after']);
    monitor.destroy();
  });
});
