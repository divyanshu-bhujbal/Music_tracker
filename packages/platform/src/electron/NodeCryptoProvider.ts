import { hash, argon2id } from 'argon2';
import { randomBytes } from 'node:crypto';
import type { CryptoProvider } from '@collectio/shared';

const SALT_BYTES = 32;
const KEY_BYTES = 32;
const TIME_COST = 3;
const MEMORY_COST = 65536;
const PARALLELISM = 4;

export class NodeCryptoProvider implements CryptoProvider {
  async deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
    if (salt.length !== SALT_BYTES) {
      throw new TypeError(
        `Salt must be exactly ${SALT_BYTES} bytes, got ${salt.length}`,
      );
    }

    const result = await hash(password, {
      salt: Buffer.from(salt),
      raw: true,
      type: argon2id,
      timeCost: TIME_COST,
      memoryCost: MEMORY_COST,
      parallelism: PARALLELISM,
      hashLength: KEY_BYTES,
    });

    return new Uint8Array(result);
  }

  generateSalt(): Uint8Array {
    return new Uint8Array(randomBytes(SALT_BYTES));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async encryptDatabase(_db: Uint8Array, _key: Uint8Array): Promise<Uint8Array> {
    throw new Error(
      'encryptDatabase not yet implemented — see E03 T03.3',
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async decryptDatabase(_encrypted: Uint8Array, _key: Uint8Array): Promise<Uint8Array> {
    throw new Error(
      'decryptDatabase not yet implemented — see E03 T03.3',
    );
  }
}
