const mockPluginStore = new Map<string, string>();

jest.mock('capacitor-secure-storage-plugin', () => ({
  SecureStoragePlugin: {
    set: jest.fn(async ({ key, value }: { key: string; value: string }) => {
      mockPluginStore.set(key, value);
    }),
    get: jest.fn(async ({ key }: { key: string }) => {
      const value = mockPluginStore.get(key);
      if (value === undefined) throw new Error('Item with given key does not exist');
      return { value };
    }),
    remove: jest.fn(async ({ key }: { key: string }) => {
      if (!mockPluginStore.has(key)) {
        throw new Error('Item with given key does not exist');
      }
      mockPluginStore.delete(key);
      return { value: true };
    }),
    keys: jest.fn(async () => ({
      value: Array.from(mockPluginStore.keys()),
    })),
  },
}));

import { CapacitorStorageProvider } from '../CapacitorStorageProvider.js';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';

const mockSecureStoragePlugin = jest.mocked(SecureStoragePlugin);

describe('CapacitorStorageProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPluginStore.clear();
  });

  describe('store()', () => {
    it('UT-01: calls SecureStoragePlugin.set() with correct key and value', async () => {
      const provider = new CapacitorStorageProvider();

      await provider.store('test-key', 'test-value');

      expect(mockSecureStoragePlugin.set).toHaveBeenCalledWith({ key: 'test-key', value: 'test-value' });
    });

    it('UT-02: propagates error from plugin', async () => {
      mockSecureStoragePlugin.set.mockRejectedValueOnce(new Error('Keystore error'));
      const provider = new CapacitorStorageProvider();

      await expect(provider.store('key', 'val')).rejects.toThrow('Keystore error');
    });
  });

  describe('retrieve()', () => {
    it('UT-03: returns result.value when key found', async () => {
      mockPluginStore.set('my-key', 'stored-val');
      const provider = new CapacitorStorageProvider();

      const result = await provider.retrieve('my-key');

      expect(result).toBe('stored-val');
    });

    it('UT-04: returns null when result.value is empty string', async () => {
      mockSecureStoragePlugin.get.mockResolvedValueOnce({ value: '' });
      const provider = new CapacitorStorageProvider();

      const result = await provider.retrieve('empty-key');

      expect(result).toBeNull();
    });

    it('UT-05: returns null when plugin throws (missing key)', async () => {
      mockSecureStoragePlugin.get.mockRejectedValueOnce(new Error('Item with given key does not exist'));
      const provider = new CapacitorStorageProvider();

      const result = await provider.retrieve('nonexistent');

      expect(result).toBeNull();
    });

    it('UT-06: returns null when plugin throws non-missing-key error', async () => {
      mockSecureStoragePlugin.get.mockRejectedValueOnce(new Error('Keystore failure'));
      const provider = new CapacitorStorageProvider();

      const result = await provider.retrieve('error-key');

      expect(result).toBeNull();
    });

    it('UT-17: returns null when result is null', async () => {
      mockSecureStoragePlugin.get.mockResolvedValueOnce(null as never);
      const provider = new CapacitorStorageProvider();

      const result = await provider.retrieve('null-key');

      expect(result).toBeNull();
    });

    it('UT-17b: returns null when result is undefined', async () => {
      mockSecureStoragePlugin.get.mockResolvedValueOnce(undefined as never);
      const provider = new CapacitorStorageProvider();

      const result = await provider.retrieve('undef-key');

      expect(result).toBeNull();
    });
  });

  describe('delete()', () => {
    it('UT-07: calls SecureStoragePlugin.remove() with correct key', async () => {
      mockPluginStore.set('del-key', 'del-value');
      const provider = new CapacitorStorageProvider();

      await provider.delete('del-key');

      expect(mockSecureStoragePlugin.remove).toHaveBeenCalledWith({ key: 'del-key' });
      expect(mockPluginStore.has('del-key')).toBe(false);
    });

    it('UT-08: swallows error containing "does not exist"', async () => {
      mockSecureStoragePlugin.remove.mockRejectedValueOnce(
        new Error('Item with given key does not exist'),
      );
      const provider = new CapacitorStorageProvider();

      await expect(provider.delete('nonexistent')).resolves.toBeUndefined();
    });

    it('UT-09: swallows error containing "does not exist" (case insensitive)', async () => {
      mockSecureStoragePlugin.remove.mockRejectedValueOnce(
        new Error('Key Does Not Exist'),
      );
      const provider = new CapacitorStorageProvider();

      await expect(provider.delete('nonexistent')).resolves.toBeUndefined();
    });

    it('UT-10: propagates error NOT containing "does not exist"', async () => {
      mockSecureStoragePlugin.remove.mockRejectedValueOnce(
        new Error('Keystore failure'),
      );
      const provider = new CapacitorStorageProvider();

      await expect(provider.delete('key')).rejects.toThrow('Keystore failure');
    });
  });

  describe('clear()', () => {
    it('UT-11: calls SecureStoragePlugin.keys() to enumerate keys', async () => {
      const provider = new CapacitorStorageProvider();

      await provider.clear();

      expect(mockSecureStoragePlugin.keys).toHaveBeenCalled();
    });

    it('UT-12: calls delete() for each key returned by keys()', async () => {
      mockPluginStore.set('k1', 'v1');
      mockPluginStore.set('k2', 'v2');
      const provider = new CapacitorStorageProvider();

      await provider.clear();

      // delete calls remove for each key
      expect(mockSecureStoragePlugin.remove).toHaveBeenCalledTimes(2);
      expect(mockSecureStoragePlugin.remove).toHaveBeenCalledWith({ key: 'k1' });
      expect(mockSecureStoragePlugin.remove).toHaveBeenCalledWith({ key: 'k2' });
    });

    it('UT-13: handles empty key array', async () => {
      mockSecureStoragePlugin.keys.mockResolvedValueOnce({ value: [] });
      const provider = new CapacitorStorageProvider();

      await provider.clear();

      expect(mockSecureStoragePlugin.remove).not.toHaveBeenCalled();
    });

    it('UT-14: propagates error from keys()', async () => {
      mockSecureStoragePlugin.keys.mockRejectedValueOnce(new Error('Keystore failure'));
      const provider = new CapacitorStorageProvider();

      await expect(provider.clear()).rejects.toThrow('Keystore failure');
    });

    it('UT-15: continues deleting remaining keys when one delete fails', async () => {
      mockPluginStore.set('k1', 'v1');
      mockPluginStore.set('k2', 'v2');

      // First call to keys returns both keys
      mockSecureStoragePlugin.keys.mockResolvedValueOnce({
        value: ['k1', 'k2'],
      });

      // First remove (k1) throws "does not exist" (swallowed by delete)
      // Second remove (k2) succeeds
      let removeCallCount = 0;
      mockSecureStoragePlugin.remove.mockImplementation(async ({ key }: { key: string }) => {
        removeCallCount++;
        if (key === 'k1' && removeCallCount === 1) {
          throw new Error('Item with given key does not exist');
        }
        mockPluginStore.delete(key);
        return { value: true };
      });

      const provider = new CapacitorStorageProvider();

      await provider.clear();

      // Both keys were attempted
      expect(mockSecureStoragePlugin.remove).toHaveBeenCalledTimes(2);
    });

    it('UT-15b: propagates first non-idempotent error from delete()', async () => {
      mockPluginStore.set('k1', 'v1');
      mockPluginStore.set('k2', 'v2');

      mockSecureStoragePlugin.keys.mockResolvedValueOnce({
        value: ['k1', 'k2'],
      });

      // First remove throws non-idempotent error
      let callIndex = 0;
      mockSecureStoragePlugin.remove.mockImplementation(async ({ key }: { key: string }) => {
        callIndex++;
        if (callIndex === 1) {
          throw new Error('Keystore failure');
        }
        mockPluginStore.delete(key);
        return { value: true };
      });

      const provider = new CapacitorStorageProvider();

      await expect(provider.clear()).rejects.toThrow('Keystore failure');

      // k2 was still attempted despite k1 failure
      expect(mockSecureStoragePlugin.remove).toHaveBeenCalledTimes(2);
    });
  });

  describe('Round-trip store/retrieve', () => {
    it('UT-16: returns original plaintext after store and retrieve', async () => {
      const provider = new CapacitorStorageProvider();

      await provider.store('roundtrip', 'hello world');
      const result = await provider.retrieve('roundtrip');

      expect(result).toBe('hello world');
    });

    it('handles empty string', async () => {
      const provider = new CapacitorStorageProvider();

      await provider.store('empty', '');
      const result = await provider.retrieve('empty');

      // Empty string returns null because result.value is empty
      expect(result).toBeNull();
    });

    it('handles unicode string', async () => {
      const provider = new CapacitorStorageProvider();

      await provider.store('unicode', '日本語テスト 🔐');
      const result = await provider.retrieve('unicode');

      expect(result).toBe('日本語テスト 🔐');
    });
  });

  describe('No console.* calls in production code', () => {
    it('UT-18: no console.log or console.error calls', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const provider = new CapacitorStorageProvider();

      await provider.store('key', 'value');
      await provider.retrieve('key');
      await provider.delete('key');
      await provider.clear();

      expect(consoleSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });
});
