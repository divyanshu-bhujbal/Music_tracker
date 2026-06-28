# Implementation Decisions — E-00b & E-01

> **Source of Truth:** This document records every technical decision, package selection, rejected approach, platform limitation, known issue, and required configuration discovered during the E-00b Capacitor validation spike and E-01 Project Infrastructure scaffolding.
>
> **Audience:** Future coding agents, the solo developer, and anyone maintaining this codebase.
>
> **Rule:** Before making any change to `apps/capacitor/`, `apps/electron/`, or adding a new Capacitor/Electron plugin, consult this document. If you encounter a decision recorded here, do not revisit it without new evidence.

---

## 1. Architectural Decisions

### AD-01: `DatabaseConnection` Interface Is Async

**Decision:** All methods on `DatabaseConnection` — `open()`, `close()`, `execute()`, `query()`, `transaction()` — return `Promise<T>`.

**Reason:** The Capacitor plugin bridge communicates between the WebView JavaScript engine and native Android code via message passing, which is inherently asynchronous. Unlike Electron's `better-sqlite3` (synchronous), every call to `@capacitor-community/sqlite` returns a Promise.

**Evidence:** Spike0b1_SQLite.ts — `CapacitorSqliteConnection` implements `DatabaseConnection` with all async methods. SQ-01 through SQ-12 pass using async operations.

**Consequences:**

- All repository methods become async (`async findById()` instead of `findById()`)
- All callers in the application layer must `await` repository calls
- Electron's `better-sqlite3` must be wrapped in `Promise.resolve()`
- This is a deliberate architectural constraint, not a workaround

**Future Considerations:** The async interface is defined in the architecture (E-02 T-02.3). The production `CapacitorSqliteConnection` (E-02 T-02.5) must match this interface.

---

### AD-02: Virtualization Is Mandatory, Not Optional

**Decision:** The production `TableView` component (E-15 T-15.7) must use `@tanstack/react-virtual`. Virtualization is not an optimization — it is a hard requirement.

**Reason:** T-00b.6 demonstrated that unvirtualized 10,000-row tables create 80,069 DOM nodes consuming ~156 MB of memory. Scroll performance degrades from "smooth" to "unusable" as memory pressure builds. T-00b.7 demonstrated virtualization reduces this to ~28 DOM rows consuming ~0.5 MB with 0.1ms constant render time.

**Evidence:**

- T-00b.6 (unvirtualized): 134-second render, 80,069 DOM nodes, ~156 MB memory, scroll degrades
- T-00b.7 (virtualized): 0.1ms render, 28 DOM rows, ~0.5 MB memory, scroll always smooth

**Consequences:**

- `@tanstack/react-virtual` must be a production dependency
- The `react-window` fallback is only relevant if TanStack fails to install
- Row heights must be estimated at 48px with `measureElement` for dynamic height support
- Overscan of 5 rows provides smooth scroll without excessive DOM overhead

**Future Considerations:** `react-window` is noted as a fallback but has low maintenance activity since 2023 and only supports fixed row heights.

---

### AD-03: Separate OAuth Client IDs Per Platform

**Decision:** The application uses different OAuth 2.0 client IDs for Android (Capacitor) and Windows (Electron). The original architecture's assumption of a single shared custom URI scheme (`collectio://oauth`) was invalid.

**Reason:** Google Cloud Console does not support custom URI schemes as redirect URIs for any client type. Each platform needs its own client type:

- **Android:** "Android" client type with package name + SHA-1 fingerprint
- **Electron:** "Desktop app" client type (uses `http://localhost` loopback redirect)

**Evidence:** Multiple failed attempts to use `collectio://oauth` with "Web application" and "Desktop app" client types in Google Cloud Console. Error: "Invalid Redirect: must end with a public top-level domain."

**Consequences:**

- The production `AuthProvider` must detect the platform and use the appropriate client ID
- Android uses `com.collectio.app://` as the redirect scheme
- Electron uses `http://localhost` with a loopback redirect
- Configuration is managed through the DI container (E-04 T-04.8), not hardcoded in a single config file

**Future Considerations:** The OAuth PKCE flow was not fully verified end-to-end during the spike. Complete OAuth with "Android" client type as a high-priority follow-up.

**Update (E04-T01):** The custom protocol approach (`collectio://` + `app.on('open-url')`) was attempted for Electron in E04-T01 and confirmed invalid for Windows — `open-url` is macOS-only (see PL-10). The "Desktop app" client type with `http://localhost` loopback redirect is NOT optional for Electron — it is the only viable approach. See AD-17 for the full decision record.

---

### AD-04: pnpm `node-linker=hoisted` Required for Capacitor

**Decision:** The project uses `node-linker=hoisted` in `.npmrc`. Standard pnpm symlink layout is incompatible with Capacitor's build tooling.

**Reason:** Capacitor's `cap sync` and Gradle build system resolve plugin Android source paths through `node_modules/`. pnpm's default symlink-based virtual store prevents Gradle from finding these paths. The `capacitor.settings.gradle` file contains relative paths like `../../../node_modules/@capacitor-community/sqlite/android` that must resolve to real directories.

**Evidence:** Without `node-linker=hoisted`, `capacitor-community-sqlite` Gradle module was not created, causing "package com.getcapacitor.community.sqlite does not exist" compilation errors.

**Consequences:**

- `.npmrc` at the repository root must contain `node-linker=hoisted`
- New developers must install with this setting
- All `node_modules` are at the repository root in a flat layout

**Future Considerations:** This is documented in the build system. Monitor Capacitor for improved pnpm support.

---

### AD-05: PRAGMA Handling Differs by Platform

**Decision:** On Capacitor Android, ALL PRAGMA statements must use `query()` (which routes through Android's `SQLiteDatabase.rawQuery()`). On Electron, PRAGMAs can use `execute()` (which routes through `better-sqlite3.exec()`).

**Reason:** Android's `SQLiteDatabase.execSQL()` rejects any statement that returns a result set. Every PRAGMA statement (`foreign_keys`, `journal_mode`, `synchronous`, `busy_timeout`, `integrity_check`) returns a result row on Android's SQLite implementation. This differs from Electron's `better-sqlite3` which accepts PRAGMAs via `exec()`.

**Evidence:** Error: "Queries cannot be performed using execSQL(), use query() instead" on all PRAGMA statements. SQ-01 through SQ-12 only passed after routing all PRAGMAs through `query()`.

**Consequences:**

- The production `CapacitorSqliteConnection.open()` must use `query()` for PRAGMA setup
- The production `BetterSqlite3Connection.open()` can use `exec()` for PRAGMA setup
- This difference is abstracted behind the `DatabaseConnection` interface

**Future Considerations:** If Capacitor SQLite plugin adds native PRAGMA handling, this decision can be revisited.

---

### AD-07: `@types/react-dom` and `@types/react` Have Independent Version Tracks

**Decision:** Never assume `@types/react-dom` and `@types/react` share the same patch version. Always verify the npm registry for the actual latest version of each types package independently.

**Reason:** The `@types/react-dom` 18.3.x line has only 8 releases (up to `18.3.7`), while `@types/react` 18.3.x has 32 releases (up to `18.3.31`). The types packages are independently maintained by DefinitelyTyped contributors and do not track React's patch releases in lockstep. The implementation spec for E01-T03 incorrectly assumed `@types/react-dom@18.3.30` existed — it does not.

**Evidence:** `npm view @types/react-dom versions` shows last 18.3.x as `18.3.7`. `npm view @types/react versions` shows last 18.3.x as `18.3.31`.

**Consequences:**

- Any spec that pins `@types/*` versions must be verified against the npm registry before implementation
- Future React 19 upgrade tasks must independently verify both `@types/react` and `@types/react-dom` latest versions
- The version compatibility matrix must list types packages separately from their runtime counterparts

---

### AD-06: Single Shared `SQLiteConnection` Instance Across Tests

**Decision:** In the spike and in production, a single `SQLiteConnection` instance is created and reused. Multiple connections to the same database use `retrieveConnection()` instead of `createConnection()`.

**Reason:** `SQLiteConnection` maintains an internal connection dictionary keyed by database name. Multiple `SQLiteConnection` instances competing for the same dictionary cause "Connection spike_test already exists" errors. The plugin's `_connectionDict` is not scoped per-instance.

**Evidence:** Early spike iterations created a new `new SQLiteConnection(CapacitorSQLite)` per test, causing all tests after SQ-01 to fail with "Connection spike_test already exists."

**Consequences:**

- In production, create one `SQLiteConnection` at app startup
- Use `isConnection()` to check for existing connections before creating new ones
- Use `retrieveConnection()` to get an existing `SQLiteDBConnection` handle
- Use `closeAllConnections()` on app shutdown

**Future Considerations:** React Strict Mode in development causes double-mounting. The `isConnection()/retrieveConnection()` pattern handles this correctly.

---

### AD-08: ESM `__dirname` Is Not Available — Never Use `import.meta.dirname` or Bare `__dirname` in Electron Main

**Decision:** Every file that executes in the Electron main process (including `main.ts`, platform package `electron/` files, and any future main-process workers) must explicitly compute `__dirname` from `import.meta.url` using `fileURLToPath` and `dirname`. Never use `import.meta.dirname` or bare `__dirname` — Electron 30.5.1 bundles Node 20.16.0, which lacks both.

**Reason:** All workspace packages use `"type": "module"` for consistency (ESM imports/exports, `import.meta`). In ES modules, CommonJS globals `__dirname` and `__filename` are not defined. `import.meta.dirname` was added in Node.js 21.2 and backported to Node 20.18+ — but Electron 30.5.1 bundles Node 20.16.0 (confirmed via `npm view electron@30.5.1 --json`, field `_nodeVersion`), which predates the backport. The only safe pattern for Electron 30.5.1 is `fileURLToPath(import.meta.url)` + `dirname()`. Attempting to use bare `__dirname` causes a TypeScript error; attempting to use `import.meta.dirname` causes a runtime `ReferenceError` in Electron.

**Evidence:**
- E01-T05 — The implementation spec included bare `__dirname` in `main.ts` (an error). Corrected via `fileURLToPath` + `dirname`. `tsc --noEmit` rejects bare `__dirname`.
- E02-T01 — The verify script in `packages/platform/src/electron/__verify__/` used `import.meta.dirname`, deviating from the codebase standard. Code review identified that `import.meta.dirname` is not guaranteed available in Electron 30's Node.js. Fixed to use the standard `fileURLToPath` + `dirname()` pattern.

**Pattern (must be used in every file that runs in Electron's main process):**

```typescript
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

**Consequences:**

- Every Electron main-process file must include this boilerplate at the top before any path resolution — regardless of whether it's `main.ts`, a platform package `electron/` file, or a worker
- `preload.ts` does not need `__dirname` (its path is resolved by `main.ts`)
- `import.meta.dirname` is **banned** in this codebase — it causes `ReferenceError` in Electron 30.5.1 (Node 20.16.0)
- The `node:` protocol prefix is mandatory (see AD-T05-08 in the E01-T05 spec)
- Path resolution that navigates to `node_modules/` must account for pnpm's hoisted layout — the number of `..` segments depends on the file's depth in the directory tree

---

### AD-17: Electron OAuth Redirect Must Use Loopback HTTP Server — Custom Protocols Are Invalid on Windows

**Decision:** All Electron OAuth implementations on Windows must receive the OAuth redirect via a temporary local HTTP server on `http://localhost:<random_port>`. Custom protocol deep-linking (`collectio://`) + `app.on('open-url')` is architecturally invalid for Windows.

**Reason:** `app.on('open-url')` is a macOS-only event (see PL-10). The custom protocol approach proposed in the E04-T01 task specification assumed cross-platform parity for `open-url` — this assumption is false. The loopback HTTP server approach works identically on Windows, macOS, and Linux, and aligns with Google's documented "Desktop app" OAuth flow. AD-03 already anticipated this by specifying "Desktop app" client type with `http://localhost` loopback redirect as the Electron approach, but the E04-T01 task spec chose the custom protocol approach without accounting for the `open-url` platform limitation.

**Evidence:** E04-T01 code review identified that the `waitForAuthCode()` method using `app.on('open-url', handler)` would always time out on Windows. The fix (E04-T01_REVIEW_FIXES.md CR-1) replaces the protocol handler with a loopback server that:
1. Finds a free port via `createServer().listen(0, '127.0.0.1')`
2. Constructs the OAuth URL with `redirect_uri=http://localhost:<port>`
3. Starts an HTTP server to receive the GET callback
4. Extracts the `code` query parameter from the callback URL

**Consequences:**

- Every Electron OAuth implementation must start a temporary `node:http` server on `http://localhost` with a dynamically discovered free port
- The redirect URI for Electron OAuth must be `http://localhost:<port>` (NOT a custom scheme like `collectio://`)
- `app.setAsDefaultProtocolClient('collectio')` must NOT be used for OAuth redirect handling — it serves no purpose in the loopback model
- The Google Cloud Console OAuth client type for Electron must be "Desktop app" (which permits `http://localhost` without port restriction)
- The same loopback pattern applies to refreshing tokens or any future OAuth provider on Electron
- The `findAvailablePort()` helper must use `127.0.0.1` (not `0.0.0.0`) to prevent firewall warnings

**Future Considerations:** If `open-url` is extended to Windows in a future Electron version, the loopback approach remains valid and could coexist. Custom protocols could be re-evaluated as a secondary mechanism, but the loopback approach should remain the primary implementation since it requires no OS-level protocol registration and works identically across all supported desktop platforms.

---

### AD-18: `packages/shared` Accepts Type-Only Circular Workspace Dependency on `@collectio/platform`

**Decision:** The `packages/shared` workspace package may import types from `@collectio/platform` when a `shared/` interface (such as `ServiceProvider`) needs to reference a class type from a shared platform service (such as `TokenRefresher`). This creates a circular workspace dependency (`shared` → `platform` and `platform` → `shared`). The dependency must be listed as a `devDependency` in `packages/shared/package.json` and the import must be type-only — never a runtime import.

**Reason:** The `ServiceProvider` interface (E-04 T-08) defines the DI contract between platform implementations and the renderer. One of its fields, `tokenRefresher`, references the `TokenRefresher` class — a shared platform service that works identically on both Electron and Capacitor with zero platform dependencies. The alternatives are:
1. Define a separate `ITokenRefresher` interface in `shared/domain/interfaces/` — duplicates the public API and creates a maintenance burden to keep it in sync with the implementation
2. Use `any` for the `tokenRefresher` field — loses all type safety for consumers
3. Import the class type directly — narrow exception to the layer boundary rule

Option 3 was chosen. It works because: the import is type-only (`import type`), it's listed as a `devDependency` (not a runtime dependency), and pnpm's hoisted `node_modules` layout resolves the circular reference without issues.

**Evidence:** E-04 T-08 implementation added `@collectio/platform` as a `devDependency` of `packages/shared`. `ServiceProvider.ts` imports `TokenRefresher` via `import type { TokenRefresher } from '@collectio/platform/shared'`. The workspace graph is `platform → shared` (for interfaces) and `shared → platform` (for `TokenRefresher` type). `pnpm typecheck` passes with zero errors across all 5 packages.

**Consequences:**

- Any `shared/` interface that needs to reference a class type from `@collectio/platform/shared` may follow this pattern
- The import must be `import type` only — never a runtime import (would break at runtime and violate the layer boundary)
- The dependency must be listed as `devDependency` in `packages/shared/package.json` — never as a `dependency`
- This pattern is limited to the `packages/platform/src/shared/` barrel — shared platform services that have zero platform dependencies and work identically on Electron and Capacitor
- This pattern does NOT permit `shared/` to import from `packages/platform/src/electron/` or `packages/platform/src/capacitor/` — only from the `shared/` barrel
- If more than 2-3 shared services use this pattern, revisit the decision and extract interfaces to `shared/domain/interfaces/` to eliminate the circular dependency entirely

**Future Considerations:** When `TokenRefresher` is the only consumer, the direct import is acceptable. If a third shared platform service needs this pattern, define `ITokenRefresher` in `shared/domain/interfaces/` and refactor both `ServiceProvider` and `TokenRefresher` to use the interface. The E04-T08 spec Appendix E documents this tradeoff in detail.

---

### AD-19: Google Drive `alt=media` Download Returns Raw Bytes Only — No `modifiedTime` in Response

**Decision:** The Google Drive API V3 `GET /drive/v3/files/{fileId}?alt=media` endpoint returns ONLY raw file bytes in the response body. It does NOT include `modifiedTime` in response headers (`Last-Modified` and `X-Goog-Meta-Modified-Time` are either absent or carry different semantics). To obtain the actual `modifiedTime` for LWW sync conflict resolution, the caller must make a separate `GET /drive/v3/files/{fileId}?fields=modifiedTime` metadata request after the download completes.

**Reason:** The Drive API's media download endpoint is a streaming binary endpoint — it does not return JSON metadata or custom headers beyond `X-Goog-File-Id`. The E09 implementation initially attempted to read `modifiedTime` from `X-Goog-Meta-Modified-Time` (a custom user-metadata header that Drive does not set on appdata files) with a fallback to `new Date().toISOString()`. The fallback to current wall-clock time would write incorrect timestamps to `app_metadata.cloud_modified_time`, causing the LWW sync engine to falsely conclude the local file is "older than cloud" on every download — potentially triggering unnecessary re-uploads or sync loops.

**Evidence:** E09 review finding C2. The `GoogleDriveProvider.download()` method was refactored to make two requests: (1) `GET .../files/{fileId}?alt=media` for raw bytes, and (2) `GET .../files/{fileId}?fields=modifiedTime` for the authoritative `modifiedTime`. Both requests share the same OAuth token and exponential backoff retry logic. The second request is mandatory — without it, the `cloud_modified_time` stored in `app_metadata` is always wrong after download.

**Consequences:**

- Every `download()` operation makes TWO HTTP requests to Drive: one for content, one for metadata
- Both requests share the same access token and retry logic (including 401 force-refresh, 429 backoff, 5xx backoff)
- The metadata request must succeed for the download to be considered complete — if it fails, the download throws `CloudStorageError`
- This is a Drive API behavior, not an implementation defect. Alternative cloud providers (Dropbox, OneDrive) may have download endpoints that include modification time in headers or response body
- Any future `CloudStorageProvider` implementation must verify whether its provider's download endpoint includes modification time and implement a separate metadata fetch if not

**Future Considerations:** If Google adds `modifiedTime` to the `alt=media` response headers or adds a query parameter to include it, the separate metadata request can be removed and both requests collapsed into one. Check the Drive API changelog before any V2 cloud storage work. Also consider caching the metadata-tracker's stored `cloud_modified_time` for read-only sync checks (E-10) to avoid the extra request in cases where the sync engine only needs to compare timestamps.

---

### AD-20: Retry Logic Must Use Separate Counters per HTTP Status Family — Never Share a Single `retryCount`

**Decision:** When a `fetchWithRetry` method handles multiple HTTP status families (401 authentication failure, 429 rate limiting, 5xx server errors), use a separate boolean flag for the authentication family and a shared counter for the backoff families. Never increment the shared `retryCount` in the 401 handler — the 401 retry is a forced token refresh (no backoff, single retry), while 429 and 5xx retries use independent exponential backoff with their own retry budgets (5 retries and 3 retries respectively).

**Reason:** With a single shared `retryCount`:
1. A 401 response triggers token refresh → retry with `retryCount + 1` (now 1)
2. The retried request receives a 429 (rate limit) from Drive
3. The 429 handler sees `retryCount = 1`, meaning it starts its backoff at step 2 instead of step 1 (2000ms instead of 1000ms) and has only 4 remaining retries instead of the specified 5 — violating the spec's "5 retries at 1s/2s/4s/8s/16s" guarantee

For correctness, the 401 retry must NOT consume one of the 429/5xx retry slots, and the backoff counters must remain independent.

**Evidence:** E09 review finding m1. The fix uses a boolean `triedRefresh` parameter for the 401 path that is completely independent of the `retryCount` used by the 429 and 5xx handlers. The 401 path toggles `triedRefresh` from `false` → `true`; the 429/5xx paths use `retryCount` without interference.

**Consequences:**

- Any `fetchWithRetry` utility that handles multiple HTTP status families must follow this pattern
- Authentication retries (401): use a boolean flag with a single retry, zero backoff, no consumption of backoff budget
- Rate limiting retries (429): use `retryCount` with independent max (5) and exponential backoff with jitter
- Server error retries (5xx): use `retryCount` with independent max (3) and exponential backoff
- These counters/flags must remain independent — never cross-increment, never share state

**Pattern:**
```typescript
private async fetchWithRetry(
  url: string, init: RequestInit,
  operation: string,
  retryCount = 0,
  triedRefresh = false,  // independent of retryCount
): Promise<Response> {
  if (response.status === 401 && !triedRefresh) {
    await this.tokenRefresher.forceRefreshAccessToken();
    return this.fetchWithRetry(url, init, operation, retryCount, true);
    // retryCount unchanged — 429/5xx paths start fresh
  }
  // ... 429 and 5xx handlers use retryCount only ...
}
```

**Future Considerations:** If additional error families are added (e.g., 503-specific handling with distinct backoff), add a new dedicated flag/counter — do NOT overload existing ones. All status-family-specific retry state must be independently tracked.

---

### AD-09: Electron App tsconfig Must Exclude Renderer Source Files

**Decision:** The `apps/electron/tsconfig.json` `include` array must list only `src/main.ts` and `src/preload.ts`. It must NOT include `src/renderer.ts` or use a glob pattern like `["src"]` that would catch it. The renderer source file contains JSX and DOM APIs that the main/preload tsconfig cannot compile.

**Reason:** The Electron app tsconfig targets a Node.js environment (`"lib": ["ES2022"]`, no `"jsx"`, no DOM types). The `renderer.ts` file contains React JSX (`<StrictMode>`, `<div>`) and DOM APIs (`document.getElementById()`), which require `"lib": ["DOM"]` and `"jsx": "react-jsx"`. Including it in `include` forces a choice between two undesirable outcomes:

1. Add DOM libs and JSX to the tsconfig → main/preload lose Node.js-only type safety (M-1 finding)
2. Keep Node.js-only config → `renderer.ts` fails to compile (JSX parse errors, `document` not found)

The correct resolution is to exclude `renderer.ts` from the app tsconfig entirely. Its type checking is handled by Vite's `@vitejs/plugin-react` at build time.

**Evidence:** The E01-T05 spec contained an internal contradiction: `include: ["src"]` would pick up `renderer.ts`, but `lib: ["ES2022"]` and no `jsx` would reject it. The code review (M-1 finding) identified this. The fix narrowed `include` to `["src/main.ts", "src/preload.ts"]`, resolving the contradiction.

**Consequences:**

- `apps/electron/tsconfig.json` `include` must explicitly list main/preload source files
- Any new Electron background file (e.g., `src/worker.ts`) must be added to `include`
- Renderer source files are type-checked by Vite build, not by `tsc --noEmit`
- This pattern applies to all app packages (`apps/*`) where the tsconfig covers a different environment than some source files

---

### AD-10: `composite: true` and `declaration: false` Are Mutually Exclusive in TypeScript 5.x

**Decision:** App packages (`apps/*`) must omit both `composite: true` and `references` from their tsconfig. App packages are leaf consumers — no other package imports from them — so they do not need project references or composite mode.

**Reason:** TypeScript 5.x reports error "Composite projects may not disable declaration emit" when both `composite: true` and `declaration: false` are set. App packages don't emit declarations (they are consumers, not libraries), but they also shouldn't participate in the composite project graph since they sit at the top of the dependency chain. Removing both settings is the correct resolution — it eliminates the error without losing any functionality.

**Evidence:** AD-T05-07 in the E01-T05 implementation spec pre-authorized this deviation. During implementation, `composite: true` and `references` were omitted and `tsc --noEmit` passed with zero errors across all 6 workspace packages.

**Consequences:**

- `apps/electron/tsconfig.json` and `apps/capacitor/tsconfig.json` must NOT have `composite: true` or `references`
- `packages/*` (shared, renderer, platform) retain `composite: true` because they are libraries consumed by other packages
- If a future package needs to import from an app package (unlikely, violates architecture), `composite` would need to be re-enabled and `declaration` set to `true`

---

### AD-12: `.tsx` Extension Required for All Files Containing JSX

**Decision:** Use `.tsx` for all TypeScript files containing JSX. Do not use `.ts` for files with JSX even though `tsc` with `"jsx": "react-jsx"` allows it.

**Reason:** `typescript-eslint` v8 determines JSX parsing mode from file extension, not from `parserOptions.jsx`. `.ts` files are parsed as pure TypeScript and reject JSX syntax. This contradicts the T01-T07 spec's claim that ESLint handles JSX in `.ts` *"natively through the TypeScript parser."*

**Evidence:** `pnpm lint` failed with "Unterminated regular expression literal" on `renderer.ts` containing `<div>` JSX. `--print-config` confirmed `parserOptions.jsx: true` was set but had no effect. Renaming to `renderer.tsx` resolved it.

**Consequences:**

- Per-package lint scripts must include `.tsx` in their globs (`src/**/*.{ts,tsx}`), not just `.ts`
- Any future component file with JSX must use `.tsx`
- The electron app's `renderer.ts` was renamed to `renderer.tsx` as part of this decision

---

### AD-13: `projectService: true` Is Incompatible with Selective tsconfig `include`

**Decision:** Do not use `projectService: true` in the shared ESLint flat config. This option requires every linted file to be covered by a tsconfig's `include` array.

**Reason:** The electron app's tsconfig intentionally excludes `renderer.tsx` from `include` to maintain `lib: ["ES2022"]` (preventing DOM type access in main/preload). With `projectService: true`, ESLint fails on any file not in a tsconfig. Type-aware linting rules (`no-unsafe-*`) are not critical at scaffolding stage.

**Evidence:** With `projectService: true`, ESLint failed: *"renderer.ts was not found by the project service."* Removing it and relying on `parserOptions.jsx: true` (plus correct file extensions) resolved all lint errors.

**Consequences:**

- If type-aware ESLint rules are needed in the future, create a `tsconfig.eslint.json` covering all source files before enabling `projectService`
- The current config provides syntax and structural linting (no-explicit-any, no-unused-vars, prefer-const) without type inference

---

### AD-14: Windows PowerShell — Single Quotes in npm Scripts Are Literal

**Decision:** npm script glob patterns must be unquoted (e.g., `eslint src/**/*.ts`, not `eslint 'src/**/*.ts'`). The tool (ESLint, Prettier) handles glob expansion internally via `node-glob`, not via shell expansion.

**Reason:** Windows PowerShell passes single-quoted strings literally to the command. A pattern like `'src/**/*.ts'` is interpreted as a literal filename containing quotes, not a glob.

**Evidence:** `pnpm lint` failed on electron with *"No files matching the pattern `'src/**/*.ts'`"* when single quotes were used. Unquoted patterns in all other packages worked.

**Consequences:**

- All future npm scripts must use unquoted globs
- This affects `lint`, `test`, and any script using file patterns
- Cross-platform compatibility requires the tool, not the shell, to expand globs

---

### AD-11: Capacitor Native Plugins Must Be Direct Dependencies of `apps/capacitor/`

**Decision:** Every Capacitor plugin that contains native Android code (an `android/` subdirectory) must be a direct dependency of `apps/capacitor/package.json`. Native plugins declared only in workspace packages like `packages/platform/` are NOT detected by `cap sync` and their native code is NOT compiled into the APK.

**Reason:** `cap sync` generates `capacitor.settings.gradle` by scanning the capacitor app's declared dependencies for Capacitor plugins with native Android source. Plugins that are only declared in workspace packages (`packages/platform/`) are invisible to this scan despite being available in the hoisted `node_modules/` at the repository root. The generated Gradle include is what compiles the native Java code into the APK — without it, `registerPlugin()` in `MainActivity.java` fails at runtime with a `ClassNotFoundException`.

**Evidence:** After `cap sync`, `capacitor.settings.gradle` included `capacitor-community-sqlite` (a direct dep of `apps/capacitor/`) but did NOT include `capacitor-secure-storage-plugin` (only declared in `packages/platform/`). Both plugins have native `android/` directories at root `node_modules/` (thanks to hoisted layout), but only the directly-declared plugin was detected. The E01 T06 implementation spec incorrectly recommended removing `@capacitor-community/sqlite` from the capacitor app's deps — the implementation correctly retained it, but `capacitor-secure-storage-plugin` was also missed.

**Consequences:**

- Every community Capacitor plugin must appear in BOTH `packages/platform/package.json` (for TypeScript types and JavaScript bridge code) AND `apps/capacitor/package.json` (for `cap sync` native detection)
- Core Capacitor plugins (`@capacitor/core`, `@capacitor/android`, `@capacitor/cli`) are auto-detected and do not follow this rule
- After any change to `apps/capacitor/package.json` dependencies, run `cap sync` and verify `capacitor.settings.gradle` includes all expected plugins
- The `capacitor.settings.gradle` include list and `MainActivity.java` `registerPlugin()` list must match — every registered plugin must have a corresponding Gradle include

---

### AD-16: Electron Runtime Node Version Is 20.16.0 — Not System Node.js

**Decision:** Code in `apps/electron/src/` and `packages/platform/src/electron/` executes in Electron's bundled Node 20.16.0, NOT the developer's system Node.js. All Node API usage in these files must target 20.16.0. Verify the exact bundled version via `npm view electron@30.5.1 --json` (field `_nodeVersion`) before using any Node API.

**Reason:** The developer's system Node version is used for CI, pnpm, and development tooling. Electron runs its own bundled Node.js version — for Electron 30.5.1 this is 20.16.0. `tsc` and ESLint check against the system's `@types/node` (e.g., Node 24 types), which declare APIs unavailable in Electron's bundled Node 20.16.0. Code that passes type-checking may crash at runtime.

**Evidence:** E02-T01 verify script used `import.meta.dirname` — passed `tsc --noEmit` (system Node 24 types include it) but would have caused `ReferenceError` at runtime in Electron 30.5.1 (bundled Node 20.16.0 lacks it; requires 20.18+). Fixed in code review.

**Consequences:**

- Before using any Node API in Electron main-process code, verify it exists in Node 20.16.0
- `import.meta.dirname` and `import.meta.filename` are NOT available (require 20.18+)
- ES2024+ APIs (`Object.groupBy`, `Array.fromAsync`, `Promise.withResolvers`) are NOT available (require Node 21+)
- `tsc` strict mode with `lib: ["ES2022"]` already prevents ES2023+ type usage, but runtime-only APIs bypass type checks
- If Electron is upgraded to a newer major version, the bundled Node version changes — re-verify API availability

---

## 2. Package Decisions

### PK-01: `@capacitor-community/sqlite` v6.0.2

| Attribute        | Value                                                      |
| ---------------- | ---------------------------------------------------------- |
| **Status**       | ADOPTED — spike and production                             |
| **Version**      | 6.0.2 (pinned)                                             |
| **Alternatives** | None — this is the only viable SQLite plugin for Capacitor |
| **Peer Dep**     | `@capacitor/core@^6.0.0`                                   |

**Reason:** Provides full CRUD and foreign key enforcement via Android's native `SQLiteDatabase`. SQ-09 (FK enforcement) passed — the gating test for the architecture.

**Key Findings:**

- Default `isEncryption = true` (SqliteConfig.java) — must explicitly set `androidIsEncryption: false`
- Requires `registerPlugin(CapacitorSQLitePlugin.class)` in `MainActivity.java`
- API: `execute(sql, transaction)` — for unparameterized DML/DDL; does NOT accept parameters
- API: `run(sql, values, transaction)` — for parameterized DML with `?` placeholders
- The plugin has TWO mutation methods — `execute()` and `run()` differ only in parameter acceptance. Using `execute()` with params silently discards them, leaving unbound `?` placeholders in the SQL (runtime syntax error)
- All PRAGMAs must use `query()` not `execute()` on Android
- Version 5 incompatible with `@capacitor/core@6`; Version 8 incompatible with `@capacitor/core@6`

**Installation:**

```bash
pnpm add @capacitor-community/sqlite@6.0.2
npx cap sync
```

**Registration (MainActivity.java):**

```java
import com.getcapacitor.community.database.sqlite.CapacitorSQLitePlugin;
registerPlugin(CapacitorSQLitePlugin.class);
```

---

### PK-02: `argon2-wasm` v0.9.0

| Attribute        | Value                          |
| ---------------- | ------------------------------ |
| **Status**       | ADOPTED — spike and production |
| **Version**      | 0.9.0                          |
| **Alternatives** | `argon2-browser` (fallback)    |
| **Peer Dep**     | None                           |

**Reason:** WebAssembly-compiled Argon2id implementation that runs in the Capacitor WebView. Mean derivation time 749ms (under 3,000ms budget). Produces byte-identical output to Electron's native `argon2` npm package when password is UTF-8 encoded.

**Key Findings:**

- No TypeScript declarations — requires custom `argon2-wasm.d.ts`
- Salt accepts `Uint8Array` (not just string as documented)
- Password must be passed as `Uint8Array` via `new TextEncoder().encode(password)` for cross-platform determinism
- Vite warns about `fs` and `path` externalization (expected, harmless)
- API: `default.hash({ pass, salt, time, mem, parallelism, hashLen, type })`
- Types: `Argon2d=0, Argon2i=1, Argon2id=2`
- Returns `{ hash: Uint8Array, hashHex: string, encoded: string }`

**Cross-Platform Determinism:**

- ASCII passwords: byte-identical between WASM and native
- Unicode passwords: REQUIRE `TextEncoder` for UTF-8 encoding before passing to WASM
- Without TextEncoder: WASM's `intArrayFromString()` uses a different encoding than native UTF-8

**Performance (mid-range 2022 Android device):**

- Mean: 749ms
- p99: 813ms
- Min: 681ms
- Max: 813ms
- Budget: <3,000ms — PASS

---

### PK-03: `capacitor-secure-storage-plugin` v0.10.0

| Attribute        | Value                                                |
| ---------------- | ---------------------------------------------------- |
| **Status**       | ADOPTED — spike and production                       |
| **Version**      | 0.10.0 (pinned)                                      |
| **Alternatives** | `@capacitor/preferences` (fallback, weaker security) |
| **Plugin Type**  | Community (not core Capacitor)                       |

**Reason:** Wraps Android Keystore for hardware-backed secure credential storage. Data survives app kill (KC-09 PASS). The original spec referenced `@capacitor/secure-storage` which does not exist on npm.

**Key Findings:**

- API: `set({ key, value })`, `get({ key })`, `remove({ key })`, `clear()`, `keys()`
- `get()` returns `{ value: string }` — not JSON, not null
- `get()` for missing key may throw on some Android versions — wrap in try/catch
- `remove()` is NOT idempotent — throws "Item with given key does not exist" on missing keys
- Must wrap `remove()` in try/catch that swallows "does not exist" errors
- Requires `registerPlugin()` in `MainActivity.java`
- No special Android permissions needed

**Installation:**

```bash
pnpm add capacitor-secure-storage-plugin@0.10.0
npx cap sync
```

---

### PK-04: `@capacitor/browser` v6.0.6 + `@capacitor/app` v6

| Attribute        | Value                                        |
| ---------------- | -------------------------------------------- |
| **Status**       | ADOPTED — spike and production               |
| **Version**      | 6.0.6 (browser), 6.0.3 (app)                 |
| **Alternatives** | Chrome Custom Tabs (if browser plugin fails) |
| **Plugin Type**  | Core Capacitor                               |

**Reason:** Opens the system browser for Google OAuth consent screen. `@capacitor/app` provides `App.addListener('appUrlOpen')` for receiving the redirect.

**Key Findings:**

- `App.addListener('appUrlOpen')` must be registered BEFORE `Browser.open()` to avoid race condition
- Version 8 incompatible with `@capacitor/core@6`; pinned to v6
- Browser close must be called after redirect to clean up

**Installation:**

```bash
pnpm add @capacitor/browser@6 @capacitor/app@6
npx cap sync
```

---

### PK-05: `@tanstack/react-virtual` v3.14.3

| Attribute        | Value                              |
| ---------------- | ---------------------------------- |
| **Status**       | ADOPTED — mandatory for production |
| **Version**      | 3.14.3                             |
| **Alternatives** | `react-window` (fallback)          |
| **Native Code**  | None — pure JavaScript             |

**Reason:** Headless virtualized list rendering. Reduces 10,000 DOM rows to ~28 visible rows. Render time 0.1ms. Memory reduced from ~156 MB to ~0.5 MB. Same ecosystem as TanStack Query (already in the tech stack).

**Key Findings:**

- No `npx cap sync` needed (pure JavaScript)
- `useVirtualizer({ count, getScrollElement, estimateSize, overscan, measureElement })`
- `getVirtualItems()` returns only visible rows
- `scrollToIndex()` works instantly regardless of target index (no linear scan)
- `measureElement` enables dynamic row heights via ResizeObserver
- Scroll container must have fixed height and `overflow: auto`
- Rows must use `position: absolute` with `transform: translateY()`
- Estimated row height: 48px, overscan: 5

---

### PK-07: Renderer UI Dependencies (E01-T03)

| Attribute        | Value                          |
| ---------------- | ------------------------------ |
| **Status**       | ADOPTED — scaffold, production |
| **Package**      | `@collectio/renderer`          |
| **Runtime Deps** | 12 packages (see below)        |
| **Dev Deps**     | 4 packages (see below)         |

**Runtime Dependencies:**

| Package                   | Version | Role                            |
| ------------------------- | ------- | ------------------------------- |
| `react`                   | 18.3.1  | UI framework                    |
| `react-dom`               | 18.3.1  | DOM renderer                    |
| `react-router-dom`        | 6.30.4  | Client-side routing (v6, not v7) |
| `@tanstack/react-query`   | 5.101.0 | Server state / sync management  |
| `@tanstack/react-virtual` | 3.14.3  | Virtualized table rendering     |
| `zustand`                 | 5.0.14  | Client state management         |
| `@mui/material`           | 6.5.0   | Material UI component library   |
| `@mui/icons-material`     | 6.5.0   | Material UI icons               |
| `@emotion/react`          | 11.14.0 | MUI peer dependency (CSS-in-JS) |
| `@emotion/styled`         | 11.14.1 | MUI peer dependency (styled)    |
| `immer`                   | 11.1.8  | Zustand peer dep (immutable updates) |
| `use-sync-external-store` | 1.6.0   | Zustand peer dep (React store sync) |

**Dev Dependencies:**

| Package                | Version  | Role                    |
| ---------------------- | -------- | ----------------------- |
| `@collectio/shared`    | workspace:* | Domain types          |
| `typescript`           | 5.9.3    | Type checker            |
| `@types/react`         | 18.3.31  | React type definitions  |
| `@types/react-dom`     | 18.3.7   | React DOM type definitions |

**Key Decisions:**

- **React Router v6** over v7: v7 merged Remix patterns with breaking API changes that don't match the architecture doc's standard `<Route>` component patterns.
- **MUI v6** over v5 or v7+: v6 supports React 18, is widely adopted, and is stable. v5 is end-of-life. v7+ (and v9) are too recent.
- **Explicit peer dependencies**: `@emotion/react`, `@emotion/styled`, `immer`, and `use-sync-external-store` are listed as explicit `dependencies` rather than relying on pnpm's `auto-install-peers`. With `node-linker=hoisted`, this ensures they are always available and eliminates install warnings.
- **`@types/react-dom@18.3.7`**: The latest available 18.3.x version. See AD-07 — the spec incorrectly assumed `18.3.30`.

**Consequences:**

- The renderer package NEVER imports platform-specific implementations (`platform/electron/` or `platform/capacitor/`)
- Platform providers are injected via React context at the app entry point
- The tsconfig `paths` alias `@platform` points to `../platform/src` which doesn't exist yet — safe, path aliases are evaluated lazily

---

### PK-06: `jeep-sqlite` (Peer Dependency, Not Used on Android)

| Attribute  | Value                                                     |
| ---------- | --------------------------------------------------------- |
| **Status** | INSTALLED but NOT USED on Android                         |
| **Role**   | Web fallback for `@capacitor-community/sqlite` in browser |

**Reason:** `@capacitor-community/sqlite` lists `jeep-sqlite` as a peer dependency. It is only used when running in a pure web browser (not in a Capacitor WebView with native plugin access). On Android with the native SQLite plugin registered, `jeep-sqlite` is not loaded or used.

---

## 3. Rejected Packages

### RP-01: `@capacitor-community/sqlite` v5.7.4

**Rejected Because:** Peer dependency requires `@capacitor/core@^5.0.0`. Installed with `@capacitor/core@6.2.1`, causing peer dependency warnings and potential runtime issues.

**Replaced By:** v6.0.2.

---

### RP-02: `@capacitor-community/sqlite` v8.1.0

**Rejected Because:** Peer dependency requires `@capacitor/core@>=8.0.0`. Installed with `@capacitor/core@6.2.1`, causing peer dependency mismatch.

**Replaced By:** v6.0.2.

---

### RP-03: `@capacitor/browser` v8.0.3

**Rejected Because:** Peer dependency requires `@capacitor/core@>=8.0.0`. Installed with `@capacitor/core@6.2.1`.

**Replaced By:** v6.0.6.

---

### RP-04: `@capacitor/secure-storage` (Package Does Not Exist)

**Rejected Because:** This package name is referenced in the spike spec but does not exist on the npm registry (`ERR_PNPM_FETCH_404`).

**Replaced By:** `capacitor-secure-storage-plugin@0.10.0`.

---

### RP-05: `react-window`

**Rejected Because:** Maintainer stepped back in 2023. Low maintenance activity. Fixed row heights only (no dynamic measurement). Wrapper component API is less flexible than TanStack's headless approach.

**Status:** Kept as documented fallback if `@tanstack/react-virtual` fails entirely.

---

### RP-06: `argon2-browser` (Alternative WASM Argon2)

**Rejected Because:** `argon2-wasm` works correctly. No reason to switch.

**Status:** Kept as documented fallback if `argon2-wasm` fails to install, load, or produces incorrect output.

**Known Differences:** Larger WASM binary (~200KB vs ~150KB). Different API: `argon2Browser.hash({ ..., type: argon2Browser.ArgonType.Argon2id })`.

---

### RP-07: `@capacitor/preferences` (Weaker Security)

**Rejected Because:** Uses `SharedPreferences` in app internal storage, not hardware-backed Android Keystore. While the `encrypt` option provides AES encryption via a device-derived key, it does not use the hardware-backed secure enclave.

**Status:** Kept as fallback if `capacitor-secure-storage-plugin` fails KC-09 (data survival after app kill) on specific OEM devices.

**Tradeoff:** Better persistence behavior on aggressive OEM devices (Xiaomi, Huawei, OnePlus) but weaker offline attack resistance.

---

## 4. Platform Limitations

### PL-01: Android `execSQL()` Rejects Result-Returning Statements

**Limitation:** Android's `SQLiteDatabase.execSQL()` throws "Queries cannot be performed using execSQL(), use query() instead" for any SQL that returns a result set. This affects ALL PRAGMA statements on Android, even pure setters like `PRAGMA foreign_keys = ON`.

**Evidence:** All SQ tests failed with this error until PRAGMAs were routed through `query()`.

**Workaround:** Use `query()` (which routes through `SQLiteDatabase.rawQuery()`) for all PRAGMA statements. See IW-01.

**Scope:** Capacitor Android only. Electron's `better-sqlite3` does not have this limitation.

---

### PL-02: `crypto.getRandomValues()` 65,536-Byte Entropy Limit

**Limitation:** The Web Crypto API's `crypto.getRandomValues()` has a per-call limit of 65,536 bytes (64 KB). Calling it with a larger buffer throws "The ArrayBufferView's byte length exceeds the number of bytes of entropy available via this API."

**Evidence:** AE-07 (5MB encrypt benchmark) failed with this error.

**Workaround:** Generate large buffers in 65,536-byte chunks using `Uint8Array.subarray()`. See IW-04.

**Scope:** All platforms (Capacitor Android, Electron). This is a Web Crypto API specification, not an Android limitation.

---

### PL-03: Android Keystore Delete Is Not Idempotent

**Limitation:** `capacitor-secure-storage-plugin` throws "Item with given key does not exist" when deleting a key that doesn't exist. Some Android Keystore implementations do not treat delete as idempotent.

**Evidence:** KC-06 (idempotent delete) failed with this error.

**Workaround:** Wrap all `remove()` calls in try/catch that swallows "does not exist" errors. See IW-05.

**Scope:** OEM-dependent. Different Android manufacturers may have different Keystore implementations.

---

### PL-04: Google Cloud Console Rejects Custom URI Schemes

**Limitation:** Google Cloud Console's OAuth 2.0 client configuration does not accept custom URI schemes (like `collectio://oauth`) as redirect URIs for any client type.

- "Web application" type: Only HTTP/HTTPS URLs with valid TLDs
- "Desktop app" type: Fixed to `http://localhost` (not configurable)
- "Android" type: No redirect URI field (uses package name + SHA-1)

**Evidence:** Multiple failed attempts with "Invalid Redirect: must end with a public top-level domain" and "Invalid Redirect: must use a domain that is a valid top private domain."

**Workaround:** Use "Android" client type with `com.collectio.app://` redirect scheme (matches package name format). See AD-03.

**Scope:** Google OAuth 2.0 configuration only. Other OAuth providers (if added in future) may have different requirements.

---

### PL-05: `@capacitor-community/sqlite` Defaults to Encryption

**Limitation:** The plugin's `SqliteConfig.java` defaults `isEncryption = true`. Without explicit configuration, the plugin attempts Android Keystore + EncryptedSharedPreferences + SQLCipher setup, which fails with a null-message exception on some devices.

**Evidence:** "CapacitorSQLitePlugin: null" error before adding `androidIsEncryption: false` to capacitor.config.

**Workaround:** Explicitly set `androidIsEncryption: false` in `capacitor.config.ts` plugins section. See RC-02.

**Scope:** Capacitor Android only.

---

### PL-06: Community Capacitor Plugins Require Manual Registration

**Limitation:** Core Capacitor plugins are auto-registered via `cap sync`. Community plugins (`@capacitor-community/sqlite`, `capacitor-secure-storage-plugin`) require explicit `registerPlugin()` in `MainActivity.java`.

**Evidence:** Plugin code compiled but returned null at runtime until `registerPlugin()` was added.

**Workaround:** Check each community plugin's documentation for required `MainActivity.java` registration. See RC-05.

**Scope:** All community Capacitor plugins.

---

### PL-07: React Strict Mode Double-Mount Breaks Capacitor Connection Management

**Limitation:** In development mode, React Strict Mode mounts components twice. The first mount's Capacitor plugin connection is never cleaned up before the second mount tries to create the same connection, causing "Connection already exists" errors.

**Evidence:** SQ-01 failed with "CreateConnection: Connection spike_test already exists" on the first test, even though no prior tests had run.

**Workaround:** Use `isConnection()` to check for existing connections and `retrieveConnection()` to reuse them. See IW-02.

**Scope:** Development mode only. Production builds are not affected. But the defensive code (isConnection/retrieveConnection) is harmless in production and guards against edge cases.

---

### PL-08: Windows PowerShell — Single Quotes in npm Scripts Are Literal

**Limitation:** Windows PowerShell passes single-quoted strings literally to commands. A glob pattern like `'src/**/*.ts'` is passed as a literal filename containing single-quote characters, not expanded as a glob.

**Evidence:** `pnpm lint` failed on the electron package with *"No files matching the pattern `'src/**/*.ts'`"* when single quotes were used. All other packages used unquoted globs and worked correctly.

**Workaround:** Use unquoted glob patterns in all npm scripts. The tool (ESLint, Prettier) handles glob expansion internally via `node-glob`, not via shell expansion.

**Scope:** All platforms. Cross-platform npm scripts must not use shell quoting for glob patterns.

---

### PL-09: `@capacitor-community/sqlite` Result Shapes Are Nested and Loosely Typed

**Limitation:** `@capacitor-community/sqlite` v6.0.2 returns loosely-typed results that do not match the actual structure returned at runtime. The plugin's TypeScript declarations do not capture the nested property paths — callers must define and cast to explicit interfaces to avoid `undefined` errors.

**Evidence:** E02-T02 verify script confirmed the following result shapes on a physical Android device:

- `db.execute(sql, false)` returns `{ changes?: { changes?: number; lastId?: number } }` — the change count is nested two levels deep under `changes.changes`
- `db.query(sql)` returns `{ values?: Array<Record<string, unknown>> }` — rows are under `values`, not in a top-level array
- `db.query('PRAGMA integrity_check')` returns `{ values?: [{ integrity_check: string }] }` — PRAGMA results are in the first element of `values`

These shapes are not documented in the plugin's README or TypeScript declarations. The `.d.ts` file returns generic objects that obscure the actual nesting.

**Workaround:** Define explicit interfaces at each call site (as done in `capacitor-sqlite-verify.ts`):

```typescript
interface ExecResult { changes?: { changes?: number; lastId?: number } }
interface QueryResult { values?: Record<string, unknown>[] }

const result = (await db.execute(sql, false)) as ExecResult;
const changeCount = result.changes?.changes ?? 0;

const rows = (await db.query(sql)) as QueryResult;
const values = rows.values ?? [];
```

The production `CapacitorSqliteConnection` (E-02 T-02.5) should encapsulate this casting behind the `DatabaseConnection` interface — callers of the typed interface will never see raw plugin results.

**Scope:** Capacitor Android only. Electron's `better-sqlite3` returns strongly-typed results via `@types/better-sqlite3`. PRAGMAs always use `query()` (PL-01) and return results via `values` (same pattern as SELECT).

---

### PL-10: `app.on('open-url')` Is macOS-Only — Does Not Fire on Windows

**Limitation:** `app.on('open-url')` is documented by Electron as a **macOS-only** event. On Windows, when `app.setAsDefaultProtocolClient('collectio')` is used and a deep link is opened:
- If `app.requestSingleInstanceLock()` is NOT set: a second Electron process spawns with the URL in `process.argv`
- If `app.requestSingleInstanceLock()` IS set: the `second-instance` event fires on the first instance with the URL in `commandLine`
- `open-url` never fires on Windows in either case

**Evidence:** E04-T01 code review identified that the custom protocol approach (`collectio://` + `open-url`) would never complete the OAuth flow on Windows. The `waitForAuthCode()` Promise would always time out (5 min) and throw `AuthCancelledError`. This was confirmed against the Electron 30.x API documentation for `app.on('open-url')` which explicitly lists it as a macOS-only event.

**Workaround:** Do NOT use `app.on('open-url')` on Windows. For OAuth redirects, use the loopback HTTP server approach (see AD-03, AD-17). Start a temporary HTTP server on `http://localhost:<random_port>`, register `http://localhost:<port>` as the OAuth redirect URI, and handle the callback via an HTTP request handler.

**Scope:** Windows (Electron). macOS uses `open-url` correctly. Linux behaves similarly to Windows (requires `second-instance` or loopback). The loopback HTTP server approach works identically on all three platforms.

**Future:** If `open-url` is extended to Windows in a future Electron version, this limitation can be revisited. Verify API documentation before any implementation that depends on `open-url`.

---

## 5. Required Configurations

### RC-01: `.npmrc` — `node-linker=hoisted`

**File:** `S:\Projects\Music_Tracker\.npmrc`

```ini
node-linker=hoisted
```

**Why:** Capacitor's `cap sync` and Gradle build cannot find plugin Android source through pnpm's virtual store symlinks. The hoisted layout creates a flat `node_modules` at the repository root.

**When to check this:** If Capacitor sync fails to find plugins, or Gradle cannot find plugin source directories, verify this setting.

---

### RC-02: `capacitor.config.ts` — `androidIsEncryption: false`

**File:** `apps/capacitor/capacitor.config.ts`

```typescript
plugins: {
  CapacitorSQLite: {
    androidIsEncryption: false,
  },
},
```

**Why:** `@capacitor-community/sqlite` defaults to encryption mode. The local SQLite database is unencrypted per constitution Section 16.4. Encryption mode causes Keystore initialization failures on some devices.

**When to check this:** If the plugin returns "CapacitorSQLitePlugin: null" at runtime, verify this setting is present.

---

### RC-03: `capacitor.config.ts` — `allowNavigation`

**File:** `apps/capacitor/capacitor.config.ts`

```typescript
server: {
  androidScheme: "https",
  allowNavigation: ["com.collectio.app://*"],
},
```

**Why:** Capacitor's WebView blocks navigation to custom URI schemes by default. `allowNavigation` whitelists the app's custom scheme for OAuth redirect handling.

**When to check this:** If `App.addListener('appUrlOpen')` never fires after OAuth redirect, verify this setting.

---

### RC-04: `AndroidManifest.xml` — OAuth Intent Filter

**File:** `apps/capacitor/android/app/src/main/AndroidManifest.xml`

```xml
<activity ...>
    <!-- ... existing intent filters ... -->

    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="com.collectio.app" android:host="" />
    </intent-filter>
</activity>
```

**Why:** Android's intent system routes custom URI scheme requests to the app. Without this intent filter, Google OAuth redirects are not delivered to the Capacitor app.

**When to check this:** If OAuth redirects show "URL not recognized" in the browser instead of returning to the app, verify this filter is inside the correct `<activity>` element.

---

### RC-05: `MainActivity.java` — Plugin Registration

**File:** `apps/capacitor/android/app/src/main/java/com/collectio/app/MainActivity.java`

```java
package com.collectio.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.community.database.sqlite.CapacitorSQLitePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CapacitorSQLitePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
```

**Why:** Community Capacitor plugins are not auto-registered by `cap sync`. The `registerPlugin()` call must be made before `super.onCreate()`.

**Correct class name:** `CapacitorSQLitePlugin` (NOT `CapacitorSQLite`)

**Correct package:** `com.getcapacitor.community.database.sqlite.CapacitorSQLitePlugin` (NOT `com.getcapacitor.community.sqlite.CapacitorSQLite`)

**For secure storage plugin:** `import com.whitestein.securestorage.SecureStoragePluginPlugin;` and call `registerPlugin(SecureStoragePluginPlugin.class);`

**When to check this:** If any community Capacitor plugin returns null at runtime, verify it is registered in `MainActivity.java`.

---

### RC-06: Google Cloud Console — Android OAuth Client

**Setup Steps:**

1. Go to https://console.cloud.google.com/
2. Create a project (or use existing)
3. Enable Google Drive API
4. Create OAuth 2.0 Client ID → Application type: **"Android"**
5. Package name: `com.collectio.app` (must match `appId` in `capacitor.config.ts`)
6. SHA-1 certificate fingerprint: from debug keystore
7. Copy the Client ID into the app configuration

**Why:** "Android" client type is required because Google Cloud Console does not accept custom URI schemes for any other client type.

**When to check this:** If OAuth flow shows "Access blocked: Authorization Error" or "Error 400: invalid_request" with redirect URI issues.

---

## 6. Known Issues

### KI-01: OAuth PKCE Flow Not Fully Verified End-to-End

**Status:** PARTIALLY RESOLVED

**Issue:** The OAuth PKCE flow was implemented but did not complete end-to-end on the test device. The authorization code was not exchanged for tokens. The redirect URI configuration is correct but requires Google Cloud Console setup with "Android" client type.

**Impact:** The architecture question "Can Google OAuth PKCE complete on Capacitor Android?" is not definitively answered.

**Next Step:** Complete the OAuth flow with "Android" client type as a high-priority follow-up.

---

### KI-02: WAL Mode Requires `query()` Not `execute()` on Android

**Status:** RESOLVED with workaround

**Issue:** All PRAGMA statements must use `query()` (not `execute()`) on Capacitor Android because Android's `execSQL()` rejects result-returning statements. This is a platform-specific behavior.

**Workaround:** Route all PRAGMAs through `query()` in the Capacitor implementation. Electron's `better-sqlite3` can continue using `exec()`.

**Future:** If the Capacitor SQLite plugin adds native PRAGMA handling, this workaround can be removed.

---

### KI-03: Secure Storage Delete Not Idempotent

**Status:** RESOLVED with workaround

**Issue:** `capacitor-secure-storage-plugin` throws "Item with given key does not exist" when deleting a non-existent key. The `SecureStorageProvider` interface requires idempotent delete.

**Workaround:** Wrap all `remove()` calls in try/catch that swallows "does not exist" errors.

**Future:** Monitor plugin updates for idempotent delete support.

---

### KI-04: Render Time Measurement Bug in T-00b.6 and T-00b.7

**Status:** RESOLVED

**Issue:** Initial render time measurements showed 134 seconds (T6) and 42 seconds (T7) due to measuring across `useEffect`/`useLayoutEffect` boundaries. The actual render times are ~187ms (T6) and ~0.1ms (T7).

**Resolution:** Measure render start and end time directly inside `useLayoutEffect` by calling `performance.now()` at the beginning and end of the effect.

**Future:** Any performance measurement in React components should capture timestamps within a single effect boundary.

---

## 7. Implementation Workarounds

### IW-01: `DROP TABLE IF EXISTS` Instead of `deleteDatabase()`

**Problem:** `CapacitorSQLite.deleteDatabase()` fails silently when connection dictionary holds stale references.

**Workaround:** Each test drops its own tables with `DROP TABLE IF EXISTS` before creating them. Avoids the connection lifecycle issue entirely.

**Production Impact:** None — this is a test-only pattern. Production migrations use `CREATE TABLE IF NOT EXISTS`.

---

### IW-02: `isConnection()` / `retrieveConnection()` Pattern

**Problem:** React Strict Mode double-mounting creates duplicate connections.

**Workaround:** In `open()`, check `isConnection()` first. If connection exists, use `retrieveConnection()`. If not, use `createConnection()`.

```typescript
const existing = await this.sqlite.isConnection(this.dbName, false);
if (existing.result) {
    dbConn = await this.sqlite.retrieveConnection(this.dbName, false);
} else {
    dbConn = await this.sqlite.createConnection(
        this.dbName,
        false,
        'no-encryption',
        1,
        false,
    );
}
```

**Production Impact:** This pattern should be used in the production `CapacitorSqliteConnection.open()`. It is harmless and guards against edge cases.

---

### IW-03: `TextEncoder` for Unicode Password Determinism

**Problem:** `argon2-wasm`'s internal `intArrayFromString()` uses a different encoding than native `argon2` npm package's UTF-8 for non-ASCII characters. Cross-platform AR-CROSS test fails for Unicode passwords.

**Workaround:** Encode password as UTF-8 bytes via `new TextEncoder().encode(password)` before passing to `argon2.hash()`. Pass the resulting `Uint8Array` as the `pass` parameter.

```typescript
const passBytes = new TextEncoder().encode(password);
await argon2.default.hash({ pass: passBytes, salt, ... });
```

**Production Impact:** The production `WebCryptoProvider.deriveKey()` must use this pattern. Unit test with Unicode passwords.

---

### IW-04: Chunked `crypto.getRandomValues()` for Large Buffers

**Problem:** `crypto.getRandomValues()` has a 65,536-byte per-call limit. 5MB buffers fail.

**Workaround:** Generate large buffers in 64KB chunks:

```typescript
const buffer = new Uint8Array(size);
const CHUNK = 65536;
for (let off = 0; off < size; off += CHUNK) {
    crypto.getRandomValues(buffer.subarray(off, Math.min(off + CHUNK, size)));
}
```

**Production Impact:** Any code generating large random buffers must use this pattern. This is a Web Crypto API specification, not a platform limitation.

---

### IW-05: Idempotent Delete Wrapper for Secure Storage

**Problem:** `capacitor-secure-storage-plugin` throws on delete of non-existent keys.

**Workaround:** Wrap `remove()` in try/catch:

```typescript
async function remove(key: string): Promise<void> {
    try {
        await SecureStoragePlugin.remove({ key });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('does not exist')) {
            throw err;
        }
    }
}
```

**Production Impact:** The production `CapacitorStorageProvider.remove()` must use this wrapper.

---

### IW-06: `toArrayBuffer()` Helper for TypeScript 5.x SubtleCrypto

**Problem:** TypeScript 5.x types `Uint8Array.buffer` as `ArrayBufferLike` (including `SharedArrayBuffer`), but SubtleCrypto API requires `BufferSource` (only `ArrayBuffer`).

**Workaround:** Create a helper function:

```typescript
function toArrayBuffer(view: Uint8Array): ArrayBuffer {
    return view.buffer.slice(
        view.byteOffset,
        view.byteOffset + view.byteLength,
    ) as ArrayBuffer;
}
```

**Production Impact:** All cryptographic operations in the production `WebCryptoProvider` must use this helper when passing `Uint8Array` to SubtleCrypto.

---

## 8. Performance Baselines

### PB-01: Argon2id WASM Key Derivation

| Metric           | Value                     | Budget   | Status             |
| ---------------- | ------------------------- | -------- | ------------------ |
| Mean             | 749ms                     | <3,000ms | PASS               |
| p99              | 813ms                     | <4,000ms | PASS               |
| Min              | 681ms                     | —        | —                  |
| Max              | 813ms                     | —        | —                  |
| WASM load time   | ~320ms                    | —        | Informational only |
| Memory (JS heap) | 9.5MB used, 2,222MB limit | —        | No OOM             |

**Parameters:** 64 MB memory, 3 iterations, 4 parallelism, 32-byte output

**Device context:** API level 16, WebView 148.0.7778.215 (potentially emulated). Physical mid-range device may have better performance. Minimum-spec (2GB RAM) may have worse.

---

### PB-02: Virtualized Table Rendering (10,000 Rows)

| Metric          | Unvirtualized (T6)   | Virtualized (T7) | Improvement |
| --------------- | -------------------- | ---------------- | ----------- |
| DOM rows        | 10,000               | 28               | 357x        |
| Total DOM nodes | 80,069               | 279              | 287x        |
| Memory (est.)   | ~156 MB              | ~0.5 MB          | 286x        |
| Render time     | ~187ms               | 0.1ms            | —           |
| Scroll          | Degrades to unusable | Always smooth    | —           |

**Row height:** 48px | **Overscan:** 5 | **Viewport:** ~800px

---

### PB-03: AES-GCM via SubtleCrypto (5MB)

| Metric       | Value                    | Budget                 | Status |
| ------------ | ------------------------ | ---------------------- | ------ |
| Mean encrypt | (not captured in report) | <500ms (informational) | —      |
| Mean decrypt | (not captured in report) | <500ms (informational) | —      |

**Note:** The benchmark ran but detailed timing was not included in the JSON report. Sub-millisecond for small payloads observed during testing.

---

### PB-04: Scroll-to-Index Performance

| Target Index | Duration | Data Correct |
| ------------ | -------- | ------------ |
| 5,000        | ~101ms   | Yes          |
| 9,980        | ~100ms   | Yes          |

**Key finding:** Scroll time is constant regardless of target index. No linear scan. The 100ms includes DOM update and measurement overhead.

---

## 9. Version Compatibility Matrix

| Package                           | Required Version | Compatible Core | Notes                        |
| --------------------------------- | ---------------- | --------------- | ---------------------------- |
| `@capacitor/core`                 | 6.2.1            | —               | Scaffold target              |
| `@capacitor/cli`                  | 6.2.1            | —               | Required for `cap sync`      |
| `@capacitor/android`              | 6.2.1            | —               | Android platform support     |
| `@capacitor-community/sqlite`     | 6.0.2            | 6.x             | NOT 5.x, NOT 8.x             |
| `@capacitor/browser`              | 6.0.6            | 6.x             | NOT 8.x                      |
| `@capacitor/app`                  | 6.0.3            | 6.x             | Required for `appUrlOpen`    |
| `capacitor-secure-storage-plugin` | 0.10.0           | 6.x             | Community plugin             |
| `argon2-wasm`                     | 0.9.0            | —               | No peer dep                  |
| `@tanstack/react-virtual`         | 3.14.3           | —               | Pure JS                      |
| `@tanstack/react-query`           | 5.101.0          | —               | Peer: `react ^18 \|\| ^19`   |
| `react-router-dom`                | 6.30.4           | —               | v6, NOT v7                   |
| `zustand`                         | 5.0.14           | —               | Peer: `immer`, `use-sync-external-store` |
| `@mui/material`                   | 6.5.0            | —               | Peer: `@emotion/react`, `@emotion/styled` |
| `@mui/icons-material`             | 6.5.0            | —               | Must match `@mui/material` major.minor |
| `@emotion/react`                  | 11.14.0          | —               | Explicit dep (MUI peer)      |
| `@emotion/styled`                 | 11.14.1          | —               | Explicit dep (MUI peer)      |
| `immer`                           | 11.1.8           | —               | Explicit dep (zustand peer)  |
| `use-sync-external-store`         | 1.6.0            | —               | Explicit dep (zustand peer)  |
| `@types/react`                    | 18.3.31          | —               | Latest 18.3.x types          |
| `@types/react-dom`                | 18.3.7           | —               | Latest 18.3.x types (see AD-07) |
| `react`                           | 18.3.1           | —               | Scaffold target              |
| `react-dom`                       | 18.3.1           | —               | Scaffold target              |
| `typescript`                      | 5.9.3            | —               | Strict mode                  |
| `vite`                            | 5.4.21           | —               | Bundler                      |
| `pnpm`                            | 9.x              | —               | NOT 11.x (requires Node 22+) |
| `node`                            | 20.14.0          | —               | Minimum for pnpm 9.x         |

---

## 10. Future Risks

### FR-01: `@capacitor-community/sqlite` Is Community-Maintained

**Severity:** HIGH

**Risk:** The SQLite plugin is community-maintained, not part of Capacitor core. If the maintainer abandons the package or a Capacitor core update breaks compatibility, there is no guaranteed fix path.

**Mitigation:**

- Pin the exact version (not `^6.0.0`)
- Monitor the GitHub repository for activity
- Prepare a fallback plan: custom Capacitor SQLite plugin (2-3 days estimated)
- Test plugin upgrades in a dedicated spike before merging

---

### FR-02: Argon2id WASM May OOM on Minimum-Spec Devices

**Severity:** MEDIUM

**Risk:** The 64MB memory allocation for Argon2id WASM represents 13-50% of available heap on a 2GB RAM device. The spike was tested on an emulated device; physical minimum-spec device behavior is unknown.

**Mitigation:**

- Test on a physical 2GB RAM device before proceeding to production
- If OOM occurs: halve memory to 32MB and double iterations to 4
- If still OOM: fallback to PBKDF2 via SubtleCrypto (document the security tradeoff)
- Production should accept configurable memory parameters

---

### FR-03: Secure Storage Persistence Varies by OEM

**Severity:** MEDIUM

**Risk:** KC-09 passed on the test device. Aggressive battery optimization on Xiaomi, Huawei, and OnePlus devices may clear the app's data directory when the user swipes from recents.

**Mitigation:**

- Test KC-09 on at least 2 additional OEM devices
- If data loss occurs: fallback to `@capacitor/preferences` with encryption
- Production should run a startup check to verify stored credentials exist

---

### FR-04: OAuth PKCE Not Verified End-to-End

**Severity:** HIGH

**Risk:** The OAuth flow was implemented but not fully verified. The architecture depends on OAuth for Google Drive cloud sync.

**Mitigation:**

- Complete the OAuth flow as the highest priority follow-up
- If "Android" client type doesn't work: evaluate Chrome Custom Tabs
- If neither works: use "Desktop app" client type with `http://localhost` loopback redirect

---

### FR-05: Encrypted File Format Not Validated End-to-End

**Severity:** MEDIUM

**Risk:** Individual components (Argon2id, AES-GCM, secure storage) were validated separately. An integration bug where one component's output doesn't match another's expected input could break the file format.

**Mitigation:**

- T-03.5 (EncryptedFileFormat.pack/unpack) must be implemented and tested
- T-03.6 (Cross-platform determinism) must verify Capacitor ↔ Electron compatibility
- The byte-level layout (constitution Section 16.3) must be verified with hex dumps on both platforms

---

### FR-06: Capacitor 8 Upgrade Path

**Severity:** LOW

**Risk:** All packages are pinned to Capacitor 6.x. Capacitor 8.x has breaking API changes.

**Mitigation:**

- Plan a Capacitor 8 upgrade spike before production release
- `@capacitor-community/sqlite` v8.1.0 exists (compatible with Capacitor 8)
- `@capacitor/browser` v8.x exists
- Estimated upgrade effort: 1-2 days

---

### FR-07: No Automated E2E Testing on Android

**Severity:** LOW (for spike phase), MEDIUM (for production)

**Risk:** All spike tests were manual (on-device). No automated E2E tests exist for Capacitor Android.

**Mitigation:**

- E-16 (Testing & QA) includes Playwright-based E2E tests
- Android E2E testing via Appium or Maestro should be considered for critical flows
- Manual test checklist for every release on a physical device

---

_End of Implementation Decisions_
