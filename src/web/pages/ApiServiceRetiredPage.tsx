import { ButtonLink } from '@/shared/ui';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MarketingPageShell, useMarketingLocale } from './MarketingPageShell';

/** Old bookmarks and payment return URLs remain readable after retirement. */
export function ApiServiceRetiredPage() {
  const { locale, isZh } = useMarketingLocale();
  const { i18n } = useTranslation();
  useEffect(() => {
    if (i18n.language !== locale) void i18n.changeLanguage(locale);
  }, [i18n, locale]);
  return (
    <MarketingPageShell
      title={
        isZh
          ? '模型广场与 API 服务已下线'
          : 'The model marketplace and API service have closed'
      }
      subtitle={
        isZh
          ? '不再提供模型目录、API Key、API 充值和接口调用。图片与视频创作仍可正常使用。'
          : 'Model listings, API keys, API top-ups and API calls are no longer available. Image and video creation remain available.'
      }
    >
      <p>
        {isZh
          ? '历史订单、余额及结算记录已保留；如需核对已有订单或余额，请联系客服。'
          : 'Historical orders, balances and settlement records are retained. Contact support for questions about an existing order or balance.'}
      </p>
      <ButtonLink to={`/${locale}/create`}>
        {isZh ? '返回创作首页' : 'Back to the creative studio'}
      </ButtonLink>
    </MarketingPageShell>
  );
}
