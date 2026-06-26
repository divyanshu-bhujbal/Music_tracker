/**
 * Central dependency injection contract.
 *
 * Lists every service the renderer (and future Application layer) can consume.
 * All fields use interface types from domain/ — the renderer never sees
 * platform-specific implementations (NodeCryptoProvider, ElectronAuthProvider, etc.).
 *
 * TokenRefresher is imported as a concrete class type from @collectio/platform
 * because it is a shared platform service with zero platform dependencies and
 * no separate interface in shared/. This is a narrow exception to the
 * "shared never imports platform" rule, justified by:
 * 1. TokenRefresher works identically on both platforms
 * 2. Imported as a TYPE only (DI contract, not runtime logic)
 * 3. Without this import, consumers would need `any` or a redundant interface
 */

import type { CryptoProvider } from '../domain/interfaces/CryptoProvider.js';
import type { AuthProvider } from '../domain/interfaces/AuthProvider.js';
import type { SecureStorageProvider } from '../domain/interfaces/SecureStorageProvider.js';
import type { DatabaseConnection } from '../data/database/DatabaseConnection.js';
import type { MigrationRunner } from '../data/database/MigrationRunner.js';
import type { TokenRefresher } from '@collectio/platform/shared';

/**
 * Complete service graph for the application.
 *
 * Constructed once per app launch by the platform-specific DI file
 * (`apps/electron/src/di.ts` or `apps/capacitor/src/di.ts`).
 * Passed to the renderer via contextBridge (Electron) or React context (Capacitor).
 */
export interface ServiceProvider {
  /** Argon2id key derivation + AES-256-GCM encryption/decryption */
  cryptoProvider: CryptoProvider;

  /** Google OAuth PKCE sign-in, token refresh, sign-out */
  authProvider: AuthProvider;

  /** Platform-backed key-value credential storage */
  storageProvider: SecureStorageProvider;

  /** Async SQLite database connection (PRAGMAs enforced at open) */
  db: DatabaseConnection;

  /** In-memory token cache with exponential backoff refresh */
  tokenRefresher: TokenRefresher;

  /** Versioned database migration executor */
  migrationRunner: MigrationRunner;
}
