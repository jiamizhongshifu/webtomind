import { sanitizeStringList, sanitizeText } from './shared.js';

type SourceMoodboard = Record<string, unknown>;

export interface MoodboardCopyItemInsert {
  moodboard_id: string;
  source: 'preset';
  image_url: string;
  title: string | null;
  prompt: string | null;
  sort_order: number;
  is_representative: boolean;
  metadata: Record<string, unknown>;
}

export function buildMoodboardCopyFields(source: SourceMoodboard) {
  const analysisVersion =
    typeof source.analysis_version === 'number' &&
    Number.isInteger(source.analysis_version)
      ? Math.max(0, source.analysis_version)
      : 0;
  const tasteProfile = sanitizeText(source.taste_profile, 2000);
  const analysisReady =
    source.analysis_status === 'ready' && analysisVersion > 0 && tasteProfile;

  return {
    analysis_status: analysisReady ? 'ready' : 'idle',
    taste_profile: analysisReady ? tasteProfile : '',
    keywords: analysisReady
      ? sanitizeStringList(source.keywords, 16).map((item) =>
          item.slice(0, 120)
        )
      : [],
    avoids: analysisReady
      ? sanitizeStringList(source.avoids, 16).map((item) => item.slice(0, 160))
      : [],
    // Guidelines are personal instructions. A preset contributes its visual
    // analysis, but never writes into the user's editable guidance field.
    guidelines: [],
    representative_asset_ids: [],
    analysis_version: analysisReady ? analysisVersion : 0
  };
}

export function buildClientPresetCopyFields(value: unknown) {
  const source =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null;
  const presetKey = sanitizeText(source?.presetKey, 120);
  const tasteProfile = sanitizeText(source?.tasteProfile, 2000);
  const keywords = sanitizeStringList(source?.keywords, 16).map((item) =>
    item.slice(0, 120)
  );
  if (!presetKey || !tasteProfile || keywords.length === 0) return null;
  return {
    presetKey,
    analysis: {
      analysis_status: 'ready',
      taste_profile: tasteProfile,
      keywords,
      avoids: sanitizeStringList(source?.avoids, 16).map((item) =>
        item.slice(0, 160)
      ),
      guidelines: [],
      representative_asset_ids: [],
      analysis_version: 1
    },
    items: Array.isArray(source?.items)
      ? source.items
          .filter((item): item is Record<string, unknown> =>
            Boolean(item && typeof item === 'object')
          )
          .slice(0, 24)
          .map((item) => ({
            imageUrl: sanitizeText(item.imageUrl, 4096),
            title: sanitizeText(item.title, 180),
            prompt: sanitizeText(item.prompt, 6000)
          }))
          .filter((item) => Boolean(item.imageUrl))
      : []
  };
}

export function buildClientPresetCopyItems(
  targetMoodboardId: string,
  presetKey: string,
  items: Array<{ imageUrl: string; title: string; prompt: string }>
): MoodboardCopyItemInsert[] {
  return items.map((item, index) => ({
    moodboard_id: targetMoodboardId,
    source: 'preset',
    image_url: item.imageUrl,
    title: item.title || null,
    prompt: item.prompt || null,
    sort_order: index,
    is_representative: index < 4,
    metadata: { copiedFromPresetKey: presetKey }
  }));
}

export function buildMoodboardCopyItems(
  sourceMoodboardId: string,
  targetMoodboardId: string,
  sourceItems: SourceMoodboard[]
): MoodboardCopyItemInsert[] {
  return sourceItems.slice(0, 24).map((item, index) => ({
    moodboard_id: targetMoodboardId,
    source: 'preset',
    image_url: sanitizeText(item.image_url, 4096),
    title: sanitizeText(item.title, 180) || null,
    prompt: sanitizeText(item.prompt, 6000) || null,
    sort_order: index,
    is_representative: index < 4,
    metadata: {
      copiedFromMoodboardId: sourceMoodboardId,
      copiedFromItemId: sanitizeText(item.id, 80)
    }
  }));
}
