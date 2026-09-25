import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties
} from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Check,
  Copy,
  ExternalLink,
  Lock,
  RefreshCw,
  Star,
  Wand2
} from 'lucide-react';
import '../styles/image-create.css';
import '../styles/prompt-detail.css';
import {
  getPublicPromptCase,
  getPublicPromptCases,
  trackPromptCaseEvent,
  type PromptCase
} from '@/services/agent-api';
import { useAuth } from '../contexts/AuthContext';
import {
  trackPromptCaseCta,
  trackPromptCopy,
  trackPromptGenerate,
  trackPromptShareView,
  trackPricingView
} from '../lib/analytics';
import {
  recordClientConversionEvent,
  type ClientConversionEventPayload
} from '../lib/client-conversion-events';
import { applySeo } from '../lib/seo';
import { AssetThumb } from '../components/image-create/AssetThumb';
import {
  buildPromptTextForVisualRecipe,
  inferVisualRecipeSelectionFromPromptText,
  getLocalPublicImagePromptAssets,
  loadPublicImagePromptAssetLibrary,
  mergeVisualRecipeSelections,
  resolveVisualRecipeAssets,
  type ResolvedVisualRecipeAsset
} from '../components/image-create/assetLibraryResolver';
import { normalizeVisualRecipeSelection } from '../data/visual-recipe-selection';
import {
  getSelectedAssetIds,
  imagePromptSlots,
  SLOT_LABEL_KEYS,
  type ImagePromptAsset,
  type ImagePromptSelection,
  type ImagePromptSlot
} from '../data/image-prompt-core';
import {
  getPromptCaseCreateSettings,
  getPromptCasePrimaryVideoUrl,
  getOptimizedPromptCaseImageUrl,
  getPromptCaseResponsiveImageSet,
  isPromptCaseVideo
} from '@/utils/prompt-case';
import {
  IMAGE_GENERATION_4K_CREDIT_COST,
  IMAGE_GENERATION_BASE_CREDIT_COST,
  IMAGE_GENERATION_LARGE_2K_CREDIT_COST
} from '@/shared/image-generation-pricing';
import { getPromptCaseModelLabel } from '@/shared/prompt-case-model-labels';
import { imageFetchPriority } from '@/shared/ui';
import { Button } from '@/shared/ui/radix/button';
import { usePromptCaseFavorites } from '../lib/prompt-case-favorites';
import {
  getPromptCaseCardAspectRatio,
  getPromptCasePromptForLocale
} from './prompt-library/promptLibraryDisplay';
import { CreateWorkspaceFrame } from '../components/image-create/CreateWorkspaceFrame';
import { readPromptDetailBootstrap } from './prompt-detail/promptDetailBootstrap';

function getLocale(pathname: string): 'zh-CN' | 'en-US' {
  return pathname.startsWith('/en-US') ? 'en-US' : 'zh-CN';
}

function getLocalePrefix(locale: 'zh-CN' | 'en-US') {
  return locale === 'en-US' ? '/en-US' : '/zh-CN';
}

function getPromptImages(caseItem?: PromptCase | null): string[] {
  const urls = [
    ...(Array.isArray(caseItem?.imageUrls) ? caseItem.imageUrls : []),
    caseItem?.imageUrl || ''
  ]
    .map((url) => url.trim())
    .filter(Boolean);
  return Array.from(new Set(urls));
}

function getVisualRecipeSelectedCount(
  selection: ImagePromptSelection | null
): number {
  if (!selection) return 0;
  return imagePromptSlots.reduce(
    (sum, slot) => sum + getSelectedAssetIds(selection, slot.id).length,
    0
  );
}

function getPromptSeoTopicLinks(
  caseItem: PromptCase,
  locale: 'zh-CN' | 'en-US'
): Array<{ href: string; label: string }> {
  const localePrefix = getLocalePrefix(locale);
  const isEnglish = locale === 'en-US';
  const links = new Map<string, string>();
  const addLink = (href: string, label: string) => {
    links.set(href, label);
  };
  const model = (caseItem.model || '').toLowerCase();
  const category = (caseItem.category || '').toLowerCase();
  const tags = (caseItem.tags || []).map((tag) => tag.toLowerCase());
  const combined = [
    model,
    category,
    caseItem.packageSlug || '',
    caseItem.commercialIntent || '',
    caseItem.promptPreview || '',
    ...tags
  ].join(' ');

  addLink(
    isEnglish ? '/en-US/prompts' : `${localePrefix}/prompts`,
    isEnglish ? 'AI image prompts' : 'AI 图片 Prompt 案例'
  );

  if (combined.includes('gpt') || combined.includes('image 2')) {
    addLink(
      isEnglish
        ? '/gpt-image-2-prompts'
        : `${localePrefix}/prompts/model/gpt-image-2`,
      'GPT Image 2 prompts'
    );
  }

  if (combined.includes('nano') || combined.includes('banana')) {
    addLink(
      isEnglish
        ? '/nano-banana-prompts'
        : `${localePrefix}/prompts/model/nano-banana`,
      'Nano Banana prompts'
    );
  }

  if (combined.includes('flux')) {
    addLink(
      isEnglish ? '/flux-prompts' : `${localePrefix}/prompts/model/flux`,
      'Flux prompts'
    );
  }

  if (combined.includes('seedream')) {
    addLink(
      isEnglish
        ? '/seedream-prompts'
        : `${localePrefix}/prompts/model/seedream`,
      'Seedream prompts'
    );
  }

  if (combined.includes('mona')) {
    addLink(
      isEnglish
        ? '/mona-lisa-1-prompts'
        : `${localePrefix}/prompts/model/mona-lisa-1`,
      'mona-lisa-1 prompts'
    );
  }

  if (combined.includes('sref') || combined.includes('style reference')) {
    addLink(
      isEnglish
        ? '/sref-prompts'
        : `${localePrefix}/prompts/category/sref-prompts`,
      'SREF prompts'
    );
  }

  if (
    combined.includes('portrait') ||
    combined.includes('photo') ||
    combined.includes('写真') ||
    combined.includes('人像')
  ) {
    addLink(
      isEnglish
        ? '/portrait-prompts'
        : `${localePrefix}/prompts/category/ai-portrait`,
      isEnglish ? 'Portrait prompts' : 'AI 写真提示词'
    );
  }

  if (combined.includes('product') || combined.includes('商品')) {
    addLink(
      isEnglish
        ? '/product-photography-prompts'
        : `${localePrefix}/prompts/category/product-images`,
      isEnglish ? 'Product photography prompts' : 'AI 商品图 Prompt'
    );
  }

  if (combined.includes('character') || combined.includes('角色')) {
    addLink(
      isEnglish
        ? '/character-design-prompts'
        : `${localePrefix}/prompts/category/character-consistency`,
      isEnglish ? 'Character design prompts' : '角色一致性 Prompt'
    );
  }

  return Array.from(links, ([href, label]) => ({ href, label })).slice(0, 5);
}

export function PromptDetailPage() {
  const { slug = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation('imageCreate');
  const { getAccessToken, isAuthenticated, isLoading: authLoading } = useAuth();
  const locale = getLocale(location.pathname);
  const localePrefix = getLocalePrefix(locale);
  const bootstrapCase = useMemo(
    () => readPromptDetailBootstrap(document, slug, locale),
    [locale, slug]
  );
  const [caseItem, setCaseItem] = useState<PromptCase | null>(bootstrapCase);
  const [relatedCases, setRelatedCases] = useState<PromptCase[]>([]);
  const [publicRecipeAssets, setPublicRecipeAssets] = useState<
    ImagePromptAsset[]
  >(getLocalPublicImagePromptAssets);
  const [isLoading, setIsLoading] = useState(!bootstrapCase);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const { isFavorited, toggleFavorite } = usePromptCaseFavorites();

  const images = useMemo(() => getPromptImages(caseItem), [caseItem]);
  const videoUrl = getPromptCasePrimaryVideoUrl(caseItem);
  const hasVideo = Boolean(videoUrl) && isPromptCaseVideo(caseItem);
  const canonical = `https://webtomind.com${localePrefix}/prompts/${encodeURIComponent(
    slug
  )}`;
  const promptLibraryHref =
    locale === 'en-US' ? '/en-US/prompts' : `${localePrefix}/prompts`;
  const pricingHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set('source', 'prompt_case_unlock');
    params.set('returnTo', location.pathname);
    if (caseItem?.id) params.set('caseId', caseItem.id);
    if (caseItem?.packageSlug) params.set('packageSlug', caseItem.packageSlug);
    return `${localePrefix}/pricing?${params.toString()}`;
  }, [caseItem?.id, caseItem?.packageSlug, localePrefix, location.pathname]);
  const title =
    caseItem?.title ||
    t('promptDetail.fallbackTitle', { defaultValue: 'Visual prompt case' });
  const canViewPrompt =
    isAuthenticated &&
    Boolean(caseItem?.prompt?.trim()) &&
    caseItem?.promptLocked !== true;
  const isCaseMemberOnly = Boolean(caseItem?.memberOnly);
  const topicLinks = useMemo(
    () => (caseItem ? getPromptSeoTopicLinks(caseItem, locale) : []),
    [caseItem, locale]
  );
  const visualRecipeSelection = useMemo(() => {
    const configuredSelection = normalizeVisualRecipeSelection(
      (caseItem as (PromptCase & { visualRecipe?: unknown }) | null)
        ?.visualRecipe
    );
    const inferredSelection = inferVisualRecipeSelectionFromPromptText(
      buildPromptTextForVisualRecipe(caseItem)
    );
    return mergeVisualRecipeSelections(configuredSelection, inferredSelection);
  }, [caseItem]);
  const isCurrentCaseFavorited = isFavorited(caseItem?.id);
  const visualRecipeCards = useMemo<ResolvedVisualRecipeAsset[]>(
    () =>
      visualRecipeSelection
        ? resolveVisualRecipeAssets(visualRecipeSelection, publicRecipeAssets)
        : [],
    [publicRecipeAssets, visualRecipeSelection]
  );
  const visualRecipeSelectedCount = getVisualRecipeSelectedCount(
    visualRecipeSelection
  );
  const getSlotLabel = useCallback(
    (slot: ImagePromptSlot): string => {
      return t(SLOT_LABEL_KEYS[slot], {
        defaultValue:
          imagePromptSlots.find((item) => item.id === slot)?.label || slot
      });
    },
    [t]
  );
  const recordPromptConversion = useCallback(
    (
      eventName: ClientConversionEventPayload['eventName'],
      item: PromptCase,
      params: {
        ctaSource: string;
        idempotencyKey: string;
        metadata?: Record<string, unknown>;
      }
    ) => {
      const accessToken = getAccessToken();

      void recordClientConversionEvent(accessToken, {
        eventName,
        entityType: 'prompt_case',
        entityId: item.id,
        ctaSource: params.ctaSource,
        idempotencyKey: params.idempotencyKey,
        metadata: {
          slug: item.slug,
          locale,
          category: item.category || undefined,
          model: item.model || undefined,
          contentId: item.id,
          mediaType: item.mediaType === 'video' ? 'video' : 'image',
          cluster: [item.model, item.category].filter(Boolean).join(':') || 'detail',
          locked: !item.prompt?.trim() || item.promptLocked === true,
          member_only: Boolean(item.memberOnly),
          path: `${location.pathname}${location.search}${location.hash}`,
          canonicalPath: location.pathname,
          ...params.metadata
        }
      });
    },
    [getAccessToken, locale, location.hash, location.pathname, location.search]
  );

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setIsLoading(!bootstrapCase);
    setError('');
    getPublicPromptCase(slug, { by: 'slug', locale })
      .then((nextCase) => {
        if (cancelled) return;
        if (!nextCase) {
          if (!bootstrapCase) {
            setCaseItem(null);
            setError(t('promptDetail.notFound') as string);
          }
          return;
        }
        setCaseItem(nextCase);
        setIsLoading(false);
        void trackPromptCaseEvent(nextCase.id, 'view');
        trackPromptShareView({
          caseId: nextCase.id,
          slug: nextCase.slug,
          source: 'prompt_detail'
        });
        void getPublicPromptCases(8, {
          category: nextCase.category || undefined,
          locale
        })
          .then((items) => {
            if (!cancelled) {
              setRelatedCases(items.filter((item) => item.id !== nextCase.id));
            }
          })
          .catch(() => {
            // Related cases are supplementary and must not block the main case.
          });
      })
      .catch((loadError) => {
        if (!cancelled && !bootstrapCase) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : (t('promptDetail.loadFailed') as string)
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, bootstrapCase, isAuthenticated, locale, slug, t]);

  useEffect(() => {
    if (!visualRecipeSelection || visualRecipeSelectedCount === 0) return;
    let cancelled = false;
    loadPublicImagePromptAssetLibrary()
      .then((library) => {
        if (!cancelled) setPublicRecipeAssets(library.assets);
      })
      .catch(() => {
        // The resolver already falls back to the bundled library. Keep local assets.
      });
    return () => {
      cancelled = true;
    };
  }, [visualRecipeSelectedCount, visualRecipeSelection]);

  useEffect(() => {
    const description =
      caseItem?.title && caseItem?.category
        ? t('promptDetail.seoDescriptionWithTitle', {
            title: caseItem.title,
            defaultValue:
              '{{title}} is a reusable WebToMind visual prompt case.'
          })
        : (t('promptDetail.seoDescription') as string);
    return applySeo({
      title: `${title} | WebToMind Prompts`,
      description,
      canonical,
      robots: caseItem ? 'index,follow' : 'noindex,nofollow',
      htmlLang: locale === 'en-US' ? 'en' : 'zh-CN',
      ogLocale: locale === 'en-US' ? 'en_US' : 'zh_CN',
      alternates: [
        {
          hreflang: locale,
          href: canonical
        }
      ],
      ogImage: images[0] || 'https://webtomind.com/icons/logo-icon.svg',
      twitterSite: '@webtomind',
      jsonLd: caseItem
        ? {
            '@context': 'https://schema.org',
            '@type': 'CreativeWork',
            name: title,
            description,
            url: canonical,
            inLanguage: locale,
            keywords: caseItem.tags?.join(', '),
            image: images.map((imageUrl) => ({
              '@type': 'ImageObject',
              url: imageUrl
            }))
          }
        : undefined
    });
  }, [canonical, caseItem, images, locale, slug, t, title]);

  useEffect(() => {
    if (!caseItem) return;
    trackPromptCaseCta({
      action: 'view',
      caseId: caseItem.id,
      source: 'prompt_detail',
      authenticated: isAuthenticated,
      locked: !canViewPrompt,
      locale
    });
    recordPromptConversion('prompt_detail_view', caseItem, {
      ctaSource: 'prompt_detail',
      idempotencyKey: `prompt_detail_view:${caseItem.id}:${locale}`,
      metadata: {
        authenticated: isAuthenticated,
        can_view_prompt: canViewPrompt,
        referrer: document.referrer || undefined
      }
    });
  }, [
    canViewPrompt,
    caseItem,
    isAuthenticated,
    locale,
    recordPromptConversion
  ]);

  const handleUnlockPrompt = useCallback(() => {
    if (caseItem) {
      trackPromptCaseCta({
        action: 'click',
        caseId: caseItem.id,
        source: 'prompt_detail_unlock',
        authenticated: isAuthenticated,
        locked: true,
        locale
      });
      recordPromptConversion('prompt_detail_unlock_click', caseItem, {
        ctaSource: 'prompt_detail_unlock',
        idempotencyKey: `prompt_detail_unlock:${caseItem.id}:${Date.now()}`,
        metadata: {
          authenticated: isAuthenticated,
          target: isAuthenticated ? 'pricing' : 'login'
        }
      });
    }
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`);
      return;
    }
    trackPricingView('prompt_detail_unlock');
    navigate(pricingHref);
  }, [
    caseItem,
    isAuthenticated,
    locale,
    location.pathname,
    navigate,
    pricingHref,
    recordPromptConversion
  ]);

  const handleCopy = useCallback(async () => {
    if (!caseItem) return;
    if (!canViewPrompt) {
      handleUnlockPrompt();
      return;
    }
    try {
      await navigator.clipboard.writeText(
        getPromptCasePromptForLocale(caseItem, locale)
      );
      setCopied(true);
      void trackPromptCaseEvent(caseItem.id, 'copy');
      trackPromptCaseCta({
        action: 'click',
        caseId: caseItem.id,
        source: 'prompt_detail_copy',
        authenticated: isAuthenticated,
        locked: false,
        locale
      });
      trackPromptCopy({ caseId: caseItem.id, source: 'prompt_detail_copy' });
      recordPromptConversion('prompt_detail_copy', caseItem, {
        ctaSource: 'prompt_detail_copy',
        idempotencyKey: `prompt_detail_copy:${caseItem.id}:${Date.now()}`,
        metadata: {
          authenticated: isAuthenticated
        }
      });
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setError(t('errors.clipboardFailed') as string);
    }
  }, [
    canViewPrompt,
    caseItem,
    handleUnlockPrompt,
    isAuthenticated,
    locale,
    recordPromptConversion,
    t
  ]);

  const handleUsePrompt = useCallback(() => {
    if (!caseItem) return;
    void trackPromptCaseEvent(caseItem.id, 'generate');
    trackPromptCaseCta({
      action: 'click',
      caseId: caseItem.id,
      source: 'prompt_detail_use',
      authenticated: isAuthenticated,
      locked: !caseItem.prompt?.trim() || caseItem.promptLocked,
      locale
    });
    trackPromptGenerate({
      caseId: caseItem.id,
      source: 'prompt_detail_use',
      authenticated: isAuthenticated
    });
    recordPromptConversion('prompt_detail_use', caseItem, {
      ctaSource: 'prompt_detail_use',
      idempotencyKey: `prompt_detail_use:${caseItem.id}:${Date.now()}`,
      metadata: {
        authenticated: isAuthenticated,
        target: !isAuthenticated
          ? 'login'
          : !caseItem.prompt?.trim() || caseItem.promptLocked
            ? 'unlock'
            : 'create'
      }
    });
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`);
      return;
    }
    if (!caseItem.prompt?.trim() || caseItem.promptLocked) {
      handleUnlockPrompt();
      return;
    }
    const createMediaType = isPromptCaseVideo(caseItem) ? 'video' : 'image';
    navigate(
      `${localePrefix}/${createMediaType}?source=prompt_detail_use&caseId=${encodeURIComponent(
        caseItem.id
      )}`,
      {
        state: {
          remixSource: {
            id: caseItem.id,
            title,
            slug: caseItem.slug,
            source: 'prompt_detail_use'
          },
          promptCasePrompt: getPromptCasePromptForLocale(caseItem, locale),
          ...getPromptCaseCreateSettings(caseItem)
        }
      }
    );
  }, [
    caseItem,
    handleUnlockPrompt,
    isAuthenticated,
    locale,
    localePrefix,
    location.pathname,
    navigate,
    recordPromptConversion,
    title
  ]);

  const handleUseVisualRecipe = useCallback(
    (openAssetSlot?: ImagePromptSlot) => {
      if (!caseItem || !visualRecipeSelection) return;
      void trackPromptCaseEvent(caseItem.id, 'generate');
      trackPromptCaseCta({
        action: 'click',
        caseId: caseItem.id,
        source: openAssetSlot
          ? 'prompt_detail_recipe_replace'
          : 'prompt_detail_recipe_use',
        authenticated: isAuthenticated,
        locked: !canViewPrompt,
        locale
      });
      trackPromptGenerate({
        caseId: caseItem.id,
        source: openAssetSlot
          ? 'prompt_detail_recipe_replace'
          : 'prompt_detail_recipe_use',
        authenticated: isAuthenticated
      });
      recordPromptConversion('prompt_detail_use', caseItem, {
        ctaSource: openAssetSlot
          ? 'prompt_detail_recipe_replace'
          : 'prompt_detail_recipe_use',
        idempotencyKey: `prompt_detail_recipe:${caseItem.id}:${openAssetSlot || 'all'}:${Date.now()}`,
        metadata: {
          authenticated: isAuthenticated,
          visual_recipe: true,
          open_asset_slot: openAssetSlot
        }
      });

      navigate(
        `${localePrefix}/image?source=prompt_case_recipe&caseId=${encodeURIComponent(
          caseItem.id
        )}`,
        {
          state: {
            remixSource: {
              id: caseItem.id,
              title,
              slug: caseItem.slug,
              source: openAssetSlot
                ? 'prompt_detail_recipe_replace'
                : 'prompt_detail_recipe_use'
            },
            visualRecipeSelection,
            ...(openAssetSlot ? { openAssetSlot } : {}),
            promptCasePrompt: canViewPrompt
              ? getPromptCasePromptForLocale(caseItem, locale)
              : '',
            ...getPromptCaseCreateSettings(caseItem)
          }
        }
      );
    },
    [
      canViewPrompt,
      caseItem,
      isAuthenticated,
      locale,
      localePrefix,
      navigate,
      recordPromptConversion,
      title,
      visualRecipeSelection
    ]
  );

  return (
    <CreateWorkspaceFrame className="prompt-detail-route">
      <div className="prompt-detail-shell">
        {isLoading ? (
          <div className="prompt-detail-loading">
            {t('promptDetail.loading')}
          </div>
        ) : error || !caseItem ? (
          <section className="prompt-detail-empty">
            <h1>{t('promptDetail.emptyTitle')}</h1>
            <p>{error || t('promptDetail.notFound')}</p>
            <Link to={promptLibraryHref}>
              {t('promptDetail.backToLibrary')}
            </Link>
          </section>
        ) : (
          <>
            <nav
              className="prompt-detail-breadcrumb"
              aria-label={locale === 'zh-CN' ? '面包屑导航' : 'Breadcrumb'}
            >
              <Link to={promptLibraryHref}>
                {locale === 'zh-CN' ? 'Prompt 案例库' : 'Prompt library'}
              </Link>
              <span aria-hidden="true">/</span>
              <span>{title}</span>
            </nav>
            <section className="prompt-detail-hero">
              <div
                className={`prompt-detail-gallery ${
                  images.length <= 1 ? 'prompt-detail-gallery-single' : ''
                }`}
              >
                {hasVideo ? (
                  <figure
                    style={
                      {
                        aspectRatio: getPromptCaseCardAspectRatio(caseItem, 0)
                      } as CSSProperties
                    }
                  >
                    <video
                      src={videoUrl}
                      poster={images[0] || undefined}
                      autoPlay
                      muted
                      loop
                      playsInline
                      controls
                      preload="auto"
                      aria-label={title}
                    />
                  </figure>
                ) : (
                  images.map((imageUrl, index) => (
                    <figure
                      key={imageUrl}
                      style={
                        {
                          aspectRatio: getPromptCaseCardAspectRatio(
                            caseItem,
                            index
                          )
                        } as CSSProperties
                      }
                    >
                      <img
                        src={getOptimizedPromptCaseImageUrl(imageUrl, {
                          width: 960,
                          quality: 78
                        })}
                        srcSet={getPromptCaseResponsiveImageSet(
                          imageUrl,
                          [640, 960, 1280]
                        )}
                        sizes="(max-width: 900px) 100vw, 56vw"
                        alt=""
                        loading={index === 0 ? 'eager' : 'lazy'}
                        decoding="async"
                        {...imageFetchPriority(index === 0 ? 'high' : 'auto')}
                        onError={(event) => {
                          event.currentTarget.removeAttribute('srcset');
                          event.currentTarget.src = imageUrl;
                        }}
                      />
                    </figure>
                  ))
                )}
              </div>
              <aside className="prompt-detail-panel">
                <div className="prompt-detail-kicker">
                  <span>{caseItem.category || 'featured'}</span>
                  <span>
                    {getPromptCaseModelLabel(caseItem.model) || 'gemini-image'}
                  </span>
                  {caseItem.packageSlug && <span>{caseItem.packageSlug}</span>}
                </div>
                <h1>{title}</h1>
                {caseItem.commercialIntent && (
                  <p className="prompt-detail-commercial-intent">
                    {caseItem.commercialIntent}
                  </p>
                )}
                {caseItem.tags && caseItem.tags.length > 0 && (
                  <div className="prompt-detail-tags">
                    {caseItem.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                )}
                <dl className="prompt-detail-cost">
                  <div>
                    <dt>{t('promptDetail.baseCost')}</dt>
                    <dd>{IMAGE_GENERATION_BASE_CREDIT_COST}</dd>
                  </div>
                  <div>
                    <dt>{t('promptDetail.large2kCost')}</dt>
                    <dd>{IMAGE_GENERATION_LARGE_2K_CREDIT_COST}</dd>
                  </div>
                  <div>
                    <dt>{t('promptDetail.fourKCost')}</dt>
                    <dd>{IMAGE_GENERATION_4K_CREDIT_COST}</dd>
                  </div>
                </dl>
                <div className="prompt-detail-actions">
                  <Button type="button" onClick={handleUsePrompt}>
                    <Wand2 data-icon="inline-start" />
                    {t('promptDetail.usePrompt')}
                  </Button>
                  {isCaseMemberOnly && (
                    <Link
                      to={pricingHref}
                      onClick={() => trackPricingView('prompt_detail_cta')}
                    >
                      {t('promptDetail.viewPricing', {
                        defaultValue: '查看升级套餐'
                      })}
                    </Link>
                  )}
                  {canViewPrompt ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCopy}
                    >
                      {copied ? (
                        <Check data-icon="inline-start" />
                      ) : (
                        <Copy data-icon="inline-start" />
                      )}
                      {copied ? t('preview.copied') : t('preview.copyPrompt')}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleUnlockPrompt}
                    >
                      <Lock data-icon="inline-start" />
                      {isAuthenticated && isCaseMemberOnly
                        ? t('promptDetail.upgradeToUnlockPrompt')
                        : t('promptDetail.loginToViewPrompt')}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    className={
                      isCurrentCaseFavorited
                        ? 'prompt-detail-favorite active'
                        : 'prompt-detail-favorite'
                    }
                    onClick={() => toggleFavorite(caseItem.id)}
                    aria-pressed={isCurrentCaseFavorited}
                  >
                    <Star
                      data-icon="inline-start"
                      fill={isCurrentCaseFavorited ? 'currentColor' : 'none'}
                    />
                    {locale === 'zh-CN'
                      ? isCurrentCaseFavorited
                        ? '已收藏'
                        : '收藏案例'
                      : isCurrentCaseFavorited
                        ? 'Saved'
                        : 'Save'}
                  </Button>
                </div>
                <p className="prompt-detail-free-hint">
                  {t('promptDetail.freeFirstImageHint', {
                  defaultValue: '免费用户每天可免费生成 1 张，无需付费先体验'
                })}
                </p>
                {caseItem.authorUrl && (
                  <a
                    href={caseItem.authorUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="prompt-detail-author"
                  >
                    <ExternalLink size={14} />
                    {t('promptCases.authorLink')}
                  </a>
                )}
              </aside>
            </section>
            {visualRecipeCards.length > 0 && (
              <section
                className="prompt-detail-recipe"
                aria-label={
                  locale === 'zh-CN'
                    ? '这张图的可视化配方'
                    : 'Visual recipe for this image'
                }
              >
                <div className="prompt-detail-recipe-head">
                  <div>
                    <span>
                      {locale === 'zh-CN' ? '可视化配方' : 'Visual recipe'}
                    </span>
                    <h2>
                      {locale === 'zh-CN'
                        ? '这张图的可视化配方'
                        : 'Reusable visual recipe'}
                    </h2>
                    <p>
                      {locale === 'zh-CN'
                        ? '这些素材卡对应案例里的角色、姿态、场景与风格组合，可以直接带入图像创作台继续调整。'
                        : 'These matched assets recreate the case structure and can be opened directly in the image studio.'}
                    </p>
                  </div>
                  <Button type="button" onClick={() => handleUseVisualRecipe()}>
                    <Wand2 data-icon="inline-start" />
                    {locale === 'zh-CN'
                      ? '用这套组合生成'
                      : 'Generate with this set'}
                  </Button>
                </div>
                <div className="prompt-detail-recipe-grid">
                  {visualRecipeCards.map(({ slot, asset }) => (
                    <article
                      key={`${slot}:${asset.id}`}
                      className="prompt-detail-recipe-card"
                    >
                      <AssetThumb asset={asset} />
                      <div>
                        <small>{getSlotLabel(slot)}</small>
                        <strong>{asset.title}</strong>
                        {asset.subtitle && <p>{asset.subtitle}</p>}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleUseVisualRecipe(slot)}
                      >
                        <RefreshCw data-icon="inline-start" />
                        {locale === 'zh-CN' ? '替换' : 'Replace'}
                      </Button>
                    </article>
                  ))}
                </div>
              </section>
            )}
            <section
              className={`prompt-detail-prompt ${
                canViewPrompt ? '' : 'prompt-detail-prompt-locked'
              }`}
            >
              {canViewPrompt ? (
                <>
                  <div>
                    <span>{t('preview.promptLabel')}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleCopy}
                    >
                      {copied ? (
                        <Check data-icon="inline-start" />
                      ) : (
                        <Copy data-icon="inline-start" />
                      )}
                      {copied ? t('preview.copied') : t('preview.copyPrompt')}
                    </Button>
                  </div>
                  <div className="prompt-detail-prompt-stack">
                    <section>
                      <small>
                        {locale === 'zh-CN' ? '中文 Prompt' : 'Chinese prompt'}
                      </small>
                      <pre>
                        {getPromptCasePromptForLocale(caseItem, 'zh-CN')}
                      </pre>
                    </section>
                    <section>
                      <small>
                        {locale === 'zh-CN' ? '英文 Prompt' : 'English prompt'}
                      </small>
                      <pre>
                        {getPromptCasePromptForLocale(caseItem, 'en-US') ||
                          (locale === 'zh-CN'
                            ? '英文 Prompt 暂未翻译'
                            : 'English prompt is not translated yet.')}
                      </pre>
                    </section>
                  </div>
                </>
              ) : (
                <div className="prompt-detail-lock-card">
                  {caseItem.promptPreview && (
                    <div className="prompt-detail-preview-teaser">
                      <small>{t('promptCases.promptPreview')}</small>
                      <p>{caseItem.promptPreview}</p>
                    </div>
                  )}
                  <span>
                    <Lock size={18} />
                    {t('preview.promptLabel')}
                  </span>
                  <strong>
                    {t(
                      isCaseMemberOnly
                        ? 'promptDetail.promptLockedTitle'
                        : 'promptDetail.loginLockedTitle'
                    )}
                  </strong>
                  <p>
                    {t(
                      isCaseMemberOnly
                        ? 'promptDetail.promptLockedDesc'
                        : 'promptDetail.loginLockedDesc'
                    )}
                  </p>
                  {isCaseMemberOnly && (
                    <ul className="prompt-unlock-benefits">
                      {[
                        t('promptDetail.unlockBenefitPrompt'),
                        t('promptDetail.unlockBenefitRecreate'),
                        t('promptDetail.unlockBenefitPrivate'),
                        t('promptDetail.unlockBenefitCredits')
                      ].map((benefit) => (
                        <li key={benefit}>
                          <Check size={13} />
                          <span>{benefit}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button type="button" size="sm" onClick={handleUnlockPrompt}>
                    {isAuthenticated && isCaseMemberOnly
                      ? t('promptDetail.upgradeToUnlockPrompt')
                      : t('promptDetail.loginToViewPrompt')}
                  </Button>
                </div>
              )}
            </section>
            {topicLinks.length > 0 && (
              <section className="prompt-detail-topic-links">
                <h2>
                  {locale === 'zh-CN'
                    ? '继续浏览相关 Prompt 专题'
                    : 'Explore related prompt guides'}
                </h2>
                <div>
                  {topicLinks.map((item) => (
                    <Link key={item.href} to={item.href}>
                      {item.label}
                    </Link>
                  ))}
                </div>
              </section>
            )}
            {relatedCases.length > 0 && (
              <section className="prompt-detail-related">
                <h2>{t('promptDetail.related')}</h2>
                <div>
                  {relatedCases.slice(0, 4).map((item) => (
                    <Link
                      key={item.id}
                      to={
                        item.slug
                          ? `${localePrefix}/prompts/${item.slug}`
                          : `${localePrefix}/create/prompts/share/${item.id}`
                      }
                    >
                      <img
                        src={getPromptImages(item)[0]}
                        alt=""
                        loading="lazy"
                      />
                      <span>{item.title || item.category}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </CreateWorkspaceFrame>
  );
}

export default PromptDetailPage;
