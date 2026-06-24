import argon2 from 'argon2-wasm';
import type { CryptoProvider } from '@collectio/shared';

const SALT_BYTES = 32;
const KEY_BYTES = 32;
const TIME_COST = 3;
const MEMORY_COST = 65536;
const PARALLELISM = 4;

export class WebCryptoProvider implements CryptoProvider {
  async deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
    if (salt.length !== SALT_BYTES) {
      throw new TypeError(
        `Salt must be exactly ${SALT_BYTES} bytes, got ${salt.length}`,
      );
    }

    const passBytes = new TextEncoder().encode(password);

    const result = await argon2.hash({
      pass: passBytes,
      salt,
      type: argon2.types.Argon2id,
      time: TIME_COST,
      mem: MEMORY_COST,
      parallelism: PARALLELISM,
      hashLen: KEY_BYTES,
    });

    return result.hash;
  }

  generateSalt(): Uint8Array {
    const buffer = new Uint8Array(SALT_BYTES);
    crypto.getRandomValues(buffer);
    return buffer;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async encryptDatabase(_db: Uint8Array, _key: Uint8Array): Promise<Uint8Array> {
    throw new Error(
      'encryptDatabase not yet implemented — see E03 T03.4',
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async decryptDatabase(_encrypted: Uint8Array, _key: Uint8Array): Promise<Uint8Array> {
    throw new Error(
      'decryptDatabase not yet implemented — see E03 T03.4',
    );
  }
}
