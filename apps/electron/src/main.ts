import { app, BrowserWindow, ipcMain } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServiceProvider } from '@collectio/shared';
import { createServices } from './di.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let services: ServiceProvider | null = null;

/**
 * Register IPC handlers that the preload bridge calls.
 * Each handler delegates to the corresponding ServiceProvider method.
 */
function registerIpcHandlers(): void {
  if (!services) return;

  // ── Crypto (Uint8Array ↔ base64 marshalling via Buffer) ───
  ipcMain.handle('collectio:crypto:deriveKey', async (_e, password: string, saltBase64: string) => {
    const salt = new Uint8Array(Buffer.from(saltBase64, 'base64'));
    const key = await services!.cryptoProvider.deriveKey(password, salt);
    return Buffer.from(key).toString('base64');
  });

  ipcMain.handle('collectio:crypto:generateSalt', async () => {
    const salt = services!.cryptoProvider.generateSalt();
    return Buffer.from(salt).toString('base64');
  });

  ipcMain.handle(
    'collectio:crypto:encryptDatabase',
    async (_e, dbBase64: string, keyBase64: string) => {
      const db = new Uint8Array(Buffer.from(dbBase64, 'base64'));
      const key = new Uint8Array(Buffer.from(keyBase64, 'base64'));
      const result = await services!.cryptoProvider.encryptDatabase(db, key);
      return {
        ciphertext: Buffer.from(result.ciphertext).toString('base64'),
        nonce: Buffer.from(result.nonce).toString('base64'),
        tag: Buffer.from(result.tag).toString('base64'),
      };
    },
  );

  ipcMain.handle(
    'collectio:crypto:decryptDatabase',
    async (
      _e,
      encrypted: { ciphertext: string; nonce: string; tag: string },
      keyBase64: string,
    ) => {
      const ciphertext = new Uint8Array(Buffer.from(encrypted.ciphertext, 'base64'));
      const nonce = new Uint8Array(Buffer.from(encrypted.nonce, 'base64'));
      const tag = new Uint8Array(Buffer.from(encrypted.tag, 'base64'));
      const key = new Uint8Array(Buffer.from(keyBase64, 'base64'));
      const result = await services!.cryptoProvider.decryptDatabase({ ciphertext, nonce, tag }, key);
      return Buffer.from(result).toString('base64');
    },
  );

  // ── Auth ────────────────────────────────────────────────────
  ipcMain.handle('collectio:auth:signIn', async () => {
    return services!.authProvider.signIn();
  });

  ipcMain.handle('collectio:auth:getStoredTokens', async () => {
    return services!.authProvider.getStoredTokens();
  });

  ipcMain.handle('collectio:auth:signOut', async () => {
    await services!.authProvider.signOut();
  });

  // ── Storage ─────────────────────────────────────────────────
  ipcMain.handle('collectio:storage:store', async (_e, key: string, value: string) => {
    await services!.storageProvider.store(key, value);
  });

  ipcMain.handle('collectio:storage:retrieve', async (_e, key: string) => {
    return services!.storageProvider.retrieve(key);
  });

  ipcMain.handle('collectio:storage:delete', async (_e, key: string) => {
    await services!.storageProvider.delete(key);
  });

  ipcMain.handle('collectio:storage:clear', async () => {
    await services!.storageProvider.clear();
  });

  // ── TokenRefresher ──────────────────────────────────────────
  ipcMain.handle('collectio:tokenRefresher:getAccessToken', async () => {
    return services!.tokenRefresher.getAccessToken();
  });

  ipcMain.handle('collectio:tokenRefresher:needsReauth', async () => {
    return services!.tokenRefresher.needsReauth;
  });

  // ── MigrationRunner ─────────────────────────────────────────
  ipcMain.handle('collectio:migrationRunner:run', async () => {
    return services!.migrationRunner.run();
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../dist-electron/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
    title: 'Collectio',
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173');
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  createServices()
    .then((s) => {
      services = s;
      registerIpcHandlers();
      createWindow();
    })
    .catch((err) => {
      console.error('Failed to initialize platform services:', err);
      app.quit();
    });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
