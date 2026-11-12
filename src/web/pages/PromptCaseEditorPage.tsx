import { useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { applySeo } from '../lib/seo';
import { useAuth } from '../contexts/AuthContext';
import { PromptCasesPanel } from '../components/image-create/PromptCasesPanel';
import '../styles/image-create.css';
import '../styles/image-create-mobile.css';
import '../styles/prompt-case-admin.css';

function getLocalePrefix(pathname: string) {
  return pathname.startsWith('/en-US') ? '/en-US' : '/zh-CN';
}

/**
 * 案例编辑器独立页面：/prompts/admin/cases/new 与 /prompts/admin/cases/:caseId/edit。
 * 表单本身仍由 PromptCasesPanel 承载，这里只负责 URL、返回路径与 SEO。
 */
export function PromptCaseEditorPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { caseId } = useParams<{ caseId?: string }>();
  const { isAuthenticated, user } = useAuth();
  const localePrefix = getLocalePrefix(location.pathname);
  const isZh = localePrefix === '/zh-CN';
  const isPromptCaseAdmin =
    user?.email?.trim().toLowerCase() === 'admin@example.com';
  const adminPath = `${localePrefix}/prompts/admin`;
  const isImport = /\/cases\/import\/?$/.test(location.pathname);

  useEffect(() => {
    return applySeo({
      title: isZh ? '编辑案例 | WebToMind' : 'Edit case | WebToMind',
      description: isZh ? '编辑 Prompt 案例' : 'Edit a prompt case',
      canonical: `${window.location.origin}${location.pathname}`,
      robots: 'noindex,nofollow'
    });
  }, [isZh, location.pathname]);

  return (
    <PromptCasesPanel
      isAuthenticated={isAuthenticated}
      isPromptCaseAdmin={isPromptCaseAdmin}
      onRequireLogin={() => {
        navigate(
          `/login?redirect=${encodeURIComponent(location.pathname)}&source=prompt_case_admin`
        );
      }}
      onRecreate={(payload) => {
        navigate(`${localePrefix}/image`, {
          state: {
            promptCasePrompt: payload.prompt,
            model: payload.model,
            imageSize: payload.imageSize,
            quality: payload.quality,
            aspectRatio: payload.aspectRatio
          }
        });
      }}
      variant="full"
      editorRoute={
        isImport
          ? null
          : {
              mode: caseId ? 'edit' : 'create',
              caseId
            }
      }
      importRoute={isImport}
      onEditorExit={() => navigate(adminPath)}
      onImportExit={() => navigate(adminPath)}
    />
  );
}

export default PromptCaseEditorPage;
