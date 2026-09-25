import { beforeEach, describe, expect, it, vi } from 'vitest';

const { recordConversionEventMock } = vi.hoisted(() => ({
  recordConversionEventMock: vi.fn()
}));

vi.mock('../../api/utils/conversion-events.js', () => ({
  recordConversionEvent: recordConversionEventMock
}));

import {
  buildImageTaskTerminalMetadata,
  recordImageTaskTerminalEvents
} from '../../api/image/task-observability';

const task = {
  id: 'task-123',
  user_id: 'user-123',
  request_payload: {
    model: 'gpt-image-2',
    provider: 'openai',
    imageCount: 2,
    cta_source: 'prompt_detail_use',
    sourceApp: 'webtomind',
    appSlug: 'image-create',
    appOperation: 'generate',
    promptMode: 'custom',
    creationContext: {
      referenceAssetIds: [],
      conversionAttribution: {
        sessionId: 'anonymous-session-123456',
        canonicalPath: '/ai-image-prompts',
        caseId: 'case-123',
        caseSlug: 'cinematic-product-shot',
        source: 'prompt_detail_use',
        cluster: 'seo_blog',
        contentId: 'product-image-ai-guide',
        cta: 'seo_blog_product-image-ai-guide_use_template',
        capturedAt: '2026-07-24T00:00:00.000Z'
      }
    }
  }
};

const durations = {
  queue_wait_ms: 1200,
  provider_latency_ms: 4800,
  total_duration_ms: 6000
};

describe('image task observability', () => {
  beforeEach(() => {
    recordConversionEventMock.mockReset();
    recordConversionEventMock.mockResolvedValue(undefined);
  });

  it('records an idempotent terminal success and one user-scoped first success', async () => {
    await recordImageTaskTerminalEvents({
      sb: {} as never,
      task,
      status: 'succeeded',
      durations,
      payload: {
        success: true,
        generationId: 'generation-123',
        imageUrl: 'https://example.com/image.png',
        imageUrlExpiresIn: 3600,
        images: [{}, {}] as never,
        imageCount: 2,
        requestedImageCount: 2,
        provider: 'tuzi',
        model: 'gpt-image-2',
        modelLabel: 'GPT Image 2',
        requestedModelLabel: 'GPT Image 2',
        quality: 'auto',
        aspectRatio: '1:1',
        imageSize: '1024x1024',
        outputFormat: 'png',
        usedFallback: true,
        credits: { consumed: 100, creditType: 'subscription' }
      }
    });

    expect(recordConversionEventMock).toHaveBeenNthCalledWith(
      1,
      {},
      expect.objectContaining({
        eventName: 'generation_task_succeeded',
        idempotencyKey: 'generation_task_succeeded:task-123',
        ctaSource: 'prompt_detail_use',
        anonymousId: 'anonymous-session-123456',
        sessionId: 'anonymous-session-123456',
        metadata: expect.objectContaining({
          task_id: 'task-123',
          provider: 'tuzi',
          model: 'gpt-image-2',
          queue_duration_ms: 1200,
          provider_duration_ms: 4800,
          total_duration_ms: 6000,
          image_count: 2,
          entry_context: {
            source_app: 'webtomind',
            app_slug: 'image-create',
            app_operation: 'generate',
            prompt_mode: 'custom'
          },
          seo_attribution: {
            canonical_path: '/ai-image-prompts',
            case_id: 'case-123',
            case_slug: 'cinematic-product-shot',
            source: 'prompt_detail_use',
            cluster: 'seo_blog',
            content_id: 'product-image-ai-guide',
            cta: 'seo_blog_product-image-ai-guide_use_template',
            captured_at: '2026-07-24T00:00:00.000Z'
          }
        })
      })
    );
    expect(recordConversionEventMock).toHaveBeenNthCalledWith(
      2,
      {},
      expect.objectContaining({
        eventName: 'first_generation_succeeded',
        idempotencyKey: 'first_generation_succeeded:user-123',
        sessionId: 'anonymous-session-123456'
      })
    );
  });

  it('records failure details without creating a first-success event', async () => {
    await recordImageTaskTerminalEvents({
      sb: {} as never,
      task,
      status: 'failed',
      durations,
      failure: {
        provider: 'openai',
        model: 'gpt-image-2',
        category: 'provider_unavailable',
        code: 'OPENAI_COMPAT_PROVIDER_PENDING'
      }
    });

    expect(recordConversionEventMock).toHaveBeenCalledTimes(1);
    expect(recordConversionEventMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        eventName: 'generation_task_failed',
        idempotencyKey: 'generation_task_failed:task-123',
        metadata: expect.objectContaining({
          failure_category: 'provider_unavailable',
          failure_code: 'OPENAI_COMPAT_PROVIDER_PENDING',
          image_count: 0
        })
      })
    );
  });

  it('does not invent CTA attribution when the task payload lacks it', () => {
    const result = buildImageTaskTerminalMetadata({
      task: {
        ...task,
        request_payload: {
          model: 'gpt-image-2',
          provider: 'openai',
          sourceApp: 'webtomind'
        }
      },
      status: 'failed',
      durations,
      failure: { category: 'timeout', code: 'TIMEOUT' }
    });

    expect(result.ctaSource).toBeUndefined();
    expect(result.metadata).not.toHaveProperty('cta_source');
    expect(result.metadata).toMatchObject({
      entry_context: { source_app: 'webtomind' }
    });
  });

  it('does not let telemetry transport failures break a successful task', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    recordConversionEventMock
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(undefined);

    await expect(
      recordImageTaskTerminalEvents({
        sb: {} as never,
        task,
        status: 'succeeded',
        durations
      })
    ).resolves.toBeUndefined();

    expect(recordConversionEventMock).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      '[ImageTaskObservability] terminal event failed:',
      expect.objectContaining({ taskId: 'task-123' })
    );
    warn.mockRestore();
  });
});
