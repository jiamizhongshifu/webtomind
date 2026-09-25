import { useState } from 'react';
import { Button } from '@/shared/ui/radix/button';
import { BoardsOverview } from '@/workspace/components/BoardsOverview';
import type { SavedSummary } from '@/services/database';
import type { Project } from '@/services/workspace-api';

const now = Date.now();

const baseProjects: Project[] = [
  {
    id: 'growth',
    name: '增长复盘',
    description: '渠道实验和素材复用',
    icon: '📈',
    color: '#0f172a',
    isDefault: false,
    sortOrder: 1,
    summaryCount: 2,
    conversationCount: 4,
    createdAt: now - 86400000 * 7,
    updatedAt: now - 3600000,
    archivedAt: null,
    favoritedAt: now - 7200000,
    instructions: null
  },
  {
    id: 'visual',
    name: '视觉案例库',
    description: 'Prompt case references',
    icon: '🎨',
    color: '#334155',
    isDefault: false,
    sortOrder: 2,
    summaryCount: 1,
    conversationCount: 2,
    createdAt: now - 86400000 * 3,
    updatedAt: now - 1800000,
    archivedAt: null,
    favoritedAt: null,
    instructions: '关注可复用视觉结构。'
  },
  {
    id: 'archive',
    name: '旧项目归档',
    description: null,
    icon: '📦',
    color: '#64748b',
    isDefault: false,
    sortOrder: 3,
    summaryCount: 0,
    conversationCount: 0,
    createdAt: now - 86400000 * 30,
    updatedAt: now - 86400000 * 15,
    archivedAt: now - 86400000,
    favoritedAt: null,
    instructions: null
  }
];

const summaries: SavedSummary[] = [
  {
    id: 'summary-growth-1',
    title: '首屏 CTA 实验复盘',
    url: 'https://example.com/growth-cta',
    markdown:
      '# 首屏 CTA 实验复盘\n\n用户更容易点击结果明确、动作短的生成入口。需要把收益和下一步放在同一屏。',
    createdAt: now - 120000,
    tags: ['growth', 'source'],
    projectId: 'growth',
    contentType: 'article'
  },
  {
    id: 'summary-growth-2',
    title: '生成链路素材整理',
    url: 'https://example.com/workflow',
    markdown:
      '把参考图、提示词和输出结果绑定在同一项目里，能够减少二次创作时的信息丢失。',
    createdAt: now - 3600000,
    tags: ['workflow'],
    projectId: 'growth',
    contentType: 'article'
  },
  {
    id: 'summary-visual-1',
    title: '提示词案例视觉结构',
    url: 'https://example.com/prompt-case',
    markdown:
      '案例卡片需要同时展示主体、场景、镜头和光影，让用户能快速判断是否可复用。',
    createdAt: now - 7200000,
    tags: ['prompt'],
    projectId: 'visual',
    contentType: 'article'
  }
];

function createHarnessProject(name: string): Project {
  return {
    id: `created-${Date.now()}`,
    name,
    description: null,
    icon: '✨',
    color: '#111827',
    isDefault: false,
    sortOrder: 10,
    summaryCount: 0,
    conversationCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    archivedAt: null,
    favoritedAt: null,
    instructions: null
  };
}

export function BoardsOverviewHarnessPage() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('ready');
  const [projects, setProjects] = useState(baseProjects);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(
    'growth'
  );

  return (
    <main
      className="min-h-screen bg-slate-100 text-slate-950"
      data-harness="boards-overview-migration"
    >
      <div className="border-b bg-background px-6 py-4">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Isolated Preview Harness
            </p>
            <h1 className="text-xl font-semibold">Boards Overview Migration</h1>
            <p className="text-sm text-muted-foreground">
              Status: <span data-testid="harness-status">{status}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setLoading((value) => !value)}
              type="button"
              variant="outline"
            >
              {loading ? 'Show loaded state' : 'Show loading state'}
            </Button>
            <Button
              onClick={() => {
                setProjects(baseProjects);
                setStatus('reset');
              }}
              type="button"
              variant="outline"
            >
              Reset data
            </Button>
          </div>
        </div>
      </div>

      <div className="h-[calc(100vh-89px)] overflow-hidden">
        <BoardsOverview
          currentProjectId={currentProjectId}
          onArchiveProject={async (id, archived) => {
            setProjects((items) =>
              items.map((project) =>
                project.id === id
                  ? { ...project, archivedAt: archived ? Date.now() : null }
                  : project
              )
            );
            setStatus(`archive:${id}:${archived}`);
          }}
          onCreateProject={async (name) => {
            const project = createHarnessProject(name);
            setProjects((items) => [project, ...items]);
            setStatus(`create:${name}`);
            return project;
          }}
          onDeleteProject={async (id) => {
            setProjects((items) =>
              items.filter((project) => project.id !== id)
            );
            setStatus(`delete:${id}`);
          }}
          onFavoriteProject={async (id, favorited) => {
            setProjects((items) =>
              items.map((project) =>
                project.id === id
                  ? { ...project, favoritedAt: favorited ? Date.now() : null }
                  : project
              )
            );
            setStatus(`favorite:${id}:${favorited}`);
          }}
          onSelectProject={(projectId) => {
            setCurrentProjectId(projectId);
            setStatus(`select-project:${projectId}`);
          }}
          onSelectSummary={(summary) =>
            setStatus(`select-summary:${summary.id}`)
          }
          onUpdateProject={async (id, data) => {
            setProjects((items) =>
              items.map((project) =>
                project.id === id
                  ? {
                      ...project,
                      name: data.name ?? project.name,
                      icon: data.icon ?? project.icon,
                      color: data.color ?? project.color,
                      instructions: data.instructions ?? project.instructions,
                      updatedAt: Date.now()
                    }
                  : project
              )
            );
            setStatus(`update:${id}`);
          }}
          projects={projects}
          projectsLoading={loading}
          summaries={summaries}
          summariesLoading={loading}
        />
      </div>
    </main>
  );
}
