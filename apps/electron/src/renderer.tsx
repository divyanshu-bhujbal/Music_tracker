import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@collectio/renderer/App";
import { createElectronPlatformAdapter } from "@collectio/platform/electron";

// TODO: Electron DI bridge — see AD-T15.1-04
// di.ts uses Node.js APIs (app.getPath, readFileSync) that are not
// available in the renderer context. Once a contextBridge-based DI
// solution is implemented, wrap <App> with ServiceProviderContext.Provider.
// Screens that depend on useServiceProvider() will throw at runtime
// until the DI bridge is wired.

declare global {
  interface Window {
    collectio?: {
      platform?: {
        showContextMenu: (items: Array<{ id: string; label: string }>) => Promise<string | null>;
        onKeyboardShortcut: (shortcut: string, callbackId: string) => void;
        offKeyboardShortcut: (callbackId: string) => void;
      };
    };
  }
}

const adapter = createElectronPlatformAdapter(window.collectio?.platform);

const rootElement = document.getElementById("root");

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App routerType="browser" platformAdapter={adapter} />
    </StrictMode>,
  );
} else {
  throw new Error("Root element #root not found in the DOM");
}
