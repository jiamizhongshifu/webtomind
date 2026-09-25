import { useEffect, useState, type Ref } from 'react';
import { Link } from 'react-router-dom';
import ReactPlayer from 'react-player';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Maximize2,
  Share2,
  Star,
  Wand2,
  X
} from 'lucide-react';
import type { PromptCase } from '@/services/agent-api';
import {
  getOptimizedPromptCaseImageUrl,
  getPromptCaseCreateSettings
} from '@/utils/prompt-case';
import type { ResolvedVisualRecipeAsset } from '@/web/components/image-create/assetLibraryResolver';
import { PhotoSwipeViewer } from '@/web/components/image-create/PhotoSwipeViewer';
import { VisualRecipeSummary } from '@/web/components/image-create/VisualRecipeSummary';
import type {
  ImagePromptSelection,
  ImagePromptSlot
} from '@/web/data/image-prompt-core';
import { Button } from '@/shared/ui/radix/button';
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/radix/tabs';
import { BeamCta } from '@/web/components/BeamCta';
import {
  getPromptCaseCover,
  getPromptCaseFullPromptForLocale,
  getPromptCasePromptForLocale
} from './promptLibraryDisplay';
import '../../styles/image-create.css';
import '../../styles/image-create-mobile.css';

type PreviewRelatedRecipeCase = {
  caseItem: PromptCase;
};

interface PromptCasePreviewDialogProps {
  previewCase: PromptCase | null;
  locale: 'zh-CN' | 'en-US';
  isZh: boolean;
  locationSearch: string;
  dialogRef: Ref<HTMLElement>;
  activePreviewImage: string;
  activePreviewVideo: string;
  isActivePreviewVideo: boolean;
  previewCaseImages: string[];
  activePreviewImageIndex: number;
  canNavigatePreviewImages: boolean;
  canNavigatePreviewCases: boolean;
  previewLightboxOpen: boolean;
  copyToastText: string;
  copiedShareUrl: boolean;
  previewVisualRecipeSelection: ImagePromptSelection | null;
  previewVisualRecipeCards: ResolvedVisualRecipeAsset[];
  previewActiveRecipeAssetId: string | null;
  previewActiveRecipeAsset: ResolvedVisualRecipeAsset | null;
  previewRelatedRecipeCases: PreviewRelatedRecipeCase[];
  previewRecipeFallbackCases: PromptCase[];
  previewMorePromptCases: PromptCase[];
  isFavorited: (caseId: string) => boolean;
  toggleFavorite: (caseId: string) => void;
  closePreviewCase: () => void;
  setPreviewImageIndex: (index: number) => void;
  setPreviewLightboxOpen: (open: boolean) => void;
  setPreviewActiveRecipeAssetId: (assetId: string) => void;
  goToPreviewImage: (direction: -1 | 1) => void;
  goToPreviewCase: (direction: -1 | 1) => void;
  handleCopyPreviewPrompt: (
    caseItem: PromptCase,
    promptLocale: 'zh-CN' | 'en-US'
  ) => Promise<void>;
  handleCopyPreviewShareUrl: (caseItem: PromptCase) => Promise<void>;
  handleUsePreviewPrompt: (caseItem: PromptCase) => void;
  getPromptCaseDetailPath: (
    caseItem: PromptCase,
    locale: 'zh-CN' | 'en-US'
  ) => string;
  getPromptCaseCreatePath: (caseItem: PromptCase, search: string) => string;
  getVisualRecipeSlotLabel: (
    slot: ImagePromptSlot,
    locale: 'zh-CN' | 'en-US'
  ) => string;
}

export function PromptCasePreviewDialog({
  previewCase,
  locale,
  isZh,
  locationSearch,
  dialogRef,
  activePreviewImage,
  activePreviewVideo,
  isActivePreviewVideo,
  previewCaseImages,
  activePreviewImageIndex,
  canNavigatePreviewImages,
  canNavigatePreviewCases,
  previewLightboxOpen,
  copyToastText,
  copiedShareUrl,
  previewVisualRecipeSelection,
  previewVisualRecipeCards,
  previewActiveRecipeAssetId,
  previewActiveRecipeAsset,
  previewRelatedRecipeCases,
  previewRecipeFallbackCases,
  previewMorePromptCases,
  isFavorited,
  toggleFavorite,
  closePreviewCase,
  setPreviewImageIndex,
  setPreviewLightboxOpen,
  setPreviewActiveRecipeAssetId,
  goToPreviewImage,
  goToPreviewCase,
  handleCopyPreviewPrompt,
  handleCopyPreviewShareUrl,
  handleUsePreviewPrompt,
  getPromptCaseDetailPath,
  getPromptCaseCreatePath,
  getVisualRecipeSlotLabel
}: PromptCasePreviewDialogProps) {
  const [promptLanguage, setPromptLanguage] = useState<'zh-CN' | 'en-US'>(
    locale
  );

  useEffect(() => {
    setPromptLanguage(locale);
  }, [locale, previewCase?.id]);

  if (!previewCase) return null;

  const createPath = getPromptCaseCreatePath(previewCase, locationSearch);
  const fullCreatePrompt = getPromptCaseFullPromptForLocale(
    previewCase,
    locale
  );
  const createState = {
    ...(fullCreatePrompt ? { promptCasePrompt: fullCreatePrompt } : {}),
    ...(previewVisualRecipeSelection
      ? { visualRecipeSelection: previewVisualRecipeSelection }
      : {}),
    ...getPromptCaseCreateSettings(previewCase)
  };
  const favoriteActive = isFavorited(previewCase.id);
  const activePromptText = getPromptCasePromptForLocale(
    previewCase,
    promptLanguage
  );
  const activeFullPromptText = getPromptCaseFullPromptForLocale(
    previewCase,
    promptLanguage
  );
  const activePromptLabel =
    promptLanguage === 'zh-CN'
      ? isZh
        ? '中文 Prompt'
        : 'Chinese prompt'
      : isZh
        ? '英文 Prompt'
        : 'English prompt';

  return (
    <>
      <div
        className="creator-preview-backdrop create-gallery-preview-backdrop"
        role="presentation"
        onMouseDown={closePreviewCase}
      >
        <article
          ref={dialogRef}
          className="creator-preview create-gallery-preview-modal prompt-case-preview-modal"
          role="dialog"
          aria-modal="true"
          aria-label={previewCase.title || 'Prompt preview'}
          onMouseDown={(event) => event.stopPropagation()}
          tabIndex={-1}
        >
          <div className="creator-preview-head">
            <div className="prompt-case-preview-title">
              <span>{isZh ? '案例预览' : 'Case preview'}</span>
              <strong>{previewCase.title || 'AI image prompt example'}</strong>
            </div>
            <div className="creator-preview-head-actions">
              <div className="creator-preview-actions creator-preview-head-action-row">
                <BeamCta tone="warm">
                  <Button
                    asChild
                    className="creator-preview-reedit creator-preview-create-cta"
                    variant="outline"
                    size="sm"
                  >
                    <Link
                      to={createPath}
                      onClick={() => {
                        closePreviewCase();
                        handleUsePreviewPrompt(previewCase);
                      }}
                      state={createState}
                    >
                      <Wand2 data-icon="inline-start" />
                      {isZh ? '去创作' : 'Create'}
                    </Link>
                  </Button>
                </BeamCta>
                <span className="creator-preview-free-hint">
                  {isZh ? '免费用户每日 1 张' : 'Free: 1 image/day'}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={
                  favoriteActive
                    ? 'creator-preview-favorite-button active'
                    : 'creator-preview-favorite-button'
                }
                aria-label={
                  isZh
                    ? favoriteActive
                      ? '取消收藏案例'
                      : '收藏案例'
                    : favoriteActive
                      ? 'Unsave case'
                      : 'Save case'
                }
                aria-pressed={favoriteActive}
                title={
                  isZh
                    ? favoriteActive
                      ? '取消收藏案例'
                      : '收藏案例'
                    : favoriteActive
                      ? 'Unsave case'
                      : 'Save case'
                }
                onClick={() => toggleFavorite(previewCase.id)}
              >
                <Star fill={favoriteActive ? 'currentColor' : 'none'} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="creator-preview-share-button"
                aria-label={
                  copiedShareUrl
                    ? isZh
                      ? '分享链接已复制'
                      : 'Share link copied'
                    : isZh
                      ? '复制分享链接'
                      : 'Copy share link'
                }
                title={
                  copiedShareUrl
                    ? isZh
                      ? '分享链接已复制'
                      : 'Share link copied'
                    : isZh
                      ? '复制分享链接'
                      : 'Copy share link'
                }
                onClick={() => void handleCopyPreviewShareUrl(previewCase)}
              >
                {copiedShareUrl ? <Check /> : <Share2 />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="creator-preview-close-button"
                aria-label={isZh ? '关闭预览' : 'Close preview'}
                onClick={closePreviewCase}
              >
                <X />
              </Button>
            </div>
          </div>
          <div className="creator-preview-body">
            <div className="creator-preview-image">
              {isActivePreviewVideo ? (
                <ReactPlayer
                  className="creator-preview-video"
                  src={activePreviewVideo}
                  playing
                  muted
                  loop
                  controls
                  playsInline
                  width="100%"
                  height="100%"
                  aria-label={previewCase.title || 'AI video prompt example'}
                />
              ) : activePreviewImage ? (
                <button
                  type="button"
                  className="creator-preview-image-zoom create-gallery-preview-image-button"
                  aria-label={isZh ? '全屏查看图片' : 'Open image fullscreen'}
                  onClick={() => setPreviewLightboxOpen(true)}
                >
                  <img
                    src={getOptimizedPromptCaseImageUrl(activePreviewImage, {
                      width: 1280,
                      quality: 82
                    })}
                    alt={previewCase.title || 'AI image prompt example'}
                    decoding="async"
                  />
                  <span>
                    <Maximize2 size={16} />
                  </span>
                </button>
              ) : (
                <div className="prompt-browser-case-fallback" />
              )}
              {previewCaseImages.length > 1 && (
                <div
                  className="creator-preview-image-switcher"
                  aria-label={isZh ? '切换案例图片' : 'Switch case image'}
                >
                  {previewCaseImages.map((imageUrl, index) => (
                    <button
                      key={`${imageUrl}-${index}`}
                      type="button"
                      className={
                        index === activePreviewImageIndex ? 'active' : ''
                      }
                      aria-label={
                        isZh
                          ? `查看第 ${index + 1} 张案例图片`
                          : `View case image ${index + 1}`
                      }
                      aria-current={
                        index === activePreviewImageIndex ? 'true' : undefined
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        setPreviewImageIndex(index);
                      }}
                    >
                      <img
                        src={getOptimizedPromptCaseImageUrl(imageUrl, {
                          width: 160,
                          quality: 70
                        })}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    </button>
                  ))}
                </div>
              )}
              {(canNavigatePreviewImages || canNavigatePreviewCases) && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="creator-preview-nav prev"
                    aria-label={
                      canNavigatePreviewImages
                        ? isZh
                          ? '上一张图片'
                          : 'Previous image'
                        : isZh
                          ? '上一个作品'
                          : 'Previous case'
                    }
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (canNavigatePreviewImages) {
                        goToPreviewImage(-1);
                      } else {
                        goToPreviewCase(-1);
                      }
                    }}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="creator-preview-nav next"
                    aria-label={
                      canNavigatePreviewImages
                        ? isZh
                          ? '下一张图片'
                          : 'Next image'
                        : isZh
                          ? '下一个作品'
                          : 'Next case'
                    }
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (canNavigatePreviewImages) {
                        goToPreviewImage(1);
                      } else {
                        goToPreviewCase(1);
                      }
                    }}
                  >
                    <ChevronRight />
                  </Button>
                </>
              )}
            </div>
            <div className="creator-preview-side">
              {previewVisualRecipeCards.length > 0 && (
                <div className="creator-preview-recipe-group">
                  <VisualRecipeSummary
                    assets={previewVisualRecipeCards}
                    getSlotLabel={(slot) =>
                      getVisualRecipeSlotLabel(slot, locale)
                    }
                    label={isZh ? '可视化配方' : 'Elements'}
                    createLabel={isZh ? '按配方创作' : 'Create from recipe'}
                    createHref={createPath}
                    createState={createState}
                    onCreateFromRecipe={() => {
                      closePreviewCase();
                      handleUsePreviewPrompt(previewCase);
                    }}
                    activeAssetId={previewActiveRecipeAssetId}
                    onAssetSelect={setPreviewActiveRecipeAssetId}
                  />
                  {previewActiveRecipeAsset && (
                    <div className="creator-prompt-case-related-block">
                      <div className="creator-prompt-case-related-head">
                        <span>
                          {previewRelatedRecipeCases.length > 0
                            ? isZh
                              ? '使用同款素材的热门案例'
                              : 'Cases using this element'
                            : isZh
                              ? '相关热门案例'
                              : 'Related popular cases'}
                        </span>
                        <small>{previewActiveRecipeAsset.asset.title}</small>
                      </div>
                      {previewRelatedRecipeCases.length > 0 ||
                      previewRecipeFallbackCases.length > 0 ? (
                        <div className="creator-prompt-case-related-list">
                          {(previewRelatedRecipeCases.length > 0
                            ? previewRelatedRecipeCases.map(
                                ({ caseItem }) => caseItem
                              )
                            : previewRecipeFallbackCases
                          ).map((caseItem) => (
                            <Link
                              key={caseItem.id}
                              to={getPromptCaseDetailPath(caseItem, locale)}
                              className="creator-prompt-case-related-card"
                            >
                              <span>
                                <img
                                  src={getOptimizedPromptCaseImageUrl(
                                    getPromptCaseCover(caseItem),
                                    {
                                      width: 160,
                                      quality: 72
                                    }
                                  )}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                />
                              </span>
                              <strong>
                                {caseItem.title || 'AI image prompt example'}
                              </strong>
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <p className="creator-prompt-case-related-empty">
                          {isZh
                            ? '暂时没有匹配到更多公开案例。'
                            : 'No other public cases use this element yet.'}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
              <div className="creator-preview-prompt">
                <div className="creator-preview-prompt-head">
                  <span>Prompt</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void handleCopyPreviewPrompt(previewCase, promptLanguage)
                    }
                  >
                    {copyToastText ===
                    (isZh ? '已复制 Prompt' : 'Prompt copied') ? (
                      <Check data-icon="inline-start" />
                    ) : (
                      <Copy data-icon="inline-start" />
                    )}
                    {copyToastText || (isZh ? '复制 Prompt' : 'Copy prompt')}
                  </Button>
                </div>
                <Tabs
                  value={promptLanguage}
                  onValueChange={(value) =>
                    setPromptLanguage(value as 'zh-CN' | 'en-US')
                  }
                  className="creator-preview-prompt-language-tabs"
                  aria-label={
                    isZh ? '选择 Prompt 语言' : 'Choose prompt language'
                  }
                >
                  <TabsList>
                    <TabsTrigger
                      value="zh-CN"
                      className={promptLanguage === 'zh-CN' ? 'active' : ''}
                      onClick={() => setPromptLanguage('zh-CN')}
                    >
                      中文
                    </TabsTrigger>
                    <TabsTrigger
                      value="en-US"
                      className={promptLanguage === 'en-US' ? 'active' : ''}
                      onClick={() => setPromptLanguage('en-US')}
                    >
                      English
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="creator-preview-prompt-stack">
                  <section>
                    <small>{activePromptLabel}</small>
                    <pre>
                      {activeFullPromptText ||
                        activePromptText ||
                        (promptLanguage === 'en-US'
                          ? isZh
                            ? '英文 Prompt 暂未翻译'
                            : 'English prompt is not translated yet.'
                          : isZh
                            ? 'Prompt 暂不可用'
                            : 'Prompt is unavailable.')}
                    </pre>
                  </section>
                </div>
              </div>
              <dl className="creator-preview-meta">
                <div className="creator-preview-meta-wide">
                  <dt>{isZh ? '案例' : 'Case'}</dt>
                  <dd>{previewCase.title || 'AI image prompt example'}</dd>
                </div>
                <div>
                  <dt>{isZh ? '来源' : 'Source'}</dt>
                  <dd>{isZh ? 'Prompt 案例库' : 'Prompt library'}</dd>
                </div>
                <div>
                  <dt>{isZh ? '模型' : 'Model'}</dt>
                  <dd>{previewCase.model || 'AI prompt'}</dd>
                </div>
                {previewCase.category && (
                  <div>
                    <dt>{isZh ? '分类' : 'Category'}</dt>
                    <dd>{previewCase.category}</dd>
                  </div>
                )}
              </dl>
              {previewMorePromptCases.length > 0 && (
                <section className="creator-prompt-case-more-block">
                  <div className="creator-prompt-case-related-head">
                    <span>{isZh ? '更多热门案例' : 'More popular cases'}</span>
                    <small>
                      {isZh ? '继续发现可复用案例' : 'Keep exploring'}
                    </small>
                  </div>
                  <div className="creator-prompt-case-related-list creator-prompt-case-more-list">
                    {previewMorePromptCases.map((caseItem) => (
                      <Link
                        key={caseItem.id}
                        to={getPromptCaseDetailPath(caseItem, locale)}
                        className="creator-prompt-case-related-card"
                      >
                        <span>
                          <img
                            src={getOptimizedPromptCaseImageUrl(
                              getPromptCaseCover(caseItem),
                              {
                                width: 160,
                                quality: 72
                              }
                            )}
                            alt=""
                            loading="lazy"
                            decoding="async"
                          />
                        </span>
                        <strong>
                          {caseItem.title || 'AI image prompt example'}
                        </strong>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        </article>
      </div>
      {previewLightboxOpen && activePreviewImage && !isActivePreviewVideo && (
        <PhotoSwipeViewer
          items={previewCaseImages.map((imageUrl) => ({ src: imageUrl }))}
          index={activePreviewImageIndex}
          onClose={() => setPreviewLightboxOpen(false)}
          onIndexChange={(nextIndex) => setPreviewImageIndex(nextIndex)}
        />
      )}
    </>
  );
}
