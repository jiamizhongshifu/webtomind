import { useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import type { PromptCase } from '@/services/agent-api';
import { Card } from '@/shared/ui';
import { PromptLibraryMasonry } from './PromptLibraryMasonry';
import { isPromptCaseVideo } from '@/utils/prompt-case';
import {
  PromptLibraryNavigation,
  PromptLibrarySortTabs
} from './PromptLibraryNavigation';
import '../../styles/image-create.css';
import './prompt-library-harness.css';
import './prompt-library-apple.css';

function makeHarnessImage(title: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="900" viewBox="0 0 720 900"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#111827"/></linearGradient></defs><rect width="720" height="900" fill="url(#g)"/><circle cx="560" cy="180" r="130" fill="rgba(255,255,255,.18)"/><rect x="64" y="604" width="592" height="166" rx="28" fill="rgba(255,255,255,.16)"/><text x="84" y="675" fill="white" font-family="Arial, sans-serif" font-size="42" font-weight="700">${title}</text><text x="84" y="728" fill="rgba(255,255,255,.74)" font-family="Arial, sans-serif" font-size="24">Prompt library harness</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const sampleCases: PromptCase[] = [
  {
    id: 'harness-editorial',
    slug: 'harness-editorial',
    title: 'Editorial portrait cover',
    imageUrl: makeHarnessImage('Editorial portrait', '#2563eb'),
    prompt: 'Studio editorial portrait with clear subject hierarchy.',
    promptPreview: 'Studio editorial portrait with clear subject hierarchy.',
    model: 'GPT Image 2',
    locale: 'zh-CN',
    category: 'portrait-photography',
    createdAt: '2026-07-02T08:00:00.000Z'
  },
  {
    id: 'harness-product',
    slug: 'harness-product',
    title: 'Product bundle key visual',
    imageUrl: makeHarnessImage('Product visual', '#dc2626'),
    prompt: 'Premium product bundle with layered background.',
    promptPreview: 'Premium product bundle with layered background.',
    model: 'Nano Banana',
    locale: 'zh-CN',
    category: 'product-commercial',
    createdAt: '2026-07-02T08:10:00.000Z'
  },
  {
    id: 'harness-poster',
    slug: 'harness-poster',
    title: 'Poster layout stress test',
    imageUrl: makeHarnessImage('Poster layout', '#16a34a'),
    prompt: 'Tall poster with dense title-safe composition.',
    promptPreview: 'Tall poster with dense title-safe composition.',
    model: 'Flux',
    locale: 'zh-CN',
    category: 'poster-key-visual',
    createdAt: '2026-07-02T08:20:00.000Z'
  },
  {
    id: 'harness-video',
    slug: 'harness-video',
    title: 'Cinematic tracking shot',
    imageUrl: makeHarnessImage('Video motion', '#7c3aed'),
    prompt: 'A cinematic tracking shot through a neon-lit city street.',
    promptPreview: 'A cinematic tracking shot through a neon-lit city street.',
    model: 'Seedance 2.0',
    mediaType: 'video',
    locale: 'zh-CN',
    category: 'video-motion',
    createdAt: '2026-07-02T08:30:00.000Z'
  }
];

export function PromptLibraryHarnessPage() {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(
    () => new Set(['harness-product'])
  );
  const [lastAction, setLastAction] = useState('ready');
  const [aspectRatios, setAspectRatios] = useState<Record<string, string>>({});
  const columns = useMemo(
    () => [
      sampleCases
        .map((caseItem, index) => ({ caseItem, index }))
        .filter((_, index) => index % 2 === 0),
      sampleCases
        .map((caseItem, index) => ({ caseItem, index }))
        .filter((_, index) => index % 2 === 1)
    ],
    []
  );
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const toggleFavorite = (caseId: string) => {
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (next.has(caseId)) {
        next.delete(caseId);
      } else {
        next.add(caseId);
      }
      return next;
    });
    setLastAction(`favorite:${caseId}`);
  };

  const openCase = (event: MouseEvent<HTMLElement>, caseItem: PromptCase) => {
    event.preventDefault();
    setLastAction(`preview:${caseItem.id}`);
  };

  return (
    <main className="prompt-library-harness" data-harness="prompt-library">
      <aside className="prompt-library-harness-panel">
        <p className="prompt-browser-kicker">ISOLATED PREVIEW HARNESS</p>
        <h1>Prompt Library Components</h1>
        <p>
          Dev-only page for checking navigation, card spacing, favorite states,
          focusable DOM, and screenshots without loading the full prompt route.
        </p>
        <dl>
          <div>
            <dt>Cards</dt>
            <dd>{sampleCases.length}</dd>
          </div>
          <div>
            <dt>Favorites</dt>
            <dd>{favoriteIds.size}</dd>
          </div>
          <div>
            <dt>Last action</dt>
            <dd data-testid="harness-state">{lastAction}</dd>
          </div>
          <div>
            <dt>Ratios</dt>
            <dd>{Object.keys(aspectRatios).length}</dd>
          </div>
        </dl>
      </aside>

      <section className="prompt-library-harness-stage">
        <PromptLibrarySortTabs
          isZh
          items={[
            {
              key: 'featured',
              label: '精选',
              href: '/zh-CN/prompts',
              active: true
            },
            {
              key: 'latest',
              label: '最新',
              href: '/zh-CN/prompts?sort=latest',
              active: false
            },
            {
              key: 'hot',
              label: '最热',
              href: '/zh-CN/prompts?sort=hot',
              active: false
            }
          ]}
        />
        <PromptLibraryNavigation
          isZh
          modelItems={[
            {
              key: 'all',
              label: 'ALL',
              count: 1191,
              href: '/zh-CN/prompts',
              active: true
            },
            {
              key: 'model:gpt-image-2',
              label: 'GPT Image 2',
              count: 1158,
              href: '/zh-CN/prompts/model/gpt-image-2',
              active: false
            },
            {
              key: 'model:nano-banana',
              label: 'Nano Banana',
              count: 8,
              href: '/zh-CN/prompts/model/nano-banana',
              active: false
            }
          ]}
          tagItems={[
            {
              key: 'all',
              label: 'ALL',
              href: '/zh-CN/prompts',
              active: true
            },
            {
              key: 'label:portrait',
              label: '人像摄影',
              href: '/zh-CN/prompts?label=portrait-photography',
              active: false
            }
          ]}
        />

        <div className="prompt-library-harness-masonry">
          <PromptLibraryMasonry
            isZh
            locale="zh-CN"
            columns={columns}
            activeColumnCount={2}
            loadState="ready"
            statusState={null}
            allCasesHref="/zh-CN/prompts"
            getCaseHref={(caseItem) => `/zh-CN/prompts/${caseItem.slug}`}
            getCreateHref={(caseItem) =>
              `/zh-CN/${isPromptCaseVideo(caseItem) ? 'video' : 'image'}?caseId=${encodeURIComponent(caseItem.id)}`
            }
            aspectRatios={aspectRatios}
            onAspectRatioChange={(caseId, aspectRatio) => {
              setAspectRatios((current) =>
                current[caseId] === aspectRatio
                  ? current
                  : {
                      ...current,
                      [caseId]: aspectRatio
                    }
              );
            }}
            isFavorited={(caseId) => favoriteIds.has(caseId)}
            onOpenCase={openCase}
            onToggleFavorite={toggleFavorite}
            hasMore={false}
            isLoadingMore={false}
            onLoadMore={() => setLastAction('load-more')}
            loadMoreRef={loadMoreRef}
            visibleCount={sampleCases.length}
            totalCount={sampleCases.length}
            hasAnyCases
          />
        </div>

        <section className="prompt-library-harness-state-grid">
          <Card as="article" variant="flat" className="prompt-seo-card">
            <h2>DOM Checklist</h2>
            <ul>
              <li>Model nav keeps counts stable.</li>
              <li>Tag nav uses label/sort query params.</li>
              <li>Favorite buttons do not open previews.</li>
              <li>Masonry columns keep stable width.</li>
            </ul>
          </Card>
          <Card as="article" variant="flat" className="prompt-seo-card">
            <h2>Screenshot Targets</h2>
            <ul>
              <li>Desktop: 1440 x 920</li>
              <li>Tablet: 900 x 900</li>
              <li>Mobile: 390 x 844</li>
            </ul>
          </Card>
        </section>
      </section>
    </main>
  );
}
