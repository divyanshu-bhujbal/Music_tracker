# Architecture & Module Boundaries

> Source: PROJECT_CONSTITUTION.md Sections 9–11, Appendix B
> Target: Personal Collection Manager V1.0

---

## 1. Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                 PRESENTATION LAYER                  │
│    React Native Components + React Navigation       │
│    Category UI Modules (Songs, future: Books...)    │
└─────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────┐
│               APPLICATION LAYER                     │
│    Category Framework  │  Sync Engine               │
│    Duplicate Detector  │  Conflict Resolver          │
│    Search/Filter Engine│  Settings Manager           │
└─────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────┐
│                DOMAIN LAYER                         │
│    Category Definition Interface                    │
│    Entity Models (Song, Artist, Language, ...)      │
│    Repository Interfaces                            │
└─────────────────────────────────────────────────────┘
                           │
┌──────────────────┬────────────────────────────────────┐
│  DATA LAYER      │    PLATFORM SERVICES LAYER         │
│  SQLite (local)  │  Auth Interface                    │
│  Repository Impl │  SecureStorage Interface           │
│  Migrations      │  CloudStorageProvider Interface    │
│  Change Tracker  │  CryptoProvider Interface          │
└──────────────────┴────────────────────────────────────┘
                           │
┌──────────────────────────────────────────────────────┐
│            PLATFORM IMPLEMENTATIONS                  │
│  Android: RN modules (keychain, google-signin, etc.) │
│  Windows: Custom PKCE flow, native/WASM crypto, etc. │
└──────────────────────────────────────────────────────┘
```

### Layer Dependencies

Dependencies flow **top-down only** — layers above depend on layers below, never the reverse.

```
Presentation → Application → Domain ← Data + Platform Services ← Platform Implementations
                                ↑
                   (Domain is pure TypeScript — no platform code, no React, no SQLite)
```

### Primary vs. Fallback Architecture

| | Option A (Primary) | Option C (Fallback) |
|---|---|---|
| **Windows target** | React Native for Windows | Electron |
| **Android target** | React Native | React Native |
| **Code sharing** | ~90% | ~75-85% |
| **Shared code** | Single codebase | Monorepo with shared TypeScript package |
| **Decision gate** | E-00 Technical Spike must pass all 7 validations | Escalate if any spike task fails irrecoverably |

---

## 2. Technology Stack

### Core Framework

| Component | Technology | Notes |
|---|---|---|
| Application framework | React Native (bare workflow) | No Expo managed workflow |
| Windows target | React Native for Windows (RNW) | Microsoft maintained |
| Language | TypeScript (strict mode) | All source code |
| Navigation | React Navigation 6 | Proven; supports both platforms |
| State management | Zustand | Lightweight; no boilerplate |
| Async data / caching | TanStack Query (React Query) | Server-state analogue for local async queries |

### Data Layer

| Component | Technology | Notes |
|---|---|---|
| Local database | SQLite | Via `react-native-sqlite-storage` |
| ORM / Query builder | **None** — raw SQL via typed repository pattern | Avoids ORM complexity for simple schema |
| Schema migrations | Custom versioned migration runner | Built in-house; lightweight |

### Security

| Component | Technology | Notes |
|---|---|---|
| Key derivation | Argon2id | `react-native-argon2` (Android); WASM fallback (Windows) |
| Symmetric encryption | AES-256-GCM | `react-native-quick-crypto` or platform native |
| Secure storage | `react-native-keychain` | Android Keystore / Windows Credential Manager |
| Google OAuth | `@react-native-google-signin/google-signin` (Android); Custom PKCE (Windows) | Scoped behind AuthProvider interface |

### Cloud Integration

| Component | Technology | Notes |
|---|---|---|
| Cloud storage | Google Drive REST API | `drive.appdata` scope; app-private folder |
| HTTP client | `fetch` (built-in) | No additional HTTP library needed |

### UI Components

| Component | Technology | Notes |
|---|---|---|
| Component library | React Native Paper | Material Design |
| Icons | React Native Vector Icons | Validate Windows support during spike |
| Virtualized list | FlashList (`@shopify/flash-list`) | Fallback: FlatList |

### Build and Tooling

| Component | Technology | Notes |
|---|---|---|
| Package manager | pnpm | Workspace support for potential monorepo |
| Linting | ESLint + `@typescript-eslint` | Strict rules |
| Formatting | Prettier | Enforced on commit |
| Testing | Jest + React Native Testing Library | Unit and integration tests |
| E2E testing | Detox (Android only) | Windows E2E testing out of scope for V1 |

---

## 3. Module Boundaries

### Boundary Rules

1. **Platform-specific code is isolated** behind interfaces. No platform conditionals (`if (Platform.OS === 'windows')`) outside the Platform Implementations layer.
2. **Adding a new category** requires implementing `CategoryDefinition` only — zero changes to Application or Presentation core.
3. **Adding a new cloud storage provider** requires implementing `CloudStorageProvider` only — zero changes to the Sync Engine.
4. **Domain layer is pure TypeScript.** Zero React Native imports, zero platform APIs, zero database code. Dependencies flow in, never out.
5. **Data layer uses raw SQL** with typed repositories. No ORM. Every query is explicit and auditable.

### Layer Responsibilities

#### Presentation Layer
- React Native screens, dialogs, navigation
- Category-specific UI components (Table, Tile, Detail, Edit, Create)
- No business logic — delegates all decisions to Application layer
- No direct database access — reads/writes through Application layer stores

#### Application Layer
- **Category Framework:** Registry, active category switching, navigation hooks
- **Sync Engine:** Dirty state tracking, inactivity timer, sync orchestration, LWW merge
- **Conflict Resolver:** Orphaned FK detection, deterministic conflict outcomes
- **Duplicate Detector:** Name normalization, artist set comparison, resolution delegation
- **Search/Filter Engine:** Composable query building, debounced search
- **Settings Manager:** Read/write app_settings, defaults, validation

#### Domain Layer
- **CategoryDefinition interface:** The extension contract for all categories
- **Entity models:** Pure TypeScript types — Song, Artist, Language, Device, SyncLog
- **Repository interfaces:** Generic `IRepository<T>` and specific `ISongRepository`, etc.
- Must be the only layer imported by Presentation, Application, Data, and Platform Services

#### Data Layer
- **DatabaseConnection:** Singleton/connection pool, `open()`, `close()`, `execute()`, `query()`, `transaction()`
- **MigrationRunner:** Versioned SQL migration execution at startup
- **Repository implementations:** Typed SQL queries implementing domain interfaces
- **Change Tracker:** Queries for identifying local/remote changes by `updated_at`

#### Platform Services Layer
- **Interfaces only:** `AuthProvider`, `CryptoProvider`, `SecureStorageProvider`, `CloudStorageProvider`
- No implementations in this layer — only contracts

#### Platform Implementations Layer
- **Android:** `GoogleAuthProviderAndroid`, `NativeCryptoProvider`, `KeychainStorageProvider`, `GoogleDriveProvider`
- **Windows:** `GoogleAuthProviderWindows` (custom PKCE), `WasmCryptoProvider`, `CredentialManagerStorage`, `GoogleDriveProvider`
- **Shared:** `GoogleDriveProvider` (Drive REST API wrapper — platform-agnostic)

---

## 4. Interface Contracts

These interfaces are mandated by the constitution and are the only contracts between modules.

| Interface | V1 Implementation(s) | Purpose |
|---|---|---|
| `CloudStorageProvider` | `GoogleDriveProvider` | Upload, download, list, delete cloud database files |
| `AuthProvider` | `GoogleAuthProviderAndroid`, `GoogleAuthProviderWindows` | OAuth PKCE flow, token management, sign-out |
| `CryptoProvider` | `NativeCryptoProvider` (platform-native or WASM) | Argon2id KDF, AES-256-GCM encrypt/decrypt |
| `SecureStorageProvider` | `KeychainStorageProvider` | Read/write/delete platform secure storage entries |
| `CategoryDefinition` | `SongsCategory` (V1 only) | Per-category schema, repositories, UI components, duplicate detection |

### CloudStorageProvider

```
upload(data: Uint8Array, fileName: string): Promise<{fileId: string, modifiedTime: string}>
download(fileId: string): Promise<{data: Uint8Array, modifiedTime: string}>
list(): Promise<Array<{fileId: string, name: string, modifiedTime: string}>>
delete(fileId: string): Promise<void>
```

### AuthProvider

```
signIn(): Promise<{accessToken: string, refreshToken: string, expiresAt: number}>
refreshAccessToken(refreshToken: string): Promise<{accessToken: string, expiresAt: number}>
signOut(): Promise<void>
getStoredTokens(): Promise<{accessToken: string, refreshToken: string} | null>
```

### CryptoProvider

```
deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array>
generateSalt(): Uint8Array
encryptDatabase(db: Uint8Array, key: Uint8Array): Promise<Uint8Array>
decryptDatabase(encrypted: Uint8Array, key: Uint8Array): Promise<Uint8Array>
```

### SecureStorageProvider

```
store(key: string, value: string): Promise<void>
retrieve(key: string): Promise<string | null>
delete(key: string): Promise<void>
clear(): Promise<void>
```

### CategoryDefinition

| Property / Method | Type | Purpose |
|---|---|---|
| `id` | `string` | Unique slug (e.g., `songs`) |
| `displayName` | `string` | UI display name |
| `iconName` | `string` | Icon identifier |
| `migrations` | `Migration[]` | Schema migrations for this category's tables |
| `repositories` | `RepositoryMap` | Data access objects for this category's entities |
| `tableColumns` | `ColumnDefinition[]` | Column definitions for the table view |
| `searchFields` | `string[]` | Field names to include in global search |
| `filterFields` | `FilterDefinition[]` | Column filter configurations |
| `createForm` | `React.FC` | Form component for creating an item |
| `editForm` | `React.FC` | Form component for editing an item |
| `detailView` | `React.FC` | Read-only detail component |
| `duplicateDetector` | `Function` | Takes candidate item, returns potential duplicates |

---

## 5. Navigation Structure

```
App Root
├── Auth Flow (conditional; shown if not authenticated)
│   ├── SetupScreen (first launch)
│   └── UnlockScreen (session expired)
└── Main App (after authentication)
    ├── MainLayout (sidebar + content area)
    │   ├── Sidebar (collapsible)
    │   │   ├── SyncStatusPanel
    │   │   ├── CategoryNav (V1: Songs only)
    │   │   └── SettingsLink
    │   └── ContentArea
    │       ├── CategoryScreen (Songs, future: Books, Movies...)
    │       │   ├── TableView (default)
    │       │   └── TileView (toggle)
    │       ├── TrashScreen
    │       └── SettingsScreen
    └── Modal Stack (overlays main content)
        ├── ItemDetailDialog
        ├── ItemEditDialog
        ├── ItemCreateDialog
        ├── ConflictResolutionDialog
        └── DuplicateDetectionDialog
```

---

## 6. Design Principles

- **Simplicity over features.** A feature not built cannot break.
- **Reliability over novelty.** SQLite, AES-256-GCM, OAuth 2.0 — proven and well-supported.
- **Data integrity above all.** Never silently lose, overwrite, or corrupt data.
- **Privacy by design.** Cloud copy encrypted with a key the server never sees.
- **Extensibility through discipline.** Adding a category or cloud provider in V2 requires only implementing a defined interface.
