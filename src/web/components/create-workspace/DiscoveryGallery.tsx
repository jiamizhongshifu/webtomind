import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent
} from 'react';
import { useInView } from 'react-intersection-observer';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Bookmark,
  Check,
  Copy,
  ImagePlus,
  LockKeyhole,
  Video,
  WandSparkles
} from 'lucide-react';
import { Button, ButtonLink, EmptyState } from '@/shared/ui';
import type { DiscoveryImage } from '@/services/create-workspace-v2-api';
import type { VisualMoodboard } from '@/shared/create-workspace-v2';
import { VisualMasonry } from './VisualMasonry';
import { DiscoveryImageMoodboardActions } from './DiscoveryImageMoodboardActions';
import { DiscoveryMasonryImage } from './DiscoveryMasonryImage';
import { fallbackDiscoveryImageTone } from '../../lib/discovery-image-presentation';
import { createDiscoveryRecreateUrl } from '../../lib/discovery-recreate';

type GalleryKind = 'images' | 'moodboards';

export function DiscoveryLoadMore({
  hasMore,
  loading,
  isEnglish,
  onLoadMore
}: {
  hasMore: boolean;
  loading: boolean;
  isEnglish: boolean;
  onLoadMore: () => void;
}) {
  const onLoadMoreRef = useRef(onLoadMore);
  const { ref: sentinelRef, inView } = useInView({
    rootMargin: '520px 0px',
    // 加载中保持观察：inView 状态不重置，边缘触发不会在加载完成后重复翻页。
    skip: !hasMore
  });
  // 边缘触发：哨兵从「不在视口」进入「在视口」只触发一次加载；
  // 加载完成后若仍停在视口内不会反复翻页，需用户继续滚动离开再进入。
  const wasInViewRef = useRef(false);

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    if (!inView) {
      wasInViewRef.current = false;
      return;
    }
    if (wasInViewRef.current) return;
    wasInViewRef.current = true;
    if (!hasMore || loading) return;
    onLoadMoreRef.current();
  }, [hasMore, inView, loading]);

  if (!hasMore && !loading) return null;

  return (
    <div
      ref={sentinelRef}
      className="discovery-load-more"
      role="status"
      aria-live="polite"
    >
      {loading ? (
        <span className="discovery-load-more-status">
          <span className="discovery-load-more-spinner" aria-hidden="true" />
          {isEnglish ? 'Loading more…' : '正在加载更多…'}
        </span>
      ) : (
        <button type="button" onClick={onLoadMore}>
          {isEnglish ? 'Load more' : '加载更多'}
        </button>
      )}
    </div>
  );
}

export function DiscoveryGallerySkeleton({
  kind,
  isEnglish = false
}: {
  kind: GalleryKind;
  isEnglish?: boolean;
}) {
  const label = isEnglish
    ? `Loading ${kind === 'images' ? 'images' : 'moodboards'}`
    : `正在加载${kind === 'images' ? '图像灵感' : '情绪板'}`;

  if (kind === 'moodboards') {
    return (
      <div
        className="discovery-moodboard-grid discovery-gallery-skeleton"
        role="status"
        aria-label={label}
        data-testid="discovery-moodboard-skeleton"
      >
        {Array.from({ length: 6 }, (_, index) => (
          <div
            className="discovery-moodboard-skeleton-tile"
            key={`moodboard-skeleton-${index + 1}`}
            aria-hidden="true"
          >
            <div className="discovery-moodboard-skeleton-collage">
              {Array.from({ length: 4 }, (__, imageIndex) => (
                <span
                  key={`moodboard-skeleton-${index + 1}-${imageIndex + 1}`}
                />
              ))}
            </div>
            <span className="discovery-moodboard-skeleton-title" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <VisualMasonry
      className="discovery-image-masonry discovery-gallery-skeleton"
      role="status"
      aria-label={label}
      data-testid="discovery-image-skeleton"
    >
      {Array.from({ length: 15 }, (_, index) => (
        <span
          className="discovery-image-skeleton-tile"
          key={`image-skeleton-${index + 1}`}
          aria-hidden="true"
          style={
            {
              '--discovery-image-tone': fallbackDiscoveryImageTone(
                `discovery-loading-${index + 1}`
              )
            } as CSSProperties
          }
        />
      ))}
    </VisualMasonry>
  );
}

function previewHref(prefix: string, gallery: GalleryKind, id: string): string {
  const params = new URLSearchParams({ gallery, preview: id });
  return `${prefix}/create?${params.toString()}`;
}

export function DiscoveryImageMasonry({
  images,
  prefix,
  isEnglish,
  moodboards = [],
  selectedMoodboardId = '',
  savingImageId = '',
  isSavedToSelectedMoodboard = () => false,
  onSelectMoodboard,
  onSaveToMoodboard
}: {
  images: DiscoveryImage[];
  prefix: string;
  isEnglish: boolean;
  moodboards?: VisualMoodboard[];
  selectedMoodboardId?: string;
  savingImageId?: string;
  isSavedToSelectedMoodboard?: (image: DiscoveryImage) => boolean;
  onSelectMoodboard?: (boardId: string) => void;
  onSaveToMoodboard?: (image: DiscoveryImage) => void;
}) {
  if (!images.length) {
    return (
      <EmptyState
        title={isEnglish ? 'No matching images' : '没有匹配的图像'}
        description={
          isEnglish
            ? 'Try a broader visual term or start from a recipe.'
            : '换一个更宽泛的视觉关键词，或直接从配方开始创作。'
        }
        icon={<ImagePlus />}
        action={
          <ButtonLink to={`${prefix}/image`} variant="primary">
            {isEnglish ? 'Open Image Studio' : '打开图像创作'}
          </ButtonLink>
        }
      />
    );
  }

  return (
    <VisualMasonry className="discovery-image-masonry">
      {images.map((item) => (
        <article
          className="discovery-image-tile"
          key={`${item.kind}-${item.id}`}
        >
          <Link
            to={previewHref(prefix, 'images', item.id)}
            state={{ discoveryImage: item }}
            className="discovery-tile-primary"
            aria-label={`${isEnglish ? 'Preview' : '预览'}：${item.title}`}
          >
            <DiscoveryMasonryImage
              imageUrl={item.imageUrl}
              alt={item.title}
              dominantColor={item.dominantColor}
              width={item.width}
              height={item.height}
            />
          </Link>
          {onSelectMoodboard && onSaveToMoodboard ? (
            <DiscoveryImageMoodboardActions
              boards={moodboards}
              selectedBoardId={selectedMoodboardId}
              prefix={prefix}
              isEnglish={isEnglish}
              saving={savingImageId === `${item.kind}:${item.id}`}
              saved={isSavedToSelectedMoodboard(item)}
              onSelectBoard={onSelectMoodboard}
              onSave={() => onSaveToMoodboard(item)}
            />
          ) : null}
        </article>
      ))}
    </VisualMasonry>
  );
}

function MoodboardCollage({ board }: { board: VisualMoodboard }) {
  const images = (board.items || [])
    .map((item) => item.imageUrl)
    .filter(Boolean);
  if (!images.length && board.coverImageUrl) images.push(board.coverImageUrl);
  return (
    <div
      className="discovery-moodboard-collage"
      data-count={Math.min(images.length, 4)}
    >
      {images.slice(0, 4).map((imageUrl, index) => (
        <img
          key={`${board.id}-${imageUrl}-${index}`}
          src={imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
        />
      ))}
    </div>
  );
}

export function DiscoveryMoodboardGrid({
  boards,
  prefix,
  isEnglish,
  savingId,
  usingId,
  savedIds,
  onSave,
  onUse
}: {
  boards: VisualMoodboard[];
  prefix: string;
  isEnglish: boolean;
  savingId?: string;
  usingId?: string;
  savedIds: Set<string>;
  onSave: (board: VisualMoodboard) => void;
  onUse: (board: VisualMoodboard) => void;
}) {
  return (
    <div className="discovery-moodboard-grid">
      {boards.map((board) => {
        const saved = savedIds.has(board.id);
        return (
          <article className="discovery-moodboard-tile" key={board.id}>
            <Link
              to={previewHref(prefix, 'moodboards', board.id)}
              state={{ discoveryMoodboard: board }}
              className="discovery-tile-primary"
              aria-label={`${isEnglish ? 'Preview' : '预览'}：${board.name}`}
            >
              <MoodboardCollage board={board} />
            </Link>
            <div className="discovery-moodboard-caption">
              <strong>{board.name}</strong>
            </div>
            <div className="discovery-moodboard-actions">
              <Button
                type="button"
                variant="glass"
                size="sm"
                aria-label={`${isEnglish ? 'Save moodboard' : '保存情绪板'}：${board.name}`}
                leadingIcon={saved ? <Check /> : <Bookmark />}
                isLoading={savingId === board.id}
                disabled={saved || savingId === board.id}
                onClick={() => onSave(board)}
              >
                {saved
                  ? isEnglish
                    ? 'Saved'
                    : '已保存'
                  : isEnglish
                    ? 'Save'
                    : '保存'}
              </Button>
              <Button
                type="button"
                variant="glass"
                size="sm"
                aria-label={`${isEnglish ? 'Use moodboard' : '使用情绪板创作'}：${board.name}`}
                leadingIcon={<WandSparkles />}
                isLoading={usingId === board.id}
                disabled={usingId === board.id}
                onClick={() => onUse(board)}
              >
                {isEnglish ? 'Use' : '创作'}
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function DiscoveryImagePreview({
  image,
  related,
  prefix,
  isEnglish,
  loadingPrompt = false,
  loadingRelated = false
}: {
  image: DiscoveryImage;
  related: DiscoveryImage[];
  prefix: string;
  isEnglish: boolean;
  loadingPrompt?: boolean;
  loadingRelated?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const promptLocked = image.promptLocked !== false;
  const displayPrompt =
    (promptLocked ? image.promptPreview : image.prompt) ||
    (isEnglish
      ? 'Sign in to view the complete prompt.'
      : '登录后可查看完整提示词。');
  const currentPreviewPath = previewHref(prefix, 'images', image.id);
  const unlockHref = image.memberOnly
    ? `${prefix}${image.href}`
    : `${prefix}/login?redirect=${encodeURIComponent(currentPreviewPath)}&source=discovery_prompt_unlock`;
  const copyPrompt = async () => {
    if (promptLocked || !image.prompt.trim()) return;
    try {
      await navigator.clipboard.writeText(image.prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  const prepareRecreateInNewSession = (
    event: MouseEvent<HTMLAnchorElement>
  ) => {
    const url = createDiscoveryRecreateUrl(prefix, image.prompt);
    event.currentTarget.href = url;
  };
  return (
    <div className="discovery-preview-page">
      <ButtonLink
        to={`${prefix}/create?gallery=images`}
        variant="ghost"
        leadingIcon={<ArrowLeft />}
        className="discovery-preview-back"
      >
        {isEnglish ? 'Back to inspiration' : '返回灵感'}
      </ButtonLink>
      <section className="discovery-preview-layout">
        <div className="discovery-preview-media">
          <img
            src={image.imageUrl}
            alt={image.title}
            width={image.width || 1600}
            height={image.height || 1600}
          />
        </div>
        <aside className="discovery-preview-aside">
          <span>{isEnglish ? 'Prompt' : '提示词'}</span>
          <p aria-busy={loadingPrompt}>{displayPrompt}</p>
          {loadingPrompt ? (
            <Button type="button" variant="ghost" size="sm" isLoading disabled>
              {isEnglish ? 'Loading prompt' : '正在加载提示词'}
            </Button>
          ) : promptLocked ? (
            <ButtonLink
              to={unlockHref}
              variant="ghost"
              size="sm"
              leadingIcon={<LockKeyhole />}
            >
              {image.memberOnly
                ? isEnglish
                  ? 'Unlock with membership'
                  : '开通会员解锁'
                : isEnglish
                  ? 'Sign in to view prompt'
                  : '登录查看完整提示词'}
            </ButtonLink>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              leadingIcon={copied ? <Check /> : <Copy />}
              onClick={() => void copyPrompt()}
            >
              {copied
                ? isEnglish
                  ? 'Copied'
                  : '已复制'
                : isEnglish
                  ? 'Copy prompt'
                  : '复制提示词'}
            </Button>
          )}
          <div className="discovery-preview-cta">
            {promptLocked ? (
              <ButtonLink
                to={unlockHref}
                variant="primary"
                leadingIcon={<WandSparkles />}
              >
                {isEnglish ? 'View prompt details' : '查看提示词详情'}
              </ButtonLink>
            ) : (
              <>
                <ButtonLink
                  to={`${prefix}/image?newSession=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="primary"
                  leadingIcon={<WandSparkles />}
                  onClick={prepareRecreateInNewSession}
                >
                  {isEnglish ? 'Use in studio' : '带入创作台'}
                </ButtonLink>
                <ButtonLink
                  to={`${prefix}/video`}
                  state={{ prompt: image.prompt, imageUrl: image.imageUrl }}
                  variant="secondary"
                  leadingIcon={<Video />}
                >
                  {isEnglish ? 'Create video' : '生成视频'}
                </ButtonLink>
              </>
            )}
          </div>
        </aside>
      </section>
      <section className="discovery-preview-related">
        <h2>{isEnglish ? 'More like this' : '更多相似灵感'}</h2>
        {loadingRelated ? (
          <DiscoveryGallerySkeleton kind="images" isEnglish={isEnglish} />
        ) : (
          <DiscoveryImageMasonry
            images={related.filter((item) => item.id !== image.id)}
            prefix={prefix}
            isEnglish={isEnglish}
          />
        )}
      </section>
    </div>
  );
}

export function DiscoveryMoodboardPreview({
  board,
  prefix,
  isEnglish,
  saving,
  using,
  saved,
  onSave,
  onUse
}: {
  board: VisualMoodboard;
  prefix: string;
  isEnglish: boolean;
  saving: boolean;
  using: boolean;
  saved: boolean;
  onSave: (board: VisualMoodboard) => void;
  onUse: (board: VisualMoodboard) => void;
}) {
  const [keywordsCopied, setKeywordsCopied] = useState(false);
  const images = board.items || [];
  const copyKeywords = async () => {
    try {
      await navigator.clipboard.writeText(board.keywords.join(', '));
      setKeywordsCopied(true);
      window.setTimeout(() => setKeywordsCopied(false), 1600);
    } catch {
      setKeywordsCopied(false);
    }
  };
  return (
    <div className="discovery-preview-page is-moodboard">
      <ButtonLink
        to={`${prefix}/create?gallery=moodboards`}
        variant="ghost"
        leadingIcon={<ArrowLeft />}
        className="discovery-preview-back"
      >
        {isEnglish ? 'Back to inspiration' : '返回灵感'}
      </ButtonLink>
      <section className="discovery-moodboard-preview-layout">
        <div className="discovery-moodboard-preview-grid">
          {images.map((item) => (
            <img
              key={item.id}
              src={item.imageUrl}
              alt={item.title || ''}
              width={900}
              height={1200}
              loading="lazy"
              decoding="async"
            />
          ))}
        </div>
        <aside className="discovery-preview-aside discovery-moodboard-preview-aside">
          <header className="discovery-moodboard-profile-title">
            <span>{isEnglish ? 'Moodboard' : '情绪板'}</span>
            <h1>{board.name}</h1>
          </header>
          <section className="discovery-moodboard-profile-section">
            <h2>{isEnglish ? 'Taste Profile' : '风格画像'}</h2>
            <p>{board.tasteProfile || board.description}</p>
          </section>
          <section className="discovery-moodboard-profile-section">
            <div className="discovery-moodboard-section-head">
              <h2>{isEnglish ? 'Keywords' : '关键词'}</h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                leadingIcon={keywordsCopied ? <Check /> : <Copy />}
                onClick={() => void copyKeywords()}
              >
                {keywordsCopied
                  ? isEnglish
                    ? 'Copied'
                    : '已复制'
                  : isEnglish
                    ? 'Copy'
                    : '复制'}
              </Button>
            </div>
            <div className="discovery-keywords">
              {board.keywords.map((keyword) => (
                <span key={keyword}>{keyword}</span>
              ))}
            </div>
          </section>
          <div className="discovery-preview-cta">
            <Button
              type="button"
              variant="primary"
              leadingIcon={<WandSparkles />}
              isLoading={using}
              disabled={using}
              onClick={() => onUse(board)}
            >
              {isEnglish ? 'Generate with Moodboard' : '使用情绪板创作'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              leadingIcon={saved ? <Check /> : <Bookmark />}
              isLoading={saving}
              disabled={saved || saving}
              onClick={() => onSave(board)}
            >
              {saved
                ? isEnglish
                  ? 'Saved'
                  : '已保存'
                : isEnglish
                  ? 'Save Moodboard'
                  : '保存情绪板'}
            </Button>
          </div>
        </aside>
      </section>
    </div>
  );
}
