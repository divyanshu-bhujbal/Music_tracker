
import { render, screen } from '@testing-library/react';
import { PlatformAdapterContext, usePlatformAdapter } from '../usePlatformAdapter.js';
import { createMockPlatformAdapter } from './__mocks__/platformAdapterMock.js';

function TestComponent() {
  const adapter = usePlatformAdapter();
  return (
    <div>
      <span data-testid="supportsHover">{String(adapter.supportsHover)}</span>
      <span data-testid="touchTargetSize">{String(adapter.touchTargetSize)}</span>
      <span data-testid="columnWidthScale">{String(adapter.columnWidthScale)}</span>
      <span data-testid="hasBackButton">{String(adapter.hasBackButton)}</span>
      <span data-testid="showContextMenu">{typeof adapter.showContextMenu}</span>
    </div>
  );
}

describe('usePlatformAdapter', () => {
  it('PA-01: returns adapter with supportsHover=true when provided by context', () => {
    const adapter = createMockPlatformAdapter({ supportsHover: true });
    render(
      <PlatformAdapterContext.Provider value={adapter}>
        <TestComponent />
      </PlatformAdapterContext.Provider>,
    );
    expect(screen.getByTestId('supportsHover').textContent).toBe('true');
  });

  it('PA-02: returns adapter with touchTargetSize=48 when provided by context', () => {
    const adapter = createMockPlatformAdapter({ touchTargetSize: 48 });
    render(
      <PlatformAdapterContext.Provider value={adapter}>
        <TestComponent />
      </PlatformAdapterContext.Provider>,
    );
    expect(screen.getByTestId('touchTargetSize').textContent).toBe('48');
  });

  it('PA-03: returns showContextMenu function matching injected value', () => {
    const showContextMenu = jest.fn();
    const adapter = createMockPlatformAdapter({ showContextMenu });
    render(
      <PlatformAdapterContext.Provider value={adapter}>
        <TestComponent />
      </PlatformAdapterContext.Provider>,
    );
    expect(screen.getByTestId('showContextMenu').textContent).toBe('function');
  });

  it('PA-04: returns noop adapter when rendered outside provider', () => {
    render(<TestComponent />);
    expect(screen.getByTestId('supportsHover').textContent).toBe('false');
    expect(screen.getByTestId('touchTargetSize').textContent).toBe('0');
    expect(screen.getByTestId('columnWidthScale').textContent).toBe('1');
  });

  it('PA-05: noop adapter showContextMenu() does not throw', () => {
    render(<TestComponent />);
    expect(screen.getByTestId('showContextMenu').textContent).toBe('function');
  });

  it('PA-06: noop adapter onKeyboardShortcut() returns unsubscribe function', () => {
    let adapter: ReturnType<typeof usePlatformAdapter> | null = null;
    function Capture() {
      adapter = usePlatformAdapter();
      return null;
    }
    render(<Capture />);
    expect(adapter).not.toBeNull();
    const unsub = adapter!.onKeyboardShortcut('Ctrl+N', jest.fn());
    expect(typeof unsub).toBe('function');
    expect(() => unsub()).not.toThrow();
  });

  it('PA-07: noop adapter onBackButton() returns unsubscribe function', () => {
    let adapter: ReturnType<typeof usePlatformAdapter> | null = null;
    function Capture() {
      adapter = usePlatformAdapter();
      return null;
    }
    render(<Capture />);
    expect(adapter).not.toBeNull();
    const unsub = adapter!.onBackButton(jest.fn());
    expect(typeof unsub).toBe('function');
    expect(() => unsub()).not.toThrow();
  });

  it('PA-08: hook re-renders when context value changes', () => {
    const adapter1 = createMockPlatformAdapter({ supportsHover: false });
    const adapter2 = createMockPlatformAdapter({ supportsHover: true });

    const { rerender } = render(
      <PlatformAdapterContext.Provider value={adapter1}>
        <TestComponent />
      </PlatformAdapterContext.Provider>,
    );
    expect(screen.getByTestId('supportsHover').textContent).toBe('false');

    rerender(
      <PlatformAdapterContext.Provider value={adapter2}>
        <TestComponent />
      </PlatformAdapterContext.Provider>,
    );
    expect(screen.getByTestId('supportsHover').textContent).toBe('true');
  });
});
