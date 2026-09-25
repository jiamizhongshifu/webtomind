import { useState } from 'react';
import type { Project } from '@/services/workspace-api';
import { FREE_DAILY_CREDITS } from '@/shared/credit-policy';
import { Button } from '@/shared/ui/radix/button';
import { SettingsPage } from '@/workspace/components/SettingsPage';
import { WorkbenchTopbar } from '@/workspace/components/WorkbenchTopbar';

const now = Date.now();
const HARNESS_FETCH_MOCK_KEY = '__workspaceSettingsTopbarHarnessFetchMock';

declare global {
  interface Window {
    __workspaceSettingsTopbarHarnessFetchMock?: boolean;
  }
}

function installHarnessApiMocks() {
  if (typeof window === 'undefined') return;
  if (window[HARNESS_FETCH_MOCK_KEY]) return;
  window[HARNESS_FETCH_MOCK_KEY] = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    if (url.includes('/api/credits/daily-usage')) {
      const today = new Date();
      const usage = Array.from({ length: 42 }, (_, index) => {
        const date = new Date(today);
        date.setDate(today.getDate() - (41 - index));
        return {
          date: date.toISOString().slice(0, 10),
          usage: index % 5 === 0 ? 140 : 40 + ((index * 17) % 90)
        };
      });

      return new Response(
        JSON.stringify({
          usage,
          period: {
            start: usage[0]?.date,
            end: usage[usage.length - 1]?.date,
            days: usage.length
          }
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200
        }
      );
    }

    if (url.includes('/api/credits/transactions')) {
      return new Response(
        JSON.stringify({
          transactions: [
            {
              id: 'tx-harness-1',
              amount: -80,
              balanceAfter: 620,
              createdAt: new Date(now - 3600000).toISOString(),
              description: 'Harness image generation',
              metadata: {
                imageCount: 2,
                model: 'gpt-image-2',
                source: 'batch_image_execute'
              },
              source: 'image_generation',
              sourceId: 'task-harness-1',
              type: 'spend'
            },
            {
              id: 'tx-harness-2',
              amount: 120,
              balanceAfter: 700,
              createdAt: new Date(now - 86400000).toISOString(),
              description: 'Daily login reward',
              metadata: {},
              source: 'daily_login_reward',
              sourceId: null,
              type: 'earn'
            }
          ],
          total: 2,
          hasMore: false
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200
        }
      );
    }

    return originalFetch(input, init);
  };
}

installHarnessApiMocks();

const projects: Project[] = [
  {
    id: 'growth',
    name: '增长实验室',
    description: '生成链路和素材策略',
    icon: '📈',
    color: '#0f172a',
    isDefault: false,
    sortOrder: 1,
    summaryCount: 12,
    conversationCount: 4,
    createdAt: now - 86400000 * 8,
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
    summaryCount: 8,
    conversationCount: 2,
    createdAt: now - 86400000 * 4,
    updatedAt: now - 1800000,
    archivedAt: null,
    favoritedAt: null,
    instructions: '关注可复用视觉结构。'
  },
  {
    id: 'long-project',
    name: '一个特别长的项目名称用于检查顶栏截断和弹层宽度',
    description: null,
    icon: '🧪',
    color: '#64748b',
    isDefault: false,
    sortOrder: 3,
    summaryCount: 3,
    conversationCount: 1,
    createdAt: now - 86400000 * 12,
    updatedAt: now - 86400000,
    archivedAt: null,
    favoritedAt: null,
    instructions: null
  }
];

export function WorkspaceSettingsTopbarHarnessPage() {
  const [currentProjectId, setCurrentProjectId] = useState('growth');
  const [status, setStatus] = useState('ready');
  const currentProject = projects.find((project) => project.id === currentProjectId);

  return (
    <main
      className="min-h-screen bg-slate-100 text-slate-950"
      data-harness="workspace-settings-topbar"
    >
      <div className="border-b bg-background px-6 py-4">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Isolated Preview Harness
            </p>
            <h1 className="text-xl font-semibold">
              Workspace Topbar + Settings Migration
            </h1>
            <p className="text-sm text-muted-foreground">
              Status: <span data-testid="harness-status">{status}</span>
            </p>
          </div>
          <Button
            onClick={() => setStatus('manual-check')}
            type="button"
            variant="outline"
          >
            Mark checked
          </Button>
        </div>
      </div>

      <div className="mx-auto mt-6 max-w-6xl overflow-hidden rounded-xl border bg-background shadow-sm">
        <WorkbenchTopbar
          credits={{
            bonus: 420,
            daily: 120,
            dailyMax: FREE_DAILY_CREDITS,
            referral: 80,
            subscription: 0,
            subscriptionMax: 0,
            total: 120
          }}
          currentProjectId={currentProjectId}
          onBack={() => setStatus('back')}
          onSelectProject={(projectId) => {
            setCurrentProjectId(projectId || 'growth');
            setStatus(`project:${projectId || 'workspace'}`);
          }}
          onShowPricing={() => setStatus('pricing')}
          onShowSettings={() => setStatus('settings')}
          profile={{
            days_joined: 42,
            member_number: 128,
            member_number_formatted: '#0128'
          }}
          projectName={currentProject?.name || '工作台'}
          projects={projects}
          subscription={{ planName: 'free', status: 'active' }}
        />
      </div>

      <div className="mt-6">
        <SettingsPage
          credits={{
            bonus: 420,
            daily: 120,
            dailyMax: FREE_DAILY_CREDITS,
            subscription: 0,
            subscriptionMax: 0,
            total: 120
          }}
          onBack={() => setStatus('settings-back')}
          onShowPricing={() => setStatus('settings-pricing')}
          profile={{
            days_joined: 42,
            member_number: 128,
            member_number_formatted: '#0128'
          }}
          subscription={{ planName: 'free', status: 'active' }}
        />
      </div>
    </main>
  );
}
