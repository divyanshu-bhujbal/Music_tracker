# Architecture & Module Boundaries

> Source: PROJECT_CONSTITUTION.md v1.1 Sections 9–11, Appendix B
> Target: Personal Collection Manager V1.0
> **(Revised — Electron + Capacitor adopted; Option A (RN+RNO) rejected)**

---

## 1. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                   RENDERER (Web UI)                         │
│    React Components + React Router                          │
│    Category UI Modules (Songs, future: Books...)            │
│    Runs in: Electron BrowserWindow / Capacitor WebView       │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                 APPLICATION LAYER                           │
│    Category Framework  │  Sync Engine                        │
│    Duplicate Detector  │  Conflict Resolver                  │
│    Search/Filter Engine│  Settings Manager                   │
│    (Pure TypeScript — identical to original)                 │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                  DOMAIN LAYER                                │
│    Category Definition Interface                             │
│    Entity Models (Song, Artist, Language, ...)              │
│    Repository Interfaces                                     │
│    (Unchanged from original)                                  │
└─────────────────────────────────────────────────────────────┘
                              │
┌────────────────────┬──────────────────────────────────────────┐
│    DATA LAYER      │      PLATFORM SERVICES LAYER            │
│  SQLite (local)    │  Auth Interface                          │
│  Repository Impl   │  SecureStorage Interface                 │
│  Migrations        │  CloudStorageProvider Interface          │
│  Change Tracker    │  CryptoProvider Interface                │
│  (SQL unchanged)   │  (Interfaces unchanged)                  │
└────────────────────┴──────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────┐
│              PLATFORM IMPLEMENTATIONS                        │
│                                                              │
│  Electron (Windows)  │  Capacitor (Android)                  │
│  • better-sqlite3    │  • @capacitor-community/sqlite        │
│  • Node.js crypto    │  • Web Crypto API (SubtleCrypto)      │
│  • argon2 (npm)      │  • argon2-wasm                        │
│  • electron-store    │  • @capacitor/secure-storage           │
│  • google-auth-lib   │  • @capacitor-community/oauth          │
│  • electron APIs     │  • @capacitor/core plugins            │
└──────────────────────────────────────────────────────────────┘
```

### Layer Dependencies

Dependencies flow **top-down only** — layers above depend on layers below, never the reverse.

```
Renderer → Application → Domain ← Data + Platform Services ← Platform Implementations
                               ↑
                  (Domain is pure TypeScript — no platform code, no React, no SQLite)
```

### Current Architecture

| | Windows | Android |
|---|---|---|
| **Platform target** | Electron 30+ | Capacitor 6+ |
| **UI renderer** | React web in BrowserWindow | React web in WebView |
| **Code sharing** | ~90–95% (single React web UI + shared TypeScript core) |
| **Package manager** | pnpm monorepo with 5 workspace packages |

---

## 2. Technology Stack

### Core Framework

| Component | Technology | Notes |
|---|---|---|
| Application framework | React 18+ (web) | Single React web UI on both platforms |
| Windows target | Electron 30+ | Desktop shell with Chromium renderer |
| Android target | Capacitor 6+ | Native WebView wrapper with plugin access |
| Language | TypeScript (strict mode) | All source code |
| Navigation | React Router v6+ | Web-standard routing across both platforms |
| State management | Zustand | Lightweight; no boilerplate |
| Async data / caching | TanStack Query (React Query) | Server-state analogue for local async queries |

### Data Layer

| Component | Technology | Notes |
|---|---|---|
| Local database (Electron) | SQLite via `better-sqlite3` | Synchronous; native Node.js addon |
| Local database (Capacitor) | SQLite via `@capacitor-community/sqlite` | Async; Capacitor plugin |
| ORM / Query builder | **None** — raw SQL via typed repository pattern | Avoids ORM complexity for simple schema |
| Schema migrations | Custom versioned migration runner | Identical SQL files on both platforms |

### Security

| Component | Electron | Capacitor |
|---|---|---|
| Key derivation | `argon2` npm package (native) | `argon2-wasm` (WebAssembly) |
| Symmetric encryption | Node.js `crypto` built-in | Web Crypto `SubtleCrypto` |
| Secure storage | `electron-store` + `safeStorage` (DPAPI) | `@capacitor/secure-storage` (Android Keystore) |
| Google OAuth | `google-auth-library` + PKCE | Custom PKCE with `@capacitor/browser` |

### Cloud Integration

| Component | Technology | Notes |
|---|---|---|
| Cloud storage | Google Drive REST API | `drive.appdata` scope; app-private folder |
| HTTP client | `fetch` (built-in) | Available in both Electron and Capacitor WebView |

### UI Components

| Component | Technology | Notes |
|---|---|---|
| Component library | Material UI (MUI) | Mature React web component library |
| Icons | `@mui/icons-material` | Full Material icon set |
| Virtualized list | `@tanstack/react-virtual` | High-performance virtualized rendering |

### Build and Tooling

| Component | Technology | Notes |
|---|---|---|
| Package manager | pnpm | Monorepo workspace support |
| Bundler | Vite | Fast HMR; Electron uses Vite output |
| Linting | ESLint + `@typescript-eslint` | Strict rules |
| Formatting | Prettier | Enforced on commit |
| Testing | Jest + React Testing Library (web) | Unit and integration tests |
| E2E testing | Playwright | Tests Electron app + Capacitor web app |

---

## 3. Module Boundaries

### Boundary Rules

1. **Platform-specific code is isolated** behind interfaces. No platform conditionals (`if (platform === 'electron')`) outside the Platform Implementations layer.
2. **Adding a new category** requires implementing `CategoryDefinition` only — zero changes to Application or Renderer core.
3. **Adding a new cloud storage provider** requires implementing `CloudStorageProvider` only — zero changes to the Sync Engine.
4. **Domain layer is pure TypeScript.** Zero React imports, zero platform APIs, zero database code. Dependencies flow in, never out.
5. **Data layer uses raw SQL** with typed repositories. No ORM. Every query is explicit and auditable.

### Layer Responsibilities

#### Renderer Layer
- React web screens, dialogs, navigation
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
- Must be the only layer imported by Renderer, Application, Data, and Platform Services

#### Data Layer
- **DatabaseConnection:** Async interface; Electron uses sync `better-sqlite3` wrapped in Promise.resolve; Capacitor uses async plugin bridge
- **MigrationRunner:** Versioned SQL migration execution at startup
- **Repository implementations:** Typed SQL queries implementing domain interfaces
- **Change Tracker:** Queries for identifying local/remote changes by `updated_at`

#### Platform Services Layer
- **Interfaces only:** `AuthProvider`, `CryptoProvider`, `SecureStorageProvider`, `CloudStorageProvider`
- No implementations in this layer — only contracts

#### Platform Implementations Layer
- **Electron:** `ElectronAuthProvider` (PKCE + `google-auth-library`), `NodeCryptoProvider` (`argon2` npm + Node.js `crypto`), `ElectronStorageProvider` (`electron-store` + `safeStorage`), `BetterSqlite3Connection`
- **Capacitor:** `CapacitorAuthProvider` (PKCE + `@capacitor/browser`), `WebCryptoProvider` (`argon2-wasm` + SubtleCrypto), `CapacitorStorageProvider` (`@capacitor/secure-storage`), `CapacitorSqliteConnection`
- **Shared:** `GoogleDriveProvider` (Drive REST API wrapper — platform-agnostic, uses `fetch`)

---

## 4. Interface Contracts

These interfaces are mandated by the constitution and are the only contracts between modules.

| Interface | V1 Implementation(s) | Purpose |
|---|---|---|
| `CloudStorageProvider` | `GoogleDriveProvider` | Upload, download, list, delete cloud database files |
| `AuthProvider` | `ElectronAuthProvider`, `CapacitorAuthProvider` | OAuth PKCE flow, token management, sign-out |
| `CryptoProvider` | `NodeCryptoProvider` (Electron), `WebCryptoProvider` (Capacitor) | Argon2id KDF, AES-256-GCM encrypt/decrypt |
| `SecureStorageProvider` | `ElectronStorageProvider`, `CapacitorStorageProvider` | Read/write/delete platform secure storage entries |
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
