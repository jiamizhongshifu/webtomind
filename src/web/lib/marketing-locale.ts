import { useLocation } from 'react-router-dom';

export type MarketingLocale = 'zh-CN' | 'en-US';

export function getMarketingLocale(pathname: string): MarketingLocale {
  return pathname.startsWith('/en-US') ? 'en-US' : 'zh-CN';
}

export function useMarketingLocale(): {
  locale: MarketingLocale;
  isZh: boolean;
} {
  const { pathname } = useLocation();
  const locale = getMarketingLocale(pathname);
  return { locale, isZh: locale === 'zh-CN' };
}
