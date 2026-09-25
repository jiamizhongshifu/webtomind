import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '@/i18n/hooks/useLanguage';
import { STORAGE_KEYS, type SupportedLanguage } from '@/i18n/config';
import {
  Button,
  IconButton,
  Navigation,
  NavigationLink
} from '../../shared/ui';
import '../styles/top-nav.css';
import '../styles/language-switch-banner.css';
import { LanguageSwitchBanner } from './LanguageSwitchBanner';
const ENGLISH_SEO_PATHS = new Set([
  '/ai-image-prompts',
  '/free-ai-image-prompts',
  '/best-ai-image-prompts',
  '/ai-image-prompt-examples',
  '/ai-image-prompt-library',
  '/ai-image-prompts-gallery',
  '/free-ai-image-prompts-gallery',
  '/ai-image-prompt-generator',
  '/image-to-prompt-generator',
  '/reference-image-to-prompt-generator',
  '/ai-image-generator',
  '/gpt-image-2-prompts',
  '/free-gpt-image-2-prompts',
  '/gpt-image-2-prompts-gallery',
  '/nano-banana-prompts',
  '/nano-banana-prompts-gallery',
  '/nano-banana-2-prompts',
  '/nano-banana-pro-prompts',
  '/flux-prompts',
  '/seedream-prompts',
  '/mona-lisa-1-prompts',
  '/mona-lisa-prompts',
  '/sref-prompts',
  '/ai-photo-prompts',
  '/portrait-prompts',
  '/product-photography-prompts',
  '/character-design-prompts',
  '/text-to-image-prompts',
  '/marketing-creative-prompts',
  '/poster-design-prompts',
  '/brand-identity-prompts',
  '/3d-figurine-prompts',
  '/clay-aesthetic-prompts'
]);

function getLocale(
  pathname: string,
  fallback: 'zh-CN' | 'en-US'
): 'zh-CN' | 'en-US' {
  if (ENGLISH_SEO_PATHS.has(pathname)) {
    return 'en-US';
  }
  if (pathname.startsWith('/en-US')) {
    return 'en-US';
  }
  if (pathname.startsWith('/zh-CN')) {
    return 'zh-CN';
  }
  return fallback;
}

function mapPathToLocale(pathname: string, targetLocale: 'zh-CN' | 'en-US') {
  if (ENGLISH_SEO_PATHS.has(pathname)) {
    if (targetLocale === 'en-US') {
      return pathname;
    }
    if (
      pathname === '/gpt-image-2-prompts' ||
      pathname === '/free-gpt-image-2-prompts' ||
      pathname === '/gpt-image-2-prompts-gallery'
    ) {
      return '/zh-CN/prompts/model/gpt-image-2';
    }
    if (
      pathname === '/nano-banana-prompts' ||
      pathname === '/nano-banana-prompts-gallery' ||
      pathname === '/nano-banana-2-prompts' ||
      pathname === '/nano-banana-pro-prompts'
    ) {
      return '/zh-CN/prompts/model/nano-banana';
    }
    if (pathname === '/flux-prompts') {
      return '/zh-CN/prompts/model/flux';
    }
    if (pathname === '/seedream-prompts') {
      return '/zh-CN/prompts/model/seedream';
    }
    if (
      pathname === '/mona-lisa-1-prompts' ||
      pathname === '/mona-lisa-prompts'
    ) {
      return '/zh-CN/prompts/model/mona-lisa-1';
    }
    if (pathname === '/sref-prompts') {
      return '/zh-CN/prompts/category/sref-prompts';
    }
    if (pathname === '/ai-photo-prompts' || pathname === '/portrait-prompts') {
      return '/zh-CN/prompts/category/ai-portrait';
    }
    if (pathname === '/product-photography-prompts') {
      return '/zh-CN/prompts/category/product-images';
    }
    if (pathname === '/character-design-prompts') {
      return '/zh-CN/prompts/category/character-consistency';
    }
    if (pathname === '/3d-figurine-prompts') {
      return '/zh-CN/prompts/category/character-consistency';
    }
    if (pathname === '/ai-image-generator') {
      return '/zh-CN/create';
    }
    return '/zh-CN/prompts';
  }
  if (pathname === '/zh-CN' || pathname === '/en-US') {
    return `/${targetLocale}/overview`;
  }
  if (pathname.startsWith('/zh-CN/')) {
    return pathname.replace('/zh-CN/', `/${targetLocale}/`);
  }
  if (pathname.startsWith('/en-US/')) {
    return pathname.replace('/en-US/', `/${targetLocale}/`);
  }
  return `/${targetLocale}/overview`;
}

export function TopNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation('home');
  const { language, languageNames, changeLanguage } = useLanguage();
  const [isScrolled, setIsScrolled] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showLanguagePrompt, setShowLanguagePrompt] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return (
        localStorage.getItem(STORAGE_KEYS.WEB_LANGUAGE_PROMPT_DISMISSED) !== '1'
      );
    } catch {
      return true;
    }
  });
  const langMenuRef = useRef<HTMLDivElement>(null);
  const isScrolledRef = useRef(false);

  const locale = getLocale(
    location.pathname,
    language === 'en-US' ? 'en-US' : 'zh-CN'
  );
  const localePrefix = locale === 'en-US' ? '/en-US' : '/zh-CN';
  const searchParams = new URLSearchParams(location.search);
  const referralCode = searchParams.get('ref')?.trim().toUpperCase() || '';
  const loginTarget = referralCode
    ? `/login?ref=${encodeURIComponent(referralCode)}`
    : '/login';
  const ctaTarget = isAuthenticated ? '/create' : loginTarget;
  const promptLibraryHref =
    locale === 'en-US' ? '/en-US/prompts' : `${localePrefix}/prompts`;
  const pricingHref = `${localePrefix}/pricing?source=marketing_top_nav`;
  const navFallback =
    locale === 'en-US'
      ? {
          create: 'Creative Studio',
          promptLibrary: 'AI Image Prompts',
          pricing: 'Pricing'
        }
      : {
          create: '创意工作台',
          promptLibrary: 'Prompt 案例',
          pricing: '价格'
        };

  const dismissLanguagePrompt = () => {
    setShowLanguagePrompt(false);
    try {
      localStorage.setItem(STORAGE_KEYS.WEB_LANGUAGE_PROMPT_DISMISSED, '1');
    } catch {
      // 忽略 localStorage 不可用，当前会话仍然关闭提示。
    }
  };

  const handleLanguagePromptContinue = async (
    targetLanguage: SupportedLanguage
  ) => {
    await changeLanguage(targetLanguage);
    if (targetLanguage !== locale) {
      navigate(mapPathToLocale(location.pathname, targetLanguage));
    }
    dismissLanguagePrompt();
  };

  useEffect(() => {
    const handleScroll = () => {
      const nextIsScrolled = window.scrollY > 50;
      if (isScrolledRef.current === nextIsScrolled) return;
      isScrolledRef.current = nextIsScrolled;
      setIsScrolled(nextIsScrolled);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        langMenuRef.current &&
        !langMenuRef.current.contains(event.target as Node)
      ) {
        setShowLangMenu(false);
      }
    };

    if (showLangMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showLangMenu]);

  return (
    <div
      className={`top-nav-shell ${
        showLanguagePrompt ? 'has-language-switch-banner' : ''
      }`}
    >
      {showLanguagePrompt && (
        <LanguageSwitchBanner
          currentLanguage={locale}
          languageNames={languageNames}
          onContinue={handleLanguagePromptContinue}
          onDismiss={dismissLanguagePrompt}
        />
      )}

      <nav className={`home-nav ${isScrolled ? 'scrolled' : ''}`}>
        <div className="nav-container">
          <Link to={`${localePrefix}/overview`} className="nav-logo">
            <div className="nav-logo-icon">
              <img
                src="/icons/logo-icon.svg"
                alt="WebToMind"
                style={{ width: '100%', height: '100%' }}
              />
            </div>
            <span className="nav-logo-text">WebToMind</span>
          </Link>
          <div className="nav-actions">
            <Navigation
              as="div"
              className="nav-links-desktop"
              aria-label={locale === 'en-US' ? 'Primary navigation' : '主导航'}
              variant="marketing"
              density="compact"
            >
              <NavigationLink
                href="/create"
                className="nav-link-item nav-link-cta"
              >
                {navFallback.create}
              </NavigationLink>
              <NavigationLink
                href={promptLibraryHref}
                className="nav-link-item"
              >
                {navFallback.promptLibrary}
              </NavigationLink>
              <NavigationLink href={pricingHref} className="nav-link-item">
                {navFallback.pricing}
              </NavigationLink>
            </Navigation>
            <div className="relative" ref={langMenuRef}>
              <IconButton
                onClick={() => setShowLangMenu(!showLangMenu)}
                className="nav-button-glass nav-language-button"
                label={t('nav.language')}
                icon={
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
                    />
                  </svg>
                }
              />

              {showLangMenu && (
                <div className="nav-lang-menu">
                  {Object.entries(languageNames).map(([code, name]) => (
                    <button
                      type="button"
                      key={code}
                      onClick={() => {
                        const targetLang = code as 'zh-CN' | 'en-US';
                        changeLanguage(targetLang);
                        navigate(
                          mapPathToLocale(location.pathname, targetLang)
                        );
                        dismissLanguagePrompt();
                        setShowLangMenu(false);
                      }}
                      className={`nav-lang-menu-item ${
                        language === code ? 'is-current' : ''
                      }`}
                    >
                      {name}
                      {language === code && (
                        <svg
                          className="nav-lang-menu-check"
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
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {isAuthenticated ? (
              <Button
                type="button"
                onClick={() => navigate('/create')}
                variant="primary"
                size="md"
                className="nav-button-glass nav-button-primary"
              >
                {t('nav.goToWorkspace')}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  onClick={() => navigate(loginTarget)}
                  variant="ghost"
                  size="md"
                  className="nav-button-glass nav-button-secondary"
                >
                  {t('nav.login')}
                </Button>
                <Button
                  type="button"
                  onClick={() => navigate(ctaTarget)}
                  variant="primary"
                  size="md"
                  className="nav-button-glass nav-button-primary"
                >
                  {t('nav.getStarted')}
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>
    </div>
  );
}
