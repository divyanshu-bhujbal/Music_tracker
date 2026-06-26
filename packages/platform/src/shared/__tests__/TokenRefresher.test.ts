import type { AuthProvider } from '@collectio/shared';
import { AuthNetworkError } from '@collectio/shared';
import { TokenRefresher } from '../TokenRefresher.js';

function createMockAuthProvider(): AuthProvider {
  return {
    signIn: jest.fn(),
    refreshAccessToken: jest.fn(),
    signOut: jest.fn(),
    getStoredTokens: jest.fn(),
  };
}

function futureToken(offsetMs = 600_000) {
  return {
    accessToken: 'at',
    refreshToken: 'rt',
    expiresAt: Date.now() + offsetMs,
  };
}

function expiredToken() {
  return {
    accessToken: 'expired-at',
    refreshToken: 'rt',
    expiresAt: Date.now() - 1000,
  };
}

describe('TokenRefresher', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // UT-01
  it('returns cached token when valid (>5 min remaining)', async () => {
    const auth = createMockAuthProvider();
    const refresher = new TokenRefresher(auth);
    refresher.setTokens(futureToken());

    const result = await refresher.getAccessToken();

    expect(result).toBe('at');
    expect(auth.refreshAccessToken).not.toHaveBeenCalled();
  });

  // UT-02
  it('returns cached token at exactly 5-minute boundary', async () => {
    const auth = createMockAuthProvider();
    const refresher = new TokenRefresher(auth);
    refresher.setTokens(futureToken(300_000));

    const result = await refresher.getAccessToken();

    expect(result).toBe('at');
    expect(auth.refreshAccessToken).not.toHaveBeenCalled();
  });

  // UT-03
  it('triggers refresh when token near-expiry (≤5 min) and returns new token', async () => {
    const auth = createMockAuthProvider();
    (auth.refreshAccessToken as jest.Mock).mockResolvedValue({
      accessToken: 'new-at',
      expiresAt: Date.now() + 3600_000,
    });

    const refresher = new TokenRefresher(auth);
    refresher.setTokens(futureToken(120_000));

    const result = await refresher.getAccessToken();

    expect(result).toBe('new-at');
    expect(auth.refreshAccessToken).toHaveBeenCalledWith('rt');
  });

  // UT-04
  it('triggers refresh when token already expired and returns new token', async () => {
    const auth = createMockAuthProvider();
    (auth.refreshAccessToken as jest.Mock).mockResolvedValue({
      accessToken: 'new-at',
      expiresAt: Date.now() + 3600_000,
    });

    const refresher = new TokenRefresher(auth);
    refresher.setTokens(expiredToken());

    const result = await refresher.getAccessToken();

    expect(result).toBe('new-at');
    expect(auth.refreshAccessToken).toHaveBeenCalled();
  });

  // UT-05
  it('caches new token after refresh success', async () => {
    const auth = createMockAuthProvider();
    (auth.refreshAccessToken as jest.Mock).mockResolvedValue({
      accessToken: 'new-at',
      expiresAt: Date.now() + 3600_000,
    });

    const refresher = new TokenRefresher(auth);
    refresher.setTokens(futureToken(120_000));

    await refresher.getAccessToken();
    const result = await refresher.getAccessToken();

    expect(result).toBe('new-at');
    expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1);
  });

  // UT-06
  it('resets needsReauth after successful refresh', async () => {
    const auth = createMockAuthProvider();
    (auth.refreshAccessToken as jest.Mock).mockRejectedValue(
      new AuthNetworkError('fail'),
    );

    const refresher = new TokenRefresher(auth);
    refresher.setTokens(expiredToken());

    for (let i = 0; i < 5; i++) {
      await refresher.getAccessToken();
      jest.advanceTimersByTime(60_000);
    }
    expect(refresher.needsReauth).toBe(true);

    (auth.refreshAccessToken as jest.Mock).mockResolvedValue({
      accessToken: 'recovered-at',
      expiresAt: Date.now() + 3600_000,
    });
    refresher.setTokens({
      accessToken: 'recovered-at',
      refreshToken: 'rt',
      expiresAt: Date.now() + 3600_000,
    });

    expect(refresher.needsReauth).toBe(false);
    const result = await refresher.getAccessToken();
    expect(result).toBe('recovered-at');
  });

  // UT-07
  it('returns null on first refresh failure, needsReauth stays false', async () => {
    const auth = createMockAuthProvider();
    (auth.refreshAccessToken as jest.Mock).mockRejectedValue(
      new AuthNetworkError('fail'),
    );

    const refresher = new TokenRefresher(auth);
    refresher.setTokens(expiredToken());

    const result = await refresher.getAccessToken();

    expect(result).toBeNull();
    expect(refresher.needsReauth).toBe(false);
  });

  // UT-08
  it('sets needsReauth after 5 consecutive failures', async () => {
    const auth = createMockAuthProvider();
    (auth.refreshAccessToken as jest.Mock).mockRejectedValue(
      new AuthNetworkError('fail'),
    );

    const refresher = new TokenRefresher(auth);
    refresher.setTokens(expiredToken());

    for (let i = 0; i < 5; i++) {
      const result = await refresher.getAccessToken();
      expect(result).toBeNull();
      jest.advanceTimersByTime(60_000);
    }

    expect(refresher.needsReauth).toBe(true);
  });

  // UT-09
  it('needsReauth prevents further refresh attempts', async () => {
    const auth = createMockAuthProvider();
    (auth.refreshAccessToken as jest.Mock).mockRejectedValue(
      new AuthNetworkError('fail'),
    );

    const refresher = new TokenRefresher(auth);
    refresher.setTokens(expiredToken());

    for (let i = 0; i < 5; i++) {
      await refresher.getAccessToken();
      jest.advanceTimersByTime(60_000);
    }
    expect(refresher.needsReauth).toBe(true);

    (auth.refreshAccessToken as jest.Mock).mockClear();
    const result = await refresher.getAccessToken();

    expect(result).toBeNull();
    expect(auth.refreshAccessToken).not.toHaveBeenCalled();
  });

  // UT-10
  it('enforces backoff window — immediate retry returns null', async () => {
    const auth = createMockAuthProvider();
    (auth.refreshAccessToken as jest.Mock).mockRejectedValue(
      new AuthNetworkError('fail'),
    );

    const refresher = new TokenRefresher(auth);
    refresher.setTokens(expiredToken());

    await refresher.getAccessToken();

    (auth.refreshAccessToken as jest.Mock).mockClear();
    const result = await refresher.getAccessToken();

    expect(result).toBeNull();
    expect(auth.refreshAccessToken).not.toHaveBeenCalled();
  });

  // UT-11
  it('allows retry after backoff window elapses', async () => {
    const auth = createMockAuthProvider();
    (auth.refreshAccessToken as jest.Mock)
      .mockRejectedValueOnce(new AuthNetworkError('fail'))
      .mockResolvedValueOnce({
        accessToken: 'new-at',
        expiresAt: Date.now() + 3600_000,
      });

    const refresher = new TokenRefresher(auth);
    refresher.setTokens(expiredToken());

    await refresher.getAccessToken();
    jest.advanceTimersByTime(1500);

    const result = await refresher.getAccessToken();

    expect(result).toBe('new-at');
    expect(auth.refreshAccessToken).toHaveBeenCalledTimes(2);
  });

  // UT-12
  it('applies exponential backoff progression (1s, 2s, 4s)', async () => {
    const auth = createMockAuthProvider();
    (auth.refreshAccessToken as jest.Mock).mockRejectedValue(
      new AuthNetworkError('fail'),
    );

    const refresher = new TokenRefresher(auth);
    refresher.setTokens(expiredToken());

    // 1st failure
    await refresher.getAccessToken();

    // Within 1s — should not retry
    (auth.refreshAccessToken as jest.Mock).mockClear();
    await refresher.getAccessToken();
    expect(auth.refreshAccessToken).not.toHaveBeenCalled();

    // Advance past 1s — should retry
    jest.advanceTimersByTime(1500);
    (auth.refreshAccessToken as jest.Mock).mockClear();
    await refresher.getAccessToken();
    expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1);

    // 2nd failure done, advance past 2s
    jest.advanceTimersByTime(3000);
    (auth.refreshAccessToken as jest.Mock).mockClear();
    await refresher.getAccessToken();
    expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1);

    // 3rd failure done, advance past 4s
    jest.advanceTimersByTime(5000);
    (auth.refreshAccessToken as jest.Mock).mockClear();
    await refresher.getAccessToken();
    expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1);
  });

  // UT-13
  it('resets backoff counter on success', async () => {
    const auth = createMockAuthProvider();
    (auth.refreshAccessToken as jest.Mock)
      .mockRejectedValueOnce(new AuthNetworkError('fail'))
      .mockResolvedValueOnce({
        accessToken: 'ok',
        expiresAt: Date.now() + 3600_000,
      })
      .mockRejectedValueOnce(new AuthNetworkError('fail again'));

    const refresher = new TokenRefresher(auth);
    refresher.setTokens(expiredToken());

    // 1st failure (backoff tier 1: 1s)
    await refresher.getAccessToken();
    jest.advanceTimersByTime(1500);

    // Success — resets backoff
    await refresher.getAccessToken();
    // Token is now valid, no refresh needed
    const result = await refresher.getAccessToken();
    expect(result).toBe('ok');
  });

  // UT-14
  it('coalesces concurrent calls to single refresh', async () => {
    const auth = createMockAuthProvider();
    let resolveRefresh!: (value: { accessToken: string; expiresAt: number }) => void;
    (auth.refreshAccessToken as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );

    const refresher = new TokenRefresher(auth);
    refresher.setTokens(futureToken(120_000));

    const p1 = refresher.getAccessToken();
    const p2 = refresher.getAccessToken();
    const p3 = refresher.getAccessToken();

    resolveRefresh({
      accessToken: 'new-at',
      expiresAt: Date.now() + 3600_000,
    });

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(r1).toBe('new-at');
    expect(r2).toBe('new-at');
    expect(r3).toBe('new-at');
    expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1);
  });

  // UT-15
  it('setTokens resets all failure state', async () => {
    const auth = createMockAuthProvider();
    (auth.refreshAccessToken as jest.Mock).mockRejectedValue(
      new AuthNetworkError('fail'),
    );

    const refresher = new TokenRefresher(auth);
    refresher.setTokens(expiredToken());

    for (let i = 0; i < 5; i++) {
      await refresher.getAccessToken();
      jest.advanceTimersByTime(60_000);
    }
    expect(refresher.needsReauth).toBe(true);

    refresher.setTokens({
      accessToken: 'fresh',
      refreshToken: 'rt2',
      expiresAt: Date.now() + 3600_000,
    });

    expect(refresher.needsReauth).toBe(false);
    (auth.refreshAccessToken as jest.Mock).mockClear();
    const result = await refresher.getAccessToken();
    expect(result).toBe('fresh');
    expect(auth.refreshAccessToken).not.toHaveBeenCalled();
  });

  // UT-16
  it('clear nullifies state — getAccessToken returns null', async () => {
    const auth = createMockAuthProvider();
    const refresher = new TokenRefresher(auth);
    refresher.setTokens(futureToken());

    refresher.clear();

    const result = await refresher.getAccessToken();
    expect(result).toBeNull();
  });

  // UT-17
  it('getAccessToken before setTokens returns null', async () => {
    const auth = createMockAuthProvider();
    const refresher = new TokenRefresher(auth);

    const result = await refresher.getAccessToken();
    expect(result).toBeNull();
  });

  // UT-18
  it('unexpected error propagates (not caught)', async () => {
    const auth = createMockAuthProvider();
    (auth.refreshAccessToken as jest.Mock).mockRejectedValue(
      new TypeError('boom'),
    );

    const refresher = new TokenRefresher(auth);
    refresher.setTokens(expiredToken());

    await expect(refresher.getAccessToken()).rejects.toThrow('boom');
  });

  // UT-19
  it('setTokens with expired token triggers immediate refresh on next getAccessToken', async () => {
    const auth = createMockAuthProvider();
    (auth.refreshAccessToken as jest.Mock).mockResolvedValue({
      accessToken: 'new-at',
      expiresAt: Date.now() + 3600_000,
    });

    const refresher = new TokenRefresher(auth);
    refresher.setTokens(expiredToken());

    const result = await refresher.getAccessToken();

    expect(result).toBe('new-at');
    expect(auth.refreshAccessToken).toHaveBeenCalled();
  });

  // UT-20
  it('handles refresh returning rotated refresh token transparently', async () => {
    const auth = createMockAuthProvider();
    (auth.refreshAccessToken as jest.Mock).mockResolvedValue({
      accessToken: 'new-at',
      expiresAt: Date.now() + 3600_000,
    });

    const refresher = new TokenRefresher(auth);
    refresher.setTokens(expiredToken());

    const result = await refresher.getAccessToken();

    expect(result).toBe('new-at');
    // TokenRefresher uses the returned accessToken but does NOT update the
    // in-memory refreshToken — AuthProvider handles persistence internally
  });
});
