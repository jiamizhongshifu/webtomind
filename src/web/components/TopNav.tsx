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
import { AiRechargeLink } from './AiRechargeLink';
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
  const [showMobileMenu, setShowMobileMenu] = useState(false);
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
  const langMenuListRef = useRef<HTMLDivElement>(null);
  const langTriggerRef = useRef<HTMLButtonElement>(null);
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
  const ctaTarget = `${localePrefix}/skills`;
  const promptLibraryHref =
    locale === 'en-US' ? '/en-US/prompts' : `${localePrefix}/prompts`;
  const skillsHref = `${localePrefix}/skills`;
  const pricingHref = `${localePrefix}/skills/pricing`;
  const navFallback =
    locale === 'en-US'
      ? {
          skills: 'Explore Skills',
          free: 'Free Skills',
          pricing: 'Pricing',
          tools: 'More tools'
        }
      : {
          skills: '发现 Skill',
          free: '免费 Skill',
          pricing: '会员与价格',
          tools: '更多工具'
        };

  useEffect(() => {
    setShowMobileMenu(false);
  }, [location.pathname, location.search]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowMobileMenu(false);
        setShowLangMenu(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!showLangMenu) return;
    const first = langMenuListRef.current?.querySelector<HTMLElement>(
      '[role="menuitemradio"]'
    );
    first?.focus({ preventScroll: true });
  }, [showLangMenu]);

  const closeLangMenu = (restoreFocus = false) => {
    setShowLangMenu(false);
    if (restoreFocus) langTriggerRef.current?.focus({ preventScroll: true });
  };

  const handleLangMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      closeLangMenu(true);
      return;
    }
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const items = Array.from(
      langMenuListRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitemradio"]'
      ) ?? []
    );
    if (items.length === 0) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next = index;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else if (event.key === 'ArrowDown')
      next = index < 0 ? 0 : (index + 1) % items.length;
    else next = index <= 0 ? items.length - 1 : index - 1;
    items[next]?.focus();
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
    // 先跳转再切换：URL 是语言的唯一来源，避免页面的 URL 同步把语言改回去。
    if (targetLanguage !== locale) {
      navigate(
        mapPathToLocale(location.pathname, targetLanguage) +
          location.search +
          location.hash
      );
    }
    dismissLanguagePrompt();
    await changeLanguage(targetLanguage);
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
                href={skillsHref}
                className="nav-link-item nav-link-cta"
                aria-current={
                  location.pathname === skillsHref && !location.search
                    ? 'page'
                    : undefined
                }
              >
                {navFallback.skills}
              </NavigationLink>
              <NavigationLink
                href={`${skillsHref}?tier=free`}
                className="nav-link-item"
              >
                {navFallback.free}
              </NavigationLink>
              <NavigationLink
                href={pricingHref}
                className="nav-link-item"
                aria-current={
                  location.pathname === pricingHref ? 'page' : undefined
                }
              >
                {navFallback.pricing}
              </NavigationLink>
              <details className="nav-tools">
                <summary className="nav-link-item">{navFallback.tools}</summary>
                <div className="nav-tools-panel">
                  <Link to="/create">
                    {locale === 'en-US' ? 'Image workspace' : '图片创作台'}
                  </Link>
                  <Link to={promptLibraryHref}>
                    {locale === 'en-US' ? 'Prompt library' : '提示词资料库'}
                  </Link>
                  <AiRechargeLink
                    placement="top_nav"
                    locale={locale}
                    className="nav-tool-link"
                  />
                </div>
              </details>
            </Navigation>
            <div className="relative" ref={langMenuRef}>
              <IconButton
                ref={langTriggerRef}
                onClick={() => setShowLangMenu(!showLangMenu)}
                className="nav-button-glass nav-language-button"
                label={t('nav.language')}
                aria-haspopup="menu"
                aria-expanded={showLangMenu}
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
                <div
                  ref={langMenuListRef}
                  className="nav-lang-menu"
                  role="menu"
                  aria-label={t('nav.language')}
                  onKeyDown={handleLangMenuKeyDown}
                >
                  {Object.entries(languageNames).map(([code, name]) => (
                    <button
                      type="button"
                      key={code}
                      role="menuitemradio"
                      aria-checked={language === code}
                      onClick={() => {
                        const targetLang = code as 'zh-CN' | 'en-US';
                        navigate(
                          mapPathToLocale(location.pathname, targetLang) +
                            location.search +
                            location.hash
                        );
                        void changeLanguage(targetLang);
                        dismissLanguagePrompt();
                        closeLangMenu(true);
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

            {!isAuthenticated && (
              <Button
                type="button"
                onClick={() => navigate(loginTarget)}
                variant="ghost"
                size="md"
                className="nav-button-glass nav-button-secondary"
              >
                {t('nav.login')}
              </Button>
            )}
            <Button
              type="button"
              onClick={() => navigate(ctaTarget)}
              variant="primary"
              size="md"
              className="nav-button-glass nav-button-primary"
            >
              {locale === 'en-US' ? 'Browse Skills' : '浏览 Skill'}
            </Button>
            <button
              type="button"
              className="nav-mobile-toggle"
              aria-label={locale === 'en-US' ? 'Menu' : '菜单'}
              aria-expanded={showMobileMenu}
              aria-controls="skill-mobile-nav"
              onClick={() => setShowMobileMenu((v) => !v)}
            >
              <span aria-hidden="true">{showMobileMenu ? '×' : '☰'}</span>
            </button>
          </div>
        </div>
        {showMobileMenu && (
          <div id="skill-mobile-nav" className="nav-mobile-panel">
            <Link to={skillsHref}>{navFallback.skills}</Link>
            <Link to={`${skillsHref}?tier=free`}>{navFallback.free}</Link>
            <Link to={pricingHref}>{navFallback.pricing}</Link>
            <Link to={loginTarget}>
              {locale === 'en-US' ? 'Account / sign in' : '账号 / 登录'}
            </Link>
            <details>
              <summary>{navFallback.tools}</summary>
              <Link to="/create">
                {locale === 'en-US' ? 'Image workspace' : '图片创作台'}
              </Link>
              <Link to={promptLibraryHref}>
                {locale === 'en-US' ? 'Prompt library' : '提示词资料库'}
              </Link>
              <AiRechargeLink placement="top_nav" locale={locale} />
            </details>
          </div>
        )}
      </nav>
    </div>
  );
}
