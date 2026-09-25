import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { AuthProvider, useAuth } from '../AuthContext';

const authMock = vi.hoisted(() => ({
  callback: null as
    | null
    | ((event: AuthChangeEvent, session: Session | null) => void),
  initialSession: null as Session | null,
  setAccessToken: vi.fn(),
  setAuthToken: vi.fn(),
  clearAllCache: vi.fn(),
  setCurrentUserId: vi.fn(),
  unsubscribe: vi.fn(),
  signOut: vi.fn(async () => ({ error: null }))
}));

vi.mock('@/services/supabase-client', () => ({
  getSupabase: () => ({
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: authMock.initialSession },
        error: null
      })),
      onAuthStateChange: vi.fn(
        (
          callback: (event: AuthChangeEvent, session: Session | null) => void
        ) => {
          authMock.callback = callback;
          return {
            data: { subscription: { unsubscribe: authMock.unsubscribe } }
          };
        }
      ),
      signOut: authMock.signOut,
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signInWithOAuth: vi.fn(),
      signInWithIdToken: vi.fn(),
      refreshSession: vi.fn()
    }
  })
}));

vi.mock('@/services/workspace-api', () => ({
  setAccessToken: authMock.setAccessToken
}));

vi.mock('@/services/agent-api', () => ({
  setAuthToken: authMock.setAuthToken
}));

vi.mock('@/services/workspace-cache', () => ({
  clearAllCache: authMock.clearAllCache,
  setCurrentUserId: authMock.setCurrentUserId
}));

vi.mock('@/shared/avatar-utils', () => ({
  preloadUserAvatar: vi.fn(async () => undefined)
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  })
}));

function createSession(token: string): Session {
  const user = {
    id: 'auth-user',
    email: 'auth@webtomind.test',
    app_metadata: { provider: 'google' },
    user_metadata: { name: 'Auth User' },
    aud: 'authenticated',
    created_at: '2026-07-10T00:00:00.000Z'
  } as User;

  return {
    access_token: token,
    refresh_token: `${token}-refresh`,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user
  };
}

function AuthProbe() {
  const auth = useAuth();
  return (
    <output aria-label="auth-state">
      {auth.isLoading
        ? 'loading'
        : `${auth.isAuthenticated ? 'authenticated' : 'signed-out'}:${
            auth.getAccessToken() || 'none'
          }`}
    </output>
  );
}

describe('AuthProvider session transitions', () => {
  beforeEach(() => {
    authMock.initialSession = createSession('initial-token');
    authMock.callback = null;
    vi.clearAllMocks();
  });

  it('publishes refreshed tokens and clears the authenticated state on sign out', async () => {
    render(
      <MemoryRouter initialEntries={['/zh-CN/create/image']}>
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText('auth-state')).toHaveTextContent(
        'authenticated:initial-token'
      );
    });

    const refreshedSession = createSession('refreshed-token');
    act(() => {
      authMock.callback?.('TOKEN_REFRESHED', refreshedSession);
    });

    expect(screen.getByLabelText('auth-state')).toHaveTextContent(
      'authenticated:refreshed-token'
    );
    expect(authMock.setAccessToken).toHaveBeenLastCalledWith('refreshed-token');
    expect(authMock.setAuthToken).toHaveBeenLastCalledWith('refreshed-token');

    act(() => {
      authMock.callback?.('SIGNED_OUT', null);
    });

    expect(screen.getByLabelText('auth-state')).toHaveTextContent(
      'signed-out:none'
    );
    expect(authMock.setAccessToken).toHaveBeenLastCalledWith(null);
    expect(authMock.setAuthToken).toHaveBeenLastCalledWith(null);
    expect(authMock.clearAllCache).toHaveBeenCalledTimes(1);
    expect(authMock.setCurrentUserId).toHaveBeenLastCalledWith(null);
  });
});
