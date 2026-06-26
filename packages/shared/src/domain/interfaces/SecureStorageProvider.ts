/**
 * Platform secure storage interface.
 *
 * Defines the contract between the application (AuthProvider, CryptoProvider
 * consumer code) and any platform secure storage implementation. Each platform
 * provides its own implementation:
 * - Electron: ElectronStorageProvider (electron-store + safeStorage DPAPI)
 * - Capacitor: CapacitorStorageProvider (capacitor-secure-storage-plugin / Android Keystore)
 *
 * All values are strings. Binary data must be encoded (e.g., base64) by the
 * caller before storage.
 */
export interface SecureStorageProvider {
  /**
   * Write a string value under the given key.
   * Overwrites if key already exists.
   *
   * @param key - The storage key.
   * @param value - The string value to store.
   */
  store(key: string, value: string): Promise<void>;

  /**
   * Read the string value for the given key.
   *
   * @param key - The storage key.
   * @returns The stored string value, or `null` if the key does not exist.
   */
  retrieve(key: string): Promise<string | null>;

  /**
   * Remove the given key from storage.
   * Must be idempotent — deleting a nonexistent key must not throw.
   *
   * @param key - The storage key to remove.
   */
  delete(key: string): Promise<void>;

  /**
   * Remove all stored key-value pairs.
   * Must not throw if the store is already empty.
   */
  clear(): Promise<void>;
}
