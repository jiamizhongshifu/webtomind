import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, BarChart3, ShieldCheck, Wand2, X } from 'lucide-react';
import { applySeo } from '../lib/seo';
import { useAuth } from '../contexts/AuthContext';
import { PromptCasesPanel } from '../components/image-create/PromptCasesPanel';
import { PromptCaseAssetCoveragePanel } from '../components/image-create/PromptCaseAssetCoveragePanel';
import { AiUsageSummaryPanel } from '../components/image-create/AiUsageSummaryPanel';
import { Badge, useOverlayBehavior } from '@/shared/ui';
import '../styles/image-create.css';
import '../styles/image-create-mobile.css';
import '../styles/prompt-case-admin.css';

function getPromptAdminLocale(pathname: string): 'zh-CN' | 'en-US' {
  return pathname.startsWith('/en-US') ? 'en-US' : 'zh-CN';
}

export function PromptCaseAdminPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, user } = useAuth();
  const [isUsageOpen, setIsUsageOpen] = useState(false);
  const [isAssetCoverageOpen, setIsAssetCoverageOpen] = useState(false);
  const locale = getPromptAdminLocale(location.pathname);
  const isZh = locale === 'zh-CN';
  const localePrefix = `/${locale}`;
  const usageTitleId = 'prompt-case-admin-ai-usage-title';
  const isPromptCaseAdmin =
    user?.email?.trim().toLowerCase() === 'admin@example.com';

  useEffect(() => {
    return applySeo({
      title: isZh ? '案例管理 | WebToMind' : 'Case admin | WebToMind',
      description: isZh
        ? '管理 WebToMind AI 图片 Prompt 案例、模型分类、双语 Prompt 和精选状态。'
        : 'Manage WebToMind AI image prompt cases, model categories, bilingual prompts and featured status.',
      canonical: `${window.location.origin}${localePrefix}/prompts/admin`,
      robots: 'noindex,nofollow'
    });
  }, [isZh, localePrefix]);

  const usageModalRef = useOverlayBehavior<HTMLDivElement>({
    open: isUsageOpen,
    onClose: () => setIsUsageOpen(false)
  });
  const assetCoverageModalRef = useOverlayBehavior<HTMLDivElement>({
    open: isAssetCoverageOpen,
    onClose: () => setIsAssetCoverageOpen(false)
  });

  const returnTo = `${location.pathname}${location.search}`;
  const loginHref = `/login?redirect=${encodeURIComponent(
    returnTo
  )}&source=prompt_case_admin`;

  return (
    <div className="prompt-case-admin-page">
      <header className="prompt-case-admin-topbar">
        <Link
          className="prompt-case-admin-brand"
          to={`${localePrefix}/prompts`}
        >
          <span className="prompt-case-admin-logo">WebToMind</span>
          <small>{isZh ? 'Prompt 案例后台' : 'Prompt case admin'}</small>
        </Link>
        <nav aria-label={isZh ? '案例管理导航' : 'Case admin navigation'}>
          <Link to={`${localePrefix}/prompts`}>
            <ArrowLeft size={14} />
            {isZh ? '返回案例库' : 'Back to library'}
          </Link>
          <Link to={`${localePrefix}/image`}>
            {isZh ? '图像创作' : 'Image studio'}
          </Link>
        </nav>
      </header>

      <main className="prompt-case-admin-shell">
        <section className="prompt-case-admin-hero">
          <div>
            <p>{isZh ? 'PROMPT ADMIN' : 'PROMPT ADMIN'}</p>
            <h1>{isZh ? '案例管理' : 'Case admin'}</h1>
            <span>
              {isZh
                ? '独立管理案例、双语 Prompt、模型归属和精选状态，不再混在公开案例库浏览框架里。'
                : 'Manage cases, bilingual prompts, model ownership and featured status outside the public library browsing frame.'}
            </span>
          </div>
          <div className="prompt-case-admin-hero-actions">
            {isPromptCaseAdmin && (
              <>
                <button
                  type="button"
                  className="prompt-case-admin-usage-trigger prompt-case-admin-asset-trigger"
                  onClick={() => setIsAssetCoverageOpen(true)}
                >
                  <Wand2 size={15} />
                  {isZh ? '素材覆盖助手' : 'Asset coverage'}
                </button>
                <button
                  type="button"
                  className="prompt-case-admin-usage-trigger"
                  onClick={() => setIsUsageOpen(true)}
                >
                  <BarChart3 size={15} />
                  {isZh ? 'AI 用量' : 'AI usage'}
                </button>
              </>
            )}
            <Badge
              className="prompt-case-admin-badge"
              variant={isPromptCaseAdmin ? 'success' : 'warning'}
              size="md"
            >
              <ShieldCheck size={16} />
              {isPromptCaseAdmin
                ? 'Admin'
                : isZh
                  ? '需管理员权限'
                  : 'Admin only'}
            </Badge>
          </div>
        </section>

        {isLoading ? (
          <section className="prompt-case-admin-state">
            {isZh ? '正在确认登录状态…' : 'Checking session...'}
          </section>
        ) : !isAuthenticated ? (
          <section className="prompt-case-admin-state">
            <h2>{isZh ? '请先登录' : 'Sign in required'}</h2>
            <p>
              {isZh
                ? '案例管理需要管理员账号登录后使用。'
                : 'Case admin requires an authenticated admin account.'}
            </p>
            <Link to={loginHref}>{isZh ? '去登录' : 'Sign in'}</Link>
          </section>
        ) : !isPromptCaseAdmin ? (
          <section className="prompt-case-admin-state">
            <h2>{isZh ? '没有管理权限' : 'No admin access'}</h2>
            <p>
              {isZh
                ? '当前账号不能管理 Prompt 案例。'
                : 'The current account cannot manage prompt cases.'}
            </p>
            <Link to={`${localePrefix}/prompts`}>
              {isZh ? '返回案例库' : 'Back to library'}
            </Link>
          </section>
        ) : (
          <section className="prompt-case-admin-workspace">
            <PromptCasesPanel
              isAuthenticated={isAuthenticated}
              isPromptCaseAdmin={isPromptCaseAdmin}
              onRequireLogin={(source = 'prompt_case_admin_manage') =>
                navigate(
                  `/login?redirect=${encodeURIComponent(
                    returnTo
                  )}&source=${encodeURIComponent(source)}`
                )
              }
              onRecreate={(payload) =>
                navigate(`${localePrefix}/image`, {
                  state: {
                    promptCasePrompt: payload.prompt,
                    model: payload.model,
                    imageSize: payload.imageSize,
                    quality: payload.quality,
                    aspectRatio: payload.aspectRatio
                  }
                })
              }
              variant="full"
              forceManageOpen
            />
          </section>
        )}

        {isPromptCaseAdmin && isAssetCoverageOpen && (
          <div
            className="prompt-case-admin-asset-modal-backdrop"
            onClick={() => setIsAssetCoverageOpen(false)}
          >
            <div
              ref={assetCoverageModalRef}
              className="prompt-case-admin-asset-modal"
              role="dialog"
              aria-modal="true"
              aria-label={
                isZh ? '案例素材覆盖助手' : 'Case asset coverage assistant'
              }
              onClick={(event) => event.stopPropagation()}
              tabIndex={-1}
            >
              <button
                type="button"
                className="prompt-case-admin-asset-modal-close"
                aria-label={
                  isZh
                    ? '关闭案例素材覆盖助手'
                    : 'Close case asset coverage assistant'
                }
                onClick={() => setIsAssetCoverageOpen(false)}
              >
                <X size={18} />
              </button>
              <PromptCaseAssetCoveragePanel
                isZh={isZh}
                className="prompt-case-admin-asset-modal-panel"
              />
            </div>
          </div>
        )}

        {isPromptCaseAdmin && isUsageOpen && (
          <div
            className="prompt-case-admin-usage-modal-backdrop"
            onClick={() => setIsUsageOpen(false)}
          >
            <div
              ref={usageModalRef}
              className="prompt-case-admin-usage-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby={usageTitleId}
              onClick={(event) => event.stopPropagation()}
              tabIndex={-1}
            >
              <button
                type="button"
                className="prompt-case-admin-usage-modal-close"
                aria-label={
                  isZh ? '关闭 AI 用量汇总' : 'Close AI usage summary'
                }
                onClick={() => setIsUsageOpen(false)}
              >
                <X size={18} />
              </button>
              <AiUsageSummaryPanel
                isZh={isZh}
                headingId={usageTitleId}
                className="prompt-case-admin-usage-modal-panel"
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
