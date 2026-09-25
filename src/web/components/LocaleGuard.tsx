/**
 * 无语言前缀路由守卫
 *
 * 当用户以不带 `/zh-CN` / `/en-US` 前缀的路径进入 SPA 时，
 * 根据已存储偏好或浏览器语言重定向到对应语言的本地化路径。
 * 英文优先：无法识别语言时默认进入英文版。
 */

import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getInitialLanguageSync } from '@/i18n/config';

// 存在 `/zh-CN` / `/en-US` 本地化变体的无前缀路径
const LOCALIZED_PREFIXES = [
  '/overview',
  '/use-cases',
  '/create',
  '/image',
  '/video',
  '/gallery',
  '/characters',
  '/apps',
  '/settings',
  '/account',
  '/prompts',
  '/blog',
  '/updates',
  '/links',
  '/pricing',
  '/tools',
  '/moodboards',
  '/recharge',
  '/terms',
  '/privacy',
  '/login',
  '/auth/callback',
  '/ai-image-style-grid',
  '/image/create'
] as const;

// 旧工作区路径，统一落到本地化定价页
const LEGACY_PRICING_PATHS = new Set(['/workspace', '/workspace/pricing']);

export function LocaleGuard({ children }: { children: ReactNode }) {
  const location = useLocation();
  const pathname = location.pathname;

  if (pathname.startsWith('/zh-CN') || pathname.startsWith('/en-US')) {
    return <>{children}</>;
  }

  if (LEGACY_PRICING_PATHS.has(pathname)) {
    const locale = getInitialLanguageSync();
    return (
      <Navigate
        to={`/${locale}/pricing${location.search}${location.hash}`}
        replace
      />
    );
  }

  if (pathname === '/') {
    const locale = getInitialLanguageSync();
    return (
      <Navigate
        to={`/${locale}/overview${location.search}${location.hash}`}
        replace
      />
    );
  }

  const shouldRedirect = LOCALIZED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (!shouldRedirect) {
    // 公开分享、工作区旧路由、SEO 别名页等没有本地化变体，保持原样
    return <>{children}</>;
  }

  const locale = getInitialLanguageSync();
  return (
    <Navigate
      to={`/${locale}${pathname}${location.search}${location.hash}`}
      replace
    />
  );
}
