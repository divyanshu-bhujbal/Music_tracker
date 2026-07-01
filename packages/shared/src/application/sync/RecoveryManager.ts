/**
 * Orchestrates corruption recovery pipeline.
 *
 * Detects local database corruption, downloads the encrypted cloud backup,
 * decrypts it, verifies integrity, and replaces the local database file.
 *
 * Platform-agnostic via injected callbacks — no platform conditionals.
 * Recovery is detection + documentation on Capacitor (AD-21), full restore
 * on Electron.
 */

import type { DatabaseConnection } from '../../data/database/DatabaseConnection.js';
import type { IntegrityReport } from '../../data/database/DatabaseIntegrityCheck.js';
import { DatabaseIntegrityCheck } from '../../data/database/DatabaseIntegrityCheck.js';
import type { EncryptedFileFormat } from '../../data/database/EncryptedFileFormat.js';
import type { AppMetadataRepository } from '../../data/repositories/AppMetadataRepository.js';
import type { CloudStorageProvider } from '../../domain/interfaces/CloudStorageProvider.js';
import { AuthenticationError } from '../../domain/errors/AuthenticationError.js';
import { FormatError } from '../../domain/errors/FormatError.js';
import { VersionError } from '../../domain/errors/VersionError.js';
import { DatabaseError } from '../../data/database/DatabaseError.js';

export type RecoveryStatus =
  | 'HEALTHY'
  | 'CORRUPT'
  | 'NO_CLOUD_BACKUP'
  | 'RECOVERING'
  | 'FAILED'
  | 'UNSUPPORTED_PLATFORM'
  | 'RECOVERED';

export interface RecoveryResult {
  status: RecoveryStatus;
  /** Human-readable explanation (e.g., "PRAGMA integrity_check: ..."). */
  reason?: string;
  /** ISO-8601 — modifiedTime of the cloud backup used for recovery. */
  cloudBackupTime?: string;
  /** true if the local DB had unsynced changes that are lost after recovery. */
  localChangesLost?: boolean;
  /** true if the recovery preserved data from the cloud backup. */
  recordsPreserved?: boolean;
}

export interface RecoveryManagerParams {
  /** To check local health. */
  integrityCheck: DatabaseIntegrityCheck;
  /** To download cloud backup. */
  cloudStorageProvider: CloudStorageProvider;
  /** To decrypt cloud backup. */
  encryptedFileFormat: EncryptedFileFormat;
  /** To read cloud_file_id. */
  appMetadataRepo: AppMetadataRepository;
  /** To obtain AES key. Returns null if unavailable. */
  getDerivedKey: () => Promise<Uint8Array | null>;
  /** To validate decrypted backup in memory. */
  openInMemoryDb: (bytes: Uint8Array) => Promise<DatabaseConnection>;
  /** To overwrite local DB (platform-specific). */
  replaceLocalDb: (bytes: Uint8Array) => Promise<void>;
  /** Network availability check. */
  isOnline: () => boolean;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export class RecoveryManager {
  private readonly integrityCheck: DatabaseIntegrityCheck;
  private readonly cloudStorageProvider: CloudStorageProvider;
  private readonly encryptedFileFormat: EncryptedFileFormat;
  private readonly appMetadataRepo: AppMetadataRepository;
  private readonly getDerivedKey: () => Promise<Uint8Array | null>;
  private readonly openInMemoryDb: (bytes: Uint8Array) => Promise<DatabaseConnection>;
  private readonly replaceLocalDb: (bytes: Uint8Array) => Promise<void>;
  private readonly isOnline: () => boolean;

  constructor(params: RecoveryManagerParams) {
    this.integrityCheck = params.integrityCheck;
    this.cloudStorageProvider = params.cloudStorageProvider;
    this.encryptedFileFormat = params.encryptedFileFormat;
    this.appMetadataRepo = params.appMetadataRepo;
    this.getDerivedKey = params.getDerivedKey;
    this.openInMemoryDb = params.openInMemoryDb;
    this.replaceLocalDb = params.replaceLocalDb;
    this.isOnline = params.isOnline;
  }

  /**
   * Attempt to recover from database corruption.
   *
   * Never throws — all error paths return `RecoveryResult` with
   * appropriate `status`. The caller handles the result.
   */
  async recover(): Promise<RecoveryResult> {
    // Step 1: Check local integrity
    let localHealth: IntegrityReport;
    try {
      localHealth = await this.integrityCheck.check();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`RecoveryManager: integrity check failed — ${msg}`);
      // If the integrity check itself fails, treat as corrupt
      localHealth = {
        healthy: false,
        integrityResult: `check failed: ${msg}`,
        foreignKeyViolations: 0,
        foreignKeyDetails: '',
        checkedAt: new Date().toISOString(),
      };
    }

    if (localHealth.healthy) {
      console.info('RecoveryManager: database is healthy — no recovery needed');
      return { status: 'HEALTHY' };
    }

    console.info(
      `RecoveryManager: starting recovery — detected corruption: ${localHealth.integrityResult}`,
    );

    // Step 2: Read cloud file ID
    const cloudFileId = await this.appMetadataRepo.get('cloud_file_id');
    if (!cloudFileId) {
      console.warn('RecoveryManager: recovery failed — NO_CLOUD_BACKUP');
      return {
        status: 'NO_CLOUD_BACKUP',
        reason:
          'No cloud backup available — never synced or cloud_file_id missing',
      };
    }

    // Step 3: Confirm online
    if (!this.isOnline()) {
      console.warn('RecoveryManager: recovery failed — offline');
      return {
        status: 'FAILED',
        reason: 'Offline — recovery requires internet access to download cloud backup',
      };
    }

    // Step 4: Download encrypted backup
    console.info(
      `RecoveryManager: downloading cloud backup (fileId length=${cloudFileId.length})`,
    );
    let downloadResult;
    try {
      downloadResult = await this.cloudStorageProvider.download(cloudFileId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`RecoveryManager: recovery failed — download failed: ${msg}`);
      return {
        status: 'FAILED',
        reason: `Failed to download cloud backup: ${msg}`,
      };
    }

    // Step 5: Decrypt backup
    console.info('RecoveryManager: decrypting cloud backup');
    const derivedKey = await this.getDerivedKey();
    if (!derivedKey) {
      console.warn('RecoveryManager: recovery failed — no derived key');
      return {
        status: 'FAILED',
        reason: 'No derived key — cannot decrypt cloud backup',
      };
    }

    let unpacked: { database: Uint8Array; salt: Uint8Array };
    try {
      unpacked = await this.encryptedFileFormat.unpack(
        downloadResult.data,
        derivedKey,
      );
    } catch (err) {
      if (err instanceof AuthenticationError) {
        console.warn('RecoveryManager: recovery failed — authentication error');
        return {
          status: 'FAILED',
          reason: 'Wrong password or tampered backup — GCM authentication tag rejected',
        };
      }
      if (err instanceof FormatError || err instanceof VersionError) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`RecoveryManager: recovery failed — format error: ${msg}`);
        return { status: 'FAILED', reason: msg };
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`RecoveryManager: recovery failed — decrypt error: ${msg}`);
      return { status: 'FAILED', reason: `Failed to decrypt backup: ${msg}` };
    }

    // Step 6: Verify decrypted backup integrity
    console.info('RecoveryManager: verifying decrypted backup integrity');
    let backupHealth: IntegrityReport;
    try {
      const inMemoryDb = await this.openInMemoryDb(unpacked.database);
      const backupIntegrityCheck = new DatabaseIntegrityCheck(inMemoryDb);
      backupHealth = await backupIntegrityCheck.check();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `RecoveryManager: recovery failed — backup verification error: ${msg}`,
      );
      return {
        status: 'FAILED',
        reason: `Failed to verify cloud backup integrity: ${msg}`,
      };
    }

    if (!backupHealth.healthy) {
      console.warn('RecoveryManager: recovery failed — cloud backup also corrupt');
      return {
        status: 'FAILED',
        reason:
          'Cloud backup is also corrupt — cannot recover from Google Drive either. ' +
          'The backup was uploaded while the database was damaged.',
      };
    }

    // Step 7: Replace local database
    console.info(
      `RecoveryManager: replacing local DB with recovered bytes (${unpacked.database.length} bytes)`,
    );

    try {
      await this.replaceLocalDb(unpacked.database);
    } catch (err) {
      if (err instanceof DatabaseError) {
        console.warn(
          'RecoveryManager: recovery failed — UNSUPPORTED_PLATFORM',
        );
        return {
          status: 'UNSUPPORTED_PLATFORM',
          reason:
            'Recovery requires a Windows device. See docs/BACKUP_RECOVERY.md for manual steps.',
        };
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `RecoveryManager: recovery failed — replace error: ${msg}`,
      );
      return {
        status: 'FAILED',
        reason: `Failed to replace local database: ${msg}`,
      };
    }

    // Clear last_successful_sync — recovery invalidates sync state
    try {
      await this.appMetadataRepo.set('last_successful_sync', '');
    } catch {
      // Non-critical — log and continue
      console.warn(
        'RecoveryManager: could not clear last_successful_sync after recovery',
      );
    }

    // Write the backup's salt to app_metadata on the NEW database
    try {
      await this.appMetadataRepo.set(
        'kdf_salt',
        bytesToHex(unpacked.salt),
      );
    } catch (err) {
      // Non-critical — the backup should already contain the correct salt.
      // Log and continue; the database is already recovered.
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `RecoveryManager: could not update kdf_salt after recovery: ${msg}`,
      );
    }

    console.info(
      `RecoveryManager: recovery complete — cloud backup from ${downloadResult.modifiedTime}`,
    );

    return {
      status: 'RECOVERED',
      cloudBackupTime: downloadResult.modifiedTime,
      localChangesLost: true,
      recordsPreserved: true,
    };
  }
}
