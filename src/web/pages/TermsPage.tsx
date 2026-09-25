/**
 * 服务条款页面
 */

import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { applySeo } from '../lib/seo';

export function TermsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('common');
  const isEnglish = location.pathname.startsWith('/en-US');
  const canonical = `https://webtomind.com/${isEnglish ? 'en-US' : 'zh-CN'}/terms`;

  useEffect(() => {
    return applySeo({
      title: isEnglish ? 'Terms of Service | WebToMind' : '服务条款 | WebToMind',
      description: isEnglish
        ? 'Review the terms that govern WebToMind accounts, AI creation services, credits, payments and acceptable use.'
        : '查看适用于 WebToMind 账号、AI 创作服务、积分、支付及合理使用行为的服务条款。',
      canonical,
      alternates: [
        { hreflang: 'zh-CN', href: 'https://webtomind.com/zh-CN/terms' },
        { hreflang: 'en-US', href: 'https://webtomind.com/en-US/terms' },
        { hreflang: 'x-default', href: 'https://webtomind.com/en-US/terms' }
      ],
      htmlLang: isEnglish ? 'en' : 'zh-CN',
      ogImage: 'https://webtomind.com/icons/logo-icon.svg',
      twitterSite: '@webtomind'
    });
  }, [canonical, isEnglish]);

  return (
    <div className="min-h-screen bg-[var(--web-bg-canvas)]">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-[var(--web-border-soft)]">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex h-11 w-11 min-w-[44px] items-center justify-center rounded-lg p-0 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--web-brand-support)] focus-visible:ring-offset-2"
            aria-label={t('back', '返回')}
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h1 className="text-xl font-semibold text-slate-900">
            {t('terms.title', '服务条款')}
          </h1>
        </div>
      </header>

      {/* 内容区域 */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="ui-card--web p-8 md:p-12">
          <div className="prose prose-slate max-w-none">
            <p className="text-muted-foreground mb-8">
              {t('terms.lastUpdated', '最后更新：2026年1月21日')}
            </p>

            <h2>{t('terms.section1.title', '1. 服务说明')}</h2>
            <p>
              {t(
                'terms.section1.content',
                'WebToMind 是一款 AI 驱动的知识管理工具，帮助用户收集、整理和创作内容。我们提供浏览器扩展和 Web 工作台两种产品形态。'
              )}
            </p>

            <h2>{t('terms.section2.title', '2. 用户责任')}</h2>
            <p>
              {t(
                'terms.section2.content',
                '用户在使用本服务时，应遵守相关法律法规，不得利用本服务从事任何违法或侵权行为。用户对其账户下的所有行为负责。'
              )}
            </p>

            <h2>{t('terms.section3.title', '3. 知识产权')}</h2>
            <p>
              {t(
                'terms.section3.content',
                'WebToMind 的软件、标识、界面设计等知识产权归我们所有。用户在本平台创作的内容，其知识产权归用户本人所有。'
              )}
            </p>

            <h2>{t('terms.section4.title', '4. 隐私保护')}</h2>
            <p>
              {t(
                'terms.section4.content',
                '我们重视用户隐私保护，具体隐私政策请参阅我们的隐私政策页面。我们承诺不会使用用户内容训练 AI 模型。'
              )}
            </p>

            <h2>{t('terms.section5.title', '5. 免责声明')}</h2>
            <p>
              {t(
                'terms.section5.content',
                '本服务按"现状"提供。我们不对服务的持续性、可用性作出任何明示或暗示的保证。对于因使用本服务产生的任何直接或间接损失，我们不承担责任。'
              )}
            </p>

            <h2>{t('terms.section6.title', '6. 服务变更')}</h2>
            <p>
              {t(
                'terms.section6.content',
                '我们保留随时修改、暂停或终止服务的权利。对于付费用户，我们会提前通知并妥善处理退款事宜。'
              )}
            </p>

            <h2>{t('terms.section7.title', '7. 联系我们')}</h2>
            <p>
              {t(
                'terms.section7.content',
                '如有任何问题，请通过邮箱 support@webtomind.com 联系我们。'
              )}
            </p>
          </div>
        </div>
      </main>

      {/* 页脚 */}
      <footer className="border-t border-slate-200 bg-white py-8">
        <div className="max-w-4xl mx-auto px-6 text-center text-slate-500 text-sm">
          © 2026 WebToMind. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
