import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { CreateWorkspaceFrame } from '../components/image-create/CreateWorkspaceFrame';
import { QuestSection } from '@/workspace/components/QuestSection';
import { CreditsDisplay } from '@/workspace/components/CreditsDisplay';
import { applySeo } from '../lib/seo';

function getLocalePrefix(pathname: string): '' | '/zh-CN' | '/en-US' {
  if (pathname.startsWith('/en-US')) return '/en-US';
  if (pathname.startsWith('/zh-CN')) return '/zh-CN';
  return '';
}

export function CreateTasksPage() {
  const location = useLocation();
  const localePrefix = getLocalePrefix(location.pathname);

  useEffect(() => {
    return applySeo({
      title: 'WebToMind 积分与任务 | 新手创作路径',
      description:
        '完成 WebToMind 新手任务，学习 Prompt 案例、图库参考、角色一致性和 Board 工作流。',
      robots: 'noindex,nofollow',
      htmlLang: localePrefix === '/en-US' ? 'en' : 'zh-CN'
    });
  }, [localePrefix]);

  return (
    <CreateWorkspaceFrame className="create-tasks-route">
      <section className="create-page-title">
        <span className="create-eyebrow">Credits & Tasks</span>
        <h1>积分与任务</h1>
        <p>把新手教育做成一条能拿奖励的路径：先学会生成，再学会复用和沉淀。</p>
      </section>
      <section className="create-credit-panel">
        <div>
          <span>当前积分</span>
          <CreditsDisplay />
        </div>
        <p>系统会优先使用套餐积分；完成任务后余额会自动刷新。</p>
      </section>
      <QuestSection />
    </CreateWorkspaceFrame>
  );
}
