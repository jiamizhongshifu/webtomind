import { detectPromptImageCount } from '@/shared/image-prompt-count';
import type { PromptCase } from '@/services/agent-api';
import { getPromptCaseCreateSettings } from '@/utils/prompt-case';
import type {
  ImagePromptSelection,
  ImagePromptSettings,
  ImagePromptSlot
} from '../data/image-prompt-core';
import { getAspectRatioForImageSize } from '../data/image-creator-options';
import { normalizeVisualRecipeSelection } from '../data/visual-recipe-selection';

export interface ImageCreateRemixSource {
  id?: string;
  title?: string;
  slug?: string;
  source?: string;
}

export interface PromptCaseRouteImportPayload {
  prompt: string;
  promptSource?: 'full' | 'preview';
  model?: string;
  imageSize?: string;
  aspectRatio?: string;
  quality?: string;
  outputFormat?: string;
  visualRecipeSelection?: ImagePromptSelection;
  openAssetSlot?: ImagePromptSlot;
  remixSource?: ImageCreateRemixSource;
}

function getPromptCaseRoutePrompt(
  caseItem: PromptCase,
  locale: 'zh-CN' | 'en-US'
): { prompt: string; source: 'full' | 'preview' } {
  const pick = (
    candidates: Array<{ value: string | undefined; source: 'full' | 'preview' }>
  ) => {
    for (const candidate of candidates) {
      const value = candidate.value?.trim();
      if (value) {
        return { prompt: value, source: candidate.source };
      }
    }
    return { prompt: '', source: 'full' as const };
  };

  if (locale === 'en-US') {
    return pick([
      { value: caseItem.promptEn, source: 'full' },
      { value: caseItem.prompt, source: 'full' },
      { value: caseItem.promptPreviewEn, source: 'preview' },
      { value: caseItem.promptPreview, source: 'preview' }
    ]);
  }
  return pick([
    { value: caseItem.promptZh, source: 'full' },
    { value: caseItem.prompt, source: 'full' },
    { value: caseItem.promptPreviewZh, source: 'preview' },
    { value: caseItem.promptPreview, source: 'preview' }
  ]);
}

export function buildPromptCaseRouteImportPayload(
  caseItem: PromptCase,
  locale: 'zh-CN' | 'en-US',
  source: string
): PromptCaseRouteImportPayload | null {
  const promptResult = getPromptCaseRoutePrompt(caseItem, locale);
  const visualRecipeSelection = normalizeVisualRecipeSelection(
    (caseItem as PromptCase & { visualRecipe?: unknown }).visualRecipe
  );
  const prompt = promptResult.prompt;
  if (!prompt && !visualRecipeSelection) return null;

  return {
    prompt,
    promptSource: promptResult.source,
    ...(visualRecipeSelection ? { visualRecipeSelection } : {}),
    remixSource: {
      id: caseItem.id,
      title: caseItem.title,
      slug: caseItem.slug,
      source
    },
    ...getPromptCaseCreateSettings(caseItem)
  };
}

export type PromptCaseRouteLookupMode = 'id' | 'slug';

export interface PromptCaseRouteImportLookupOptions {
  by: PromptCaseRouteLookupMode;
  locale?: string;
}

export interface ResolvePromptCaseRouteImportParams {
  lookup: string;
  lookupMode: PromptCaseRouteLookupMode;
  locale: 'zh-CN' | 'en-US';
  source: string;
  getCase: (
    lookup: string,
    options: PromptCaseRouteImportLookupOptions
  ) => Promise<PromptCase | null>;
}

export type ResolvePromptCaseRouteImportResult =
  | { status: 'ready'; payload: PromptCaseRouteImportPayload }
  | { status: 'not_found' | 'empty' };

export async function resolvePromptCaseRouteImport({
  lookup,
  lookupMode,
  locale,
  source,
  getCase
}: ResolvePromptCaseRouteImportParams): Promise<ResolvePromptCaseRouteImportResult> {
  const trimmedLookup = lookup.trim();
  if (!trimmedLookup) return { status: 'not_found' };

  const localeCase = await getCase(trimmedLookup, {
    by: lookupMode,
    locale
  });
  const caseItem =
    localeCase ||
    (await getCase(trimmedLookup, {
      by: lookupMode
    }));
  if (!caseItem) return { status: 'not_found' };

  const payload = buildPromptCaseRouteImportPayload(caseItem, locale, source);
  if (!payload) return { status: 'empty' };
  return { status: 'ready', payload };
}

export function derivePromptCaseRouteImport(
  currentSettings: ImagePromptSettings,
  payload: PromptCaseRouteImportPayload
) {
  const imageCount = detectPromptImageCount(payload.prompt);
  const imageSize = payload.imageSize || currentSettings.imageSize;

  return {
    prompt: payload.prompt,
    settings: {
      ...currentSettings,
      model: payload.model || currentSettings.model,
      imageSize,
      quality: payload.quality || currentSettings.quality,
      outputFormat: payload.outputFormat || currentSettings.outputFormat,
      aspectRatio:
        payload.aspectRatio ||
        (payload.imageSize
          ? getAspectRatioForImageSize(payload.imageSize)
          : currentSettings.aspectRatio),
      imageCount
    },
    visualRecipeSelection: payload.visualRecipeSelection,
    openAssetSlot: payload.openAssetSlot,
    remixSource: payload.remixSource || null
  };
}

export type ImageGenerateGateDecision =
  | 'login_required'
  | 'membership_required'
  | 'insufficient_credits'
  | 'ready';

export function getImageGenerateGateDecision(params: {
  hasApiAuth: boolean;
  imageCount: number;
  isMember: boolean;
  insufficientCredits: boolean;
}): ImageGenerateGateDecision {
  if (!params.hasApiAuth) return 'login_required';
  if (params.imageCount >= 4 && !params.isMember) {
    return 'membership_required';
  }
  if (params.insufficientCredits) return 'insufficient_credits';
  return 'ready';
}
