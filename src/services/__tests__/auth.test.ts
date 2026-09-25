import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const AUTH_STORAGE_KEY = 'auth_state';

interface TestAuthState {
  token: string | null;
  refreshToken: string | null;
  user: { id: string; email: string } | null;
  isAuthenticated: boolean;
}

function createJwt(expSecondsFromNow: number): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  const payload = btoa(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expSecondsFromNow })
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return `${header}.${payload}.signature`;
}

describe('auth getAuthState cache behavior', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses forceStorage to bypass stale in-memory auth cache', async () => {
    const validToken = createJwt(3600);

    let storageState: TestAuthState = {
      token: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false
    };

    const localGet = vi.fn(async () => ({
      [AUTH_STORAGE_KEY]: storageState
    }));

    const localSet = vi.fn(async (payload: Record<string, unknown>) => {
      const nextState = payload[AUTH_STORAGE_KEY];
      if (nextState && typeof nextState === 'object') {
        storageState = nextState as typeof storageState;
      }
    });

    const localRemove = vi.fn(async () => {
      storageState = {
        token: null,
        refreshToken: null,
        user: null,
        isAuthenticated: false
      };
    });

    const syncGet = vi.fn(async () => ({
      [AUTH_STORAGE_KEY]: storageState
    }));

    const syncSet = vi.fn(async (payload: Record<string, unknown>) => {
      const nextState = payload[AUTH_STORAGE_KEY];
      if (nextState && typeof nextState === 'object') {
        storageState = nextState as typeof storageState;
      }
    });

    const syncRemove = vi.fn(async () => {
      storageState = {
        token: null,
        refreshToken: null,
        user: null,
        isAuthenticated: false
      };
    });

    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: localGet,
          set: localSet,
          remove: localRemove
        },
        sync: {
          get: syncGet,
          set: syncSet,
          remove: syncRemove
        }
      }
    });

    const auth = await import('@/services/auth');

    const first = await auth.getAuthState();
    expect(first.isAuthenticated).toBe(false);

    storageState = {
      token: validToken,
      refreshToken: 'refresh-token',
      user: { id: 'u1', email: 'user@example.com' },
      isAuthenticated: true
    };

    const cached = await auth.getAuthState();
    expect(cached.isAuthenticated).toBe(false);
    expect(cached.token).toBeNull();

    const refreshed = await auth.getAuthState({ forceStorage: true });
    expect(refreshed.isAuthenticated).toBe(true);
    expect(refreshed.token).toBe(validToken);
    expect(localGet).toHaveBeenCalled();
  });
});


describe('auth direct refresh fallback', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function setupChrome(storageState: TestAuthState) {
    const localGet = vi.fn(async () => ({
      [AUTH_STORAGE_KEY]: storageState
    }));

    const localSet = vi.fn(async (payload: Record<string, unknown>) => {
      const nextState = payload[AUTH_STORAGE_KEY];
      if (nextState && typeof nextState === 'object') {
        storageState = nextState as typeof storageState;
      }
    });

    const localRemove = vi.fn(async () => {
      storageState = {
        token: null,
        refreshToken: null,
        user: null,
        isAuthenticated: false
      };
    });

    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: localGet,
          set: localSet,
          remove: localRemove
        },
        sync: {
          get: vi.fn(async () => ({ [AUTH_STORAGE_KEY]: storageState })),
          set: vi.fn(async () => undefined),
          remove: vi.fn(async () => undefined)
        }
      },
      tabs: {
        query: vi.fn(async () => []),
        create: vi.fn(async () => ({ id: 99 })),
        remove: vi.fn(async () => undefined),
        sendMessage: vi.fn(async () => undefined)
      },
      runtime: {
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn()
        },
        getManifest: vi.fn(() => ({ content_scripts: [] }))
      },
      scripting: {
        executeScript: vi.fn(async () => undefined)
      }
    });

    return {
      getState: () => storageState
    };
  }

  it('refreshes token directly when no website tab is open', async () => {
    const stateRef = setupChrome({
      token: createJwt(-3600),
      refreshToken: 'refresh-token',
      user: { id: 'u1', email: 'user@example.com' },
      isAuthenticated: true
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/config')) {
        return {
          ok: true,
          json: async () => ({
            supabase: {
              url: 'https://demo.supabase.co',
              anonKey: 'anon-key'
            }
          })
        };
      }

      if (url.includes('/auth/v1/token?grant_type=refresh_token')) {
        return {
          ok: true,
          json: async () => ({
            access_token: createJwt(3600),
            refresh_token: 'refresh-token-2',
            user: {
              id: 'u1',
              email: 'user@example.com',
              user_metadata: { username: 'user' }
            }
          })
        };
      }

      throw new Error('Unexpected fetch: ' + url);
    });
    vi.stubGlobal('fetch', fetchMock);

    const auth = await import('@/services/auth');
    const refreshed = await auth.requestTokenRefresh({
      openWebPageIfMissing: false
    });

    expect(refreshed).toBe(true);
    expect(stateRef.getState().token).toBeTruthy();
    expect(stateRef.getState().refreshToken).toBe('refresh-token-2');
    expect(fetchMock).toHaveBeenCalled();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes('/auth/v1/token?grant_type=refresh_token')
      )
    ).toBe(true);
  });

  it('keeps refresh token and user hints when expired token recovery fails', async () => {
    const stateRef = setupChrome({
      token: createJwt(-3600),
      refreshToken: 'refresh-token',
      user: { id: 'u1', email: 'user@example.com' },
      isAuthenticated: true
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/config')) {
        return {
          ok: true,
          json: async () => ({
            supabase: {
              url: 'https://demo.supabase.co',
              anonKey: 'anon-key'
            }
          })
        };
      }

      if (url.includes('/auth/v1/token?grant_type=refresh_token')) {
        return {
          ok: false,
          status: 401,
          text: async () => 'invalid refresh token'
        };
      }

      throw new Error('Unexpected fetch: ' + url);
    });
    vi.stubGlobal('fetch', fetchMock);

    const auth = await import('@/services/auth');
    const token = await auth.getValidAccessToken();
    const nextState = await auth.getAuthState({ forceStorage: true });

    expect(token).toBeNull();
    expect(nextState.token).toBeNull();
    expect(nextState.refreshToken).toBe('refresh-token');
    expect(nextState.user).toEqual({ id: 'u1', email: 'user@example.com' });
    expect(nextState.isAuthenticated).toBe(false);
    expect(stateRef.getState().refreshToken).toBe('refresh-token');
  });
});
