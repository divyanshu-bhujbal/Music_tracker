import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ServiceProvider } from '@collectio/shared';
import { ServiceProviderContext } from '@collectio/renderer/ServiceProviderContext';
import { createServices } from './di';
import App from '@collectio/renderer/App';

function Root() {
  const [services, setServices] = useState<ServiceProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    createServices()
      .then(setServices)
      .catch((err) => {
        console.error('Failed to initialize Capacitor services:', err);
        setError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  if (error) {
    return (
      <div style={{ padding: 24, fontFamily: 'monospace' }}>
        <h2 style={{ color: 'red' }}>Service initialization failed</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (services === null) {
    return (
      <div style={{ padding: 24, fontFamily: 'monospace' }}>
        <h2>Initializing platform services...</h2>
      </div>
    );
  }

  return (
    <ServiceProviderContext.Provider value={services}>
      <App />
    </ServiceProviderContext.Provider>
  );
}

const rootElement = document.getElementById('root');

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  );
} else {
  throw new Error('Root element #root not found in the DOM');
}
