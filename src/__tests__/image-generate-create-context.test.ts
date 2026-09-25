import { describe, expect, it } from 'vitest';
import {
  createImageGenerationTask,
  parseQueuedImageGenerationRequest
} from '../../api/image/generate';
import { sanitizeImageGenerateInput } from '../../api/image/generate/request';
import { toActiveTaskResponseItem } from '../../api/image/task-status';
import { buildGenerationPrompt } from '../../api/image/generate/prompt';

describe('image creation workspace context', () => {
  it('preserves the session context through queued task storage and hydration', async () => {
    const sanitized = sanitizeImageGenerateInput({
      prompt: 'Create an editorial portrait',
      model: 'gpt-image-2',
      creationContext: {
        sessionId: 'session-1',
        recipeId: 'recipe-1',
        referenceAssetIds: []
      }
    });

    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;

    let insertedPayload: Record<string, unknown> | undefined;
    const supabase = {
      from: () => ({
        insert: (payload: Record<string, unknown>) => {
          insertedPayload = payload;
          return {
            select: () => ({
              single: async () => ({ data: { id: 'task-1' }, error: null })
            })
          };
        }
      })
    };

    await createImageGenerationTask(
      supabase as never,
      'user-1',
      sanitized.value
    );

    const requestPayload = insertedPayload?.request_payload as Record<
      string,
      unknown
    >;
    expect(requestPayload.creationContext).toMatchObject({
      sessionId: 'session-1',
      recipeId: 'recipe-1'
    });
    expect(
      parseQueuedImageGenerationRequest(requestPayload)?.creationContext
    ).toMatchObject({ sessionId: 'session-1', recipeId: 'recipe-1' });

    const activeTask = toActiveTaskResponseItem({
      id: 'task-1',
      user_id: 'user-1',
      status: 'running',
      request_payload: requestPayload,
      result_payload: null,
      error_message: null,
      refund_failed: false,
      created_at: '2026-07-17T12:00:00.000Z',
      started_at: '2026-07-17T12:00:01.000Z',
      updated_at: '2026-07-17T12:00:02.000Z'
    } as never);
    expect(activeTask.request.creationContext).toMatchObject({
      sessionId: 'session-1',
      recipeId: 'recipe-1'
    });
  });

  it('sanitizes and preserves SEO conversion attribution for terminal events', async () => {
    const capturedAt = new Date().toISOString();
    const sanitized = sanitizeImageGenerateInput({
      prompt: 'Create an editorial portrait',
      model: 'gpt-image-2',
      creationContext: {
        referenceAssetIds: [],
        conversionAttribution: {
          sessionId: ' anonymous-session-123456 ',
          canonicalPath: '/ai-image-prompts',
          caseId: ' case-123 ',
          caseSlug: ' cinematic-product-shot ',
          source: 'prompt_preview_use',
          cluster: ' seo_blog ',
          contentId: ' product-image-ai-guide ',
          cta: ' seo_blog_product-image-ai-guide_use_template ',
          capturedAt
        }
      }
    });

    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;
    expect(sanitized.value.creationContext?.conversionAttribution).toEqual({
      sessionId: 'anonymous-session-123456',
      canonicalPath: '/ai-image-prompts',
      caseId: 'case-123',
      caseSlug: 'cinematic-product-shot',
      source: 'prompt_preview_use',
      cluster: 'seo_blog',
      contentId: 'product-image-ai-guide',
      cta: 'seo_blog_product-image-ai-guide_use_template',
      capturedAt
    });
  });

  it('sanitizes moodboard conditioning before generation metadata is stored', () => {
    const result = sanitizeImageGenerateInput({
      prompt: 'Create an editorial portrait',
      model: 'gpt-image-2',
      creationContext: {
        sessionId: ' session-1 ',
        recipeId: ' recipe-1 ',
        referenceAssetIds: [],
        moodboard: {
          moodboardId: ' moodboard-1 ',
          shareToken: ' shared-token-1 ',
          analysisVersion: 3,
          tasteProfile: `quiet editorial direction${'x'.repeat(2400)}`,
          keywords: Array.from(
            { length: 20 },
            (_, index) => `keyword-${index}`
          ),
          avoids: ['watermark'],
          guidelines: ['preserve natural light'],
          representativeAssetIds: [' moodboard-reference-1 ']
        }
      }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.creationContext).toMatchObject({
      sessionId: 'session-1',
      recipeId: 'recipe-1',
      moodboard: {
        moodboardId: 'moodboard-1',
        shareToken: 'shared-token-1',
        analysisVersion: 3
      }
    });
    expect(result.value.creationContext?.moodboard?.tasteProfile).toHaveLength(
      2000
    );
    expect(result.value.creationContext?.moodboard?.keywords).toHaveLength(16);
    expect(result.value.referenceImageIds).toContain('moodboard-reference-1');

    const providerPrompt = buildGenerationPrompt(result.value);
    expect(providerPrompt).toContain('Moodboard visual direction:');
    expect(providerPrompt).toContain('quiet editorial direction');
    expect(providerPrompt).toContain('Visual keywords: keyword-0');
    expect(providerPrompt).toContain('Avoid from moodboard: watermark');
    expect(providerPrompt).toContain('preserve natural light');
  });

  it('drops stale or incomplete moodboard analysis', () => {
    const result = sanitizeImageGenerateInput({
      prompt: 'Create a portrait',
      creationContext: {
        referenceAssetIds: [],
        moodboard: {
          moodboardId: 'moodboard-1',
          analysisVersion: 0,
          tasteProfile: 'old analysis'
        }
      }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.creationContext).toBeUndefined();
  });
});
