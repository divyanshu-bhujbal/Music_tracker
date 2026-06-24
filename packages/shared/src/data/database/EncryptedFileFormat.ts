import type { CryptoProvider } from '../../domain/interfaces/CryptoProvider.js';
import { FormatError } from '../../domain/errors/FormatError.js';
import { VersionError } from '../../domain/errors/VersionError.js';

const MAGIC_BYTES = new Uint8Array([0x43, 0x4d, 0x44, 0x42]);
const FORMAT_VERSION = 0x01;
const HEADER_SIZE = 65;
const SALT_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Assembles and disassembles the constitution's binary encrypted file layout.
 *
 * The encrypted database file stored on Google Drive follows this format:
 * - Bytes 0–3:   Magic "CMDB" (0x434D4442)
 * - Byte 4:      Format version (0x01 for V1)
 * - Bytes 5–36:  Argon2id salt (32 bytes)
 * - Bytes 37–48: AES-GCM nonce (12 bytes)
 * - Bytes 49–64: AES-GCM authentication tag (16 bytes)
 * - Bytes 65+:   AES-256-GCM ciphertext (variable)
 *
 * The class receives a `CryptoProvider` via dependency injection and delegates
 * all cryptographic operations to it. This is pure platform-agnostic code —
 * it uses only `Uint8Array`, never `Buffer`.
 */
export class EncryptedFileFormat {
  private readonly cryptoProvider: CryptoProvider;

  constructor(cryptoProvider: CryptoProvider) {
    this.cryptoProvider = cryptoProvider;
  }

  /**
   * Encrypt a database and assemble the complete file with header.
   *
   * @param database - The plaintext database bytes.
   * @param key - A 32-byte AES-256 key from deriveKey().
   * @param salt - A 32-byte Argon2id salt (stored in header for key re-derivation).
   * @returns The complete encrypted file as a Uint8Array, ready for cloud upload.
   */
  async pack(
    database: Uint8Array,
    key: Uint8Array,
    salt: Uint8Array,
  ): Promise<Uint8Array> {
    if (salt.length !== SALT_BYTES) {
      throw new TypeError(
        `Salt must be exactly ${SALT_BYTES} bytes, got ${salt.length}`,
      );
    }

    const encrypted = await this.cryptoProvider.encryptDatabase(database, key);

    if (encrypted.nonce.length !== NONCE_BYTES) {
      throw new Error(
        `Nonce must be exactly ${NONCE_BYTES} bytes, got ${encrypted.nonce.length}`,
      );
    }
    if (encrypted.tag.length !== TAG_BYTES) {
      throw new Error(
        `Tag must be exactly ${TAG_BYTES} bytes, got ${encrypted.tag.length}`,
      );
    }

    const file = new Uint8Array(HEADER_SIZE + encrypted.ciphertext.length);
    file.set(MAGIC_BYTES, 0);
    file[4] = FORMAT_VERSION;
    file.set(salt, 5);
    file.set(encrypted.nonce, 37);
    file.set(encrypted.tag, 49);
    file.set(encrypted.ciphertext, 65);

    return file;
  }

  /**
   * Parse the header, validate magic/version, decrypt, and return the
   * plaintext database and salt.
   *
   * @param encrypted - The complete encrypted file from pack() or cloud download.
   * @param key - A 32-byte AES-256 key from deriveKey().
   * @returns The plaintext database and the salt (for local storage / key re-derivation).
   * @throws {FormatError} If magic bytes don't match or file is too short.
   * @throws {VersionError} If format version is not 0x01.
   * @throws {AuthenticationError} If the key is wrong or data is tampered.
   */
  async unpack(
    encrypted: Uint8Array,
    key: Uint8Array,
  ): Promise<{ database: Uint8Array; salt: Uint8Array }> {
    if (encrypted.length < HEADER_SIZE) {
      throw new FormatError(
        `File too short: expected at least ${HEADER_SIZE} bytes, got ${encrypted.length}`,
      );
    }

    const magic = encrypted.slice(0, 4);
    if (
      magic[0] !== MAGIC_BYTES[0] ||
      magic[1] !== MAGIC_BYTES[1] ||
      magic[2] !== MAGIC_BYTES[2] ||
      magic[3] !== MAGIC_BYTES[3]
    ) {
      throw new FormatError(
        `Invalid magic bytes: expected 0x434D4442 ("CMDB"), got 0x${magic[0].toString(16).padStart(2, '0')}${magic[1].toString(16).padStart(2, '0')}${magic[2].toString(16).padStart(2, '0')}${magic[3].toString(16).padStart(2, '0')}`,
      );
    }

    const version = encrypted[4];
    if (version !== FORMAT_VERSION) {
      throw new VersionError(
        `Unsupported format version: expected 0x${FORMAT_VERSION.toString(16).padStart(2, '0')}, got 0x${version.toString(16).padStart(2, '0')}`,
      );
    }

    const salt = encrypted.slice(5, 37);
    const nonce = encrypted.slice(37, 49);
    const tag = encrypted.slice(49, 65);
    const ciphertext = encrypted.slice(65);

    const database = await this.cryptoProvider.decryptDatabase(
      { ciphertext, nonce, tag },
      key,
    );

    return { database, salt };
  }
}
