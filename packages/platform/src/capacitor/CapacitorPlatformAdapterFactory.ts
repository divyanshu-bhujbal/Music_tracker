import { App } from '@capacitor/app';
import type { PlatformAdapter } from '@collectio/shared';

/**
 * Builds a Capacitor-specific PlatformAdapter.
 * Uses @capacitor/app for back button handling.
 */
export function createCapacitorPlatformAdapter(): PlatformAdapter {
  return {
    supportsHover: false,
    supportsContextMenu: false,
    supportsKeyboardShortcuts: false,
    hasBackButton: true,
    touchTargetSize: 48,
    columnWidthScale: 1.0,
    usesSafeAreaInsets: true,

    showContextMenu: () => {},

    onKeyboardShortcut: () => () => {},

    onBackButton(callback) {
      const handler = App.addListener('backButton', () => {
        callback();
      });
      return () => {
        handler.then((h) => h.remove());
      };
    },
  };
}
