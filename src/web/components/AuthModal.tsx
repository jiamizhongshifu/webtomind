import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  useLocation,
  useNavigate,
  type Location,
  type NavigateFunction
} from 'react-router-dom';
import { ArrowLeft, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  Button,
  Card,
  FeedbackMessage,
  FormField,
  IconButton,
  Input,
  useOverlayBehavior
} from '../../shared/ui';
import { GoogleIcon } from './GoogleIcon';
import { MicrosoftIcon } from './MicrosoftIcon';
import {
  getAuthRedirectContext,
  trackEvent,
  trackLoginStart,
  trackSignupStart
} from '../lib/analytics';
import {
  getLocaleRoutePrefix,
  isLocalizedLoginRoute
} from '@/shared/seo-route-paths';
import '../styles/auth-modal.css';

type AuthMode = 'login' | 'register';

type AuthModalOptions = {
  redirectTo?: string | null;
  source?: string | null;
  referralCode?: string | null;
  fromExtension?: boolean;
};

type AuthModalContextValue = {
  openAuthModal: (options?: AuthModalOptions) => void;
  closeAuthModal: () => void;
};

const AuthModalContext = createContext<AuthModalContextValue | undefined>(
  undefined
);

const DEFAULT_POST_LOGIN_REDIRECT = '/create';
const DEFAULT_LOGIN_BACKDROP_PATH = '/zh-CN/prompts';
const PENDING_REFERRAL_CODE_KEY = 'webtomind:pending-referral-code';

function isSafeInternalPath(path: string | null | undefined): path is string {
  return Boolean(path && path.startsWith('/') && !path.startsWith('//'));
}

function getDefaultBackdropPath(pathname: string): string {
  const localePrefix = getLocaleRoutePrefix(pathname);
  return localePrefix ? `${localePrefix}/prompts` : DEFAULT_LOGIN_BACKDROP_PATH;
}

export function parseLoginUrl(url: URL): AuthModalOptions {
  const redirectTo = url.searchParams.get('redirect');
  return {
    redirectTo: isSafeInternalPath(redirectTo) ? redirectTo : null,
    source: url.searchParams.get('source') || 'login_modal',
    referralCode: url.searchParams.get('ref')?.trim().toUpperCase() || null,
    fromExtension: url.searchParams.get('from') === 'extension'
  };
}

export function resolveAuthModalOptionsFromLocation(
  location: Location
): AuthModalOptions {
  const searchParams = new URLSearchParams(location.search);
  const redirectTo = searchParams.get('redirect');
  return {
    redirectTo: isSafeInternalPath(redirectTo) ? redirectTo : null,
    source: searchParams.get('source') || 'login_route_modal',
    referralCode: searchParams.get('ref')?.trim().toUpperCase() || null,
    fromExtension: searchParams.get('from') === 'extension'
  };
}

function installLoginLinkInterceptor({
  openAuthModal,
  isAuthenticated
}: {
  openAuthModal: (options?: AuthModalOptions) => void;
  isAuthenticated: boolean;
}) {
  const handleClick = (event: MouseEvent) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }

    if (isAuthenticated) return;

    const target = event.target;
    if (!(target instanceof Element)) return;

    const link = target.closest<HTMLAnchorElement>('a[href]');
    if (!link || link.target || link.hasAttribute('download')) return;

    const url = new URL(link.href, window.location.origin);
    if (url.origin !== window.location.origin) return;
    if (!isLocalizedLoginRoute(url.pathname)) return;

    event.preventDefault();
    openAuthModal(parseLoginUrl(url));
  };

  document.addEventListener('click', handleClick, true);
  return () => document.removeEventListener('click', handleClick, true);
}

export function useAuthModal() {
  const context = useContext(AuthModalContext);
  if (!context) {
    throw new Error('useAuthModal must be used inside AuthModalProvider');
  }
  return context;
}

export function AuthRouteModalLauncher() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();
  const { openAuthModal } = useAuthModal();

  useEffect(() => {
    if (isLoading) return;

    const options = resolveAuthModalOptionsFromLocation(location);
    if (isAuthenticated) {
      navigate(options.redirectTo || '/create', { replace: true });
      return;
    }

    openAuthModal(options);
    navigate(getDefaultBackdropPath(location.pathname), { replace: true });
  }, [isAuthenticated, isLoading, location, navigate, openAuthModal]);

  return null;
}

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [options, setOptions] = useState<AuthModalOptions>({
    source: 'login_modal'
  });

  const closeAuthModal = useCallback(() => {
    setIsOpen(false);
  }, []);

  const openAuthModal = useCallback((nextOptions: AuthModalOptions = {}) => {
    setOptions({
      redirectTo: nextOptions.redirectTo || null,
      source: nextOptions.source || 'login_modal',
      referralCode: nextOptions.referralCode || null,
      fromExtension: Boolean(nextOptions.fromExtension)
    });
    setModalKey((current) => current + 1);
    setIsOpen(true);
  }, []);

  useEffect(() => {
    return installLoginLinkInterceptor({ openAuthModal, isAuthenticated });
  }, [isAuthenticated, openAuthModal]);

  const value = useMemo(
    () => ({ openAuthModal, closeAuthModal }),
    [closeAuthModal, openAuthModal]
  );

  return (
    <AuthModalContext.Provider value={value}>
      {children}
      <AuthModal
        key={modalKey}
        open={isOpen && !isAuthenticated}
        options={options}
        navigate={navigate}
        onClose={closeAuthModal}
      />
    </AuthModalContext.Provider>
  );
}

function AuthModal({
  open,
  options,
  navigate,
  onClose
}: {
  open: boolean;
  options: AuthModalOptions;
  navigate: NavigateFunction;
  onClose: () => void;
}) {
  const { t } = useTranslation('auth');
  const {
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signInWithMicrosoft,
    isLoading
  } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [authStep, setAuthStep] = useState<'sso' | 'email'>('sso');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState(
    () => options.referralCode?.trim().toUpperCase() || ''
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const modalRef = useOverlayBehavior<HTMLDivElement>({
    open,
    onClose
  });

  const redirectTarget = options.redirectTo || null;
  const loginSource = options.source || 'login_modal';
  const redirectContext = getAuthRedirectContext(redirectTarget);
  const inviteCodeLabel = t('register.inviteCodePlaceholder');

  const referralCode = options.referralCode?.trim().toUpperCase() || '';
  useEffect(() => {
    if (!open || !referralCode) return;
    sessionStorage.setItem(PENDING_REFERRAL_CODE_KEY, referralCode);
  }, [open, referralCode]);

  const persistPendingReferral = () => {
    const normalizedInviteCode = inviteCode.trim().toUpperCase();
    if (!normalizedInviteCode) return;

    sessionStorage.setItem(PENDING_REFERRAL_CODE_KEY, normalizedInviteCode);
  };

  const handleEmailSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      persistPendingReferral();

      if (mode === 'login') {
        trackLoginStart('email');
        trackEvent('login_redirect_context', {
          method: 'email',
          cta_source: loginSource,
          redirect_context: redirectContext,
          has_redirect: Boolean(redirectTarget)
        });
        const { error } = await signInWithEmail(email, password);
        if (error) {
          setError(error.message);
          return;
        }

        trackEvent('login_success', {
          method: 'email',
          cta_source: loginSource,
          redirect_context: redirectContext,
          has_redirect: Boolean(redirectTarget)
        });
        if (redirectTarget) {
          trackEvent('login_return', {
            method: 'email',
            cta_source: loginSource,
            redirect_context: redirectContext
          });
        }
        onClose();
        navigate(redirectTarget || DEFAULT_POST_LOGIN_REDIRECT);
        return;
      }

      trackSignupStart('email');
      const { error } = await signUpWithEmail(email, password);
      if (error) {
        setError(error.message);
        return;
      }

      trackEvent('sign_up_submit', { method: 'email' });
      setError(
        t('success.registerSuccess', {
          defaultValue: 'Registration successful. Please check your email.'
        })
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    persistPendingReferral();

    sessionStorage.setItem(
      'webtomind:post-login-redirect',
      redirectTarget || DEFAULT_POST_LOGIN_REDIRECT
    );
    sessionStorage.setItem('webtomind:post-login-source', loginSource);
    if (options.fromExtension) {
      sessionStorage.setItem('webtomind:auth-from-extension', '1');
    }

    trackLoginStart('google');
    trackEvent('login_redirect_context', {
      method: 'google',
      cta_source: loginSource,
      redirect_context: redirectContext,
      has_redirect: Boolean(redirectTarget)
    });
    const { error } = await signInWithGoogle();
    if (error) {
      setError(error.message);
    }
  };

  const handleMicrosoftLogin = async () => {
    setError(null);
    persistPendingReferral();

    sessionStorage.setItem(
      'webtomind:post-login-redirect',
      redirectTarget || DEFAULT_POST_LOGIN_REDIRECT
    );
    sessionStorage.setItem('webtomind:post-login-source', loginSource);
    if (options.fromExtension) {
      sessionStorage.setItem('webtomind:auth-from-extension', '1');
    }

    trackLoginStart('microsoft');
    trackEvent('login_redirect_context', {
      method: 'microsoft',
      cta_source: loginSource,
      redirect_context: redirectContext,
      has_redirect: Boolean(redirectTarget)
    });
    const { error } = await signInWithMicrosoft();
    if (error) {
      setError(error.message);
    }
  };

  if (!open) return null;

  return (
    <div className="auth-modal-backdrop" onMouseDown={onClose}>
      <Card
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        tabIndex={-1}
        variant="raised"
        className="auth-modal-card"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <IconButton
          type="button"
          variant="ghost"
          size="sm"
          label={t('login.close', { defaultValue: '关闭登录弹窗' })}
          icon={<X size={17} />}
          className="auth-modal-close"
          onClick={onClose}
        />

        <div className="auth-modal-layout">
          <section className="auth-modal-form-pane">
            <header className="auth-modal-heading">
              <span className="auth-modal-kicker">WebToMind Studio</span>
              <h2 id="auth-modal-title">
                {mode === 'login'
                  ? t('login.title', { defaultValue: '欢迎回来' })
                  : t('register.title', { defaultValue: '创建账户' })}
              </h2>
              <p>
                {mode === 'login'
                  ? t('login.subtitle')
                  : t('register.subtitle')}
              </p>
            </header>

            {options.fromExtension && (
              <FeedbackMessage
                surface="web"
                tone="warning"
                className="auth-modal-feedback"
              >
                {t('login.extensionSync')}
              </FeedbackMessage>
            )}

            {authStep === 'sso' ? (
              <>
                <div className="auth-modal-sso-stack">
                  <Button
                    type="button"
                    onClick={handleGoogleLogin}
                    variant="secondary"
                    size="lg"
                    className="auth-modal-google"
                    aria-label={t('login.continueWithGoogle') as string}
                    leadingIcon={<GoogleIcon />}
                  >
                    {t('login.continueWithGoogle')}
                  </Button>

                  <Button
                    type="button"
                    onClick={handleMicrosoftLogin}
                    variant="secondary"
                    size="lg"
                    className="auth-modal-microsoft"
                    aria-label={t('login.continueWithMicrosoft') as string}
                    leadingIcon={<MicrosoftIcon />}
                  >
                    {t('login.continueWithMicrosoft')}
                  </Button>
                </div>

                <div className="auth-modal-divider" aria-hidden="true">
                  <span>{t('login.or')}</span>
                </div>

                <button
                  type="button"
                  className="auth-modal-email-toggle"
                  onClick={() => {
                    setAuthStep('email');
                    setError(null);
                  }}
                >
                  {t('login.continueWithEmail')}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="auth-modal-back"
                  onClick={() => {
                    setAuthStep('sso');
                    setError(null);
                  }}
                >
                  <ArrowLeft size={15} aria-hidden="true" />
                  {t('login.back')}
                </button>

                <form onSubmit={handleEmailSubmit} className="auth-modal-form">
                  <FormField
                    label={t('login.emailPlaceholder')}
                    htmlFor="auth-modal-email"
                    required
                  >
                    <Input
                      id="auth-modal-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder={t('login.emailPlaceholder')}
                      required
                      inputSize="lg"
                      className="auth-modal-input"
                    />
                  </FormField>

                  <FormField
                    label={t('login.passwordPlaceholder')}
                    htmlFor="auth-modal-password"
                    required
                  >
                    <Input
                      id="auth-modal-password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={t('login.passwordPlaceholder')}
                      required
                      minLength={6}
                      inputSize="lg"
                      className="auth-modal-input"
                    />
                  </FormField>

                  {mode === 'register' && (
                    <FormField
                      label={inviteCodeLabel}
                      htmlFor="auth-modal-invite-code"
                    >
                      <Input
                        id="auth-modal-invite-code"
                        type="text"
                        value={inviteCode}
                        onChange={(event) =>
                          setInviteCode(event.target.value.toUpperCase())
                        }
                        placeholder={inviteCodeLabel}
                        inputSize="lg"
                        className="auth-modal-input uppercase"
                      />
                    </FormField>
                  )}

                  {error && (
                    <FeedbackMessage
                      surface="web"
                      tone={
                        error.includes(
                          t('success.registerSuccess', {
                            defaultValue:
                              'Registration successful. Please check your email.'
                          })
                        )
                          ? 'success'
                          : 'error'
                      }
                      className="auth-modal-feedback"
                    >
                      {error}
                    </FeedbackMessage>
                  )}

                  <Button
                    type="submit"
                    isLoading={isSubmitting || isLoading}
                    variant="primary"
                    size="lg"
                    className="auth-modal-submit"
                  >
                    {isSubmitting
                      ? t('login.submitting')
                      : mode === 'login'
                        ? t('login.submit')
                        : t('register.submit')}
                  </Button>
                </form>

                <div className="auth-modal-mode-switch">
                  {mode === 'login' ? (
                    <>
                      {t('login.noAccount')}
                      <button
                        type="button"
                        onClick={() => {
                          setMode('register');
                          setError(null);
                        }}
                      >
                        {t('login.signUp')}
                      </button>
                    </>
                  ) : (
                    <>
                      {t('register.hasAccount')}
                      <button
                        type="button"
                        onClick={() => {
                          setMode('login');
                          setError(null);
                        }}
                      >
                        {t('register.signIn')}
                      </button>
                    </>
                  )}
                </div>

                <div className="auth-modal-terms">
                  {t('register.agreeTerms')}
                  <a href="/terms">{t('register.termsOfService')}</a>
                  {t('register.and')}
                  <a href="/privacy">{t('register.privacyPolicy')}</a>
                </div>
              </>
            )}
          </section>

          <aside className="auth-modal-art" aria-hidden="true">
            <img
              src="/create-apps/character-creator.webp"
              alt=""
              decoding="async"
            />
            <div className="auth-modal-art-overlay">
              <span>CREATE WITH CONTEXT</span>
              <strong>把灵感、配方和图像放进同一个创作流。</strong>
            </div>
          </aside>
        </div>
      </Card>
    </div>
  );
}
