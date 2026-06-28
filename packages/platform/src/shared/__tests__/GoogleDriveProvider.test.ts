import type { TokenRefresher } from '../TokenRefresher.js';
import type { DriveMetadataTracker } from '../DriveMetadataTracker.js';
import { GoogleDriveProvider } from '../GoogleDriveProvider.js';
import { CloudStorageError } from '@collectio/shared';

function createMockHeaders(entries: [string, string][] = []) {
  const map = new Map<string, string>();
  for (const [k, v] of entries) {
    map.set(k.toLowerCase(), v);
  }
  return {
    get(key: string): string | null {
      return map.get(key.toLowerCase()) ?? null;
    },
    has(key: string): boolean {
      return map.has(key.toLowerCase());
    },
  };
}

function createMockTokenRefresher(token: string | null = 'mock-token'): TokenRefresher {
  return {
    getAccessToken: jest.fn().mockResolvedValue(token),
    forceRefreshAccessToken: jest.fn().mockResolvedValue('refreshed-token'),
    setTokens: jest.fn(),
    clear: jest.fn(),
    get needsReauth() {
      return false;
    },
  } as unknown as TokenRefresher;
}

function createMockDriveMetadataTracker(): DriveMetadataTracker {
  return {
    getCloudFileId: jest.fn().mockResolvedValue(null),
    getCloudModifiedTime: jest.fn().mockResolvedValue(null),
    setCloudFileMetadata: jest.fn().mockResolvedValue(undefined),
    clearCloudFileMetadata: jest.fn().mockResolvedValue(undefined),
  } as unknown as DriveMetadataTracker;
}

function mockFetchSuccess(body: unknown, status = 200): jest.Mock {
  return jest.fn().mockResolvedValue({
    status,
    json: jest.fn().mockResolvedValue(body),
    arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
    headers: createMockHeaders(),
  });
}

function mockFetchError(status: number): jest.Mock {
  return jest.fn().mockResolvedValue({
    status,
    json: jest.fn().mockResolvedValue({ error: { message: 'Error' } }),
    arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
    headers: createMockHeaders(),
  });
}

describe('GoogleDriveProvider', () => {
  let provider: GoogleDriveProvider;
  let tokenRefresher: TokenRefresher;
  let metadataTracker: DriveMetadataTracker;

  beforeEach(() => {
    tokenRefresher = createMockTokenRefresher();
    metadataTracker = createMockDriveMetadataTracker();
    provider = new GoogleDriveProvider(tokenRefresher, metadataTracker);
    jest.clearAllMocks();
  });

  describe('upload', () => {
    // GD-01
    it('sends correct request to Drive', async () => {
      global.fetch = mockFetchSuccess({ id: 'abc123', modifiedTime: '2026-01-01T00:00:00Z' });
      const data = new Uint8Array([1, 2, 3]);

      await provider.upload(data, 'collectio.db');

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toContain('uploadType=media');
      expect(url).toContain('spaces=appDataFolder');
      expect(url).toContain('name=collectio.db');
      expect(init.method).toBe('POST');
      expect(init.headers['Authorization']).toBe('Bearer mock-token');
      expect(init.headers['Content-Type']).toBe('application/octet-stream');
      expect(init.body).toBeInstanceOf(ArrayBuffer);
    });

    // GD-02
    it('returns file metadata on success', async () => {
      global.fetch = mockFetchSuccess({ id: 'abc123', modifiedTime: '2026-01-01T00:00:00Z' });

      const result = await provider.upload(new Uint8Array([1]), 'db');

      expect(result).toEqual({
        fileId: 'abc123',
        modifiedTime: '2026-01-01T00:00:00Z',
      });
    });

    // GD-03
    it('calls setCloudFileMetadata after successful upload', async () => {
      global.fetch = mockFetchSuccess({ id: 'abc123', modifiedTime: '2026-01-01T00:00:00Z' });

      await provider.upload(new Uint8Array([1]), 'db');

      expect(metadataTracker.setCloudFileMetadata).toHaveBeenCalledWith(
        'abc123',
        '2026-01-01T00:00:00Z',
      );
    });
  });

  describe('download', () => {
    function mockDownloadResponses(bytes: Uint8Array, modifiedTime: string, metadataStatus = 200) {
      return jest.fn()
        .mockResolvedValueOnce({
          status: 200,
          arrayBuffer: jest.fn().mockResolvedValue(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
          headers: createMockHeaders(),
        })
        .mockResolvedValueOnce({
          status: metadataStatus,
          json: jest.fn().mockResolvedValue({ modifiedTime }),
        });
    }

    // GD-04
    it('sends correct request to Drive', async () => {
      global.fetch = mockDownloadResponses(new Uint8Array([4, 5, 6]), '2026-01-01T00:00:00Z');

      await provider.download('abc123');

      expect(global.fetch).toHaveBeenCalledTimes(2);
      const [downloadUrl, downloadInit] = (global.fetch as jest.Mock).mock.calls[0];
      expect(downloadUrl).toContain('/drive/v3/files/abc123');
      expect(downloadUrl).toContain('alt=media');
      expect(downloadInit.method).toBe('GET');
      expect(downloadInit.headers['Authorization']).toBe('Bearer mock-token');

      const [metadataUrl] = (global.fetch as jest.Mock).mock.calls[1];
      expect(metadataUrl).toContain('/drive/v3/files/abc123?fields=modifiedTime');
    });

    // GD-05
    it('returns file bytes and metadata modifiedTime', async () => {
      const bytes = new Uint8Array([4, 5, 6]);
      global.fetch = mockDownloadResponses(bytes, '2026-01-01T00:00:00Z');

      const result = await provider.download('abc123');

      expect(result.data).toEqual(bytes);
      expect(result.modifiedTime).toBe('2026-01-01T00:00:00Z');
    });

    // GD-06
    it('throws NOT_FOUND on 404', async () => {
      global.fetch = mockFetchError(404);

      await expect(provider.download('missing')).rejects.toThrow(CloudStorageError);
      await expect(provider.download('missing')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('list', () => {
    // GD-07
    it('sends correct request to Drive', async () => {
      global.fetch = mockFetchSuccess({ files: [] });

      await provider.list();

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toContain('spaces=appDataFolder');
      expect(url).toContain('files%28id%2Cname%2CmodifiedTime%29');
      expect(init.method).toBe('GET');
      expect(init.headers['Authorization']).toBe('Bearer mock-token');
    });

    // GD-08
    it('parses response into DriveFileInfo[]', async () => {
      const files = [
        { id: 'f1', name: 'db1', modifiedTime: '2026-01-01T00:00:00Z' },
        { id: 'f2', name: 'db2', modifiedTime: '2026-02-01T00:00:00Z' },
      ];
      global.fetch = mockFetchSuccess({ files });

      const result = await provider.list();

      expect(result).toEqual([
        { fileId: 'f1', name: 'db1', modifiedTime: '2026-01-01T00:00:00Z' },
        { fileId: 'f2', name: 'db2', modifiedTime: '2026-02-01T00:00:00Z' },
      ]);
    });
  });

  describe('delete', () => {
    // GD-09
    it('succeeds on 204', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        status: 204,
        headers: createMockHeaders(),
      });

      await expect(provider.delete('abc123')).resolves.toBeUndefined();
    });

    // GD-10
    it('is idempotent on 404 and clears metadata', async () => {
      global.fetch = mockFetchError(404);

      await expect(provider.delete('nonexistent')).resolves.toBeUndefined();
      expect(metadataTracker.clearCloudFileMetadata).toHaveBeenCalledTimes(1);
    });

    // GD-11
    it('calls clearCloudFileMetadata on successful delete', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        status: 204,
        headers: createMockHeaders(),
      });

      await provider.delete('abc123');

      expect(metadataTracker.clearCloudFileMetadata).toHaveBeenCalledTimes(1);
    });
  });

  describe('token handling', () => {
    // TK-01
    it('throws NOT_AUTHENTICATED when token is null', async () => {
      const noTokenProvider = new GoogleDriveProvider(
        createMockTokenRefresher(null),
        metadataTracker,
      );

      await expect(noTokenProvider.upload(new Uint8Array([1]), 'db')).rejects.toMatchObject({
        code: 'NOT_AUTHENTICATED',
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    // TK-02
    it('proceeds when token is valid', async () => {
      global.fetch = mockFetchSuccess({ id: 'f1', modifiedTime: 't1' });

      await provider.upload(new Uint8Array([1]), 'db');

      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(init.headers['Authorization']).toBe('Bearer mock-token');
    });
  });

  describe('retry logic', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
    });

    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    // RT-01: HTTP 429 retries 5 times with exponential backoff
    it('retries 5 times on 429 with exponential backoff', async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ status: 429, headers: createMockHeaders() })
        .mockResolvedValueOnce({ status: 429, headers: createMockHeaders() })
        .mockResolvedValueOnce({ status: 429, headers: createMockHeaders() })
        .mockResolvedValueOnce({ status: 429, headers: createMockHeaders() })
        .mockResolvedValueOnce({ status: 429, headers: createMockHeaders() })
        .mockResolvedValueOnce({
          status: 200,
          json: jest.fn().mockResolvedValue({ id: 'f1', modifiedTime: 't1' }),
          headers: createMockHeaders(),
        });

      const uploadPromise = provider.upload(new Uint8Array([1]), 'db');

      await jest.runAllTimersAsync();

      const result = await uploadPromise;

      expect(global.fetch).toHaveBeenCalledTimes(6);
      expect(result.fileId).toBe('f1');
    });

    // RT-02: HTTP 429 max retries exhausted → RATE_LIMITED
    it('throws RATE_LIMITED after 429 retries exhausted', async () => {
      global.fetch = jest.fn().mockResolvedValue({ status: 429, headers: createMockHeaders() });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).sleep = jest.fn().mockResolvedValue(undefined);

      await expect(provider.upload(new Uint8Array([1]), 'db')).rejects.toMatchObject({
        code: 'RATE_LIMITED',
      });
      expect(global.fetch).toHaveBeenCalledTimes(6);
    }, 10000);

    // RT-03: HTTP 5xx retries 3 times
    it('retries 3 times on 5xx with exponential backoff', async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ status: 500, headers: createMockHeaders() })
        .mockResolvedValueOnce({ status: 500, headers: createMockHeaders() })
        .mockResolvedValueOnce({ status: 500, headers: createMockHeaders() })
        .mockResolvedValueOnce({
          status: 200,
          json: jest.fn().mockResolvedValue({ id: 'f1', modifiedTime: 't1' }),
          headers: createMockHeaders(),
        });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).sleep = jest.fn().mockResolvedValue(undefined);

      const result = await provider.upload(new Uint8Array([1]), 'db');

      expect(global.fetch).toHaveBeenCalledTimes(4);
      expect(result.fileId).toBe('f1');
    }, 10000);

    // RT-04: HTTP 5xx max retries exhausted → SERVER_ERROR
    it('throws SERVER_ERROR after 5xx retries exhausted', async () => {
      global.fetch = jest.fn().mockResolvedValue({ status: 503, headers: createMockHeaders() });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).sleep = jest.fn().mockResolvedValue(undefined);

      await expect(provider.upload(new Uint8Array([1]), 'db')).rejects.toMatchObject({
        code: 'SERVER_ERROR',
      });
      expect(global.fetch).toHaveBeenCalledTimes(4);
    }, 10000);

    // RT-05: HTTP 401 triggers token refresh + single retry
    it('refreshes token on 401 and retries once', async () => {
      (tokenRefresher.forceRefreshAccessToken as jest.Mock).mockResolvedValue('new-token');

      global.fetch = jest.fn()
        .mockResolvedValueOnce({ status: 401, headers: createMockHeaders() })
        .mockResolvedValueOnce({
          status: 200,
          json: jest.fn().mockResolvedValue({ id: 'f1', modifiedTime: 't1' }),
          headers: createMockHeaders(),
        });

      const result = await provider.upload(new Uint8Array([1]), 'db');

      expect(tokenRefresher.forceRefreshAccessToken).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result.fileId).toBe('f1');
    });

    // RT-06: HTTP 401 retry also fails → NOT_AUTHENTICATED
    it('throws NOT_AUTHENTICATED when 401 retry also fails', async () => {
      (tokenRefresher.forceRefreshAccessToken as jest.Mock).mockResolvedValue('new-token');

      global.fetch = jest.fn()
        .mockResolvedValueOnce({ status: 401, headers: createMockHeaders() })
        .mockResolvedValueOnce({ status: 401, headers: createMockHeaders() });

      await expect(provider.upload(new Uint8Array([1]), 'db')).rejects.toMatchObject({
        code: 'NOT_AUTHENTICATED',
      });
      expect(tokenRefresher.forceRefreshAccessToken).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    // RT-07: Network error (TypeError) → no retry
    it('throws NETWORK on TypeError (fetch failure)', async () => {
      global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(provider.upload(new Uint8Array([1]), 'db')).rejects.toMatchObject({
        code: 'NETWORK',
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
