import { useEffect, useState } from 'react';
import {
  getPublicPromptCase,
  getPublicPromptCases,
  type PromptCase
} from '@/services/agent-api';
import {
  defaultImagePromptSelection,
  type ImagePromptSelection
} from '@/web/data/image-prompt-core';
import { normalizeVisualRecipeSelection } from '@/web/data/visual-recipe-selection';

export interface ImageStudioStarterCase {
  id: string;
  sourceCaseId: string;
  title: string;
  subtitle: string;
  prompt: string;
  selection: ImagePromptSelection;
  imageUrls: string[];
}

export type ImageStudioStarterConditioningMode =
  | 'none'
  | 'moodboard'
  | 'recipe';

export function buildImageStudioStarterCaseCommit(
  caseItem: ImageStudioStarterCase,
  currentConditioningMode: ImageStudioStarterConditioningMode
) {
  return {
    prompt: caseItem.prompt,
    selection: defaultImagePromptSelection,
    conditioningMode:
      currentConditioningMode === 'recipe'
        ? ('none' as const)
        : currentConditioningMode
  };
}

const STARTER_CASE_LIMIT = 4;

function firstText(candidates: Array<string | undefined>) {
  return candidates.find((candidate) => candidate?.trim())?.trim() || '';
}

export function sampleImageStudioStarterCases<T>(
  items: readonly T[],
  limit = STARTER_CASE_LIMIT,
  random = Math.random
): T[] {
  const sampleSize = Math.min(Math.max(0, Math.floor(limit)), items.length);
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomValue = Math.min(Math.max(random(), 0), 1 - Number.EPSILON);
    const swapIndex = Math.floor(randomValue * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index]
    ];
  }

  return shuffled.slice(0, sampleSize);
}

export function mapPromptCaseToImageStudioStarterCase(
  caseItem: PromptCase,
  locale: 'zh-CN' | 'en-US',
  index: number
): ImageStudioStarterCase | null {
  if (caseItem.mediaType === 'video') return null;

  const imageUrls = Array.from(
    new Set([...(caseItem.imageUrls || []), caseItem.imageUrl].filter(Boolean))
  );
  const prompt =
    locale === 'en-US'
      ? firstText([caseItem.promptEn, caseItem.prompt])
      : firstText([caseItem.promptZh, caseItem.prompt]);
  if (imageUrls.length === 0 || !prompt) return null;

  const title =
    locale === 'en-US'
      ? firstText([caseItem.titleEn, caseItem.title]) ||
        `Featured case ${index + 1}`
      : firstText([caseItem.titleZh, caseItem.title]) ||
        `精选案例 ${index + 1}`;
  const subtitle = [caseItem.category, caseItem.model]
    .filter(Boolean)
    .join(' · ');

  return {
    id: `prompt-case-${caseItem.id}`,
    sourceCaseId: caseItem.id,
    title,
    subtitle: subtitle || (locale === 'en-US' ? 'Reusable case' : '可复用案例'),
    prompt,
    selection:
      normalizeVisualRecipeSelection(caseItem.visualRecipe) ||
      defaultImagePromptSelection,
    imageUrls
  };
}

export function useImageStudioStarterCases({
  enabled,
  locale,
  refreshKey
}: {
  enabled: boolean;
  locale: 'zh-CN' | 'en-US';
  refreshKey?: string;
}) {
  const [cases, setCases] = useState<ImageStudioStarterCase[]>([]);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setCases([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    getPublicPromptCases(24, {
      locale,
      requireImage: true
    })
      .then(async (items) => {
        const sampledItems = sampleImageStudioStarterCases(
          items.filter((item) => !item.memberOnly)
        );
        const detailedItems = await Promise.all(
          sampledItems.map((item) =>
            getPublicPromptCase(item.id, {
              locale,
              includePrompt: true
            }).catch(() => null)
          )
        );
        if (cancelled) return;
        setCases(
          detailedItems
            .map((item, index) =>
              item
                ? mapPromptCaseToImageStudioStarterCase(item, locale, index)
                : null
            )
            .filter((item): item is ImageStudioStarterCase => Boolean(item))
        );
      })
      .catch(() => {
        if (!cancelled) setCases([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, locale, refreshKey]);

  return { cases, loading };
}
