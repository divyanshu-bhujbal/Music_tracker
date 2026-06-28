import type { DatabaseConnection } from '../../data/database/DatabaseConnection.js';
import type { CloudStorageProvider } from '../../domain/interfaces/CloudStorageProvider.js';
import type { ChangeSet } from './ChangeTracker.js';
import { DirtyStateTracker } from './DirtyStateTracker.js';
import { SyncTimer } from './SyncTimer.js';
import { SyncLock } from './SyncLock.js';
import { ChangeTracker } from './ChangeTracker.js';
import { ConflictResolver } from './ConflictResolver.js';
import type { NetworkMonitorInterface } from '../../domain/interfaces/NetworkMonitorInterface.js';
import { EncryptedFileFormat } from '../../data/database/EncryptedFileFormat.js';
import { AppMetadataRepository } from '../../data/repositories/AppMetadataRepository.js';
import { SyncLogRepository } from '../../data/repositories/SyncLogRepository.js';
import { DeviceRepository } from '../../data/repositories/DeviceRepository.js';
import { AppSettingsRepository } from '../../data/repositories/AppSettingsRepository.js';
import { useSyncStore } from './useSyncStore.js';
import { CloudStorageError } from '../../domain/errors/CloudStorageError.js';
import { AuthenticationError } from '../../domain/errors/AuthenticationError.js';
import { FormatError } from '../../domain/errors/FormatError.js';
import { VersionError } from '../../domain/errors/VersionError.js';
import { DatabaseError } from '../../data/database/DatabaseError.js';

/**
 * Result of a sync operation.
 */
export interface SyncResult {
  success: boolean;
  recordsAffected: number;
  conflictsResolved: number;
  newLocalOnly: number;
  newRemoteOnly: number;
  orphansResolved: number;
  errorMessage?: string;
  errorCode?: string;
  lastSyncTime: string | null;
}

/**
 * Internal sync engine state.
 */
export interface SyncEngineState {
  dirty: boolean;
  lastSync: string | null;
  pendingCount: number;
  timerRunning: boolean;
  online: boolean;
}

/**
 * Helper function to determine error code from an error.
 */
function determineErrorCode(error: unknown): string {
  if (error instanceof CloudStorageError) return error.code;
  if (error instanceof AuthenticationError) return 'DECRYPT_FAILED';
  if (error instanceof FormatError) return 'DECRYPT_FAILED';
  if (error instanceof VersionError) return 'DECRYPT_FAILED';
  if (error instanceof DatabaseError) return 'MERGE_FAILED';
  return 'UNKNOWN';
}

/**
 * Helper to get platform name.
 */
function getPlatform(): string {
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')) {
    return 'WINDOWS';
  }
  return 'ANDROID';
}

/**
 * SyncEngine orchestrates the complete 14-step sync algorithm.
 *
 * Coordinates all sync sub-components: lock → log → download → decrypt →
 * identify changes → merge → build merged DB → encrypt → upload → log success → unlock.
 *
 * Manages startup sync, shutdown sync, auto-sync timer, and failure recovery.
 */
export class SyncEngine {
  private consecutiveFailures = 0;
  private baseInterval = 120_000; // 2 minutes default
  private networkUnsubscribe: (() => void) | null = null;
  private onlineDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly db: DatabaseConnection,
    private readonly encryptedFileFormat: EncryptedFileFormat,
    private readonly cloudStorageProvider: CloudStorageProvider,
    private readonly dirtyStateTracker: DirtyStateTracker,
    private readonly syncTimer: SyncTimer,
    private readonly syncLock: SyncLock,
    private readonly changeTracker: ChangeTracker,
    private readonly conflictResolver: ConflictResolver,
    private readonly networkMonitor: NetworkMonitorInterface,
    private readonly appMetadataRepo: AppMetadataRepository,
    private readonly syncLogRepo: SyncLogRepository,
    private readonly deviceRepo: DeviceRepository,
    private readonly appSettingsRepo: AppSettingsRepository,
    /**
     * Helper to serialize a DatabaseConnection to bytes.
     * Platform-specific: Electron uses better-sqlite3.serialize(),
     * Capacitor uses sqlite3_backup or equivalent.
     */
    private readonly serializeDb: (db: DatabaseConnection) => Promise<Uint8Array>,
    /**
     * Helper to open an in-memory DatabaseConnection from bytes.
     * Platform-specific: creates a new in-memory SQLite DB with the given bytes.
     */
    private readonly openInMemoryDb: (bytes: Uint8Array) => Promise<DatabaseConnection>,
    /**
     * Helper to get the derived AES key from secure storage.
     * Returns null if not authenticated.
     */
    private readonly getDerivedKey: () => Promise<Uint8Array | null>,
  ) {}

  /**
   * Called once at app startup.
   *
   * 1. Register device if needed
   * 2. Read settings
   * 3. Configure timer
   * 4. Check dirty state
   * 5. Bind network events
   * 6. Conditionally perform startup sync
   */
  async initialize(): Promise<void> {
    console.info('SyncEngine: initializing...');

    // Step 1: Register device if not registered
    await this.ensureDeviceRegistered();

    // Step 2: Read settings
    const syncOnStartup = await this.getSetting('sync_on_startup', 'true');
    const delaySeconds = parseInt(await this.getSetting('auto_sync_delay_seconds', '120'), 10);
    this.baseInterval = delaySeconds * 1000;

    // Step 3: Configure timer
    this.syncTimer.setDelay(this.baseInterval);

    // Step 3b: Bind auto-sync timer callback
    const onAutoSyncExpiry = async () => {
      const isDirty = await this.dirtyStateTracker.isDirty();
      const isOnline = this.networkMonitor.isOnline();
      if (isDirty && isOnline) {
        await this.execute();
      }
    };
    this.syncTimer.setCallback(onAutoSyncExpiry);
    console.debug('SyncEngine: auto-sync timer callback bound');

    // Step 3c: Wire store reference for manual sync triggers
    useSyncStore.getState().setSyncEngine(this);
    console.debug('SyncEngine: store reference wired');

    // Step 4: Check dirty state
    const dirty = await this.dirtyStateTracker.isDirty();
    const pendingCount = await this.dirtyStateTracker.getPendingCount();
    const lastSync = await this.appMetadataRepo.get('last_successful_sync');

    // Step 5: Update store with initial state
    useSyncStore.getState().setDirty(dirty, pendingCount);
    useSyncStore.getState().setLastSyncTime(lastSync ?? '');
    useSyncStore.getState().setOnline(this.networkMonitor.isOnline());

    // Step 6: Bind network events
    this.networkUnsubscribe = this.networkMonitor.onStatusChange((status: { isOnline: boolean }) => {
      useSyncStore.getState().setOnline(status.isOnline);
      if (status.isOnline && dirty) {
        // 10-second debounce for auto-sync on reconnection
        this.scheduleOnlineSync();
      }
    });

    // Step 7: Bind timer
    this.syncTimer.start();

    console.info(
      `SyncEngine: initialized — sync_on_startup=${syncOnStartup}, delay=${delaySeconds}s, dirty=${dirty}, online=${this.networkMonitor.isOnline()}`,
    );

    // Step 8: Startup sync if conditions met
    if (
      syncOnStartup === 'true' &&
      dirty &&
      this.networkMonitor.isOnline()
    ) {
      console.info('SyncEngine: startup sync starting');
      try {
        const result = await this.execute();
        if (result.success) {
          console.info('SyncEngine: startup sync succeeded');
        } else {
          console.warn(`SyncEngine: startup sync failed — ${result.errorCode}: ${result.errorMessage}`);
          useSyncStore.getState().setSyncState('WARNING');
          useSyncStore.getState().setError(result.errorMessage ?? 'Sync failed');
        }
      } catch (err) {
        console.error(`SyncEngine: startup sync error — ${err instanceof Error ? err.message : String(err)}`);
        useSyncStore.getState().setSyncState('WARNING');
        useSyncStore.getState().setError(err instanceof Error ? err.message : String(err));
      }
    } else if (!dirty) {
      console.info('SyncEngine: initialized — not dirty, skipping sync');
    } else if (!this.networkMonitor.isOnline()) {
      console.info('SyncEngine: initialized — offline, skipping sync');
      useSyncStore.getState().setSyncState('OFFLINE');
    }

    console.info('SyncEngine: initialization complete');
  }

  /**
   * Execute the full 14-step sync algorithm.
   *
   * Acquires lock, runs all steps, logs to sync_log, releases lock.
   * Throws if lock cannot be acquired (returns LOCK_BUSY result).
   */
  async execute(): Promise<SyncResult> {
    // Step 1: Acquire lock
    if (!this.syncLock.acquire()) {
      console.warn('SyncEngine: sync lock busy — skipping');
      return {
        success: false,
        errorCode: 'LOCK_BUSY',
        errorMessage: 'Sync already in progress',
        recordsAffected: 0,
        conflictsResolved: 0,
        newLocalOnly: 0,
        newRemoteOnly: 0,
        orphansResolved: 0,
        lastSyncTime: null,
      };
    }

    useSyncStore.getState().setSyncState('SYNCING');

    let syncLogId: number | null = null;
    let previousLastSync: string | null = null;

    try {
      // Step 2: Create sync_log entry
      const deviceId = await this.getDeviceId();
      const syncLog = await this.syncLogRepo.create({
        device_id: deviceId,
        direction: 'MERGE',
      });
      syncLogId = syncLog.id;

      // Step 3: Download cloud DB
      const cloudFileId = await this.appMetadataRepo.get('cloud_file_id');
      let cloudData: Uint8Array | null = null;

      if (cloudFileId) {
        console.debug('SyncEngine: step 3/14 — downloading cloud DB');
        const downloadResult = await this.cloudStorageProvider.download(cloudFileId);
        cloudData = downloadResult.data;
      }

      // Step 4: Decrypt cloud DB to in-memory SQLite
      let cloudInMemoryDb: DatabaseConnection | null = null;
      let kdfSalt: Uint8Array | null = null;
      let derivedKey: Uint8Array | null = null;

      if (cloudData) {
        console.debug('SyncEngine: step 4/14 — decrypting cloud DB');
        const saltHex = await this.appMetadataRepo.get('kdf_salt');
        if (saltHex) {
          kdfSalt = this.hexToBytes(saltHex);
        }

        const keyBytes = await this.getDerivedKey();
        if (!keyBytes) {
          throw new AuthenticationError('Derived key not available — cannot decrypt');
        }
        derivedKey = keyBytes;

        const unpacked = await this.encryptedFileFormat.unpack(cloudData, derivedKey);
        cloudInMemoryDb = await this.openInMemoryDb(unpacked.database);
        kdfSalt = unpacked.salt;
      }

      // Step 5: Get last_successful_sync
      previousLastSync = await this.appMetadataRepo.get('last_successful_sync');
      const lastSyncTime = previousLastSync ?? null;

      // Step 6: Identify local changes
      console.debug('SyncEngine: step 6/14 — identifying local changes');
      const localChanges = await this.changeTracker.getLocalChanges(lastSyncTime);

      // Step 7: Identify remote changes
      let remoteChanges: ChangeSet = new Map();
      if (cloudInMemoryDb) {
        console.debug('SyncEngine: step 7/14 — identifying remote changes');
        remoteChanges = await this.changeTracker.getRemoteChanges(cloudInMemoryDb, lastSyncTime);
      }

      // Step 8: LWW Merge (pure computation)
      console.debug('SyncEngine: step 8/14 — LWW merge');
      const mergeResult = this.conflictResolver.resolve(localChanges, remoteChanges);

      // Step 9: Build merged copy — apply winners to a copy, NOT the live DB
      // 9a: Serialize live DB to bytes
      console.debug('SyncEngine: step 9/14 — building merged copy');
      const liveBytes = await this.serializeDb(this.db);

      // 9b: Create in-memory DB from live bytes
      const mergedDb = await this.openInMemoryDb(liveBytes);

      // 9c: Apply winners to merged copy only
      await this.applyWinnersToDb(mergedDb, mergeResult.winners);
      console.debug(
        `SyncEngine: step 9c/14 — ${mergeResult.totalRecordsAffected} winners applied to merged copy`,
      );

      // 9d: Resolve orphans in merged copy
      const orphanReport = await this.conflictResolver.resolveOrphans(mergedDb);
      console.debug(
        `SyncEngine: step 9d/14 — ${orphanReport.orphansFound} orphans resolved in merged copy`,
      );

      // Step 10: Update last_successful_sync in MERGED COPY only
      const now = new Date().toISOString();
      await mergedDb.execute(
        "INSERT INTO app_metadata (key, value) VALUES ('last_successful_sync', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [now],
      );

      // Step 11: Serialize merged copy + encrypt
      console.debug('SyncEngine: step 11/14 — serializing merged copy for upload');
      const mergedBytes = await this.serializeDb(mergedDb);

      // Get or create KDF salt and derived key
      if (!derivedKey) {
        const keyBytes = await this.getDerivedKey();
        if (!keyBytes) {
          throw new AuthenticationError('Encryption key not available');
        }
        derivedKey = keyBytes;
      }
      if (!kdfSalt) {
        const saltHex = await this.appMetadataRepo.get('kdf_salt');
        if (saltHex) {
          kdfSalt = this.hexToBytes(saltHex);
        } else {
          kdfSalt = crypto.getRandomValues(new Uint8Array(32));
          await this.appMetadataRepo.set('kdf_salt', this.bytesToHex(kdfSalt));
        }
      }

      const encryptedBytes = await this.encryptedFileFormat.pack(
        mergedBytes,
        derivedKey,
        kdfSalt,
      );

      // Step 12: Upload
      console.debug('SyncEngine: step 12/14 — uploading to cloud');
      await this.cloudStorageProvider.upload(encryptedBytes, 'collectio.db');

      // ─── UPLOAD SUCCESS — safe to apply to live DB ───────────
      console.debug('SyncEngine: step 12b/14 — applying winners to live DB');
      await this.applyWinnersToDb(this.db, mergeResult.winners);
      await this.conflictResolver.resolveOrphans(this.db);
      await this.appMetadataRepo.set('last_successful_sync', now);
      await this.deviceRepo.updateLastSeen(deviceId);

      // Step 13: Update sync_log with SUCCESS
      console.debug('SyncEngine: step 13/14 — logging success');
      await this.syncLogRepo.markCompleted(
        syncLogId,
        'SUCCESS',
        mergeResult.totalRecordsAffected + orphanReport.orphansFound,
      );

      // Step 14: Release lock
      this.syncLock.release();

      // Update store
      useSyncStore.getState().setSyncState('IDLE');
      useSyncStore.getState().setDirty(false, 0);
      useSyncStore.getState().setLastSyncTime(now);
      useSyncStore.getState().setError(null);

      // Reset failure tracking
      this.consecutiveFailures = 0;
      this.syncTimer.setDelay(this.baseInterval);

      console.info(
        `SyncEngine: sync complete — ${mergeResult.totalRecordsAffected} records, ${mergeResult.conflictsResolved} conflicts, ${orphanReport.orphansFound} orphans`,
      );

      return {
        success: true,
        recordsAffected: mergeResult.totalRecordsAffected,
        conflictsResolved: mergeResult.conflictsResolved,
        newLocalOnly: mergeResult.newLocalOnly,
        newRemoteOnly: mergeResult.newRemoteOnly,
        orphansResolved: orphanReport.orphansFound,
        lastSyncTime: now,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = determineErrorCode(error);

      console.warn(
        `SyncEngine: sync failed — ${errorCode}: ${errorMessage}`,
      );

      // ─── UPLOAD FAILURE — live DB is untouched, merged copy discarded ──
      console.warn('SyncEngine: upload failed — live DB unchanged, merged copy discarded');

      // If we previously set last_successful_sync in the merged copy,
      // revert in the live DB (it was never set in live, but be defensive)
      if (
        previousLastSync !== null &&
        (errorCode === 'UPLOAD_FAILED' ||
          errorCode === 'NETWORK' ||
          errorCode === 'RATE_LIMITED' ||
          errorCode === 'SERVER_ERROR')
      ) {
        // Live DB was never modified — this is a safety net
        await this.appMetadataRepo.set('last_successful_sync', previousLastSync);
      }

      // Log failure
      if (syncLogId !== null) {
        await this.syncLogRepo.markCompleted(syncLogId, 'FAILURE', 0, errorMessage);
      }

      // Track consecutive failures
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= 3) {
        const newInterval = this.baseInterval * Math.pow(2, Math.min(this.consecutiveFailures - 3, 5));
        this.syncTimer.setDelay(newInterval);
        console.warn(
          `SyncEngine: consecutive failure ${this.consecutiveFailures} — auto-sync interval increased to ${newInterval}ms`,
        );
      }

      // Determine store state
      if (errorCode === 'DECRYPT_FAILED' || errorCode === 'NOT_AUTHENTICATED') {
        useSyncStore.getState().setSyncState('ALERT');
      } else {
        useSyncStore.getState().setSyncState('WARNING');
      }
      useSyncStore.getState().setError(errorMessage);

      // Always release lock
      this.syncLock.release();

      return {
        success: false,
        errorCode,
        errorMessage,
        recordsAffected: 0,
        conflictsResolved: 0,
        newLocalOnly: 0,
        newRemoteOnly: 0,
        orphansResolved: 0,
        lastSyncTime: previousLastSync,
      };
    }
  }

  /**
   * Expedited sync on app close.
   *
   * Only attempts if dirty + online. Returns immediately if not dirty or offline.
   * Timeout at 30 seconds.
   */
  async syncOnShutdown(): Promise<void> {
    const dirty = await this.dirtyStateTracker.isDirty();
    const online = this.networkMonitor.isOnline();

    console.info(`SyncEngine: shutdown sync — dirty=${dirty}, online=${online}`);

    if (!dirty || !online) {
      console.debug('SyncEngine: shutdown sync skipped');
      return;
    }

    // Execute with timeout
    const timeoutMs = 30_000;
    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        console.warn('SyncEngine: shutdown sync timed out after 30s');
        resolve();
      }, timeoutMs);
    });

    const syncPromise = this.execute().then(() => {
      console.debug('SyncEngine: shutdown sync complete');
    });

    await Promise.race([syncPromise, timeoutPromise]);
  }

  /**
   * Cancel inactivity timer and attempt sync immediately.
   */
  async triggerManualSync(): Promise<void> {
    this.syncTimer.cancel();
    await this.execute();
  }

  /**
   * Called by repository layer whenever an entity is created/updated/deleted.
   *
   * Resets inactivity timer. Sets dirty state in store.
   */
  async onWrite(): Promise<void> {
    console.debug('SyncEngine: write detected — resetting timer');
    const dirty = await this.dirtyStateTracker.isDirty();
    const pendingCount = await this.dirtyStateTracker.getPendingCount();
    useSyncStore.getState().setDirty(dirty, pendingCount);
    useSyncStore.getState().setSyncState('DIRTY');
    this.syncTimer.reset();
  }

  /**
   * Returns current internal state snapshot.
   */
  async getState(): Promise<SyncEngineState> {
    const dirty = await this.dirtyStateTracker.isDirty();
    const pendingCount = await this.dirtyStateTracker.getPendingCount();
    const lastSync = await this.appMetadataRepo.get('last_successful_sync');

    return {
      dirty,
      lastSync: lastSync ?? null,
      pendingCount,
      timerRunning: this.syncTimer.isRunning(),
      online: this.networkMonitor.isOnline(),
    };
  }

  /**
   * Cleanup: cancel timer, remove network listener.
   */
  destroy(): void {
    this.syncTimer.cancel();
    this.networkUnsubscribe?.();
    this.networkMonitor.destroy();
    if (this.onlineDebounceTimer !== null) {
      clearTimeout(this.onlineDebounceTimer);
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────

  private async ensureDeviceRegistered(): Promise<void> {
    const deviceId = await this.appMetadataRepo.get('device_id');
    if (deviceId) return;

    const device = await this.deviceRepo.register(
      getPlatform(),
      getPlatform() === 'WINDOWS' ? 'WINDOWS' : 'ANDROID',
    );
    await this.appMetadataRepo.set('device_id', device.id);
    console.info(`SyncEngine: device registered — ${device.id}`);
  }

  private async getDeviceId(): Promise<string> {
    const deviceId = await this.appMetadataRepo.get('device_id');
    if (!deviceId) {
      throw new Error('Device not registered');
    }
    return deviceId;
  }

  private async getSetting(key: string, defaultValue: string): Promise<string> {
    try {
      const value = await (this.appSettingsRepo as unknown as { get(k: string): Promise<string | null> }).get(key as never);
      return value ?? defaultValue;
    } catch {
      return defaultValue;
    }
  }

  private async applyWinnersToDb(
    db: DatabaseConnection,
    winners: ChangeSet,
  ): Promise<void> {
    for (const [tableName, entityChanges] of winners) {
      for (const row of entityChanges.rows) {
        // Build INSERT OR REPLACE
        const columns = Object.keys(row);
        const placeholders = columns.map(() => '?').join(', ');
        const colNames = columns.map((c) => `"${c}"`).join(', ');
        const values = columns.map((c) => row[c]);

        await db.execute(
          `INSERT OR REPLACE INTO "${tableName}" (${colNames}) VALUES (${placeholders})`,
          values,
        );
      }
    }
  }

  private scheduleOnlineSync(): void {
    if (this.onlineDebounceTimer !== null) {
      clearTimeout(this.onlineDebounceTimer);
    }
    this.onlineDebounceTimer = setTimeout(async () => {
      const dirty = await this.dirtyStateTracker.isDirty();
      if (dirty && this.networkMonitor.isOnline()) {
        console.debug('SyncEngine: online debounce — triggering auto-sync');
        await this.execute();
      }
    }, 10_000);
  }

  private hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
  }

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
