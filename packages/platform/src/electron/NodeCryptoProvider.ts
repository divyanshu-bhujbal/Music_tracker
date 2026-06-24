import { hash, argon2id } from 'argon2';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { CryptoProvider, EncryptedData } from '@collectio/shared';
import { AuthenticationError } from '@collectio/shared';

const SALT_BYTES = 32;
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
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

  async encryptDatabase(db: Uint8Array, key: Uint8Array): Promise<EncryptedData> {
    if (key.length !== KEY_BYTES) {
      throw new TypeError(
        `Key must be exactly ${KEY_BYTES} bytes, got ${key.length}`,
      );
    }

    const nonce = new Uint8Array(randomBytes(NONCE_BYTES));
    const cipher = createCipheriv('aes-256-gcm', key, nonce);

    const encrypted = Buffer.concat([
      cipher.update(db),
      cipher.final(),
    ]);

    const tag = new Uint8Array(cipher.getAuthTag());

    return {
      ciphertext: new Uint8Array(encrypted),
      nonce,
      tag,
    };
  }

  async decryptDatabase(data: EncryptedData, key: Uint8Array): Promise<Uint8Array> {
    if (key.length !== KEY_BYTES) {
      throw new TypeError(
        `Key must be exactly ${KEY_BYTES} bytes, got ${key.length}`,
      );
    }
    if (data.nonce.length !== NONCE_BYTES) {
      throw new TypeError(
        `Nonce must be exactly ${NONCE_BYTES} bytes, got ${data.nonce.length}`,
      );
    }
    if (data.tag.length !== TAG_BYTES) {
      throw new TypeError(
        `Tag must be exactly ${TAG_BYTES} bytes, got ${data.tag.length}`,
      );
    }

    const decipher = createDecipheriv('aes-256-gcm', key, data.nonce);
    decipher.setAuthTag(data.tag);

    try {
      const decrypted = Buffer.concat([
        decipher.update(data.ciphertext),
        decipher.final(),
      ]);

      return new Uint8Array(decrypted);
    } catch {
      throw new AuthenticationError(
        'Decryption failed: authentication tag mismatch',
      );
    }
  }
}
