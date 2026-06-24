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

  describe('encryptDatabase (stub)', () => {
    it('ED-STUB-01: throws not-implemented error', async () => {
      await expect(
        provider.encryptDatabase(new Uint8Array(1), new Uint8Array(32)),
      ).rejects.toThrow('not yet implemented');
    });
  });

  describe('decryptDatabase (stub)', () => {
    it('DD-STUB-01: throws not-implemented error', async () => {
      await expect(
        provider.decryptDatabase(new Uint8Array(1), new Uint8Array(32)),
      ).rejects.toThrow('not yet implemented');
    });
  });
});
