import argon2 from 'argon2-wasm';
import type { CryptoProvider, EncryptedData } from '@collectio/shared';
import { AuthenticationError } from '@collectio/shared';

const SALT_BYTES = 32;
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const TIME_COST = 3;
const MEMORY_COST = 65536;
const PARALLELISM = 4;

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  return view.buffer.slice(
    view.byteOffset,
    view.byteOffset + view.byteLength,
  ) as ArrayBuffer;
}

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

  async encryptDatabase(db: Uint8Array, key: Uint8Array): Promise<EncryptedData> {
    if (key.length !== KEY_BYTES) {
      throw new TypeError(
        `Key must be exactly ${KEY_BYTES} bytes, got ${key.length}`,
      );
    }

    const nonce = new Uint8Array(NONCE_BYTES);
    crypto.getRandomValues(nonce);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(key),
      { name: 'AES-GCM' },
      false,
      ['encrypt'],
    );

    const combined = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(nonce) },
      cryptoKey,
      toArrayBuffer(db),
    );

    const resultBytes = new Uint8Array(combined);
    const tag = resultBytes.slice(-TAG_BYTES);
    const ciphertext = resultBytes.slice(0, -TAG_BYTES);

    return { ciphertext, nonce, tag };
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

    const combined = new Uint8Array(data.ciphertext.length + TAG_BYTES);
    combined.set(data.ciphertext, 0);
    combined.set(data.tag, data.ciphertext.length);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(key),
      { name: 'AES-GCM' },
      false,
      ['decrypt'],
    );

    try {
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: toArrayBuffer(data.nonce) },
        cryptoKey,
        toArrayBuffer(combined),
      );

      return new Uint8Array(plaintext);
    } catch {
      throw new AuthenticationError(
        'Decryption failed: authentication tag mismatch',
      );
    }
  }
}
