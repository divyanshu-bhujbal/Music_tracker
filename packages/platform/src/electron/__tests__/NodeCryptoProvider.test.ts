import { hash, argon2id } from 'argon2';
import { NodeCryptoProvider } from '../NodeCryptoProvider.js';

describe('NodeCryptoProvider', () => {
  let provider: NodeCryptoProvider;

  beforeEach(() => {
    provider = new NodeCryptoProvider();
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

    it('DK-07: argon2 library produces correct output against RFC 9106 test vector', async () => {
      const password = Buffer.alloc(32, 0x01);
      const salt = Buffer.alloc(16, 0x02);
      const secret = Buffer.alloc(8, 0x03);
      const ad = Buffer.alloc(12, 0x04);

      const result = await hash(password, {
        salt,
        raw: true,
        type: argon2id,
        timeCost: 3,
        memoryCost: 32,
        parallelism: 4,
        hashLength: 32,
        secret,
        associatedData: ad,
        version: 0x13,
      });

      const expected = Buffer.from(
        '0d640df58d78766c08c037a34a8b53c9d01ef045' +
          '2d75b65eb52520e96b01e659',
        'hex',
      );

      expect(Buffer.from(result)).toEqual(expected);
    });

    it('DK-08: salt not 32 bytes throws TypeError', async () => {
      await expect(
        provider.deriveKey('test', new Uint8Array(16)),
      ).rejects.toThrow(TypeError);

      await expect(
        provider.deriveKey('test', new Uint8Array(64)),
      ).rejects.toThrow(TypeError);
    });

    it('DK-09: completes under 500ms on mid-range hardware', async () => {
      const salt = new Uint8Array(32).fill(0x01);
      const start = performance.now();
      await provider.deriveKey('test', salt);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(500);
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
