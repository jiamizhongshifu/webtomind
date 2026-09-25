/**
 * /create 视觉工作台专用顶部 mini-nav。
 *
 * 自包含组件:内部自取 auth(useAuth)、路由(useNavigate)、i18n。父组件零 props 渲染。
 */

import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CreditsDisplay } from '@/workspace/components/CreditsDisplay';
import { useWorkspaceUser } from '@/workspace/hooks/useWorkspaceUser';
import { localizeCreateHref } from '../../data/create-workspace';
import { useAuth } from '../../contexts/AuthContext';
import { Button, Navigation, NavigationLink } from '@/shared/ui';
import { CreatorAccountMenu } from './CreatorAccountMenu';
import { collapsePaywallReturnTo } from '@/shared/paywall-return-to';
import { getWorkspacePricingHref } from '../../lib/pricing-route';

function getLocalePrefix(pathname: string): '' | '/zh-CN' | '/en-US' {
  if (pathname.startsWith('/en-US')) return '/en-US';
  if (pathname.startsWith('/zh-CN')) return '/zh-CN';
  return '';
}

function stripLocale(pathname: string): string {
  if (pathname.startsWith('/zh-CN'))
    return pathname.slice('/zh-CN'.length) || '/';
  if (pathname.startsWith('/en-US'))
    return pathname.slice('/en-US'.length) || '/';
  return pathname;
}

function isActiveMiniNav(id: string, pathname: string): boolean {
  const normalized = stripLocale(pathname);
  if (id === 'inspiration') return normalized === '/create';
  if (id === 'image') return normalized.startsWith('/image');
  if (id === 'apps') return normalized.startsWith('/apps');
  if (id === 'pricing') return normalized.startsWith('/pricing');
  return false;
}

const CREATOR_MINI_NAV_COPY = {
  zh: {
    creditSuffix: '积分',
    creditTrailing: '充值',
    profileFallback: '个人资料',
    founderMember: '创始成员',
    personalSpace: '个人空间',
    pricing: '升级',
    workspace: '工作台',
    settings: '个人设置',
    trash: '回收站',
    installExtension: '安装插件',
    contact: '联系我们',
    signOut: '退出登录',
    language: '语言',
    languageChinese: '简体中文',
    languageEnglish: 'English',
    theme: '主题',
    themeLight: '浅色',
    themeDark: '深色',
    themeSystem: '跟随系统'
  },
  en: {
    creditSuffix: 'credits',
    creditTrailing: 'Top up',
    profileFallback: 'Profile',
    founderMember: 'Founding Member',
    personalSpace: 'Personal space',
    pricing: 'Upgrade',
    workspace: 'Workspace',
    settings: 'Settings',
    trash: 'Trash',
    installExtension: 'Install extension',
    contact: 'Contact us',
    signOut: 'Sign out',
    language: 'Language',
    languageChinese: '简体中文',
    languageEnglish: 'English',
    theme: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeSystem: 'System'
  }
} as const;

export function CreatorMiniNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, signOut } = useAuth();
  const { profile } = useWorkspaceUser(isAuthenticated);
  const { t } = useTranslation('imageCreate');
  const localePrefix = getLocalePrefix(location.pathname);
  const isCreateBoardsRoute = location.pathname.includes('/create/boards');
  const workspaceHref = '/boards';
  const returnTo = collapsePaywallReturnTo(
    location.pathname,
    location.search,
    location.hash,
    `${localePrefix}/image`
  );
  const pricingHref = getWorkspacePricingHref(
    localePrefix,
    `?source=creator_top_nav&returnTo=${encodeURIComponent(returnTo)}`
  );
  const isEnglish = localePrefix === '/en-US';
  const navCopy = isEnglish
    ? CREATOR_MINI_NAV_COPY.en
    : CREATOR_MINI_NAV_COPY.zh;
  const userName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    'WebToMind User';
  const settingsHref = localizeCreateHref('/settings', localePrefix);
  const topNavItems = [
    {
      id: 'inspiration',
      label: isEnglish ? 'Inspiration' : '灵感',
      href: `${localePrefix}/create`
    },
    {
      id: 'image',
      label: isEnglish ? 'Image' : '图像',
      href: `${localePrefix}/image`
    },
    {
      id: 'apps',
      label: isEnglish ? 'Apps' : '应用',
      href: `${localePrefix}/apps`
    },
    { id: 'pricing', label: isEnglish ? 'Pricing' : '价格', href: pricingHref }
  ];

  return (
    <header className="image-create-mininav">
      <div className="image-create-mininav-inner">
        <div className="image-create-mininav-brand">
          {!isCreateBoardsRoute && (
            <Link
              to={workspaceHref}
              className="image-create-mininav-logo"
              aria-label={t('nav.backToWorkspace') as string}
            >
              <img src="/icons/logo-icon.svg" alt="" />
            </Link>
          )}
          {isCreateBoardsRoute ? (
            <div
              id="create-mininav-workspace-slot"
              className="image-create-mininav-workspace-slot"
              aria-label={
                isEnglish ? 'Workspace project switcher' : '工作台项目切换'
              }
            />
          ) : (
            <Link
              to={`${localePrefix}/create`}
              className="image-create-mininav-title"
            >
              <span className="image-create-mininav-title-desktop">
                {t('nav.creativeWorkspace')}
              </span>
              <span className="image-create-mininav-title-mobile">
                WebToMind
              </span>
            </Link>
          )}
        </div>
        {!isCreateBoardsRoute && (
          <Navigation
            className="image-create-mininav-links"
            aria-label={isEnglish ? 'Creation entry points' : '创作入口'}
            variant="product"
            density="compact"
          >
            {topNavItems.map((item) => (
              <NavigationLink
                key={item.id}
                as={Link}
                to={item.href}
                isActive={isActiveMiniNav(item.id, location.pathname)}
              >
                {item.label}
              </NavigationLink>
            ))}
          </Navigation>
        )}
        <div className="image-create-mininav-actions">
          {isAuthenticated ? (
            <>
              <CreditsDisplay
                className="image-create-mininav-credits"
                labelSuffix={navCopy.creditSuffix}
                trailingLabel={navCopy.creditTrailing}
              />
              <CreatorAccountMenu
                placement="topbar"
                user={user}
                userName={userName}
                memberNumber={profile?.member_number_formatted}
                pricingHref={pricingHref}
                workspaceHref={workspaceHref}
                settingsHref={settingsHref}
                copy={navCopy}
                onSignOut={signOut}
              />
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="image-create-mininav-login"
              onClick={() => navigate('/login')}
            >
              {t('nav.login')}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
