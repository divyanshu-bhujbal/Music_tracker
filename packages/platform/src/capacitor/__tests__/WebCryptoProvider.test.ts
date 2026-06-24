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

import { WebCryptoProvider } from '../WebCryptoProvider.js';
import { AuthenticationError } from '@collectio/shared';

describe('WebCryptoProvider', () => {
  let provider: WebCryptoProvider;

  beforeEach(() => {
    provider = new WebCryptoProvider();
  });

  describe('deriveKey', () => {
    it('DK-01: same inputs produce same output (determinism)', async () => {
      const password = 'test';
      const salt = new Uint8Array(32).fill(0x01);

      const key1 = await provider.deriveKey(password, salt);
      const key2 = await provider.deriveKey(password, salt);

      expect(key1).toEqual(key2);
    });

    it('DK-02: different password produces different key', async () => {
      const salt = new Uint8Array(32).fill(0x01);

      const key1 = await provider.deriveKey('alpha', salt);
      const key2 = await provider.deriveKey('beta', salt);

      expect(key1).not.toEqual(key2);
    });

    it('DK-03: different salt produces different key', async () => {
      const password = 'test';
      const salt1 = new Uint8Array(32).fill(0x01);
      const salt2 = new Uint8Array(32).fill(0x02);

      const key1 = await provider.deriveKey(password, salt1);
      const key2 = await provider.deriveKey(password, salt2);

      expect(key1).not.toEqual(key2);
    });

    it('DK-04: output is exactly 32 bytes', async () => {
      const key = await provider.deriveKey('test', new Uint8Array(32).fill(0x01));

      expect(key.length).toBe(32);
    });

    it('DK-05: output is Uint8Array instance', async () => {
      const key = await provider.deriveKey('test', new Uint8Array(32).fill(0x01));

      expect(key).toBeInstanceOf(Uint8Array);
    });

    it('DK-06: empty password is accepted', async () => {
      const key = await provider.deriveKey('', new Uint8Array(32).fill(0x01));

      expect(key.length).toBe(32);
      expect(key).toBeInstanceOf(Uint8Array);
    });

    it('DK-07: password is UTF-8 encoded via TextEncoder for Unicode', async () => {
      const unicodePassword = 'パスワード';
      const salt = new Uint8Array(32).fill(0x01);

      const key = await provider.deriveKey(unicodePassword, salt);

      expect(key.length).toBe(32);
      expect(key).toBeInstanceOf(Uint8Array);
    });

    it('DK-08: salt not 32 bytes (too small) throws TypeError', async () => {
      await expect(
        provider.deriveKey('test', new Uint8Array(16)),
      ).rejects.toThrow(TypeError);
    });

    it('DK-09: salt not 32 bytes (too large) throws TypeError', async () => {
      await expect(
        provider.deriveKey('test', new Uint8Array(64)),
      ).rejects.toThrow(TypeError);
    });
  });

  describe('generateSalt', () => {
    it('GS-01: returns 32 bytes', () => {
      const salt = provider.generateSalt();
      expect(salt.length).toBe(32);
    });

    it('GS-02: returns Uint8Array', () => {
      const salt = provider.generateSalt();
      expect(salt).toBeInstanceOf(Uint8Array);
    });

    it('GS-03: two consecutive calls return different values', () => {
      const salt1 = provider.generateSalt();
      const salt2 = provider.generateSalt();

      const same = salt1.every((v, i) => v === salt2[i]);
      expect(same).toBe(false);
    });

    it('GS-04: 100 calls all produce unique values', () => {
      const salts = Array.from({ length: 100 }, () => provider.generateSalt());

      const seen = new Set<string>();
      for (const salt of salts) {
        const hex = Array.from(salt)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        seen.add(hex);
      }

      expect(seen.size).toBe(100);
    });
  });

  describe('encryptDatabase', () => {
    const testKey = new Uint8Array(32).fill(0xab);

    it('EN-01: returns EncryptedData with all three fields', async () => {
      const db = new Uint8Array(1024).fill(0x42);
      const result = await provider.encryptDatabase(db, testKey);

      expect(result).toHaveProperty('ciphertext');
      expect(result).toHaveProperty('nonce');
      expect(result).toHaveProperty('tag');
      expect(result.ciphertext).toBeInstanceOf(Uint8Array);
      expect(result.nonce).toBeInstanceOf(Uint8Array);
      expect(result.tag).toBeInstanceOf(Uint8Array);
    });

    it('EN-02: nonce is 12 bytes', async () => {
      const db = new Uint8Array(1024).fill(0x42);
      const result = await provider.encryptDatabase(db, testKey);

      expect(result.nonce.length).toBe(12);
    });

    it('EN-03: tag is 16 bytes', async () => {
      const db = new Uint8Array(1024).fill(0x42);
      const result = await provider.encryptDatabase(db, testKey);

      expect(result.tag.length).toBe(16);
    });

    it('EN-04: two calls produce different nonces', async () => {
      const db = new Uint8Array(1024).fill(0x42);
      const result1 = await provider.encryptDatabase(db, testKey);
      const result2 = await provider.encryptDatabase(db, testKey);

      const same = result1.nonce.every((v, i) => v === result2.nonce[i]);
      expect(same).toBe(false);
    });

    it('EN-05: two calls produce different ciphertexts', async () => {
      const db = new Uint8Array(1024).fill(0x42);
      const result1 = await provider.encryptDatabase(db, testKey);
      const result2 = await provider.encryptDatabase(db, testKey);

      const same = result1.ciphertext.every((v, i) => v === result2.ciphertext[i]);
      expect(same).toBe(false);
    });

    it('EN-06: empty plaintext succeeds', async () => {
      const db = new Uint8Array(0);
      const result = await provider.encryptDatabase(db, testKey);

      expect(result.ciphertext.length).toBe(0);
      expect(result.nonce.length).toBe(12);
      expect(result.tag.length).toBe(16);
    });

    it('EN-07: key not 32 bytes throws TypeError', async () => {
      const db = new Uint8Array(1024).fill(0x42);
      const shortKey = new Uint8Array(16).fill(0xab);

      await expect(
        provider.encryptDatabase(db, shortKey),
      ).rejects.toThrow(TypeError);
    });

    it('EN-08: key not 32 bytes (too long) throws TypeError', async () => {
      const db = new Uint8Array(1024).fill(0x42);
      const longKey = new Uint8Array(64).fill(0xab);

      await expect(
        provider.encryptDatabase(db, longKey),
      ).rejects.toThrow(TypeError);
    });
  });

  describe('decryptDatabase', () => {
    const testKey = new Uint8Array(32).fill(0xab);

    it('DE-01: round-trip encrypt → decrypt', async () => {
      const db = new Uint8Array(1024).fill(0x42);
      const encrypted = await provider.encryptDatabase(db, testKey);
      const decrypted = await provider.decryptDatabase(encrypted, testKey);

      expect(decrypted).toEqual(db);
    });

    it('DE-02: empty round-trip', async () => {
      const db = new Uint8Array(0);
      const encrypted = await provider.encryptDatabase(db, testKey);
      const decrypted = await provider.decryptDatabase(encrypted, testKey);

      expect(decrypted.length).toBe(0);
    });

    it('DE-03: wrong key throws AuthenticationError', async () => {
      const db = new Uint8Array(1024).fill(0x42);
      const encrypted = await provider.encryptDatabase(db, testKey);
      const wrongKey = new Uint8Array(32).fill(0xcd);

      await expect(
        provider.decryptDatabase(encrypted, wrongKey),
      ).rejects.toThrow(AuthenticationError);
    });

    it('DE-04: tampered ciphertext throws AuthenticationError', async () => {
      const db = new Uint8Array(1024).fill(0x42);
      const encrypted = await provider.encryptDatabase(db, testKey);

      const tampered = {
        ...encrypted,
        ciphertext: new Uint8Array(encrypted.ciphertext),
      };
      tampered.ciphertext[0] ^= 0xff;

      await expect(
        provider.decryptDatabase(tampered, testKey),
      ).rejects.toThrow(AuthenticationError);
    });

    it('DE-05: modified nonce throws AuthenticationError', async () => {
      const db = new Uint8Array(1024).fill(0x42);
      const encrypted = await provider.encryptDatabase(db, testKey);

      const modified = {
        ...encrypted,
        nonce: new Uint8Array(encrypted.nonce),
      };
      modified.nonce[0] ^= 0xff;

      await expect(
        provider.decryptDatabase(modified, testKey),
      ).rejects.toThrow(AuthenticationError);
    });

    it('DE-06: modified tag throws AuthenticationError', async () => {
      const db = new Uint8Array(1024).fill(0x42);
      const encrypted = await provider.encryptDatabase(db, testKey);

      const modified = {
        ...encrypted,
        tag: new Uint8Array(encrypted.tag),
      };
      modified.tag[0] ^= 0xff;

      await expect(
        provider.decryptDatabase(modified, testKey),
      ).rejects.toThrow(AuthenticationError);
    });

    it('DE-07: nonce not 12 bytes throws TypeError', async () => {
      const db = new Uint8Array(1024).fill(0x42);
      const encrypted = await provider.encryptDatabase(db, testKey);

      const badNonce = {
        ...encrypted,
        nonce: new Uint8Array(8),
      };

      await expect(
        provider.decryptDatabase(badNonce, testKey),
      ).rejects.toThrow(TypeError);
    });

    it('DE-08: tag not 16 bytes throws TypeError', async () => {
      const db = new Uint8Array(1024).fill(0x42);
      const encrypted = await provider.encryptDatabase(db, testKey);

      const badTag = {
        ...encrypted,
        tag: new Uint8Array(8),
      };

      await expect(
        provider.decryptDatabase(badTag, testKey),
      ).rejects.toThrow(TypeError);
    });

    it('DE-09: key not 32 bytes throws TypeError', async () => {
      const db = new Uint8Array(1024).fill(0x42);
      const encrypted = await provider.encryptDatabase(db, testKey);
      const shortKey = new Uint8Array(16).fill(0xab);

      await expect(
        provider.decryptDatabase(encrypted, shortKey),
      ).rejects.toThrow(TypeError);
    });

    it('DE-10: AuthenticationError has correct name', async () => {
      const db = new Uint8Array(1024).fill(0x42);
      const encrypted = await provider.encryptDatabase(db, testKey);
      const wrongKey = new Uint8Array(32).fill(0xcd);

      try {
        await provider.decryptDatabase(encrypted, wrongKey);
        fail('Expected AuthenticationError');
      } catch (err) {
        expect(err).toBeInstanceOf(AuthenticationError);
        expect((err as AuthenticationError).name).toBe('AuthenticationError');
      }
    });
  });

  describe('CF-12: Performance benchmark (Capacitor)', () => {
    beforeAll(() => {
      jest.setTimeout(30000);
    });

    it.skip('CF-12-01: 5MB encrypt + decrypt (10 iterations, mean <500ms)', async () => {
      // SKIPPED: crypto.subtle in Node.js is ~7s per 5MB iteration vs <50ms on
      // actual Android WebView. This test must run on real Capacitor hardware.
      // The Node.js environment is not representative of WebView performance.
      const data = new Uint8Array(5 * 1024 * 1024).fill(0x42);
      const key = new Uint8Array(32).fill(0xab);
      const durations: number[] = [];

      for (let i = 0; i < 10; i++) {
        const t0 = performance.now();
        const encrypted = await provider.encryptDatabase(data, key);
        const decrypted = await provider.decryptDatabase(encrypted, key);
        const t1 = performance.now();

        expect(decrypted).toEqual(data);
        durations.push(t1 - t0);
      }

      const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
      expect(mean).toBeLessThan(500);
    });

    it('CF-12-02: single encrypt (5MB) produces valid EncryptedData', async () => {
      const data = new Uint8Array(5 * 1024 * 1024).fill(0x42);
      const key = new Uint8Array(32).fill(0xab);

      const result = await provider.encryptDatabase(data, key);

      expect(result.ciphertext).toBeInstanceOf(Uint8Array);
      expect(result.nonce.length).toBe(12);
      expect(result.tag.length).toBe(16);
      expect(result.ciphertext.length).toBe(data.length);
    });
  });
});
