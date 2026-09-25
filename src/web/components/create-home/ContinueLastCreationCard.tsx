import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Clock3, Image as ImageIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  getVisualImageHistoryResult,
  type VisualImageHistoryItem
} from '@/services/agent-api';
import { Button, imageFetchPriority } from '@/shared/ui';
import {
  defaultImagePromptSelection,
  imagePromptAssets,
  setImagePromptAssetSelection,
  type ImagePromptSelection
} from '../../data/image-prompt-core';
import { useImagePromptAssetCatalog } from '../../hooks/useImagePromptAssetCatalog';
import { trackEvent } from '../../lib/analytics';
import './ContinueLastCreationCard.css';

type LocalePrefix = '' | '/zh-CN' | '/en-US';

export interface ContinueLastCreationCardProps {
  localePrefix: LocalePrefix;
  isEnglish: boolean;
}

export function buildContinueCreationState(
  item: VisualImageHistoryItem,
  assets = imagePromptAssets
) {
  const assetById = new Map(
    assets.map((asset) => [asset.id, asset])
  );
  const visualRecipeSelection = (item.assetIds || []).reduce(
    (selection, assetId) => {
      const asset = assetById.get(assetId);
      return asset ? setImagePromptAssetSelection(selection, asset) : selection;
    },
    defaultImagePromptSelection as ImagePromptSelection
  );
  const hasVisualRecipe = (item.assetIds || []).some((assetId) =>
    assetById.has(assetId)
  );

  return {
    promptCasePrompt: item.prompt,
    model: item.model,
    aspectRatio: item.aspectRatio,
    imageSize: item.imageSize || item.requestedImageSize,
    quality: item.quality,
    outputFormat: item.outputFormat,
    referenceImageIds: item.referenceImageIds || [],
    characterCardIds: item.characterCardIds || [],
    characterReferenceGroups: item.characterReferenceGroups || [],
    ...(hasVisualRecipe ? { visualRecipeSelection } : {}),
    remixSource: {
      id: item.id,
      title: item.prompt.slice(0, 80),
      source: 'create_home_continue_last'
    }
  };
}

function formatCreatedAt(createdAt: string, isEnglish: boolean): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(isEnglish ? 'en-US' : 'zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function ContinueLastCreationCard({
  localePrefix,
  isEnglish
}: ContinueLastCreationCardProps) {
  const navigate = useNavigate();
  const [latestItem, setLatestItem] = useState<VisualImageHistoryItem | null>(
    null
  );
  const promptAssetCatalog = useImagePromptAssetCatalog(
    Boolean(latestItem?.assetIds?.length)
  );
  const [loading, setLoading] = useState(true);
  const requestIdRef = useRef(0);
  const trackedViewGenerationIdRef = useRef<string | null>(null);

  const loadLatest = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    try {
      const result = await getVisualImageHistoryResult(1);
      if (requestIdRef.current !== requestId) return;
      setLatestItem(result.items[0] || null);
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      console.warn('[CreateHome] recent generation unavailable:', error);
      setLatestItem(null);
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLatest();

    const handleHistoryChange = () => void loadLatest();
    window.addEventListener(
      'visual-generation-history-changed',
      handleHistoryChange
    );
    return () => {
      requestIdRef.current += 1;
      window.removeEventListener(
        'visual-generation-history-changed',
        handleHistoryChange
      );
    };
  }, [loadLatest]);

  useEffect(() => {
    if (
      !latestItem ||
      trackedViewGenerationIdRef.current === latestItem.id
    ) {
      return;
    }
    trackedViewGenerationIdRef.current = latestItem.id;
    trackEvent('continue_last_creation_view', {
      generation_id: latestItem.id,
      prompt_model: latestItem.model,
      cta_source: 'create_home_continue_last',
      authenticated: true
    });
  }, [latestItem]);

  if (loading || !latestItem) return null;

  const imageUrl =
    latestItem.thumbnailUrl || latestItem.previewUrl || latestItem.imageUrl;
  const createdAt = formatCreatedAt(latestItem.createdAt, isEnglish);
  const modelLabel = latestItem.modelLabel || latestItem.model;

  const continueCreation = () => {
    trackEvent('continue_last_creation_click', {
      generation_id: latestItem.id,
      prompt_model: latestItem.model,
      cta_source: 'create_home_continue_last',
      authenticated: true
    });
    navigate(`${localePrefix}/image?source=create_home_continue_last`, {
      state: buildContinueCreationState(latestItem, promptAssetCatalog)
    });
  };

  return (
    <section
      className="create-home-continue-card"
      aria-labelledby="create-home-continue-title"
    >
      <div className="create-home-continue-media" aria-hidden="true">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            width={240}
            height={160}
            loading="eager"
            decoding="async"
            {...imageFetchPriority('high')}
          />
        ) : (
          <ImageIcon />
        )}
      </div>
      <div className="create-home-continue-copy">
        <span className="create-eyebrow">
          {isEnglish ? 'Your latest workflow' : '最近创作'}
        </span>
        <h2 id="create-home-continue-title">
          {isEnglish ? 'Continue your last creation' : '继续上次创作'}
        </h2>
        <p>{latestItem.prompt}</p>
        <div className="create-home-continue-meta">
          <span>{modelLabel}</span>
          {latestItem.aspectRatio && <span>{latestItem.aspectRatio}</span>}
          {createdAt && (
            <span>
              <Clock3 aria-hidden="true" />
              {createdAt}
            </span>
          )}
        </div>
      </div>
      <Button
        type="button"
        className="create-home-continue-action"
        trailingIcon={<ArrowRight />}
        onClick={continueCreation}
      >
        {isEnglish ? 'Continue editing' : '继续编辑'}
      </Button>
    </section>
  );
}
