import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import SettingsPage from '@/workspace/components/SettingsPage';
import { useWorkspaceUser } from '@/workspace/hooks/useWorkspaceUser';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '@/i18n/hooks/useLanguage';
import { applySeo } from '../lib/seo';

function getLocalePrefix(pathname: string): '' | '/zh-CN' | '/en-US' {
  if (pathname.startsWith('/en-US')) return '/en-US';
  if (pathname.startsWith('/zh-CN')) return '/zh-CN';
  return '';
}

export function SettingsRoutePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { language } = useLanguage();
  const { isLoading: isAuthLoading } = useAuth();
  const { profile, credits, subscription } = useWorkspaceUser(!isAuthLoading);
  const localePrefix = getLocalePrefix(location.pathname);
  const settingsPath = `${localePrefix}/settings`;

  useEffect(() => {
    return applySeo({
      title:
        language === 'en-US'
          ? 'Account Settings | WebToMind'
          : '个人设置 | WebToMind',
      description:
        language === 'en-US'
          ? 'Manage your WebToMind account, credits, plan, preferences, and integrations.'
          : '管理 WebToMind 账户、积分、套餐、创作偏好和连接器。',
      canonical: `https://webtomind.com${settingsPath}`,
      robots: 'noindex,nofollow',
      ogImage: 'https://webtomind.com/icons/logo-icon.svg',
      twitterSite: '@webtomind'
    });
  }, [language, settingsPath]);

  return (
    <SettingsPage
      onBack={() => {
        if (window.history.length > 1) {
          navigate(-1);
          return;
        }
        navigate('/boards');
      }}
      onShowPricing={() => {
        navigate(
          `${localePrefix}/pricing?source=settings&returnTo=${encodeURIComponent(settingsPath)}`
        );
      }}
      profile={profile}
      credits={credits}
      subscription={subscription}
    />
  );
}

export default SettingsRoutePage;
