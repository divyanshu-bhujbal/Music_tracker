# Agent Rules — Personal Collection Manager

> **Purpose:** Concise, unambiguous rules that every coding agent must follow when working on this codebase.
>
> **Source:** E-00b Capacitor Validation Spike retrospective and Implementation Decisions (`docs/06_IMPLEMENTATION_DECISIONS.md`).
>
> **Violation consequence:** Any change violating these rules is rejected until the rule is satisfied or the rule itself is updated.

---

## 1. Approved Packages

Use these exact versions. Do NOT use version ranges (`^` or `~`). Pin to the exact version listed.

### Capacitor Core

| Package              | Version | Notes                     |
| -------------------- | ------- | ------------------------- |
| `@capacitor/core`    | 6.2.1   | Target platform version   |
| `@capacitor/cli`     | 6.2.1   | Required for `cap sync`   |
| `@capacitor/android` | 6.2.1   | Android platform          |
| `@capacitor/browser` | 6.0.6   | OAuth browser flow        |
| `@capacitor/app`     | 6.0.3   | Required for `appUrlOpen` |

### Community Plugins

| Package                           | Version | Notes                           |
| --------------------------------- | ------- | ------------------------------- |
| `@capacitor-community/sqlite`     | 6.0.2   | NOT 5.x, NOT 8.x                |
| `capacitor-secure-storage-plugin` | 0.10.0  | NOT `@capacitor/secure-storage` |

### Renderer UI (packages/renderer)

| Package                   | Version | Notes                         |
| ------------------------- | ------- | ----------------------------- |
| `react`                   | 18.3.1  | Scaffold target               |
| `react-dom`               | 18.3.1  | Scaffold target               |
| `react-router-dom`        | 6.30.4  | v6, NOT v7                    |
| `@tanstack/react-query`   | 5.101.0 | Server state / sync           |
| `@tanstack/react-virtual` | 3.14.3  | Mandatory for table rendering |
| `zustand`                 | 5.0.14  | Client state management       |
| `@mui/material`           | 6.5.0   | Material UI v6                |
| `@mui/icons-material`     | 6.5.0   | Must match MUI version        |
| `@emotion/react`          | 11.14.0 | MUI peer dep (must be explicit) |
| `@emotion/styled`         | 11.14.1 | MUI peer dep (must be explicit) |
| `immer`                   | 11.1.8  | Zustand peer dep (must be explicit) |
| `use-sync-external-store` | 1.6.0   | Zustand peer dep (must be explicit) |
| `@types/react`            | 18.3.31 | Latest 18.3.x types           |
| `@types/react-dom`        | 18.3.7  | Latest 18.3.x types (see Rule 11.4) |

### Other JavaScript Libraries

| Package       | Version | Notes         |
| ------------- | ------- | ------------- |
| `argon2-wasm` | 0.9.0   | WASM Argon2id |

### Build Tools

| Package      | Version | Notes                        |
| ------------ | ------- | ---------------------------- |
| `vite`       | 5.4.21  | Bundler                      |
| `typescript` | 5.9.3   | Strict mode required         |
| `pnpm`       | 9.x     | NOT 11.x (Node 22+ required) |
| `node`       | 20.x    | Minimum for pnpm 9.x         |

---

## 2. Banned Packages

DO NOT install these packages. They are incompatible, unmaintained, or have been rejected.

| Package                           | Reason                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `@capacitor-community/sqlite@5.x` | Requires `@capacitor/core@^5.0.0` — incompatible                             |
| `@capacitor-community/sqlite@8.x` | Requires `@capacitor/core@>=8.0.0` — incompatible                            |
| `@capacitor/browser@8.x`          | Requires `@capacitor/core@>=8.0.0` — incompatible                            |
| `@capacitor/secure-storage`       | Does not exist on npm                                                        |
| `react-window`                    | Unmaintained since 2023. Fixed row heights only                              |
| `@capacitor/preferences`          | Uses SharedPreferences, not Android Keystore. Weaker security. Fallback only |

---

## 3. Required Configuration Files

Every file listed below must exist with the specified content. Missing or incorrect configuration is a gating error.

### `.npmrc` (repository root)

MUST contain:

```
node-linker=hoisted
```

**Why:** Capacitor's Gradle build cannot find plugin Android source through pnpm's symlink-based virtual store. The hoisted layout creates a flat `node_modules`.

**Check:** If `cap sync` or Gradle build fails to find plugin source, verify this setting is present.

---

### `apps/capacitor/capacitor.config.ts`

MUST contain these sections:

```typescript
server: {
  androidScheme: "https",
  allowNavigation: ["com.collectio.app://*"],
},
plugins: {
  CapacitorSQLite: {
    androidIsEncryption: false,
  },
},
```

**Why:**

- `allowNavigation`: Required for OAuth redirect handling. Without it, the WebView blocks navigation to custom URI schemes.
- `androidIsEncryption: false`: The plugin defaults to encryption mode, which causes Keystore initialization failures. The local database is unencrypted per constitution.

**Check:** If the SQLite plugin returns `null` at runtime, verify `androidIsEncryption: false` is present. If OAuth redirects don't fire, verify `allowNavigation`.

---

### `apps/capacitor/android/app/src/main/java/com/collectio/app/MainActivity.java`

MUST contain this pattern for every community plugin:

```java
import com.getcapacitor.community.database.sqlite.CapacitorSQLitePlugin;

@Override
public void onCreate(Bundle savedInstanceState) {
    registerPlugin(CapacitorSQLitePlugin.class);
    super.onCreate(savedInstanceState);
}
```

**Why:** Community plugins are not auto-registered by `cap sync`. The `registerPlugin()` call must be made before `super.onCreate()`.

**Correct class:** `CapacitorSQLitePlugin` (NOT `CapacitorSQLite`).

**Correct package:** `com.getcapacitor.community.database.sqlite.CapacitorSQLitePlugin`.

**Check:** If any community plugin returns `null` at runtime, verify it is registered here.

---

### `apps/capacitor/android/app/src/main/AndroidManifest.xml`

MUST contain this intent filter inside the main `<activity>` element:

```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="com.collectio.app" android:host="" />
</intent-filter>
```

**Why:** Required for Android's intent system to route OAuth redirects back to the app.

**Check:** If OAuth redirects show "URL not recognized" in the browser, verify this filter is present and inside the correct activity.

---

## 4. SQLite Rules

### Rule 4.1: All PRAGMAs Must Use `query()` on Android

**Imperative:** On Capacitor Android, execute ALL PRAGMA statements via `query()`, NOT `execute()` or `run()`.

**Why:** Android's `SQLiteDatabase.execSQL()` rejects any statement that returns a result set. Every PRAGMA (`journal_mode`, `foreign_keys`, `synchronous`, `busy_timeout`, `integrity_check`) returns a row on Android.

**Pattern:**

```typescript
await dbConn.query('PRAGMA foreign_keys = ON');
await dbConn.query('PRAGMA journal_mode = WAL');
await dbConn.query('PRAGMA synchronous = NORMAL');
await dbConn.query('PRAGMA busy_timeout = 5000');
```

**Check:** If you see "Queries cannot be performed using execSQL(), use query() instead", you violated this rule.

**Scope:** Capacitor Android only. Electron's `better-sqlite3` can use `exec()` for PRAGMAs.

---

### Rule 4.2: Never Call `execute()` Without Explicit `transaction` Flag

**Imperative:** Always pass `transaction: false` as the second argument to `dbConn.execute()` unless you explicitly intend to wrap in a transaction.

**Why:** The plugin defaults `transaction = true` for `execute()`, wrapping every call in implicit `BEGIN`/`COMMIT`. This breaks PRAGMA execution and can cause nested transaction errors within explicit transactions.

**Pattern:**

```typescript
await dbConn.execute(sql, false);
```

---

### Rule 4.3: Use `isConnection()` Before `createConnection()`

**Imperative:** Before calling `createConnection()`, check if the database name already has a connection via `isConnection()`. If it exists, use `retrieveConnection()` instead.

**Why:** React Strict Mode in development mounts components twice. The first mount creates a connection that the second mount tries to re-create, causing "Connection already exists" errors.

**Pattern:**

```typescript
const existing = await this.sqlite.isConnection(dbName, false);
if (existing.result) {
    dbConn = await this.sqlite.retrieveConnection(dbName, false);
} else {
    dbConn = await this.sqlite.createConnection(
        dbName,
        false,
        'no-encryption',
        1,
        false,
    );
}
```

---

### Rule 4.4: Use a Single Shared `SQLiteConnection` Instance

**Imperative:** Create ONE `new SQLiteConnection(CapacitorSQLite)` at the module or app level. Reuse it for all database operations. Do not create multiple instances.

**Why:** `SQLiteConnection` has an internal `_connectionDict` keyed by database name, not by instance. Multiple instances competing for the same dictionary cause collisions.

---

### Rule 4.5: Never Delete the Database File Between Operations

**Imperative:** Do NOT call `CapacitorSQLite.deleteDatabase()` to clean up between operations. Use `DROP TABLE IF EXISTS` inside the same connection.

**Why:** `deleteDatabase()` fails silently when the connection dictionary holds stale references. The file is locked by SQLite and cannot be deleted until all connections release it.

---

## 5. Cryptography Rules

### Rule 5.1: Encode Passwords as UTF-8 Bytes Before Argon2id

**Imperative:** When calling `argon2-wasm`, encode the password string as UTF-8 bytes via `new TextEncoder().encode(password)` and pass the resulting `Uint8Array`, NOT the raw string.

**Why:** `argon2-wasm`'s internal `intArrayFromString()` uses a different encoding than the native `argon2` npm package's UTF-8 for non-ASCII characters. Without TextEncoder, Unicode passwords produce different keys on Capacitor vs Electron — breaking cross-platform sync.

**Pattern:**

```typescript
const passBytes = new TextEncoder().encode(password);
await argon2.default.hash({ pass: passBytes, salt, ... });
```

**Check:** If AR-CROSS (cross-platform determinism) fails for Unicode passwords, verify this pattern is used.

---

### Rule 5.2: Pass `Uint8Array` to SubtleCrypto via `toArrayBuffer()`

**Imperative:** When passing `Uint8Array` to `crypto.subtle.importKey()`, `crypto.subtle.encrypt()`, or `crypto.subtle.decrypt()`, convert it to `ArrayBuffer` first using the helper below. Do NOT pass `Uint8Array` directly.

**Why:** TypeScript 5.x types `Uint8Array.buffer` as `ArrayBufferLike` (including `SharedArrayBuffer`), but SubtleCrypto requires `BufferSource` (only `ArrayBuffer`). Passing directly causes type errors.

**Helper (must be used):**

```typescript
function toArrayBuffer(view: Uint8Array): ArrayBuffer {
    return view.buffer.slice(
        view.byteOffset,
        view.byteOffset + view.byteLength,
    ) as ArrayBuffer;
}
```

---

### Rule 5.3: Chunk `crypto.getRandomValues()` at 64KB Boundaries

**Imperative:** When generating random buffers larger than 65,536 bytes, fill them in chunks of 65,536 bytes or less using `Uint8Array.subarray()`. Never pass a buffer larger than 65,536 bytes to `crypto.getRandomValues()`.

**Why:** The Web Crypto API has a per-call entropy limit of 65,536 bytes. Larger buffers throw.

**Pattern:**

```typescript
const CHUNK = 65536;
for (let off = 0; off < size; off += CHUNK) {
    crypto.getRandomValues(buffer.subarray(off, Math.min(off + CHUNK, size)));
}
```

---

### Rule 5.4: GCM Tag Is Appended to Ciphertext by SubtleCrypto

**Imperative:** When encrypting via `crypto.subtle.encrypt()`, the returned `ArrayBuffer` contains `ciphertext + tag` concatenated. Extract the last 16 bytes as the tag and the preceding bytes as ciphertext. When decrypting, recombine `ciphertext + tag` before passing to `crypto.subtle.decrypt()`.

**Why:** SubtleCrypto's AES-GCM implementation appends the 16-byte authentication tag to the ciphertext. Node.js crypto (Electron) returns them separately via `cipher.getAuthTag()`. The encrypted file format stores them at known offsets.

**Pattern:**

```typescript
// Encrypt
const combined = new Uint8Array(result);
const tag = combined.slice(-16);
const ciphertext = combined.slice(0, -16);

// Decrypt
const recombined = new Uint8Array(ciphertext.length + 16);
recombined.set(ciphertext);
recombined.set(tag, ciphertext.length);
```

---

## 6. OAuth Rules

### Rule 6.1: Use "Android" OAuth Client Type in Google Cloud Console

**Imperative:** Create the OAuth 2.0 client ID with application type "Android", not "Web application" or "Desktop app". Register the package name `com.collectio.app` and SHA-1 fingerprint.

**Why:** Google Cloud Console does not accept custom URI schemes for any other client type. "Android" type binds to the app's package name and handles redirects through Android's intent system.

---

### Rule 6.2: The Redirect URI Is `com.collectio.app://`

**Imperative:** In the OAuth auth URL and token exchange, use `redirect_uri=com.collectio.app://` (package name as scheme). Update the AndroidManifest intent filter and capacitor.config allowNavigation to match.

**Why:** The package name format is required for "Android" client type. Custom schemes like `collectio://oauth` are rejected by Google.

---

### Rule 6.3: Register `appUrlOpen` Listener BEFORE `Browser.open()`

**Imperative:** Call `App.addListener('appUrlOpen', handler)` BEFORE calling `Browser.open({ url })`. Never open the browser first then register the listener.

**Why:** The redirect may arrive before the listener is registered — a race condition. Capacitor queues the event but timing is not guaranteed.

---

### Rule 6.4: Include `prompt=consent` in the Auth URL

**Imperative:** Always include `prompt=consent` in the Google authorization URL.

**Why:** Google only returns a refresh token on the FIRST authorization for a given user+client combination. Without `prompt=consent`, subsequent authorizations may not return a refresh token, breaking background sync.

---

### Rule 6.5: Never Log or Persist Raw OAuth Tokens

**Imperative:** Never log `access_token`, `refresh_token`, or derived AES key values. Never store `code_verifier` in localStorage, sessionStorage, IndexedDB, or Capacitor Preferences. Nullify the in-memory `code_verifier` variable after the token exchange completes.

**Why:** OAuth tokens grant access to the user's Google Drive. The `code_verifier` is the cryptographic proof that binds the authorization request to the token exchange. If persisted, an attacker with file system access could intercept future authorization codes.

---

## 7. Storage Rules

### Rule 7.1: Wrap `remove()` for Idempotent Delete

**Imperative:** All calls to `capacitor-secure-storage-plugin`'s `remove()` must be wrapped in try/catch. Swallow errors containing "does not exist" — rethrow all other errors.

**Why:** The plugin throws on delete of non-existent keys on some Android Keystore implementations. The `SecureStorageProvider` interface requires idempotent delete.

**Pattern:**

```typescript
async function remove(key: string): Promise<void> {
    try {
        await SecureStoragePlugin.remove({ key });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('does not exist')) throw err;
    }
}
```

---

### Rule 7.2: Base64-Encode Binary Data Before Storing

**Imperative:** All values stored in `capacitor-secure-storage-plugin` must be strings. Binary data (AES key, random salts) must be base64-encoded before storage and base64-decoded after retrieval.

**Why:** The plugin only accepts string values. The derived AES key is 32 raw bytes — base64 encoding produces a 44-character string.

---

## 8. Rendering Rules

### Rule 8.1: Virtualize Every Data Table

**Imperative:** Every table component rendering more than 100 rows MUST use `@tanstack/react-virtual`'s `useVirtualizer` hook. Never render all rows to the DOM.

**Why:** Unvirtualized 10,000-row tables create 80,069 DOM nodes consuming ~156 MB. Scroll degrades to unusable. Virtualization reduces this to ~28 DOM rows consuming ~0.5 MB.

**Parameters:** Row height estimate: 48px. Overscan: 5. Enable `measureElement` for dynamic row heights.

---

### Rule 8.2: Scroll Container Must Have Fixed Height

**Imperative:** The element passed to `getScrollElement` in `useVirtualizer` MUST have a fixed CSS height (e.g., `height: 100vh` or `height: calc(100vh - 200px)`) and `overflow: auto` or `overflow: scroll`.

**Why:** Without a fixed height, the virtualizer cannot calculate the visible row count. All rows will render (no virtualization).

---

### Rule 8.3: Virtualized Rows Must Use Absolute Positioning

**Imperative:** Each `<tr>` element rendered by `getVirtualItems()` MUST use `position: absolute; top: 0; left: 0; transform: translateY(${virtualRow.start}px)`. The parent `<tbody>` MUST use `position: relative` and a height equal to `virtualizer.getTotalSize()`.

**Why:** The virtualizer positions rows by their calculated pixel offset. Without absolute positioning, rows stack at the top.

---

### Rule 8.4: Measure Render Time Inside `useLayoutEffect`

**Imperative:** When measuring React render performance, capture BOTH the start and end `performance.now()` calls inside the SAME `useLayoutEffect` callback. Never capture start in one effect and end in another.

**Why:** The gap between `useEffect` and `useLayoutEffect` can be seconds on a busy WebView, producing wildly inaccurate render time measurements.

---

## 9. Build System Rules

### Rule 9.1: Run `cap sync` After Every Plugin Change

**Imperative:** After installing, updating, or removing any Capacitor plugin, run `npx cap sync android`. After editing `AndroidManifest.xml`, `MainActivity.java`, or `capacitor.config.ts`, also run `npx cap sync android`.

**Why:** `cap sync` copies web assets, updates plugin references in Gradle, and regenerates `capacitor.build.gradle` and `capacitor.settings.gradle`.

---

### Rule 9.2: Rebuild from Android Studio After Java Changes

**Imperative:** After editing any `.java` file (including `MainActivity.java`), rebuild from Android Studio. `cap sync` alone does not compile Java code.

**Why:** `cap sync` copies web assets and updates Gradle configs, but Java compilation is handled by Android Studio's Gradle build system.

---

### Rule 9.3: Full Clean Rebuild When Debugging Native Issues

**Imperative:** When debugging native plugin issues (SQLite, secure storage, browser), run Build > Clean Project then Build > Rebuild Project in Android Studio. Do not rely on incremental builds.

**Why:** Android Studio's incremental builds may cache stale native library references. A clean rebuild ensures the latest native code is compiled.

---

### Rule 9.4: Verify TypeScript Before Every Build

**Imperative:** Run `npx tsc --noEmit` before every `npx vite build`. The build script may swallow compilation errors. Never commit code with TypeScript errors.

---

### Rule 9.5: `.tsbuildinfo` Files Must Be Gitignored

**Imperative:** Ensure `*.tsbuildinfo` is in `.gitignore`. Never commit `tsconfig.tsbuildinfo` or any `.tsbuildinfo` file.

**Why:** TypeScript generates `.tsbuildinfo` files when `composite: true` is set (even with `noEmit: true`). These are incremental compilation caches — build artifacts that vary by machine and must not be version-controlled.

**Check:** If you see `tsconfig.tsbuildinfo` in `git status`, verify `*.tsbuildinfo` is in `.gitignore` and delete the file.

---

### Rule 9.6: Never Quote Glob Patterns in npm Scripts

**Imperative:** Write glob patterns in npm scripts without quotes. Use `eslint src/**/*.ts`, not `eslint 'src/**/*.ts'` or `eslint "src/**/*.ts"`.

**Why:** Windows PowerShell passes single-quoted strings literally to the command. A pattern like `'src/**/*.ts'` is interpreted as a literal filename containing quote characters, not a glob. The glob is expanded internally by the lint/format tool via `node-glob`, not by the OS shell.

**Pattern:**
```
✅ "lint": "eslint src/**/*.ts"
✅ "lint": "eslint src/**/*.{ts,tsx}"
❌ "lint": "eslint 'src/**/*.ts'"
❌ "lint": "eslint \"src/**/*.ts\""
```

**Check:** If `pnpm lint` reports "No files matching the pattern," check for extraneous quotes in the script definition.

---

## 10. Android Platform Rules

### Rule 10.1: Community Plugins Require Manual Registration

**Imperative:** Every community Capacitor plugin (package NOT under `@capacitor/` scope) MUST be registered in `MainActivity.java` via `registerPlugin()` before `super.onCreate()`.

**Why:** Core Capacitor plugins are auto-registered by `cap sync`. Community plugins are not. The "Found X Capacitor plugins" message from `cap sync` is not sufficient.

---

### Rule 10.2: Always Set `androidIsEncryption: false` for SQLite

**Imperative:** The `capacitor.config.ts` `plugins.CapacitorSQLite` section MUST include `androidIsEncryption: false`.

**Why:** The plugin defaults to encryption mode, attempting Android Keystore + SQLCipher setup that fails silently on many devices. The local database is unencrypted per constitution.

---

### Rule 10.3: Test Secure Storage Persistence on Multiple OEMs

**Imperative:** Test that stored credentials survive app kill (swipe from recents, Settings > Force Stop) on at least 2 different OEM devices before release (Google Pixel + one non-Pixel).

**Why:** Battery optimization on Xiaomi, Huawei, and OnePlus devices may clear app data on app swipe. Behavior varies by OEM.

---

## 11. TypeScript Rules

### Rule 11.1: Strict Mode Is Mandatory

**Imperative:** `tsconfig.json` must have `"strict": true`. All code must compile with `npx tsc --noEmit` with zero errors. No exceptions.

---

### Rule 11.2: No Implicit `any` in Callbacks

**Imperative:** All callback parameters must have explicit type annotations. Use `(t: { status: string }) =>` not `(t) =>`.

---

### Rule 11.3: Community Packages Without Types Need `.d.ts` Files

**Imperative:** For any package without built-in TypeScript declarations (`argon2-wasm` is the known case), create a `.d.ts` file in the spike or package source directory. Use `declare module "package-name"` syntax.

---

### Rule 11.4: Verify `@types/*` Versions Against npm Registry

**Imperative:** Before pinning a `@types/*` package version in any `package.json`, verify it actually exists on the npm registry. Run `npm view @types/<package> versions --json` and use the latest version matching the target major.minor.

**Why:** `@types/react-dom` and `@types/react` have independent release cadences on DefinitelyTyped. `@types/react@18.3.31` exists, but `@types/react-dom@18.3.30` does not — the latest `@types/react-dom` 18.3.x is `18.3.7`. Never assume the types packages share patch numbers with each other or with their runtime counterparts.

**Pattern:**
```bash
# Before pinning any @types package:
npm view @types/react-dom versions --json | grep "18.3"
# Use the highest version found, e.g. "18.3.7"
```

---

### Rule 11.5: Workspace tsconfig.json Files Must Be Consistent

**Imperative:** All workspace package `tsconfig.json` files must include the same compiler option set as `packages/shared/tsconfig.json`, plus package-specific additions (e.g., `jsx`, `lib`, `paths`). Never omit options present in the sibling packages.

**Why:** Inconsistent compiler options between workspace packages cause divergent type-checking behavior and break TypeScript project references (`composite: true`). The shared package sets the baseline.

**Required baseline options in every workspace package tsconfig:**
- `strict: true`
- `esModuleInterop: true`
- `skipLibCheck: true`
- `forceConsistentCasingInFileNames: true`
- `noEmit: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `noFallthroughCasesInSwitch: true`
- `isolatedModules: true`
- `declaration: true`
- `declarationMap: true`
- `sourceMap: true`
- `outDir: "./dist"`
- `rootDir: "./src"`
- `composite: true`

**Check:** Diff each new package's tsconfig against `packages/shared/tsconfig.json`. Every option present in shared should be present in the new package (except where intentionally overridden for layer-specific needs like `jsx` or `lib`).

---

### Rule 11.6: All Files Containing JSX Must Use `.tsx` Extension

**Imperative:** Never create a `.ts` file containing JSX. Use `.tsx` for all React components, JSX-containing renderer entries, and any file with `<Component>` syntax. This applies even if the tsconfig has `"jsx": "react-jsx"`.

**Why:** `typescript-eslint` v8 determines JSX parsing mode from file extension, not from `parserOptions.jsx`. `.ts` files are parsed as pure TypeScript and reject JSX syntax with "Parsing error: Unterminated regular expression literal." The `jsx: true` parser option does not override this behavior.

**Pattern:**
```
✅ renderer.tsx      — contains JSX, must be .tsx
✅ Sidebar.tsx       — React component, must be .tsx
✅ main.ts           — pure TypeScript, no JSX, .ts is correct
✅ preload.ts        — pure TypeScript, no JSX, .ts is correct
❌ renderer.ts       — contains JSX but has .ts extension
```

**Check:** If `pnpm lint` reports "Parsing error: Unterminated regular expression literal" on a file containing JSX, rename the file to `.tsx` and update the lint glob and any script references.

---

## 12. Security Rules

### Rule 12.1: Never Store the Master Password

**Imperative:** The master password must never be stored. Only the derived AES-256 key (base64-encoded) is stored in platform secure storage.

---

### Rule 12.2: Never Log Secrets

**Imperative:** Never log `access_token`, `refresh_token`, `derived AES key`, `code_verifier`, `master password`, or `Argon2id salt` values. Token presence checks (yes/no) and truncated previews (first 10 chars) are acceptable for diagnostics.

---

### Rule 12.3: Nullify `code_verifier` After Token Exchange

**Imperative:** Set the in-memory `code_verifier` variable to `null` after the token exchange completes. Verify it was never persisted to localStorage, sessionStorage, or IndexedDB.

---

## 13. Architectural Constraints

### Rule 13.1: Platform-Specific Code Is Isolated Behind Interfaces

**Imperative:** No `if (platform === 'android')` or `if (platform === 'electron')` conditionals outside the Platform Implementations layer. Platform differences are abstracted through interfaces (`DatabaseConnection`, `CryptoProvider`, `SecureStorageProvider`, `AuthProvider`).

---

### Rule 13.2: The Domain Layer Is Pure TypeScript

**Imperative:** The `packages/shared/src/domain/` layer must contain zero React imports, zero platform API calls, zero database code, zero Capacitor plugin imports. It is pure TypeScript types and interfaces only.

---

### Rule 13.3: Adding a Category Requires Only `CategoryDefinition`

**Imperative:** Adding a new category (Books, Movies, Games) must require only implementing `CategoryDefinition` and writing the database migration. Zero changes to Application or Renderer core.

---

### Rule 13.4: Renderer Must Never Import Platform-Specific Code

**Imperative:** `packages/renderer/` must never import from `platform/electron/` or `platform/capacitor/`. Platform providers are injected via React context at the app entry point (`apps/electron/` or `apps/capacitor/`), never imported directly by renderer components.

**Why:** The renderer is a shared React UI package that runs identically on Electron (BrowserWindow) and Capacitor (WebView). Direct platform imports would couple the UI to a specific platform, breaking portability.

**Check:** Grep `packages/renderer/src/` for `from 'platform/'` or `from '@capacitor/'` — must produce zero matches.

---

## 14. Platform-Specific Warnings

### Warning 14.1: Android vs Electron — PRAGMA Execution

| Platform          | Method for PRAGMAs | Method for DDL/DML                 |
| ----------------- | ------------------ | ---------------------------------- |
| Capacitor Android | `query()`          | `execute(sql, false)` or `query()` |
| Electron          | `exec()`           | `exec()`                           |

**Do NOT use `execute()` for PRAGMAs on Android.** Wrap in interface abstraction.

---

### Warning 14.2: Android vs Electron — AES-GCM Tag Handling

| Platform                  | Tag Location                         | Decryption Setup                                 |
| ------------------------- | ------------------------------------ | ------------------------------------------------ |
| Capacitor (SubtleCrypto)  | Last 16 bytes of ciphertext output   | Recombine `ciphertext + tag` before decrypt      |
| Electron (Node.js crypto) | Separate — via `cipher.getAuthTag()` | Call `decipher.setAuthTag(tag)` before `final()` |

**Wrap in interface abstraction.**

---

## 15. Electron Rules

### Rule 15.1: Main Process tsconfig `include` Must Exclude Renderer Source

**Imperative:** The `apps/electron/tsconfig.json` `include` array must explicitly list only `src/main.ts` and `src/preload.ts`. Never use `"include": ["src"]` or any glob that would capture `src/renderer.ts`.

**Why:** The Electron app tsconfig targets Node.js (`"lib": ["ES2022"]`, no `"jsx"`, no DOM). The renderer file contains React JSX and DOM APIs that cannot compile under those settings. The renderer is type-checked by Vite's `@vitejs/plugin-react` at build time, not by `tsc`. Including it forces adding DOM libs and JSX to the tsconfig, which removes Node.js-only type safety for `main.ts` — a developer could accidentally use `document.getElementById()` in the main process without a compile error.

**Check:** Inspect `apps/electron/tsconfig.json` — `include` must be `["src/main.ts", "src/preload.ts"]` (or a similarly explicit list excluding renderer).

---

### Rule 15.2: Compute `__dirname` from `import.meta.url` — Never Use Bare `__dirname`

**Imperative:** In every Electron main process file (`main.ts`), compute `__dirname` at the top of the file using `fileURLToPath(import.meta.url)` and `dirname()`. Never reference the bare `__dirname` variable.

**Why:** All workspace packages use `"type": "module"`. CommonJS globals `__dirname` and `__filename` are not defined in ES modules. Bare `__dirname` causes a TypeScript error at compile time and a `ReferenceError` at runtime.

**Pattern:**

```typescript
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

**Check:** Grep `apps/electron/src/` for `__dirname` without a preceding `const __dirname` declaration in the same file. Any bare `__dirname` reference is an error.

---

### Rule 15.3: `contextIsolation: true` and `nodeIntegration: false` Are Mandatory

**Imperative:** Every `BrowserWindow` created in `main.ts` must set `contextIsolation: true` and `nodeIntegration: false` in `webPreferences`. Never deviate from these defaults.

**Why:** These are Electron security defaults since Electron 12. `contextIsolation` prevents prototype pollution attacks by separating the preload script's `window` from the renderer's. `nodeIntegration: false` prevents the renderer from accessing Node.js APIs directly. All communication between main and renderer must go through the context bridge, which is typed and auditable.

**Check:** Inspect `apps/electron/src/main.ts` — every `new BrowserWindow(...)` must have `contextIsolation: true` and `nodeIntegration: false`.

---

### Rule 15.4: Never Install `vite-plugin-electron-renderer` Unless Required

**Imperative:** Do NOT add `vite-plugin-electron-renderer` to `apps/electron/package.json` devDependencies. It is a peer dependency of `vite-plugin-electron` but is not needed unless the renderer needs Node.js API polyfills (`require`, `__dirname`, `fs`).

**Why:** `vite-plugin-electron-renderer` polyfills Node.js built-in modules in the renderer (web) context, enabling `require()` and direct filesystem access from the React UI. This is a security anti-pattern — it bypasses the context bridge, circumvents `contextIsolation`, and contradicts the architecture's security model. If a specific provider implementation needs Node.js APIs, it should be exposed through the context bridge, not polyfilled directly into the renderer.

**Check:** Inspect `apps/electron/package.json` — `vite-plugin-electron-renderer` must not appear in `dependencies` or `devDependencies`.

---

### Rule 15.5: App Packages Never Use `composite: true` or Project References

**Imperative:** `apps/*/tsconfig.json` files must NOT include `"composite": true` or `"references"`. These are leaf packages — no other package depends on them.

**Why:** TypeScript 5.x errors when `composite: true` is combined with `declaration: false` ("Composite projects may not disable declaration emit"). App packages don't emit declarations (consumers, not libraries) and don't need composite mode. `packages/*` retain `composite: true` because they are libraries.

**Check:** Inspect `apps/electron/tsconfig.json` and `apps/capacitor/tsconfig.json` — neither should contain `"composite"` or `"references"`.

---

### Rule 15.6: Never Add Unused Imports to Verify Package Resolution

**Imperative:** Never add an import statement solely to verify that a package resolves and compiles, if the imported binding is never used. `noUnusedLocals: true` rejects this.

**Why:** The E01-T05 spec included `import { contextBridge } from "electron"` in `preload.ts` to verify electron types resolve. The implementation correctly omitted it because `contextBridge` is never used — `tsc --noEmit` would reject it. Verification that types resolve should rely on existing imports in other files (e.g., `main.ts` already imports from `electron`). If no existing file imports from a package, write a one-line test file instead of adding a dead import to production source.

**Check:** Run `tsc --noEmit` in any package being modified. Any "declared but never read" error on an import-only binding is a violation.

---

### Rule 15.7: Every Native Capacitor Plugin Must Be a Direct Dependency of `apps/capacitor/`

**Imperative:** Every Capacitor plugin containing native Android code (identified by the presence of an `android/` subdirectory in the npm package) must be listed in `apps/capacitor/package.json` `dependencies`. Do NOT rely on transitive resolution from workspace packages — `cap sync` only detects plugins declared in the app's own `package.json`.

**Why:** `cap sync` scans the capacitor app's declared dependencies to generate `capacitor.settings.gradle`, which includes each detected plugin's native Android source for Gradle compilation. Plugins declared only in `packages/platform/package.json` are invisible to this scan, even though the hoisted `node_modules/` layout makes their source files physically present at the repository root. Without the Gradle include, the plugin's native Java class is not compiled into the APK, and `registerPlugin()` in `MainActivity.java` fails at runtime with `ClassNotFoundException`.

**Pattern:** After adding a new community Capacitor plugin, add it to BOTH packages:
1. `packages/platform/package.json` — for TypeScript types and JavaScript bridge code
2. `apps/capacitor/package.json` — for `cap sync` native detection

Then run `cap sync` and verify `capacitor.settings.gradle` includes the new plugin.

**Check:** After every `cap sync`, verify that `capacitor.settings.gradle` lists an `include` for every plugin registered in `MainActivity.java`. If a plugin is registered in Java but missing from Gradle, it will fail silently until runtime.

---

_End of Agent Rules_
