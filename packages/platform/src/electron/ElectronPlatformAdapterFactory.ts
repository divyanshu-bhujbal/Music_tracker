import type { PlatformAdapter } from '@collectio/shared';

/**
 * Types matching the preload bridge's exposed `window.collectio.platform` API.
 * Only serializable data crosses the context bridge — action callbacks stay in renderer.
 */
interface CollectioPlatformBridge {
  showContextMenu: (items: Array<{ id: string; label: string }>) => Promise<string | null>;
  onKeyboardShortcut: (shortcut: string, callbackId: string) => void;
  offKeyboardShortcut: (callbackId: string) => void;
}

/**
 * Builds an Electron-specific PlatformAdapter from the preload bridge.
 * If the bridge is absent (e.g. in tests), falls back to no-op methods.
 */
export function createElectronPlatformAdapter(
  windowBridge?: CollectioPlatformBridge,
): PlatformAdapter {
  const shortcutCallbacks = new Map<string, () => void>();

  return {
    supportsHover: true,
    supportsContextMenu: true,
    supportsKeyboardShortcuts: true,
    hasBackButton: false,
    touchTargetSize: 0,
    columnWidthScale: 1.3,
    usesSafeAreaInsets: false,

    showContextMenu(items) {
      if (!windowBridge) return;
      const bridgeItems = items.map(({ id, label }) => ({ id, label }));
      // Store action callbacks — the bridge only returns the selected id
      const callbackMap = new Map(items.map(({ id, action }) => [id, action]));
      windowBridge.showContextMenu(bridgeItems).then((selectedId) => {
        if (selectedId) {
          callbackMap.get(selectedId)?.();
        }
      });
    },

    onKeyboardShortcut(shortcut, callback) {
      if (!windowBridge) return () => {};
      const callbackId = crypto.randomUUID();
      shortcutCallbacks.set(callbackId, callback);
      windowBridge.onKeyboardShortcut(shortcut, callbackId);
      return () => {
        shortcutCallbacks.delete(callbackId);
        windowBridge.offKeyboardShortcut(callbackId);
      };
    },

    onBackButton: () => () => {},
  };
}
