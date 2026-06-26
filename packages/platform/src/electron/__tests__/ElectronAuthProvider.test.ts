import { createHash } from 'node:crypto';

let mockServerHandlers: Array<(req: { url?: string }, res: { writeHead: jest.Mock; end: jest.Mock }) => void> = [];
let mockServerClose: jest.Mock;

jest.mock('node:http', () => {
  mockServerClose = jest.fn().mockImplementation((cb?: () => void) => {
    if (cb) cb();
    return mockServer;
  });
  const mockServer = {
    listen: jest.fn().mockImplementation((_port: number, _host: string, cb: () => void) => {
      setTimeout(() => cb(), 0);
      return mockServer;
    }),
    close: mockServerClose,
    on: jest.fn().mockImplementation(() => {
      return mockServer;
    }),
    address: jest.fn().mockReturnValue({ port: 12345 }),
  };

  return {
    createServer: jest.fn().mockImplementation(
      (handler?: (req: { url?: string }, res: { writeHead: jest.Mock; end: jest.Mock }) => void) => {
        if (handler) {
          mockServerHandlers.push(handler);
        }
        return mockServer;
      },
    ),
  };
});

jest.mock('electron', () => ({
  shell: {
    openExternal: jest.fn(),
  },
}));

jest.mock('google-auth-library', () => {
  const mockGetToken = jest.fn();
  const mockRefreshAccessToken = jest.fn();
  const mockSetCredentials = jest.fn();

  return {
    OAuth2Client: jest.fn().mockImplementation(() => ({
      getToken: mockGetToken,
      refreshAccessToken: mockRefreshAccessToken,
      setCredentials: mockSetCredentials,
    })),
    __mockGetToken: mockGetToken,
    __mockRefreshAccessToken: mockRefreshAccessToken,
    __mockSetCredentials: mockSetCredentials,
  };
});

import { shell } from 'electron';
import { OAuth2Client } from 'google-auth-library';
import { ElectronAuthProvider } from '../ElectronAuthProvider.js';
import { base64urlEncode } from '../ElectronAuthProvider.js';
import type { SecureStorageProvider } from '@collectio/shared';
import { AuthCancelledError, AuthNetworkError } from '@collectio/shared';

const mockShell = jest.mocked(shell);

function createMockStorage(): SecureStorageProvider & {
  store: jest.Mock;
  retrieve: jest.Mock;
  delete: jest.Mock;
  clear: jest.Mock;
} {
  return {
    store: jest.fn().mockResolvedValue(undefined),
    retrieve: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
  };
}

const DEFAULT_CONFIG = {
  clientId: 'test-client-id.apps.googleusercontent.com',
  redirectUri: 'http://localhost:12345',
  scopes: ['https://www.googleapis.com/auth/drive.appdata'],
};

describe('ElectronAuthProvider', () => {
  let provider: ElectronAuthProvider;
  let storage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockServerHandlers = [];
    storage = createMockStorage();
    provider = new ElectronAuthProvider(storage, DEFAULT_CONFIG);
    mockShell.openExternal.mockResolvedValue(undefined as never);
  });

  describe('UT-01: PKCE code_verifier generation', () => {
    it('generates a valid base64url-encoded 43-character string', () => {
      const verifier = (provider as unknown as { generateCodeVerifier(): string }).generateCodeVerifier();
      expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('generates different verifiers on each call', () => {
      const v1 = (provider as unknown as { generateCodeVerifier(): string }).generateCodeVerifier();
      const v2 = (provider as unknown as { generateCodeVerifier(): string }).generateCodeVerifier();
      expect(v1).not.toBe(v2);
    });
  });

  describe('UT-02: PKCE code_challenge computation', () => {
    it('produces correct SHA-256 hash of the verifier', () => {
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const challenge = (provider as unknown as { computeCodeChallenge(v: string): string }).computeCodeChallenge(verifier);

      const expectedHash = createHash('sha256').update(verifier).digest();
      const expectedChallenge = base64urlEncode(expectedHash);

      expect(challenge).toBe(expectedChallenge);
    });
  });

  describe('UT-03: Auth URL construction', () => {
    it('builds URL with all required parameters', () => {
      const challenge = 'test-challenge';
      const redirectUri = 'http://localhost:54321';
      const url = (provider as unknown as { buildAuthUrl(c: string, r: string): string }).buildAuthUrl(challenge, redirectUri);
      const parsed = new URL(url);

      expect(parsed.origin).toBe('https://accounts.google.com');
      expect(parsed.searchParams.get('client_id')).toBe(DEFAULT_CONFIG.clientId);
      expect(parsed.searchParams.get('redirect_uri')).toBe(redirectUri);
      expect(parsed.searchParams.get('response_type')).toBe('code');
      expect(parsed.searchParams.get('scope')).toBe(DEFAULT_CONFIG.scopes.join(' '));
      expect(parsed.searchParams.get('code_challenge')).toBe(challenge);
      expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
      expect(parsed.searchParams.get('prompt')).toBe('consent');
      expect(parsed.searchParams.get('access_type')).toBe('offline');
    });
  });

  describe('UT-04: signIn() success path', () => {
    it('returns AuthTokens and stores all three keys', async () => {
      const mockTokens = {
        access_token: 'access-123',
        refresh_token: 'refresh-456',
        expiry_date: 1719000000000,
      };

      const mockGetToken = jest.fn().mockResolvedValue({ tokens: mockTokens });
      (OAuth2Client as unknown as jest.Mock).mockImplementation(() => ({
        getToken: mockGetToken,
        refreshAccessToken: jest.fn(),
        setCredentials: jest.fn(),
      }));

      const signInPromise = provider.signIn();

      // Wait for port discovery and server.listen to fire
      await new Promise<void>((r) => setTimeout(r, 50));

      // Trigger the auth callback server with a code
      const authHandler = mockServerHandlers[mockServerHandlers.length - 1];
      const mockRes = { writeHead: jest.fn(), end: jest.fn() };
      authHandler({ url: '/?code=auth-code-abc' }, mockRes);

      const tokens = await signInPromise;

      expect(tokens).toEqual({
        accessToken: 'access-123',
        refreshToken: 'refresh-456',
        expiresAt: 1719000000000,
      });

      expect(storage.store).toHaveBeenCalledTimes(3);
      expect(storage.store).toHaveBeenCalledWith('auth_access_token', 'access-123');
      expect(storage.store).toHaveBeenCalledWith('auth_refresh_token', 'refresh-456');
      expect(storage.store).toHaveBeenCalledWith('auth_expires_at', '1719000000000');

      expect(mockRes.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
      expect(mockRes.end).toHaveBeenCalled();
    });
  });

  describe('UT-05: signIn() cancelled', () => {
    it('throws AuthCancelledError on timeout', async () => {
      jest.useFakeTimers();

      try {
        const signInPromise = provider.signIn();

        // Catch the rejection to prevent unhandled rejection during timer advance
        signInPromise.catch(() => {});

        // Let microtasks flush (port discovery, server.listen)
        await jest.advanceTimersByTimeAsync(50);

        // Now advance past the 5-minute timeout
        await jest.advanceTimersByTimeAsync(5 * 60 * 1000);

        await expect(signInPromise).rejects.toThrow(AuthCancelledError);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('UT-06: signIn() token exchange network error', () => {
    it('throws AuthNetworkError on getToken failure', async () => {
      const mockGetToken = jest.fn().mockRejectedValue(new Error('network error'));
      (OAuth2Client as unknown as jest.Mock).mockImplementation(() => ({
        getToken: mockGetToken,
        refreshAccessToken: jest.fn(),
        setCredentials: jest.fn(),
      }));

      const signInPromise = provider.signIn();

      // Wait for port discovery and server.listen to fire
      await new Promise<void>((r) => setTimeout(r, 50));

      const authHandler = mockServerHandlers[mockServerHandlers.length - 1];
      const mockRes = { writeHead: jest.fn(), end: jest.fn() };
      authHandler({ url: '/?code=auth-code-abc' }, mockRes);

      await expect(signInPromise).rejects.toThrow(AuthNetworkError);
    });
  });

  describe('UT-07: signIn() token exchange Google error', () => {
    it('throws AuthNetworkError on invalid_grant', async () => {
      const mockGetToken = jest.fn().mockRejectedValue(new Error('invalid_grant'));
      (OAuth2Client as unknown as jest.Mock).mockImplementation(() => ({
        getToken: mockGetToken,
        refreshAccessToken: jest.fn(),
        setCredentials: jest.fn(),
      }));

      const signInPromise = provider.signIn();

      // Wait for port discovery and server.listen to fire
      await new Promise<void>((r) => setTimeout(r, 50));

      const authHandler = mockServerHandlers[mockServerHandlers.length - 1];
      const mockRes = { writeHead: jest.fn(), end: jest.fn() };
      authHandler({ url: '/?code=auth-code-abc' }, mockRes);

      await expect(signInPromise).rejects.toThrow(AuthNetworkError);
    });
  });

  describe('UT-08: signIn() openExternal fails', () => {
    it('throws AuthNetworkError when browser fails to open', async () => {
      mockShell.openExternal.mockRejectedValue(new Error('failed') as never);

      await expect(provider.signIn()).rejects.toThrow(AuthNetworkError);
      await expect(provider.signIn()).rejects.toThrow('Failed to open browser');
    });

    it('throws AuthNetworkError when openExternal rejects', async () => {
      mockShell.openExternal.mockRejectedValue(new Error('permission denied') as never);

      await expect(provider.signIn()).rejects.toThrow(AuthNetworkError);
    });
  });

  describe('UT-09: refreshAccessToken() success', () => {
    it('returns new access token and stores it', async () => {
      const mockRefreshAccessToken = jest.fn().mockResolvedValue({
        credentials: {
          access_token: 'new-access-789',
          expiry_date: 1719001000000,
          refresh_token: undefined,
        },
      });
      (OAuth2Client as unknown as jest.Mock).mockImplementation(() => ({
        getToken: jest.fn(),
        refreshAccessToken: mockRefreshAccessToken,
        setCredentials: jest.fn(),
      }));

      const result = await provider.refreshAccessToken('old-refresh-token');

      expect(result).toEqual({
        accessToken: 'new-access-789',
        expiresAt: 1719001000000,
      });

      expect(storage.store).toHaveBeenCalledWith('auth_access_token', 'new-access-789');
      expect(storage.store).toHaveBeenCalledWith('auth_expires_at', '1719001000000');
    });

    it('updates refresh token when Google rotates it', async () => {
      const mockRefreshAccessToken = jest.fn().mockResolvedValue({
        credentials: {
          access_token: 'new-access-789',
          expiry_date: 1719001000000,
          refresh_token: 'rotated-refresh-token',
        },
      });
      (OAuth2Client as unknown as jest.Mock).mockImplementation(() => ({
        getToken: jest.fn(),
        refreshAccessToken: mockRefreshAccessToken,
        setCredentials: jest.fn(),
      }));

      await provider.refreshAccessToken('old-refresh-token');

      expect(storage.store).toHaveBeenCalledWith('auth_refresh_token', 'rotated-refresh-token');
    });
  });

  describe('UT-10: refreshAccessToken() failure', () => {
    it('throws AuthNetworkError on refresh failure', async () => {
      const mockRefreshAccessToken = jest.fn().mockRejectedValue(new Error('token refresh failed'));
      (OAuth2Client as unknown as jest.Mock).mockImplementation(() => ({
        getToken: jest.fn(),
        refreshAccessToken: mockRefreshAccessToken,
        setCredentials: jest.fn(),
      }));

      await expect(provider.refreshAccessToken('old-refresh-token')).rejects.toThrow(AuthNetworkError);
    });
  });

  describe('UT-11: signOut() clears tokens', () => {
    it('deletes all three storage keys', async () => {
      await provider.signOut();

      expect(storage.delete).toHaveBeenCalledTimes(3);
      expect(storage.delete).toHaveBeenCalledWith('auth_access_token');
      expect(storage.delete).toHaveBeenCalledWith('auth_refresh_token');
      expect(storage.delete).toHaveBeenCalledWith('auth_expires_at');
    });
  });

  describe('UT-12: signOut() idempotent', () => {
    it('swallows "does not exist" errors from storage.delete', async () => {
      storage.delete.mockRejectedValue(new Error('Item with given key does not exist'));

      await expect(provider.signOut()).resolves.toBeUndefined();
    });

    it('rethrows non-"does not exist" errors', async () => {
      storage.delete.mockRejectedValue(new Error('disk failure'));

      await expect(provider.signOut()).rejects.toThrow('disk failure');
    });
  });

  describe('UT-13: getStoredTokens() returns stored tokens', () => {
    it('returns AuthTokens when all three keys are present', async () => {
      storage.retrieve.mockImplementation(async (key: string) => {
        if (key === 'auth_access_token') return 'stored-access';
        if (key === 'auth_refresh_token') return 'stored-refresh';
        if (key === 'auth_expires_at') return '1719000000000';
        return null;
      });

      const tokens = await provider.getStoredTokens();

      expect(tokens).toEqual({
        accessToken: 'stored-access',
        refreshToken: 'stored-refresh',
        expiresAt: 1719000000000,
      });
    });
  });

  describe('UT-14: getStoredTokens() returns null — missing keys', () => {
    it('returns null when no keys are stored', async () => {
      storage.retrieve.mockResolvedValue(null);

      const tokens = await provider.getStoredTokens();
      expect(tokens).toBeNull();
    });
  });

  describe('UT-15: getStoredTokens() returns null — partial keys', () => {
    it('returns null when only access token is stored', async () => {
      storage.retrieve.mockImplementation(async (key: string) => {
        if (key === 'auth_access_token') return 'stored-access';
        return null;
      });

      const tokens = await provider.getStoredTokens();
      expect(tokens).toBeNull();
    });
  });
});
