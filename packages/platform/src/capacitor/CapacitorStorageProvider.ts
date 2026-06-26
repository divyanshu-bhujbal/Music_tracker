import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';
import type { SecureStorageProvider } from '@collectio/shared';

/**
 * Capacitor (Android) implementation of SecureStorageProvider.
 *
 * Stores and retrieves string values using `capacitor-secure-storage-plugin`,
 * which wraps Android Keystore for hardware-backed secure credential storage.
 * Unlike the Electron counterpart, no manual encryption is performed — Android
 * Keystore provides hardware-backed encryption automatically.
 *
 * Handles platform-specific quirks:
 * - Non-idempotent `remove()` (PL-03): wraps in try/catch per Rule 7.1
 * - Missing-key `get()` errors on aggressive OEMs: catches and returns null
 * - No native `clear()`: iterates all keys via `keys()` and deletes each
 */
export class CapacitorStorageProvider implements SecureStorageProvider {
  async store(key: string, value: string): Promise<void> {
    await SecureStoragePlugin.set({ key, value });
  }

  async retrieve(key: string): Promise<string | null> {
    try {
      const result = await SecureStoragePlugin.get({ key });
      return result?.value || null;
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await SecureStoragePlugin.remove({ key });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.toLowerCase().includes('does not exist')) throw err;
    }
  }

  async clear(): Promise<void> {
    const result = await SecureStoragePlugin.keys();
    const keys = result.value ?? [];

    let firstError: unknown = null;

    for (const key of keys) {
      try {
        await this.delete(key);
      } catch (err) {
        if (firstError === null) firstError = err;
      }
    }

    if (firstError !== null) throw firstError;
  }
}
