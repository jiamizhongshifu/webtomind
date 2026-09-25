/**
 * OAuth 回调页面
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createLogger } from '@/utils/logger';
import { safeRuntimeSendMessage } from '@/utils/chrome-helpers';
import { useAuth } from '../contexts/AuthContext';
import { applySeo } from '../lib/seo';
import { getAuthRedirectContext, trackEvent } from '../lib/analytics';

const log = createLogger('AuthCallback');
const DEFAULT_POST_LOGIN_REDIRECT = '/create';

export function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, isLoading, session } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const trackedSuccessRef = useRef(false);
  const fromExtension = searchParams.get('from') === 'extension';

  useEffect(() => {
    return applySeo({
      title: 'Auth Callback | WebToMind',
      description: 'Processing your WebToMind sign-in callback.',
      canonical: 'https://webtomind.com/auth/callback',
      robots: 'noindex,nofollow',
      ogImage: 'https://webtomind.com/icons/logo-icon.svg',
      twitterSite: '@webtomind'
    });
  }, []);

  useEffect(() => {
    const run = async () => {
      log.info('[AuthCallback] Mounted');
      log.info('[AuthCallback] URL params:', Object.fromEntries(searchParams));
      log.info(
        '[AuthCallback] isLoading:',
        isLoading,
        'isAuthenticated:',
        isAuthenticated
      );

      const errorCode = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');
      if (errorCode) {
        log.error('[AuthCallback] OAuth error in URL:', {
          code: errorCode,
          description: errorDescription
        });
        setError(`OAuth error: ${errorDescription || errorCode}`);
        setDebugInfo(`Error code: ${errorCode}`);
        setTimeout(() => navigate('/login'), 5000);
        return;
      }

      if (isLoading) {
        setDebugInfo('Validating session...');
        return;
      }

      if (isAuthenticated && session) {
        log.info('[AuthCallback] Authenticated, session exists');
        log.info('[AuthCallback] User:', session.user.email);
        setDebugInfo(`Authenticated: ${session.user.email}`);
        const savedRedirect = sessionStorage.getItem(
          'webtomind:post-login-redirect'
        );
        const savedLoginSource =
          sessionStorage.getItem('webtomind:post-login-source') ||
          'auth_callback';
        const redirectContext = getAuthRedirectContext(savedRedirect);
        if (!trackedSuccessRef.current) {
          trackedSuccessRef.current = true;
          trackEvent('login_success', {
            method: 'google',
            cta_source: savedLoginSource,
            from_extension: fromExtension,
            redirect_context: redirectContext,
            has_redirect: Boolean(savedRedirect)
          });
          if (savedRedirect) {
            trackEvent('login_return', {
              method: 'google',
              cta_source: savedLoginSource,
              redirect_context: redirectContext
            });
          }
        }
        const redirectTarget = savedRedirect || DEFAULT_POST_LOGIN_REDIRECT;

        if (fromExtension) {
          log.info('[AuthCallback] Notifying extension');
          window.postMessage(
            {
              type: 'AUTH_SUCCESS',
              token: session.access_token,
              user: {
                id: session.user.id,
                email: session.user.email
              }
            },
            window.location.origin
          );

          if (typeof chrome !== 'undefined' && chrome.runtime) {
            await safeRuntimeSendMessage(
              {
                type: 'AUTH_SUCCESS',
                token: session.access_token,
                user: {
                  id: session.user.id,
                  email: session.user.email
                }
              },
              {
                context: 'AuthCallback AUTH_SUCCESS',
                logger: log
              }
            );
          }

          setTimeout(() => {
            log.info(
              '[AuthCallback] Redirecting after extension login:',
              redirectTarget
            );
            navigate(redirectTarget);
          }, 2000);
          return;
        }

        log.info('[AuthCallback] Redirecting after web login:', redirectTarget);
        navigate(redirectTarget);
        return;
      }

      if (!isLoading && !isAuthenticated) {
        log.error('[AuthCallback] Authentication failed');
        log.error(
          '[AuthCallback] isLoading:',
          isLoading,
          'isAuthenticated:',
          isAuthenticated,
          'session:',
          session
        );

        setError('Login failed, please try again.');
        setDebugInfo('No valid session was found.');
        setTimeout(() => {
          log.info('[AuthCallback] Redirecting to /login');
          navigate('/login');
        }, 3000);
      }
    };

    void run();
  }, [
    isAuthenticated,
    isLoading,
    session,
    navigate,
    fromExtension,
    searchParams
  ]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--web-bg-canvas)]">
        <div className="ui-state-block ui-state-block--web p-8 max-w-md w-full mx-4 text-center">
          <div className="w-16 h-16 bg-[var(--state-error-bg)] rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-[var(--state-error-text)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[var(--web-text-primary)] mb-2">
            Login failed
          </h2>
          <p className="text-[var(--web-text-secondary)] mb-2">{error}</p>
          {debugInfo && (
            <p className="text-xs text-muted-foreground mt-2 font-mono bg-[var(--web-bg-subtle)] p-2 rounded">
              {debugInfo}
            </p>
          )}
          <p className="text-sm text-muted-foreground mt-4">
            Redirecting to login...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--web-bg-canvas)]">
      <div className="ui-state-block ui-state-block--web p-8 max-w-md w-full mx-4 text-center">
        {isAuthenticated ? (
          <>
            <div className="w-16 h-16 bg-[var(--state-success-bg)] rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-[var(--state-success-text)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-[var(--web-text-primary)] mb-2">
              Login successful
            </h2>
            <p className="text-[var(--web-text-secondary)]">
              {fromExtension
                ? 'Syncing your browser extension...'
                : 'Redirecting to your workspace...'}
            </p>
            {debugInfo && (
              <p className="text-xs text-muted-foreground mt-2 font-mono">
                {debugInfo}
              </p>
            )}
          </>
        ) : (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-[var(--web-border-soft)] border-t-[var(--web-brand-support)] mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold text-[var(--web-text-primary)] mb-2">
              Validating sign-in
            </h2>
            <p className="text-[var(--web-text-secondary)]">Please wait...</p>
            {debugInfo && (
              <p className="text-xs text-muted-foreground mt-2 font-mono">
                {debugInfo}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default AuthCallback;
