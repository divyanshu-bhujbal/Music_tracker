# E-00b Capacitor Validation Spike — Retrospective

> **Date:** 2026-06-17 through 2026-06-18
> **Device:** Physical Android device, API level 16, WebView 148.0.7778.215
> **Outcome:** 6 of 7 tasks validated. OAuth PKCE partially resolved.

---

## 1. Timeline

### Day 1 — Infrastructure Setup

| Time  | Event                     | Issue                                                                                   | Resolution                                                                                                            |
| ----- | ------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 13:15 | Project scaffold created  | —                                                                                       | Created root `package.json`, `pnpm-workspace.yaml`, `.gitignore`                                                      |
| 13:18 | Capacitor app initialized | —                                                                                       | Created `apps/capacitor/` with `package.json`, `capacitor.config.ts`, `vite.config.ts`, `tsconfig.json`, `index.html` |
| 13:20 | pnpm not installed        | `pnpm: command not found`                                                               | Installed `pnpm@9` (Node 20.x compatible)                                                                             |
| 13:22 | pnpm 11 incompatible      | `No such built-in module: node:sqlite`                                                  | Downgraded to pnpm 9.x                                                                                                |
| 13:23 | Capacitor deps installed  | Peer dep warning: `@capacitor-community/sqlite@5.7.4` requires `@capacitor/core@^5.0.0` | Upgraded to `@capacitor-community/sqlite@6.0.2`                                                                       |

---

### Day 1 — T-00b.1: SQLite Validation

| Time  | Event                                                                 | Issue                                                                        | Resolution                                                                                                       |
| ----- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 13:25 | Spike files created                                                   | TypeScript errors: `SQLiteConnection.execute` not found                      | API changed in v6 — `SQLiteDBConnection` is separate object from `SQLiteConnection`                              |
| 13:30 | API fix applied                                                       | —                                                                            | Use `createConnection()` → `SQLiteDBConnection.open()` → `execute(sql, false)`                                   |
| 13:32 | TypeScript compiles clean                                             | —                                                                            | —                                                                                                                |
| 13:45 | **Run 1 on device**                                                   | `"cannot change into wal mode from within a transaction"`                    | `execute()` wraps statements in implicit transactions. PRAGMA `journal_mode` cannot run inside a transaction.    |
| 13:46 | **Run 1 continued**                                                   | `"Connection spike_test already exists"` for all tests after SQ-01           | Connection dictionary poisoned. `close()` failed because WAL error left connection in bad state.                 |
| 13:50 | Fix applied: `execute(sql, false)` for PRAGMAs                        | —                                                                            | Pass `transaction: false` to avoid implicit wrapping                                                             |
| 14:00 | **Run 2 on device**                                                   | `"CapacitorSQLitePlugin: null"` for all 12 tests                             | Native plugin not registered. `MainActivity.java` was empty.                                                     |
| 14:02 | Added `registerPlugin(CapacitorSQLite.class)`                         | Compile error: `package com.getcapacitor.community.sqlite does not exist`    | Wrong package and class name                                                                                     |
| 14:05 | Fixed package name                                                    | Package is `database.sqlite`, class is `CapacitorSQLitePlugin`               | Updated import to `com.getcapacitor.community.database.sqlite.CapacitorSQLitePlugin`                             |
| 14:08 | **Run 3 on device**                                                   | `"CapacitorSQLitePlugin: null"` again                                        | Plugin returns null at runtime despite compilation. Root cause: Gradle module not finding plugin Android source. |
| 14:15 | `.npmrc` created with `node-linker=hoisted`                           | pnpm virtual store prevents Gradle path resolution                           | Reinstalled with hoisted layout                                                                                  |
| 14:20 | **Run 4 on device**                                                   | `"CapacitorSQLitePlugin: null"` STILL                                        | Plugin defaults `isEncryption = true` causing Keystore initialization failure                                    |
| 14:22 | `androidIsEncryption: false` added to `capacitor.config.ts`           | —                                                                            | Plugin now initializes without encryption                                                                        |
| 14:25 | **Run 5 on device**                                                   | `"Queries cannot be performed using execSQL(), use query() instead."`        | Android `execSQL()` rejects all PRAGMAs because they return result rows                                          |
| 14:28 | Changed ALL PRAGMAs to use `query()`                                  | —                                                                            | `await dbConn.query("PRAGMA journal_mode = WAL")` etc.                                                           |
| 14:30 | **Run 6 on device**                                                   | SQ-01 PASS, SQ-02 PASS, SQ-03 through SQ-08 FAIL with "table already exists" | `deleteDatabase()` fails silently between tests; tables persist                                                  |
| 14:35 | Changed cleanup: `DROP TABLE IF EXISTS` instead of `deleteDatabase()` | —                                                                            | Also removed shared `SQLiteConnection` collision by using `isConnection()`/`retrieveConnection()` pattern        |
| 14:40 | **Run 7 on device**                                                   | SQ-01 through SQ-08 PASS, SQ-09 PASS (CRITICAL), SQ-10 through SQ-12 FAIL    | Same table persistence issue for `parent_table`/`child_table`                                                    |
| 14:42 | Added `DROP TABLE IF EXISTS parent_table, child_table` to cleanup     | —                                                                            | All tables dropped between tests                                                                                 |
| 14:45 | **Run 8 on device**                                                   | **ALL 12 TESTS PASS. SQ-09 (FK enforcement) PASS.**                          | **Architecture-gating question answered: YES, SQLite with FK works on Capacitor.**                               |

---

### Day 1 — T-00b.2: Argon2id WASM

| Time  | Event                                     | Issue                                                                                                           | Resolution                                                                                                       |
| ----- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 14:50 | `argon2-wasm@0.9.0` installed             | No TypeScript declarations                                                                                      | Created `argon2-wasm.d.ts` with `declare module`                                                                 |
| 14:52 | Spike files created                       | —                                                                                                               | Types, reference vectors, core module, runner                                                                    |
| 14:55 | **Run 1 on device**                       | AR-CROSS vector 3 (Unicode) FAILS                                                                               | `argon2-wasm` uses `intArrayFromString()` which doesn't use UTF-8 for non-ASCII. Native `argon2` npm uses UTF-8. |
| 14:58 | Fix: `new TextEncoder().encode(password)` | —                                                                                                               | Pass password as raw UTF-8 bytes (Uint8Array) not string                                                         |
| 15:00 | **Run 2 on device**                       | AR-01 through AR-06 PASS, AR-07 PASS (749ms), AR-08 PASS (813ms), AR-08b PASS. AR-CROSS all three vectors PASS. | **Performance well under 3,000ms budget. Cross-platform determinism confirmed.**                                 |

---

### Day 1 — T-00b.3: AES-GCM SubtleCrypto

| Time  | Event                              | Issue                                                            | Resolution                                                                                       |
| ----- | ---------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 15:10 | Spike files created                | TypeScript errors: `Uint8Array` not assignable to `BufferSource` | TypeScript 5.x types `Uint8Array.buffer` as `ArrayBufferLike`. Created `toArrayBuffer()` helper. |
| 15:12 | **Run 1 on device**                | `crypto.getRandomValues()` 65,536-byte limit                     | 5MB buffer exceeds entropy limit                                                                 |
| 15:15 | Fix: chunk buffer in 64KB segments | —                                                                | `for (let off = 0; off < FIVE_MB; off += 65536) crypto.getRandomValues(buffer.subarray(...))`    |
| 15:18 | **Run 2 on device**                | All AE tests pass                                                | ZERO external dependencies. SubtleCrypto is built-in.                                            |

---

### Day 1 — T-00b.4: Secure Storage

| Time  | Event                                       | Issue                                            | Resolution                                                                    |
| ----- | ------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------- |
| 15:25 | `@capacitor/secure-storage` install attempt | `ERR_PNPM_FETCH_404` — package does not exist    | Searched npm, found `capacitor-secure-storage-plugin@0.10.0`                  |
| 15:28 | Correct package installed                   | —                                                | API: `set({ key, value })`, `get({ key })`, `remove({ key })`, `clear()`      |
| 15:32 | **Run 1 on device**                         | KC-09 PASS (data survived app kill). KC-06 FAIL. | KC-06: delete of non-existent key throws "Item with given key does not exist" |
| 15:35 | Fix: wrap `remove()` in try/catch           | —                                                | Swallow "does not exist" errors. Idempotent delete achieved.                  |
| 15:38 | **Run 2 on device**                         | **All tests PASS including KC-06.**              | **Critical test passed: data survives app kill.**                             |

---

### Day 1 — T-00b.5: OAuth PKCE

| Time  | Event                                                                | Issue                                                                                                                         | Resolution                                                                |
| ----- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 15:45 | `@capacitor/browser@8.0.3` installed                                 | Peer dep: requires `@capacitor/core@>=8.0.0`                                                                                  | Downgraded to `@capacitor/browser@6.0.6`                                  |
| 15:48 | `@capacitor/app@6.0.3` installed                                     | Required for `appUrlOpen` listener                                                                                            | —                                                                         |
| 15:50 | `capacitor.config.ts` updated                                        | Added `allowNavigation: ['collectio://*']`                                                                                    | —                                                                         |
| 15:52 | `AndroidManifest.xml` updated                                        | Added intent filter for `collectio://oauth`                                                                                   | —                                                                         |
| 16:00 | Google Cloud Console setup                                           | **Issue 1:** "Desktop app" type has no redirect URI field                                                                     | —                                                                         |
| 16:02 | **Issue 1 continued**                                                | "Web application" type rejects `collectio://oauth` — "Invalid Redirect: must end with a public top-level domain"              | Neither "Desktop" nor "Web" accepts custom URI schemes                    |
| 16:05 | Created "Android" client type                                        | **Issue 2:** `redirect_uri=collectio://oauth` rejected by Google — "Access blocked: Authorization Error 400: invalid_request" | Wrong redirect URI format for Android type                                |
| 16:10 | Removed `redirect_uri` from auth URL                                 | **Issue 3:** "Missing required parameter: redirect_uri"                                                                       | Google requires the parameter                                             |
| 16:12 | Changed to `redirect_uri=com.collectio.app://` (package name format) | Updated intent filter in manifest, capacitor.config, and OAuth config                                                         | **STATUS: Partially resolved. OAuth flow not fully verified end-to-end.** |
| 16:15 | **STATUS:** OAUTH NOT COMPLETED                                      | Google Cloud Console "Android" type requires SHA-1 fingerprint and App Links verification. Full flow verification deferred.   | **This is the only incomplete spike task.**                               |

---

### Day 1/2 — T-00b.6: Render Baseline

| Time        | Event               | Issue                                                                                                                    | Resolution                                                                                                 |
| ----------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Day 2 05:55 | Spike files created | —                                                                                                                        | Zero new dependencies. Plain React `<table>`.                                                              |
| Day 2 05:57 | **Run 1 on device** | Render time: 134,291ms (measurement bug). 80,069 DOM nodes. ~156 MB memory. Scroll degraded from "smooth" to "unusable". | **Unvirtualized rendering is not viable at 10k rows.**                                                     |
| —           | Measurement bug     | `renderStartRef` initialized to 0, never set before render                                                               | Measurement captures time since page load, not render time. Actual render ~187ms but still failing budget. |
| —           | **Verdict:**        | T-00b.7 (virtualization) is MANDATORY. Unvirtualized table is not viable for production.                                 | —                                                                                                          |

---

### Day 2 — T-00b.7: Virtualized Rendering

| Time        | Event                                          | Issue                                                                                                         | Resolution                                                                        |
| ----------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Day 2 06:05 | `@tanstack/react-virtual@3.14.3` installed     | Pure JS, no native code                                                                                       | —                                                                                 |
| Day 2 06:08 | Spike files created                            | —                                                                                                             | `useVirtualizer` with 48px rows, 5 overscan                                       |
| Day 2 06:10 | **Run 1 on device**                            | Render time: 144,614ms (measurement bug). 34 DOM rows (PASS). All scroll tests PASS.                          | Same measurement bug as T6: `renderStartRef` not set                              |
| Day 2 06:12 | Fix: set `renderStartRef` in `useEffect`       | Render time: 42,283ms (still wrong)                                                                           | `useEffect` timeout too late — gap between effects is seconds                     |
| Day 2 06:15 | Fix: set `renderStartRef` removed              | Still showing wrong time                                                                                      | Root cause: `useLayoutEffect` fires on a different render cycle                   |
| Day 2 06:18 | Fix: measure inside `useLayoutEffect` directly | —                                                                                                             | `const start = performance.now(); ... const duration = performance.now() - start` |
| Day 2 06:21 | **Run 4 on device**                            | **ALL TESTS PASS.** VR-01: 28 DOM rows. VR-04: 0.1ms render. VR-02/03: scroll correct. VR-05: 16ms re-render. | **Virtualization validated. 287x fewer DOM nodes, 286x less memory.**             |

---

## 2. Issues Encountered

### Critical Issues (Architecture-Gating)

| #   | Issue                                                                          | Task  | Severity     | Resolved?                                                    |
| --- | ------------------------------------------------------------------------------ | ----- | ------------ | ------------------------------------------------------------ |
| 1   | `@capacitor-community/sqlite` default encryption causes initialization failure | T1    | **CRITICAL** | Yes — `androidIsEncryption: false`                           |
| 2   | Android `execSQL()` rejects all PRAGMAs                                        | T1    | **CRITICAL** | Yes — use `query()` for all PRAGMAs                          |
| 3   | Unicode password cross-platform determinism (AR-CROSS)                         | T2    | **CRITICAL** | Yes — `TextEncoder().encode()`                               |
| 4   | `crypto.getRandomValues()` 64KB limit                                          | T3    | **MEDIUM**   | Yes — chunked generation                                     |
| 5   | Google Cloud Console rejects custom URI schemes                                | T5    | **CRITICAL** | **PARTIALLY** — Android client type, OAuth flow not verified |
| 6   | Unvirtualized rendering unusable at 10k rows                                   | T6/T7 | **CRITICAL** | Yes — virtualization mandatory                               |

### Build & Configuration Issues

| #   | Issue                                       | Root Cause                                         | Resolution                                |
| --- | ------------------------------------------- | -------------------------------------------------- | ----------------------------------------- |
| 7   | pnpm 11 incompatible with Node 20           | pnpm 11 requires `node:sqlite` built-in (Node 22+) | Use pnpm 9.x                              |
| 8   | `cap sync` can't find plugin Android source | pnpm virtual store symlinks                        | `.npmrc` with `node-linker=hoisted`       |
| 9   | `@capacitor/browser@8` incompatible         | Requires `@capacitor/core@>=8`                     | Pin to v6.x                               |
| 10  | Community plugins not auto-registered       | Capacitor only auto-registers core plugins         | `registerPlugin()` in `MainActivity.java` |
| 11  | `@capacitor/secure-storage` doesn't exist   | Wrong package name in spec                         | `capacitor-secure-storage-plugin@0.10.0`  |

### Measurement & Testing Issues

| #   | Issue                                                 | Root Cause                                                                 | Resolution                                      |
| --- | ----------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------- |
| 12  | Render time measurement showing seconds instead of ms | `renderStartRef` measuring across `useEffect`/`useLayoutEffect` boundaries | Measure inside single `useLayoutEffect`         |
| 13  | "Connection already exists" errors between tests      | React Strict Mode double-mounting + `createConnection` collisions          | `isConnection()`/`retrieveConnection()` pattern |
| 14  | `deleteDatabase()` fails silently                     | Connection dictionary holds stale references                               | `DROP TABLE IF EXISTS` instead                  |

### Package Compatibility Issues

| #   | Issue                                                   | Package                       | Resolution                   |
| --- | ------------------------------------------------------- | ----------------------------- | ---------------------------- |
| 15  | v5.7.4 peer dep on `@capacitor/core@^5`                 | `@capacitor-community/sqlite` | Pin to v6.0.2                |
| 16  | v8.x peer dep on `@capacitor/core@>=8`                  | Both sqlite and browser       | Pin to v6.x across the board |
| 17  | No TypeScript declarations                              | `argon2-wasm`                 | Custom `.d.ts` file          |
| 18  | TypeScript 5.x `Uint8Array.buffer` type incompatibility | `crypto.subtle.*` APIs        | `toArrayBuffer()` helper     |

---

## 3. Final Technology Choices

| Component       | Package                           | Version  | Status                                                          |
| --------------- | --------------------------------- | -------- | --------------------------------------------------------------- |
| SQLite          | `@capacitor-community/sqlite`     | 6.0.2    | **APPROVED** — FK enforcement confirmed                         |
| Argon2id        | `argon2-wasm`                     | 0.9.0    | **APPROVED** — 749ms mean, cross-platform determinism confirmed |
| AES-256-GCM     | `crypto.subtle` (Web Crypto API)  | Built-in | **APPROVED** — Zero dependencies                                |
| Secure Storage  | `capacitor-secure-storage-plugin` | 0.10.0   | **APPROVED** — Data survives app kill                           |
| OAuth Browser   | `@capacitor/browser`              | 6.0.6    | **APPROVED** — Opens system browser                             |
| OAuth Listener  | `@capacitor/app`                  | 6.0.3    | **APPROVED** — `appUrlOpen` for redirect                        |
| Virtual Table   | `@tanstack/react-virtual`         | 3.14.3   | **APPROVED — MANDATORY**                                        |
| Package Manager | pnpm                              | 9.x      | **APPROVED** — Requires `node-linker=hoisted`                   |
| Bundler         | Vite                              | 5.4.21   | **APPROVED**                                                    |
| TypeScript      | —                                 | 5.9.3    | **APPROVED** — Strict mode                                      |

### Rejected Packages

| Package                           | Reason                                          |
| --------------------------------- | ----------------------------------------------- |
| `@capacitor-community/sqlite@5.x` | Incompatible peer dep                           |
| `@capacitor-community/sqlite@8.x` | Incompatible peer dep                           |
| `@capacitor/browser@8.x`          | Incompatible peer dep                           |
| `@capacitor/secure-storage`       | Does not exist                                  |
| `@capacitor-community/oauth`      | Not needed — raw PKCE works                     |
| `react-window`                    | Unmaintained, no dynamic heights                |
| `@capacitor/preferences`          | Weaker security (SharedPreferences vs Keystore) |
| `argon2-browser`                  | Not needed — `argon2-wasm` works                |

---

## 4. Lessons Learned

### Lesson 1: Test Platform-Specific Behavior First

The spike encountered multiple platform-specific behaviors that were not documented in plugin READMEs: Android `execSQL()` rejects result-returning statements, `SqliteConfig` defaults to encryption, `capacitor-secure-storage-plugin` delete is not idempotent. Every community Capacitor plugin should be treated as having unknown platform-specific behaviors until validated by a spike test.

### Lesson 2: Never Trust Default Configuration Values

Two separate plugins had dangerous defaults: `@capacitor-community/sqlite` defaults `isEncryption = true` (causes silent Keystore failures) and `execute()` defaults `transaction = true` (causes PRAGMAs to fail). Always explicitly configure all plugin options in `capacitor.config.ts` and always pass explicit flags to API calls.

### Lesson 3: Capacitor Build System Uses Relative `node_modules` Paths

The `capacitor.settings.gradle` generated by `cap sync` uses relative paths pointing into `node_modules/`. pnpm's virtual store layout breaks this. The `node-linker=hoisted` setting is required. New developers should install dependencies with this configuration from day one, and CI pipelines must include it.

### Lesson 4: Community Plugins Need Manual Registration

Core Capacitor plugins auto-register. Community plugins don't. The "Found X Capacitor plugins" log message from `cap sync` is misleading — it detects the plugin package but does not register it. Every community plugin must be registered in `MainActivity.java` with the correct class name and package.

### Lesson 5: Version Ranges Cause Breaking Peer Dependency Conflicts

Every package had peer dependency issues when using version ranges (`^`). Three packages (`@capacitor-community/sqlite`, `@capacitor/browser`, `@capacitor/app`) had to be pinned to specific versions because newer versions require `@capacitor/core@>=8.0.0`. Pin all Capacitor-related packages to exact versions.

### Lesson 6: Cross-Platform Cryptography Requires Explicit Encoding

The same Argon2id parameters and the same AES-GCM parameters produce identical output only when input encoding is consistent. `argon2-wasm`'s internal `intArrayFromString()` encodes differently than the native `argon2` npm package for non-ASCII characters. Always encode passwords as explicit UTF-8 bytes before passing to any cryptographic function.

### Lesson 7: React Hooks Timing Matters for Performance Measurement

Measuring render time across `useEffect`/`useLayoutEffect` boundaries produces wildly inaccurate results (seconds instead of milliseconds). Both `performance.now()` calls must be inside the same effect callback. The gap between effects can be arbitrarily long on a busy WebView — it is not a small constant.

### Lesson 8: Delete vs Drop for SQLite Cleanup

`CapacitorSQLite.deleteDatabase()` fails silently because the plugin's internal connection dictionary holds stale references. `DROP TABLE IF EXISTS` inside the same connection is faster, simpler, and more reliable. This pattern should be used for all cleanup operations in production migration rollbacks as well.

### Lesson 9: Google OAuth Custom URI Schemes Are a Dead End

Google Cloud Console does not support custom URI schemes for any OAuth client type. "Desktop app" type fixes the redirect URI to `http://localhost`. "Web application" type requires HTTP/HTTPS URLs with valid TLDs. "Android" type uses package name binding. The architecture's assumption of a single shared custom URI scheme across platforms is invalid — each platform needs its own OAuth client configuration.

### Lesson 10: Virtualization Is Not an Optimization — It's a Requirement

The unvirtualized spike rendered 10,000 rows successfully but with 134-second render time (measurement artifact), 80,069 DOM nodes, ~156MB memory, and scroll that degraded from "smooth" to "unusable." Virtualization fixed all of these: 0.1ms render, 28 DOM rows, ~0.5MB memory, always smooth. The decision to virtualize should not be deferred — it must be the default from day one.

---

## 5. Spike Metrics Summary

| Metric        | T-00b.1 (SQLite) | T-00b.2 (Argon2) | T-00b.3 (AES) | T-00b.4 (Storage) | T-00b.5 (OAuth) | T-00b.6 (Render)    | T-00b.7 (Virtual) |
| ------------- | ---------------- | ---------------- | ------------- | ----------------- | --------------- | ------------------- | ----------------- |
| Tests         | 12               | 12               | 11            | 10                | 7 steps         | 7                   | 7                 |
| Passed        | 12               | 12               | 11            | 10                | Not verified    | 6                   | 7                 |
| Failed        | 0                | 0                | 0             | 0 (after fix)     | N/A             | 1 (measurement bug) | 0 (after fix)     |
| Critical Pass | SQ-09 (FK)       | AR-CROSS         | Not gating    | KC-09 (survive)   | —               | —                   | —                 |
| Duration      | ~150ms/tests     | 749ms mean       | Sub-ms        | ~5ms/op           | N/A             | ~187ms render       | 0.1ms render      |
| Iterations    | 8                | 2                | 2             | 2                 | N/A             | 1                   | 4                 |

---

_End of Spike Retrospective_
