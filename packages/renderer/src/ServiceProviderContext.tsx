import { createContext, useContext } from 'react';
import type { ServiceProvider } from '@collectio/shared';

/**
 * React context for the ServiceProvider.
 *
 * In Capacitor, this is populated by createServices() in di.ts and
 * passed through the provider in index.tsx.
 *
 * In Electron, the renderer accesses services via window.collectio
 * (contextBridge) — this context is not used.
 */
export const ServiceProviderContext = createContext<ServiceProvider | null>(null);

/**
 * Hook to access the ServiceProvider from React components.
 * Throws if used outside a ServiceProviderContext.Provider.
 */
export function useServiceProvider(): ServiceProvider {
  const ctx = useContext(ServiceProviderContext);
  if (ctx === null) {
    throw new Error(
      'useServiceProvider must be used within a ServiceProviderContext.Provider',
    );
  }
  return ctx;
}
