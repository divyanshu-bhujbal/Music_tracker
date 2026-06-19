# E01 T04 — Scaffold packages/platform: Implementation Specification

## 1. Goal

Create the `@collectio/platform` package — the platform adapter layer that isolates all Electron-specific and Capacitor-specific code behind the interfaces defined in `@collectio/shared`. This package contains three internal subdirectories (`electron/`, `capacitor/`, `shared/`) for platform implementations and platform-agnostic services. It is the **only** place in the codebase where platform-specific APIs (`electron`, `@capacitor/core`, `better-sqlite3`, `capacitor-secure-storage-plugin`) are permitted per architecture boundary rules.

## 2. Scope

| In scope | Detail |
|----------|--------|
| `packages/platform/package.json` | Package manifest with 11 runtime deps, workspace devDep, pinned exact versions |
| `packages/platform/tsconfig.json` | Strict mode, no JSX, path alias to `@shared` only |
| `packages/platform/src/index.ts` | Root barrel export re-exporting subdirectories |
| `packages/platform/src/electron/index.ts` | Barrel for electron providers |
| `packages/platform/src/capacitor/index.ts` | Barrel for capacitor providers |
| `packages/platform/src/shared/index.ts` | Barrel for platform-agnostic services |
| Subdirectory scaffolding | `electron/`, `capacitor/`, `shared/` directories created |
| Workspace recognition | `@collectio/platform` resolves in monorepo |
| Dependency deduplication | Verify no conflict with existing capacitor app deps |

## 3. Out of Scope

| Out of scope | Handled by |
|-------------|-----------|
| Writing provider implementations (`ElectronAuthProvider.ts`, `CapacitorSqliteConnection.ts`, etc.) | E-03 (Sync Engine), E-04 (Auth & Encryption) |
| Writing `GoogleDriveProvider.ts` or `NetworkMonitor.ts` | E-04 |
| Writing `src/interfaces/` re-exports | E-03 — created when first provider implementation needs them |
| `MainActivity.java` plugin registration updates | T-01.6 (Capacitor app scaffold — already partially done in E-00b spike) |
| `capacitor.config.ts` modifications | Already done in E-00b spike |
| Vite configuration for the platform package | The platform package is consumed as source — no standalone Vite config needed |
| ESLint/Prettier configuration | T-01.7 |
| Jest configuration | T-01.10 |
| CI pipeline | T-01.9 |

## 4. Files to Create

| File | Content | Notes |
|------|---------|-------|
| `packages/platform/package.json` | Package manifest | 11 runtime deps, workspace devDep, pinned exact versions |
| `packages/platform/tsconfig.json` | TypeScript config | Strict mode, no JSX, path alias `@shared` only |
| `packages/platform/src/index.ts` | Root barrel | Re-exports subdirectory barrels |
| `packages/platform/src/electron/index.ts` | Electron barrel | `export {}` |
| `packages/platform/src/capacitor/index.ts` | Capacitor barrel | `export {}` |
| `packages/platform/src/shared/index.ts` | Shared barrel | `export {}` |

### `packages/platform/package.json` (Target)

```json
{
  "name": "@collectio/platform",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "echo 'lint not configured yet'",
    "test": "echo 'tests not configured yet'",
    "build": "tsc --noEmit"
  },
  "dependencies": {
    "@capacitor-community/sqlite": "6.0.2",
    "@capacitor/app": "6.0.3",
    "@capacitor/browser": "6.0.6",
    "@capacitor/core": "6.2.1",
    "argon2": "0.44.0",
    "argon2-wasm": "0.9.0",
    "better-sqlite3": "12.11.1",
    "capacitor-secure-storage-plugin": "0.10.0",
    "electron": "30.5.1",
    "electron-store": "11.0.2",
    "google-auth-library": "10.7.0"
  },
  "devDependencies": {
    "@collectio/shared": "workspace:*",
    "typescript": "5.9.3",
    "@types/better-sqlite3": "7.6.13"
  }
}
```

**Version decisions for each dependency:**

| Package | Version | Rationale |
|---------|---------|-----------|
| `@capacitor-community/sqlite` | `6.0.2` | Pinned per agent rules; FK enforcement validated in E-00b spike |
| `@capacitor/app` | `6.0.3` | Required for `appUrlOpen` OAuth redirect listener; NOT in epic spec but validated in spike |
| `@capacitor/browser` | `6.0.6` | OAuth browser flow; pinned per agent rules |
| `@capacitor/core` | `6.2.1` | Target Capacitor version; pinned per agent rules |
| `argon2` | `0.44.0` | Native Node.js Argon2id for Electron; latest stable |
| `argon2-wasm` | `0.9.0` | WASM Argon2id for Capacitor; pinned per agent rules; cross-platform determinism validated |
| `better-sqlite3` | `12.11.1` | Native Node.js SQLite for Electron; latest stable |
| `capacitor-secure-storage-plugin` | `0.10.0` | Android Keystore wrapper; pinned per agent rules; data survives app kill validated |
| `electron` | `30.5.1` | Architecture says "30+"; latest v30 (v31+ exists but v30 is the target architecture version) |
| `electron-store` | `11.0.2` | Secure config storage for Electron; latest stable |
| `google-auth-library` | `10.7.0` | Google OAuth + PKCE for Electron; latest stable |
| `@types/better-sqlite3` | `7.6.13` | TypeScript types; devDependency only |

**Why `@capacitor/app` is included (despite not being in the epic spec):**
The E-00b spike discovered that `@capacitor/app` is required for the `App.addListener('appUrlOpen')` OAuth redirect listener used by `CapacitorAuthProvider`. Without it, OAuth on Android cannot receive redirects. Agent rules Section 1 lists it as approved at version `6.0.3`.

**Why `capacitor-secure-storage-plugin` NOT `@capacitor/secure-storage`:**
The epic spec incorrectly references `@capacitor/secure-storage`. This package does not exist on npm (confirmed by E-00b spike RP-04, agent rules banned packages list). The validated replacement is `capacitor-secure-storage-plugin@0.10.0`.

### `packages/platform/tsconfig.json` (Target)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "noEmit": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "paths": {
      "@shared/*": ["../shared/src/*"],
      "@shared": ["../shared/src"]
    }
  },
  "include": ["src"]
}
```

**Key decisions:**
- **No `"jsx"`** — platform package contains no React code (React belongs in `renderer/` and `apps/`)
- **No DOM libs** — platform code targets Node.js (Electron) or Capacitor plugin bridge, not browser DOM
- **Only `@shared` path alias** — per `05_FOLDER_STRUCTURE.md` Section 4: "The platform package aliases only @shared". No aliases to `@renderer` or `@platform` (circular)
- All other options match `packages/shared/tsconfig.json` and `packages/renderer/tsconfig.json` for consistency
- `"noEmit": true` — consumed as source by apps, not pre-compiled

### Subdirectory Barrel Exports

Each subdirectory gets an empty barrel export file that will be populated by future tasks:

**`packages/platform/src/electron/index.ts`:**
```typescript
export {};
// Future: export { ElectronAuthProvider } from './ElectronAuthProvider';
// Future: export { NodeCryptoProvider } from './NodeCryptoProvider';
// Future: export { ElectronStorageProvider } from './ElectronStorageProvider';
// Future: export { BetterSqlite3Connection } from './BetterSqlite3Connection';
```

**`packages/platform/src/capacitor/index.ts`:**
```typescript
export {};
// Future: export { CapacitorAuthProvider } from './CapacitorAuthProvider';
// Future: export { WebCryptoProvider } from './WebCryptoProvider';
// Future: export { CapacitorStorageProvider } from './CapacitorStorageProvider';
// Future: export { CapacitorSqliteConnection } from './CapacitorSqliteConnection';
```

**`packages/platform/src/shared/index.ts`:**
```typescript
export {};
// Future: export { GoogleDriveProvider } from './GoogleDriveProvider';
// Future: export { NetworkMonitor } from './NetworkMonitor';
```

**`packages/platform/src/index.ts` (root barrel):**
```typescript
export {};
// Future: re-exports from electron/, capacitor/, shared/
```

All barrels use `export {}` to explicitly declare the file as an ES module (satisfies `tsc --noEmit` and `isolatedModules: true`).

## 5. Files to Modify

| File | Action | Reason |
|------|--------|--------|
| `pnpm-lock.yaml` | Auto-updated by `pnpm install` | 11 new packages added; `@capacitor/core` and `@capacitor-community/sqlite` deduplicated |

**Indirect effects (no manual edits — pnpm resolves automatically):**
- `apps/capacitor/` has `@capacitor/core@^6.2.1` and `@capacitor-community/sqlite@^6.0.2` — after install, pnpm deduplicates to the platform package's exact pins (`6.2.1` and `6.0.2`)
- `packages/renderer/tsconfig.json` already has `@platform` path aliases pointing to `../platform/src` — these now resolve to a real directory

## 6. Interfaces

No runtime interfaces are produced by this task. The package is a shell with no exported code. Future tasks implement these interfaces from `@collectio/shared`:

| Interface | Electron Implementation | Capacitor Implementation |
|-----------|------------------------|--------------------------|
| `AuthProvider` | `ElectronAuthProvider` | `CapacitorAuthProvider` |
| `CryptoProvider` | `NodeCryptoProvider` | `WebCryptoProvider` |
| `SecureStorageProvider` | `ElectronStorageProvider` | `CapacitorStorageProvider` |
| `DatabaseConnection` | `BetterSqlite3Connection` | `CapacitorSqliteConnection` |
| `CloudStorageProvider` | `GoogleDriveProvider` (shared/) | `GoogleDriveProvider` (shared/) |

The `src/interfaces/` directory (shown in `05_FOLDER_STRUCTURE.md` but not in epic T-01.4) is deferred to E-03.
It will contain re-exports of Domain layer interfaces from `@collectio/shared` for the dependency injection container.

## 7. State Changes

| Before | After |
|--------|-------|
| `packages/platform/` does not exist | `packages/platform/package.json`, `tsconfig.json`, `src/index.ts`, plus 3 subdirectory barrels exist |
| `@collectio/platform` not in workspace | `@collectio/platform` recognized by pnpm |
| `@capacitor/core` resolves as `^6.2.1` (from capacitor app) | `@capacitor/core` resolves as `6.2.1` exact (pinned by platform, deduplicated) |
| `@capacitor-community/sqlite` resolves as `^6.0.2` (from capacitor app) | `@capacitor-community/sqlite` resolves as `6.0.2` exact |
| No Electron, better-sqlite3, argon2, google-auth-library, electron-store installed | All installed at root `node_modules/` (hoisted) |
| No `@capacitor/browser`, `@capacitor/app`, `capacitor-secure-storage-plugin`, `argon2-wasm` installed | All installed at root `node_modules/` |
| `packages/renderer` `@platform` path alias points to non-existent directory | `@platform` path alias resolves correctly |

## 8. Database Changes

None. This is a platform adapter scaffold with no database interaction.

## 9. Error Handling

| Failure scenario | Behavior |
|-----------------|----------|
| `pnpm install` fails with `ERR_PNPM_FETCH_404 @capacitor/secure-storage` | Package name is wrong in `package.json`. Verify it reads `capacitor-secure-storage-plugin` (no `@capacitor/` scope prefix). |
| `pnpm install` fails because `better-sqlite3` native compilation fails | Requires Visual Studio Build Tools with "Desktop development with C++" workload (Windows). Error message will contain `node-gyp` rebuild failure. Install VS Build Tools and retry. |
| `pnpm install` fails because `argon2` native compilation fails | Same as better-sqlite3 — requires C++ toolchain. |
| `electron` download fails (network issue) | `electron` is ~180MB download. May fail on slow connections. Retry. If persistent, use `ELECTRON_MIRROR` env var. |
| `@capacitor/core` dedup conflict with capacitor app | If capacitor app's `^6.2.1` range resolves to a version different from platform's `6.2.1`, pnpm may install both. Hoisted layout should prevent this. If conflict: update capacitor app to exact `6.2.1`. |
| `tsc --noEmit` fails on subdirectory barrels | Empty `export {}` files should pass. If `tsc` reports "no inputs", verify `include: ["src"]` and that each barrel has `export {}`. |
| `@types/better-sqlite3` type errors | `skipLibCheck: true` should suppress. If type errors persist, check that the installed `better-sqlite3` version matches types major.minor. |

## 10. Logging Requirements

None. Task produces configuration files only.

## 11. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-1 | `tsc --noEmit` passes in `packages/platform/` with zero errors | Run `npx tsc --noEmit` in `packages/platform/` — exit 0 |
| AC-2 | Import from `@collectio/shared` resolves | Add `import {} from '@collectio/shared';` to a barrel — `tsc --noEmit` must pass |
| AC-3 | Each subdirectory barrel compiles individually | Verify `electron/index.ts`, `capacitor/index.ts`, `shared/index.ts` pass typecheck |
| AC-4 | Path alias `@shared/` resolves | `import {} from '@shared/index';` must resolve |
| AC-5 | `pnpm install` at root succeeds | Run `pnpm install` — exit 0 |
| AC-6 | `@capacitor/secure-storage` is NOT in `package.json` | Inspect dependencies — must read `capacitor-secure-storage-plugin` |
| AC-7 | `@capacitor/app` IS in `package.json` | Inspect dependencies — must contain `"@capacitor/app": "6.0.3"` |
| AC-8 | All dependencies pinned to exact versions (no `^` or `~`) | Inspect `package.json` — all version strings must be bare numbers |
| AC-9 | Package resolves as `@collectio/platform` in monorepo | Run `pnpm list --recursive --depth 0` — must show `@collectio/platform` |
| AC-10 | Existing `pnpm build:capacitor` still works | Run from root — capacitor app build must succeed (no regression) |
| AC-11 | Existing `pnpm typecheck` still passes | Run from root — all packages typecheck must succeed |
| AC-12 | No JSX in tsconfig | Inspect `tsconfig.json` — `compilerOptions` must NOT contain `"jsx"` |
| AC-13 | Only `@shared` path alias in tsconfig (no `@platform` or `@renderer`) | Inspect `tsconfig.json` `paths` — must only contain `@shared` and `@shared/*` |
| AC-14 | `@platform` alias in renderer's tsconfig now resolves | From `packages/renderer/`, `import {} from '@platform';` must resolve |

## 12. Test Cases

| # | Test | Steps | Expected |
|---|------|-------|----------|
| TC-1 | Package creation and install | 1. Create the 6 files<br>2. `pnpm install` | Exit 0; no peer dep errors |
| TC-2 | TypeScript compilation | `cd packages/platform && npx tsc --noEmit` | Exit 0 |
| TC-3 | Shared import resolves | Add `import {} from '@collectio/shared';` to `src/index.ts` then `npx tsc --noEmit` | Exit 0 |
| TC-4 | Path alias resolves | Add `import {} from '@shared/index';` to `src/index.ts` then `npx tsc --noEmit` | Exit 0 |
| TC-5 | No JSX allowed | Attempt `export const X = () => <div/>;` in a `.tsx` file — `npx tsc --noEmit` | Exit non-zero (tsconfig has no `"jsx"`) |
| TC-6 | No @platform alias (circular) | Attempt `import {} from '@platform';` in platform code — `npx tsc --noEmit` | Exit non-zero (alias not defined) |
| TC-7 | Electron import resolves (TypeScript) | Add `import { app } from 'electron';` — `npx tsc --noEmit` | Exit 0 |
| TC-8 | Capacitor import resolves (TypeScript) | Add `import { Capacitor } from '@capacitor/core';` — `npx tsc --noEmit` | Exit 0 |
| TC-9 | better-sqlite3 import resolves (TypeScript) | Add `import Database from 'better-sqlite3';` — `npx tsc --noEmit` | Exit 0 |
| TC-10 | Capacitor app not broken | `pnpm build:capacitor` from root | Exit 0 |
| TC-11 | All packages typecheck | `pnpm typecheck` from root | Exit 0 |
| TC-12 | @platform resolves from renderer | Add `import {} from '@platform';` to renderer `src/index.ts` then `cd packages/renderer && npx tsc --noEmit` | Exit 0 |
| TC-13 | Package name recognition | `pnpm list --recursive --depth 0` | Output includes `@collectio/platform@0.0.0` |
| TC-14 | `capacitor-secure-storage-plugin` (not `@capacitor/secure-storage`) | Inspect `package.json` dependencies | Must contain `"capacitor-secure-storage-plugin": "0.10.0"` |
| TC-15 | `@capacitor/app` included | Inspect `package.json` dependencies | Must contain `"@capacitor/app": "6.0.3"` |
| TC-16 | No version ranges | `grep -E '"\^|~' packages/platform/package.json` | No output |
| TC-17 | Clean temp test modifications | Revert any temporary import changes | After TC-3, TC-4, TC-7, TC-8, TC-9, remove test imports |

## Implementation Order

1. Create `packages/platform/` directory structure (`src/`, `src/electron/`, `src/capacitor/`, `src/shared/`)
2. Write `packages/platform/package.json` with 11 runtime deps + 2 devDeps
3. Write `packages/platform/tsconfig.json`
4. Write all 4 barrel files (`src/index.ts`, `src/electron/index.ts`, `src/capacitor/index.ts`, `src/shared/index.ts`)
5. Run `pnpm install` at root — verify exit 0 (expect ~180MB electron download)
6. Run `npx tsc --noEmit` in `packages/platform/` — verify exit 0
7. Verify `@shared` path alias and `@collectio/shared` import resolve (TC-3, TC-4)
8. Verify Electron and Capacitor type imports resolve (TC-7, TC-8, TC-9)
9. Verify `@platform` resolves from renderer (TC-12)
10. Run `pnpm build:capacitor` to verify no regression (TC-10)
11. Run `pnpm typecheck` to verify no regression (TC-11)
12. Clean up any temporary test imports
13. Run `pnpm list --recursive --depth 0` to verify workspace recognition

## Architecture Decisions

### AD-T04-01: Electron v30.5.1 (Latest v30)

**Decision:** Pin `electron@30.5.1` — the latest v30 release — rather than latest v31+.

**Reason:** The architecture specification (`01_ARCHITECTURE.md`) targets "Electron 30+". v30 is the architecture-designated version. Using the latest v30 patch ensures maximum stability within the target version while still being up-to-date with security patches. v31+ can be evaluated in a future upgrade spike.

### AD-T04-02: `@capacitor/app` Included Despite Not Being in Epic Spec

**Decision:** Add `@capacitor/app@6.0.3` as an explicit dependency.

**Reason:** The E-00b spike discovered that `App.addListener('appUrlOpen')` from `@capacitor/app` is required for receiving OAuth redirects on Android. The `CapacitorAuthProvider` (future E-04 task) depends on it. The agent rules (`07_AGENT_RULES.md` Section 1) list it as an approved package at `6.0.3`. The epic spec omission is a pre-spike oversight.

### AD-T04-03: `capacitor-secure-storage-plugin` Replaces `@capacitor/secure-storage`

**Decision:** Use `capacitor-secure-storage-plugin@0.10.0` instead of the non-existent `@capacitor/secure-storage`.

**Reason:** `@capacitor/secure-storage` does not exist on the npm registry (confirmed by E-00b spike RP-04, bounce check #11, agent rules Section 2 banned packages). The validated replacement is `capacitor-secure-storage-plugin@0.10.0`, which wraps Android Keystore and passed the critical KC-09 test (data survives app kill).

### AD-T04-04: No `interfaces/` Subdirectory Yet

**Decision:** Do NOT create `packages/platform/src/interfaces/` (shown in `05_FOLDER_STRUCTURE.md` but not in epic T-01.4).

**Reason:** The `interfaces/` directory is for "Re-exports from shared (for DI)" — it provides a clean dependency injection boundary. It is only needed when the first provider implementation is written (E-03). Creating it now with an empty barrel adds no value and creates a directory with no purpose. It will be created in E-03 when `ElectronAuthProvider.ts` or `CapacitorSqliteConnection.ts` are scaffolded.

### AD-T04-05: All Runtime Dependencies Are Unconditional

**Decision:** All 11 runtime dependencies are listed under a single `dependencies` field regardless of target platform. No conditional installation, no optional dependencies.

**Reason:** npm/pnpm do not support per-subdirectory dependencies. Listing all platform deps unconditionally is standard for cross-platform monorepos. On disk, all packages are installed — code branches ensure only the correct platform's implementations are imported at runtime. The `electron` binary (~180MB) will be present on disk even when building for Capacitor, but is never loaded by the Capacitor WebView or Android runtime. This has no impact on APK size (Capacitor only bundles the web assets, not node_modules).

## Traceability

| Source Document | Section | Requirement |
|----------------|---------|-------------|
| `E-01_PROJECT_INFRASTRUCTURE.md` | T-01.4 | 3 subdirectories, barrel exports, paths to shared |
| `05_FOLDER_STRUCTURE.md` | Section 1 | `packages/platform/` directory layout with electron/, capacitor/, shared/, interfaces/ |
| `05_FOLDER_STRUCTURE.md` | Section 2 | Package-to-layer mapping: platform allowed/forbidden imports |
| `05_FOLDER_STRUCTURE.md` | Section 4 | Import aliases: platform aliases only @shared |
| `01_ARCHITECTURE.md` | Section 1 | Electron 30+ target, platform implementation layer |
| `01_ARCHITECTURE.md` | Section 3 | Boundary rules: platform code isolated behind interfaces |
| `01_ARCHITECTURE.md` | Section 4 | Interface contracts: AuthProvider, CryptoProvider, etc. |
| `06_IMPLEMENTATION_DECISIONS.md` | AD-01 | DatabaseConnection interface is async |
| `06_IMPLEMENTATION_DECISIONS.md` | AD-03 | Separate OAuth client IDs per platform |
| `06_IMPLEMENTATION_DECISIONS.md` | AD-05 | PRAGMA handling differs by platform |
| `06_IMPLEMENTATION_DECISIONS.md` | PK-01–PK-04 | Package decisions for Capacitor community plugins |
| `07_AGENT_RULES.md` | Section 1 | Approved package versions (exact pins) |
| `07_AGENT_RULES.md` | Section 2 | Banned packages: `@capacitor/secure-storage` |
| `07_AGENT_RULES.md` | Section 13 | Architectural constraints: platform code isolated |
| `08_SPIKE_RETROSPECTIVE.md` | Issue #1 | Capacitor SQLite defaults encryption → `androidIsEncryption: false` |
| `08_SPIKE_RETROSPECTIVE.md` | Issue #2 | Android execSQL() rejects PRAGMAs → use query() |
| `08_SPIKE_RETROSPECTIVE.md` | Issue #5 | Google Cloud Console rejects custom URI schemes |
| `08_SPIKE_RETROSPECTIVE.md` | Issue #10 | Community plugins need manual registration |
| `08_SPIKE_RETROSPECTIVE.md` | Issue #11 | `@capacitor/secure-storage` does not exist |
| `08_SPIKE_RETROSPECTIVE.md` | Lesson #1 | Test platform-specific behavior first |
