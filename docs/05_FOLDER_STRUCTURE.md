# Folder Structure

> Inferred from PROJECT_CONSTITUTION.md architecture layers (Section 11), technology stack (Section 12), and interface contracts (Appendix B).
> The constitution defines layers and modules but not a specific directory layout.

---

## 1. Directory Tree

```
collectio/
│
├── .husky/                              # Git hooks (Prettier + lint on commit)
│   └── pre-commit
│
├── src/
│   │
│   ├── presentation/                    # LAYER 1: UI Components + Navigation
│   │   │
│   │   ├── navigation/
│   │   │   ├── AppNavigator.tsx         # Auth flow vs. Main app conditional routing
│   │   │   └── MainNavigator.tsx        # Tab/stack navigator for main app screens
│   │   │
│   │   ├── screens/
│   │   │   ├── SetupScreen.tsx          # First-launch email + password + disclosure warning
│   │   │   ├── UnlockScreen.tsx         # Credential restore flow (keychain cleared)
│   │   │   ├── SettingsScreen.tsx       # Sync delay, theme, default view, toggles
│   │   │   └── TrashScreen.tsx          # Soft-deleted items with restore action
│   │   │
│   │   ├── components/                  # Shared/reusable UI components
│   │   │   ├── Sidebar.tsx              # Collapsible sidebar shell
│   │   │   ├── SyncStatusPanel.tsx      # Sync icon, last sync time, pending count
│   │   │   ├── CategoryNav.tsx          # Category list in sidebar
│   │   │   ├── TableView.tsx            # Generic virtualized table (category-agnostic)
│   │   │   ├── TileView.tsx             # Generic card grid (category-agnostic)
│   │   │   ├── SearchBar.tsx            # Global search input with debounce
│   │   │   ├── ColumnFilterPopover.tsx  # Per-column multi-select filter
│   │   │   ├── SelectionModeBar.tsx     # Bulk action bar (Delete Selected, Clear)
│   │   │   └── PlatformContextMenu.tsx  # Windows right-click menu / Android long-press
│   │   │
│   │   └── dialogs/
│   │       ├── ItemDetailDialog.tsx     # Read-only detail view modal
│   │       ├── ItemEditDialog.tsx       # Edit form modal
│   │       ├── ItemCreateDialog.tsx     # Create form modal
│   │       ├── DuplicateDetectionDialog.tsx  # Duplicate resolution options
│   │       └── ConflictResolutionDialog.tsx  # Sync conflict display (future)
│   │
│   ├── application/                     # LAYER 2: Business Logic Orchestration
│   │   │
│   │   ├── category/
│   │   │   ├── CategoryRegistry.ts      # Static registry of all CategoryDefinitions
│   │   │   ├── useActiveCategory.ts     # Zustand store for active category state
│   │   │   └── useCategoryList.ts       # Hook to list enabled categories for sidebar
│   │   │
│   │   ├── sync/
│   │   │   ├── SyncEngine.ts            # 14-step sync algorithm orchestrator
│   │   │   ├── ConflictResolver.ts      # LWW merge logic + orphan FK resolution
│   │   │   ├── ChangeTracker.ts         # Identifies local/remote changes by updated_at
│   │   │   ├── DirtyStateTracker.ts     # Computes dirty flag and pending change count
│   │   │   ├── SyncTimer.ts             # Inactivity timer management
│   │   │   ├── SyncLock.ts              # In-memory mutex for concurrent sync prevention
│   │   │   └── useSyncStore.ts          # Zustand store: sync state, logs, sidebar status
│   │   │
│   │   ├── search/
│   │   │   ├── SearchEngine.ts          # Cross-field text search query builder
│   │   │   ├── FilterEngine.ts          # Column filter composition (AND logic)
│   │   │   └── SortEngine.ts            # Single-column sort with cycling (asc→desc→none)
│   │   │
│   │   ├── duplicate/
│   │   │   └── DuplicateDetector.ts     # Name normalization pipeline + artist set comparison
│   │   │
│   │   └── settings/
│   │       ├── SettingsManager.ts       # Read/write app_settings with defaults
│   │       └── useSettingsStore.ts      # Zustand store for current settings values
│   │
│   ├── domain/                          # LAYER 3: Pure TypeScript — No Platform Code
│   │   │
│   │   ├── models/
│   │   │   ├── Song.ts                  # Song entity type
│   │   │   ├── Artist.ts                # Artist entity type
│   │   │   ├── Language.ts              # Language reference type
│   │   │   ├── Category.ts              # Category reference type
│   │   │   ├── Device.ts                # Device entity type
│   │   │   ├── SyncLog.ts               # Sync log entry type
│   │   │   ├── AppSetting.ts            # Setting key-value pair type
│   │   │   └── Migration.ts             # Migration metadata type
│   │   │
│   │   ├── interfaces/
│   │   │   ├── CategoryDefinition.ts    # Extension contract for all categories
│   │   │   ├── CloudStorageProvider.ts  # Upload/download/list/delete cloud files
│   │   │   ├── AuthProvider.ts          # OAuth flow + token management
│   │   │   ├── CryptoProvider.ts        # KDF + encrypt + decrypt
│   │   │   ├── SecureStorageProvider.ts # Read/write platform secure storage
│   │   │   └── IRepository.ts           # Generic typed repository interface
│   │   │
│   │   └── repositories/                # Domain repository interfaces (what, not how)
│   │       ├── IAppMetadataRepository.ts
│   │       ├── IDeviceRepository.ts
│   │       ├── ISyncLogRepository.ts
│   │       ├── IAppSettingsRepository.ts
│   │       ├── ILanguageRepository.ts
│   │       ├── ICategoryRepository.ts
│   │       ├── ISongRepository.ts
│   │       ├── IArtistRepository.ts
│   │       └── ISongArtistRepository.ts
│   │
│   ├── data/                            # LAYER 4a: Data Access Implementations
│   │   │
│   │   ├── database/
│   │   │   ├── DatabaseConnection.ts    # Open/close, execute, query, transaction
│   │   │   ├── MigrationRunner.ts       # Versioned migration execution at startup
│   │   │   ├── QueryBuilder.ts          # Type-safe raw SQL query helper
│   │   │   └── migrations/
│   │   │       ├── 001_core_infrastructure.sql
│   │   │       └── 002_songs_category.sql
│   │   │
│   │   └── repositories/                # Repository implementations (raw SQL)
│   │       ├── AppMetadataRepository.ts
│   │       ├── DeviceRepository.ts
│   │       ├── SyncLogRepository.ts
│   │       ├── AppSettingsRepository.ts
│   │       ├── LanguageRepository.ts
│   │       ├── CategoryRepository.ts
│   │       ├── SongRepository.ts
│   │       ├── ArtistRepository.ts
│   │       └── SongArtistRepository.ts
│   │
│   ├── platform/                        # LAYER 4b + 5: Platforms Services + Implementations
│   │   │
│   │   │── android/
│   │   │   ├── GoogleAuthProviderAndroid.ts     # @react-native-google-signin wrapper
│   │   │   ├── NativeCryptoProvider.ts          # react-native-argon2 + react-native-quick-crypto
│   │   │   └── KeychainStorageProvider.ts       # react-native-keychain (Android Keystore)
│   │   │
│   │   ├── windows/
│   │   │   ├── GoogleAuthProviderWindows.ts     # Custom PKCE browser flow
│   │   │   ├── WasmCryptoProvider.ts            # WASM Argon2id + SubtleCrypto AES-GCM
│   │   │   ├── CredentialManagerStorage.ts      # react-native-keychain (Windows Credential Manager)
│   │   │   └── CustomURISchemeHandler.ts        # Deep link handler for collectio://oauth
│   │   │
│   │   └── shared/
│   │       ├── GoogleDriveProvider.ts           # Drive REST API v3 wrapper
│   │       ├── TokenRefresher.ts                # Proactive token refresh with 5-min buffer
│   │       └── network-monitor.ts               # Connectivity detection (online/offline)
│   │
│   └── categories/                     # Category implementations (plug-in modules)
│       │
│       └── songs/
│           ├── index.ts                # Exports SongsCategory definition
│           ├── SongsCategory.ts        # CategoryDefinition implementation
│           ├── components/
│           │   ├── SongsTable.tsx       # Songs-specific column config for TableView
│           │   ├── SongsTile.tsx        # Songs-specific card for TileView
│           │   ├── SongDetailDialog.tsx # Read-only song detail
│           │   ├── SongEditDialog.tsx   # Edit song form
│           │   └── SongCreateDialog.tsx # Create song form + duplicate detection
│           ├── SongsDuplicateDetector.ts # Category-specific duplicate logic
│           └── songs-columns.ts         # Column definitions for table view
│
├── assets/
│   ├── fonts/                          # Custom fonts (if needed)
│   └── icons/                          # App icons (android/ and windows/ subdirs)
│
├── android/                            # React Native Android project (auto-generated)
│   └── app/
│       └── build.gradle
│
├── windows/                            # React Native for Windows project (auto-generated)
│   └── collectio/
│       └── Package.appxmanifest
│
├── __tests__/
│   ├── domain/                         # Tests matching domain/folder filenames
│   ├── data/                           # Repository integration tests
│   ├── application/                    # Sync engine, search, duplicate detection tests
│   └── components/                     # React component tests
│
├── .eslintrc.js                        # ESLint configuration
├── .prettierrc                         # Prettier configuration
├── package.json                        # Dependencies and scripts
├── tsconfig.json                       # TypeScript strict mode configuration
├── babel.config.js                     # Babel configuration (RN)
├── pnpm-lock.yaml                      # Lock file (pnpm)
├── pnpm-workspace.yaml                 # Monorepo workspace config (future-proofing)
├── react-native.config.js              # React Native CLI configuration
├── .gitignore                          # Git ignore rules
├── PROJECT_CONSTITUTION.md             # Design authority document
├── docs/                               # Architecture & implementation docs
│   ├── 01_ARCHITECTURE.md
│   ├── 02_DATABASE_SCHEMA.md
│   ├── 03_SYNC_STATE_MACHINE.md
│   ├── 04_MIGRATION_STRATEGY.md
│   └── 05_FOLDER_STRUCTURE.md
└── SPIKE_DECISION.md                   # E-00 Technical Spike pass/fail record
```

---

## 2. Layer-to-Directory Mapping

| Architecture Layer | Directory | Allowed Imports | Forbidden Import Examples |
|--------------------|-----------|-----------------|--------------------------|
| Presentation | `src/presentation/` | `application/`, `domain/`, react, react-native | `data/`, `platform/` |
| Application | `src/application/` | `domain/` | `data/`, `platform/`, `presentation/`, `categories/` |
| Domain | `src/domain/` | _(nothing external)_ | Any `src/` subdirectory |
| Data | `src/data/` | `domain/` | `application/`, `presentation/` |
| Platform Services | `src/platform/` | `domain/`, react-native modules | `application/`, `presentation/`, `data/` |
| Categories | `src/categories/` | `application/`, `domain/`, `presentation/` | `data/` (use repositories through domain interfaces), `platform/` |

---

## 3. Category Module Convention

Each category module follows a fixed convention. Adding a new category (e.g., Books) means creating:

```
src/categories/books/
├── index.ts                 # Exports BooksCategory
├── BooksCategory.ts         # Implements CategoryDefinition
├── components/
│   ├── BooksTable.tsx
│   ├── BooksTile.tsx
│   ├── BookDetailDialog.tsx
│   ├── BookEditDialog.tsx
│   └── BookCreateDialog.tsx
├── BooksDuplicateDetector.ts
└── books-columns.ts
```

**Registration:** The category is registered in the app entry point:
```typescript
import { CategoryRegistry } from '@/application/category/CategoryRegistry';
import { BooksCategory } from '@/categories/books';
CategoryRegistry.register(BooksCategory);
```

**No other files change.** The sidebar, navigation, search engine, and sync engine automatically include the new category because they query `CategoryRegistry`.

---

## 4. Import Aliases (tsconfig paths)

```
@/              → src/
@domain/        → src/domain/
@application/   → src/application/
@data/          → src/data/
@platform/      → src/platform/
@presentation/  → src/presentation/
@categories/    → src/categories/
```

This keeps imports clean and avoids relative path hell (`../../../../domain/models/Song`).

---

## 5. File Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| React component (screen) | PascalCase + `Screen` suffix | `SetupScreen.tsx` |
| React component (shared) | PascalCase | `Sidebar.tsx` |
| React component (dialog) | PascalCase + `Dialog` suffix | `SongEditDialog.tsx` |
| Hook | camelCase + `use` prefix | `useActiveCategory.ts` |
| Store (Zustand) | camelCase + `use` prefix + `Store` suffix | `useSyncStore.ts` |
| Class / singleton | PascalCase | `SyncEngine.ts` |
| Interface | PascalCase + `I` prefix (optional) | `CategoryDefinition.ts` |
| Domain model | PascalCase | `Song.ts` |
| Repository interface | `I` prefix + PascalCase + `Repository` | `ISongRepository.ts` |
| Repository implementation | PascalCase + `Repository` | `SongRepository.ts` |
| Migration file | Three-digit number + `_` + description + `.sql` | `001_core_infrastructure.sql` |
| Test file | Same name as source + `.test.ts` | `SyncEngine.test.ts` |
| Test file (component) | Same name as source + `.test.tsx` | `Sidebar.test.tsx` |

---

## 6. Platform-Specific File Handling

React Native's platform-specific file resolution is used where appropriate:

| Convention | When to Use |
|------------|-------------|
| `Component.native.ts` | Shared between Android and iOS (future) |
| `Component.android.ts` | Android-specific implementation |
| `Component.windows.ts` | Windows-specific implementation |

**Preference:** Use explicit platform directories (`platform/android/`, `platform/windows/`) with dependency injection rather than file extension resolution. The extension resolution is a fallback for trivial differences.
