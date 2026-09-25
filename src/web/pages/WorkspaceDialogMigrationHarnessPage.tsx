import { useState } from 'react';
import { Button } from '@/shared/ui/radix/button';
import { BatchImageConfirmDialog } from '@/workspace/components/BatchImageConfirmDialog';
import { ConfirmDialog } from '@/workspace/components/ConfirmDialog';
import { GlobalSearchModal } from '@/workspace/components/GlobalSearchModal';
import { SummaryConfirmDialog } from '@/workspace/components/SummaryConfirmDialog';
import type { SavedSummary } from '@/services/database';
import type { Project } from '@/services/workspace-api';
import type { BatchPreviewTask } from '@/types/content-blocks';

const projects: Project[] = [
  {
    id: 'growth',
    name: '增长复盘',
    description: '渠道假设和实验结论',
    icon: '📈',
    color: '#0f172a',
    isDefault: false,
    sortOrder: 1,
    summaryCount: 2,
    conversationCount: 1,
    createdAt: Date.now() - 86400,
    updatedAt: Date.now(),
    archivedAt: null,
    favoritedAt: null,
    instructions: null
  }
];

const summaries: SavedSummary[] = [
  {
    id: 'summary-growth',
    title: '增长实验复盘',
    url: 'https://example.com/growth',
    markdown:
      '# 增长实验复盘\n\n核心结论：首屏 CTA 的表达需要更直接，用户会优先扫描任务收益和下一步动作。',
    createdAt: Date.now(),
    tags: ['growth', 'cta'],
    projectId: 'growth',
    contentType: 'article'
  },
  {
    id: 'summary-research',
    title: '素材工作流调研',
    url: 'https://example.com/research',
    markdown:
      '把素材导入、提示词改写和结果复用放在同一个工作流里，可以减少生成链路里的上下文丢失。',
    createdAt: Date.now() - 3600,
    tags: ['workflow'],
    projectId: 'growth',
    contentType: 'article'
  }
];

const batchTasks: BatchPreviewTask[] = [
  {
    id: 'batch-1',
    index: 1,
    title: '首屏视觉图',
    prompt: '一张用于创意工作台首屏的产品视觉图，清晰展示生成前后的差异。',
    status: 'pending'
  },
  {
    id: 'batch-2',
    index: 2,
    title: '社媒封面图',
    prompt: '面向社媒传播的横版封面，强调提示词复用和高质量输出。',
    status: 'pending'
  }
];

export function WorkspaceDialogMigrationHarnessPage() {
  const [status, setStatus] = useState('ready');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(true);

  return (
    <main
      className="min-h-screen bg-slate-50 p-6 text-slate-950"
      data-harness="workspace-dialog-migration"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Isolated Preview Harness
          </p>
          <h1 className="text-2xl font-semibold">Workspace Dialog Migration</h1>
          <p className="text-sm text-slate-600">
            Status: <span data-testid="harness-status">{status}</span>
          </p>
        </header>

        <section className="flex flex-wrap gap-3">
          <Button onClick={() => setSearchOpen(true)}>
            Open global search
          </Button>
          <Button onClick={() => setConfirmOpen(true)} variant="outline">
            Open confirm dialog
          </Button>
          <Button onClick={() => setBatchOpen(true)} variant="outline">
            Open batch dialog
          </Button>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <SummaryConfirmDialog
            data={{
              title: '新建卡片预览',
              content:
                '这是一段较长的卡片内容预览，用于检查 Summary 确认面板里的标题、来源、标签和内容容器是否能够稳定排版。',
              url: 'https://example.com/source',
              tags: ['prompt', 'research', 'workspace'],
              projectId: 'growth'
            }}
            loading={false}
            onCancel={() => setStatus('summary-create-cancel')}
            onConfirm={() => setStatus('summary-create-confirm')}
            type="create"
          />
          <SummaryConfirmDialog
            data={{
              summary: {
                id: 'delete-target',
                title: '即将删除的卡片',
                url: 'https://example.com/delete',
                tags: ['obsolete', 'draft']
              },
              projectId: 'growth'
            }}
            loading={false}
            onCancel={() => setStatus('summary-delete-cancel')}
            onConfirm={() => setStatus('summary-delete-confirm')}
            type="delete"
          />
        </section>
      </div>

      <GlobalSearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectResult={(summary) => setStatus(`selected:${summary.id}`)}
        projects={projects}
        summaries={summaries}
      />

      <ConfirmDialog
        cancelText="取消"
        confirmText="确认删除"
        danger
        description="确定要删除这条测试资料吗？"
        isOpen={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setStatus('confirm-delete');
          setConfirmOpen(false);
        }}
        title="删除资料"
      />

      {batchOpen ? (
        <BatchImageConfirmDialog
          estimatedCredits={8}
          onCancel={() => setBatchOpen(false)}
          onConfirm={() => {
            setStatus('batch-confirm');
            setBatchOpen(false);
          }}
          tasks={batchTasks}
          totalCount={batchTasks.length}
        />
      ) : null}
    </main>
  );
}
