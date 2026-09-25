import { useMemo, useState } from 'react';
import { Button } from '@/shared/ui/radix/button';
import { ExportImageModal } from '@/workspace/components/ExportImageModal';
import { OnboardingModal } from '@/workspace/components/OnboardingModal';
import { SourceDiscoveryModal } from '@/workspace/components/SourceDiscoveryModal';
import type { WebSearchResult } from '@/services/workspace-api';

type ActiveModal = 'source' | 'onboarding' | 'export' | null;

const sourceResults: WebSearchResult[] = [
  {
    title: 'Prompt engineering patterns for visual workflows',
    snippet:
      'A compact field guide covering reusable prompt structures, image references, and iterative generation notes.',
    url: 'https://example.com/prompt-patterns',
    source: 'Example Research'
  },
  {
    title: 'Creative operations checklist',
    snippet:
      'A practical checklist for moving from rough concept to reusable creative assets without losing context.',
    url: 'https://example.com/creative-ops',
    source: 'Example Playbook'
  },
  {
    title: 'Reference board taxonomy',
    snippet:
      'How teams organize references by scene, pose, lighting, style, and product constraints.',
    url: 'https://example.com/reference-board',
    source: 'Example Library'
  }
];

const exportHtml = `
  <div>
    <h1>视觉工作流复盘</h1>
    <p>本轮创作从参考图、场景提示词和可复用风格标签开始，最终沉淀为一组可复用的生成配方。</p>
    <ul>
      <li>首屏 CTA 更适合直接描述结果收益。</li>
      <li>参考图与 prompt 要在同一个工作流里保留上下文。</li>
      <li>导出物需要能被团队快速二次使用。</li>
    </ul>
  </div>
`;

export function WorkspaceModalBatchHarnessPage() {
  const [activeModal, setActiveModal] = useState<ActiveModal>('source');
  const [status, setStatus] = useState('ready');
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(
    () => new Set(sourceResults.slice(0, 2).map((item) => item.url))
  );
  const [importing, setImporting] = useState(false);

  const selectedCount = selectedUrls.size;
  const modalLabel = useMemo(() => activeModal ?? 'none', [activeModal]);

  const closeModal = (nextStatus: string) => {
    setStatus(nextStatus);
    setActiveModal(null);
  };

  const toggleUrl = (url: string) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else {
        next.add(url);
      }
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedUrls((prev) =>
      prev.size === sourceResults.length
        ? new Set()
        : new Set(sourceResults.map((item) => item.url))
    );
  };

  const importSources = () => {
    setImporting(true);
    window.setTimeout(() => {
      setImporting(false);
      closeModal(`imported:${selectedUrls.size}`);
    }, 300);
  };

  return (
    <main
      className="min-h-screen bg-slate-50 p-6 text-slate-950"
      data-harness="workspace-modal-batch"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Isolated Preview Harness
          </p>
          <h1 className="text-2xl font-semibold">Workspace Modal Batch</h1>
          <p className="text-sm text-slate-600">
            Active: <span data-testid="active-modal">{modalLabel}</span>
          </p>
          <p className="text-sm text-slate-600">
            Status: <span data-testid="harness-status">{status}</span>
          </p>
          <p className="text-sm text-slate-600">
            Selected sources:{' '}
            <span data-testid="selected-count">{selectedCount}</span>
          </p>
        </header>

        <section className="flex flex-wrap gap-3">
          <Button
            onClick={() => {
              setStatus('source-open');
              setActiveModal('source');
            }}
          >
            Open source discovery
          </Button>
          <Button
            onClick={() => {
              setStatus('onboarding-open');
              setActiveModal('onboarding');
            }}
            variant="outline"
          >
            Open onboarding
          </Button>
          <Button
            onClick={() => {
              setStatus('export-open');
              setActiveModal('export');
            }}
            variant="outline"
          >
            Open export image
          </Button>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
          <p>
            This page isolates the current shadcn/ui modal migration batch with
            long labels, selectable rows, nested upgrade state, and desktop /
            mobile viewport checks.
          </p>
        </section>
      </div>

      {activeModal === 'source' ? (
        <SourceDiscoveryModal
          importing={importing}
          onClose={() => closeModal('source-closed')}
          onImport={importSources}
          onToggleAll={toggleAll}
          onToggleUrl={toggleUrl}
          query="AI visual prompt workflow"
          results={sourceResults}
          selectedUrls={selectedUrls}
        />
      ) : null}

      {activeModal === 'onboarding' ? (
        <OnboardingModal onClose={() => closeModal('onboarding-closed')} />
      ) : null}

      <ExportImageModal
        contentHtml={exportHtml}
        isOpen={activeModal === 'export'}
        isPremiumUser={false}
        onClose={() => closeModal('export-closed')}
        onUpgrade={() => closeModal('upgrade-clicked')}
        title="workspace-export-harness"
      />
    </main>
  );
}
