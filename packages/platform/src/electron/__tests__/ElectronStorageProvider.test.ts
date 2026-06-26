const mockStore = new Map<string, string>();
let mockIsEncryptionAvailable = true;

jest.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: jest.fn(() => mockIsEncryptionAvailable),
    encryptString: jest.fn((value: string) => Buffer.from(`encrypted:${value}`)),
    decryptString: jest.fn((buffer: Buffer) => {
      const str = buffer.toString('utf-8');
      if (str.startsWith('encrypted:')) {
        return str.slice('encrypted:'.length);
      }
      throw new Error('Decryption failed');
    }),
  },
}));

jest.mock('electron-store', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      get: jest.fn((key: string) => mockStore.get(key)),
      set: jest.fn((key: string, value: string) => { mockStore.set(key, value); }),
      delete: jest.fn((key: string) => { mockStore.delete(key); }),
      clear: jest.fn(() => { mockStore.clear(); }),
    })),
  };
});

import { ElectronStorageProvider } from '../ElectronStorageProvider.js';
import { safeStorage } from 'electron';
import Store from 'electron-store';

const mockSafeStorage = jest.mocked(safeStorage);
const MockStore = jest.mocked(Store);

describe('ElectronStorageProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.clear();
    mockIsEncryptionAvailable = true;
  });

  describe('Constructor throws when encryption unavailable', () => {
    it('throws when isEncryptionAvailable returns false', () => {
      mockIsEncryptionAvailable = false;

      expect(() => new ElectronStorageProvider()).toThrow(
        'Encryption is not available on this system',
      );
    });

    it('logs error when isEncryptionAvailable returns false', () => {
      mockIsEncryptionAvailable = false;
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      try {
        new ElectronStorageProvider();
      } catch {
        // expected
      }

      expect(consoleSpy).toHaveBeenCalledWith(
        'safeStorage encryption is not available on this system',
      );
      consoleSpy.mockRestore();
    });
  });

  describe('Constructor succeeds when encryption available', () => {
    it('does not throw when isEncryptionAvailable returns true', () => {
      expect(() => new ElectronStorageProvider()).not.toThrow();
    });
  });

  describe('Constructor name parameter', () => {
    it('passes custom name to electron-store', () => {
      new ElectronStorageProvider('custom-name');

      expect(MockStore).toHaveBeenCalledWith({ name: 'custom-name' });
    });

    it('uses default "config" name when none provided', () => {
      new ElectronStorageProvider();

      expect(MockStore).toHaveBeenCalledWith({ name: 'config' });
    });
  });

  describe('store() encrypts and persists', () => {
    it('encrypts value via safeStorage.encryptString()', async () => {
      const provider = new ElectronStorageProvider();

      await provider.store('test-key', 'test-value');

      expect(mockSafeStorage.encryptString).toHaveBeenCalledWith('test-value');
    });

    it('base64-encodes encrypted buffer and writes to electron-store', async () => {
      const provider = new ElectronStorageProvider();

      await provider.store('test-key', 'test-value');

      const encryptedBuffer = Buffer.from('encrypted:test-value');
      const expectedBase64 = encryptedBuffer.toString('base64');

      expect(mockStore.get('test-key')).toBe(expectedBase64);
    });
  });

  describe('store() overwrites existing key', () => {
    it('returns latest value when stored twice', async () => {
      const provider = new ElectronStorageProvider();

      await provider.store('key', 'value-1');
      await provider.store('key', 'value-2');

      const result = await provider.retrieve('key');
      expect(result).toBe('value-2');
    });
  });

  describe('retrieve() reads and decrypts', () => {
    it('reads from electron-store and decrypts via safeStorage.decryptString()', async () => {
      const provider = new ElectronStorageProvider();

      await provider.store('my-key', 'my-value');
      jest.clearAllMocks();

      const result = await provider.retrieve('my-key');

      expect(result).toBe('my-value');
      expect(mockSafeStorage.decryptString).toHaveBeenCalled();
    });
  });

  describe('retrieve() returns null for missing keys', () => {
    it('returns null when key not found', async () => {
      const provider = new ElectronStorageProvider();

      const result = await provider.retrieve('nonexistent');

      expect(result).toBeNull();
    });

    it('returns null when store returns null', async () => {
      const provider = new ElectronStorageProvider();
      // Override the electronStore.get mock to return null
      (provider as unknown as { electronStore: { get: jest.Mock } }).electronStore.get = jest.fn(() => null);

      const result = await provider.retrieve('null-key');

      expect(result).toBeNull();
    });
  });

  describe('delete() removes key', () => {
    it('removes key from electron-store', async () => {
      const provider = new ElectronStorageProvider();

      await provider.store('del-key', 'del-value');
      await provider.delete('del-key');

      expect(mockStore.has('del-key')).toBe(false);
    });

    it('does not throw on missing key', async () => {
      const provider = new ElectronStorageProvider();

      await expect(provider.delete('nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('clear() removes all entries', () => {
    it('clears all entries from electron-store', async () => {
      const provider = new ElectronStorageProvider();

      await provider.store('key1', 'val1');
      await provider.store('key2', 'val2');
      await provider.clear();

      expect(mockStore.size).toBe(0);
    });

    it('does not throw on empty store', async () => {
      const provider = new ElectronStorageProvider();

      await expect(provider.clear()).resolves.toBeUndefined();
    });
  });

  describe('Error propagation', () => {
    it('propagates error when decryptString throws', async () => {
      const provider = new ElectronStorageProvider();

      // Store a value that will cause decryptString to throw
      mockStore.set('bad-key', Buffer.from('garbage').toString('base64'));
      mockSafeStorage.decryptString.mockImplementationOnce(() => {
        throw new Error('Decryption failed');
      });

      await expect(provider.retrieve('bad-key')).rejects.toThrow('Decryption failed');
    });

    it('propagates error when encryptString throws', async () => {
      const provider = new ElectronStorageProvider();
      mockSafeStorage.encryptString.mockImplementationOnce(() => {
        throw new Error('Encryption failed');
      });

      await expect(provider.store('key', 'val')).rejects.toThrow('Encryption failed');
    });
  });

  describe('Round-trip store/retrieve', () => {
    it('returns original plaintext after store and retrieve', async () => {
      const provider = new ElectronStorageProvider();

      await provider.store('roundtrip', 'hello world');
      const result = await provider.retrieve('roundtrip');

      expect(result).toBe('hello world');
    });

    it('handles empty string', async () => {
      const provider = new ElectronStorageProvider();

      await provider.store('empty', '');
      const result = await provider.retrieve('empty');

      expect(result).toBe('');
    });

    it('handles unicode string', async () => {
      const provider = new ElectronStorageProvider();

      await provider.store('unicode', '日本語テスト 🔐');
      const result = await provider.retrieve('unicode');

      expect(result).toBe('日本語テスト 🔐');
    });
  });
});
