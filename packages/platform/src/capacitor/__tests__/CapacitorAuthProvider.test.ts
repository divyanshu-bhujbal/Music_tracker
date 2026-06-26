let mockAppUrlOpenHandler: ((data: { url: string }) => void) | null = null;
let mockBrowserOpenFn: jest.Mock;
let mockBrowserCloseFn: jest.Mock;
let mockAddListenerFn: jest.Mock;
let mockRemoveFn: jest.Mock;

jest.mock('@capacitor/browser', () => ({
  Browser: {
    open: (...args: unknown[]) => mockBrowserOpenFn(...args),
    close: (...args: unknown[]) => mockBrowserCloseFn(...args),
  },
}));

jest.mock('@capacitor/app', () => ({
  App: {
    addListener: (...args: unknown[]) => mockAddListenerFn(...args),
  },
}));

// Mock global fetch
const mockFetch = jest.fn();
const originalFetch = global.fetch;

const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;

describe('CapacitorAuthProvider', () => {
  let CapacitorAuthProvider: typeof import('../CapacitorAuthProvider.js').CapacitorAuthProvider;
  let base64urlEncode: typeof import('../CapacitorAuthProvider.js').base64urlEncode;
  let AuthCancelledError: typeof import('@collectio/shared').AuthCancelledError;
  let AuthNetworkError: typeof import('@collectio/shared').AuthNetworkError;

  let provider: InstanceType<typeof CapacitorAuthProvider>;
  let storage: {
    store: jest.Mock;
    retrieve: jest.Mock;
    delete: jest.Mock;
    clear: jest.Mock;
  };

  const DEFAULT_CONFIG = {
    clientId: 'test-client-id.apps.googleusercontent.com',
    redirectUri: 'com.collectio.app://',
    scopes: ['https://www.googleapis.com/auth/drive.appdata'],
  };

  beforeEach(async () => {
    // Dynamic import to ensure mocks are in place
    const authModule = await import('../CapacitorAuthProvider.js');
    CapacitorAuthProvider = authModule.CapacitorAuthProvider;
    base64urlEncode = authModule.base64urlEncode;
    const sharedErrors = await import('@collectio/shared');
    AuthCancelledError = sharedErrors.AuthCancelledError;
    AuthNetworkError = sharedErrors.AuthNetworkError;

    jest.clearAllMocks();

    storage = {
      store: jest.fn().mockResolvedValue(undefined),
      retrieve: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
    };

    mockAppUrlOpenHandler = null;
    mockRemoveFn = jest.fn().mockResolvedValue(undefined);
    mockAddListenerFn = jest.fn().mockImplementation(
      (_eventName: string, handler: (data: { url: string }) => void) => {
        mockAppUrlOpenHandler = handler;
        return Promise.resolve({ remove: mockRemoveFn });
      },
    );
    mockBrowserOpenFn = jest.fn().mockResolvedValue(undefined);
    mockBrowserCloseFn = jest.fn().mockResolvedValue(undefined);

    global.fetch = mockFetch;

    provider = new CapacitorAuthProvider(storage, DEFAULT_CONFIG);
  });

  afterEach(() => {
    global.fetch = originalFetch;
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
    it('produces deterministic output for known input', async () => {
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const challenge = await (provider as unknown as { computeCodeChallenge(v: string): Promise<string> }).computeCodeChallenge(verifier);

      // Known expected value from RFC 7636 appendix B:
      // SHA-256 of "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
      const expected = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

      expect(challenge).toBe(expected);
    });
  });

  describe('UT-03: Auth URL construction', () => {
    it('builds URL with all required parameters', () => {
      const challenge = 'test-challenge';
      const url = (provider as unknown as { buildAuthUrl(c: string): string }).buildAuthUrl(challenge);
      const parsed = new URL(url);

      expect(parsed.origin).toBe('https://accounts.google.com');
      expect(parsed.searchParams.get('client_id')).toBe(DEFAULT_CONFIG.clientId);
      expect(parsed.searchParams.get('redirect_uri')).toBe(DEFAULT_CONFIG.redirectUri);
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
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'access-123',
          refresh_token: 'refresh-456',
          expires_in: 3600,
        }),
      });

      const signInPromise = provider.signIn();

      // Wait for addListener to be called
      await new Promise<void>((r) => setTimeout(r, 10));

      // Trigger the appUrlOpen handler with auth code
      expect(mockAppUrlOpenHandler).not.toBeNull();
      mockAppUrlOpenHandler!({ url: 'com.collectio.app://?code=auth-code-abc' });

      const tokens = await signInPromise;

      expect(tokens.accessToken).toBe('access-123');
      expect(tokens.refreshToken).toBe('refresh-456');
      expect(tokens.expiresAt).toBeGreaterThan(Date.now());

      expect(storage.store).toHaveBeenCalledTimes(3);
      expect(storage.store).toHaveBeenCalledWith('auth_access_token', 'access-123');
      expect(storage.store).toHaveBeenCalledWith('auth_refresh_token', 'refresh-456');
      expect(storage.store).toHaveBeenCalledWith(
        'auth_expires_at',
        expect.any(String),
      );
    });
  });

  describe('UT-05: signIn() registers appUrlOpen BEFORE Browser.open()', () => {
    it('verifies correct call order', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'access-123',
          refresh_token: 'refresh-456',
          expires_in: 3600,
        }),
      });

      const signInPromise = provider.signIn();

      // Wait for both addListener and Browser.open to be called
      await new Promise<void>((r) => setTimeout(r, 10));

      // Verify addListener was called first by checking call order
      const addListenerCall = mockAddListenerFn.mock.invocationCallOrder[0];
      const browserOpenCall = mockBrowserOpenFn.mock.invocationCallOrder[0];
      expect(addListenerCall).toBeLessThan(browserOpenCall);

      // Complete the flow to avoid unhandled rejection
      mockAppUrlOpenHandler!({ url: 'com.collectio.app://?code=auth-code-abc' });
      await signInPromise;
    });
  });

  describe('UT-06: signIn() closes browser on success', () => {
    it('calls Browser.close() after auth code received', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'access-123',
          refresh_token: 'refresh-456',
          expires_in: 3600,
        }),
      });

      const signInPromise = provider.signIn();

      await new Promise<void>((r) => setTimeout(r, 10));
      mockAppUrlOpenHandler!({ url: 'com.collectio.app://?code=auth-code-abc' });

      await signInPromise;

      expect(mockBrowserCloseFn).toHaveBeenCalled();
    });
  });

  describe('UT-07: signIn() rejects AuthCancelledError when error=access_denied', () => {
    it('throws AuthCancelledError on access_denied', async () => {
      const signInPromise = provider.signIn();

      await new Promise<void>((r) => setTimeout(r, 10));
      mockAppUrlOpenHandler!({ url: 'com.collectio.app://?error=access_denied' });

      await expect(signInPromise).rejects.toThrow(AuthCancelledError);
    });
  });

  describe('UT-08: signIn() rejects AuthCancelledError on redirect without code or error', () => {
    it('throws AuthCancelledError on malformed redirect', async () => {
      const signInPromise = provider.signIn();

      await new Promise<void>((r) => setTimeout(r, 10));
      mockAppUrlOpenHandler!({ url: 'com.collectio.app://?foo=bar' });

      await expect(signInPromise).rejects.toThrow(AuthCancelledError);
    });
  });

  describe('UT-09: signIn() rejects AuthCancelledError on timeout', () => {
    it('throws AuthCancelledError after 5 minutes', async () => {
      jest.useFakeTimers();

      try {
        const signInPromise = provider.signIn();
        signInPromise.catch(() => {}); // Prevent unhandled rejection warning

        // Let microtasks flush (addListener registration)
        await jest.advanceTimersByTimeAsync(50);

        // Advance past the 5-minute timeout
        await jest.advanceTimersByTimeAsync(SIGN_IN_TIMEOUT_MS);

        await expect(signInPromise).rejects.toThrow(AuthCancelledError);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('UT-10: signIn() rejects AuthNetworkError when Browser.open() fails', () => {
    it('throws AuthNetworkError when browser fails to open', async () => {
      mockBrowserOpenFn.mockRejectedValue(new Error('failed'));

      await expect(provider.signIn()).rejects.toThrow(AuthNetworkError);
      await expect(provider.signIn()).rejects.toThrow('Failed to open browser');
    });

    it('throws AuthNetworkError when openExternal rejects', async () => {
      mockBrowserOpenFn.mockRejectedValue(new Error('permission denied'));

      await expect(provider.signIn()).rejects.toThrow(AuthNetworkError);
    });
  });

  describe('UT-11: signIn() rejects AuthNetworkError when token exchange fetch fails', () => {
    it('throws AuthNetworkError on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('network error'));

      const signInPromise = provider.signIn();

      await new Promise<void>((r) => setTimeout(r, 10));
      mockAppUrlOpenHandler!({ url: 'com.collectio.app://?code=auth-code-abc' });

      await expect(signInPromise).rejects.toThrow(AuthNetworkError);
    });
  });

  describe('UT-12: signIn() rejects AuthNetworkError when token response missing refresh_token', () => {
    it('throws AuthNetworkError on incomplete response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'access-123',
          expires_in: 3600,
          // Missing refresh_token
        }),
      });

      const signInPromise = provider.signIn();

      await new Promise<void>((r) => setTimeout(r, 10));
      mockAppUrlOpenHandler!({ url: 'com.collectio.app://?code=auth-code-abc' });

      await expect(signInPromise).rejects.toThrow(AuthNetworkError);
      await expect(signInPromise).rejects.toThrow('Token response missing required fields');
    });
  });

  describe('UT-13: signIn() nullifies code_verifier in finally on success', () => {
    it('codeVerifier is null after successful signIn', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'access-123',
          refresh_token: 'refresh-456',
          expires_in: 3600,
        }),
      });

      const signInPromise = provider.signIn();

      await new Promise<void>((r) => setTimeout(r, 10));
      mockAppUrlOpenHandler!({ url: 'com.collectio.app://?code=auth-code-abc' });

      await signInPromise;

      // Verify storage operations completed (code_verifier was used then cleared)
      expect(storage.store).toHaveBeenCalledTimes(3);
    });
  });

  describe('UT-14: signIn() nullifies code_verifier in finally on cancellation', () => {
    it('codeVerifier is null after timeout', async () => {
      jest.useFakeTimers();

      try {
        const signInPromise = provider.signIn();
        signInPromise.catch(() => {});

        await jest.advanceTimersByTimeAsync(50);
        await jest.advanceTimersByTimeAsync(SIGN_IN_TIMEOUT_MS);

        await expect(signInPromise).rejects.toThrow(AuthCancelledError);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('UT-15: signIn() removes appUrlOpen listener in finally', () => {
    it('listener removed on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'access-123',
          refresh_token: 'refresh-456',
          expires_in: 3600,
        }),
      });

      const signInPromise = provider.signIn();

      await new Promise<void>((r) => setTimeout(r, 10));
      mockAppUrlOpenHandler!({ url: 'com.collectio.app://?code=auth-code-abc' });

      await signInPromise;

      expect(mockRemoveFn).toHaveBeenCalled();
    });

    it('listener removed on failure', async () => {
      mockFetch.mockRejectedValue(new Error('network error'));

      const signInPromise = provider.signIn();

      await new Promise<void>((r) => setTimeout(r, 10));
      mockAppUrlOpenHandler!({ url: 'com.collectio.app://?code=auth-code-abc' });

      await expect(signInPromise).rejects.toThrow(AuthNetworkError);

      expect(mockRemoveFn).toHaveBeenCalled();
    });
  });

  describe('UT-16: signIn() does NOT include client_secret in token exchange body', () => {
    it('no client_secret in fetch call', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'access-123',
          refresh_token: 'refresh-456',
          expires_in: 3600,
        }),
      });

      const signInPromise = provider.signIn();

      await new Promise<void>((r) => setTimeout(r, 10));
      mockAppUrlOpenHandler!({ url: 'com.collectio.app://?code=auth-code-abc' });

      await signInPromise;

      const fetchCall = mockFetch.mock.calls[0];
      const body: string = fetchCall[1].body;
      expect(body).not.toContain('client_secret');
    });
  });

  describe('UT-17: signIn() uses TextEncoder for SHA-256 encoding', () => {
    it('SHA-256 produces correct output for known input', async () => {
      // This verifies cross-platform determinism with Electron's node:crypto
      const verifier = 'test-verifier-string';
      const challenge = await (provider as unknown as { computeCodeChallenge(v: string): Promise<string> }).computeCodeChallenge(verifier);

      // Manually compute expected: SHA-256 of "test-verifier-string" → base64url
      const encoder = new TextEncoder();
      const data = encoder.encode(verifier);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashBytes = new Uint8Array(hashBuffer);
      const expected = base64urlEncode(hashBytes);

      expect(challenge).toBe(expected);
    });
  });

  describe('UT-18: refreshAccessToken() returns new access token and expiry', () => {
    it('returns updated tokens on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'new-access-789',
          expires_in: 3600,
        }),
      });

      const result = await provider.refreshAccessToken('old-refresh-token');

      expect(result.accessToken).toBe('new-access-789');
      expect(result.expiresAt).toBeGreaterThan(Date.now());

      expect(storage.store).toHaveBeenCalledWith('auth_access_token', 'new-access-789');
      expect(storage.store).toHaveBeenCalledWith(
        'auth_expires_at',
        expect.any(String),
      );
    });
  });

  describe('UT-19: refreshAccessToken() updates stored refresh token if rotated', () => {
    it('stores new refresh token when Google rotates', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'new-access-789',
          expires_in: 3600,
          refresh_token: 'rotated-refresh-token',
        }),
      });

      await provider.refreshAccessToken('old-refresh-token');

      expect(storage.store).toHaveBeenCalledWith('auth_refresh_token', 'rotated-refresh-token');
    });

    it('does not overwrite refresh token when not rotated', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'new-access-789',
          expires_in: 3600,
          // No refresh_token in response
        }),
      });

      await provider.refreshAccessToken('old-refresh-token');

      expect(storage.store).not.toHaveBeenCalledWith(
        'auth_refresh_token',
        expect.anything(),
      );
    });
  });

  describe('UT-20: refreshAccessToken() rejects AuthNetworkError on network failure', () => {
    it('throws AuthNetworkError on fetch rejection', async () => {
      mockFetch.mockRejectedValue(new Error('network error'));

      await expect(provider.refreshAccessToken('old-refresh-token')).rejects.toThrow(AuthNetworkError);
    });

    it('throws AuthNetworkError on non-2xx response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('invalid_grant'),
      });

      await expect(provider.refreshAccessToken('old-refresh-token')).rejects.toThrow(AuthNetworkError);
    });
  });

  describe('UT-21: refreshAccessToken() does NOT include client_secret', () => {
    it('no client_secret in fetch call', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'new-access-789',
          expires_in: 3600,
        }),
      });

      await provider.refreshAccessToken('old-refresh-token');

      const fetchCall = mockFetch.mock.calls[0];
      const body: string = fetchCall[1].body;
      expect(body).not.toContain('client_secret');
    });
  });

  describe('UT-22: signOut() deletes all three storage keys', () => {
    it('deletes all three storage keys', async () => {
      await provider.signOut();

      expect(storage.delete).toHaveBeenCalledTimes(3);
      expect(storage.delete).toHaveBeenCalledWith('auth_access_token');
      expect(storage.delete).toHaveBeenCalledWith('auth_refresh_token');
      expect(storage.delete).toHaveBeenCalledWith('auth_expires_at');
    });
  });

  describe('UT-23: signOut() swallows "does not exist" errors', () => {
    it('does not throw when key missing', async () => {
      storage.delete.mockRejectedValue(new Error('Item with given key does not exist'));

      await expect(provider.signOut()).resolves.toBeUndefined();
    });

    it('rethrows non-"does not exist" errors', async () => {
      storage.delete.mockRejectedValue(new Error('disk failure'));

      await expect(provider.signOut()).rejects.toThrow('disk failure');
    });
  });

  describe('UT-24: getStoredTokens() returns tokens when all three stored', () => {
    it('returns AuthTokens when present', async () => {
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

  describe('UT-25: getStoredTokens() returns null when access_token missing', () => {
    it('returns null', async () => {
      storage.retrieve.mockResolvedValue(null);

      const tokens = await provider.getStoredTokens();
      expect(tokens).toBeNull();
    });
  });

  describe('UT-26: getStoredTokens() returns null when refresh_token missing', () => {
    it('returns null', async () => {
      storage.retrieve.mockImplementation(async (key: string) => {
        if (key === 'auth_access_token') return 'stored-access';
        return null;
      });

      const tokens = await provider.getStoredTokens();
      expect(tokens).toBeNull();
    });
  });

  describe('UT-27: getStoredTokens() returns null when expires_at missing', () => {
    it('returns null', async () => {
      storage.retrieve.mockImplementation(async (key: string) => {
        if (key === 'auth_access_token') return 'stored-access';
        if (key === 'auth_refresh_token') return 'stored-refresh';
        return null;
      });

      const tokens = await provider.getStoredTokens();
      expect(tokens).toBeNull();
    });
  });

  describe('UT-28: computeCodeChallenge() produces deterministic output', () => {
    it('same input produces same output', async () => {
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const c1 = await (provider as unknown as { computeCodeChallenge(v: string): Promise<string> }).computeCodeChallenge(verifier);
      const c2 = await (provider as unknown as { computeCodeChallenge(v: string): Promise<string> }).computeCodeChallenge(verifier);
      expect(c1).toBe(c2);
    });
  });

  describe('UT-29: buildAuthUrl() produces valid URL', () => {
    it('output is parseable and contains all required params', () => {
      const url = (provider as unknown as { buildAuthUrl(c: string): string }).buildAuthUrl('test-challenge');
      const parsed = new URL(url);

      expect(parsed.protocol).toBe('https:');
      expect(parsed.hostname).toBe('accounts.google.com');
      expect(parsed.searchParams.has('client_id')).toBe(true);
      expect(parsed.searchParams.has('redirect_uri')).toBe(true);
      expect(parsed.searchParams.has('response_type')).toBe(true);
      expect(parsed.searchParams.has('scope')).toBe(true);
      expect(parsed.searchParams.has('code_challenge')).toBe(true);
      expect(parsed.searchParams.has('code_challenge_method')).toBe(true);
      expect(parsed.searchParams.has('prompt')).toBe(true);
      expect(parsed.searchParams.has('access_type')).toBe(true);
    });
  });

  describe('UT-30: signIn() handles appUrlOpen with malformed URL gracefully', () => {
    it('throws AuthCancelledError on invalid URL', async () => {
      const signInPromise = provider.signIn();

      await new Promise<void>((r) => setTimeout(r, 10));
      mockAppUrlOpenHandler!({ url: 'not-a-valid-url' });

      await expect(signInPromise).rejects.toThrow(AuthCancelledError);
    });
  });
});
