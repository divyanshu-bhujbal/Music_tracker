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

### Rule 4.6: Cast Capacitor SQLite Plugin Results to Explicit Interfaces

**Imperative:** When calling `db.execute()` or `db.query()` on a `SQLiteDBConnection` from `@capacitor-community/sqlite`, always cast the result to an explicit interface. Never access properties directly on the raw return type.

**Why:** The plugin's TypeScript declarations return loosely-typed objects. The actual result shape nests change counts under `result.changes.changes` and row data under `result.values`. Accessing properties without casting risks runtime `undefined` errors and provides no type safety.

**Pattern:**

```typescript
interface ExecResult { changes?: { changes?: number; lastId?: number } }
interface QueryResult { values?: Record<string, unknown>[] }

const result = (await db.execute(sql, false)) as ExecResult;
const changeCount = result.changes?.changes ?? 0;

const rows = (await db.query(sql)) as QueryResult;
const values = rows.values ?? [];
```

**Scope:** Capacitor Android only. Electron's `better-sqlite3` results are strongly typed. See PL-09 for detailed evidence.

---

### Rule 4.7: Route Parameterized DML Through `run()` — `execute()` Does Not Accept Parameters

**Imperative:** When `params` is provided and non-empty, route DML calls to `dbConn.run(sql, params, false)`. Only use `dbConn.execute(sql, false)` when `params` is empty or undefined. Never attempt to pass parameters to `execute()` — its signature is `execute(statements: string, transaction?: boolean)` with no parameter array.

**Why:** The Capacitor SQLite plugin exposes two separate mutation methods. `execute()` does not accept parameter values; `run()` does. Passing params to `execute()` silently discards them — the SQL executes with literal `?` in the statement, causing runtime syntax errors. The plugin's loosely-typed `.d.ts` file does not catch this at compile time.

**Pattern:**

```typescript
async execute(sql: string, params?: unknown[]): Promise<void> {
  ensureOpen(this.isOpen);
  validateInput(sql, params);
  if (params && params.length > 0) {
    await this.dbConn!.run(sql, params, false);    // parameterized
  } else {
    await this.dbConn!.execute(sql, false);         // unparameterized
  }
}
```

**Check:** Grep `CapacitorSqliteConnection.ts` for `dbConn.execute(` — every call must pass `false` as second argument and must NOT forward params. If params are present in the calling context, `dbConn.run()` must be used instead. Jest mocks for `@capacitor-community/sqlite` must include both `execute` and `run` as mock methods.

**Scope:** Capacitor Android only. Electron's `better-sqlite3` exposes a single `run()` that handles both parameterized and unparameterized statements.

---

### Rule 4.8: Multi-Row Writes That Must Be Atomic Require `db.transaction()`

**Imperative:** When writing two or more related rows to `app_metadata` (or any table) that must succeed or fail as an atomic unit, use `DatabaseConnection.transaction()`. Never use consecutive `await db.execute()` calls when the writes are logically part of the same operation.

**Why:** Two separate `execute()` calls are not atomic. If the first succeeds and the second fails (database error, process crash, power loss), the database is left in a partially-written state. For cloud sync metadata (`cloud_file_id` + `cloud_modified_time`), a partial write means the stored file ID doesn't match the stored timestamp — the sync engine sees corrupted state and must reconcile it.

**Pattern:**

```typescript
// CORRECT — atomic via transaction callback
await this.db.transaction(async (tx) => {
  await tx.execute('INSERT INTO app_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [fileId]);
  await tx.execute('INSERT INTO app_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [modifiedTime]);
});

// INCORRECT — two separate calls, not atomic
await this.db.execute('INSERT INTO app_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [fileId]);
await this.db.execute('INSERT INTO app_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [modifiedTime]);
```

**Check:** Grep for consecutive `this.db.execute(` calls within the same method. Any pair of writes that are logically part of the same operation (e.g., persisting `cloud_file_id` and `cloud_modified_time` together, or writing a sync event + updating a timestamp) must be wrapped in `this.db.transaction()`. Use the `tx` parameter inside the callback — never call `this.db.execute()` inside a transaction callback.

**Scope:** All platforms. The `transaction()` method is defined on the `DatabaseConnection` interface and works identically on Electron (better-sqlite3) and Capacitor (Android SQLite). It begins a `BEGIN` statement, executes the callback, then commits on success or rolls back on failure.

---

### Rule 4.9: Cloud Delete Must Clear Local Metadata on Every Success Path — Including 404

**Imperative:** When implementing `CloudStorageProvider.delete()`, always clear local `app_metadata` (`cloud_file_id`, `cloud_modified_time`) on EVERY success path — both HTTP 204 (file deleted) AND HTTP 404 (file already deleted). Never skip metadata cleanup on the 404 idempotency path.

**Why:** If the file was deleted externally (e.g., through Google Drive web UI, another device's sync, or a direct API call) before the local sync engine's `delete()` call, the 404 response correctly avoids throwing an error (the delete is idempotent per spec). But the local `DriveMetadataTracker` still holds the stale `cloud_file_id`. On the next sync cycle, the sync engine reads this fileId, attempts to download it, and gets another 404 — wasting an API call and logging a confusing warning. Clearing metadata on 404 prevents this stale-reference loop.

**Pattern:**

```typescript
// CORRECT — clears metadata on both 204 and 404
if (response.status === 404) {
  console.debug('Provider: delete returned 404 (already deleted)');
  await this.driveMetadataTracker.clearCloudFileMetadata();
  return;
}
if (response.status !== 204) {
  throw new CloudStorageError(...);
}
await this.driveMetadataTracker.clearCloudFileMetadata();

// INCORRECT — 404 skips metadata cleanup
if (response.status === 404) {
  return;  // metadata still references deleted file!
}
```

**Check:** Inspect every `delete()` implementation on any `CloudStorageProvider` — every early return path (including 404 idempotency) must call the metadata tracker's `clearCloudFileMetadata()` or equivalent before returning `void`. The 404 path returns void (no error) per the spec's idempotency requirement, but the local state must still be synchronized.

**Scope:** All cloud providers. If a future provider (Dropbox, OneDrive) has different idempotent delete semantics, the same principle applies — if the file is confirmed gone from the cloud, clear the local reference regardless of the HTTP status code.

---

### Rule 4.10: `serialize()` Must Throw With Descriptive Error on Platforms That Cannot Serialize — Never Return Stub Data

**Imperative:** Every class implementing `DatabaseConnection` MUST provide a `serialize(): Promise<Uint8Array>` method. If the underlying platform does not support native database serialization (e.g., Capacitor SQLite plugin has no export-to-bytes API), throw a `DatabaseError` with a descriptive message. Never return stub values (`new Uint8Array(0)`, partial JSON, or nil bytes).

**Why:** The sync engine's merge-copy flow depends on `serialize()` to create byte-exact copies of the database. Returning stub bytes would cause the sync engine to encrypt and upload an empty or corrupted file — silently destroying all synced data. Throwing makes the platform gap explicit and allows the sync engine to catch the error cleanly without corrupting cloud state or touching the live database.

**Pattern:**
```typescript
// CORRECT — acknowledges V1 limitation explicitly
async serialize(): Promise<Uint8Array> {
  throw new DatabaseError(
    'CapacitorSqliteConnection.serialize() is not yet implemented',
  );
}

// INCORRECT — returns stub data that will corrupt cloud state
async serialize(): Promise<Uint8Array> {
  return new Uint8Array(0);  // uploaded = empty encrypted blob → data loss
}
```

**Check:** Verify every `implements DatabaseConnection` class has a `serialize()` method. For Electron, `better-sqlite3.serialize()` returns a `Buffer` — convert to `Uint8Array`. For Capacitor, the method must throw until a JS-level SQLite file writer or plugin enhancement is available. Never let a `serialize()` call silently succeed with invalid data.

**Scope:** All platforms.

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

### Rule 6.6: Electron OAuth Must Receive Redirects via Loopback HTTP Server

**Imperative:** OAuth implementations for Electron must start a temporary local HTTP server on `http://localhost` with a dynamically discovered free port. The redirect URI must be `http://localhost:<port>`. Never use `app.on('open-url')` for OAuth redirect handling on Windows.

**Why:** `app.on('open-url')` is macOS-only (see PL-10 in 06_IMPLEMENTATION_DECISIONS.md). On Windows, it never fires — OAuth flows that depend on it will always time out. The loopback HTTP server approach works identically on Windows, macOS, and Linux without platform-specific code paths.

**Pattern:**
```ts
// 1. Find a free port (helper method)
function findAvailablePort(): Promise<number> {
  const srv = createServer();
  return new Promise((resolve, reject) => {
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      srv.close(() => resolve(typeof addr === 'object' && addr ? addr.port : 0));
    });
    srv.on('error', reject);
  });
}

// 2. Start the callback server with a timeout
const server = createServer((req, res) => {
  const code = new URL(req.url ?? '', `http://localhost:${port}`).searchParams.get('code');
  if (code) {
    res.writeHead(200);
    res.end('Success');
    server.close();
    resolve(code);
  }
});
server.listen(port, '127.0.0.1');

// 3. Build auth URL with http://localhost:<port> as redirect_uri
// 4. Open browser via shell.openExternal(authUrl)
```

**Check:** Grep `packages/platform/src/electron/` for `app.on('open-url'` — must produce zero matches. All Electron OAuth redirects must go through `http://localhost`. Grep for `setAsDefaultProtocolClient` — must NOT be called solely for OAuth redirect handling.

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

**Implementation Note:** The `code_verifier` variable must be declared with `let`, not `const`, to enable reassignment to `null`. Wrap the entire OAuth flow (from code_verifier generation through token persistence) in `try/finally`:
```ts
let codeVerifier: string | null = null;
try {
  codeVerifier = generateCodeVerifier();
  // ... full OAuth flow ...
} finally {
  codeVerifier = null;
}
```
A `const` declaration prevents nullification and violates this rule even if the variable goes out of scope — explicit nullification via `finally` guarantees zero in-memory persistence on all exit paths (success, cancellation, and failure).

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

### Rule 13.5: DI Files Must Load Actual Migration SQL — Never Pass Empty Array

**Imperative:** Both `apps/electron/src/di.ts` and `apps/capacitor/src/di.ts` must load the actual `.sql` migration files and pass them as `Migration[]` to `new MigrationRunner(db, migrations)`. Never pass `[]` (empty array) — the migration system will never execute any migrations.

**Why:** `MigrationRunner` is a platform-agnostic class that receives `Migration[]` from the caller via constructor injection. It does NOT perform file I/O or discover migrations on its own. The DI file is responsible for loading the `.sql` files from `packages/shared/src/data/database/migrations/` and constructing `{ version, sql }` objects. Passing an empty array means no schema tables are ever created, and the database remains at version 0 indefinitely.

**Platform-specific loading:**

| Platform | Mechanism | Location |
|----------|-----------|----------|
| Electron | `readFileSync` via `node:fs` + `fileURLToPath`/`dirname` pattern (Rule 15.2) | `apps/electron/src/di.ts` |
| Capacitor | Vite `?raw` import at build time | `apps/capacitor/src/di.ts` |

**Electron pattern:**
```ts
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../packages/shared/src/data/database/migrations',
);

const MIGRATIONS: Migration[] = [
  { version: 1, sql: readFileSync(join(migrationsDir, '001_core_infrastructure.sql'), 'utf-8') },
  { version: 2, sql: readFileSync(join(migrationsDir, '002_songs_category.sql'), 'utf-8') },
];
```

**Capacitor pattern:**
```ts
import migration001 from '../../../../packages/shared/src/data/database/migrations/001_core_infrastructure.sql?raw';
import migration002 from '../../../../packages/shared/src/data/database/migrations/002_songs_category.sql?raw';
import type { Migration } from '@collectio/shared';

const MIGRATIONS: Migration[] = [
  { version: 1, sql: migration001 },
  { version: 2, sql: migration002 },
];
```

A `raw-modules.d.ts` file must exist in the Capacitor app's `src/` with:
```ts
declare module '*?raw' {
  const content: string;
  export default content;
}
```

**Check:** Inspect both DI files. Verify `new MigrationRunner(db, ...)` is not called with `[]`. When a new migration `.sql` file is added, both DI files must be updated to include the new `{ version, sql }` entry.

---

### Rule 13.6: Use Zustand Stores as a Callback Registry When Shared Modules Need Bidirectional Communication

**Imperative:** When a shared application module (e.g., `SyncEngine`) needs to both push state into a Zustand store AND be called by the store's actions (e.g., `triggerSync()`), use the store as a lightweight callback registry rather than attempting constructor injection of the store into the module or vice versa. The shared module calls `store.getState().setX(this)` during its `initialize()` method. The store's action methods delegate to the registered reference.

**Why:** `SyncEngine` pushes state changes to `useSyncStore` (dirty flag, sync state, error messages) AND the store's `triggerSync()` needs to invoke `SyncEngine.execute()`. This creates a two-way dependency that would cause circular imports if resolved through constructors. Using the store as a registry (a pattern already established by Zustand for external API injection) keeps the store interface stable and avoids circular workspace dependency issues.

**Pattern:**
```typescript
// In the store:
interface SyncStoreState {
  _syncEngineRef: unknown;  // avoids importing engine type
  setSyncEngine: (engine: unknown) => void;
  triggerSync: () => void;
}

setSyncEngine: (engine: unknown) => {
  set({ _syncEngineRef: engine });
},

triggerSync: () => {
  const state = get();
  if (state.syncState === 'SYNCING') return;
  set({ syncState: 'SYNCING', errorMessage: null });
  if (state._syncEngineRef) {
    (state._syncEngineRef as { execute: () => void }).execute();
  }
},

// In the engine's initialize():
useSyncStore.getState().setSyncEngine(this);
```

**Check:** Any shared module + Zustand store pair that needs bidirectional communication should follow this pattern. Do NOT pass the store into the module's constructor (creates circular build dependencies). Do NOT pass the module into `create<State>()` (the store is a module-level singleton and should not capture uninitialized references). The `_` prefix on `_syncEngineRef` indicates a private implementation detail not intended for direct consumer access.

**Scope:** Any shared application module + Zustand store pair within `packages/shared/src/`. This pattern is established by `SyncEngine` + `useSyncStore`.

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

### Rule 15.2: Compute `__dirname` from `import.meta.url` — Never Use `import.meta.dirname` or Bare `__dirname`

**Imperative:** In every file that runs in the Electron main process (including `main.ts`, platform package `electron/` files, and any main-process workers), compute `__dirname` at the top of the file using `fileURLToPath(import.meta.url)` and `dirname()`. Never use `import.meta.dirname` or bare `__dirname` — Electron 30.5.1 bundles Node 20.16.0, which lacks both.

**Why:** All workspace packages use `"type": "module"`. CommonJS globals `__dirname` and `__filename` are not defined. `import.meta.dirname` was added in Node.js 21.2 (backported to 20.18+) but Electron 30.5.1 bundles Node 20.16.0, which predates the backport. Using `import.meta.dirname` causes a runtime `ReferenceError`. The only safe pattern is `fileURLToPath(import.meta.url)` + `dirname()`.

**Pattern:**

```typescript
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

**Check:** Grep the codebase for `import.meta.dirname` — must produce zero matches. Grep `apps/electron/src/` and `packages/platform/src/electron/` for `__dirname` without a preceding `const __dirname` declaration in the same file. Any bare `__dirname` reference or `import.meta.dirname` usage is an error.

---

### Rule 15.2b: Electron Main Process Targets Node 20.16.0 — ES2024+ APIs Prohibited

**Imperative:** Code in `apps/electron/src/` and `packages/platform/src/electron/` must use only APIs available in Node 20.16.0 (Electron 30.5.1's bundled runtime). ES2024+ features are prohibited. The developer's system Node version is irrelevant for runtime availability.

**Why:** The developer's system Node.js version (e.g., Node 24) is used for CI, pnpm, and development tooling. Electron runs its own bundled Node — Electron 30.5.1 bundles Node 20.16.0. `tsc` and ESLint check against the system's `@types/node`, which may declare APIs unavailable in Electron's bundled Node. Code that passes type-checking may crash at runtime.

**Banned in Electron main-process files (Node 20.16.0 does NOT have these):**

| API | Available Since | Status |
|-----|----------------|--------|
| `import.meta.dirname` | Node 20.18 | ❌ NOT AVAILABLE |
| `import.meta.filename` | Node 20.18 | ❌ NOT AVAILABLE |
| `Object.groupBy` | Node 21 | ❌ NOT AVAILABLE |
| `Map.groupBy` | Node 21 | ❌ NOT AVAILABLE |
| `Array.fromAsync` | Node 21 | ❌ NOT AVAILABLE |
| `Promise.withResolvers` | Node 22 | ❌ NOT AVAILABLE |
| `Float16Array` | Node 22 | ❌ NOT AVAILABLE |

**Allowed in Electron main-process files (Node 20.16.0 has these):**

| API | Available Since |
|-----|----------------|
| `fileURLToPath + dirname()` | Node 12 |
| `process.version`, `process.versions` | Node 0.x |
| `createRequire(import.meta.url)` | Node 12.2 |
| `fetch` (global) | Node 18 |
| `crypto.subtle` | Node 20 (stable) |
| `String.prototype.isWellFormed` | Node 20.1 |
| `AbortSignal.timeout()` | Node 17.3 |

**Check:** Run `npm view electron@<version> --json` and inspect `_nodeVersion` to confirm the bundled Node version before using any Node API in main-process files. The `lib: ["ES2022"]` in the electron tsconfig already prevents ES2023+ type usage, but runtime-only APIs bypass type checks.

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

### Rule 15.8: Never Use `app.on('open-url')` for Deep Linking or OAuth on Windows

**Imperative:** Code in `apps/electron/src/` and `packages/platform/src/electron/` must never use `app.on('open-url')` for receiving deep links, protocol redirects, or OAuth callbacks. This event is macOS-only and will never fire on Windows. Use the loopback HTTP server approach for OAuth (Rule 6.6).

**Why:** `open-url` is documented by Electron as a macOS-only event. On Windows, deep link/protocol activation goes through `process.argv` (new process) or `app.on('second-instance')` (single instance lock). Using `open-url` on Windows will silently fail — the handler never fires and any awaiting Promise times out.

**Approved alternatives for Windows:**

| Use Case | Correct Approach |
|----------|-----------------|
| OAuth redirect | Loopback HTTP server on `http://localhost:<random_port>` (Rule 6.6) |
| Custom protocol deep link (if needed) | `app.requestSingleInstanceLock()` + `app.on('second-instance', (event, commandLine) => {...})` |
| App launch with protocol URL | Parse `process.argv` for protocol scheme on startup |

**Check:** Grep `packages/platform/src/electron/` and `apps/electron/src/` for `open-url` — must produce zero matches. Any `app.on(` call with a string starting with `open-` is a violation.

**Scope:** Windows (Electron). macOS: `open-url` works as documented. If code must support both platforms, use the loopback approach (works everywhere) or guard `open-url` behind a platform check with a Windows-specific fallback. The loopback approach is preferred.

---

## 16. Testing Rules

### Rule 16.1: Mock Delay Methods Directly for Rejection-Based Retry Tests — Avoid Fake Timers for Exhaustion Scenarios

**Imperative:** When writing Jest tests for retry exhaustion (where max retries are reached and the operation rejects), mock the delay/sleep method directly by replacing it on the instance (`(provider as any).sleep = jest.fn().mockResolvedValue()`). Do NOT use `jest.useFakeTimers()` + `jest.runAllTimersAsync()` for tests where the promise is expected to reject. Fake timers may be used only for retry tests where the operation eventually SUCCEEDS (resolves after N retries).

**Why:** `jest.useFakeTimers()` with `jest.runAllTimersAsync()` incorrectly propagates promise rejections in deeply nested async/await chains within `setTimeout` callbacks in Jest 29. When the error is thrown inside a timer callback after max retries, the rejection is not properly attached to the outer promise's rejection handler — `expect().rejects` cannot catch it, and the test either times out (10+ seconds) or reports the error as an unhandled rejection. Mocking `sleep()` to return `Promise.resolve()` eliminates the `setTimeout` entirely, allowing the retry loop to execute synchronously and the rejection to propagate normally through the promise chain.

**Pattern:**

```typescript
// CORRECT — exhaustion tests (operation REJECTS after max retries)
it('throws RATE_LIMITED after 429 retries exhausted', async () => {
  global.fetch = jest.fn().mockResolvedValue({ status: 429, headers: mockHeaders() });
  (provider as any).sleep = jest.fn().mockResolvedValue(undefined);

  await expect(provider.upload(data, 'db')).rejects.toMatchObject({
    code: 'RATE_LIMITED',
  });
  expect(global.fetch).toHaveBeenCalledTimes(6); // 1 initial + 5 retries
}, 10000);

// OK — success tests (operation RESOLVES after retries)
it('retries on 429 then succeeds', async () => {
  jest.useFakeTimers();
  jest.spyOn(Math, 'random').mockReturnValue(0.5); // neutralize jitter

  // mock fetch: 429 × N, then 200
  const uploadPromise = provider.upload(data, 'db');
  await jest.runAllTimersAsync();

  const result = await uploadPromise;
  expect(result.fileId).toBe('f1');
});
```

**Check:** Search test files for the combination of `jest.useFakeTimers()` + `rejects` — any test that expects the operation to reject after max retries should use the sleep-mock pattern instead of fake timers. Mock cleanup is automatic: `beforeEach` recreates the provider instance from fresh mocks, resetting any instance-level method overrides.

**Scope:** All Jest tests using fake timers with internally-rejecting async operations. This applies to any class that uses `setTimeout`-based backoff internally (e.g., `TokenRefresher`, future `SyncEngine`, future `NetworkMonitor`). The `Math.random` spying pattern (to neutralize jitter) should also be used for success-path retry tests to avoid timing flakiness.

---

### Rule 16.2: Snapshot Database State Before and After Operations That Must Not Modify the Database

**Imperative:** When writing tests that verify an operation did NOT modify the database (upload failure rollback, aborted sync, lock-busy short-circuit), always snapshot the relevant state BEFORE the operation and assert structural equality AFTER. Use `JSON.stringify()` on the data structures or Jest's `.toEqual()` for structural comparison. Do not rely solely on checking `result.success === false` or verifying that a log entry was created — these do not prove the database was untouched.

**Why:** Tests that only check the return value or log state do not verify the core data integrity guarantee: that the live database is unchanged. A bug that partially modifies the database but correctly reports failure would pass a weak test. Snapshots catch partial writes, leftover INSERT/UPDATE/DELETE mutations, and unexpected metadata changes — all of which are silent correctness bugs.

**Pattern:**
```typescript
// CORRECT — verifies live DB truly unchanged
const songsBefore = JSON.stringify(db._tables.get('songs') ?? []);
const metadataBefore = JSON.stringify(Array.from(db._metadata.entries()));

const result = await engine.execute();

expect(result.success).toBe(false);
expect(JSON.stringify(db._tables.get('songs') ?? [])).toBe(songsBefore);
expect(JSON.stringify(Array.from(db._metadata.entries()))).toBe(metadataBefore);

// WEAK — only checks result flag, not actual DB state
expect(result.success).toBe(false);
expect(syncLogMarkedAsFailure).toBeDefined();
```

**Check:** Any test named "failure → live DB unchanged" or "abort → live DB unchanged" or containing "revert" or "rollback" in its description must contain a pre/post state comparison. Grep test file names containing "unchanged" or "revert" — every match must have a snapshot assertion. For mock-based tests like `SyncEngine.test.ts`, snapshot the mock's `_tables` and `_metadata` maps before and after.

**Scope:** All Jest test suites that verify "no side effects on failure" behavior for database-modifying operations.

---

### Rule 16.3: Mock `@tanstack/react-virtual` in JSDOM Tests — `useVirtualizer` Returns Empty Items Without DOM Measurements

**Imperative:** Every component test that renders a virtualized table MUST mock `@tanstack/react-virtual`'s `useVirtualizer` via `jest.mock()`. The mock must return all items as visible (each at the estimated size) because JSDOM lacks `ResizeObserver` and `getBoundingClientRect` — without these, the real `useVirtualizer` sees a zero-dimension scroll container and returns zero visible items. Never attempt to use the real `useVirtualizer` in a Jest/JSDOM test.

**Why:** JSDOM does not support:
1. `ResizeObserver` — required for `measureElement` to detect dynamic row heights; silently throws in JSDOM
2. Proper `getBoundingClientRect()` — always returns `{ width: 0, height: 0, top: 0, left: 0, ... }` unless explicitly mocked per-element
3. Scroll event propagation — the virtualizer's `getScrollElement` callback returns a valid element, but its `scrollTop`, `clientHeight`, and `offsetHeight` are all `0`

With all measurements at zero, the virtualizer calculates that zero items fit in the viewport, and `getVirtualItems()` returns `[]`. The component renders an empty body — text content, buttons, and all user-facing elements are absent from the DOM. Any test that calls `screen.getByText()` or `screen.getByRole()` on data that should be rendered by virtual rows will fail.

**Pattern (established in `TrashScreen.test.tsx`):**

```typescript
jest.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: jest.fn().mockImplementation(({ count, estimateSize }: {
    count: number;
    estimateSize: () => number;
  }) => {
    const size = estimateSize();
    const items = Array.from({ length: count }, (_, i) => ({
      index: i,
      start: i * size,
      size,
      key: i,
      measureElement: jest.fn(),
    }));
    return {
      getVirtualItems: () => items,   // all items visible
      getTotalSize: () => count * size,
      measureElement: jest.fn(),
      scrollToIndex: jest.fn(),
    };
  }),
}));
```

**Key details:**
- `estimateSize: () => 48` (the production row height) — each item's `start` is `i * 48`, total size is `count * 48`
- `getVirtualItems()` returns ALL items, not just the ones that would be in viewport — this is a JSDOM approximation; real browser tests (Playwright) must verify actual scroll behavior
- `measureElement` is a no-op `jest.fn()` — in production it's a callback ref; in JSDOM it does nothing since there are no real DOM measurements
- `scrollToIndex` is a no-op `jest.fn()` — scroll behavior is not testable in JSDOM
- The `overscan` parameter from the production `useVirtualizer` call does NOT need to appear in the mock signature — JSDOM doesn't have a scroll viewport, so overscan is meaningless

**What the mock can test:**
- Content rendering: text, buttons, and data appear in the DOM
- User interactions: clicks, input changes, state transitions
- Edge cases: loading, empty, error states
- Column alignment: since rows use `display: grid` with fixed `gridTemplateColumns`, alignment is deterministic and does not depend on DOM measurements

**What the mock CANNOT test:**
- Scroll performance with large datasets
- Dynamic row height measurement via `measureElement`
- The `overscan` behavior (pre-rendering rows just outside the viewport)
- Actual visible vs. hidden rows based on scroll position

For scroll-behavior and performance testing, use Playwright E2E tests (E16) on a real browser or Electron `BrowserWindow`.

**Check:** After implementing any new virtualized table component, its test file must contain `jest.mock('@tanstack/react-virtual', ...)`. Run the tests — if `screen.getByText()` or `screen.getByRole()` fails to find content that should be rendered by virtual rows, verify the mock is present and returns `getVirtualItems()` with proper items.

**Scope:** All Jest/JSDOM test files that render components using `useVirtualizer` from `@tanstack/react-virtual`. This applies to every virtualized table: `TrashScreen`, future `TableView`, future category tables.

---

### Rule 16.4: When Testing Components That Internally Create `BrowserRouter`/`HashRouter`, Use a Partial `jest.mock` of `react-router-dom` with Passthrough Router Wrappers

**Imperative:** When a component under test (e.g., `AppRouter`) internally renders its own `<BrowserRouter>` or `<HashRouter>`, you MUST use a partial `jest.mock('react-router-dom', ...)` that replaces only the Router components with passthrough div wrappers bearing `data-testid` attributes, while spreading `jest.requireActual('react-router-dom')` to preserve all other exports (`Routes`, `Route`, `Outlet`, `Navigate`, `MemoryRouter`). Wrap the test render in `<MemoryRouter>` from the mock's spread exports to provide routing context.

**Why:** `BrowserRouter` and `HashRouter` each create an independent routing context. Wrapping a component that internally renders one of these in an outer `<MemoryRouter>` has no effect — the inner Router's context shadows the outer one. You cannot control the URL or history for the inner routes. Replacing the Router components with transparent wrappers lets `MemoryRouter` provide the single routing context for the entire tree, enabling full control over initial URL (`initialEntries`), navigation, and route matching in tests.

Without this partial mock, every route test would need to manipulate `window.location` directly (for `BrowserRouter`) or `window.location.hash` (for `HashRouter`) before rendering — fragile, racy, and unportable across JSDOM versions. The `MemoryRouter` approach avoids all platform-specific URL manipulation.

**Pattern (established in `AppRouter.test.tsx`):**

```typescript
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRouter } from '../AppRouter.js';

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    BrowserRouter: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="browser-router">{children}</div>
    ),
    HashRouter: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="hash-router">{children}</div>
    ),
  };
});

// The testid wrappers serve dual purpose:
// 1. They make Router children accessible to the outer MemoryRouter
// 2. They allow verifying which Router type was selected (browser vs hash)

function renderRouter(initialEntries: string[], routerType?: 'browser' | 'hash') {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AppRouter routerType={routerType} />
    </MemoryRouter>,
  );
}

// Authenticated route tests
it('RT-02: /songs route renders CategoryScreen', () => {
  useAuthStore.setState({ isAuthenticated: true });
  renderRouter(['/songs']);
  expect(screen.getByTestId('category-screen')).toBeInTheDocument();
});

// Router type test — verify which passthrough wrapper was used
it('RT-12: routerType="browser" uses BrowserRouter', () => {
  renderRouter(['/songs'], 'browser');
  expect(screen.getByTestId('browser-router')).toBeInTheDocument();
  expect(screen.queryByTestId('hash-router')).not.toBeInTheDocument();
});
```

**Key details:**
- `jest.requireActual('react-router-dom')` returns the real module — all routing primitives (`Routes`, `Route`, `Outlet`, `Navigate`, `MemoryRouter`) are preserved unchanged
- Only `BrowserRouter` and `HashRouter` are replaced — these are the components that create new routing contexts
- The passthrough wrappers accept `children` and render them unmodified — no router context is created, no history is instantiated
- `data-testid` attributes on the wrappers allow tests to verify which router type the component selected based on its props
- Child screen/component modules (`MainLayout`, `CategoryScreen`, `TrashScreen`, etc.) must ALSO be mocked to avoid pulling in their heavy dependency trees (see the `AppRouter.test.tsx` for the full mock matrix)
- `MainLayout`'s mock must render `<Outlet />` from the actual `react-router-dom` so that nested child routes render correctly — use `jest.requireActual('react-router-dom')` within the mock factory to access `Outlet`

**What this pattern enables:**
- Testing conditional auth routing (authenticated vs. unauthenticated route trees)
- Testing route-to-component mapping (which component renders for which URL)
- Testing catch-all redirects (unknown URL → `/songs` or `/setup`)
- Testing router type selection based on props
- All tests run in JSDOM without any `window.location` manipulation

**What this pattern does NOT cover:**
- Actual `BrowserRouter`/`HashRouter` behavior (pushState vs. hash — JSDOM has no real navigation, so this must be verified in Playwright E2E tests)
- Real `<MainLayout>`, `<CategoryScreen>`, `<TrashScreen>`, etc. (they are mocked — their behavior must be tested in their own isolated test files)
- History back/forward navigation (AC-10 — requires a real browser; use Playwright for this)

**Check:** Any new test file that renders a component containing `<BrowserRouter>` or `<HashRouter>` must include this partial mock. If `screen.getByTestId()` fails to find content that should be rendered by routes, verify that the Router mock is present and the outer `<MemoryRouter>` provides proper `initialEntries`.

**Scope:** All Jest/JSDOM test files that render `AppRouter` or any future component that creates its own `BrowserRouter`/`HashRouter`. This applies to integration tests of the routing layer, router-type selection tests, and any test that needs to verify route behavior without real browser navigation.

---

### Rule 16.5: Wrap Captured `navigate()` Callbacks in `act()` When Testing Back Button Navigation

**Imperative:** When a test captures the callback passed to `PlatformAdapter.onBackButton()` (or any callback that invokes `useNavigate()`) and calls it outside React's event system, wrap the invocation in `act()` from `@testing-library/react`. The `navigate(-1)` call triggers a synchronous React Router state update that JSDOM requires `act()` to fully flush before assertions.

**Why:** The `BackButtonHandler` component registers `() => navigate(-1)` as the back button callback via `platform.onBackButton()`. In a test, this callback is captured by mocking `onBackButton` to store the argument. When the test invokes the captured callback directly, React Router's internal `setStateImpl` fires synchronously but React Testing Library's renderer has not batched the update. Without `act()`, the DOM does not reflect the new route location, and `screen.getByTestId('trash-screen')` (or any assertion on the post-navigation state) fails — the DOM still shows the pre-navigation component.

**Pattern:**
```typescript
let backCallback: (() => void) | null = null;
const onBackButton = jest.fn().mockImplementation((cb: () => void) => {
  backCallback = cb;
  return jest.fn(); // unsubscribe
});

renderRouter(['/trash', '/songs'], 'hash', { hasBackButton: true, onBackButton });
expect(screen.getByTestId('category-screen')).toBeInTheDocument();

// CORRECT — act() wrapping
act(() => {
  backCallback!();
});
expect(screen.getByTestId('trash-screen')).toBeInTheDocument();

// INCORRECT — no act(), DOM stale after navigate(-1)
backCallback!();
expect(screen.getByTestId('trash-screen')).toBeInTheDocument(); // FAILS
```

**Check:** Any test that captures a function from a mocked adapter/context and invokes it outside a `fireEvent` or `userEvent` call must wrap the invocation in `act()`. This applies to `PlatformAdapter.onBackButton()`, `PlatformAdapter.onKeyboardShortcut()`, and any future adapter callback registration methods.

**Scope:** All Jest/JSDOM test files that test components using `PlatformAdapter` callback registration methods that trigger React state updates (navigation, store mutations, state changes). This specifically applies to `AppRouter.test.tsx` back button tests and any future test for keyboard shortcut callbacks or context menu action dispatch.

---

### Rule 16.6: MUI `sx` Prop CSS Values Require Playwright E2E — JSDOM Cannot Verify Visual Platform Adaptations

**Imperative:** Jest/JSDOM tests for components that apply platform-conditional CSS via MUI's `sx` prop (safe area insets, hover effects, touch target sizing, column width scaling) must limit assertions to: (1) the component renders without crashing under each platform configuration, (2) structural DOM elements exist (data-testid, aria-label), (3) MUI-generated CSS class names are present on elements. Never assert computed CSS property values (`toHaveStyle`, `getComputedStyle`, inline `style` attributes) for `sx` prop styles — these are compiled to Emotion CSS classes, not inline styles, and JSDOM cannot resolve them.

**Why:** MUI's `sx` prop compiles to Emotion-generated CSS class names injected into a `<style>` tag. JSDOM lacks a CSSOM that can: (1) parse dynamically injected `<style>` tags, (2) resolve class-based styles to computed property values. Additionally, JSDOM's `getBoundingClientRect` always returns zeros unless explicitly mocked per-element. Assertions like `expect(element).toHaveStyle('padding-top: env(safe-area-inset-top)')` always fail even when the production CSS is correct.

**What JSDOM tests CAN assert:**
- Component renders without crash under `supportsHover: true` and `supportsHover: false`
- Component renders without crash under `touchTargetSize: 48` and `touchTargetSize: 0`
- Component renders without crash under `usesSafeAreaInsets: true` and `usesSafeAreaInsets: false`
- Structural elements: root Box, cards, rows, header cells exist in the DOM
- Data content: text labels, song names, artist names appear correctly
- MUI class attributes are generated on elements (verifying `sx` was processed)

**What requires Playwright E2E (E-16):**
- Actual padding/margin from `env(safe-area-inset-*)` CSS constants
- Actual hover background color change on row mouseover
- Actual `minHeight: 48px` rendering on cards
- Actual column width from `columnWidthScale: 1.3` multiplier
- Scroll behavior with virtualized rows

**Pattern:**
```typescript
// CORRECT — structural + crash-free verification
it('ML-PLAT-01: safe area padding applied when usesSafeAreaInsets=true', () => {
  const { container } = renderWithProvider(<MainLayout />, { usesSafeAreaInsets: true });
  const root = container.firstChild as HTMLElement;
  expect(root).toBeDefined();
  expect(root).toBeInTheDocument();
  const rootClass = root.getAttribute('class') ?? '';
  expect(rootClass).toBeTruthy(); // MUI class was generated
});

// INCORRECT — JSDOM cannot resolve this
expect(root).toHaveStyle('padding-top: env(safe-area-inset-top, 0px)'); // always fails
```

**Check:** If a test for a component with platform-conditional `sx` props contains `toHaveStyle(...)`, verify that the style assertion is for an inline style (set via `style={{...}}`), not an `sx` prop. If it's for `sx`, replace with structural assertions and add a Playwright E2E test to the E-16 plan.

**Scope:** All Jest/JSDOM tests for components using `usePlatformAdapter()` and applying conditional `sx` props based on platform capability flags. This includes `MainLayout`, `TableView`, `TileView`, and any future component with platform-conditional visual styling via MUI.

---

### Rule 9.7: Vite `?raw` Import Path from Capacitor App to Shared Package Is Exactly 3 Directory Levels

**Imperative:** When using Vite's `?raw` import in `apps/capacitor/src/` to inline file content from `packages/shared/`, use exactly `../../../packages/shared/...` — 3 levels up to the repository root. Using 4 levels (`../../../../`) resolves outside the project and fails the build. The Electron app does not use `?raw` imports; it uses `node:fs` at runtime (Rule 13.5).

**Why:** The Capacitor `di.ts` at `apps/capacitor/src/di.ts` needs to import SQL migration file content at build time. The directory traversal:
- `..` → `apps/capacitor/`
- `../..` → `apps/`
- `../../..` → repository root
- `../../../packages/shared/src/data/database/migrations/001_core_infrastructure.sql` — correct
- `../../../../packages/...` → one level ABOVE repo root — Vite rejects this path

Vite's `?raw` import suffix tells the bundler to read the file and export its contents as a string. This happens at build time, so the path must be statically resolvable.

**Pattern:**
```typescript
// CORRECT — 3 levels from apps/capacitor/src/ to repo root
import migration001Sql from '../../../packages/shared/src/data/database/migrations/001_core_infrastructure.sql?raw';

// INCORRECT — 4 levels resolves outside the project
import migration001Sql from '../../../../packages/shared/src/data/database/migrations/001_core_infrastructure.sql?raw';
```

**Check:** After adding a new migration `.sql` file and importing it in `apps/capacitor/src/di.ts`, run `pnpm build:capacitor`. If the build fails with "Could not resolve .../migrations/...sql?raw", verify the path depth — count `../` segments from `apps/capacitor/src/` to the repository root (should be exactly 3).

**Scope:** All `?raw` imports in `apps/capacitor/src/`. This does not apply to `apps/electron/` (uses `node:fs` + platform-relative path resolution) or `packages/` (no `?raw` imports in library packages).

---

_End of Agent Rules_
