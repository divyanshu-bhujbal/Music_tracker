import { safeStorage } from 'electron';
import Store from 'electron-store';
import type { SecureStorageProvider } from '@collectio/shared';

/**
 * Electron (Windows) implementation of SecureStorageProvider.
 *
 * Stores string values in `electron-store` (a persistent JSON key-value store
 * in Electron's `userData` directory) with each value encrypted via
 * `safeStorage.encryptString()` (Windows DPAPI) before being written to disk.
 * On retrieval, values are decrypted via `safeStorage.decryptString()`.
 *
 * This ensures that even with filesystem access, an attacker cannot read
 * stored credentials in plaintext.
 */
export class ElectronStorageProvider implements SecureStorageProvider {
  private readonly electronStore: Store;

  constructor(name?: string) {
    if (!safeStorage.isEncryptionAvailable()) {
      console.error('safeStorage encryption is not available on this system');
      throw new Error('Encryption is not available on this system');
    }

    this.electronStore = new Store({ name: name ?? 'config' });
  }

  async store(key: string, value: string): Promise<void> {
    const encryptedBuffer = safeStorage.encryptString(value);
    const base64String = encryptedBuffer.toString('base64');
    this.electronStore.set(key, base64String);
  }

  async retrieve(key: string): Promise<string | null> {
    const base64String = this.electronStore.get(key) as string | undefined;

    if (base64String === undefined || base64String === null) {
      return null;
    }

    const encryptedBuffer = Buffer.from(base64String, 'base64');
    const plaintext = safeStorage.decryptString(encryptedBuffer);

    return plaintext;
  }

  async delete(key: string): Promise<void> {
    this.electronStore.delete(key);
  }

  async clear(): Promise<void> {
    this.electronStore.clear();
  }
}
