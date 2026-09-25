import { useLocation } from 'react-router-dom';

export type RouteLocale = 'zh-CN' | 'en-US';

export function useRouteLocale(): {
  locale: RouteLocale;
  isZh: boolean;
} {
  const { pathname } = useLocation();
  const locale: RouteLocale = pathname.startsWith('/en-US')
    ? 'en-US'
    : 'zh-CN';
  return { locale, isZh: locale === 'zh-CN' };
}
