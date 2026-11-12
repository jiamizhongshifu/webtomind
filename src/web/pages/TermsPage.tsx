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
      title: isEnglish
        ? 'Terms of Service | WebToMind'
        : '服务条款 | WebToMind',
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
              {isEnglish
                ? 'Last updated: October 20, 2026'
                : '最后更新：2026年10月20日'}
            </p>

            <h2>{t('terms.section1.title', '1. 服务说明')}</h2>
            <p>
              {isEnglish
                ? 'WebToMind provides downloadable workflows for AI agents and separate AI creation tools. A Skill purchase provides the described package and access rights. It does not include an AI agent subscription, external model fees or custom production services unless explicitly stated at checkout.'
                : 'WebToMind 提供可安装到 AI Agent 的工作流及独立的 AI 创作工具。Skill 购买交付商品说明中的安装包与访问权限；除结账时明确列出外，不包含 Agent 订阅、外部模型费用或定制代做服务。'}
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
              {isEnglish
                ? 'WebToMind retains rights in its original software, branding and Skill packages. You retain your rights in supplied material and may use generated outputs subject to applicable law and the separate terms of models, assets and software used. Buying access does not transfer ownership of a Skill package.'
                : 'WebToMind 保留其原创软件、品牌和 Skill 包的权利。你保留输入资料中原有的权利，生成成品的使用还受适用法律及模型、素材和软件各自条款约束。购买访问权限不等于获得 Skill 包所有权。'}
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
            <h2>
              {isEnglish
                ? '8. Skill access and license'
                : '8. Skill 访问与授权'}
            </h2>
            <p>
              {isEnglish
                ? 'Each purchase is for one user, who may install the Skill on their own devices and create personal or commercial client deliverables. Do not share accounts, credentials or paid installation links, or redistribute or resell the reusable paid Skill package. Client deliverables may include project source files permitted by their licenses, but not the reusable Skill package. Third-party open-source components retain their own licenses.'
                : '每次购买授权一位使用者，可在本人设备安装并制作个人或商业客户成品。不得共享账号、凭证或付费安装链接，不得再分发或转售可复用的原始付费 Skill 包。客户交付可以包含许可允许的项目源文件，但不包含可复用 Skill 包；第三方开源组件继续适用自身许可证。'}
            </p>
            <p>
              {isEnglish
                ? 'Monthly and yearly content memberships include the WebToMind studio Pro library, its new releases and updates during the paid period. Individual purchases include only the identified Skill and its updates while the service operates. Legitimately acquired versions may continue to be used locally after normal subscription expiry; new paid downloads and updates require active access. Existing Pro / Max and previously purchased benefits remain governed by their original contracts.'
                : '月付与年付内容会员在已付周期内包含 WebToMind 自营 Pro 库、新增内容和更新。单品购买仅包含指定 Skill 及服务运营期间的该商品更新。正常订阅到期后，合法取得的版本可以继续在本地使用；新的付费下载和更新需要有效访问权益。现有 Pro / Max 与历史已购权益仍按原合同履约。'}
            </p>
            <p>
              {isEnglish
                ? 'Content memberships do not grant workspace credits. Card subscriptions renew until canceled; cancellation stops future renewals while retaining access through the paid period. Alipay content memberships are prepaid and require manual renewal. Lifetime access is not currently offered. Compatibility is limited to the environments described for each product; future agent and model compatibility is not guaranteed.'
                : '内容会员不发放创作台积分。银行卡订阅会持续续费，取消后停止后续续费并保留已付周期内权益。支付宝内容会员按期预付，需手动续费。终身方案当前未开放。商品兼容范围以各商品说明为准，不保证未来所有 Agent 和模型都兼容。'}
            </p>
            <h2>
              {isEnglish
                ? '9. Payment issues and refunds'
                : '9. 付款问题与退款'}
            </h2>
            <p>
              {isEnglish
                ? 'Contact support with your order reference for duplicate or unauthorized charges, missing access, or reproducible failures in a supported environment. We will investigate and correct delivery or billing errors. Cancellation alone does not request a refund. Any applicable refund or withdrawal rights remain unaffected. A refund withdraws the refunded purchase or billing period, not unrelated valid purchases. Workspace credit returns for failed generation tasks are handled separately.'
                : '如遇重复或未授权扣款、权益未交付、支持环境中的可复现故障，请提供订单号联系客服核查并纠正交付或计费错误。取消续费本身不发起退款，适用的法定退款或撤回权利不受影响。退款撤销对应商品或账期，不影响其他有效购买。生成任务失败的创作台积分返还单独处理。'}
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
