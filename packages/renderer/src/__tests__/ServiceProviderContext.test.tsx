import { render, screen } from '@testing-library/react';
import { ServiceProviderContext, useServiceProvider } from '../ServiceProviderContext.js';

function TestComponent() {
  const ctx = useServiceProvider();
  return <div data-testid="provider">{ctx ? 'has-provider' : 'no-provider'}</div>;
}

function TestNoProvider() {
  return <ServiceProviderContext.Provider value={null}><TestComponent /></ServiceProviderContext.Provider>;
}

describe('ServiceProviderContext', () => {
  it('SPC-01: useServiceProvider throws when used outside provider', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestComponent />)).toThrow('useServiceProvider must be used within a ServiceProviderContext.Provider');
    consoleSpy.mockRestore();
  });

  it('SPC-02: useServiceProvider returns provider value when inside provider', () => {
    const mockProvider = { db: {} } as never;
    render(
      <ServiceProviderContext.Provider value={mockProvider}>
        <TestComponent />
      </ServiceProviderContext.Provider>
    );
    expect(screen.getByTestId('provider')).toHaveTextContent('has-provider');
  });

  it('SPC-03: useServiceProvider throws when value is null', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestNoProvider />)).toThrow('useServiceProvider must be used within a ServiceProviderContext.Provider');
    consoleSpy.mockRestore();
  });
});
