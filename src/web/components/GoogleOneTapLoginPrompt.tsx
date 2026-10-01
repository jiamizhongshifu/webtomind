import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { createLogger } from '@/utils/logger';
import {
  dismissGoogleLoginPromptForSession,
  isGoogleLoginPromptDismissed
} from '../lib/google-login-prompt-session';
import { GoogleIcon } from './GoogleIcon';
import '../styles/google-one-tap-prompt.css';

const log = createLogger('GoogleOneTapLoginPrompt');

const GOOGLE_IDENTITY_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

type CredentialResponse = {
  credential?: string;
  select_by?: string;
};

type PromptMomentNotification = {
  isNotDisplayed: () => boolean;
  isSkippedMoment: () => boolean;
  isDismissedMoment: () => boolean;
  getNotDisplayedReason: () => string;
  getSkippedReason: () => string;
  getDismissedReason: () => string;
};

type GoogleIdentity = {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: CredentialResponse) => void;
        nonce?: string;
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
        itp_support?: boolean;
        use_fedcm_for_prompt?: boolean;
      }) => void;
      prompt: (
        momentListener?: (notification: PromptMomentNotification) => void
      ) => void;
      cancel: () => void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

interface GoogleOneTapLoginPromptProps {
  enabled: boolean;
  redirectPath: string;
  variant?: 'default' | 'compact';
  className?: string;
  // 原生 Google One Tap 由 Google 控制位置（桌面默认右上角），无法自定义。
  // 置为 true 时跳过原生提示，直接展示居中的登录弹窗。
  preferInlineCard?: boolean;
  onCredentialLogin: (
    token: string,
    nonce?: string
  ) => Promise<{ error: Error | null }>;
  onFallbackLogin: () => Promise<{ error: Error | null }>;
}

let googleIdentityScriptPromise: Promise<void> | null = null;

function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Identity is browser-only'));
  }

  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }

  if (googleIdentityScriptPromise) {
    return googleIdentityScriptPromise;
  }

  googleIdentityScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${GOOGLE_IDENTITY_SCRIPT_SRC}"]`
    );

    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener(
        'error',
        () => reject(new Error('Failed to load Google Identity script')),
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.src = GOOGLE_IDENTITY_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error('Failed to load Google Identity script'));
    document.head.appendChild(script);
  });

  return googleIdentityScriptPromise;
}

async function generateNonce(): Promise<[string, string]> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = btoa(String.fromCharCode(...bytes));
  const encodedNonce = new TextEncoder().encode(nonce);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encodedNonce);
  const hashedNonce = Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return [nonce, hashedNonce];
}

export function GoogleOneTapLoginPrompt({
  enabled,
  redirectPath,
  variant = 'default',
  className = '',
  preferInlineCard = false,
  onCredentialLogin,
  onFallbackLogin
}: GoogleOneTapLoginPromptProps) {
  const [fallbackVisible, setFallbackVisible] = useState(false);
  const [fallbackSubmitting, setFallbackSubmitting] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const dismissedRef = useRef(isGoogleLoginPromptDismissed());
  const closeTimerRef = useRef<number | null>(null);
  const titleId = useId();
  const subtitleId = useId();

  const showFallback = useCallback(() => {
    if (dismissedRef.current || isGoogleLoginPromptDismissed()) return;
    setFallbackVisible(true);
  }, []);

  const dismissFallback = useCallback(() => {
    dismissedRef.current = true;
    dismissGoogleLoginPromptForSession();
    setFallbackVisible(false);
    setErrorText('');
    window.google?.accounts?.id.cancel();
  }, []);

  const requestClose = useCallback(() => {
    if (closeTimerRef.current !== null) return;
    dismissedRef.current = true;
    dismissGoogleLoginPromptForSession();
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setIsClosing(false);
      dismissFallback();
    }, 180);
  }, [dismissFallback]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const handleFallbackLogin = useCallback(async () => {
    setErrorText('');
    setFallbackSubmitting(true);
    try {
      sessionStorage.setItem('webtomind:post-login-redirect', redirectPath);
      const { error } = await onFallbackLogin();
      if (error) {
        setErrorText(error.message);
      }
    } finally {
      setFallbackSubmitting(false);
    }
  }, [onFallbackLogin, redirectPath]);

  useEffect(() => {
    if (!enabled || dismissedRef.current || isGoogleLoginPromptDismissed()) {
      setFallbackVisible(false);
      setErrorText('');
      window.google?.accounts?.id.cancel();
      return;
    }

    if (preferInlineCard) {
      setFallbackVisible(false);
      setErrorText('');
      showFallback();
      return;
    }

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
    let cancelled = false;

    if (!clientId) {
      if (import.meta.env.DEV) {
        log.warn('[GoogleOneTap] Missing VITE_GOOGLE_CLIENT_ID');
      }
      showFallback();
      setErrorText('');
      return;
    }

    setFallbackVisible(false);
    setErrorText('');

    void (async () => {
      try {
        const [nonce, hashedNonce] = await generateNonce();
        await loadGoogleIdentityScript();
        if (
          cancelled ||
          isGoogleLoginPromptDismissed() ||
          !window.google?.accounts?.id
        )
          return;

        window.google.accounts.id.initialize({
          client_id: clientId,
          nonce: hashedNonce,
          auto_select: false,
          cancel_on_tap_outside: false,
          itp_support: true,
          use_fedcm_for_prompt: true,
          callback: (response) => {
            if (
              cancelled ||
              dismissedRef.current ||
              isGoogleLoginPromptDismissed()
            )
              return;
            if (!response.credential) {
              showFallback();
              return;
            }

            setErrorText('');
            sessionStorage.setItem(
              'webtomind:post-login-redirect',
              redirectPath
            );
            void onCredentialLogin(response.credential, nonce).then(
              ({ error }) => {
                if (
                  cancelled ||
                  dismissedRef.current ||
                  isGoogleLoginPromptDismissed()
                )
                  return;
                if (error) {
                  log.error('[GoogleOneTap] Credential login failed:', error);
                  setErrorText(error.message);
                  showFallback();
                } else {
                  window.google?.accounts?.id.cancel();
                }
              }
            );
          }
        });

        window.google.accounts.id.prompt((notification) => {
          if (
            cancelled ||
            dismissedRef.current ||
            isGoogleLoginPromptDismissed()
          )
            return;
          if (
            notification.isNotDisplayed() ||
            notification.isSkippedMoment() ||
            notification.isDismissedMoment()
          ) {
            log.info('[GoogleOneTap] Prompt moment:', {
              notDisplayedReason: notification.getNotDisplayedReason(),
              skippedReason: notification.getSkippedReason(),
              dismissedReason: notification.getDismissedReason()
            });
            showFallback();
          }
        });
      } catch (error) {
        log.error('[GoogleOneTap] Failed to initialize:', error);
        if (!cancelled) {
          showFallback();
          setErrorText(error instanceof Error ? error.message : String(error));
        }
      }
    })();

    return () => {
      cancelled = true;
      window.google?.accounts?.id.cancel();
    };
  }, [
    enabled,
    onCredentialLogin,
    preferInlineCard,
    redirectPath,
    showFallback
  ]);

  const promptVisible = enabled && fallbackVisible;

  // This is a non-modal suggestion: do not trap focus or lock page scrolling.
  useEffect(() => {
    if (!promptVisible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [promptVisible, requestClose]);

  if (!promptVisible) {
    return null;
  }

  const isEnglish = redirectPath.startsWith('/en-US');
  const copy = isEnglish
    ? {
        title: 'Sign in with Google',
        subtitle: 'Save your work, open your workspace and keep creating.',
        pending: 'Opening Google...',
        cta: 'Continue with Google'
      }
    : {
        title: '使用 Google 账号登录 WebToMind',
        subtitle: '登录后可以保存内容、进入工作台并继续创作。',
        pending: '正在打开 Google...',
        cta: '使用 Google 继续'
      };
  const fallbackClassName = [
    'global-google-login-fallback',
    variant !== 'default' ? `global-google-login-fallback--${variant}` : '',
    isClosing ? 'global-google-login-fallback--closing' : '',
    className
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={fallbackClassName}
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={subtitleId}
    >
      <button
        type="button"
        className="global-google-login-fallback-close"
        onClick={requestClose}
        aria-label={isEnglish ? 'Dismiss sign in prompt' : '关闭登录提示'}
      >
        <X size={18} aria-hidden="true" />
      </button>
      <strong id={titleId} className="global-google-login-fallback-title">
        {copy.title}
      </strong>
      <p id={subtitleId} className="global-google-login-fallback-subtitle">
        {copy.subtitle}
      </p>
      <button
        type="button"
        className="global-google-login-fallback-button"
        onClick={() => void handleFallbackLogin()}
        disabled={fallbackSubmitting}
        aria-busy={fallbackSubmitting}
      >
        <span
          className="global-google-login-fallback-button-icon"
          aria-hidden="true"
        >
          <GoogleIcon size={19} />
        </span>
        <span className="global-google-login-fallback-button-label">
          {fallbackSubmitting ? copy.pending : copy.cta}
        </span>
      </button>
      {errorText && (
        <p className="global-google-login-error" role="alert">
          {errorText}
        </p>
      )}
    </div>
  );
}
