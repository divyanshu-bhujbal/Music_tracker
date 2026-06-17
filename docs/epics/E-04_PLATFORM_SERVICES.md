# E-04: Platform Services

**Phase:** 1 | **Type:** Foundation | **Depends On:** E-03 | **Blocks:** E-09, E-10

---

## Overview

**Purpose:** Implement platform-specific OAuth authentication, secure storage, and token management behind the `AuthProvider` and `SecureStorageProvider` interfaces. The `GoogleDriveProvider` is shared (uses `fetch` which works in both environments).

**Key architectural change from original:** Electron uses `google-auth-library` and `electron-store` with `safeStorage`. Capacitor uses `@capacitor/browser` for the OAuth flow and `@capacitor/secure-storage` for keystore access. Both implement the same interfaces.

### Component Mapping Table

| Original (Option A) | Revised (Option D) | Change |
|---------------------|-------------------|--------|
| `@react-native-google-signin/google-signin` (Android) | Custom PKCE + `@capacitor/browser` (Android) | Both use PKCE now — no Google Sign-In library on either platform |
| Custom PKCE on Windows | Custom PKCE + `google-auth-library` (Electron) | Electron adds google-auth-library for token exchange |
| `react-native-keychain` (Android Keystore) | `@capacitor/secure-storage` (Android Keystore) | Different package; same OS backend |
| `react-native-keychain` (Windows Credential Manager) | `electron-store` + `safeStorage` (DPAPI) | Different package; same OS-level encryption |
| `GoogleDriveProvider` (shared) | `GoogleDriveProvider` (shared) | Unchanged — uses `fetch` |

---

## Tasks

### T-04.1 — Implement ElectronAuthProvider

| Property | Detail |
|----------|--------|
| **Depends on** | T-01.5, T-03.1 |
| **Blocks** | T-04.5, E-09 |

**Files produced:**
- `packages/platform/src/electron/ElectronAuthProvider.ts`

**Requirements:**
- Implements `AuthProvider` interface
- PKCE flow: generate `code_verifier` (random bytes, base64url-encoded) → compute `code_challenge = BASE64URL(SHA-256(code_verifier))`
- Open system browser via `electron.shell.openExternal(authUrl)`
- Custom protocol: register `collectio://` via `app.setAsDefaultProtocolClient('collectio')`
- Receive auth code via `app.on('open-url', (event, url) => ...)`
- Exchange code for tokens using `google-auth-library`'s OAuth2 client
- Store refresh token + derived key in ElectronStorageProvider (T-04.3)
- `signOut()`: clear stored tokens; no remote revocation
- `getStoredTokens()`: return cached tokens from storage

**Acceptance criteria:**
1. Full OAuth PKCE flow completes on Electron
2. Access token is usable for Drive API calls
3. Refresh token is stored and survives app restart
4. Sign out clears tokens
5. Cancelled flow → `AuthCancelledError`
6. Network failure → `AuthNetworkError`
7. No client secret stored

---

### T-04.2 — Implement CapacitorAuthProvider

| Property | Detail |
|----------|--------|
| **Depends on** | T-01.6, T-03.2 |
| **Blocks** | T-04.5, E-09 |

**Files produced:**
- `packages/platform/src/capacitor/CapacitorAuthProvider.ts`

**Requirements:**
- Implements `AuthProvider` interface
- Same PKCE flow logic as T-04.1 (code_verifier/code_challenge)
- Open system browser via `@capacitor/browser`
- Receive redirect via `App.addListener('appUrlOpen', (data) => ...)`
- Exchange code for tokens using `fetch()` to `https://oauth2.googleapis.com/token`
- Store tokens via CapacitorStorageProvider (T-04.4)
- Same signOut/getStoredTokens pattern as T-04.1

**Acceptance criteria:**
1. Full OAuth PKCE flow completes on Android device
2. Access token usable for Drive API calls
3. Refresh token stored and survives app restart
4. Cancelled flow → `AuthCancelledError`
5. No client secret stored

---

### T-04.3 — Implement ElectronStorageProvider

| Property | Detail |
|----------|--------|
| **Depends on** | T-01.5 |
| **Blocks** | T-04.1, T-04.5 |

**Files produced:**
- `packages/platform/src/electron/ElectronStorageProvider.ts`

**Requirements:**
- Implements `SecureStorageProvider` interface
- Uses `electron-store` for persistent key-value storage
- Encrypts sensitive values with `safeStorage.encryptString()` before storing to disk
- Decrypts with `safeStorage.decryptString()` on retrieval
- `store(key, value)`: encrypt value → write to store
- `retrieve(key)`: read from store → decrypt → return plaintext
- `delete(key)`: remove from store
- `clear()`: clear all entries
- Store is in Electron's `userData` directory (persists across app updates, wiped on OS reinstall)

**Acceptance criteria:**
1. Store → retrieve → matches plaintext
2. Retrieve nonexistent key → `null`
3. Delete → retrieve → `null`
4. Survives app restart
5. File on disk is encrypted (manual inspection: no plaintext credentials in `userData`)

---

### T-04.4 — Implement CapacitorStorageProvider

| Property | Detail |
|----------|--------|
| **Depends on** | T-01.6 |
| **Blocks** | T-04.2, T-04.5 |

**Files produced:**
- `packages/platform/src/capacitor/CapacitorStorageProvider.ts`

**Requirements:**
- Implements `SecureStorageProvider` interface
- Uses `@capacitor/secure-storage` plugin
- Plugin stores in Android Keystore (OS-level secure enclave)
- `store(key, value)`: direct pass-through to plugin
- `retrieve(key)`: direct pass-through
- `delete(key)`: direct pass-through
- `clear()`: iterates all keys and deletes

**Acceptance criteria:**
1. Store → retrieve → matches
2. Retrieve nonexistent key → `null`
3. Delete → retrieve → `null`
4. Survives app kill (not just background) — verified on physical device
5. Data not accessible in plaintext via file system inspection

---

### T-04.5 — Implement TokenRefresher (Shared)

| Property | Detail |
|----------|--------|
| **Depends on** | T-04.1, T-04.2 |
| **Blocks** | E-09 |

**Files produced:**
- `packages/platform/src/shared/TokenRefresher.ts`

**Requirements:**
- Proactive refresh: 5 minutes before access token expiry, initiate refresh
- On refresh failure: set `needsReauth` flag
- Exponential backoff on refresh failures (1s, 2s, 4s, 8s, max 5 retries)
- `getAccessToken()`: if token is valid (>5 min remaining), return it; if expired, refresh; if refresh failed, return null
- Shared code — used by both Electron and Capacitor (it calls `AuthProvider.refreshAccessToken()`)

**Acceptance criteria:**
1. Token near expiry → auto-refreshed before API call
2. Refresh failure → returns null, sets needsReauth
3. Successful refresh → new token cached
4. Backoff works on repeated failures

---

### T-04.6 — Integration Tests: Electron Auth + Storage

| Property | Detail |
|----------|--------|
| **Depends on** | T-04.1, T-04.3 |
| **Blocks** | (quality gate) |

**Files produced:**
- `packages/platform/src/electron/__tests__/electron-auth.test.ts`

**Test Cases:**
1. Full OAuth flow with test Google account
2. Store tokens → restart app → tokens survive
3. Refresh access token → new token obtained
4. Sign out → tokens cleared
5. Cancelled consent → `AuthCancelledError`
6. Verify `drive.appdata` scope on received token

**Acceptance criteria:** All tests pass in Electron environment.

---

### T-04.7 — Integration Tests: Capacitor Auth + Storage

| Property | Detail |
|----------|--------|
| **Depends on** | T-04.2, T-04.4 |
| **Blocks** | (quality gate) |

**Files produced:**
- `packages/platform/src/capacitor/__tests__/capacitor-auth.test.ts`

**Test Cases:**
1. Full OAuth flow with test Google account on Android device
2. Store tokens → kill app → relaunch → tokens survive
3. Refresh access token → new token obtained
4. Sign out → tokens cleared
5. Verified URI scheme deep link receives auth code correctly

**Acceptance criteria:** All tests pass on physical Android device.

---

### T-04.8 — Dependency Injection Setup

| Property | Detail |
|----------|--------|
| **Depends on** | T-04.1 through T-04.5 |
| **Blocks** | E-09, E-10, E-15 |

**Files produced:**
- `apps/electron/src/di.ts` — Electron provider injection
- `apps/capacitor/src/di.ts` — Capacitor provider injection
- `packages/shared/src/application/ServiceProvider.ts` — Interface for the DI container

**Requirements:**
- Each app entry creates and registers platform-specific providers:
  - Electron: `NodeCryptoProvider`, `ElectronAuthProvider`, `ElectronStorageProvider`, `BetterSqlite3Connection`
  - Capacitor: `WebCryptoProvider`, `CapacitorAuthProvider`, `CapacitorStorageProvider`, `CapacitorSqliteConnection`
  - Both: `GoogleDriveProvider`, `TokenRefresher`, `MigrationRunner`
- The renderer receives providers through React context
- The shared package never imports platform code

**Acceptance criteria:**
1. Renderer can access `CryptoProvider` through context without knowing which platform it's on
2. Switching providers requires changing only the DI setup file
3. No platform conditionals in shared, renderer, or any business logic
