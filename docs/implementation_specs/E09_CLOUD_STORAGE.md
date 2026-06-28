# E-09: Cloud Storage Layer — Implementation Specification

> **Epic:** E-09_CLOUD_STORAGE.md | **Phase:** 2 | **Depends On:** E-04 | **Blocks:** E-10
> **Platform Impact:** UNCHANGED — `fetch` API available in both Electron and Capacitor. Zero platform-specific code.
> **Date:** 2026-06-28

---

## 1. Goal

Implement the `CloudStorageProvider` interface and `GoogleDriveProvider` to enable the sync engine (E-10) to upload/download encrypted database files to/from Google Drive via the `drive.appdata` scope.

## 2. Scope

- Define `CloudStorageProvider` interface in `packages/shared/src/domain/interfaces/`
- Implement `GoogleDriveProvider` in `packages/platform/src/shared/` (platform-agnostic; works on both Electron and Capacitor via `fetch`)
- Implement `DriveMetadataTracker` for persisting `cloud_file_id` and `cloud_modified_time` to `app_metadata`
- Integrate exponential backoff retry for Drive API rate limits (HTTP 429) and server errors (HTTP 5xx)
- Register `GoogleDriveProvider` in both DI files
- Add `CloudStorageProvider` to `ServiceProvider`
- Write integration tests with mocked `fetch`

## 3. Out of Scope

- Chunked upload for large files (>50MB) — V1 uses single `PUT` (TD-01)
- Alternative cloud providers (Dropbox, OneDrive, WebDAV) — V1 is Google Drive only (TD-02)
- OAuth token acquisition — handled by `AuthProvider` (E-04); this epic only calls `TokenRefresher.getAccessToken()`
- File encryption/decryption — that is the sync engine's responsibility (E-10)
- Sync engine — E-10 consumes this layer
- Retry on HTTP 401 (unauthorized) — `TokenRefresher` handles token refresh; `GoogleDriveProvider` retries once after token refresh
- Network connectivity detection — sync engine checks before calling `GoogleDriveProvider`

## 4. Files To Create

| # | File | Task | Purpose |
|---|------|------|---------|
| 1 | `packages/shared/src/domain/interfaces/CloudStorageProvider.ts` | T-09.1 | Interface contract for cloud file operations |
| 2 | `packages/platform/src/shared/GoogleDriveProvider.ts` | T-09.2, T-09.4 | Google Drive REST API implementation via `fetch` |
| 3 | `packages/platform/src/shared/DriveMetadataTracker.ts` | T-09.3 | Persists `cloud_file_id` / `cloud_modified_time` in `app_metadata` |
| 4 | `packages/platform/src/shared/__tests__/GoogleDriveProvider.test.ts` | T-09.5 | Integration tests with mocked `fetch` |

## 5. Files To Modify

| # | File | Change | Task |
|---|------|--------|------|
| 1 | `packages/shared/src/domain/interfaces/index.ts` | Add `export type { CloudStorageProvider, UploadResult, DownloadResult, DriveFileInfo } from './CloudStorageProvider.js'` | T-09.1 |
| 2 | `packages/shared/src/index.ts` | Re-export `CloudStorageProvider` types | T-09.1 |
| 3 | `packages/platform/src/shared/index.ts` | Add `export { GoogleDriveProvider }` and `export { DriveMetadataTracker }` | T-09.2, T-09.3 |
| 4 | `packages/shared/src/application/ServiceProvider.ts` | Add `cloudStorageProvider: CloudStorageProvider` field + import | T-09.2 |
| 5 | `apps/electron/src/di.ts` | Instantiate `DriveMetadataTracker` → `GoogleDriveProvider` → add to `ServiceProvider` return | T-09.2 |
| 6 | `apps/capacitor/src/di.ts` | Instantiate `DriveMetadataTracker` → `GoogleDriveProvider` → add to `ServiceProvider` return | T-09.2 |

## 6. Interfaces

### 6.1 `CloudStorageProvider` (new)

**Location:** `packages/shared/src/domain/interfaces/CloudStorageProvider.ts`

**Source of truth:** 01_ARCHITECTURE.md §4. This is the exact contract the sync engine will call.

| Method | Parameters | Returns | Purpose |
|--------|-----------|---------|---------|
| `upload` | `data: Uint8Array, fileName: string` | `Promise<UploadResult>` | Upload encrypted DB to Drive. Overwrites if file exists (Drive versions old file). |
| `download` | `fileId: string` | `Promise<DownloadResult>` | Download encrypted DB bytes from Drive. |
| `list` | _(none)_ | `Promise<DriveFileInfo[]>` | List files in `drive.appdata` folder. |
| `delete` | `fileId: string` | `Promise<void>` | Delete a file from Drive. Idempotent — does NOT throw if file not found. |

**Supporting types:**

```typescript
interface UploadResult {
  fileId: string;      // Google Drive file ID
  modifiedTime: string; // ISO-8601 timestamp from Drive
}

interface DownloadResult {
  data: Uint8Array;     // File bytes
  modifiedTime: string; // ISO-8601 timestamp from Drive
}

interface DriveFileInfo {
  fileId: string;
  name: string;
  modifiedTime: string;
}
```

**Existing contracts the implementation must respect:**

- Uses `drive.appdata` scope (NFR-SEC-05) — files are app-private, invisible to user's Drive UI
- Upload URL: `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=media`
- Download URL: `GET https://www.googleapis.com/drive/v3/files/{fileId}?alt=media`
- List URL: `GET https://www.googleapis.com/drive/v3/files?spaces=appDataFolder`
- Delete URL: `DELETE https://www.googleapis.com/drive/v3/files/{fileId}`
- All requests include `Authorization: Bearer {accessToken}` header

### 6.2 `DriveMetadataTracker` (new)

**Location:** `packages/platform/src/shared/DriveMetadataTracker.ts`

**Purpose:** Thin persistence wrapper for cloud file metadata. Reads/writes `cloud_file_id` and `cloud_modified_time` keys in `app_metadata`. Uses `AppMetadataRepository` (already exists at `packages/shared/src/data/repositories/AppMetadataRepository.ts`).

**Constructor dependency:** `AppMetadataRepository` (or `DatabaseConnection` — see decision below)

| Method | Purpose |
|--------|---------|
| `getCloudFileId()` | Returns `cloud_file_id` value or `null` |
| `getCloudModifiedTime()` | Returns `cloud_modified_time` value or `null` |
| `setCloudFileMetadata(fileId, modifiedTime)` | Writes both values atomically |
| `clearCloudFileMetadata()` | Sets both values to `null` (removes from `app_metadata` by deleting rows) |

**Design decision:** Use `DatabaseConnection` directly (not `AppMetadataRepository`) because:
1. `DriveMetadataTracker` is a thin wrapper; `AppMetadataRepository` adds key validation overhead that's unnecessary here
2. Both keys (`cloud_file_id`, `cloud_modified_time`) are already defined in `AppMetadataKey`
3. This avoids coupling the tracker to the repository pattern for a 2-row write

### 6.3 `ServiceProvider` (modify existing)

**Location:** `packages/shared/src/application/ServiceProvider.ts`

**Change:** Add field `cloudStorageProvider: CloudStorageProvider`. Add type-only import from domain interfaces.

This follows AD-18 precedent (narrow exception for shared platform services). `CloudStorageProvider` is a domain interface in `shared/` — no circular dependency.

## 7. Data Flow

### 7.1 Upload Flow

```
SyncEngine (E-10)
  │
  ├─ encrypts local DB → Uint8Array
  ├─ calls cloudStorageProvider.upload(data, 'collectio.db')
  │
  ▼
GoogleDriveProvider
  │
  ├─ calls tokenRefresher.getAccessToken()
  │   └─ null → throw CloudStorageError('Not authenticated')
  ├─ POST /upload/drive/v3/files?uploadType=media
  │   Headers: Authorization, Content-Type: application/octet-stream
  │   Body: Uint8Array
  ├─ Response: { id, modifiedTime }
  ├─ calls driveMetadataTracker.setCloudFileMetadata(id, modifiedTime)
  └─ returns { fileId: id, modifiedTime }
```

### 7.2 Download Flow

```
SyncEngine (E-10)
  │
  ├─ calls driveMetadataTracker.getCloudFileId()
  │   └─ null → throw CloudStorageError('No cloud backup found')
  ├─ calls cloudStorageProvider.download(fileId)
  │
  ▼
GoogleDriveProvider
  │
  ├─ calls tokenRefresher.getAccessToken()
  ├─ GET /drive/v3/files/{fileId}?alt=media
  ├─ Response: ArrayBuffer
  ├─ calls driveMetadataTracker.setCloudFileMetadata(fileId, responseModifiedTime)
  └─ returns { data: Uint8Array, modifiedTime }
```

### 7.3 List Flow

```
SyncEngine / Settings UI
  │
  ├─ calls cloudStorageProvider.list()
  │
  ▼
GoogleDriveProvider
  │
  ├─ calls tokenRefresher.getAccessToken()
  ├─ GET /drive/v3/files?spaces=appDataFolder&fields=files(id,name,modifiedTime)
  ├─ Response: { files: [{ id, name, modifiedTime }] }
  └─ returns DriveFileInfo[]
```

### 7.4 Delete Flow

```
SyncEngine / Settings UI
  │
  ├─ calls cloudStorageProvider.delete(fileId)
  │
  ▼
GoogleDriveProvider
  │
  ├─ calls tokenRefresher.getAccessToken()
  ├─ DELETE /drive/v3/files/{fileId}
  ├─ 404 → return (idempotent, no error)
  └─ 204 → return
```

## 8. State Changes

### 8.1 `app_metadata` State

| Operation | Key Changed | Value |
|-----------|------------|-------|
| Upload success | `cloud_file_id` | New Google Drive file ID |
| Upload success | `cloud_modified_time` | Drive's `modifiedTime` (ISO-8601) |
| Upload overwrite | `cloud_file_id` | Unchanged (Drive replaces file in-place) |
| Upload overwrite | `cloud_modified_time` | Updated to new Drive timestamp |
| Download success | `cloud_file_id` | Unchanged |
| Download success | `cloud_modified_time` | Updated to downloaded file's timestamp |
| Delete success | `cloud_file_id` | Row removed |
| Delete success | `cloud_modified_time` | Row removed |

### 8.2 Token State

- `GoogleDriveProvider` does NOT manage token state — it delegates entirely to `TokenRefresher`
- If `TokenRefresher.getAccessToken()` returns `null` (not authenticated / needsReauth / backoff), `GoogleDriveProvider` throws `CloudStorageError` with code `'NOT_AUTHENTICATED'`
- On HTTP 401 response with a fresh token → force refresh via `authProvider.refreshAccessToken()` → retry once
- If retry also 401s → throw `CloudStorageError` with code `'NOT_AUTHENTICATED'`

## 9. Database Changes

**None.** No schema migrations are needed. `cloud_file_id` and `cloud_modified_time` keys already exist in `app_metadata` (defined in `AppMetadataKey` type, created by migration 001). `DriveMetadataTracker` reads/writes to existing `app_metadata` table.

## 10. Error Handling

### 10.1 Error Types

| Error | Thrown When | Method |
|-------|------------|--------|
| `CloudStorageError('NOT_AUTHENTICATED', ...)` | `TokenRefresher` returns null; no valid access token available | All |
| `CloudStorageError('NOT_FOUND', ...)` | `download()` gets HTTP 404; file deleted externally | `download` |
| `CloudStorageError('NETWORK', ...)` | `fetch` throws `TypeError` (no connectivity); no retry | All |
| `CloudStorageError('RATE_LIMITED', ...)` | HTTP 429 after max retries exhausted | All |
| `CloudStorageError('SERVER_ERROR', ...)` | HTTP 5xx after max retries exhausted | All |
| `CloudStorageError('UPLOAD_FAILED', ...)` | Upload response not 200; after retries | `upload` |

### 10.2 Retry Strategy

Per 03_SYNC_STATE_MACHINE.md §12:

| HTTP Status | Retries | Backoff | Notes |
|------------|---------|---------|-------|
| 429 (rate limit) | 5 | 1s, 2s, 4s, 8s, 16s | Exponential with jitter |
| 5xx (server error) | 3 | 1s, 2s, 4s | Exponential |
| 401 (unauthorized) | 1 | Immediate refresh + retry | No backoff; refresh token and retry immediately |
| 404 (not found) | 0 | N/A | Only on `download()` — throw `NOT_FOUND` immediately |
| Network error (TypeError) | 0 | N/A | Throw `NETWORK` immediately; sync engine handles retry |

### 10.3 Error Class

Create `CloudStorageError` in `packages/shared/src/domain/errors/CloudStorageError.ts`:

- `code: CloudStorageErrorCode` — discriminated union: `'NOT_AUTHENTICATED' | 'NOT_FOUND' | 'NETWORK' | 'RATE_LIMITED' | 'SERVER_ERROR' | 'UPLOAD_FAILED'`
- `statusCode?: number` — HTTP status if applicable
- Extends `Error`

The error MUST be exported from `packages/shared/src/index.ts` so the sync engine (E-10) can catch and handle specific codes.

### 10.4 Integration with Sync Engine (E-10)

- `GoogleDriveProvider` does NOT implement retry across sync cycles. That is the sync engine's responsibility.
- `GoogleDriveProvider` retries within a single API call only.
- After max retries exhausted → throw `CloudStorageError` → sync engine handles (logs to `sync_log`, shows UI warning).

## 11. Logging Requirements

| Event | Level | Message Pattern |
|-------|-------|----------------|
| Upload started | `debug` | `GoogleDriveProvider: upload started (${data.length} bytes)` |
| Upload succeeded | `info` | `GoogleDriveProvider: upload complete — fileId=${fileId}` |
| Download started | `debug` | `GoogleDriveProvider: download started (fileId=${fileId})` |
| Download succeeded | `info` | `GoogleDriveProvider: download complete — ${data.length} bytes` |
| List succeeded | `debug` | `GoogleDriveProvider: list returned ${count} files` |
| Delete succeeded | `debug` | `GoogleDriveProvider: delete complete (fileId=${fileId})` |
| Delete not found (idempotent) | `debug` | `GoogleDriveProvider: delete returned 404 (already deleted)` |
| Token unavailable | `warn` | `GoogleDriveProvider: not authenticated — cannot proceed` |
| Retry attempt | `warn` | `GoogleDriveProvider: retry ${n}/${max} after ${delay}ms (${statusCode})` |
| Max retries exhausted | `error` | `GoogleDriveProvider: ${operation} failed after ${max} retries (${statusCode})` |
| Network error | `error` | `GoogleDriveProvider: network error — ${message}` |
| HTTP 404 on download | `warn` | `GoogleDriveProvider: file not found (fileId=${fileId})` |
| Metadata persisted | `debug` | `DriveMetadataTracker: set cloud_file_id=${fileId}` |

All logs use `console.debug/info/warn/error`. No custom logging framework. Follow existing patterns from `TokenRefresher.ts` and DI files.

## 12. Security Requirements

| Requirement | Source | Implementation |
|-------------|--------|----------------|
| Access token never logged | Rule 12.2 | `GoogleDriveProvider` logs token presence (boolean), never value |
| No client secret stored | NFR-SEC-04, FR-AUTH-09 | OAuth client ID is public; no secret used with PKCE |
| `drive.appdata` scope only | NFR-SEC-05 | Hardcoded in file search URLs (`spaces=appDataFolder`) |
| No plaintext DB transmitted | CA-06 | Sync engine encrypts before calling `upload()`; this layer transmits bytes blindly |
| Token via Authorization header only | Standard | `Bearer {token}` header; never in URL query params |
| HTTPS only | Standard | Google Drive REST API endpoints are `https://` only |
| Files invisible to user's Drive UI | NFR-SEC-05 | `drive.appdata` scope ensures files don't appear in google.com/drive |

## 13. Acceptance Criteria

All 5 tasks share identical acceptance criteria per E-09_CLOUD_STORAGE.md. The following apply to the complete deliverable:

1. `CloudStorageProvider` interface is defined in `packages/shared/src/domain/interfaces/` and matches the contract in 01_ARCHITECTURE.md §4
2. `GoogleDriveProvider.upload()` uploads `Uint8Array` to Drive and returns `{ fileId, modifiedTime }`
3. `GoogleDriveProvider.download()` retrieves file bytes from Drive by file ID
4. `GoogleDriveProvider.list()` returns array of files in `appDataFolder`
5. `GoogleDriveProvider.delete()` removes a file from Drive; is idempotent (no error for missing file)
6. `DriveMetadataTracker` persists `cloud_file_id` and `cloud_modified_time` to `app_metadata`
7. `DriveMetadataTracker` clears metadata on delete
8. Rate limiting: HTTP 429 triggers exponential backoff (5 retries); HTTP 5xx triggers 3 retries
9. HTTP 401 triggers immediate token refresh + single retry
10. Authentication failure (no token) throws `CloudStorageError('NOT_AUTHENTICATED')`
11. Network failure throws `CloudStorageError('NETWORK')`
12. `ServiceProvider` includes `cloudStorageProvider` field
13. Both `apps/electron/src/di.ts` and `apps/capacitor/src/di.ts` instantiate and register `GoogleDriveProvider` with `DriveMetadataTracker`
14. All tests pass (`pnpm test` in platform package)
15. TypeScript compiles with zero errors (`pnpm typecheck`)

## 14. Test Cases

### 14.1 Unit Tests: `GoogleDriveProvider` (mock `fetch`)

All tests in `packages/platform/src/shared/__tests__/GoogleDriveProvider.test.ts`.

**Setup:** Mock global `fetch` using Jest (`global.fetch = jest.fn()`). Mock `TokenRefresher` and `DriveMetadataTracker`. Instantiate `GoogleDriveProvider` with mocked dependencies.

| ID | Test | Input | Expected |
|----|------|-------|----------|
| GD-01 | `upload()` sends correct request | `data = new Uint8Array([1,2,3])`, `fileName = 'collectio.db'` | `fetch` called with: URL contains `uploadType=media`, method `POST`, header `Authorization: Bearer mock-token`, header `Content-Type: application/octet-stream`, body is `Uint8Array` |
| GD-02 | `upload()` returns file metadata on success | Mock `fetch` returns `{ status: 200, json: { id: 'abc123', modifiedTime: '2026-01-01T00:00:00Z' } }` | Returns `{ fileId: 'abc123', modifiedTime: '2026-01-01T00:00:00Z' }` |
| GD-03 | `upload()` calls `driveMetadataTracker.setCloudFileMetadata()` | Successful upload | `setCloudFileMetadata('abc123', '2026-01-01T00:00:00Z')` called once |
| GD-04 | `download()` sends correct request | `fileId = 'abc123'` | `fetch` called with URL containing `/drive/v3/files/abc123?alt=media`, method `GET`, header `Authorization: Bearer mock-token` |
| GD-05 | `download()` returns file bytes | Mock returns `{ status: 200, arrayBuffer: new Uint8Array([4,5,6]).buffer }` | Returns `{ data: Uint8Array[4,5,6], modifiedTime: ... }` |
| GD-06 | `download()` on 404 throws `CloudStorageError('NOT_FOUND')` | Mock returns `{ status: 404 }` | Throws `CloudStorageError` with code `NOT_FOUND`; no retry |
| GD-07 | `list()` sends correct request | _(none)_ | `fetch` called with URL containing `spaces=appDataFolder&fields=files(id,name,modifiedTime)` |
| GD-08 | `list()` parses response | Mock returns `{ status: 200, json: { files: [...] } }` | Returns `DriveFileInfo[]` matching mock data |
| GD-09 | `delete()` on 204 succeeds | `fileId = 'abc123'`, mock returns `{ status: 204 }` | Resolves without error |
| GD-10 | `delete()` on 404 succeeds (idempotent) | `fileId = 'nonexistent'`, mock returns `{ status: 404 }` | Resolves without error; no exception |
| GD-11 | `delete()` calls `driveMetadataTracker.clearCloudFileMetadata()` | Successful delete | `clearCloudFileMetadata()` called once |

### 14.2 Retry Tests

| ID | Test | Input | Expected |
|----|------|-------|----------|
| RT-01 | HTTP 429 retries 5 times with exponential backoff | Mock returns 429 for first 5 calls, 200 on 6th | 6 total `fetch` calls; intervals: ~1s, ~2s, ~4s, ~8s, ~16s |
| RT-02 | HTTP 429 max retries exhausted → error | Mock always returns 429 | Throws `CloudStorageError('RATE_LIMITED')` after 6 calls (1 init + 5 retries) |
| RT-03 | HTTP 5xx retries 3 times | Mock returns 500 for first 3 calls, 200 on 4th | 4 total `fetch` calls; intervals: ~1s, ~2s, ~4s |
| RT-04 | HTTP 5xx max retries exhausted → error | Mock always returns 503 | Throws `CloudStorageError('SERVER_ERROR')` after 4 calls |
| RT-05 | HTTP 401 triggers token refresh + single retry | Mock returns 401 then retry returns 200 | `tokenRefresher.refreshAccessToken()` called once; 2 total `fetch` calls |
| RT-06 | HTTP 401 retry also fails → error | Mock always returns 401 | Throws `CloudStorageError('NOT_AUTHENTICATED')` |
| RT-07 | Network error (TypeError) → no retry | `fetch` throws `TypeError` | Throws `CloudStorageError('NETWORK')` immediately; 1 total `fetch` call |

### 14.3 Token Tests

| ID | Test | Input | Expected |
|----|------|-------|----------|
| TK-01 | Operation aborts when `tokenRefresher.getAccessToken()` returns `null` | TokenRefresher mock returns `null` | Throws `CloudStorageError('NOT_AUTHENTICATED')` before any `fetch` call |
| TK-02 | Operation proceeds when token is valid | TokenRefresher mock returns `'valid-token'` | Proceeds normally; `Authorization: Bearer valid-token` header set |

### 14.4 Metadata Tracker Tests

| ID | Test | Input | Expected |
|----|------|-------|----------|
| MT-01 | `getCloudFileId()` returns stored value | `cloud_file_id` = `'abc123'` in DB | Returns `'abc123'` |
| MT-02 | `getCloudFileId()` returns `null` when not stored | No `cloud_file_id` row | Returns `null` |
| MT-03 | `getCloudModifiedTime()` returns stored value | `cloud_modified_time` = `'2026-01-01T00:00:00Z'` | Returns stored value |
| MT-04 | `setCloudFileMetadata()` writes both keys | `fileId` = `'xyz'`, `time` = `'2026-02-02'` | Both `cloud_file_id='xyz'` and `cloud_modified_time='2026-02-02'` in DB |
| MT-05 | `setCloudFileMetadata()` overwrites existing values | Previous values exist; write new ones | Old values replaced |
| MT-06 | `clearCloudFileMetadata()` removes both keys | Keys exist in DB | Both rows deleted; `getCloudFileId()` and `getCloudModifiedTime()` return `null` |
| MT-07 | `clearCloudFileMetadata()` is idempotent | No keys in DB | Resolves without error |

### 14.5 Integration Tests (Real `fetch`, constrained)

| ID | Test | Notes |
|----|------|-------|
| IT-01 | Document boundary between tests and real Drive API | Tests MUST use mocked `fetch` by default. Real Drive integration tests require a valid OAuth token and are manual-only for V1 (see §15 Definition of Done). |

## 15. Definition Of Done

- [ ] `CloudStorageProvider` interface created with types `UploadResult`, `DownloadResult`, `DriveFileInfo`
- [ ] `CloudStorageProvider` re-exported from `packages/shared/src/domain/interfaces/index.ts` and `packages/shared/src/index.ts`
- [ ] `CloudStorageError` class created in `packages/shared/src/domain/errors/CloudStorageError.ts` and exported from `packages/shared/src/index.ts`
- [ ] `GoogleDriveProvider` created with all four methods (`upload`, `download`, `list`, `delete`)
- [ ] `GoogleDriveProvider` accepts `TokenRefresher` and `DriveMetadataTracker` via constructor injection
- [ ] `DriveMetadataTracker` created with `getCloudFileId`, `getCloudModifiedTime`, `setCloudFileMetadata`, `clearCloudFileMetadata`
- [ ] Retry logic: 429 → 5 retries, 5xx → 3 retries, 401 → refresh + 1 retry, network error → 0 retries
- [ ] `ServiceProvider.cloudStorageProvider` field added
- [ ] Both `apps/electron/src/di.ts` and `apps/capacitor/src/di.ts` instantiate and register `DriveMetadataTracker` + `GoogleDriveProvider`
- [ ] `packages/platform/src/shared/index.ts` re-exports `GoogleDriveProvider` and `DriveMetadataTracker`
- [ ] All unit tests pass (`pnpm --filter @collectio/platform test`)
- [ ] `pnpm typecheck` passes with zero errors across all 5 packages
- [ ] `pnpm lint` passes with zero errors/warnings

## Appendix A: Dependency Injection Order

```
DatabaseConnection (already exists)
  │
  ├──► DriveMetadataTracker(db)         ← NEW
  │
TokenRefresher (already exists)
  │
  └──► GoogleDriveProvider(tokenRefresher, driveMetadataTracker)  ← NEW
```

Construction must happen AFTER `databaseConnection.open()` and `TokenRefresher` construction. Add to DI files between `TokenRefresher` construction and the `ServiceProvider` return statement.

## Appendix B: `CloudStorageError` Design

```typescript
type CloudStorageErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'NOT_FOUND'
  | 'NETWORK'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'UPLOAD_FAILED';

class CloudStorageError extends Error {
  code: CloudStorageErrorCode;
  statusCode?: number;
}
```

Export from `packages/shared/src/domain/errors/CloudStorageError.ts`, add to `domain/errors/index.ts`, re-export from `packages/shared/src/index.ts`. Follow existing error class patterns (see `AuthNetworkError.ts`, `AuthCancelledError.ts`).

## Appendix C: Existing Code Patterns to Follow

| Pattern | Reference File | What to Copy |
|---------|---------------|-------------|
| Interface definition style | `packages/shared/src/domain/interfaces/AuthProvider.ts` | JSDoc on every method; type exports in same file |
| Shared platform service | `packages/platform/src/shared/TokenRefresher.ts` | Constructor injection; `import type` from `@collectio/shared` |
| Error class | `packages/shared/src/domain/errors/AuthNetworkError.ts` | Extends Error; single field; minimal constructor |
| DI factory function | `apps/electron/src/di.ts` | `console.debug` logging; try/catch with warnings; construction order comments |
| Test file structure | `packages/platform/src/shared/__tests__/TokenRefresher.test.ts` | Jest describe/it; mock setup in `beforeEach` |
| Barrel re-export | `packages/platform/src/shared/index.ts` | `export { ClassName } from './FileName.js'` (with `.js` extension) |
| Domain interfaces barrel | `packages/shared/src/domain/interfaces/index.ts` | `export type { ... } from './...'` |
