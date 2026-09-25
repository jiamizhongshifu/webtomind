/**
 * Web auth context.
 * Keeps Supabase session state in sync with the workspace API and extension bridge.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef
} from 'react';
import { createLogger } from '@/utils/logger';
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js';

const log = createLogger('AuthContext');
import { useNavigate } from 'react-router-dom';
import { getSupabase } from '@/services/supabase-client';
import { setAccessToken } from '@/services/workspace-api';
import { setAuthToken } from '@/services/agent-api';
import { clearAllCache, setCurrentUserId } from '@/services/workspace-cache';
import { preloadUserAvatar } from '@/shared/avatar-utils';
import { isE2EAuthBypassEnabled } from '@/utils/env';
import { recordClientConversionEvent } from '../lib/client-conversion-events';
import { getAnalyticsSessionId, setAnalyticsUserId } from '../lib/analytics';
import { primeReferralShareCode } from '../lib/referral-share';
import { getReferralInviteInfo } from '@/services/referral-api';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signInWithEmail: (
    email: string,
    password: string
  ) => Promise<{ error: Error | null }>;
  signUpWithEmail: (
    email: string,
    password: string
  ) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signInWithGoogleIdToken: (
    token: string,
    nonce?: string
  ) => Promise<{ error: Error | null }>;
  signInWithApple: () => Promise<{ error: Error | null }>;
  signInWithMicrosoft: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  getAccessToken: () => string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const PENDING_REFERRAL_CODE_KEY = 'webtomind:pending-referral-code';

function seedLocalPreviewState(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem('webtomind:local-auth-preview', '1');
  } catch (error) {
    log.warn('[Auth] Failed to seed local preview state:', error);
  }
}

async function applyPendingReferral(accessToken: string): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  const pendingCode = sessionStorage.getItem(PENDING_REFERRAL_CODE_KEY);
  if (!pendingCode) {
    return;
  }

  try {
    const response = await fetch('/api/membership/referral', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ code: pendingCode })
    });

    if (response.ok) {
      sessionStorage.removeItem(PENDING_REFERRAL_CODE_KEY);
      return;
    }

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    const errorMessage = payload.error || '';
    const isTerminalError =
      errorMessage === 'Already referred' ||
      errorMessage === 'Cannot refer yourself' ||
      errorMessage === 'Invalid referral code';

    if (isTerminalError) {
      sessionStorage.removeItem(PENDING_REFERRAL_CODE_KEY);
    }
  } catch (error) {
    log.warn('[Auth] Failed to apply pending referral code:', error);
  }
}

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const lastUserIdRef = useRef<string | null>(null);

  // 登录后预取分享邀请码，让分享链接能带 `ref` 而不阻塞 UI。
  useEffect(() => {
    if (!user) return;
    primeReferralShareCode(async () => {
      const info = await getReferralInviteInfo();
      return info.referralCode;
    });
  }, [user]);

  // Initialize auth state and keep extension token sync up to date.
  useEffect(() => {
    log.info('[Auth] AuthProvider useEffect starting...');

    if (isE2EAuthBypassEnabled()) {
      seedLocalPreviewState();

      const fakeUser = {
        id: 'e2e-user',
        email: 'e2e@webtomind.test',
        user_metadata: {
          name: 'E2E User',
          picture:
            'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22128%22 height=%22128%22 viewBox=%220 0 128 128%22%3E%3Crect width=%22128%22 height=%22128%22 rx=%2264%22 fill=%22%23171717%22/%3E%3Ctext x=%2264%22 y=%2276%22 text-anchor=%22middle%22 font-family=%22Arial%22 font-size=%2244%22 font-weight=%22700%22 fill=%22white%22%3EE%3C/text%3E%3C/svg%3E',
          avatar_url:
            'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22128%22 height=%22128%22 viewBox=%220 0 128 128%22%3E%3Crect width=%22128%22 height=%22128%22 rx=%2264%22 fill=%22%23171717%22/%3E%3Ctext x=%2264%22 y=%2276%22 text-anchor=%22middle%22 font-family=%22Arial%22 font-size=%2244%22 font-weight=%22700%22 fill=%22white%22%3EE%3C/text%3E%3C/svg%3E'
        },
        app_metadata: { provider: 'e2e' }
      } as unknown as User;
      const fakeSession = {
        access_token: 'e2e-access-token',
        refresh_token: 'e2e-refresh-token',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: fakeUser
      } as Session;

      queueMicrotask(() => {
        setSession(fakeSession);
        setUser(fakeUser);
        setAccessToken(fakeSession.access_token);
        setAuthToken(fakeSession.access_token);
        setCurrentUserId(fakeUser.id);
        lastUserIdRef.current = fakeUser.id;
        setIsLoading(false);
      });
      return;
    }

    let supabase;
    try {
      supabase = getSupabase();
      log.info('[Auth] Supabase client obtained');
    } catch (error) {
      log.error('[Auth] Failed to get Supabase client:', error);
      queueMicrotask(() => setIsLoading(false));
      return;
    }

    // Load the initial Supabase session.
    log.info('[Auth] Calling getSession...');
    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        log.info(
          '[Auth] Initial session:',
          session ? 'Found' : 'None',
          error ? `Error: ${error.message}` : ''
        );
        if (error) {
          log.error('[Auth] Session error details:', error);
        }
        if (session) {
          log.info(
            '[Auth] Session user:',
            session.user?.email,
            session.user?.id
          );

          // Seed lastUserIdRef so the initial SIGNED_IN event does not look
          // like a user switch and clear the just-loaded workspace cache.
          const userId = session.user.id;
          if (lastUserIdRef.current === null) {
            lastUserIdRef.current = userId;
            log.info('[Auth] Pre-set lastUserIdRef to:', userId);
          }

          // Post the initial session to the extension bridge after React has
          // committed state updates.
          setTimeout(() => {
            try {
              const targetUser = session.user;
              // Google OAuth can expose either picture or avatar_url.
              const avatarUrl =
                targetUser.user_metadata?.picture ||
                targetUser.user_metadata?.avatar_url;

              window.postMessage(
                {
                  type: 'AUTH_SUCCESS',
                  token: session.access_token,
                  refreshToken: session.refresh_token,
                  user: {
                    id: targetUser.id,
                    email: targetUser.email,
                    avatar_url: avatarUrl,
                    // Preserve provider metadata for extension consumers.
                    ...targetUser.user_metadata
                  }
                },
                window.location.origin
              );
              log.info(
                '[Auth] Sent AUTH_SUCCESS postMessage on initial session load'
              );
            } catch (err) {
              log.error('[Auth] Failed to send initial postMessage:', err);
            }
          }, 100);
        }
        setSession(session);
        setUser(session?.user ?? null);
        // Share the token with workspace and agent API clients.
        setAccessToken(session?.access_token ?? null);
        setAuthToken(session?.access_token ?? null);
        // Keep workspace cache partitioned by authenticated user.
        const userId = session?.user?.id ?? null;
        setCurrentUserId(userId);
        lastUserIdRef.current = userId;
        setIsLoading(false);
      })
      .catch((err) => {
        log.error('[Auth] Failed to get session:', err);
        setIsLoading(false);
      });

    // Throttle auth-state bridge requests from the extension.
    let lastAuthRequestTime = 0;
    let cachedSession: Session | null = null;
    const AUTH_REQUEST_THROTTLE_MS = 5000;

    const handleAuthStateRequest = (event: MessageEvent) => {
      // Only accept same-origin bridge messages.
      if (event.origin !== window.location.origin) {
        return;
      }

      const sendAuthSuccess = (session: Session) => {
        const avatarUrl =
          session.user.user_metadata?.picture ||
          session.user.user_metadata?.avatar_url;
        window.postMessage(
          {
            type: 'AUTH_SUCCESS',
            token: session.access_token,
            refreshToken: session.refresh_token,
            user: {
              id: session.user.id,
              email: session.user.email,
              avatar_url: avatarUrl,
              ...session.user.user_metadata
            }
          },
          window.location.origin
        );
        log.info('[Auth] Sent AUTH_SUCCESS to extension');
      };

      // Extension bridge can request the latest auth state.
      if (event.data?.type === 'REQUEST_AUTH_STATE') {
        const now = Date.now();

        // Reply from cache when repeated bridge requests arrive too quickly.
        if (now - lastAuthRequestTime < AUTH_REQUEST_THROTTLE_MS) {
          log.info('[Auth] REQUEST_AUTH_STATE throttled, using cached session');
          if (cachedSession) {
            sendAuthSuccess(cachedSession);
          }
          return;
        }

        lastAuthRequestTime = now;
        log.info('[Auth] Received REQUEST_AUTH_STATE from extension');

        // Refresh the session before replying if the token is near expiry.
        supabase.auth
          .getSession()
          .then(({ data: { session: currentSession } }) => {
            if (!currentSession) {
              log.info('[Auth] No active session to send');
              return;
            }

            // Cache the latest session for throttled follow-up requests.
            cachedSession = currentSession;

            // Refresh shortly before expiry to avoid passing stale tokens.
            const expiresAt = currentSession.expires_at;
            const nowSec = Math.floor(Date.now() / 1000);
            const isExpiringSoon = expiresAt && expiresAt - nowSec < 300;

            if (isExpiringSoon) {
              // Token is expiring soon.
              log.info('[Auth] Token expiring soon, refreshing...');
              supabase.auth
                .refreshSession()
                .then(
                  ({
                    data: { session: refreshedSession, user: refreshedUser },
                    error
                  }) => {
                    if (error || !refreshedSession || !refreshedUser) {
                      log.error('[Auth] Failed to refresh session:', error);
                      // Fall back to the current session if refresh fails.
                      sendAuthSuccess(currentSession);
                      return;
                    }
                    cachedSession = refreshedSession;
                    sendAuthSuccess(refreshedSession);
                  }
                );
            } else {
              // Current token is still fresh enough.
              log.info('[Auth] Using current session (not expiring soon)');
              sendAuthSuccess(currentSession);
            }
          });
      }
    };

    window.addEventListener('message', handleAuthStateRequest);

    // Bridge listener cleanup.
    const cleanup = () => {
      window.removeEventListener('message', handleAuthStateRequest);
    };

    // Subscribe to future Supabase auth state changes.
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        log.info(
          '[Auth] State change:',
          event,
          'Session:',
          session ? 'exists' : 'null'
        );
        if (session) {
          log.info('[Auth] Session details:', {
            user_id: session.user.id,
            email: session.user.email,
            provider: session.user.app_metadata?.provider,
            confirmed_at: session.user.email_confirmed_at
          });
        }

        setSession(session);
        setUser(session?.user ?? null);
        // Share the latest token with API clients.
        setAccessToken(session?.access_token ?? null);
        setAuthToken(session?.access_token ?? null);
        setAnalyticsUserId(session?.user.id ?? null);
        setIsLoading(false);

        // Handle sign-in side effects.
        if (event === 'SIGNED_IN' && session) {
          log.info('[Auth] User signed in successfully:', session.user.email);

          void applyPendingReferral(session.access_token);
          void recordClientConversionEvent(session.access_token, {
            eventName: 'identity_linked',
            entityType: 'user',
            entityId: session.user.id,
            idempotencyKey: getAnalyticsSessionId(),
            metadata: { authenticated: true }
          });

          // Compare user ids so a real account switch clears cached data.
          const newUserId = session.user.id;
          if (
            lastUserIdRef.current !== null &&
            lastUserIdRef.current !== newUserId
          ) {
            // Clear cached workspace data when the authenticated user changes.
            log.info('[Auth] User switched, clearing workspace cache:', {
              from: lastUserIdRef.current,
              to: newUserId
            });
            clearAllCache();
          }
          // Bind workspace cache to the current user.
          setCurrentUserId(newUserId);
          lastUserIdRef.current = newUserId;

          // Push the signed-in session to the extension bridge.
          try {
            // Google OAuth can expose either picture or avatar_url.
            const avatarUrl =
              session.user.user_metadata?.picture ||
              session.user.user_metadata?.avatar_url;

            window.postMessage(
              {
                type: 'AUTH_SUCCESS',
                token: session.access_token,
                refreshToken: session.refresh_token,
                user: {
                  id: session.user.id,
                  email: session.user.email,
                  avatar_url: avatarUrl
                }
              },
              window.location.origin
            );
            log.info(
              '[Auth] Sent AUTH_SUCCESS postMessage to sync token with extension'
            );
          } catch (error) {
            log.error('[Auth] Failed to send postMessage:', error);
          }

          // Honor a stored post-login redirect; otherwise send authenticated
          // web entry points into the creator workspace.
          const currentPath = window.location.pathname;
          const savedRedirect = sessionStorage.getItem(
            'webtomind:post-login-redirect'
          );
          if (savedRedirect) {
            sessionStorage.removeItem('webtomind:post-login-redirect');
            navigate(savedRedirect, { replace: true });
            return;
          }
          const isMultiLangHomePage =
            currentPath.startsWith('/zh-CN/') ||
            currentPath.startsWith('/en-US/');
          if (
            !isMultiLangHomePage &&
            (currentPath === '/' ||
              currentPath === '/login' ||
              currentPath === '/auth/callback')
          ) {
            log.info(
              '[Auth] Redirecting to /create after login from:',
              currentPath
            );
            navigate('/create', { replace: true });
          }
        }

        // Clear tokens on sign-out.
        if (event === 'SIGNED_OUT') {
          log.info('[Auth] User signed out');
          setAccessToken(null);
          setAuthToken(null);

          // Clear workspace cache after logout.
          if (lastUserIdRef.current !== null) {
            clearAllCache();
            setCurrentUserId(null);
            lastUserIdRef.current = null;
            log.info('[Auth] Workspace cache cleared on logout');
          }

          // Notify the extension bridge about logout.
          try {
            window.postMessage(
              {
                type: 'AUTH_LOGOUT'
              },
              window.location.origin
            );
            log.info(
              '[Auth] Sent AUTH_LOGOUT postMessage to sync logout with extension'
            );
          } catch (error) {
            log.error('[Auth] Failed to send logout postMessage:', error);
          }
        }

        // User profile metadata changed.
        if (event === 'USER_UPDATED') {
          log.info('[Auth] User updated');
        }
        if (event === 'TOKEN_REFRESHED' && session) {
          log.info('[Auth] Token refreshed, syncing to extension...');
          // Forward refreshed tokens to the extension bridge.
          try {
            const avatarUrl =
              session.user.user_metadata?.picture ||
              session.user.user_metadata?.avatar_url;
            window.postMessage(
              {
                type: 'AUTH_SUCCESS',
                token: session.access_token,
                refreshToken: session.refresh_token,
                user: {
                  id: session.user.id,
                  email: session.user.email,
                  avatar_url: avatarUrl
                }
              },
              window.location.origin
            );
            log.info('[Auth] Sent refreshed token to extension');
          } catch (err) {
            log.error('[Auth] Failed to sync refreshed token:', err);
          }
        }
      }
    );

    return () => {
      cleanup();
      subscription.unsubscribe();
    };
  }, [navigate]);

  // Email/password sign-in.
  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      try {
        const supabase = getSupabase();
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        return { error: error as Error | null };
      } catch (error) {
        return { error: error as Error };
      }
    },
    []
  );

  // Email/password sign-up.
  const signUpWithEmail = useCallback(
    async (email: string, password: string) => {
      try {
        const supabase = getSupabase();
        const { error } = await supabase.auth.signUp({
          email,
          password
        });
        return { error: error as Error | null };
      } catch (error) {
        return { error: error as Error };
      }
    },
    []
  );

  // Google OAuth sign-in.
  const signInWithGoogle = useCallback(async () => {
    try {
      const supabase = getSupabase();
      // Preserve extension context through the OAuth callback.
      const urlParams = new URLSearchParams(window.location.search);
      const fromExtension =
        urlParams.get('from') === 'extension' ||
        sessionStorage.getItem('webtomind:auth-from-extension') === '1';
      if (fromExtension) {
        sessionStorage.removeItem('webtomind:auth-from-extension');
      }
      const redirectTo = fromExtension
        ? `${window.location.origin}/auth/callback?from=extension`
        : `${window.location.origin}/auth/callback`;

      log.info('[Auth] Starting Google OAuth');
      log.info('[Auth] Redirect URL:', redirectTo);
      log.info('[Auth] Current URL:', window.location.href);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent'
          }
        }
      });

      if (error) {
        log.error('[Auth] Google OAuth error:', error);
        log.error('[Auth] Error details:', {
          message: error.message,
          status: error.status,
          name: error.name
        });
      } else {
        log.info('[Auth] OAuth data:', data);
      }

      return { error: error as Error | null };
    } catch (error) {
      log.error('[Auth] Google OAuth exception:', error);
      return { error: error as Error };
    }
  }, []);

  const signInWithGoogleIdToken = useCallback(
    async (token: string, nonce?: string) => {
      try {
        const supabase = getSupabase();
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token,
          nonce
        });
        return { error: error as Error | null };
      } catch (error) {
        log.error('[Auth] Google ID token sign-in exception:', error);
        return { error: error as Error };
      }
    },
    []
  );

  // Apple OAuth sign-in.
  const signInWithApple = useCallback(async () => {
    try {
      const supabase = getSupabase();
      const urlParams = new URLSearchParams(window.location.search);
      const from = urlParams.get('from');
      const redirectTo =
        from === 'extension'
          ? `${window.location.origin}/auth/callback?from=extension`
          : `${window.location.origin}/auth/callback`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo
        }
      });
      return { error: error as Error | null };
    } catch (error) {
      return { error: error as Error };
    }
  }, []);

  // Microsoft (Entra ID) OAuth sign-in.
  const signInWithMicrosoft = useCallback(async () => {
    try {
      const supabase = getSupabase();
      // Preserve extension context through the OAuth callback.
      const urlParams = new URLSearchParams(window.location.search);
      const fromExtension =
        urlParams.get('from') === 'extension' ||
        sessionStorage.getItem('webtomind:auth-from-extension') === '1';
      if (fromExtension) {
        sessionStorage.removeItem('webtomind:auth-from-extension');
      }
      const redirectTo = fromExtension
        ? `${window.location.origin}/auth/callback?from=extension`
        : `${window.location.origin}/auth/callback`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: {
          redirectTo
        }
      });
      return { error: error as Error | null };
    } catch (error) {
      log.error('[Auth] Microsoft OAuth exception:', error);
      return { error: error as Error };
    }
  }, []);

  // Sign out.
  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    await supabase.auth.signOut();
  }, []);

  // Current access token for API calls.
  const getAccessToken = useCallback(() => {
    return session?.access_token ?? null;
  }, [session]);

  useEffect(() => {
    if (!user) return;
    void preloadUserAvatar(user, { fetchPriority: 'high' });
  }, [
    user,
    user?.id,
    user?.user_metadata?.avatar_url,
    user?.user_metadata?.picture
  ]);

  const value: AuthContextType = {
    user,
    session,
    isLoading,
    isAuthenticated: !!user,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signInWithGoogleIdToken,
    signInWithApple,
    signInWithMicrosoft,
    signOut,
    getAccessToken
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Auth context hook.
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
