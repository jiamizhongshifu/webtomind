import { useLocation } from 'react-router-dom';
import { stripLocaleRoutePrefix } from '@/shared/seo-route-paths';
import '../styles/page-load-skeleton.css';

type PageLoadSkeletonVariant =
  | 'auto'
  | 'workspace'
  | 'image'
  | 'gallery'
  | 'pricing'
  | 'detail'
  | 'marketing';

interface PageLoadSkeletonProps {
  variant?: PageLoadSkeletonVariant;
  embedded?: boolean;
}

function resolveVariant(
  pathname: string,
  requested: PageLoadSkeletonVariant
): Exclude<PageLoadSkeletonVariant, 'auto'> {
  if (requested !== 'auto') return requested;

  const path = stripLocaleRoutePrefix(pathname);
  if (path.startsWith('/create/image') || path.startsWith('/image')) {
    return 'image';
  }
  if (path.startsWith('/create/pricing') || path === '/pricing') {
    return 'pricing';
  }
  if (
    path === '/create' ||
    path.startsWith('/create/gallery') ||
    path.startsWith('/create/moodboards') ||
    path === '/prompts' ||
    path === '/gallery' ||
    path === '/moodboards' ||
    path.startsWith('/moodboards/') ||
    path === '/video' ||
    path === '/apps' ||
    path === '/characters'
  ) {
    return 'gallery';
  }
  if (
    path.startsWith('/create') ||
    path.startsWith('/prompts') ||
    path.startsWith('/account') ||
    path.startsWith('/settings') ||
    path.startsWith('/boards')
  ) {
    return 'workspace';
  }
  if (path.startsWith('/share/') || path.startsWith('/public/')) {
    return 'detail';
  }
  return 'marketing';
}

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <span className={`page-load-skeleton-block ${className}`} />;
}

function WorkspaceRailSkeleton() {
  return (
    <aside className="page-load-skeleton-rail" aria-hidden="true">
      <div className="page-load-skeleton-brand">
        <SkeletonBlock className="is-logo" />
        <SkeletonBlock className="is-brand-name" />
      </div>
      <SkeletonBlock className="is-rail-toggle" />
      <div className="page-load-skeleton-rail-links">
        {Array.from({ length: 8 }, (_, index) => (
          <div className="page-load-skeleton-rail-link" key={index}>
            <SkeletonBlock className="is-nav-icon" />
            <SkeletonBlock className="is-nav-label" />
          </div>
        ))}
      </div>
      <div className="page-load-skeleton-sessions">
        <SkeletonBlock className="is-session-heading" />
        {Array.from({ length: 3 }, (_, index) => (
          <div className="page-load-skeleton-session" key={index}>
            <SkeletonBlock className="is-session-thumb" />
            <SkeletonBlock className="is-session-title" />
          </div>
        ))}
      </div>
      <SkeletonBlock className="is-account" />
    </aside>
  );
}

function ImageWorkspaceSkeleton() {
  return (
    <main className="page-load-skeleton-main is-image" aria-hidden="true">
      <SkeletonBlock className="is-page-title" />
      <div className="page-load-skeleton-conversation">
        <div className="page-load-skeleton-prompt-column">
          <div className="page-load-skeleton-prompt">
            {Array.from({ length: 6 }, (_, index) => (
              <SkeletonBlock
                className={
                  index === 5 ? 'is-copy-line is-short' : 'is-copy-line'
                }
                key={index}
              />
            ))}
          </div>
          <SkeletonBlock className="is-model-chip" />
        </div>
        <SkeletonBlock className="is-image-result" />
      </div>
      <div className="page-load-skeleton-composer">
        <SkeletonBlock className="is-composer-line" />
        <div className="page-load-skeleton-composer-tools">
          {Array.from({ length: 5 }, (_, index) => (
            <SkeletonBlock className="is-tool" key={index} />
          ))}
          <SkeletonBlock className="is-send" />
        </div>
      </div>
    </main>
  );
}

function GalleryWorkspaceSkeleton() {
  return (
    <main className="page-load-skeleton-main is-gallery" aria-hidden="true">
      <div className="page-load-skeleton-gallery-heading">
        <div>
          <SkeletonBlock className="is-page-title is-wide" />
          <SkeletonBlock className="is-page-subtitle" />
        </div>
        <SkeletonBlock className="is-search" />
      </div>
      <SkeletonBlock className="is-gallery-hero" />
      <div className="page-load-skeleton-tabs">
        <SkeletonBlock className="is-tab" />
        <SkeletonBlock className="is-tab" />
      </div>
      <div className="page-load-skeleton-grid">
        {Array.from({ length: 12 }, (_, index) => (
          <SkeletonBlock
            className={`is-gallery-card is-ratio-${(index % 3) + 1}`}
            key={index}
          />
        ))}
      </div>
    </main>
  );
}

function PricingSkeleton({ embedded }: { embedded: boolean }) {
  return (
    <main
      className={`page-load-skeleton-main is-pricing${embedded ? ' is-embedded' : ''}`}
      aria-hidden="true"
    >
      <SkeletonBlock className="is-eyebrow" />
      <SkeletonBlock className="is-pricing-title" />
      <SkeletonBlock className="is-pricing-subtitle" />
      <SkeletonBlock className="is-billing-toggle" />
      <div className="page-load-skeleton-plans">
        {Array.from({ length: 3 }, (_, index) => (
          <div className="page-load-skeleton-plan" key={index}>
            <SkeletonBlock className="is-plan-name" />
            <SkeletonBlock className="is-plan-copy" />
            <SkeletonBlock className="is-plan-price" />
            <SkeletonBlock className="is-plan-credit" />
            <SkeletonBlock className="is-plan-button" />
            {Array.from({ length: 5 }, (_, featureIndex) => (
              <SkeletonBlock className="is-plan-feature" key={featureIndex} />
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}

function DetailSkeleton() {
  return (
    <main className="page-load-skeleton-main is-detail" aria-hidden="true">
      <SkeletonBlock className="is-detail-visual" />
      <div className="page-load-skeleton-detail-copy">
        <SkeletonBlock className="is-detail-title" />
        {Array.from({ length: 8 }, (_, index) => (
          <SkeletonBlock
            className={
              index === 7 ? 'is-detail-line is-short' : 'is-detail-line'
            }
            key={index}
          />
        ))}
        <SkeletonBlock className="is-detail-action" />
      </div>
    </main>
  );
}

function MarketingSkeleton() {
  return (
    <div className="page-load-skeleton-marketing" aria-hidden="true">
      <header>
        <SkeletonBlock className="is-marketing-logo" />
        <div>
          {Array.from({ length: 4 }, (_, index) => (
            <SkeletonBlock className="is-marketing-link" key={index} />
          ))}
        </div>
        <SkeletonBlock className="is-marketing-button" />
      </header>
      <main>
        <div className="page-load-skeleton-marketing-copy">
          <SkeletonBlock className="is-marketing-eyebrow" />
          <SkeletonBlock className="is-marketing-title" />
          <SkeletonBlock className="is-marketing-title is-short" />
          <SkeletonBlock className="is-marketing-subtitle" />
          <SkeletonBlock className="is-marketing-subtitle is-short" />
          <SkeletonBlock className="is-marketing-cta" />
        </div>
        <SkeletonBlock className="is-marketing-visual" />
      </main>
    </div>
  );
}

export function PageLoadSkeleton({
  variant = 'auto',
  embedded = false
}: PageLoadSkeletonProps) {
  const location = useLocation();
  const resolvedVariant = resolveVariant(location.pathname, variant);
  const usesWorkspaceRail =
    !embedded && ['workspace', 'image', 'gallery'].includes(resolvedVariant);

  if (resolvedVariant === 'marketing') {
    return (
      <div
        className="page-load-skeleton"
        role="status"
        aria-label="页面内容正在加载"
        aria-busy="true"
      >
        <MarketingSkeleton />
      </div>
    );
  }

  return (
    <div
      className={`page-load-skeleton page-load-skeleton--${resolvedVariant}${embedded ? ' is-embedded' : ''}`}
      role="status"
      aria-label="页面内容正在加载"
      aria-busy="true"
    >
      {usesWorkspaceRail && <WorkspaceRailSkeleton />}
      {resolvedVariant === 'image' && <ImageWorkspaceSkeleton />}
      {(resolvedVariant === 'gallery' || resolvedVariant === 'workspace') && (
        <GalleryWorkspaceSkeleton />
      )}
      {resolvedVariant === 'pricing' && <PricingSkeleton embedded={embedded} />}
      {resolvedVariant === 'detail' && <DetailSkeleton />}
      {usesWorkspaceRail && (
        <div className="page-load-skeleton-mobile-nav" aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => (
            <SkeletonBlock className="is-mobile-nav-item" key={index} />
          ))}
        </div>
      )}
    </div>
  );
}
