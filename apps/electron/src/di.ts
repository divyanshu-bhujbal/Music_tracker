/**
 * Electron dependency injection factory.
 *
 * Constructs all platform-specific providers + shared services,
 * runs migrations, seeds TokenRefresher, and returns a ServiceProvider.
 *
 * Runs in Electron main process. No renderer imports.
 */

import { app } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

import type { ServiceProvider } from '@collectio/shared';
import type { OAuthConfig, Migration } from '@collectio/shared';
import { MigrationRunner } from '@collectio/shared';

import {
  NodeCryptoProvider,
  ElectronAuthProvider,
  ElectronStorageProvider,
  BetterSqlite3Connection,
} from '@collectio/platform/electron';
import { TokenRefresher } from '@collectio/platform/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load migration SQL files from the shared package.
 * Uses readFileSync — available in Electron's Node.js main process.
 */
function loadMigrations(): Migration[] {
  const migrationsDir = join(
    __dirname,
    '../../../packages/shared/src/data/database/migrations',
  );
  return [
    {
      version: 1,
      sql: readFileSync(
        join(migrationsDir, '001_core_infrastructure.sql'),
        'utf-8',
      ),
    },
    {
      version: 2,
      sql: readFileSync(
        join(migrationsDir, '002_songs_category.sql'),
        'utf-8',
      ),
    },
  ];
}

/**
 * Retrieve the Google OAuth client ID from environment.
 * Falls back to a placeholder for development — real OAuth will fail
 * until configured via GOOGLE_CLIENT_ID env var.
 */
function getClientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) {
    console.warn(
      'DI: GOOGLE_CLIENT_ID not set — using placeholder. OAuth will fail until configured.',
    );
    return 'placeholder.apps.googleusercontent.com';
  }
  return id;
}

/**
 * Construct all Electron platform providers and shared services.
 *
 * Construction order follows the dependency graph:
 *   StorageProvider → AuthProvider → TokenRefresher
 *   DatabaseConnection → MigrationRunner
 *
 * @returns A fully wired ServiceProvider ready for the renderer.
 */
export async function createServices(): Promise<ServiceProvider> {
  console.info('DI: Initializing Electron platform services...');

  // ── StorageProvider (no deps) ──────────────────────────────
  console.debug('DI: constructing ElectronStorageProvider...');
  const storageProvider = new ElectronStorageProvider();
  console.debug('DI: ElectronStorageProvider ready');

  // ── DatabaseConnection (no deps) ───────────────────────────
  console.debug('DI: constructing BetterSqlite3Connection...');
  const db = new BetterSqlite3Connection();
  const dbPath = join(app.getPath('userData'), 'collectio.db');
  await db.open(dbPath);
  console.debug(`DI: BetterSqlite3Connection opened at ${dbPath}`);

  // ── CryptoProvider (no deps) ───────────────────────────────
  console.debug('DI: constructing NodeCryptoProvider...');
  const cryptoProvider = new NodeCryptoProvider();
  console.debug('DI: NodeCryptoProvider ready');

  // ── AuthProvider (depends on StorageProvider) ──────────────
  const oauthConfig: OAuthConfig = {
    clientId: getClientId(),
    redirectUri: 'http://localhost',
    scopes: ['https://www.googleapis.com/auth/drive.appdata'],
  };
  console.debug('DI: constructing ElectronAuthProvider...');
  const authProvider = new ElectronAuthProvider(storageProvider, oauthConfig);
  console.debug('DI: ElectronAuthProvider ready');

  // ── TokenRefresher (depends on AuthProvider) ───────────────
  console.debug('DI: constructing TokenRefresher...');
  const tokenRefresher = new TokenRefresher(authProvider);
  console.debug('DI: TokenRefresher ready');

  // ── MigrationRunner (depends on DatabaseConnection) ────────
  console.debug('DI: constructing MigrationRunner...');
  const migrationRunner = new MigrationRunner(db, loadMigrations());
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

  console.info('DI: Platform services initialized (Electron)');

  return {
    cryptoProvider,
    authProvider,
    storageProvider,
    db,
    tokenRefresher,
    migrationRunner,
  };
}
