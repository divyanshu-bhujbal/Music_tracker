import type { CryptoProvider, EncryptedData } from '../../../index.js';
import { AuthenticationError } from '../../../index.js';
import { FormatError } from '../../../domain/errors/FormatError.js';
import { VersionError } from '../../../domain/errors/VersionError.js';
import { EncryptedFileFormat } from '../EncryptedFileFormat.js';

function createMockCryptoProvider(): {
  provider: CryptoProvider;
  encryptCalls: Array<{ db: Uint8Array; key: Uint8Array }>;
  decryptCalls: Array<{ data: EncryptedData; key: Uint8Array }>;
} {
  const encryptCalls: Array<{ db: Uint8Array; key: Uint8Array }> = [];
  const decryptCalls: Array<{ data: EncryptedData; key: Uint8Array }> = [];

  const mockNonce = new Uint8Array([
    0x10, 0x11, 0x12, 0x13, 0x14, 0x15,
    0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b,
  ]);
  const mockTag = new Uint8Array([
    0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27,
    0x28, 0x29, 0x2a, 0x2b, 0x2c, 0x2d, 0x2e, 0x2f,
  ]);

  const provider: CryptoProvider = {
    deriveKey: jest.fn(),
    generateSalt: jest.fn(),

    async encryptDatabase(db: Uint8Array, key: Uint8Array): Promise<EncryptedData> {
      encryptCalls.push({ db, key });
      const ciphertext = new Uint8Array(db.length);
      for (let i = 0; i < db.length; i++) {
        ciphertext[i] = db[i] ^ 0xff;
      }
      return { ciphertext, nonce: new Uint8Array(mockNonce), tag: new Uint8Array(mockTag) };
    },

    async decryptDatabase(data: EncryptedData, key: Uint8Array): Promise<Uint8Array> {
      decryptCalls.push({ data, key });
      if (key[0] === 0xff) {
        throw new AuthenticationError('Decryption failed: authentication tag mismatch');
      }
      if (data.tag[0] !== 0x20) {
        throw new AuthenticationError('Decryption failed: authentication tag mismatch');
      }
      const plaintext = new Uint8Array(data.ciphertext.length);
      for (let i = 0; i < data.ciphertext.length; i++) {
        plaintext[i] = data.ciphertext[i] ^ 0xff;
      }
      return plaintext;
    },
  };

  return { provider, encryptCalls, decryptCalls };
}

describe('EncryptedFileFormat', () => {
  describe('pack', () => {
    const testKey = new Uint8Array(32).fill(0xaa);
    const testSalt = new Uint8Array(32);
    for (let i = 0; i < 32; i++) testSalt[i] = i;

    it('PK-01: constructs file with correct structure', async () => {
      const { provider } = createMockCryptoProvider();
      const format = new EncryptedFileFormat(provider);
      const db = new Uint8Array(100).fill(0x42);

      const result = await format.pack(db, testKey, testSalt);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(65 + 100);
    });

    it('PK-02: header contains correct magic bytes', async () => {
      const { provider } = createMockCryptoProvider();
      const format = new EncryptedFileFormat(provider);
      const db = new Uint8Array(100).fill(0x42);

      const result = await format.pack(db, testKey, testSalt);

      expect(result[0]).toBe(0x43);
      expect(result[1]).toBe(0x4d);
      expect(result[2]).toBe(0x44);
      expect(result[3]).toBe(0x42);
    });

    it('PK-03: header contains correct version byte', async () => {
      const { provider } = createMockCryptoProvider();
      const format = new EncryptedFileFormat(provider);
      const db = new Uint8Array(100).fill(0x42);

      const result = await format.pack(db, testKey, testSalt);

      expect(result[4]).toBe(0x01);
    });

    it('PK-04: salt at correct position', async () => {
      const { provider } = createMockCryptoProvider();
      const format = new EncryptedFileFormat(provider);
      const db = new Uint8Array(100).fill(0x42);

      const result = await format.pack(db, testKey, testSalt);

      const saltInFile = result.slice(5, 37);
      expect(saltInFile).toEqual(testSalt);
    });

    it('PK-05: nonce at correct position', async () => {
      const { provider } = createMockCryptoProvider();
      const format = new EncryptedFileFormat(provider);
      const db = new Uint8Array(100).fill(0x42);

      const result = await format.pack(db, testKey, testSalt);

      const nonceInFile = result.slice(37, 49);
      expect(nonceInFile[0]).toBe(0x10);
      expect(nonceInFile[11]).toBe(0x1b);
    });

    it('PK-06: tag at correct position', async () => {
      const { provider } = createMockCryptoProvider();
      const format = new EncryptedFileFormat(provider);
      const db = new Uint8Array(100).fill(0x42);

      const result = await format.pack(db, testKey, testSalt);

      const tagInFile = result.slice(49, 65);
      expect(tagInFile[0]).toBe(0x20);
      expect(tagInFile[15]).toBe(0x2f);
    });

    it('PK-07: ciphertext at correct position', async () => {
      const { provider } = createMockCryptoProvider();
      const format = new EncryptedFileFormat(provider);
      const db = new Uint8Array(100).fill(0x42);

      const result = await format.pack(db, testKey, testSalt);

      const ciphertextInFile = result.slice(65);
      const expectedCiphertext = new Uint8Array(100);
      for (let i = 0; i < 100; i++) expectedCiphertext[i] = 0x42 ^ 0xff;
      expect(ciphertextInFile).toEqual(expectedCiphertext);
    });

    it('PK-08: empty database produces 65-byte file', async () => {
      const { provider } = createMockCryptoProvider();
      const format = new EncryptedFileFormat(provider);
      const db = new Uint8Array(0);

      const result = await format.pack(db, testKey, testSalt);

      expect(result.length).toBe(65);
    });

    it('PK-09: deterministic output', async () => {
      const { provider } = createMockCryptoProvider();
      const format = new EncryptedFileFormat(provider);
      const db = new Uint8Array(100).fill(0x42);

      const result1 = await format.pack(db, testKey, testSalt);
      const result2 = await format.pack(db, testKey, testSalt);

      expect(result1).toEqual(result2);
    });

    it('PK-10: salt not 32 bytes (too short) throws TypeError', async () => {
      const { provider } = createMockCryptoProvider();
      const format = new EncryptedFileFormat(provider);
      const db = new Uint8Array(100).fill(0x42);
      const badSalt = new Uint8Array(31);

      await expect(
        format.pack(db, testKey, badSalt),
      ).rejects.toThrow(TypeError);
    });

    it('PK-11: salt not 32 bytes (too long) throws TypeError', async () => {
      const { provider } = createMockCryptoProvider();
      const format = new EncryptedFileFormat(provider);
      const db = new Uint8Array(100).fill(0x42);
      const badSalt = new Uint8Array(33);

      await expect(
        format.pack(db, testKey, badSalt),
      ).rejects.toThrow(TypeError);
    });

    it('PK-12: encryptDatabase error propagation', async () => {
      const provider: CryptoProvider = {
        deriveKey: jest.fn(),
        generateSalt: jest.fn(),
        async encryptDatabase() {
          throw new Error('crypto failure');
        },
        async decryptDatabase() {
          return new Uint8Array(0);
        },
      };
      const format = new EncryptedFileFormat(provider);
      const db = new Uint8Array(100).fill(0x42);

      await expect(
        format.pack(db, testKey, testSalt),
      ).rejects.toThrow('crypto failure');
    });

    it('PK-13: encryptDatabase returns wrong nonce length → throws', async () => {
      const provider: CryptoProvider = {
        deriveKey: jest.fn(),
        generateSalt: jest.fn(),
        async encryptDatabase() {
          return { ciphertext: new Uint8Array(0), nonce: new Uint8Array(8), tag: new Uint8Array(16) };
        },
        async decryptDatabase() {
          return new Uint8Array(0);
        },
      };
      const format = new EncryptedFileFormat(provider);
      const db = new Uint8Array(100).fill(0x42);

      await expect(
        format.pack(db, testKey, testSalt),
      ).rejects.toThrow('Nonce must be exactly 12 bytes, got 8');
    });

    it('PK-14: encryptDatabase returns wrong tag length → throws', async () => {
      const provider: CryptoProvider = {
        deriveKey: jest.fn(),
        generateSalt: jest.fn(),
        async encryptDatabase() {
          return { ciphertext: new Uint8Array(0), nonce: new Uint8Array(12), tag: new Uint8Array(8) };
        },
        async decryptDatabase() {
          return new Uint8Array(0);
        },
      };
      const format = new EncryptedFileFormat(provider);
      const db = new Uint8Array(100).fill(0x42);

      await expect(
        format.pack(db, testKey, testSalt),
      ).rejects.toThrow('Tag must be exactly 16 bytes, got 8');
    });
  });

  describe('unpack', () => {
    const testKey = new Uint8Array(32).fill(0xaa);
    const wrongKey = new Uint8Array(32).fill(0xff);
    const testSalt = new Uint8Array(32);
    for (let i = 0; i < 32; i++) testSalt[i] = i;

    async function packForUnpack(
      db: Uint8Array,
      key: Uint8Array = testKey,
      salt: Uint8Array = testSalt,
    ): Promise<Uint8Array> {
      const { provider } = createMockCryptoProvider();
      const format = new EncryptedFileFormat(provider);
      return format.pack(db, key, salt);
    }

    it('UP-01: round-trip database matches', async () => {
      const { provider } = createMockCryptoProvider();
      const format = new EncryptedFileFormat(provider);
      const db = new Uint8Array(100).fill(0x42);

      const packed = await format.pack(db, testKey, testSalt);
      const { database } = await format.unpack(packed, testKey);

      expect(database).toEqual(db);
    });

    it('UP-02: round-trip salt matches', async () => {
      const { provider } = createMockCryptoProvider();
      const format = new EncryptedFileFormat(provider);
      const db = new Uint8Array(100).fill(0x42);

      const packed = await format.pack(db, testKey, testSalt);
      const { salt } = await format.unpack(packed, testKey);

      expect(salt).toEqual(testSalt);
    });

    it('UP-03: empty database round-trip', async () => {
      const { provider } = createMockCryptoProvider();
      const format = new EncryptedFileFormat(provider);
      const db = new Uint8Array(0);

      const packed = await format.pack(db, testKey, testSalt);
      const { database } = await format.unpack(packed, testKey);

      expect(database.length).toBe(0);
    });

    it('UP-04: FormatError on wrong magic', async () => {
      const packed = await packForUnpack(new Uint8Array(100).fill(0x42));
      packed[0] = 0x00;

      const { provider } = createMockCryptoProvider();
      const format = new EncryptedFileFormat(provider);

      await expect(
        format.unpack(packed, testKey),
      ).rejects.toThrow(FormatError);
    });

    it('UP-05: FormatError on all zeros', async () => {
      const packed = new Uint8Array(100).fill(0x00);
      const { provider } = createMockCryptoProvider();
      const format = new EncryptedFileFormat(provider);

      await expect(
        format.unpack(packed, testKey),
      ).rejects.toThrow(FormatError);
    });

    it('UP-06: VersionError on 0x02', async () => {
      const packed = await packForUnpack(new Uint8Array(100).fill(0x42));
      packed[4] = 0x02;

      const { provider } = createMockCryptoProvider();
      const format = new EncryptedFileFormat(provider);

      await expect(
        format.unpack(packed, testKey),
      ).rejects.toThrow(VersionError);
    });

    it('UP-07: VersionError on 0x00', async () => {
      const packed = await packForUnpack(new Uint8Array(100).fill(0x42));
      packed[4] = 0x00;

      const { provider } = createMockCryptoProvider();
      const format = new EncryptedFileFormat(provider);

      await expect(
        format.unpack(packed, testKey),
      ).rejects.toThrow(VersionError);
    });

    it('UP-08: FormatError on 64-byte file', async () => {
      const packed = new Uint8Array(64);
      packed[0] = 0x43;
      packed[1] = 0x4d;
      packed[2] = 0x44;
      packed[3] = 0x42;

      const { provider } = createMockCryptoProvider();
      const format = new EncryptedFileFormat(provider);

      await expect(
        format.unpack(packed, testKey),
      ).rejects.toThrow(FormatError);
    });

    it('UP-09: FormatError on 0-byte file', async () => {
      const packed = new Uint8Array(0);
      const { provider } = createMockCryptoProvider();
      const format = new EncryptedFileFormat(provider);

      await expect(
        format.unpack(packed, testKey),
      ).rejects.toThrow(FormatError);
    });

    it('UP-10: AuthenticationError on wrong key', async () => {
      const packed = await packForUnpack(new Uint8Array(100).fill(0x42));
      const { provider } = createMockCryptoProvider();
      const format = new EncryptedFileFormat(provider);

      await expect(
        format.unpack(packed, wrongKey),
      ).rejects.toThrow(AuthenticationError);
    });

    it('UP-11: AuthenticationError on tampered tag', async () => {
      const packed = await packForUnpack(new Uint8Array(100).fill(0x42));
      packed[49] ^= 0xff;

      const { provider } = createMockCryptoProvider();
      const format = new EncryptedFileFormat(provider);

      await expect(
        format.unpack(packed, testKey),
      ).rejects.toThrow(AuthenticationError);
    });

    it('UP-12: non-auth error propagates', async () => {
      const provider: CryptoProvider = {
        deriveKey: jest.fn(),
        generateSalt: jest.fn(),
        async encryptDatabase() {
          return { ciphertext: new Uint8Array(0), nonce: new Uint8Array(12), tag: new Uint8Array(16) };
        },
        async decryptDatabase() {
          throw new Error('unexpected error');
        },
      };
      const format = new EncryptedFileFormat(provider);
      const db = new Uint8Array(0);
      const packed = await format.pack(db, testKey, testSalt);

      await expect(
        format.unpack(packed, testKey),
      ).rejects.toThrow('unexpected error');
    });
  });

  describe('integration', () => {
    const testKey = new Uint8Array(32).fill(0xaa);
    const testSalt = new Uint8Array(32);
    for (let i = 0; i < 32; i++) testSalt[i] = i;

    it('IT-01: 1KB round-trip preserves all bytes', async () => {
      const { provider } = createMockCryptoProvider();
      const format = new EncryptedFileFormat(provider);
      const db = new Uint8Array(1024);
      for (let i = 0; i < 1024; i++) db[i] = i % 256;

      const packed = await format.pack(db, testKey, testSalt);
      const { database, salt } = await format.unpack(packed, testKey);

      expect(database).toEqual(db);
      expect(salt).toEqual(testSalt);
    });

    it('IT-02: 5MB round-trip preserves all bytes', async () => {
      const { provider } = createMockCryptoProvider();
      const format = new EncryptedFileFormat(provider);
      const db = new Uint8Array(5 * 1024 * 1024);
      for (let i = 0; i < db.length; i++) db[i] = i % 256;

      const packed = await format.pack(db, testKey, testSalt);
      const { database, salt } = await format.unpack(packed, testKey);

      expect(database).toEqual(db);
      expect(salt).toEqual(testSalt);
    });
  });
});
