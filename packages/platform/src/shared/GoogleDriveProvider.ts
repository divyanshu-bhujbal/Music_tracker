import type {
  CloudStorageProvider,
  UploadResult,
  DownloadResult,
  DriveFileInfo,
} from '@collectio/shared';
import { CloudStorageError } from '@collectio/shared';
import type { TokenRefresher } from './TokenRefresher.js';
import type { DriveMetadataTracker } from './DriveMetadataTracker.js';

const DRIVE_BASE_URL = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

const RATE_LIMIT_MAX_RETRIES = 5;
const SERVER_ERROR_MAX_RETRIES = 3;

/**
 * Google Drive REST API implementation of CloudStorageProvider.
 *
 * Uses `drive.appdata` scope — files are app-private, invisible to the
 * user's Drive UI. All requests include `Authorization: Bearer {token}`.
 *
 * Platform-agnostic: works on both Electron and Capacitor via `fetch`.
 */
export class GoogleDriveProvider implements CloudStorageProvider {
  constructor(
    private readonly tokenRefresher: TokenRefresher,
    private readonly driveMetadataTracker: DriveMetadataTracker,
  ) {}

  async upload(data: Uint8Array, fileName: string): Promise<UploadResult> {
    const token = await this.requireToken();
    console.debug(`GoogleDriveProvider: upload started (${data.length} bytes)`);

    const url = new URL(`${DRIVE_UPLOAD_URL}`);
    url.searchParams.set('uploadType', 'media');
    url.searchParams.set('spaces', 'appDataFolder');
    url.searchParams.set('name', fileName);
    url.searchParams.set('fields', 'id,modifiedTime');

    const response = await this.fetchWithRetry(
      url.toString(),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
        },
        body: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
      },
      'upload',
    );

    if (response.status !== 200) {
      throw new CloudStorageError('UPLOAD_FAILED', `Upload failed with status ${response.status}`, {
        statusCode: response.status,
      });
    }

    const result = (await response.json()) as { id: string; modifiedTime: string };
    await this.driveMetadataTracker.setCloudFileMetadata(result.id, result.modifiedTime);

    console.info(`GoogleDriveProvider: upload complete — fileId=${result.id}`);
    return { fileId: result.id, modifiedTime: result.modifiedTime };
  }

  async download(fileId: string): Promise<DownloadResult> {
    const token = await this.requireToken();
    console.debug(`GoogleDriveProvider: download started (fileId=${fileId})`);

    const url = `${DRIVE_BASE_URL}/files/${encodeURIComponent(fileId)}?alt=media`;

    const response = await this.fetchWithRetry(
      url,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      'download',
    );

    if (response.status === 404) {
      console.warn(`GoogleDriveProvider: file not found (fileId=${fileId})`);
      throw new CloudStorageError('NOT_FOUND', `File not found: ${fileId}`, {
        statusCode: 404,
      });
    }

    if (response.status !== 200) {
      throw new CloudStorageError('SERVER_ERROR', `Download failed with status ${response.status}`, {
        statusCode: response.status,
      });
    }

    const buffer = await response.arrayBuffer();
    const data = new Uint8Array(buffer);

    const metadataUrl = `${DRIVE_BASE_URL}/files/${encodeURIComponent(fileId)}?fields=modifiedTime`;
    const metaResponse = await this.fetchWithRetry(
      metadataUrl,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      'download-metadata',
    );

    if (metaResponse.status !== 200) {
      throw new CloudStorageError('SERVER_ERROR', `Failed to fetch file metadata: HTTP ${metaResponse.status}`, {
        statusCode: metaResponse.status,
      });
    }

    const meta = (await metaResponse.json()) as { modifiedTime: string };

    await this.driveMetadataTracker.setCloudFileMetadata(fileId, meta.modifiedTime);

    console.info(`GoogleDriveProvider: download complete — ${data.length} bytes`);
    return { data, modifiedTime: meta.modifiedTime };
  }

  async list(): Promise<DriveFileInfo[]> {
    const token = await this.requireToken();

    const url = new URL(`${DRIVE_BASE_URL}/files`);
    url.searchParams.set('spaces', 'appDataFolder');
    url.searchParams.set('fields', 'files(id,name,modifiedTime)');

    const response = await this.fetchWithRetry(
      url.toString(),
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      'list',
    );

    if (response.status !== 200) {
      throw new CloudStorageError('SERVER_ERROR', `List failed with status ${response.status}`, {
        statusCode: response.status,
      });
    }

    const result = (await response.json()) as {
      files: Array<{ id: string; name: string; modifiedTime: string }>;
    };

    const files: DriveFileInfo[] = (result.files ?? []).map((f) => ({
      fileId: f.id,
      name: f.name,
      modifiedTime: f.modifiedTime,
    }));

    console.debug(`GoogleDriveProvider: list returned ${files.length} files`);
    return files;
  }

  async delete(fileId: string): Promise<void> {
    const token = await this.requireToken();

    const url = `${DRIVE_BASE_URL}/files/${encodeURIComponent(fileId)}`;

    const response = await this.fetchWithRetry(
      url,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      'delete',
    );

    // 404 is idempotent — file already deleted
    if (response.status === 404) {
      console.debug(`GoogleDriveProvider: delete returned 404 (already deleted)`);
      await this.driveMetadataTracker.clearCloudFileMetadata();
      return;
    }

    if (response.status !== 204) {
      throw new CloudStorageError('SERVER_ERROR', `Delete failed with status ${response.status}`, {
        statusCode: response.status,
      });
    }

    await this.driveMetadataTracker.clearCloudFileMetadata();
    console.debug(`GoogleDriveProvider: delete complete (fileId=${fileId})`);
  }

  /**
   * Get a valid access token, throwing NOT_AUTHENTICATED if unavailable.
   */
  private async requireToken(): Promise<string> {
    const token = await this.tokenRefresher.getAccessToken();
    if (token === null) {
      console.warn('GoogleDriveProvider: not authenticated — cannot proceed');
      throw new CloudStorageError('NOT_AUTHENTICATED', 'Not authenticated — no access token available');
    }
    return token;
  }

  /**
   * Fetch with retry logic for rate limits and server errors.
   *
   * - HTTP 429: exponential backoff, 5 retries (1s, 2s, 4s, 8s, 16s)
   * - HTTP 5xx: exponential backoff, 3 retries (1s, 2s, 4s)
   * - HTTP 401: force token refresh + 1 retry (no backoff)
   * - Network error (TypeError): no retry, throw NETWORK
   */
  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    operation: string,
    retryCount = 0,
    triedRefresh = false,
  ): Promise<Response> {
    let response: Response;

    try {
      response = await fetch(url, init);
    } catch (err) {
      if (err instanceof TypeError) {
        console.error(`GoogleDriveProvider: network error — ${err.message}`);
        throw new CloudStorageError('NETWORK', `Network error: ${err.message}`, { cause: err });
      }
      throw err;
    }

    // HTTP 401 — try token refresh once
    if (response.status === 401 && !triedRefresh) {
      console.warn('GoogleDriveProvider: 401 received — refreshing token and retrying');
      const newToken = await this.tokenRefresher.forceRefreshAccessToken();
      if (newToken === null) {
        throw new CloudStorageError('NOT_AUTHENTICATED', 'Token refresh failed — unable to retry');
      }
      return this.fetchWithRetry(url, init, operation, retryCount, true);
    }

    if (response.status === 401) {
      throw new CloudStorageError('NOT_AUTHENTICATED', 'Authentication failed after token refresh');
    }

    // HTTP 429 — rate limit with exponential backoff
    if (response.status === 429) {
      if (retryCount >= RATE_LIMIT_MAX_RETRIES) {
        console.error(
          `GoogleDriveProvider: ${operation} failed after ${RATE_LIMIT_MAX_RETRIES} retries (${response.status})`,
        );
        throw new CloudStorageError('RATE_LIMITED', `Rate limited after ${RATE_LIMIT_MAX_RETRIES} retries`, {
          statusCode: 429,
        });
      }

      const delay = this.calculateBackoff(retryCount);
      console.warn(
        `GoogleDriveProvider: retry ${retryCount + 1}/${RATE_LIMIT_MAX_RETRIES} after ${delay}ms (${response.status})`,
      );
      await this.sleep(delay);
      return this.fetchWithRetry(url, init, operation, retryCount + 1);
    }

    // HTTP 5xx — server error with exponential backoff
    if (response.status >= 500 && response.status < 600) {
      if (retryCount >= SERVER_ERROR_MAX_RETRIES) {
        console.error(
          `GoogleDriveProvider: ${operation} failed after ${SERVER_ERROR_MAX_RETRIES} retries (${response.status})`,
        );
        throw new CloudStorageError('SERVER_ERROR', `Server error after ${SERVER_ERROR_MAX_RETRIES} retries`, {
          statusCode: response.status,
        });
      }

      const delay = this.calculateBackoff(retryCount);
      console.warn(
        `GoogleDriveProvider: retry ${retryCount + 1}/${SERVER_ERROR_MAX_RETRIES} after ${delay}ms (${response.status})`,
      );
      await this.sleep(delay);
      return this.fetchWithRetry(url, init, operation, retryCount + 1);
    }

    return response;
  }

  /**
   * Calculate exponential backoff with jitter.
   * Base delay: 1s, doubles each retry. Jitter: ±25%.
   */
  private calculateBackoff(retryCount: number): number {
    const baseDelay = 1000 * Math.pow(2, retryCount);
    const jitter = baseDelay * 0.25 * (Math.random() * 2 - 1);
    return Math.round(baseDelay + jitter);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
