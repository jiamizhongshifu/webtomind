import { getCorsHeadersForRequest } from '../../utils/auth';
import {
  executeImageGenerationJob,
  sanitizeImageGenerateInput
} from '../../image/generate';
import {
  assertPromptCaseAdmin,
  getMissingPromptDraftsResponse,
  getSupabaseAdmin,
  isMissingPromptCaseDraftsTable,
  jsonResponse,
  mapPromptCaseDraftWithFreshImages
} from './_shared';

type ImageGenerationPayload = NonNullable<
  Awaited<ReturnType<typeof executeImageGenerationJob>>['payload']
>;

export const config = {
  // Keep this route on legacy Node while executeImageGenerationJob depends on
  // api/image/generate.ts. That shared path still uses sharp/Buffer for storage
  // derivatives and synchronous provider execution; a Worker-safe admin draft
  // route should call an async image task/queue boundary instead.
  runtime: 'nodejs',
  maxDuration: 300
};

function clampImageCount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 2;
  return Math.max(1, Math.min(4, Math.floor(parsed)));
}

function getGenerationSetting(
  settings: unknown,
  key: string,
  fallback: string
): string {
  if (!settings || typeof settings !== 'object') return fallback;
  const value = (settings as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
  }

  const admin = await assertPromptCaseAdmin(request);
  if (!admin.ok) {
    return jsonResponse(
      { error: admin.error || 'Prompt case admin access required' },
      corsHeaders,
      admin.status
    );
  }
  if (!admin.userId) {
    return jsonResponse(
      { error: 'Admin user is not available' },
      corsHeaders,
      401
    );
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    return jsonResponse(
      { error: 'Supabase admin is not configured' },
      corsHeaders,
      500
    );
  }

  const input = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const draftIds = Array.isArray(input.draftIds)
    ? input.draftIds
        .map((id) => (typeof id === 'string' ? id.trim() : ''))
        .filter(Boolean)
        .slice(0, 20)
    : [];

  if (draftIds.length === 0) {
    return jsonResponse({ error: 'draftIds is required' }, corsHeaders, 400);
  }

  const { data: drafts, error: draftError } = await sb
    .from('prompt_case_drafts')
    .select('*')
    .in('id', draftIds);

  if (draftError) {
    if (isMissingPromptCaseDraftsTable(draftError)) {
      return getMissingPromptDraftsResponse(corsHeaders);
    }
    console.error(
      '[AdminPromptCaseDrafts] load for images failed:',
      draftError
    );
    return jsonResponse(
      { error: 'Failed to load prompt case drafts' },
      corsHeaders,
      500
    );
  }

  const updatedDrafts: unknown[] = [];
  const failures: Array<{ draftId: string; error: string }> = [];

  for (const draft of drafts || []) {
    const draftId = String(draft.id || '');
    const generationSettings = draft.generation_settings;
    const imageCount = clampImageCount(
      input.imageCount ||
        (generationSettings &&
        typeof generationSettings === 'object' &&
        'imageCount' in generationSettings
          ? (generationSettings as Record<string, unknown>).imageCount
          : 2)
    );
    const sanitized = sanitizeImageGenerateInput({
      prompt: typeof draft.prompt === 'string' ? draft.prompt : '',
      negativePrompt:
        typeof draft.negative_prompt === 'string'
          ? draft.negative_prompt
          : undefined,
      model: 'gpt-image-2',
      imageSize: getGenerationSetting(
        generationSettings,
        'imageSize',
        '1024x1536'
      ),
      quality: getGenerationSetting(generationSettings, 'quality', 'auto'),
      outputFormat: 'png',
      imageCount,
      promptMode: 'custom'
    });

    if (!sanitized.ok) {
      failures.push({
        draftId,
        error:
          typeof sanitized.body.error === 'string'
            ? sanitized.body.error
            : 'Invalid image generation input'
      });
      continue;
    }

    const result = await executeImageGenerationJob({
      request,
      userId: admin.userId,
      sanitizedInput: sanitized.value,
      sb,
      options: {
        mode: 'sync',
        skipCreditCharge: true,
        creditWaiverReason: 'admin_prompt_case_draft_generation'
      }
    });
    const generationError =
      !result.ok || !result.payload
        ? result.failureReason ||
          (typeof result.body?.error === 'string'
            ? result.body.error
            : 'Image generation failed')
        : '';
    const generatedImages: ImageGenerationPayload['images'] =
      result.ok && result.payload
        ? result.payload.images.slice(0, imageCount)
        : [];

    if (generatedImages.length === 0) {
      failures.push({
        draftId,
        error: generationError || 'Image generation failed'
      });
      continue;
    }

    const nextImageUrls = Array.from(
      new Set([
        ...((Array.isArray(draft.image_urls)
          ? draft.image_urls
          : []) as string[]),
        ...generatedImages
          .map((image) => image.imageUrl || image.previewUrl)
          .filter(Boolean)
      ])
    );
    const candidateImageAssets = generatedImages.map((image) => ({
      generationId: image.generationId,
      imageUrl: image.imageUrl,
      previewUrl: image.previewUrl || null,
      thumbnailUrl: image.thumbnailUrl || null,
      storageBucket: image.storageBucket || null,
      storagePath: image.storagePath || null,
      previewStoragePath: image.previewStoragePath || null,
      thumbnailStoragePath: image.thumbnailStoragePath || null
    }));

    const { data: updated, error: updateError } = await sb
      .from('prompt_case_drafts')
      .update({
        image_urls: nextImageUrls,
        selected_image_url:
          draft.selected_image_url || nextImageUrls[0] || null,
        status: 'images_generated',
        generation_settings: {
          ...(generationSettings && typeof generationSettings === 'object'
            ? (generationSettings as Record<string, unknown>)
            : {}),
          imageCount,
          model: 'gpt-image-2',
          creditWaiverReason: 'admin_prompt_case_draft_generation',
          candidateImageAssets
        }
      })
      .eq('id', draftId)
      .select('*')
      .single();

    if (updateError) {
      failures.push({
        draftId,
        error: updateError.message || 'Failed to update draft images'
      });
      continue;
    }
    if (generationError) {
      failures.push({
        draftId,
        error: generationError
      });
    }
    updatedDrafts.push(await mapPromptCaseDraftWithFreshImages(sb, updated));
  }

  return jsonResponse({ drafts: updatedDrafts, failures }, corsHeaders);
}
