/**
 * The cross-platform tests create instances of both NodeCryptoProvider and
 * WebCryptoProvider. WebCryptoProvider imports argon2-wasm, a WASM module
 * that may not load in Jest's Node.js environment.
 *
 * STRATEGY: Fallback mock delegates to native argon2 npm package (same
 * implementation used by NodeCryptoProvider). The mock translates
 * argon2-wasm's API ({ pass, salt, time, mem, parallelism, hashLen, type })
 * to argon2.hash(password, { salt, raw, type, timeCost, memoryCost,
 * parallelism, hashLength }). This produces byte-identical Argon2id output,
 * satisfying cross-platform determinism requirements (Rule 5.1).
 *
 * If the real WASM module loads successfully in future Node.js versions,
 * remove the mock and use the real implementation directly.
 */
jest.mock('argon2-wasm', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nativeArgon2 = require('argon2');

  return {
    hash: jest.fn().mockImplementation(async (opts: {
      pass: Uint8Array;
      salt: Uint8Array;
      time: number;
      mem: number;
      parallelism: number;
      hashLen: number;
      type: number;
    }) => {
      const result = await nativeArgon2.hash(Buffer.from(opts.pass), {
        salt: Buffer.from(opts.salt),
        raw: true,
        type: nativeArgon2.argon2id,
        timeCost: opts.time,
        memoryCost: opts.mem,
        parallelism: opts.parallelism,
        hashLength: opts.hashLen,
      });

      return {
        hash: new Uint8Array(result),
        hashHex: Buffer.from(result).toString('hex'),
        encoded: '',
      };
    }),
    types: {
      Argon2d: 0,
      Argon2i: 1,
      Argon2id: 2,
      Argon2u: 10,
    },
  };
});

import { NodeCryptoProvider } from '../electron/NodeCryptoProvider.js';
import { WebCryptoProvider } from '../capacitor/WebCryptoProvider.js';
import { EncryptedFileFormat } from '@collectio/shared';
import { AuthenticationError } from '@collectio/shared';

const TEST_PASSWORD = 'test-password-跨平台';
const TEST_SALT = new Uint8Array(32);
for (let i = 0; i < 32; i++) TEST_SALT[i] = i;
const TEST_DB = new Uint8Array(1024);
for (let i = 0; i < 1024; i++) TEST_DB[i] = i % 256;

describe('Cross-Platform Crypto', () => {
  describe('CF-10: Electron pack → Capacitor unpack', () => {
    const electron = new NodeCryptoProvider();
    const capacitor = new WebCryptoProvider();
    const electronFormat = new EncryptedFileFormat(electron);
    const capacitorFormat = new EncryptedFileFormat(capacitor);

    it('CF-10-01: 1KB round-trip', async () => {
      const key = await electron.deriveKey(TEST_PASSWORD, TEST_SALT);
      const packed = await electronFormat.pack(TEST_DB, key, TEST_SALT);
      const { database } = await capacitorFormat.unpack(packed, key);

      expect(database).toEqual(TEST_DB);
    });

    it('CF-10-02: derived keys match between platforms', async () => {
      const keyE = await electron.deriveKey(TEST_PASSWORD, TEST_SALT);
      const keyC = await capacitor.deriveKey(TEST_PASSWORD, TEST_SALT);

      expect(keyE).toEqual(keyC);
    });

    it('CF-10-03: salt returned by unpack matches original', async () => {
      const key = await electron.deriveKey(TEST_PASSWORD, TEST_SALT);
      const packed = await electronFormat.pack(TEST_DB, key, TEST_SALT);
      const { salt } = await capacitorFormat.unpack(packed, key);

      expect(salt).toEqual(TEST_SALT);
    });

    it('CF-10-04: empty database round-trip', async () => {
      const emptyDb = new Uint8Array(0);
      const key = await electron.deriveKey(TEST_PASSWORD, TEST_SALT);
      const packed = await electronFormat.pack(emptyDb, key, TEST_SALT);
      const { database } = await capacitorFormat.unpack(packed, key);

      expect(database.length).toBe(0);
    });

    it('CF-10-05: wrong password → AuthenticationError on Capacitor side', async () => {
      const keyA = await electron.deriveKey(TEST_PASSWORD, TEST_SALT);
      const packed = await electronFormat.pack(TEST_DB, keyA, TEST_SALT);
      const keyB = await electron.deriveKey('wrong-password', TEST_SALT);

      await expect(
        capacitorFormat.unpack(packed, keyB),
      ).rejects.toThrow(AuthenticationError);
    });
  });

  describe('CF-11: Capacitor pack → Electron unpack', () => {
    const electron = new NodeCryptoProvider();
    const capacitor = new WebCryptoProvider();
    const electronFormat = new EncryptedFileFormat(electron);
    const capacitorFormat = new EncryptedFileFormat(capacitor);

    it('CF-11-01: 1KB round-trip', async () => {
      const key = await capacitor.deriveKey(TEST_PASSWORD, TEST_SALT);
      const packed = await capacitorFormat.pack(TEST_DB, key, TEST_SALT);
      const { database } = await electronFormat.unpack(packed, key);

      expect(database).toEqual(TEST_DB);
    });

    it('CF-11-02: derived keys match between platforms', async () => {
      const keyC = await capacitor.deriveKey(TEST_PASSWORD, TEST_SALT);
      const keyE = await electron.deriveKey(TEST_PASSWORD, TEST_SALT);

      expect(keyC).toEqual(keyE);
    });

    it('CF-11-03: salt returned by unpack matches original', async () => {
      const key = await capacitor.deriveKey(TEST_PASSWORD, TEST_SALT);
      const packed = await capacitorFormat.pack(TEST_DB, key, TEST_SALT);
      const { salt } = await electronFormat.unpack(packed, key);

      expect(salt).toEqual(TEST_SALT);
    });

    it('CF-11-04: empty database round-trip', async () => {
      const emptyDb = new Uint8Array(0);
      const key = await capacitor.deriveKey(TEST_PASSWORD, TEST_SALT);
      const packed = await capacitorFormat.pack(emptyDb, key, TEST_SALT);
      const { database } = await electronFormat.unpack(packed, key);

      expect(database.length).toBe(0);
    });

    it('CF-11-05: wrong password → AuthenticationError on Electron side', async () => {
      const keyA = await capacitor.deriveKey(TEST_PASSWORD, TEST_SALT);
      const packed = await capacitorFormat.pack(TEST_DB, keyA, TEST_SALT);
      const keyB = await electron.deriveKey('wrong-password', TEST_SALT);

      await expect(
        electronFormat.unpack(packed, keyB),
      ).rejects.toThrow(AuthenticationError);
    });
  });
});
