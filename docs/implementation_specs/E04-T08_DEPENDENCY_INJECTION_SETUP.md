# E-04 T-08 — Dependency Injection Setup

**Parent Epic:** E-04: Platform Services
**Type:** Integration (Architecture Glue — Final Task of Phase 1)
**Criticality:** FOUNDATION — this task connects all Platform Services implementations into a single injectable system. It is the last task of Phase 1 (Foundation Complete, M0). Without it, no downstream epic (E-09 Cloud Storage, E-10 Sync Engine, E-15 UI Shell) can function because the renderer has no access to platform providers.

**Important:** This task produces the `ServiceProvider` interface, the platform-specific DI wiring files, and the Electron preload bridge. It does NOT implement new business logic — it assembles existing implementations into a consumable shape. After this task, the `renderer` package can access `CryptoProvider`, `AuthProvider`, `SecureStorageProvider`, `TokenRefresher`, and `MigrationRunner` through typed injection without knowing which platform is underneath.

---

## 1. Goal

Create a minimal, framework-free dependency injection system that:

1. **Defines** the `ServiceProvider` interface in `packages/shared/src/application/` — a single typed object listing every service the renderer (and future Application layer) can consume
2. **Wires** platform-specific implementations in each app entry:
   - `apps/electron/src/di.ts` — constructs Electron providers + shared services, returns `ServiceProvider`
   - `apps/capacitor/src/di.ts` — constructs Capacitor providers + shared services, returns `ServiceProvider`
3. **Bridges** Electron providers to the renderer via `contextBridge.exposeInMainWorld()` in `preload.ts`
4. **Injects** Capacitor providers into React context in `apps/capacitor/src/index.tsx`
5. **Cleans up** temporary verification code in `main.ts`, replacing it with a proper DI bootstrap that runs `MigrationRunner` at startup
6. **Seeds** `TokenRefresher` with stored tokens at startup (from `AuthProvider.getStoredTokens()`)

---

## 2. Scope

| In Scope | Rationale |
|---|---|
| `ServiceProvider` interface in `packages/shared/src/application/ServiceProvider.ts` | Central type contract — referenced by both apps' DI files and the renderer's React context |
| `packages/shared/src/application/index.ts` barrel export | Makes `ServiceProvider` importable via `@collectio/shared` |
| `packages/shared/src/index.ts` update — export `ServiceProvider` | Part of the public API of `@collectio/shared` |
| `apps/electron/src/di.ts` — `createServices()` factory function | Constructs all Electron platform providers + shared services; returns `ServiceProvider` |
| `apps/electron/src/preload.ts` — implement `contextBridge.exposeInMainWorld()` | Exposes a serialization-safe subset of `ServiceProvider` to the renderer |
| `apps/electron/src/main.ts` — replace verification code with DI bootstrap | Invoke `createServices()`, run `MigrationRunner`, seed `TokenRefresher`, create window |
| `apps/capacitor/src/di.ts` — `createServices()` factory function | Constructs all Capacitor platform providers + shared services; returns `ServiceProvider` |
| `apps/capacitor/src/index.tsx` — React context wiring | Wrap `<App />` in a provider context that holds `ServiceProvider`; replace `<AuthVerifyRunner />` |
| `apps/electron/tsconfig.json` — add `src/di.ts` to `include` | Main-process file must be type-checked |
| Electron `OAuthConfig` location in `di.ts` (Desktop client ID + `http://localhost`) | Per AD-03; Electron uses "Desktop app" OAuth client with loopback redirect |
| Capacitor `OAuthConfig` location in `di.ts` (Android client ID + `com.collectio.app://`) | Per AD-03 & Rule 6.1; Capacitor uses "Android" OAuth client with deep link redirect |
| `TokenRefresher` seeding at startup | After construction, call `setTokens(await authProvider.getStoredTokens())` if tokens exist |
| `MigrationRunner` invocation at startup | Run migrations before any data access; gated by `serviceProvider` availability |

---

## 3. Out of Scope

| Out of Scope | Why | Where It Belongs |
|---|---|---|
| A DI framework (InversifyJS, TSyringe, etc.) | V1 has ~7-8 providers; a framework adds dependency overhead with no benefit at this scale | N/A — not needed |
| `GoogleDriveProvider` registration | Not yet implemented — lives in E-09 | E-09 |
| `SongRepository`, `CategoryRepository`, etc. | Not yet implemented — lives in E-05/E-06 | E-05, E-06 |
| `SyncEngine` registration | Not yet implemented — lives in E-10 | E-10 |
| React Router or UI Shell wiring | Not yet implemented — lives in E-15 | E-15 |
| `CategoryRegistry` or `CategoryDefinition` registration | Not needed until E-05 | E-05 |
| Production OAuth config values (real client IDs) | These are secrets — injected via environment or config at build time | Developer manual step; see Appendix C |
| E2E tests for DI wiring | Compile-time check via `pnpm typecheck` is sufficient for DI; manual smoke test verifies startup | E-16 (future) |
| Multiple-window support | V1 is single-window; singleton providers per process | Future |
| Hot-reload of DI containers | Providers are constructed once at startup; no lifecycle management | Future |

---

## 4. Files To Create

| # | File | Purpose | Responsibility |
|---|---|---|---|
| 1 | `packages/shared/src/application/ServiceProvider.ts` | `ServiceProvider` interface — lists every service available to the renderer by its interface type | Pure TypeScript interface. Imports only from `packages/shared/src/domain/interfaces/` and `packages/shared/src/data/database/`. Zero platform imports. |
| 2 | `packages/shared/src/application/index.ts` | Barrel export for `ServiceProvider` | Re-exports `ServiceProvider` type |
| 3 | `apps/electron/src/di.ts` | `createServices()` factory — constructs all Electron-specific providers + shared services; invokes `MigrationRunner`; seeds `TokenRefresher` | Imports from `@collectio/platform` (electron barrel) and `@collectio/shared`. Runs in Electron main process. Returns `Promise<ServiceProvider>`. |
| 4 | `apps/capacitor/src/di.ts` | `createServices()` factory — constructs all Capacitor-specific providers + shared services; invokes `MigrationRunner`; seeds `TokenRefresher` | Imports from `@collectio/platform` (capacitor barrel) and `@collectio/shared`. Runs in Capacitor WebView context. Returns `Promise<ServiceProvider>`. |

---

## 5. Files To Modify

| # | File | Action | Detail |
|---|---|---|---|
| 1 | `packages/shared/src/index.ts` | **Edit** | Add `export type { ServiceProvider } from './application/ServiceProvider.js';` |
| 2 | `apps/electron/src/main.ts` | **Edit** | Remove lines 46-91 (verification code + auth verify import). Replace with: import `createServices` from `di.ts`, call it in `app.on('ready')`, create window AFTER DI is ready. |
| 3 | `apps/electron/src/preload.ts` | **Edit** | Remove `export {};` stub. Implement `contextBridge.exposeInMainWorld('collectio', { ... })` with serialization-safe provider API (see §6.4). |
| 4 | `apps/capacitor/src/index.tsx` | **Edit** | Remove `AuthVerifyRunner` import+render. Import `createServices` from `di.ts`. Create React context with `ServiceProvider`. Render `<App />` wrapped in provider. |
| 5 | `apps/electron/tsconfig.json` | **Edit** | Ensure `src/di.ts` is type-checked. Since `main.ts` imports from `di.ts`, it is transitively included — verify this works. If not, add `"src/di.ts"` to `include` array. |

---

## 6. Interfaces

### 6.1 `ServiceProvider` (new — defined by this task)

**Location:** `packages/shared/src/application/ServiceProvider.ts`

```
interface ServiceProvider {
  cryptoProvider: CryptoProvider;
  authProvider: AuthProvider;
  storageProvider: SecureStorageProvider;
  db: DatabaseConnection;
  tokenRefresher: TokenRefresher;
  migrationRunner: MigrationRunner;
}
```

**Rules:**
- All fields use interface types, NOT concrete class types
- `CryptoProvider`, `AuthProvider`, `SecureStorageProvider` from `domain/interfaces/`
- `DatabaseConnection` from `data/database/`
- `TokenRefresher` from `@collectio/platform` (shared platform service — imported directly as a class type)
- `MigrationRunner` from `data/database/`
- No platform-specific types (`NodeCryptoProvider`, `ElectronAuthProvider`, etc.) — the renderer only sees interfaces
- This interface resides in `shared/src/application/` — permitted to import from `domain/` and `data/` per 05_FOLDER_STRUCTURE.md §2

### 6.2 Consumed Interfaces (prerequisite — already exist)

| Interface | Location | Used by |
|---|---|---|
| `CryptoProvider` | `packages/shared/src/domain/interfaces/CryptoProvider.ts` | `ServiceProvider.cryptoProvider` |
| `AuthProvider` | `packages/shared/src/domain/interfaces/AuthProvider.ts` | `ServiceProvider.authProvider` |
| `SecureStorageProvider` | `packages/shared/src/domain/interfaces/SecureStorageProvider.ts` | `ServiceProvider.storageProvider` |
| `DatabaseConnection` | `packages/shared/src/data/database/DatabaseConnection.ts` | `ServiceProvider.db` |
| `AuthTokens` | `packages/shared/src/domain/interfaces/AuthProvider.ts` | TokenRefresher seeding |
| `OAuthConfig` | `packages/shared/src/domain/interfaces/AuthProvider.ts` | AuthProvider construction in DI |

### 6.3 Consumed Classes (prerequisite — already exist)

| Class | Import Path | Used by |
|---|---|---|
| `NodeCryptoProvider` | `@collectio/platform` (electron barrel) | `apps/electron/src/di.ts` |
| `ElectronAuthProvider` | `@collectio/platform` (electron barrel) | `apps/electron/src/di.ts` |
| `ElectronStorageProvider` | `@collectio/platform` (electron barrel) | `apps/electron/src/di.ts` |
| `BetterSqlite3Connection` | `@collectio/platform` (electron barrel) | `apps/electron/src/di.ts` |
| `WebCryptoProvider` | `@collectio/platform` (capacitor barrel) | `apps/capacitor/src/di.ts` |
| `CapacitorAuthProvider` | `@collectio/platform` (capacitor barrel) | `apps/capacitor/src/di.ts` |
| `CapacitorStorageProvider` | `@collectio/platform` (capacitor barrel) | `apps/capacitor/src/di.ts` |
| `CapacitorSqliteConnection` | `@collectio/platform` (capacitor barrel) | `apps/capacitor/src/di.ts` |
| `TokenRefresher` | `@collectio/platform` (shared barrel: `packages/platform/src/shared/index.ts`) | Both DI files |
| `MigrationRunner` | `@collectio/shared` | Both DI files |

### 6.4 Electron contextBridge API Surface (defined in `preload.ts`)

The preload script must expose a `collectio` API object on `window`. This object is a serialization-safe subset of `ServiceProvider`. Methods returning `Uint8Array` or `EncryptedData` must be wrapped with marshalling.

```
window.collectio = {
  crypto: {
    deriveKey(password: string, saltBase64: string): Promise<string>,       // Uint8Array → base64 marshalling
    generateSalt(): string,                                                  // returns base64
    encryptDatabase(dbBase64: string, keyBase64: string): Promise<{           // EncryptedData → serialized
      ciphertext: string,
      nonce: string,
      tag: string,
    }>,
    decryptDatabase(encrypted: { ciphertext: string; nonce: string; tag: string }, keyBase64: string): Promise<string>,
  },
  auth: {
    signIn(): Promise<{ accessToken: string; refreshToken: string; expiresAt: number }>,
    getStoredTokens(): Promise<{ accessToken: string; refreshToken: string; expiresAt: number } | null>,
    signOut(): Promise<void>,
  },
  storage: {
    store(key: string, value: string): Promise<void>,
    retrieve(key: string): Promise<string | null>,
    delete(key: string): Promise<void>,
    clear(): Promise<void>,
  },
  tokenRefresher: {
    getAccessToken(): Promise<string | null>,
    get needsReauth(): boolean,
  },
  migrationRunner: {
    runMigrations(): Promise<MigrationReport>,
  },
}
```

**Marshalling rules for preload:**
- `CryptoProvider.deriveKey(salt: Uint8Array): Promise<Uint8Array>` → preload accepts `saltBase64: string`, decodes to `Uint8Array`, calls provider, base64-encodes result
- `CryptoProvider.generateSalt(): Uint8Array` → preload calls provider, base64-encodes result
- `CryptoProvider.encryptDatabase(db: Uint8Array, key: Uint8Array): Promise<EncryptedData>` → preload accepts base64, decodes both, calls provider, base64-encodes each field of result
- `CryptoProvider.decryptDatabase(data: EncryptedData, key: Uint8Array): Promise<Uint8Array>` → preload accepts serialized `EncryptedData` + base64 key, decodes, calls provider, base64-encodes result
- `AuthProvider.refreshAccessToken()` is intentionally NOT exposed — `TokenRefresher.getAccessToken()` handles refresh internally
- `DatabaseConnection` is NOT exposed — raw SQL access must stay in the main process
- `SecureStorageProvider` methods take/return plain strings — no marshalling needed
- `TokenRefresher.needsReauth` is a getter — preload must call it at exposure time and return the current value (not a live reference)

---

## 7. Data Flow

### 7.1 Electron Startup Sequence

```
1.  APP LAUNCHES → app.on('ready') fires

2.  LOAD DI CONTAINER:
    └─ call createServices() from di.ts

3.  CONSTRUCT PROVIDERS (inside createServices):
    a. Construct BetterSqlite3Connection (no deps)
    b. Construct ElectronStorageProvider (no deps — uses safeStorage + electron-store)
    c. Define OAuthConfig for Electron:
       - clientId from config/env (Desktop app type)
       - redirectUri: 'http://localhost' (loopback — port chosen by signIn())
       - scopes: ['https://www.googleapis.com/auth/drive.appdata']
    d. Construct NodeCryptoProvider (no deps)
    e. Construct ElectronAuthProvider(storageProvider, oauthConfig)
    f. Construct TokenRefresher(authProvider)
    g. Construct MigrationRunner(db)

4.  RUN MIGRATIONS:
    └─ await migrationRunner.runMigrations()
       If migrations fail → log error; app may still start but data layer is degraded

5.  SEED TOKEN REFRESHER:
    └─ const tokens = await authProvider.getStoredTokens()
       if (tokens !== null) tokenRefresher.setTokens(tokens)

6.  RETURN ServiceProvider object:
    { cryptoProvider, authProvider, storageProvider, db, tokenRefresher, migrationRunner }

7.  CREATE WINDOW:
    └─ createWindow() — renderer loads via Vite dev server or dist/index.html

8.  PRELOAD BRIDGE:
    └─ preload.ts exposes window.collectio via contextBridge (see §6.4)
    └─ Renderer can now call window.collectio.crypto.deriveKey(...), etc.

9.  APP READY — renderer renders React UI
```

### 7.2 Capacitor Startup Sequence

```
1.  APP LAUNCHES → React root renders index.tsx

2.  LOAD DI CONTAINER:
    └─ call createServices() from di.ts (async — Capacitor plugins are async)

3.  CONSTRUCT PROVIDERS (inside createServices):
    a. Construct CapacitorSqliteConnection (no deps — uses Capacitor SQLite plugin)
    b. Construct CapacitorStorageProvider (no deps — uses capacitor-secure-storage-plugin)
    c. Define OAuthConfig for Capacitor:
       - clientId from config (Android app type)
       - redirectUri: 'com.collectio.app://'
       - scopes: ['https://www.googleapis.com/auth/drive.appdata']
    d. Construct WebCryptoProvider (no deps)
    e. Construct CapacitorAuthProvider(storageProvider, oauthConfig)
    f. Construct TokenRefresher(authProvider)
    g. Construct MigrationRunner(db)

4.  RUN MIGRATIONS:
    └─ await migrationRunner.runMigrations()

5.  SEED TOKEN REFRESHER:
    └─ const tokens = await authProvider.getStoredTokens()
       if (tokens !== null) tokenRefresher.setTokens(tokens)

6.  RETURN ServiceProvider object
    { cryptoProvider, authProvider, storageProvider, db, tokenRefresher, migrationRunner }

7.  REACT CONTEXT:
    └─ Pass ServiceProvider into React context (createContext + Provider)
    └─ Render <App /> inside <ServiceProviderContext.Provider value={services}>

8.  COMPONENTS CONSUME:
    └─ const { cryptoProvider } = useContext(ServiceProviderContext)
    └─ No platform conditionals — renderer only sees interfaces
```

### 7.3 Construction Dependency Order

```
For both platforms:
  StorageProvider (no deps) ─────────────────────┐
  DatabaseConnection (no deps) ──────────────────┤
  CryptoProvider (no deps) ──────────────────────┤
                                                   ▼
  AuthProvider(storageProvider, oauthConfig) ─────┤
                                                   ▼
  TokenRefresher(authProvider) ───────────────────┤
                                                   ▼
  MigrationRunner(db)
```

`TokenRefresher` must be constructed AFTER `AuthProvider`. `AuthProvider` must be constructed AFTER `StorageProvider`. `MigrationRunner` constructed AFTER `DatabaseConnection`.

### 7.4 TokenRefresher Seeding Flow

```
1.  All providers constructed

2.  CALL authProvider.getStoredTokens()
    └─ Internal: reads auth_access_token, auth_refresh_token, auth_expires_at from SecureStorage

3.  IF tokens !== null:
    └─ tokenRefresher.setTokens(tokens)
       └─ TokenRefresher now has valid in-memory cache
       └─ needsReauth ← false
       └─ Subsequent getAccessToken() calls work

4.  IF tokens === null:
    └─ TokenRefresher has no cache (accessToken = null)
    └─ getAccessToken() returns null until user signs in
    └─ User must go through signIn() flow first
```

---

## 8. State Changes

### 8.1 Application Lifecycle State

| Phase | State | Electron | Capacitor |
|---|---|---|---|
| `app.on('ready')` / `index.tsx` mount | DI construction begins | `createServices()` called | `createServices()` called |
| After provider construction | Providers ready | `ServiceProvider` object exists in main process | `ServiceProvider` object exists in WebView |
| After migration run | Database ready | `migrationRunner.runMigrations()` complete | Same |
| After token seeding | Auth state restored (or empty) | `tokenRefresher.setTokens()` called if tokens found | Same |
| After window creation / context | Renderer connected | `window.collectio` exposed via contextBridge | `ServiceProvider` in React context |
| `window-all-closed` / app killed | Cleanup | Providers garbage-collected; `BetterSqlite3Connection.close()` NOT automatically called (future: add app.on('will-quit') handler) | Providers garbage-collected; Capacitor plugin state persists in Keystore/SQLite |

### 8.2 Temporary Code Removal

| Code | Location | Action |
|---|---|---|
| `better-sqlite3-verify` import + `runVerify()` invocation | `main.ts:5,47-62` | Remove; this was a temporary E-02 T-01 spike verification |
| `writeFileSync` import | `main.ts:4` | Remove (only used by verify code) |
| Auth verify dynamic import block | `main.ts:64-91` | Remove; this was a temporary E-04 T-06 integration test entry point |
| `AuthVerifyRunner` import + render | `apps/capacitor/src/index.tsx:3,10` | Remove; replace with DI + App |

### 8.3 DI Files — No Persistent State

`di.ts` files export a pure factory function — no module-level state, no singletons. Each call to `createServices()` constructs fresh instances. In practice, `createServices()` is called exactly once per app launch. If called again, it would create duplicate provider instances (and a second `DatabaseConnection` — which may conflict with the first).

---

## 9. Database Changes

**None directly.** The `MigrationRunner` is called during DI bootstrap and may execute pending migrations. This is existing behavior — not a new schema change. The DI task itself does not define new tables, migrations, or schema modifications.

The database file is opened by `DatabaseConnection.open(dbPath)` during `MigrationRunner.runMigrations()`. The `dbPath` is platform-specific:
- **Electron:** `app.getPath('userData')/collectio.db`
- **Capacitor:** The default Capacitor SQLite database path (plugin-managed)

---

## 10. Error Handling

### 10.1 DI Construction Failures

| Component | Failure Mode | DI Behavior |
|---|---|---|
| `ElectronStorageProvider` | `safeStorage.isEncryptionAvailable()` returns `false` | Constructor throws `Error('Encryption is not available on this system')` → DI construction fails → app shows error screen |
| `BetterSqlite3Connection` | `better-sqlite3` native module fails to load | Constructor throws → DI fails |
| `CapacitorSqliteConnection` | Capacitor SQLite plugin not available | Plugin call throws → DI fails |
| `CapacitorStorageProvider` | `capacitor-secure-storage-plugin` not registered in `MainActivity.java` (RC-05) | First `store()`/`retrieve()` call throws → delayed failure (not at construction) |
| `MigrationRunner.runMigrations()` | Migration SQL fails, DB locked, etc. | Migration error logged; app may continue with degraded data layer |
| `authProvider.getStoredTokens()` | `retrieve()` throws (Keystore error) | Token seeding fails gracefully → `TokenRefresher` starts unseeded; user can sign in |
| `OAuthConfig` misconfigured | Missing `clientId`, wrong `redirectUri` | Auth operations fail at runtime with `AuthNetworkError` — not caught at construction |

### 10.2 Error Boundaries in DI Bootstrap

```
createServices() (Electron):
  ├─ ElectronStorageProvider() → throws if DPAPI unavailable → FATAL (app cannot start without secure storage)
  ├─ BetterSqlite3Connection() → throws if native module missing → FATAL
  ├─ MigrationRunner.runMigrations() → throws → log error; continue (app may be usable read-only)
  ├─ authProvider.getStoredTokens() → throws → log warning; TokenRefresher starts unseeded
  └─ Returns ServiceProvider (even if some init steps failed — partial availability)

createServices() (Capacitor):
  ├─ CapacitorStorageProvider() → does NOT throw at construct (lazy plugin access)
  ├─ CapacitorSqliteConnection() → does NOT throw at construct (lazy plugin access)
  ├─ MigrationRunner.runMigrations() → throws → log error; continue
  ├─ authProvider.getStoredTokens() → throws → log warning; continue
  └─ Returns ServiceProvider
```

---

## 11. Logging Requirements

| Event | Level | Message | Rationale |
|---|---|---|---|
| DI bootstrap start | `info` | `"Initializing platform services..."` | Startup progress |
| Provider constructed | `debug` | `"NodeCryptoProvider ready"`, `"ElectronAuthProvider ready"`, etc. | Per-provider traceability |
| Migrations run | `info` | `"Migrations complete: N applied, M skipped"` | Database state at startup |
| Token seeding success | `debug` | `"TokenRefresher seeded from stored tokens"` (no token values) | Auth state restored |
| Token seeding empty | `debug` | `"No stored tokens found — TokenRefresher unseeded"` | Expected on first run |
| DI bootstrap complete | `info` | `"Platform services initialized (Electron)"` / `"Platform services initialized (Capacitor)"` | Startup complete |
| DI construction error | `error` | `"Failed to initialize service: <provider> — <error message>"` | Per-provider failure detail |
| Migration failure | `error` | `"MigrationRunner failed: <error message>"` | Database degraded |

**Prohibited from logging:** `access_token`, `refresh_token`, `OAuthConfig.clientId`, `deriveKey` output, `encryptDatabase` key material (Rule 12.2).

---

## 12. Security Requirements

| # | Requirement | Source | How Enforced |
|---|---|---|---|
| 1 | `DatabaseConnection` exposed to Electron main process only; never crosses `contextBridge` | Rule 15.3 | `ServiceProvider.db` is NOT included in `window.collectio` (see §6.4 — no `db` field) |
| 2 | `contextIsolation: true` and `nodeIntegration: false` remain unchanged | Rule 15.3 | `main.ts` BrowserWindow config unchanged — these values are already set |
| 3 | No `vite-plugin-electron-renderer` used | Rule 15.4 | Not added as dependency; providers go through contextBridge |
| 4 | `CryptoProvider` `Uint8Array` values marshalled as base64 across contextBridge | §6.4 | Preload wraps each CryptoProvider method with base64 encode/decode; raw `Uint8Array` never crosses the bridge |
| 5 | `AuthProvider.refreshAccessToken()` NOT exposed via contextBridge | §6.4 | Token refresh is handled by `TokenRefresher` internally; renderer only calls `getAccessToken()` |
| 6 | `OAuthConfig.clientId` never logged | Rule 12.2 | DI logging only mentions provider names, not config values |
| 7 | No `client_secret` in any DI file | NFR-SEC-04 | PKCE flow — no secret; grep verification |
| 8 | Platform-specific code isolated in DI files | Rule 13.1 | `apps/electron/src/di.ts` imports Electron providers; `apps/capacitor/src/di.ts` imports Capacitor providers; no `if (platform === ...)` conditionals |
| 9 | `preload.ts` has no file system, process, or network access beyond contextBridge methods | Rule 15.3 | Preload only calls injected providers; uses `contextBridge` API |
| 10 | Renderer never imports platform code | Rule 13.4 | Renderer accesses services through `ServiceProvider` interface or `window.collectio` — never directly imports `ElectronAuthProvider` etc. |

---

## 13. Acceptance Criteria

| # | Criterion | Verification |
|---|---|---|
| AC-01 | `ServiceProvider` interface defined in `packages/shared/src/application/ServiceProvider.ts` | File exists; compiles |
| AC-02 | `ServiceProvider` exported from `@collectio/shared` | `import type { ServiceProvider } from '@collectio/shared'` resolves |
| AC-03 | `ServiceProvider` fields all use interface types (`CryptoProvider`, `AuthProvider`, `SecureStorageProvider`, `DatabaseConnection`) — no concrete class types | Code review |
| AC-04 | `apps/electron/src/di.ts` exports `createServices(): Promise<ServiceProvider>` | TypeScript compilation |
| AC-05 | `apps/capacitor/src/di.ts` exports `createServices(): Promise<ServiceProvider>` | TypeScript compilation |
| AC-06 | Electron DI constructs all 6 services (cryptoProvider, authProvider, storageProvider, db, tokenRefresher, migrationRunner) | Code review |
| AC-07 | Capacitor DI constructs all 6 services | Code review |
| AC-08 | `TokenRefresher` seeded from `authProvider.getStoredTokens()` after construction in both DI files | Code review |
| AC-09 | `MigrationRunner.runMigrations()` called during DI bootstrap in both DI files | Code review |
| AC-10 | `main.ts` temporary verification code (lines 46-91) removed or gated behind env flag | Code review |
| AC-11 | `main.ts` calls `createServices()`, runs migrations, then creates window — in that order | Code review |
| AC-12 | `preload.ts` implements `contextBridge.exposeInMainWorld('collectio', { ... })` with all 4 service groups (crypto, auth, storage, tokenRefresher) | Code review |
| AC-13 | `preload.ts` CryptoProvider methods marshal `Uint8Array` ↔ base64 | Code review |
| AC-14 | `preload.ts` does NOT expose `DatabaseConnection`, `AuthProvider.refreshAccessToken()`, or any raw Node.js APIs | Code review |
| AC-15 | `apps/capacitor/src/index.tsx` creates React context, calls `createServices()`, wraps `<App />` in provider | Code review |
| AC-16 | `apps/capacitor/src/index.tsx` no longer renders `<AuthVerifyRunner />` | Code review |
| AC-17 | `apps/electron/tsconfig.json` type-checks `di.ts` (transitively via `main.ts` import or direct `include`) | `pnpm typecheck` in electron app passes |
| AC-18 | TypeScript compiles clean across all packages | `pnpm typecheck` returns zero errors |
| AC-19 | Lint passes across all packages | `pnpm lint` returns zero errors |
| AC-20 | Zero `electron` imports in Capacitor DI file | grep verification |
| AC-21 | Zero `@capacitor/*` imports in Electron DI file | grep verification |
| AC-22 | Zero `client_secret` or `clientSecret` in any DI file | grep verification |
| AC-23 | Zero platform conditionals (`if (platform === ...)`) in shared package or renderer | grep verification (Rule 13.1) |
| AC-24 | Electron app starts without TypeScript errors after DI changes | `pnpm --filter @collectio/electron-app typecheck` |
| AC-25 | Capacitor app builds without TypeScript errors after DI changes | `pnpm --filter @collectio/capacitor-app typecheck` |

---

## 14. Test Cases

### 14.1 Compile-Time Verification (Primary)

DI has no runtime unit tests — the verification is compile-time:

| # | Test | How Run |
|---|---|---|
| CT-01 | `ServiceProvider` compiles with all 6 fields | `pnpm --filter @collectio/shared typecheck` |
| CT-02 | Electron `createServices()` return type satisfies `ServiceProvider` | `pnpm --filter @collectio/electron-app typecheck` |
| CT-03 | Capacitor `createServices()` return type satisfies `ServiceProvider` | `pnpm --filter @collectio/capacitor-app typecheck` |
| CT-04 | `preload.ts` contextBridge API compiles without type errors | `pnpm --filter @collectio/electron-app typecheck` |
| CT-05 | `main.ts` imports `createServices` and types resolve | `pnpm --filter @collectio/electron-app typecheck` |
| CT-06 | Capacitor `index.tsx` React context typed with `ServiceProvider` compiles | `pnpm --filter @collectio/capacitor-app typecheck` |
| CT-07 | No cross-platform imports (`electron` in Capacitor, `@capacitor/*` in Electron) | grep + typecheck |

### 14.2 Manual Smoke Tests

| # | Test | Environment | Steps | Expected |
|---|---|---|---|---|
| SM-01 | Electron app starts without crash | Windows Electron dev | `pnpm --filter @collectio/electron-app dev` | Window opens; DevTools console shows DI bootstrap logs; `window.collectio` is defined |
| SM-02 | Electron `window.collectio` has all methods | DevTools console | `console.log(Object.keys(window.collectio))` | `['crypto', 'auth', 'storage', 'tokenRefresher', 'migrationRunner']` |
| SM-03 | Capacitor app starts without crash | Physical Android device | `pnpm --filter @collectio/capacitor-app build && cap sync && cap open` | App renders `<App />` (currently just `<h1>Collectiods</h1>`); no white screen |
| SM-04 | React context provides `ServiceProvider` in Capacitor | Physical device | Inspect with React DevTools or add temporary `console.log` in `App.tsx` | `useContext(ServiceProviderContext)` returns non-null object with all 6 services |
| SM-05 | `MigrationRunner` logs migration results at startup | Console (both platforms) | Check startup console output | Migration report logged (0 applied if DB already migrated, N applied if new) |

---

## 15. Definition Of Done

| # | Criterion | How Verified |
|---|---|---|
| DOD-01 | `ServiceProvider.ts` created in `packages/shared/src/application/` | File exists |
| DOD-02 | `packages/shared/src/application/index.ts` barrels `ServiceProvider` | File exists |
| DOD-03 | `packages/shared/src/index.ts` exports `ServiceProvider` | Import resolution |
| DOD-04 | `apps/electron/src/di.ts` created with `createServices()` | File exists |
| DOD-05 | `apps/capacitor/src/di.ts` created with `createServices()` | File exists |
| DOD-06 | Electron DI returns `ServiceProvider` satisfying the interface type | TypeScript assignment compatibility check |
| DOD-07 | Capacitor DI returns `ServiceProvider` satisfying the interface type | TypeScript assignment compatibility check |
| DOD-08 | `TokenRefresher` seeded in both DI files | Code review |
| DOD-09 | `MigrationRunner.runMigrations()` called in both DI files | Code review |
| DOD-10 | `main.ts` calls `createServices()` in `app.on('ready')` | Code review |
| DOD-11 | `main.ts` creates window AFTER DI bootstrap completes | Code review |
| DOD-12 | `main.ts` temporary verify code (better-sqlite3 + auth) removed | Code review |
| DOD-13 | `preload.ts` implements 4 contextBridge service groups | Code review |
| DOD-14 | `preload.ts` CryptoProvider marshalling wraps all 4 methods | Code review |
| DOD-15 | `preload.ts` does NOT expose `DatabaseConnection` or `refreshAccessToken` | Code review |
| DOD-16 | `apps/capacitor/src/index.tsx` creates React context + provider | Code review |
| DOD-17 | `apps/capacitor/src/index.tsx` no longer renders `AuthVerifyRunner` | Code review |
| DOD-18 | `pnpm typecheck` passes with zero errors in all 5 packages | CLI |
| DOD-19 | `pnpm lint` passes with zero errors in all packages | CLI |
| DOD-20 | Zero `electron` imports in Capacitor DI file | grep verification |
| DOD-21 | Zero `@capacitor/*` or `capacitor-*` imports in Electron DI or preload | grep verification |
| DOD-22 | Zero platform conditionals in `packages/shared/` or `packages/renderer/` | grep `platform ===` (Rule 13.1) |
| DOD-23 | Zero `client_secret` or `clientSecret` in any file | grep verification |
| DOD-24 | Electron `contextIsolation: true` + `nodeIntegration: false` unchanged in `main.ts` | Code review (Rule 15.3) |
| DOD-25 | `preload.ts` uses `.ts` extension (no JSX) | File extension check (Rule 11.6) |
| DOD-26 | `di.ts` files use `.ts` extension | File extension check |
| DOD-27 | Electron `main.ts` uses `fileURLToPath` + `dirname` pattern (if path resolution needed) | Code review (Rule 15.2b) |
| DOD-28 | All existing Jest tests pass | `pnpm --filter @collectio/shared test`; `pnpm --filter @collectio/platform test` |
| DOD-29 | `ElectronStorageProvider` constructor error handling present in DI | Code review — clear error if DPAPI unavailable |
| DOD-30 | Each provider construction step in DI has a descriptive log message | Code review (§11) |

---

## Appendix A: Dependency Map

```
E-02 T-02.3 (DatabaseConnection) ──────────── DONE ── BetterSqlite3Connection, CapacitorSqliteConnection
E-03 T-03.1 through T-03.6 (CryptoProvider) ── DONE ── NodeCryptoProvider, WebCryptoProvider
E-04 T-04.1 (ElectronAuthProvider) ─────────── DONE
E-04 T-04.2 (CapacitorAuthProvider) ────────── DONE
E-04 T-04.3 (ElectronStorageProvider) ──────── DONE
E-04 T-04.4 (CapacitorStorageProvider) ─────── DONE
E-04 T-04.5 (TokenRefresher) ──────────────── DONE
E-04 T-04.6, T-04.7 (Integration Tests) ───── DONE (quality gates)

E-04 T-04.8 (Dependency Injection Setup) ──── THIS TASK
    │
    ├── BLOCKS ── E-09 (Cloud Storage Layer — GoogleDriveProvider needs TokenRefresher)
    ├── BLOCKS ── E-10 (Sync Engine — needs DatabaseConnection + CryptoProvider + TokenRefresher)
    └── BLOCKS ── E-15 (UI Shell — needs ServiceProvider in React context)
```

## Appendix B: Architectural Traceability

| Architecture Requirement | Where Addressed |
|---|---|
| Platform Services interfaces (01_ARCHITECTURE.md §4) | `ServiceProvider` fields reference only interface types |
| Platform Implementations isolated (01_ARCHITECTURE.md §4) | DI files live in `apps/electron/` and `apps/capacitor/` — platform boundary per 05_FOLDER_STRUCTURE.md §6 |
| No platform conditionals (Rule 13.1) | Electron DI imports Electron providers; Capacitor DI imports Capacitor providers; no `if (platform === ...)` |
| Renderer never imports platform code (Rule 13.4) | Renderer accesses `ServiceProvider` (interface from `shared/`) through React context or `window.collectio` |
| Domain layer pure TypeScript (Rule 13.2) | `ServiceProvider` imports only from `domain/` and `data/` within `shared/` |
| `contextIsolation: true` (Rule 15.3) | `main.ts` BrowserWindow config unchanged; `preload.ts` uses `contextBridge` exclusively |
| No `vite-plugin-electron-renderer` (Rule 15.4) | Not added; all renderer access through contextBridge |
| DI container manages OAuth config (AD-03) | Each `di.ts` holds its platform's `OAuthConfig`; never shared across platforms |
| Platform providers injected via React context (06_IMPLEMENTATION_DECISIONS.md line 525) | Capacitor `index.tsx` creates `ServiceProviderContext`; Electron `window.collectio` wraps via contextBridge |
| `DatabaseConnection` is async (AD-01) | `createServices()` returns `Promise<ServiceProvider>` to accommodate async construction |

## Appendix C: OAuth Configuration

Each DI file must define its platform's `OAuthConfig`. These are NOT hardcoded production secrets — they must be injected:

**Electron (`apps/electron/src/di.ts`):**
```
const OAUTH_CONFIG: OAuthConfig = {
  clientId: getClientId(),           // from env var or build-time config
  redirectUri: 'http://localhost',   // loopback — port chosen by signIn()
  scopes: ['https://www.googleapis.com/auth/drive.appdata'],
};
```
Google Cloud Console client type: **"Desktop app"** (AD-03)

**Capacitor (`apps/capacitor/src/di.ts`):**
```
const OAUTH_CONFIG: OAuthConfig = {
  clientId: getClientId(),            // from build-time config or Capacitor config
  redirectUri: 'com.collectio.app://', // deep link scheme (Rule 6.2)
  scopes: ['https://www.googleapis.com/auth/drive.appdata'],
};
```
Google Cloud Console client type: **"Android"** (Rule 6.1)

The `getClientId()` helper can be a simple function that reads from `process.env` (Electron) or a build-time injected constant (Capacitor). For V1 development, placeholder client IDs are acceptable — real OAuth will fail until configured. The DI files must NOT throw if `clientId` is a placeholder — failure should occur at first `signIn()` call, not at app startup.

## Appendix D: What Replaces the Temporary Verification Code

In `main.ts`, the block at lines 46-91 is replaced with:

1. Import `createServices` from `./di.js`
2. In `app.on('ready')`:
   ```
   createServices()
     .then((services) => {
       // Store services reference for app lifecycle (future: cleanup on quit)
       // Create window (renderer accesses services via preload contextBridge)
       createWindow();
     })
     .catch((err) => {
       // Fatal: cannot start without DI
       console.error('Failed to initialize platform services:', err);
       app.quit();
     });
   ```
3. The `createWindow()` function remains unchanged (already configured with `contextIsolation: true` and correct preload path).

The `writeFileSync` import and `runVerify` import are removed. The `better-sqlite3-verify` module remains in the codebase (it was used for spike validation) but is no longer imported by `main.ts`.

## Appendix E: TokenRefresher Export for ServiceProvider

`ServiceProvider` references `TokenRefresher` as a type. Currently `TokenRefresher` is exported from `packages/platform/src/shared/index.ts` → `packages/platform/src/index.ts` (empty barrel). The `ServiceProvider` interface must import this type. Since `ServiceProvider` lives in `packages/shared/`, and `shared` is NOT allowed to import from `platform/` (05_FOLDER_STRUCTURE.md §2), there are two options:

**Chosen approach:** `ServiceProvider` defines `tokenRefresher` with the `TokenRefresher` class type, imported directly from `@collectio/platform`. This is a narrow exception to the "shared never imports platform" rule, justified because:
1. `TokenRefresher` is a shared platform service — it works identically on both platforms and has zero platform dependencies
2. It's imported as a TYPE only (the interface uses it for the DI contract, not for runtime logic)
3. Without this import, `ServiceProvider` cannot type the `tokenRefresher` field, forcing consumers to use `any` or a separate interface

**Alternative:** Define a `TokenRefresher` interface in `shared/domain/interfaces/` matching the public API. This adds a maintenance burden (interface must stay in sync with implementation) but keeps the strict layer boundary. For V1, the direct import is preferred.

If the layer boundary violation is unacceptable, define:
```
// packages/shared/src/domain/interfaces/TokenRefresher.ts
export interface ITokenRefresher {
  getAccessToken(): Promise<string | null>;
  setTokens(tokens: AuthTokens): void;
  clear(): void;
  readonly needsReauth: boolean;
}
```
And use `ITokenRefresher` in `ServiceProvider` instead of the concrete class.
