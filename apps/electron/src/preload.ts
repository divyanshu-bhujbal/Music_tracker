/**
 * Electron preload script — bridges main process services to the renderer.
 *
 * Uses contextBridge to expose a serialization-safe API surface.
 * Uint8Array values are marshalled as base64 strings across the bridge.
 * DatabaseConnection and AuthProvider.refreshAccessToken() are intentionally NOT exposed.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { MigrationReport } from '@collectio/shared';
import type { AuthTokens } from '@collectio/shared';

contextBridge.exposeInMainWorld('collectio', {
  crypto: {
    deriveKey: (password: string, saltBase64: string): Promise<string> =>
      ipcRenderer.invoke('collectio:crypto:deriveKey', password, saltBase64),

    generateSalt: (): Promise<string> =>
      ipcRenderer.invoke('collectio:crypto:generateSalt'),

    encryptDatabase: (
      dbBase64: string,
      keyBase64: string,
    ): Promise<{ ciphertext: string; nonce: string; tag: string }> =>
      ipcRenderer.invoke('collectio:crypto:encryptDatabase', dbBase64, keyBase64),

    decryptDatabase: (
      encrypted: { ciphertext: string; nonce: string; tag: string },
      keyBase64: string,
    ): Promise<string> =>
      ipcRenderer.invoke('collectio:crypto:decryptDatabase', encrypted, keyBase64),
  },

  auth: {
    signIn: (): Promise<AuthTokens> =>
      ipcRenderer.invoke('collectio:auth:signIn'),

    getStoredTokens: (): Promise<AuthTokens | null> =>
      ipcRenderer.invoke('collectio:auth:getStoredTokens'),

    signOut: (): Promise<void> =>
      ipcRenderer.invoke('collectio:auth:signOut'),
  },

  storage: {
    store: (key: string, value: string): Promise<void> =>
      ipcRenderer.invoke('collectio:storage:store', key, value),

    retrieve: (key: string): Promise<string | null> =>
      ipcRenderer.invoke('collectio:storage:retrieve', key),

    delete: (key: string): Promise<void> =>
      ipcRenderer.invoke('collectio:storage:delete', key),

    clear: (): Promise<void> =>
      ipcRenderer.invoke('collectio:storage:clear'),
  },

  tokenRefresher: {
    getAccessToken: (): Promise<string | null> =>
      ipcRenderer.invoke('collectio:tokenRefresher:getAccessToken'),

    needsReauth: (): Promise<boolean> =>
      ipcRenderer.invoke('collectio:tokenRefresher:needsReauth'),
  },

  migrationRunner: {
    runMigrations: (): Promise<MigrationReport> =>
      ipcRenderer.invoke('collectio:migrationRunner:run'),
  },

  platform: {
    showContextMenu: (items: Array<{ id: string; label: string }>): Promise<string | null> =>
      ipcRenderer.invoke('collectio:menu:showContextMenu', items),

    onKeyboardShortcut: (shortcut: string, callbackId: string): void => {
      ipcRenderer.send('collectio:shortcut:on', shortcut, callbackId);
    },

    offKeyboardShortcut: (callbackId: string): void => {
      ipcRenderer.send('collectio:shortcut:off', callbackId);
    },
  },
});
