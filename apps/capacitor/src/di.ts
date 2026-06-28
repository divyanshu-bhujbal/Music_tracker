/**
 * Capacitor dependency injection factory.
 *
 * Constructs all platform-specific providers + shared services,
 * runs migrations, seeds TokenRefresher, and returns a ServiceProvider.
 *
 * Runs in Capacitor WebView context. No Electron imports.
 */

import type { ServiceProvider } from '@collectio/shared';
import type { OAuthConfig, Migration } from '@collectio/shared';
import {
  MigrationRunner,
  DirtyStateTracker,
  SyncTimer,
  SyncLock,
  ChangeTracker,
  ConflictResolver,
  EncryptedFileFormat,
  AppMetadataRepository,
  SyncLogRepository,
  DeviceRepository,
  AppSettingsRepository,
} from '@collectio/shared';
import { SyncEngine } from '@collectio/shared';

import {
  WebCryptoProvider,
  CapacitorAuthProvider,
  CapacitorStorageProvider,
  CapacitorSqliteConnection,
} from '@collectio/platform/capacitor';
import { TokenRefresher, GoogleDriveProvider, DriveMetadataTracker, NetworkMonitor } from '@collectio/platform/shared';

import migration001Sql from '../../../../packages/shared/src/data/database/migrations/001_core_infrastructure.sql?raw';
import migration002Sql from '../../../../packages/shared/src/data/database/migrations/002_songs_category.sql?raw';

/**
 * Migration definitions for the Capacitor platform.
 * SQL content is inlined at build time via Vite's ?raw import — no filesystem access needed.
 */
const CAPACITOR_MIGRATIONS: Migration[] = [
  { version: 1, sql: migration001Sql },
  { version: 2, sql: migration002Sql },
];

/**
 * Retrieve the Google OAuth client ID.
 * For V1 development, a placeholder is used — real OAuth will fail until
 * configured. The DI must NOT throw if clientId is a placeholder;
 * failure occurs at first signIn() call, not at app startup.
 *
 * TODO: Replace with build-time injected constant or Capacitor config
 * once real OAuth client is configured (see Appendix C of E04-T08 spec).
 */
function getClientId(): string {
  return 'REPLACE_WITH_ANDROID_CLIENT_ID.apps.googleusercontent.com';
}

/**
 * Construct all Capacitor platform providers and shared services.
 *
 * Construction order follows the dependency graph:
 *   StorageProvider → AuthProvider → TokenRefresher
 *   DatabaseConnection → MigrationRunner
 *
 * @returns A fully wired ServiceProvider ready for the React context.
 */
export async function createServices(): Promise<ServiceProvider> {
  console.info('DI: Initializing Capacitor platform services...');

  // ── StorageProvider (no deps) ──────────────────────────────
  console.debug('DI: constructing CapacitorStorageProvider...');
  const storageProvider = new CapacitorStorageProvider();
  console.debug('DI: CapacitorStorageProvider ready');

  // ── DatabaseConnection (no deps) ───────────────────────────
  console.debug('DI: constructing CapacitorSqliteConnection...');
  const db = new CapacitorSqliteConnection();
  await db.open('collectio.db');
  console.debug('DI: CapacitorSqliteConnection opened');

  // ── CryptoProvider (no deps) ───────────────────────────────
  console.debug('DI: constructing WebCryptoProvider...');
  const cryptoProvider = new WebCryptoProvider();
  console.debug('DI: WebCryptoProvider ready');

  // ── AuthProvider (depends on StorageProvider) ──────────────
  const oauthConfig: OAuthConfig = {
    clientId: getClientId(),
    redirectUri: 'com.collectio.app://',
    scopes: ['https://www.googleapis.com/auth/drive.appdata'],
  };
  console.debug('DI: constructing CapacitorAuthProvider...');
  const authProvider = new CapacitorAuthProvider(storageProvider, oauthConfig);
  console.debug('DI: CapacitorAuthProvider ready');

  // ── TokenRefresher (depends on AuthProvider) ───────────────
  console.debug('DI: constructing TokenRefresher...');
  const tokenRefresher = new TokenRefresher(authProvider);
  console.debug('DI: TokenRefresher ready');

  // ── DriveMetadataTracker (depends on DatabaseConnection) ───
  console.debug('DI: constructing DriveMetadataTracker...');
  const driveMetadataTracker = new DriveMetadataTracker(db);
  console.debug('DI: DriveMetadataTracker ready');

  // ── GoogleDriveProvider (depends on TokenRefresher + DriveMetadataTracker) ──
  console.debug('DI: constructing GoogleDriveProvider...');
  const cloudStorageProvider = new GoogleDriveProvider(tokenRefresher, driveMetadataTracker);
  console.debug('DI: GoogleDriveProvider ready');

  // ── MigrationRunner (depends on DatabaseConnection) ────────
  console.debug('DI: constructing MigrationRunner...');
  const migrationRunner = new MigrationRunner(db, CAPACITOR_MIGRATIONS);
  console.debug('DI: MigrationRunner ready');

  // ── Run migrations ─────────────────────────────────────────
  try {
    const report = await migrationRunner.run();
    console.info(
      `DI: Migrations complete — version ${report.currentVersion} → ${report.finalVersion} (${report.results.length} applied)`,
    );
  } catch (err) {
    console.error(
      `DI: MigrationRunner failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    // Continue — app may still be usable in degraded mode
  }

  // ── Seed TokenRefresher from stored tokens ─────────────────
  try {
    const tokens = await authProvider.getStoredTokens();
    if (tokens !== null) {
      tokenRefresher.setTokens(tokens);
      console.debug('DI: TokenRefresher seeded from stored tokens');
    } else {
      console.debug('DI: No stored tokens found — TokenRefresher unseeded');
    }
  } catch (err) {
    console.warn(
      `DI: Failed to read stored tokens: ${err instanceof Error ? err.message : String(err)}`,
    );
    // TokenRefresher starts unseeded — user can sign in later
  }

  // ── SyncEngine (depends on all above) ────────────────────────
  console.debug('DI: constructing SyncEngine...');
  const appMetadataRepo = new AppMetadataRepository(db);
  const syncLogRepo = new SyncLogRepository(db);
  const deviceRepo = new DeviceRepository(db);
  const appSettingsRepo = new AppSettingsRepository(db);
  const encryptedFileFormat = new EncryptedFileFormat(cryptoProvider);
  const dirtyStateTracker = new DirtyStateTracker(db);
  const syncTimer = new SyncTimer(() => {}, 120_000);
  const syncLock = new SyncLock();
  const changeTracker = new ChangeTracker(db);
  const conflictResolver = new ConflictResolver();
  const networkMonitor = new NetworkMonitor();

  const syncEngine = new SyncEngine(
    db,
    encryptedFileFormat,
    cloudStorageProvider,
    dirtyStateTracker,
    syncTimer,
    syncLock,
    changeTracker,
    conflictResolver,
    networkMonitor,
    appMetadataRepo,
    syncLogRepo,
    deviceRepo,
    appSettingsRepo,
    async (conn) => await conn.serialize(),
    async () => {
      // V1: Capacitor does not support opening in-memory DB from bytes.
      // The serializeDb callback throws on Capacitor, preventing the
      // merge-copy flow. This is acceptable for V1 because the sync
      // engine will catch the error and log a warning.
      // A future implementation can use a JS-level SQLite reconstruction.
      throw new Error('Capacitor openInMemoryDb not yet implemented');
    },
    async () => null, // getDerivedKey stub
  );
  console.debug('DI: SyncEngine ready');

  // ── Initialize SyncEngine ────────────────────────────────────
  try {
    await syncEngine.initialize();
    console.debug('DI: SyncEngine initialized');
  } catch (err) {
    console.warn(
      `DI: SyncEngine initialization failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  console.info('DI: Platform services initialized (Capacitor)');

  return {
    cryptoProvider,
    authProvider,
    storageProvider,
    db,
    tokenRefresher,
    migrationRunner,
    cloudStorageProvider,
  };
}
