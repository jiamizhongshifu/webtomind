import { useEffect, useMemo, useRef, useState } from 'react';
import type { PromptCase, PromptCaseDraft } from '@/services/agent-api';
import { useLocation } from 'react-router-dom';
import { PromptCasesPanel } from '../components/image-create/PromptCasesPanel';
import '../styles/image-create.css';
import '../styles/image-create-mobile.css';
import '../styles/prompt-case-admin.css';

const sampleImage =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 320 420%22%3E%3Cdefs%3E%3ClinearGradient id=%22g%22 x1=%220%22 y1=%220%22 x2=%221%22 y2=%221%22%3E%3Cstop stop-color=%22%23141414%22/%3E%3Cstop offset=%221%22 stop-color=%22%23d9f99d%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width=%22320%22 height=%22420%22 rx=%2232%22 fill=%22url(%23g)%22/%3E%3Ccircle cx=%22234%22 cy=%2286%22 r=%2248%22 fill=%22%23fff%22 opacity=%22.74%22/%3E%3Cpath d=%22M48 300c48-86 104-116 168-92 28 10 48 34 60 72v82H48z%22 fill=%22%23fff%22 opacity=%22.82%22/%3E%3Ctext x=%2248%22 y=%2264%22 font-family=%22Arial%22 font-size=%2227%22 font-weight=%22700%22 fill=%22%23fff%22%3ECASE%3C/text%3E%3C/svg%3E';

const adminCases: PromptCase[] = [
  {
    id: 'admin-case-1',
    slug: 'admin-case-1',
    title: '品牌海报 Prompt',
    imageUrl: sampleImage,
    imageUrls: [sampleImage],
    category: 'poster',
    tags: ['poster', 'brand'],
    model: 'gpt-image-2',
    locale: 'zh-CN',
    featured: true,
    packageSlug: 'wechat-cover-poster',
    promptPreview: '高对比品牌海报，主体清晰，留出标题区。',
    prompt: 'A polished brand poster composition with a clear product hero.',
    viewCount: 1280,
    copyCount: 218,
    generateCount: 93,
    createdAt: '2026-07-01T08:00:00.000Z'
  },
  {
    id: 'admin-case-2',
    slug: 'admin-case-2',
    title: '电商产品图 Prompt',
    imageUrl: sampleImage,
    imageUrls: [sampleImage],
    category: 'ecommerce',
    tags: ['product', 'commerce'],
    model: 'nano-banana',
    locale: 'zh-CN',
    featured: false,
    promptPreview: '干净台面、柔和阴影、商业产品摄影。',
    prompt: 'Clean tabletop commercial product photography.',
    viewCount: 864,
    copyCount: 144,
    generateCount: 57,
    createdAt: '2026-07-02T08:00:00.000Z'
  },
  {
    id: 'admin-case-legacy-import',
    slug: 'legacy-import-featured-category',
    title: '旧导入视频分类污染样本',
    imageUrl: sampleImage,
    imageUrls: [sampleImage],
    category: 'featured',
    tags: ['X 导入', '视频案例'],
    model: 'grok',
    locale: 'zh-CN',
    featured: false,
    promptPreview: '旧导入链路曾把未分类视频写成 featured 分类。',
    prompt: 'Imported short video case awaiting manual prompt cleanup.',
    viewCount: 2,
    copyCount: 1,
    generateCount: 0,
    createdAt: '2026-07-03T08:00:00.000Z'
  }
];

const adminDrafts: PromptCaseDraft[] = [
  {
    id: 'draft-1',
    packageSlug: 'wechat-cover-poster',
    sourceSkill: 'manual',
    title: '朋友圈封面草稿',
    category: 'wechat-cover',
    tags: ['cover'],
    prompt: 'Editorial cover layout with generous copy space.',
    promptPreview: '封面图，强调留白与标题层级。',
    commercialIntent: '用于内容封面批量测试。',
    generationSettings: {
      model: 'gpt-image-2',
      imageSize: '1024x1536',
      quality: 'auto',
      imageCount: 2
    },
    imageUrls: [sampleImage],
    selectedImageUrl: sampleImage,
    memberOnly: false,
    status: 'images_generated',
    createdAt: '2026-07-03T08:00:00.000Z'
  }
];

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function installPromptCasesHarnessFetch(
  originalFetch: typeof fetch,
  drafts: PromptCaseDraft[],
  paginationMode: boolean
) {
  window.fetch = ((input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('/api/admin/prompt-case-drafts')) {
      return Promise.resolve(jsonResponse({ drafts }));
    }
    if (url.includes('/api/admin/prompt-cases')) {
      const requestUrl = new URL(url, window.location.origin);
      const caseId = requestUrl.searchParams.get('id');
      if (caseId) {
        return Promise.resolve(
          jsonResponse({ case: adminCases.find((item) => item.id === caseId) })
        );
      }
      const offset = Number(requestUrl.searchParams.get('offset') || 0);
      const pageCases = paginationMode && offset > 0 ? [] : adminCases;
      return Promise.resolve(
        jsonResponse({
          cases: pageCases,
          pagination: {
            offset,
            limit: 100,
            total: paginationMode ? 103 : adminCases.length,
            hasMore: paginationMode && offset === 0,
            nextOffset:
              paginationMode && offset === 0 ? adminCases.length : null
          }
        })
      );
    }
    if (url.includes('/api/content/prompt-cases')) {
      return Promise.resolve(
        jsonResponse({
          cases: adminCases,
          total: adminCases.length,
          navigationTotal: adminCases.length
        })
      );
    }
    if (url.includes('/api/content/prompt-cases/event')) {
      return Promise.resolve(jsonResponse({ ok: true }));
    }
    return originalFetch(input, init);
  }) as typeof fetch;
}

export function PromptCasesAdminHarnessPage() {
  const location = useLocation();
  const originalFetchRef = useRef<typeof fetch | null>(null);
  const [ready, setReady] = useState(false);
  const harnessMode = new URLSearchParams(location.search).get('mode');
  const isCardMode = harnessMode === 'cards';
  const isCardActionMode = harnessMode === 'card-actions';
  const isEmptyMode = harnessMode === 'empty';
  const isPaginationMode = harnessMode === 'pagination';

  useEffect(() => {
    originalFetchRef.current = window.fetch.bind(window);
    installPromptCasesHarnessFetch(
      originalFetchRef.current,
      isEmptyMode ? [] : adminDrafts,
      isPaginationMode
    );
    setReady(true);
    return () => {
      if (originalFetchRef.current) {
        window.fetch = originalFetchRef.current;
      }
    };
  }, [isEmptyMode, isPaginationMode]);

  const panel = useMemo(
    () =>
      ready ? (
        <PromptCasesPanel
          isAuthenticated
          isPromptCaseAdmin
          onRequireLogin={() => undefined}
          onRecreate={() => undefined}
          variant={isCardActionMode ? 'rail' : 'full'}
          forceManageOpen={!isCardMode}
        />
      ) : null,
    [isCardActionMode, isCardMode, ready]
  );

  return (
    <main
      data-harness="prompt-cases-admin"
      data-mode={
        isCardActionMode
          ? 'card-actions'
          : isCardMode
            ? 'cards'
            : isPaginationMode
              ? 'pagination'
              : isEmptyMode
                ? 'empty'
                : 'admin'
      }
      className="min-h-screen bg-slate-50 p-6 text-slate-950"
    >
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em]">
          Isolated Preview Harness
        </p>
        <h1 className="mt-3 text-4xl font-medium tracking-normal">
          Prompt Cases Admin
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Status: {ready ? 'ready' : 'mocking fetch'}
        </p>
      </header>
      <section className="prompt-case-admin-workspace">{panel}</section>
    </main>
  );
}
