/**
 * 隐私政策页面
 */

import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { applySeo } from '../lib/seo';

export function PrivacyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('common');
  const isEnglish = location.pathname.startsWith('/en-US');
  const canonical = `https://webtomind.com/${isEnglish ? 'en-US' : 'zh-CN'}/privacy`;

  useEffect(() => {
    return applySeo({
      title: isEnglish ? 'Privacy Policy | WebToMind' : '隐私政策 | WebToMind',
      description: isEnglish
        ? 'Learn how WebToMind collects, uses, stores and protects account, payment and creative workflow data.'
        : '了解 WebToMind 如何收集、使用、存储和保护账号、支付及 AI 创作工作流相关数据。',
      canonical,
      alternates: [
        { hreflang: 'zh-CN', href: 'https://webtomind.com/zh-CN/privacy' },
        { hreflang: 'en-US', href: 'https://webtomind.com/en-US/privacy' },
        { hreflang: 'x-default', href: 'https://webtomind.com/en-US/privacy' }
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
            {t('privacy.title', '隐私政策')}
          </h1>
        </div>
      </header>

      {/* 内容区域 */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="ui-card--web p-8 md:p-12">
          <div className="prose prose-slate max-w-none">
            <p className="text-muted-foreground mb-8">
              {t('privacy.lastUpdated', '最后更新：2026年1月21日')}
            </p>

            <h2>{t('privacy.section1.title', '1. 信息收集')}</h2>
            <p>
              {t(
                'privacy.section1.content',
                '我们收集的信息包括：账户信息（邮箱、用户名）、使用数据（功能使用频率、错误日志）、用户创建的内容（笔记、总结等）。'
              )}
            </p>

            <h2>{t('privacy.section2.title', '2. 信息使用')}</h2>
            <p>
              {t(
                'privacy.section2.content',
                '我们使用收集的信息来：提供和改进服务、个性化用户体验、发送服务通知、保障账户安全。'
              )}
            </p>

            <h2>{t('privacy.section3.title', '3. 数据存储')}</h2>
            <p>
              {t(
                'privacy.section3.content',
                '用户数据存储在安全的云端基础设施中。我们采用行业标准的加密技术保护数据传输和存储安全。'
              )}
            </p>

            <h2>{t('privacy.section4.title', '4. AI 与数据')}</h2>
            <p>
              {t(
                'privacy.section4.content',
                '重要承诺：我们不会使用用户的私人内容训练 AI 模型。您的创作素材只属于您。'
              )}
            </p>

            <h2>{t('privacy.section5.title', '5. 第三方服务')}</h2>
            <p>
              {t(
                'privacy.section5.content',
                '我们使用 Google、Supabase 等第三方服务。这些服务有各自的隐私政策，我们建议您阅读了解。'
              )}
            </p>

            <h2>{t('privacy.section6.title', '6. Cookie 政策')}</h2>
            <p>
              {t(
                'privacy.section6.content',
                '我们使用 Cookie 和类似技术来记住您的偏好设置、保持登录状态、分析使用情况。您可以在浏览器设置中管理 Cookie。'
              )}
            </p>

            <h2>{t('privacy.section7.title', '7. 用户权利')}</h2>
            <p>
              {t(
                'privacy.section7.content',
                '您有权：访问您的个人数据、更正不准确的信息、删除您的账户和数据、导出您的数据。'
              )}
            </p>

            <h2>{t('privacy.section8.title', '8. 联系我们')}</h2>
            <p>
              {t(
                'privacy.section8.content',
                '如有隐私相关问题，请通过邮箱 privacy@webtomind.com 联系我们。'
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
