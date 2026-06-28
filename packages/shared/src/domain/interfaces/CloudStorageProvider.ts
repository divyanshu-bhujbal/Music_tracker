/**
 * Abstract interface for cloud file operations.
 *
 * The sync engine (E-10) calls only this interface — it has no knowledge
 * of Google Drive, OAuth tokens, or HTTP. The concrete implementation
 * lives in `packages/platform/src/shared/GoogleDriveProvider.ts`.
 *
 * Source of truth: PROJECT_CONSTITUTION.md §6 (CA-05), 01_ARCHITECTURE.md §4
 */

export interface UploadResult {
  /** Google Drive file ID */
  fileId: string;
  /** ISO-8601 timestamp from Drive */
  modifiedTime: string;
}

export interface DownloadResult {
  /** File bytes */
  data: Uint8Array;
  /** ISO-8601 timestamp from Drive */
  modifiedTime: string;
}

export interface DriveFileInfo {
  fileId: string;
  name: string;
  modifiedTime: string;
}

export interface CloudStorageProvider {
  /**
   * Upload encrypted database bytes to Drive.
   *
   * Uses `drive.appdata` scope — files are app-private, invisible to the
   * user's Drive UI. Overwrites if a file already exists (Drive versions
   * the old file).
   *
   * @param data - Encrypted database bytes.
   * @param fileName - Target filename on Drive (e.g., 'collectio.db').
   * @returns File metadata from Drive.
   * @throws {CloudStorageError} NOT_AUTHENTICATED, NETWORK, RATE_LIMITED, SERVER_ERROR, UPLOAD_FAILED
   */
  upload(data: Uint8Array, fileName: string): Promise<UploadResult>;

  /**
   * Download encrypted database bytes from Drive.
   *
   * @param fileId - The Drive file ID to download.
   * @returns File bytes and metadata.
   * @throws {CloudStorageError} NOT_AUTHENTICATED, NOT_FOUND, NETWORK, RATE_LIMITED, SERVER_ERROR
   */
  download(fileId: string): Promise<DownloadResult>;

  /**
   * List all files in the app's `drive.appdata` folder.
   *
   * @returns Array of file metadata objects.
   * @throws {CloudStorageError} NOT_AUTHENTICATED, NETWORK, RATE_LIMITED, SERVER_ERROR
   */
  list(): Promise<DriveFileInfo[]>;

  /**
   * Delete a file from Drive.
   *
   * Idempotent — does NOT throw if the file is not found (404 is treated
   * as success).
   *
   * @param fileId - The Drive file ID to delete.
   * @throws {CloudStorageError} NOT_AUTHENTICATED, NETWORK, RATE_LIMITED, SERVER_ERROR
   */
  delete(fileId: string): Promise<void>;
}
