import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import dotenv from 'dotenv';
import {
  buildTuziImageGenerationRequestBody,
  buildGenerationPrompt,
  executeImageGenerationJob,
  getImageGenerationCreditMetadata,
  getOpenAICompatibleImageModel,
  getImageProviderFallbackChain,
  getImageSizeForSourceDimensions,
  getSingleImageRescueProviderChain,
  getImagePromptSafetyGuidance,
  getKrillProviderImageSize,
  getTuziImageAttemptPlanSummary,
  getTuziImageModelCandidates,
  getTuziModelTimeoutMs,
  getTuziProviderImageSize,
  getTuziSingleImageRescueAttemptPlanCount,
  getTuziSingleImageRescueDiagnostics,
  isStrictBatchConsistencyEnabled,
  isProviderResourceExhaustedMessage,
  parseQueuedImageGenerationRequest,
  parseTuziChannelConnectionConfig,
  sanitizeImageGenerateInput as sanitizeImageGenerateInputRaw,
  shouldAttemptSingleImageRescue,
  shouldAttemptSupplementalImageGeneration
} from '../../api/image/generate';
import { buildCloudDenoiseRestorationPrompt } from '../../api/image/generate/cloud-denoise';
import { estimateImageGenerationCreditCost } from '../shared/image-generation-pricing';

const ORIGINAL_ENV = { ...process.env };
const liveTuziN2Smoke = process.env.REAL_TUZI_N2_SMOKE === '1' ? it : it.skip;
const sanitizeImageGenerateInput = (
  input: Parameters<typeof sanitizeImageGenerateInputRaw>[0]
) => sanitizeImageGenerateInputRaw(input, { preserveLegacyGptImage2: true });

function makePngBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return bytes;
}

describe('image prompt recipe audit', () => {
  const baseRequest = {
    prompt: '生成一张女性时尚写真',
    model: 'gpt-image-2',
    aspectRatio: '2:3',
    imageSize: '1024x1536',
    quality: 'auto',
    outputFormat: 'png',
    promptMode: 'custom'
  } as const;

  it('keeps a bounded audit payload when it matches the selected assets', () => {
    const result = sanitizeImageGenerateInput({
      ...baseRequest,
      assetIds: ['hairstyle-glass-bob'],
      recipeAudit: {
        schemaVersion: 1,
        compilerVersion: 'portrait-recipe-2026-07-13',
        selectionSource: 'random_slot',
        selectedAssetIds: ['hairstyle-glass-bob'],
        inputAssetIds: ['hairstyle-long-waves'],
        profile: 'fashion-editorial',
        seed: 42,
        randomizedSlot: 'hairstyle',
        constraintAdjustments: ['cleared_prop_hands_outside_frame']
      }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.recipeAudit).toEqual({
      schemaVersion: 1,
      compilerVersion: 'portrait-recipe-2026-07-13',
      selectionSource: 'random_slot',
      selectedAssetIds: ['hairstyle-glass-bob'],
      inputAssetIds: ['hairstyle-long-waves'],
      profile: 'fashion-editorial',
      seed: 42,
      randomizedSlot: 'hairstyle',
      constraintAdjustments: ['cleared_prop_hands_outside_frame']
    });

    const queued = parseQueuedImageGenerationRequest(result.value);
    expect(queued?.recipeAudit).toEqual(result.value.recipeAudit);
  });

  it('drops stale audit metadata whose selected assets do not match', () => {
    const result = sanitizeImageGenerateInput({
      ...baseRequest,
      assetIds: ['hairstyle-glass-bob'],
      recipeAudit: {
        schemaVersion: 1,
        compilerVersion: 'portrait-recipe-2026-07-13',
        selectionSource: 'random_recipe',
        selectedAssetIds: ['outfit-unrelated'],
        seed: 42
      }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.recipeAudit).toBeUndefined();
  });

  it('does not allow clients to submit the server-only legacy source marker', () => {
    const result = sanitizeImageGenerateInput({
      ...baseRequest,
      assetIds: ['hairstyle-glass-bob'],
      recipeAudit: {
        schemaVersion: 1,
        compilerVersion: 'legacy-pre-recipe-audit',
        selectionSource: 'legacy_unknown',
        selectedAssetIds: ['hairstyle-glass-bob']
      }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.recipeAudit).toBeUndefined();
  });

  it('restores trusted app metadata from a queued server task', () => {
    const queued = parseQueuedImageGenerationRequest({
      ...baseRequest,
      model: 'nano-banana-2',
      assetIds: [],
      referenceImageIds: ['reference-1'],
      referenceMode: 'image_reference',
      imageCount: 1,
      appSlug: 'gpt-image-2-denoiser',
      appOperation: 'gpt-image-2-denoise',
      sourceApp: 'gpt-image-2-denoiser',
      provider: 'tuzi'
    });
    expect(queued).toMatchObject({
      model: 'nano-banana-2',
      appSlug: 'gpt-image-2-denoiser',
      appOperation: 'gpt-image-2-denoise',
      sourceApp: 'gpt-image-2-denoiser',
      provider: 'tuzi'
    });
  });

  it('does not trust a queued Tuzi override outside the dedicated denoiser', () => {
    const baseline = sanitizeImageGenerateInput(baseRequest);
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;
    const injectedProvider =
      baseline.value.provider === 'tuzi' ? 'openai' : 'tuzi';
    const queued = parseQueuedImageGenerationRequest({
      ...baseRequest,
      provider: injectedProvider,
      appSlug: 'another-tool',
      appOperation: 'generate',
      sourceApp: 'another-tool'
    });

    expect(queued?.provider).toBe(baseline.value.provider);
    expect(queued?.provider).not.toBe(injectedProvider);
  });
});

function makePngBase64(width: number, height: number): string {
  return Buffer.from(makePngBytes(width, height)).toString('base64');
}

function makePngArrayBuffer(width: number, height: number): ArrayBuffer {
  const bytes = makePngBytes(width, height);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

function installCloudflareDenoiseGuideTransformMock(
  width = 1024,
  height = 1536
) {
  const transforms: Array<Record<string, unknown>> = [];
  const outputs: Array<Record<string, unknown>> = [];
  let activeTransform: Record<string, unknown> = {};
  const imageInput = {
    transform: vi.fn((options: Record<string, unknown>) => {
      transforms.push(options);
      activeTransform = options;
      return imageInput;
    }),
    output: vi.fn(async (options: Record<string, unknown>) => {
      outputs.push(options);
      return {
        response: () =>
          new Response(
            makePngArrayBuffer(
              Number(activeTransform.width) || width,
              Number(activeTransform.height) || height
            ),
            {
              status: 200,
              headers: {
                'content-type': String(options.format || 'image/png')
              }
            }
          )
      };
    })
  };
  const binding = {
    input: vi.fn(() => imageInput)
  };
  (
    globalThis as typeof globalThis & {
      __WEBTOMIND_CLOUDFLARE_IMAGES?: typeof binding;
    }
  ).__WEBTOMIND_CLOUDFLARE_IMAGES = binding;
  return { binding, imageInput, transforms, outputs };
}

function createChaojitudouAsyncTaskFetchMock(
  imageFactory: (taskId: string) => string = () => 'iVBORw0KGgo='
) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/api/image-tasks/generations')) {
      const body = JSON.parse(String(init?.body || '{}')) as {
        client_task_id?: string;
      };
      return new Response(
        JSON.stringify({
          id: body.client_task_id,
          status: 'queued',
          mode: 'generate',
          model: 'gpt-image-2'
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    if (url.includes('/api/image-tasks?ids=')) {
      const taskId = decodeURIComponent(url.split('ids=')[1] || '');
      return new Response(
        JSON.stringify({
          items: [
            {
              id: taskId,
              status: 'success',
              data: [{ b64_json: imageFactory(taskId) }]
            }
          ],
          missing_ids: []
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  });
}

function createImageGenerateSupabaseMock(options: {
  references?: Array<{
    id: string;
    role?: string;
    label?: string | null;
    storage_bucket?: string;
    storage_path?: string;
    mime_type?: string;
  }>;
  providerHealthRows?: Array<Record<string, unknown>>;
  referenceSignedUrlError?: string;
}) {
  const insertedAttempts: Array<Record<string, unknown>> = [];
  const insertedGenerations: Array<Record<string, unknown>> = [];
  const uploadedStoragePaths: string[] = [];
  const removedStoragePaths: string[] = [];
  const rpcCalls: Array<[string, Record<string, unknown> | undefined]> = [];
  const references = options.references || [];
  const fromMock = vi.fn((table: string) => {
    if (table === 'image_generation_attempts') {
      return {
        insert: vi.fn(async (payload: Record<string, unknown>) => {
          insertedAttempts.push(payload);
          return { error: null };
        })
      };
    }
    if (table === 'image_reference_assets') {
      type ReferenceQueryChain = {
        select: ReturnType<typeof vi.fn>;
        eq: ReturnType<typeof vi.fn>;
        is: ReturnType<typeof vi.fn>;
        in: ReturnType<typeof vi.fn>;
      };
      const chain = {} as ReferenceQueryChain;
      chain.select = vi.fn(() => chain) as ReturnType<typeof vi.fn>;
      chain.eq = vi.fn(() => chain) as ReturnType<typeof vi.fn>;
      chain.is = vi.fn(() => chain) as ReturnType<typeof vi.fn>;
      chain.in = vi.fn(async () => ({
        data: references.map((reference) => ({
          id: reference.id,
          role: reference.role || 'reference',
          label: reference.label || null,
          storage_bucket: reference.storage_bucket || 'refs',
          storage_path: reference.storage_path || `${reference.id}.png`,
          mime_type: reference.mime_type || 'image/png'
        })),
        error: null
      })) as ReturnType<typeof vi.fn>;
      return chain;
    }
    if (table === 'image_generations') {
      return {
        insert: vi.fn((payload: Record<string, unknown>) => {
          insertedGenerations.push(payload);
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { id: `gen-${insertedGenerations.length}` },
                error: null
              }))
            }))
          };
        }),
        delete: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null }))
        }))
      };
    }
    if (table === 'media_objects') {
      return {
        upsert: vi.fn(async () => ({ error: null }))
      };
    }
    if (table === 'payment_orders') {
      const chain = {
        select: vi.fn(),
        eq: vi.fn(),
        gte: vi.fn(),
        order: vi.fn(),
        limit: vi.fn(),
        maybeSingle: vi.fn(async () => ({ data: null, error: null }))
      };
      chain.select.mockReturnValue(chain);
      chain.eq.mockReturnValue(chain);
      chain.gte.mockReturnValue(chain);
      chain.order.mockReturnValue(chain);
      chain.limit.mockReturnValue(chain);
      return chain;
    }
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          single: vi.fn(async () => ({ data: null, error: null }))
        }))
      })),
      delete: vi.fn(() => ({
        in: vi.fn(async () => ({ error: null }))
      })),
      insert: vi.fn(async () => ({ data: null, error: null }))
    };
  });

  return {
    sb: {
      from: fromMock,
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn(async (path: string) => {
            uploadedStoragePaths.push(path);
            return { error: null };
          }),
          createSignedUrl: vi.fn(async (path: string) =>
            options.referenceSignedUrlError
              ? {
                  data: null,
                  error: { message: options.referenceSignedUrlError }
                }
              : {
                  data: { signedUrl: `https://refs.test/${path}` },
                  error: null
                }
          ),
          remove: vi.fn(async (paths: string[]) => {
            removedStoragePaths.push(...paths);
            return { error: null };
          }),
          download: vi.fn(async () => ({
            data: new Blob([new Uint8Array([1, 2, 3])], {
              type: 'image/png'
            }),
            error: null
          }))
        }))
      },
      rpc: vi.fn(async (fn: string, args?: Record<string, unknown>) => {
        rpcCalls.push([fn, args]);
        return {
          data:
            fn === 'get_image_provider_health'
              ? options.providerHealthRows || []
              : null,
          error: null
        };
      })
    },
    insertedAttempts,
    insertedGenerations,
    uploadedStoragePaths,
    removedStoragePaths,
    rpcCalls
  };
}

beforeEach(() => {
  delete process.env.TUZI_DISABLED_IMAGE_CHANNELS;
  delete process.env.TUZI_DISABLED_CHANNELS;
  delete process.env.TUZI_IMAGE_CHANNEL_ORDER;
  delete process.env.TUZI_IMAGE_GROUP;
  delete process.env.TUZI_GROUP;
  delete process.env.TUZI_DISABLE_IMAGE_GROUP;
  delete process.env.TUZI_API_KEY;
  delete process.env.TUZI_IMAGE_API_BASE_URL;
  delete process.env.TUZI_GPT_IMAGE_25_ENABLED;
  delete process.env.TUZI_CHANNEL_CONNECTION;
  delete process.env.TUZI_NEWAPI_CHANNEL_CONNECTION;
  delete process.env.TUZI_IMAGE_CHANNEL_CONNECTION;
  delete process.env.TUZI_OFFICIAL_DISCOUNT_API_KEY;
  delete process.env.TUZI_OFFICIAL_API_KEY;
  delete process.env.TUZI_OPENAI_ORIGINAL_API_KEY;
  delete process.env.OPENAI_COMPAT_IMAGE_DISABLE_TUZI_FALLBACK;
  delete process.env.OPENAI_COMPAT_IMAGE_TUZI_FALLBACK_MODE;
  delete process.env.OPENAI_DISABLE_TUZI_FALLBACK;
  delete process.env.OPENAI_COMPAT_IMAGE_ENABLED;
  delete process.env.OPENAI_COMPAT_IMAGE_BASE_URL;
  delete process.env.OPENAI_COMPAT_IMAGE_API_KEY;
  delete process.env.OPENAI_COMPAT_IMAGE_MODEL;
  delete process.env.OPENAI_COMPAT_IMAGE_FALLBACK_MODEL;
  delete process.env.OPENAI_COMPAT_IMAGE_BATCH_SIZE;
  delete process.env.OPENAI_COMPAT_IMAGE_RESCUE_TIMEOUT_MS;
  delete process.env.CHAOJITUDOU_GPT_IMAGE_25_MODELS;
  delete process.env.OPENAI_COMPAT_IMAGE_STREAMING_ENABLED;
  delete process.env.OPENAI_COMPAT_IMAGE_STREAMING_ALLOW_CHAO;
  delete process.env.OPENAI_COMPAT_IMAGE_PARTIAL_IMAGES;
  delete process.env.OPENAI_COMPAT_IMAGE_DISABLE_KRILL_FALLBACK;
  delete process.env.TUZI_ENABLE_OPENAI_COMPAT_FALLBACK;
  delete process.env.CLOUDFLARE_AI_GATEWAY_RUN_TOKEN;
  delete process.env.OPENAI_COMPAT_IMAGE_DISABLE_CODEX_FALLBACK;
  delete process.env.OPENAI_COMPAT_IMAGE_SUPPORTS_EDITS;
  delete process.env.OPENAI_COMPAT_IMAGE_SUPPORTS_MULTI;
  delete process.env.GPT_IMAGE_2_FORCE_TUZI_PRIMARY;
  delete process.env.GPT_IMAGE_2_ALLOW_OPENAI_COMPAT_PRIMARY;
  delete process.env.KRILL_IMAGE_API_KEY;
  delete process.env.KRILL_API_KEY;
  delete process.env.KRILL_IMAGE_1K_ENABLED;
  delete process.env.KRILL_IMAGE_2K_ENABLED;
  delete process.env.KRILL_IMAGE_4K_ENABLED;
  delete process.env.WEBTOMIND_IMAGE_RUNTIME;
  delete process.env.IMAGE_CLOUDFLARE_UPSCALE_ENABLED;
  process.env.GPT_IMAGE_2_ENABLE_SLOW_FALLBACKS = 'true';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete (
    globalThis as typeof globalThis & {
      __WEBTOMIND_CLOUDFLARE_IMAGES?: unknown;
    }
  ).__WEBTOMIND_CLOUDFLARE_IMAGES;
  vi.unstubAllGlobals();
});

describe('Tuzi image model fallback', () => {
  liveTuziN2Smoke(
    'runs a real Tuzi GPT Image 2 n=2 smoke test with scaled timeout budget',
    async () => {
      dotenv.config({
        path: '.env.local',
        override: true,
        quiet: true
      });
      process.env.GPT_IMAGE_2_FORCE_TUZI_PRIMARY = 'true';
      process.env.TUZI_IMAGE_CHANNEL_ORDER = 'default';
      process.env.TUZI_DISABLED_IMAGE_CHANNELS =
        'official_discount,official,openai_original';
      process.env.TUZI_DISABLE_IMAGE_GROUP = 'true';

      const sanitized = sanitizeImageGenerateInput({
        prompt:
          'Real smoke test for Tuzi GPT Image 2 n=2 timeout budget. Generate two simple premium product renders of a single matte red cube centered on a clean white background, soft studio shadow, no text, no logo, no watermark.',
        model: 'gpt-image-2',
        aspectRatio: '1:1',
        imageSize: '1024x1024',
        quality: 'auto',
        outputFormat: 'png',
        promptMode: 'custom',
        imageCount: 2
      });
      expect(sanitized.ok).toBe(true);
      if (!sanitized.ok) return;
      expect(sanitized.value.provider).toBe('tuzi');

      const { sb, insertedAttempts } = createImageGenerateSupabaseMock({});
      const result = await executeImageGenerationJob({
        request: new Request('https://webtomind.test/api/image/generate', {
          method: 'POST'
        }),
        userId: 'real-tuzi-n2-smoke',
        sanitizedInput: sanitized.value,
        sb: sb as never,
        options: {
          mode: 'queued',
          skipCreditCharge: true,
          pipelineDeadlineMs: 280000,
          tuziVipTimeoutMs: 260000,
          disableProviderFallback: true
        }
      });

      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(result.failureReason);
      }
      expect(result.payload?.actualImageCount).toBe(2);
      expect(result.payload?.requestedImageCount).toBe(2);

      const tuziAttempts = insertedAttempts.filter(
        (attempt) => attempt.provider === 'tuzi'
      );
      expect(tuziAttempts.length).toBeGreaterThanOrEqual(1);
      expect(tuziAttempts[0].metadata).toMatchObject({
        providerRequestImageCount: 2,
        timeoutMs: 235000
      });
    },
    260000
  );

  it('treats provider resource exhaustion as retryable capacity pressure', () => {
    expect(isProviderResourceExhaustedMessage('资源不足,稍后再试')).toBe(true);
    expect(isProviderResourceExhaustedMessage('resource exhausted')).toBe(true);
    expect(
      isProviderResourceExhaustedMessage(
        'No available channel for model midjourney-v7 under group image'
      )
    ).toBe(true);
    expect(isProviderResourceExhaustedMessage('通道繁忙')).toBe(true);
    expect(isProviderResourceExhaustedMessage('policy blocked')).toBe(false);
  });

  it('uses Tuzi native Midjourney submit and task fetch endpoints', async () => {
    process.env.TUZI_API_KEY = 'sk-mj';
    process.env.TUZI_IMAGE_API_BASE_URL = 'https://tuzi.test';
    process.env.TUZI_IMAGE_CHANNEL_ORDER = 'default';
    process.env.TUZI_DISABLE_IMAGE_GROUP = 'true';

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://tuzi.test/mj/submit/imagine') {
        return new Response(
          JSON.stringify({ code: 1, description: '提交成功', result: 'mj-1' }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (url === 'https://tuzi.test/mj/task/mj-1/fetch') {
        return new Response(
          JSON.stringify({
            id: 'mj-1',
            status: 'SUCCESS',
            imageUrl: 'https://image.test/mj-1.png'
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (url === 'https://image.test/mj-1.png') {
        const imageBytes = makePngBytes(1024, 1024);
        const imageBuffer = new ArrayBuffer(imageBytes.byteLength);
        new Uint8Array(imageBuffer).set(imageBytes);
        return new Response(imageBuffer, {
          status: 200,
          headers: { 'content-type': 'image/png' }
        });
      }
      throw new Error(`Unexpected fetch URL: ${url} ${String(init?.method)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const sanitized = sanitizeImageGenerateInput({
      prompt: 'A cinematic cat',
      model: 'midjourney-v7',
      aspectRatio: '16:9',
      imageSize: '1536x864',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 1
    });
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;

    const { sb, insertedAttempts } = createImageGenerateSupabaseMock({});
    const result = await executeImageGenerationJob({
      request: new Request('https://webtomind.test/api/image/generate', {
        method: 'POST'
      }),
      userId: 'user-mj-native',
      sb: sb as never,
      sanitizedInput: sanitized.value,
      options: {
        skipCreditCharge: true,
        disableProviderFallback: true,
        pipelineDeadlineMs: 25_000
      }
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://tuzi.test/mj/submit/imagine'
    );
    const submitBody = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body || '{}')
    );
    expect(submitBody).toEqual({
      botType: 'MID_JOURNEY',
      prompt: 'A cinematic cat --ar 16:9',
      base64Array: []
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://tuzi.test/mj/task/mj-1/fetch'
    );
    expect(insertedAttempts[0]).toMatchObject({
      provider: 'tuzi',
      model: 'midjourney-v7',
      channel: 'default',
      status: 'succeeded'
    });
  });

  it('uses Tuzi as GPT Image 2 primary provider for ordinary requests', () => {
    process.env.GEMINI_API_KEY = 'gemini-test';
    process.env.DASHSCOPE_API_KEY = 'dashscope-test';
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.TUZI_API_KEY = 'sk-tuzi';

    const result = sanitizeImageGenerateInput({
      prompt: '生成一张 9:16 竖版写真',
      model: 'gpt-image-2',
      aspectRatio: '9:16',
      imageSize: '1152x2048',
      quality: 'high',
      outputFormat: 'png'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.provider).toBe('tuzi');
    expect(getKrillProviderImageSize(result.value)).toBe('1152x2048');
    expect(getImageProviderFallbackChain('krill')).toEqual(['tuzi']);
    expect(getImageProviderFallbackChain('tuzi')).toEqual([]);
    expect(getImageProviderFallbackChain('gemini')).toEqual([]);
    expect(getImageProviderFallbackChain('z-image')).toEqual([]);
    expect(getImageProviderFallbackChain('openai', result.value)).toEqual([
      'tuzi'
    ]);
    expect(getSingleImageRescueProviderChain('openai', result.value)).toEqual([
      'tuzi',
      'openai'
    ]);
  });

  it('adds OpenAI-compatible fallback only when it is explicitly enabled and configured', () => {
    process.env.TUZI_ENABLE_OPENAI_COMPAT_FALLBACK = 'true';
    process.env.OPENAI_COMPAT_IMAGE_ENABLED = 'true';
    process.env.OPENAI_COMPAT_IMAGE_BASE_URL =
      'https://openai-fallback.test/v1';
    process.env.OPENAI_COMPAT_IMAGE_API_KEY = 'sk-openai-fallback';
    process.env.OPENAI_COMPAT_IMAGE_MODEL = 'gpt-image-2';

    const result = sanitizeImageGenerateInput({
      prompt: 'Fallback routing contract',
      model: 'gpt-image-2',
      aspectRatio: '1:1',
      imageSize: '1024x1024',
      quality: 'auto',
      outputFormat: 'png',
      imageCount: 1
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.provider).toBe('tuzi');
    expect(getImageProviderFallbackChain('tuzi', result.value)).toEqual([
      'openai'
    ]);

    delete process.env.OPENAI_COMPAT_IMAGE_API_KEY;
    expect(getImageProviderFallbackChain('tuzi', result.value)).toEqual([]);
  });

  it('uses healthy Krill as the first GPT Image 2 fallback from Tuzi', () => {
    process.env.KRILL_IMAGE_API_KEY = 'sk-krill';
    process.env.KRILL_IMAGE_2K_ENABLED = 'true';
    process.env.TUZI_ENABLE_OPENAI_COMPAT_FALLBACK = 'true';
    process.env.OPENAI_COMPAT_IMAGE_ENABLED = 'true';
    process.env.OPENAI_COMPAT_IMAGE_BASE_URL =
      'https://openai-fallback.test/v1';
    process.env.OPENAI_COMPAT_IMAGE_API_KEY = 'sk-openai-fallback';
    process.env.OPENAI_COMPAT_IMAGE_MODEL = 'gpt-image-2';

    const result = sanitizeImageGenerateInput({
      prompt: 'Fallback routing contract',
      model: 'gpt-image-2',
      aspectRatio: '1:1',
      imageSize: '1024x1024',
      quality: 'auto',
      outputFormat: 'png',
      imageCount: 1
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(getImageProviderFallbackChain('tuzi', result.value)).toEqual([
      'krill',
      'openai'
    ]);
  });

  it('splits inline Chinese negative prompt sections from the main prompt', () => {
    const result = sanitizeImageGenerateInput({
      prompt: '主提示词正文\n\n负向 PROMPT: 文字、标志、水印、多余手指',
      model: 'gpt-image-2',
      aspectRatio: '9:16',
      imageSize: '1152x2048',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 1
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.prompt).toBe('主提示词正文');
    expect(result.value.negativePrompt).toBe('文字、标志、水印、多余手指');
  });

  it('drops legacy auto negative prompt templates before queueing', () => {
    const result = sanitizeImageGenerateInput({
      prompt: '生成一张 9:16 竖版写真',
      negativePrompt:
        '文字、标志、水印、对话框、可读招牌、多余主要人物、未成年感、幼态脸、过度性感表达、裸露、透明浴巾、胸部或臀部暴露、正面裸露、身体局部特写、低俗姿势、不自然面部、不自然视线、多余手指、缺失手指、手脚融合、关节变形、浴巾接触不良、浴巾漂浮、不自然重力、矛盾阴影、过度美肌、塑料皮肤、背景粗糙崩坏、男性抢主体、男性表情不可辨识、女性直视镜头、女性完全正面。',
      model: 'gpt-image-2',
      aspectRatio: '9:16',
      imageSize: '1152x2048',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 1
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.negativePrompt).toBeUndefined();
  });

  it('allows OpenAI-compatible Tuzi fallback for ordinary and heavy GPT Image 2 requests', () => {
    process.env.TUZI_API_KEY = 'sk-tuzi';

    const ordinary = sanitizeImageGenerateInput({
      prompt: '生成 2 张 9:16 竖版写真',
      model: 'gpt-image-2',
      aspectRatio: '9:16',
      imageSize: '1152x2048',
      quality: 'high',
      outputFormat: 'png',
      imageCount: 2
    });

    expect(ordinary.ok).toBe(true);
    if (!ordinary.ok) return;
    expect(getImageProviderFallbackChain('openai', ordinary.value)).toEqual([
      'tuzi'
    ]);

    const heavy = sanitizeImageGenerateInput({
      prompt: '生成 4 张 9:16 竖版写真',
      model: 'gpt-image-2',
      aspectRatio: '9:16',
      imageSize: '1152x2048',
      quality: 'high',
      outputFormat: 'png',
      imageCount: 4
    });

    expect(heavy.ok).toBe(true);
    if (!heavy.ok) return;
    expect(getImageProviderFallbackChain('openai', heavy.value)).toEqual([
      'tuzi'
    ]);
    expect(getSingleImageRescueProviderChain('openai', heavy.value)).toEqual([
      'tuzi',
      'openai'
    ]);
  });

  it('can restrict OpenAI-compatible Tuzi fallback to heavy GPT Image 2 requests through env', () => {
    process.env.GPT_IMAGE_2_ALLOW_OPENAI_COMPAT_PRIMARY = 'true';
    process.env.TUZI_API_KEY = 'sk-tuzi';
    process.env.OPENAI_COMPAT_IMAGE_TUZI_FALLBACK_MODE = 'heavy';

    const ordinary = sanitizeImageGenerateInput({
      prompt: '生成 2 张 9:16 竖版写真',
      model: 'gpt-image-2',
      aspectRatio: '9:16',
      imageSize: '1152x2048',
      quality: 'high',
      outputFormat: 'png',
      imageCount: 2
    });

    expect(ordinary.ok).toBe(true);
    if (!ordinary.ok) return;
    expect(getImageProviderFallbackChain('openai', ordinary.value)).toEqual([]);

    const heavy = sanitizeImageGenerateInput({
      prompt: '生成 4 张 9:16 竖版写真',
      model: 'gpt-image-2',
      aspectRatio: '9:16',
      imageSize: '1152x2048',
      quality: 'high',
      outputFormat: 'png',
      imageCount: 4
    });

    expect(heavy.ok).toBe(true);
    if (!heavy.ok) return;
    expect(getImageProviderFallbackChain('openai', heavy.value)).toEqual([
      'tuzi'
    ]);
  });

  it('routes ordinary GPT Image 2 requests directly to Tuzi by default', () => {
    const result = sanitizeImageGenerateInput({
      prompt: '生成 2 张 9:16 竖版写真',
      model: 'gpt-image-2',
      aspectRatio: '9:16',
      imageSize: '1152x2048',
      quality: 'auto',
      outputFormat: 'png',
      imageCount: 2
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.provider).toBe('tuzi');
  });

  it('keeps ordinary production GPT Image 2 requests on OpenAI-compatible primary', () => {
    process.env.GPT_IMAGE_2_ALLOW_OPENAI_COMPAT_PRIMARY = 'true';

    const result = sanitizeImageGenerateInput({
      prompt: '生成一张 9:16 竖版写真',
      model: 'gpt-image-2',
      aspectRatio: '9:16',
      imageSize: '1152x2048',
      quality: 'auto',
      outputFormat: 'png',
      imageCount: 1
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.provider).toBe('openai');
  });

  it('allows Krill fallback for ordinary GPT Image 2 requests when configured', () => {
    const ordinary = sanitizeImageGenerateInput({
      prompt: '生成 2 张 9:16 竖版写真',
      model: 'gpt-image-2',
      aspectRatio: '9:16',
      imageSize: '1152x2048',
      quality: 'auto',
      outputFormat: 'png',
      imageCount: 2
    });

    expect(ordinary.ok).toBe(true);
    if (!ordinary.ok) return;
    expect(getImageProviderFallbackChain('openai', ordinary.value)).toEqual([]);

    process.env.KRILL_IMAGE_API_KEY = 'sk-krill';
    process.env.KRILL_IMAGE_2K_ENABLED = 'true';
    expect(getImageProviderFallbackChain('openai', ordinary.value)).toEqual([
      'krill'
    ]);

    process.env.OPENAI_COMPAT_IMAGE_DISABLE_KRILL_FALLBACK = 'true';
    expect(getImageProviderFallbackChain('openai', ordinary.value)).toEqual([]);
  });

  it('orders healthy Krill before Tuzi for production GPT Image 2 fallback and rescue', () => {
    process.env.GPT_IMAGE_2_ALLOW_OPENAI_COMPAT_PRIMARY = 'true';
    process.env.KRILL_IMAGE_API_KEY = 'sk-krill';
    process.env.KRILL_IMAGE_2K_ENABLED = 'true';
    process.env.TUZI_API_KEY = 'sk-tuzi';

    const input = sanitizeImageGenerateInput({
      prompt: '生成一张 2K 商业海报',
      model: 'gpt-image-2',
      aspectRatio: '9:16',
      imageSize: '1152x2048',
      quality: 'auto',
      outputFormat: 'png',
      imageCount: 1
    });

    expect(input.ok).toBe(true);
    if (!input.ok) return;
    expect(input.value.provider).toBe('openai');
    expect(getImageProviderFallbackChain('openai', input.value)).toEqual([
      'krill',
      'tuzi'
    ]);
    expect(getSingleImageRescueProviderChain('openai', input.value)).toEqual([
      'krill',
      'tuzi',
      'openai'
    ]);
  });

  it('routes GPT Image 2 through independent OpenAI-compatible and Krill providers when Tuzi is disabled', () => {
    process.env.GPT_IMAGE_2_FORCE_TUZI_PRIMARY = 'false';
    process.env.GPT_IMAGE_2_ALLOW_OPENAI_COMPAT_PRIMARY = 'true';
    process.env.OPENAI_COMPAT_IMAGE_TUZI_FALLBACK_MODE = 'none';
    process.env.OPENAI_COMPAT_IMAGE_DISABLE_KRILL_FALLBACK = 'false';
    process.env.KRILL_IMAGE_API_KEY = 'sk-krill';
    process.env.KRILL_IMAGE_2K_ENABLED = 'true';

    const input = sanitizeImageGenerateInput({
      prompt: '生成一张 9:16 竖版写真',
      model: 'gpt-image-2',
      aspectRatio: '9:16',
      imageSize: '1152x2048',
      quality: 'high',
      outputFormat: 'png',
      imageCount: 1
    });

    expect(input.ok).toBe(true);
    if (!input.ok) return;
    expect(input.value.provider).toBe('openai');
    expect(getImageProviderFallbackChain('openai', input.value)).toEqual([
      'krill'
    ]);
  });

  it('can disable OpenAI-compatible Tuzi fallback through env', () => {
    process.env.TUZI_API_KEY = 'sk-tuzi';

    const heavy = sanitizeImageGenerateInput({
      prompt: '生成 4 张 9:16 竖版写真',
      model: 'gpt-image-2',
      aspectRatio: '9:16',
      imageSize: '1152x2048',
      quality: 'high',
      outputFormat: 'png',
      imageCount: 4
    });

    expect(heavy.ok).toBe(true);
    if (!heavy.ok) return;
    expect(getImageProviderFallbackChain('openai', heavy.value)).toEqual([
      'tuzi'
    ]);

    process.env.OPENAI_COMPAT_IMAGE_DISABLE_TUZI_FALLBACK = 'true';
    expect(getImageProviderFallbackChain('openai', heavy.value)).toEqual([]);
    expect(getSingleImageRescueProviderChain('openai', heavy.value)).toEqual([
      'openai'
    ]);
  });

  it('routes multi-image GPT Image 2 requests directly to Tuzi', () => {
    const result = sanitizeImageGenerateInput({
      prompt: '生成 3 张 9:16 竖版写真',
      model: 'gpt-image-2',
      aspectRatio: '9:16',
      imageSize: '1152x2048',
      quality: 'high',
      outputFormat: 'png',
      imageCount: 3
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.imageCount).toBe(3);
    expect(result.value.provider).toBe('tuzi');
  });

  it('routes GPT Image 2 batches of four or more directly to Tuzi', () => {
    const result = sanitizeImageGenerateInput({
      prompt: '生成 4 张 9:16 竖版写真',
      model: 'gpt-image-2',
      aspectRatio: '9:16',
      imageSize: '1152x2048',
      quality: 'high',
      outputFormat: 'png',
      imageCount: 4
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.imageCount).toBe(4);
    expect(result.value.provider).toBe('tuzi');
  });

  it('routes explicit GPT Image 2 4K requests to Tuzi', () => {
    const result = sanitizeImageGenerateInput({
      prompt: '生成 10 张 16:9 横版商业视觉',
      model: 'gpt-image-2',
      aspectRatio: '16:9',
      imageSize: '3840x2160',
      quality: 'high',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 10
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.provider).toBe('tuzi');
    expect(result.value.imageCount).toBe(10);
    expect(getTuziProviderImageSize(result.value)).toBe('3840x2160');
  });

  it('routes product 4K preset GPT Image 2 requests to Tuzi', () => {
    const result = sanitizeImageGenerateInput({
      prompt: '生成一张 3:4 竖版写真',
      model: 'gpt-image-2',
      aspectRatio: '3:4',
      imageSize: '2304x3072',
      quality: 'high',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 1
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.provider).toBe('tuzi');
    expect(getTuziProviderImageSize(result.value)).toBe('2304x3072');
  });

  it('routes custom prompt 4K size hints to Tuzi when the UI size is auto', () => {
    const result = sanitizeImageGenerateInput({
      prompt: '生成一张 2160x3840 竖版写真，4K 质感',
      model: 'gpt-image-2',
      aspectRatio: 'auto',
      imageSize: 'auto',
      quality: 'high',
      outputFormat: 'png',
      promptMode: 'custom'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.provider).toBe('tuzi');
    expect(getTuziProviderImageSize(result.value)).toBe('2160x3840');
  });

  it('resolves Auto ratio from the prompt ratio and reports the detected aspect ratio', () => {
    const result = sanitizeImageGenerateInput({
      prompt: '生成一张 3:4 竖版海报',
      model: 'gpt-image-2',
      aspectRatio: 'auto',
      imageSize: 'auto',
      quality: 'high',
      outputFormat: 'png',
      promptMode: 'custom'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.aspectRatio).toBe('3:4');
    expect(result.value.promptAspectRatio).toBe('3:4');
    expect(getTuziProviderImageSize(result.value)).toBe('1152x1536');
  });

  it('keeps Auto as provider-decided when the prompt contains no ratio', () => {
    const result = sanitizeImageGenerateInput({
      prompt: '一只在草地上晒太阳的橘猫',
      model: 'gpt-image-2',
      aspectRatio: 'auto',
      imageSize: 'auto',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.aspectRatio).toBe('auto');
    expect(result.value.imageSize).toBe('auto');
    expect(getTuziProviderImageSize(result.value)).toBe('auto');
  });

  it('falls back from GPT Image 2 to Codex GPT Image 2 on retryable OpenAI-compatible failures', async () => {
    process.env.GPT_IMAGE_2_ALLOW_OPENAI_COMPAT_PRIMARY = 'true';
    process.env.OPENAI_COMPAT_IMAGE_ENABLED = 'true';
    process.env.OPENAI_COMPAT_IMAGE_BASE_URL = 'https://proxy.test/v1';
    process.env.OPENAI_COMPAT_IMAGE_API_KEY = 'sk-test-secret';
    process.env.OPENAI_COMPAT_IMAGE_MODEL = 'gpt-image-2';

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { message: 'provider timeout' } }),
          {
            status: 524,
            headers: { 'content-type': 'application/json' }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'safety blocked' } }), {
          status: 400,
          headers: { 'content-type': 'application/json' }
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const sanitized = sanitizeImageGenerateInput({
      prompt: '生成一张 9:16 竖版写真',
      model: 'gpt-image-2',
      aspectRatio: '9:16',
      imageSize: '1152x2048',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 1
    });
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;

    const { sb, insertedAttempts } = createImageGenerateSupabaseMock({});
    const result = await executeImageGenerationJob({
      request: new Request('https://webtomind.test/api/image/generate', {
        method: 'POST'
      }),
      userId: 'user-codex-gpt-image-2',
      sb: sb as never,
      sanitizedInput: sanitized.value,
      options: { skipCreditCharge: true }
    });

    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))
    ).toMatchObject({ model: 'gpt-image-2' });
    expect(
      JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body))
    ).toMatchObject({ model: 'codex-gpt-image-2' });
    expect(insertedAttempts).toHaveLength(2);
    expect(insertedAttempts[0]).toMatchObject({
      provider: 'openai',
      model: 'gpt-image-2',
      status: 'failed',
      error_category: 'provider_unavailable'
    });
    expect(insertedAttempts[1]).toMatchObject({
      provider: 'openai',
      model: 'codex-gpt-image-2',
      status: 'failed',
      error_category: 'provider_policy'
    });
  });

  it('keeps Chaojitudou smoke-test queue tasks on Tuzi unless explicitly enabled', () => {
    process.env.GPT_IMAGE_2_FORCE_TUZI_PRIMARY = 'true';

    const basePayload = {
      prompt: 'A simple red cube on a white background.',
      model: 'gpt-image-2',
      aspectRatio: '1:1',
      imageSize: '1024x1024',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 1,
      providerOverride: 'openai'
    };

    expect(parseQueuedImageGenerationRequest(basePayload)?.provider).toBe(
      'tuzi'
    );
    expect(
      parseQueuedImageGenerationRequest({
        ...basePayload,
        creditWaiver: { reason: 'chaojitudou_real_task_smoke' }
      })?.provider
    ).toBe('tuzi');

    process.env.CHAOJITUDOU_REAL_TASK_SMOKE_ENABLED = 'true';
    expect(
      parseQueuedImageGenerationRequest({
        ...basePayload,
        creditWaiver: { reason: 'chaojitudou_real_task_smoke' }
      })?.provider
    ).toBe('openai');
  });

  it('defers OpenAI-compatible pending tasks without falling back to Tuzi', async () => {
    vi.useFakeTimers();
    process.env.OPENAI_COMPAT_IMAGE_ENABLED = 'true';
    process.env.OPENAI_COMPAT_IMAGE_BASE_URL = 'https://api.chaojitudou.com/v1';
    process.env.OPENAI_COMPAT_IMAGE_API_KEY = 'sk-test-secret';
    process.env.OPENAI_COMPAT_IMAGE_MODEL = 'gpt-image-2';
    process.env.OPENAI_COMPAT_IMAGE_DISABLE_CODEX_FALLBACK = 'true';
    process.env.TUZI_API_KEY = 'sk-tuzi';
    process.env.CHAOJITUDOU_IMAGE_TASK_POLL_MS = '15000';
    process.env.CHAOJITUDOU_IMAGE_TASK_ACTIVE_POLL_BUDGET_MS = '30000';
    process.env.CHAOJITUDOU_IMAGE_TASK_DEFERRED_POLL_DELAY_MS = '12000';

    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'wtm:task-pending:initial:gpt-image-2:a1:n1:1024x1024',
              status: 'queued'
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
        )
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              items: [
                {
                  id: 'wtm:task-pending:initial:gpt-image-2:a1:n1:1024x1024',
                  status: 'running'
                }
              ],
              missing_ids: []
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
        );
      vi.stubGlobal('fetch', fetchMock);

      const sanitized = sanitizeImageGenerateInput({
        prompt: 'A slow product render',
        model: 'gpt-image-2',
        aspectRatio: '1:1',
        imageSize: '1024x1024',
        quality: 'auto',
        outputFormat: 'png',
        promptMode: 'custom',
        imageCount: 1
      });
      expect(sanitized.ok).toBe(true);
      if (!sanitized.ok) return;

      const { sb, insertedAttempts } = createImageGenerateSupabaseMock({});
      const promise = executeImageGenerationJob({
        request: new Request('https://webtomind.test/api/image/generate', {
          method: 'POST'
        }),
        userId: 'user-openai-compatible-pending',
        sb: sb as never,
        sanitizedInput: {
          ...sanitized.value,
          provider: 'openai'
        },
        options: {
          skipCreditCharge: true,
          mode: 'queued',
          taskId: 'task-pending'
        }
      });

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(30000);

      const result = await promise;
      expect(result.ok).toBe(false);
      expect(result.status).toBe(202);
      expect(result.body).toMatchObject({
        pendingProviderPoll: true,
        provider: 'openai',
        reenqueue: {
          taskId: 'task-pending',
          delaySeconds: 12
        }
      });
      expect(
        fetchMock.mock.calls.every(([url]) =>
          String(url).includes('api.chaojitudou.com/api/image-tasks')
        )
      ).toBe(true);
      expect(insertedAttempts).toHaveLength(1);
      expect(insertedAttempts[0]).toMatchObject({
        provider: 'openai',
        model: 'gpt-image-2',
        channel: 'openai-compatible',
        status: 'failed',
        error_category: 'provider_unavailable',
        error_code: 'OPENAI_COMPAT_PROVIDER_PENDING',
        provider_request_id:
          'wtm:task-pending:initial:gpt-image-2:a1:n1:1024x1024'
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips unhealthy OpenAI-compatible model fallbacks', async () => {
    process.env.GPT_IMAGE_2_ALLOW_OPENAI_COMPAT_PRIMARY = 'true';
    process.env.OPENAI_COMPAT_IMAGE_ENABLED = 'true';
    process.env.OPENAI_COMPAT_IMAGE_BASE_URL = 'https://proxy.test/v1';
    process.env.OPENAI_COMPAT_IMAGE_API_KEY = 'sk-test-secret';
    process.env.OPENAI_COMPAT_IMAGE_MODEL = 'gpt-image-2';
    process.env.OPENAI_COMPAT_IMAGE_DISABLE_TUZI_FALLBACK = 'true';

    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { message: 'resource exhausted' } }),
          {
            status: 429,
            headers: { 'content-type': 'application/json' }
          }
        )
    );
    vi.stubGlobal('fetch', fetchMock);

    const sanitized = sanitizeImageGenerateInput({
      prompt: '生成一张 9:16 竖版写真',
      model: 'gpt-image-2',
      aspectRatio: '9:16',
      imageSize: '1152x2048',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 1
    });
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;

    const { sb, insertedAttempts } = createImageGenerateSupabaseMock({
      providerHealthRows: [
        {
          provider: 'openai',
          model: 'codex-gpt-image-2',
          channel: 'openai-compatible',
          total_attempts: 8,
          succeeded_attempts: 0,
          failed_attempts: 8,
          running_attempts: 0,
          success_rate: 0,
          avg_duration_ms: 560,
          p95_duration_ms: 570,
          auth_error_count: 0,
          rate_limit_count: 0,
          timeout_count: 0,
          unavailable_count: 8,
          policy_count: 0,
          last_failure_at: '2026-06-29T02:59:37.572Z',
          last_success_at: null,
          health_score: 0,
          health_state: 'degraded',
          circuit_breaker_until: null
        }
      ]
    });
    const result = await executeImageGenerationJob({
      request: new Request('https://webtomind.test/api/image/generate', {
        method: 'POST'
      }),
      userId: 'user-skip-codex-gpt-image-2',
      sb: sb as never,
      sanitizedInput: sanitized.value,
      options: { skipCreditCharge: true }
    });

    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstFetch = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit
    ];
    expect(JSON.parse(String(firstFetch[1].body))).toMatchObject({
      model: 'gpt-image-2'
    });
    expect(insertedAttempts).toHaveLength(1);
    expect(insertedAttempts[0]).toMatchObject({
      provider: 'openai',
      model: 'gpt-image-2',
      status: 'failed',
      error_category: 'provider_rate_limit'
    });
    expect(insertedAttempts[0].metadata).toMatchObject({
      skippedFallbackModels: ['codex-gpt-image-2']
    });
  });

  it('skips unhealthy Tuzi provider fallback after OpenAI-compatible failures', async () => {
    process.env.GPT_IMAGE_2_ALLOW_OPENAI_COMPAT_PRIMARY = 'true';
    process.env.OPENAI_COMPAT_IMAGE_ENABLED = 'true';
    process.env.OPENAI_COMPAT_IMAGE_BASE_URL = 'https://proxy.test/v1';
    process.env.OPENAI_COMPAT_IMAGE_API_KEY = 'sk-test-secret';
    process.env.OPENAI_COMPAT_IMAGE_MODEL = 'gpt-image-2';
    process.env.OPENAI_COMPAT_IMAGE_DISABLE_CODEX_FALLBACK = 'true';
    process.env.TUZI_API_KEY = 'sk-tuzi';

    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { message: 'resource exhausted' } }),
          {
            status: 429,
            headers: { 'content-type': 'application/json' }
          }
        )
    );
    vi.stubGlobal('fetch', fetchMock);

    const sanitized = sanitizeImageGenerateInput({
      prompt: '生成一张 9:16 竖版写真',
      model: 'gpt-image-2',
      aspectRatio: '9:16',
      imageSize: '1152x2048',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 1
    });
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;

    const { sb, insertedAttempts, rpcCalls } = createImageGenerateSupabaseMock({
      providerHealthRows: [
        {
          provider: 'tuzi',
          model: 'gpt-image-2',
          channel: 'default',
          total_attempts: 7,
          succeeded_attempts: 0,
          failed_attempts: 7,
          running_attempts: 0,
          success_rate: 0,
          avg_duration_ms: 90001,
          p95_duration_ms: 90003,
          auth_error_count: 0,
          rate_limit_count: 0,
          timeout_count: 7,
          unavailable_count: 0,
          policy_count: 0,
          last_failure_at: '2026-06-29T02:54:42.399Z',
          last_success_at: null,
          health_score: 0,
          health_state: 'degraded',
          circuit_breaker_until: null
        }
      ]
    });
    const result = await executeImageGenerationJob({
      request: new Request('https://webtomind.test/api/image/generate', {
        method: 'POST'
      }),
      userId: 'user-skip-tuzi-fallback',
      sb: sb as never,
      sanitizedInput: sanitized.value,
      options: { skipCreditCharge: true }
    });

    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(rpcCalls).toContainEqual([
      'get_image_provider_health',
      {
        p_window: '1440 minutes',
        p_min_attempts: 1
      }
    ]);
    expect(insertedAttempts).toHaveLength(1);
    expect(insertedAttempts[0]).toMatchObject({
      provider: 'openai',
      model: 'gpt-image-2',
      status: 'failed',
      error_category: 'provider_rate_limit'
    });
  });

  it('does not fallback from OpenAI-compatible generations on policy failures', async () => {
    process.env.GPT_IMAGE_2_ALLOW_OPENAI_COMPAT_PRIMARY = 'true';
    process.env.OPENAI_COMPAT_IMAGE_ENABLED = 'true';
    process.env.OPENAI_COMPAT_IMAGE_BASE_URL = 'https://proxy.test/v1';
    process.env.OPENAI_COMPAT_IMAGE_API_KEY = 'sk-test-secret';
    process.env.OPENAI_COMPAT_IMAGE_MODEL = 'gpt-image-2';
    process.env.TUZI_API_KEY = 'sk-tuzi';

    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: 'safety blocked' } }), {
          status: 400,
          headers: { 'content-type': 'application/json' }
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const sanitized = sanitizeImageGenerateInput({
      prompt: '生成 3 张产品海报',
      model: 'gpt-image-2',
      aspectRatio: '1:1',
      imageSize: '1024x1024',
      quality: 'high',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 3
    });
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;

    const { sb, insertedAttempts } = createImageGenerateSupabaseMock({});
    const result = await executeImageGenerationJob({
      request: new Request('https://webtomind.test/api/image/generate', {
        method: 'POST'
      }),
      userId: 'user-openai-compatible',
      sanitizedInput: sanitized.value,
      sb: sb as never,
      options: {
        skipCreditCharge: true,
        pipelineDeadlineMs: 30000
      }
    });

    expect(result.ok).toBe(false);
    expect(result.failureDetails).toMatchObject({
      code: 'OPENAI_COMPAT_POLICY',
      category: 'provider_policy',
      retryable: false,
      httpStatus: 400,
      provider: 'openai',
      model: 'gpt-image-2'
    });
    expect(result.diagnostics).toMatchObject({
      requested: {
        provider: 'openai',
        model: 'gpt-image-2',
        imageCount: 3,
        imageSize: '1024x1024'
      },
      attempts: [
        {
          provider: 'openai',
          model: 'gpt-image-2',
          channel: 'openai-compatible',
          status: 'failed',
          errorCategory: 'provider_policy',
          errorCode: 'OPENAI_COMPAT_POLICY',
          httpStatus: 400,
          retryable: false
        }
      ],
      final: {
        status: 'failed',
        requestedImageCount: 3,
        failureCategory: 'provider_policy',
        failureCode: 'OPENAI_COMPAT_POLICY'
      },
      billing: {
        chargedCredits: 0,
        consumedCredits: 0,
        refundedCredits: 0,
        refundFailed: false,
        skipCreditCharge: true
      }
    });
    expect(result.body?.diagnostics).toMatchObject(result.diagnostics || {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit
    ];
    expect(url).toBe('https://proxy.test/v1/images/generations');
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'gpt-image-2',
      response_format: 'b64_json',
      output_format: 'png',
      n: 3
    });
    expect(insertedAttempts).toHaveLength(1);
    expect(insertedAttempts[0]).toMatchObject({
      provider: 'openai',
      model: 'gpt-image-2',
      channel: 'openai-compatible',
      status: 'failed',
      error_category: 'provider_policy',
      error_code: 'OPENAI_COMPAT_POLICY'
    });
    expect(insertedAttempts[0].metadata).toMatchObject({
      attemptedApiHost: 'proxy.test',
      providerVariant: 'openai-compatible',
      requestedModel: 'gpt-image-2',
      requestedImageSize: '1024x1024',
      billingCharged: true,
      skipCreditCharge: true,
      effectiveImageCount: 3,
      httpStatus: 400,
      retryable: false
    });
    expect(JSON.stringify(insertedAttempts[0])).not.toContain('sk-test-secret');
    expect(JSON.stringify(insertedAttempts[0])).not.toContain(
      'https://proxy.test/v1'
    );
  });

  it('splits queued GPT Image 2 multi-image OpenAI-compatible requests into single-image calls', async () => {
    process.env.GPT_IMAGE_2_ALLOW_OPENAI_COMPAT_PRIMARY = 'true';
    process.env.OPENAI_COMPAT_IMAGE_ENABLED = 'true';
    process.env.OPENAI_COMPAT_IMAGE_BASE_URL = 'https://proxy.test/v1';
    process.env.OPENAI_COMPAT_IMAGE_API_KEY = 'sk-test-secret';
    process.env.OPENAI_COMPAT_IMAGE_MODEL = 'gpt-image-2';
    process.env.OPENAI_COMPAT_IMAGE_DISABLE_CODEX_FALLBACK = 'true';

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ b64_json: 'iVBORw0KGgo=' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'safety blocked' } }), {
          status: 400,
          headers: { 'content-type': 'application/json' }
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const sanitized = sanitizeImageGenerateInput({
      prompt: '生成 2 张产品海报',
      model: 'gpt-image-2',
      aspectRatio: '3:4',
      imageSize: '1536x2048',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 2
    });
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;

    const { sb, insertedAttempts } = createImageGenerateSupabaseMock({});
    const result = await executeImageGenerationJob({
      request: new Request('https://webtomind.test/api/image/generate', {
        method: 'POST'
      }),
      userId: 'user-openai-compatible-queued-split',
      sanitizedInput: sanitized.value,
      sb: sb as never,
      options: {
        mode: 'queued',
        skipCreditCharge: true,
        pipelineDeadlineMs: 280000
      }
    });

    expect(result.ok).toBe(false);
    expect(result.failureDetails).toMatchObject({
      code: 'OPENAI_COMPAT_POLICY',
      category: 'provider_policy',
      retryable: false
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      expect(JSON.parse(String((call[1] as RequestInit).body))).toMatchObject({
        model: 'gpt-image-2',
        n: 1
      });
    }
    expect(insertedAttempts).toHaveLength(2);
    expect(insertedAttempts[0]).toMatchObject({
      provider: 'openai',
      model: 'gpt-image-2',
      status: 'succeeded'
    });
    expect(insertedAttempts[0].metadata).toMatchObject({
      executionRuntime: 'node',
      vercelRuntime: false,
      openAICompatibleCodexFallbackDisabled: true,
      openAICompatibleBatchMode: 'split_single_requests',
      openAICompatibleProviderBatchSize: 1,
      providerRequestImageCount: 1,
      requestedBatchImageCount: 2,
      splitBatchIndex: 1,
      splitBatchTotal: 2
    });
    expect(insertedAttempts[1]).toMatchObject({
      provider: 'openai',
      model: 'gpt-image-2',
      status: 'failed',
      error_category: 'provider_policy'
    });
    expect(insertedAttempts[1].metadata).toMatchObject({
      executionRuntime: 'node',
      vercelRuntime: false,
      openAICompatibleCodexFallbackDisabled: true,
      openAICompatibleBatchMode: 'split_single_requests',
      openAICompatibleProviderBatchSize: 1,
      providerRequestImageCount: 1,
      requestedBatchImageCount: 2,
      splitBatchIndex: 2,
      splitBatchTotal: 2
    });
  });

  it('splits chaojitudou GPT Image 2 multi-image requests into single-image calls by default', async () => {
    process.env.GPT_IMAGE_2_ALLOW_OPENAI_COMPAT_PRIMARY = 'true';
    process.env.OPENAI_COMPAT_IMAGE_ENABLED = 'true';
    process.env.OPENAI_COMPAT_IMAGE_BASE_URL = 'https://api.chaojitudou.com/v1';
    process.env.OPENAI_COMPAT_IMAGE_API_KEY = 'sk-test-secret';
    process.env.OPENAI_COMPAT_IMAGE_MODEL = 'gpt-image-2';
    process.env.OPENAI_COMPAT_IMAGE_DISABLE_CODEX_FALLBACK = 'true';

    const fetchMock = createChaojitudouAsyncTaskFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    const sanitized = sanitizeImageGenerateInput({
      prompt: '生成 3 张产品海报',
      model: 'gpt-image-2',
      aspectRatio: '3:4',
      imageSize: '1536x2048',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 3
    });
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;

    const { sb, insertedAttempts } = createImageGenerateSupabaseMock({});
    const result = await executeImageGenerationJob({
      request: new Request('https://webtomind.test/api/image/generate', {
        method: 'POST'
      }),
      userId: 'user-openai-compatible-chaojitudou-batch',
      sanitizedInput: sanitized.value,
      sb: sb as never,
      options: {
        mode: 'queued',
        skipCreditCharge: true,
        pipelineDeadlineMs: 280000
      }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload?.images).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    const submitCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/api/image-tasks/generations')
    );
    expect(submitCalls).toHaveLength(3);
    for (const call of submitCalls) {
      const [, chaojitudouRequest] = call as unknown as [string, RequestInit];
      const body = JSON.parse(String(chaojitudouRequest.body));
      expect(body).toMatchObject({
        model: 'gpt-image-2',
        prompt: '生成 3 张产品海报'
      });
      expect(body.client_task_id).toMatch(/^webtomind-/);
      expect(body).not.toHaveProperty('n');
    }
    expect(insertedAttempts).toHaveLength(3);
    expect(
      insertedAttempts.every((attempt) => attempt.status === 'succeeded')
    ).toBe(true);
    expect(insertedAttempts[0].metadata).toMatchObject({
      openAICompatibleBatchMode: 'split_single_requests',
      openAICompatibleProviderBatchSize: 1,
      providerRequestImageCount: 1,
      requestedBatchImageCount: 3,
      splitBatchIndex: 1,
      splitBatchTotal: 3
    });
  });

  it('keeps chaojitudou GPT Image 2 two-image batches in one provider attempt when batch size is configured', async () => {
    process.env.GPT_IMAGE_2_ALLOW_OPENAI_COMPAT_PRIMARY = 'true';
    process.env.OPENAI_COMPAT_IMAGE_ENABLED = 'true';
    process.env.OPENAI_COMPAT_IMAGE_BASE_URL = 'https://api.chaojitudou.com/v1';
    process.env.OPENAI_COMPAT_IMAGE_API_KEY = 'sk-test-secret';
    process.env.OPENAI_COMPAT_IMAGE_MODEL = 'gpt-image-2';
    process.env.OPENAI_COMPAT_IMAGE_DISABLE_CODEX_FALLBACK = 'true';
    process.env.OPENAI_COMPAT_IMAGE_BATCH_SIZE = '2';
    process.env.OPENAI_COMPAT_IMAGE_STREAMING_ENABLED = 'true';
    process.env.OPENAI_COMPAT_IMAGE_STREAMING_ALLOW_CHAO = 'true';
    process.env.OPENAI_COMPAT_IMAGE_PARTIAL_IMAGES = '2';

    const fetchMock = createChaojitudouAsyncTaskFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    const sanitized = sanitizeImageGenerateInput({
      prompt: '生成 2 张产品海报',
      model: 'gpt-image-2',
      aspectRatio: '3:4',
      imageSize: '1536x2048',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 2
    });
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;

    const { sb, insertedAttempts } = createImageGenerateSupabaseMock({});
    const result = await executeImageGenerationJob({
      request: new Request('https://webtomind.test/api/image/generate', {
        method: 'POST'
      }),
      userId: 'user-openai-compatible-chaojitudou-batch-two',
      sanitizedInput: sanitized.value,
      sb: sb as never,
      options: {
        mode: 'queued',
        skipCreditCharge: true,
        pipelineDeadlineMs: 280000
      }
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const submitCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/api/image-tasks/generations')
    );
    expect(submitCalls).toHaveLength(2);
    const firstBody = JSON.parse(String(submitCalls[0][1]?.body));
    expect(firstBody).toMatchObject({
      model: 'gpt-image-2',
      prompt: '生成 2 张产品海报'
    });
    expect(firstBody).not.toHaveProperty('stream');
    expect(firstBody).not.toHaveProperty('partial_images');
    expect(firstBody).not.toHaveProperty('n');
    expect(insertedAttempts[0].metadata).toMatchObject({
      openAICompatibleBatchMode: 'single_request',
      openAICompatibleProviderBatchSize: 2,
      openAICompatibleStreamingRequested: true,
      providerRequestImageCount: 2,
      requestedBatchImageCount: 2,
      splitBatchIndex: null,
      splitBatchTotal: null
    });
  });

  it('upscales undersized chaojitudou outputs through Cloudflare image resizing', async () => {
    process.env.GPT_IMAGE_2_ALLOW_OPENAI_COMPAT_PRIMARY = 'true';
    process.env.OPENAI_COMPAT_IMAGE_ENABLED = 'true';
    process.env.OPENAI_COMPAT_IMAGE_BASE_URL = 'https://api.chaojitudou.com/v1';
    process.env.OPENAI_COMPAT_IMAGE_API_KEY = 'sk-test-secret';
    process.env.OPENAI_COMPAT_IMAGE_MODEL = 'gpt-image-2';
    process.env.OPENAI_COMPAT_IMAGE_DISABLE_CODEX_FALLBACK = 'true';
    process.env.WEBTOMIND_IMAGE_RUNTIME = 'cloudflare-worker';
    process.env.IMAGE_CLOUDFLARE_UPSCALE_ENABLED = 'true';

    const outputMock = vi.fn(async () => ({
      response: () =>
        new Response(makePngArrayBuffer(1536, 2048), {
          status: 200,
          headers: { 'content-type': 'image/png' }
        })
    }));
    const transformMock = vi.fn(() => ({ output: outputMock }));
    const inputMock = vi.fn(() => ({ transform: transformMock }));
    (
      globalThis as typeof globalThis & {
        __WEBTOMIND_CLOUDFLARE_IMAGES?: unknown;
      }
    ).__WEBTOMIND_CLOUDFLARE_IMAGES = { input: inputMock };

    const fetchMock = createChaojitudouAsyncTaskFetchMock(() =>
      makePngBase64(1086, 1448)
    );
    vi.stubGlobal('fetch', fetchMock);

    const sanitized = sanitizeImageGenerateInput({
      prompt: '生成 1 张产品海报',
      model: 'gpt-image-2',
      aspectRatio: '3:4',
      imageSize: '1536x2048',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 1
    });
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;

    const { sb, insertedGenerations } = createImageGenerateSupabaseMock({});
    const result = await executeImageGenerationJob({
      request: new Request('https://webtomind.test/api/image/generate', {
        method: 'POST'
      }),
      userId: 'user-openai-compatible-chaojitudou-upscale',
      sanitizedInput: sanitized.value,
      sb: sb as never,
      options: {
        mode: 'queued',
        skipCreditCharge: true,
        pipelineDeadlineMs: 280000
      }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload?.images).toHaveLength(1);
    expect(result.payload?.images[0]).toMatchObject({
      width: 1536,
      height: 2048
    });
    expect(result.payload?.images[0]?.storagePath).toContain('-upscaled.png');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(inputMock).toHaveBeenCalledTimes(1);
    expect(transformMock).toHaveBeenCalledWith({
      width: 1536,
      height: 2048,
      fit: 'cover'
    });
    expect(outputMock).toHaveBeenCalledWith({
      format: 'image/png'
    });
    expect(insertedGenerations[0]?.metadata).toMatchObject({
      providerOriginalWidth: 1086,
      providerOriginalHeight: 1448,
      requestedOutputSize: '1536x2048',
      outputImageSizeConformed: true,
      cloudflareUpscaled: true,
      cloudflareUpscaleSourceWidth: 1086,
      cloudflareUpscaleSourceHeight: 1448,
      cloudflareUpscaleTargetWidth: 1536,
      cloudflareUpscaleTargetHeight: 2048,
      width: 1536,
      height: 2048
    });
  });

  it('keeps chaojitudou as primary when provider health is degraded but not exhausted', async () => {
    process.env.GPT_IMAGE_2_ALLOW_OPENAI_COMPAT_PRIMARY = 'true';
    process.env.OPENAI_COMPAT_IMAGE_ENABLED = 'true';
    process.env.OPENAI_COMPAT_IMAGE_BASE_URL = 'https://api.chaojitudou.com/v1';
    process.env.OPENAI_COMPAT_IMAGE_API_KEY = 'sk-test-secret';
    process.env.OPENAI_COMPAT_IMAGE_MODEL = 'gpt-image-2';
    process.env.OPENAI_COMPAT_IMAGE_DISABLE_CODEX_FALLBACK = 'true';
    process.env.OPENAI_COMPAT_IMAGE_BATCH_SIZE = '2';
    process.env.KRILL_IMAGE_API_KEY = 'sk-krill';

    const fetchMock = createChaojitudouAsyncTaskFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    const sanitized = sanitizeImageGenerateInput({
      prompt: '生成 2 张产品海报',
      model: 'gpt-image-2',
      aspectRatio: '3:4',
      imageSize: '1536x2048',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 2
    });
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;
    expect(sanitized.value.provider).toBe('openai');

    const { sb, insertedAttempts } = createImageGenerateSupabaseMock({
      providerHealthRows: [
        {
          provider: 'openai',
          model: 'gpt-image-2',
          channel: 'openai-compatible',
          total_attempts: 6,
          succeeded_attempts: 1,
          failed_attempts: 5,
          running_attempts: 0,
          success_rate: 0.1667,
          avg_duration_ms: 220000,
          p95_duration_ms: 260000,
          auth_error_count: 0,
          rate_limit_count: 0,
          timeout_count: 4,
          unavailable_count: 1,
          policy_count: 0,
          last_failure_at: '2026-06-29T08:59:37.572Z',
          last_success_at: '2026-06-29T08:35:37.572Z',
          health_score: 40,
          health_state: 'degraded',
          circuit_breaker_until: null
        }
      ]
    });
    const result = await executeImageGenerationJob({
      request: new Request('https://webtomind.test/api/image/generate', {
        method: 'POST'
      }),
      userId: 'user-krill-health-fallback',
      sanitizedInput: sanitized.value,
      sb: sb as never,
      options: {
        mode: 'queued',
        skipCreditCharge: true,
        pipelineDeadlineMs: 280000
      }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload?.images).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const [url, openAICompatibleRequest] = fetchMock.mock
      .calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('api.chaojitudou.com');
    expect(JSON.parse(String(openAICompatibleRequest.body))).toMatchObject({
      model: 'gpt-image-2'
    });
    expect(JSON.parse(String(openAICompatibleRequest.body))).not.toHaveProperty(
      'n'
    );
    expect(insertedAttempts).toHaveLength(1);
    expect(insertedAttempts[0]).toMatchObject({
      provider: 'openai',
      model: 'gpt-image-2',
      channel: 'openai-compatible',
      status: 'succeeded'
    });
  });

  it('skips an exhausted OpenAI-compatible route and sends 2K work to the Krill 2K model', async () => {
    process.env.GPT_IMAGE_2_ALLOW_OPENAI_COMPAT_PRIMARY = 'true';
    process.env.OPENAI_COMPAT_IMAGE_ENABLED = 'true';
    process.env.OPENAI_COMPAT_IMAGE_BASE_URL = 'https://proxy.test/v1';
    process.env.OPENAI_COMPAT_IMAGE_API_KEY = 'sk-openai';
    process.env.OPENAI_COMPAT_IMAGE_MODEL = 'gpt-image-2';
    process.env.KRILL_IMAGE_API_KEY = 'sk-krill';
    process.env.KRILL_IMAGE_2K_ENABLED = 'true';

    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [{ b64_json: makePngBase64(1152, 2048) }]
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        )
    );
    vi.stubGlobal('fetch', fetchMock);

    const sanitized = sanitizeImageGenerateInput({
      prompt: '生成一张 2K 产品海报',
      model: 'gpt-image-2',
      aspectRatio: '9:16',
      imageSize: '1152x2048',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 1
    });
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;

    const { sb, insertedAttempts } = createImageGenerateSupabaseMock({
      providerHealthRows: [
        {
          provider: 'openai',
          model: 'gpt-image-2',
          channel: 'openai-compatible',
          total_attempts: 3,
          succeeded_attempts: 0,
          failed_attempts: 3,
          running_attempts: 0,
          success_rate: 0,
          avg_duration_ms: 2000,
          p95_duration_ms: 2000,
          auth_error_count: 0,
          rate_limit_count: 3,
          timeout_count: 0,
          unavailable_count: 0,
          policy_count: 0,
          last_failure_at: '2026-08-06T00:00:00.000Z',
          last_success_at: null,
          health_score: 30,
          health_state: 'degraded',
          circuit_breaker_until: null
        }
      ]
    });

    const result = await executeImageGenerationJob({
      request: new Request('https://webtomind.test/api/image/generate', {
        method: 'POST'
      }),
      userId: 'user-krill-2k-fallback',
      sanitizedInput: sanitized.value,
      sb: sb as never,
      options: {
        mode: 'queued',
        skipCreditCharge: true,
        pipelineDeadlineMs: 280000
      }
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit
    ];
    expect(url).toBe('https://api.krill-ai.com/v1/images/generations');
    expect(JSON.parse(String(request.body))).toMatchObject({
      model: 'gpt-image-2-2k',
      size: '1152x2048',
      quality: 'high'
    });
    expect(insertedAttempts).toHaveLength(1);
    expect(insertedAttempts[0]).toMatchObject({
      provider: 'krill',
      model: 'gpt-image-2-2k',
      channel: 'drawing',
      status: 'succeeded'
    });
  });

  it('skips Krill fallback after Krill authentication failures are observed', async () => {
    process.env.GPT_IMAGE_2_ALLOW_OPENAI_COMPAT_PRIMARY = 'true';
    process.env.OPENAI_COMPAT_IMAGE_ENABLED = 'true';
    process.env.OPENAI_COMPAT_IMAGE_BASE_URL = 'https://api.chaojitudou.com/v1';
    process.env.OPENAI_COMPAT_IMAGE_API_KEY = 'sk-test-secret';
    process.env.OPENAI_COMPAT_IMAGE_MODEL = 'gpt-image-2';
    process.env.OPENAI_COMPAT_IMAGE_DISABLE_CODEX_FALLBACK = 'true';
    process.env.OPENAI_COMPAT_IMAGE_DISABLE_TUZI_FALLBACK = 'true';
    process.env.KRILL_IMAGE_API_KEY = 'sk-krill';
    process.env.KRILL_IMAGE_2K_ENABLED = 'true';

    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { message: 'error code: 524' } }),
          {
            status: 524,
            headers: { 'content-type': 'application/json' }
          }
        )
    );
    vi.stubGlobal('fetch', fetchMock);

    const sanitized = sanitizeImageGenerateInput({
      prompt: '生成一张产品海报',
      model: 'gpt-image-2',
      aspectRatio: '3:4',
      imageSize: '1536x2048',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 1
    });
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;

    const { sb, insertedAttempts } = createImageGenerateSupabaseMock({
      providerHealthRows: [
        {
          provider: 'krill',
          model: 'gpt-image-2-2k',
          channel: 'drawing',
          total_attempts: 1,
          succeeded_attempts: 0,
          failed_attempts: 1,
          running_attempts: 0,
          success_rate: 0,
          avg_duration_ms: 1291,
          p95_duration_ms: 1291,
          auth_error_count: 1,
          rate_limit_count: 0,
          timeout_count: 0,
          unavailable_count: 0,
          policy_count: 0,
          last_failure_at: '2026-07-03T06:23:41.687Z',
          last_success_at: null,
          health_score: 0,
          health_state: 'degraded',
          circuit_breaker_until: null
        }
      ]
    });
    const result = await executeImageGenerationJob({
      request: new Request('https://webtomind.test/api/image/generate', {
        method: 'POST'
      }),
      userId: 'user-skip-bad-krill-fallback',
      sanitizedInput: sanitized.value,
      sb: sb as never,
      options: {
        mode: 'queued',
        skipCreditCharge: true,
        pipelineDeadlineMs: 120000
      }
    });

    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(insertedAttempts).toHaveLength(1);
    expect(insertedAttempts[0]).toMatchObject({
      provider: 'openai',
      channel: 'openai-compatible',
      status: 'failed',
      error_category: 'provider_unavailable'
    });
  });

  it('uses OpenAI-compatible rescue for ordinary queued multi-image jobs', async () => {
    process.env.GPT_IMAGE_2_ALLOW_OPENAI_COMPAT_PRIMARY = 'true';
    process.env.OPENAI_COMPAT_IMAGE_ENABLED = 'true';
    process.env.OPENAI_COMPAT_IMAGE_BASE_URL = 'https://proxy.test/v1';
    process.env.OPENAI_COMPAT_IMAGE_API_KEY = 'sk-test-secret';
    process.env.OPENAI_COMPAT_IMAGE_MODEL = 'gpt-image-2';
    process.env.OPENAI_COMPAT_IMAGE_DISABLE_CODEX_FALLBACK = 'true';
    process.env.TUZI_API_KEY = 'sk-tuzi';

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { message: 'provider timeout' } }),
          {
            status: 524,
            headers: { 'content-type': 'application/json' }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ b64_json: 'iVBORw0KGgo=' }]
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ b64_json: 'iVBORw0KGgo=' }]
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    const sanitized = sanitizeImageGenerateInput({
      prompt: '生成 2 张产品海报',
      model: 'gpt-image-2',
      aspectRatio: '3:4',
      imageSize: '1536x2048',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 2
    });
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;

    const { sb, insertedAttempts } = createImageGenerateSupabaseMock({});
    const result = await executeImageGenerationJob({
      request: new Request('https://webtomind.test/api/image/generate', {
        method: 'POST'
      }),
      userId: 'user-openai-compatible-rescue-supplement',
      sanitizedInput: sanitized.value,
      sb: sb as never,
      options: {
        mode: 'queued',
        skipCreditCharge: true,
        pipelineDeadlineMs: 280000
      }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const payload = result.payload;
    expect(payload).toBeDefined();
    if (!payload) return;
    expect(payload).toMatchObject({
      imageCount: 2,
      requestedImageCount: 2,
      actualImageCount: 2,
      refunded: 0,
      provider: 'tuzi',
      diagnostics: {
        requested: {
          provider: 'openai',
          model: 'gpt-image-2',
          imageCount: 2,
          imageSize: '1536x2048'
        },
        attempts: [
          {
            provider: 'openai',
            status: 'failed',
            phase: 'initial'
          },
          {
            provider: 'tuzi',
            status: 'succeeded',
            phase: 'initial_rescue_batch',
            effectiveImageCount: 1,
            rescueProvider: 'tuzi'
          },
          {
            provider: 'tuzi',
            status: 'succeeded',
            phase: 'supplemental',
            effectiveImageCount: 1
          }
        ],
        final: {
          status: 'succeeded',
          provider: 'tuzi',
          model: 'gpt-image-2',
          imageCount: 2,
          requestedImageCount: 2,
          imageSize: '1536x2048',
          usedSingleImageRescue: true
        },
        billing: {
          chargedCredits: 0,
          consumedCredits: 0,
          refundedCredits: 0,
          refundFailed: false,
          skipCreditCharge: true
        }
      }
    });
    expect(payload.images).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))
    ).toMatchObject({ model: 'gpt-image-2', n: 1 });
    expect(
      JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body))
    ).toMatchObject({ model: 'gpt-image-2', n: 2 });
    expect(
      JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body))
    ).toHaveProperty('group', 'default');
    expect(
      JSON.parse(String((fetchMock.mock.calls[2]?.[1] as RequestInit).body))
    ).toMatchObject({ model: 'gpt-image-2', n: 1 });
    expect(
      JSON.parse(String((fetchMock.mock.calls[2]?.[1] as RequestInit).body))
    ).toHaveProperty('group', 'default');
    expect(insertedAttempts.map((attempt) => attempt.status)).toEqual([
      'failed',
      'succeeded',
      'succeeded'
    ]);
    expect(insertedAttempts.map((attempt) => attempt.provider)).toEqual([
      'openai',
      'tuzi',
      'tuzi'
    ]);
    expect(insertedAttempts[1].metadata).toMatchObject({
      phase: 'initial_rescue_batch',
      originalRequestedImageCount: 2,
      rescueProvider: 'tuzi',
      rescueImageCount: 2,
      effectiveImageCount: 1
    });
  });

  it('uses OpenAI-compatible edits with multiple reference images', async () => {
    process.env.GPT_IMAGE_2_ALLOW_OPENAI_COMPAT_PRIMARY = 'true';
    process.env.OPENAI_COMPAT_IMAGE_ENABLED = 'true';
    process.env.OPENAI_COMPAT_IMAGE_BASE_URL = 'https://proxy.test/v1';
    process.env.OPENAI_COMPAT_IMAGE_API_KEY = 'sk-test-secret';
    process.env.OPENAI_COMPAT_IMAGE_MODEL = 'gpt-image-2';
    process.env.OPENAI_COMPAT_IMAGE_SUPPORTS_EDITS = 'true';

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/png' }
        })
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([4, 5, 6]), {
          status: 200,
          headers: { 'content-type': 'image/png' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'safety blocked' } }), {
          status: 400,
          headers: { 'content-type': 'application/json' }
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const sanitized = sanitizeImageGenerateInput({
      prompt: '参考两张图生成 2 张风格一致的海报',
      model: 'gpt-image-2',
      aspectRatio: '1:1',
      imageSize: '1024x1024',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 2,
      referenceImageIds: ['ref-a', 'ref-b']
    });
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;

    const { sb, insertedAttempts } = createImageGenerateSupabaseMock({
      references: [{ id: 'ref-a' }, { id: 'ref-b' }]
    });
    const result = await executeImageGenerationJob({
      request: new Request('https://webtomind.test/api/image/generate', {
        method: 'POST'
      }),
      userId: 'user-openai-compatible',
      sanitizedInput: sanitized.value,
      sb: sb as never,
      options: {
        skipCreditCharge: true,
        pipelineDeadlineMs: 30000
      }
    });

    expect(result.ok).toBe(false);
    expect(result.failureDetails).toMatchObject({
      code: 'OPENAI_COMPAT_POLICY',
      category: 'provider_policy',
      retryable: false,
      httpStatus: 400
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe('https://refs.test/ref-a.png');
    expect(fetchMock.mock.calls[1][0]).toBe('https://refs.test/ref-b.png');
    const [url, init] = fetchMock.mock.calls[2] as unknown as [
      string,
      RequestInit
    ];
    expect(url).toBe('https://proxy.test/v1/images/edits');
    expect(init.body).toBeInstanceOf(FormData);
    const formData = init.body as FormData;
    expect(formData.get('response_format')).toBe('b64_json');
    expect(formData.get('n')).toBe('2');
    expect(formData.getAll('image')).toHaveLength(2);
    expect(insertedAttempts[0]).toMatchObject({
      provider: 'openai',
      channel: 'openai-compatible',
      error_category: 'provider_policy',
      error_code: 'OPENAI_COMPAT_POLICY'
    });
  });

  it('runs cloud denoise with a deterministic guide and one explicitly labeled Nano Banana 2 restoration', async () => {
    process.env.TUZI_API_KEY = 'sk-tuzi';
    process.env.TUZI_API_BASE_URL = 'https://api.tu-zi.com/v1/';
    process.env.TUZI_IMAGE_CHANNEL_ORDER = 'default';
    process.env.TUZI_DISABLED_IMAGE_CHANNELS =
      'official_discount,official,openai_original';
    process.env.TUZI_IMAGE_API_MODEL_NANO_BANANA_2 =
      'gemini-3.1-flash-image-preview';
    process.env.WEBTOMIND_IMAGE_RUNTIME = 'cloudflare-worker';
    process.env.IMAGE_CLOUDFLARE_UPSCALE_ENABLED = 'true';
    const guideTransform = installCloudflareDenoiseGuideTransformMock(
      1152,
      2048
    );

    const sanitized = sanitizeImageGenerateInput({
      prompt: buildCloudDenoiseRestorationPrompt('standard'),
      model: 'nano-banana-2',
      aspectRatio: 'auto',
      imageSize: '1152x2048',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 1,
      referenceImageIds: ['source-ref'],
      referenceMode: 'image_reference',
      appSlug: 'gpt-image-2-denoiser',
      appOperation: 'gpt-image-2-denoise',
      sourceApp: 'gpt-image-2-denoiser'
    });
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;

    const providerBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith('https://refs.test/')) {
          return new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: { 'content-type': 'image/png' }
          });
        }
        expect(url).toBe('https://api.tu-zi.com/v1/images/generations');
        const body = JSON.parse(String(init?.body || '{}')) as Record<
          string,
          unknown
        >;
        providerBodies.push(body);
        return new Response(
          JSON.stringify({
            data: [{ b64_json: makePngBase64(768, 1376) }]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      })
    );

    const {
      sb,
      insertedAttempts,
      insertedGenerations,
      uploadedStoragePaths,
      removedStoragePaths
    } = createImageGenerateSupabaseMock({
      references: [{ id: 'source-ref' }]
    });
    const result = await executeImageGenerationJob({
      request: new Request('https://webtomind.test/api/image/task'),
      userId: 'denoise-user',
      sanitizedInput: {
        ...sanitized.value,
        provider: 'tuzi',
        sourceApp: undefined
      },
      sb: sb as never,
      options: {
        mode: 'queued',
        taskId: 'denoise-task-deterministic-guide',
        cloudDenoiseTask: true,
        pipelineDeadlineMs: 300_000,
        tuziVipTimeoutMs: 260_000,
        disableProviderFallback: true,
        prepaidCredit: {
          consumed: 100,
          creditType: 'media'
        }
      }
    });

    expect(result.ok).toBe(true);
    expect(result.payload?.modelLabel).toBe('Nano Banana 2');
    expect(result.payload?.credits).toMatchObject({
      consumed: 100,
      unitCost: 100,
      requestedCost: 100
    });
    expect(guideTransform.transforms).toEqual([
      {
        saturation: 0,
        blur: 2,
        contrast: 1.08,
        brightness: 1.03
      },
      {
        width: 1152,
        height: 2048,
        fit: 'cover'
      }
    ]);
    expect(guideTransform.outputs).toEqual([
      { format: 'image/webp', quality: 72 },
      { format: 'image/png' }
    ]);
    expect(providerBodies).toHaveLength(1);
    expect(providerBodies[0]).toMatchObject({
      model: 'gemini-3.1-flash-image-preview',
      n: 1,
      size: '1152x2048'
    });
    expect(providerBodies[0].prompt).toContain(
      'The FIRST uploaded image is ORIGINAL_REFERENCE'
    );
    expect(providerBodies[0].prompt).toContain(
      'The SECOND uploaded image is STRUCTURE_GUIDE'
    );
    expect(providerBodies[0].image).toEqual([
      'https://refs.test/source-ref.png',
      expect.stringMatching(/^https:\/\/refs\.test\/denoise-user\//u)
    ]);
    expect(insertedAttempts).toHaveLength(1);
    expect(insertedAttempts[0].metadata).toMatchObject({
      phase: 'denoise_dual_reference_restore',
      denoiseStage: 1,
      referenceOrder: ['original', 'structure_guide'],
      guideMode: 'deterministic_cloudflare_images_v1',
      transport: 'tuzi_images_generations_json'
    });
    expect(insertedGenerations).toHaveLength(1);
    expect(result.payload?.images[0]).toMatchObject({
      width: 1152,
      height: 2048
    });
    expect(result.payload?.images[0]?.storagePath).toContain('-upscaled.png');
    expect(insertedGenerations[0]?.metadata).toMatchObject({
      providerOriginalWidth: 768,
      providerOriginalHeight: 1376,
      requestedOutputSize: '1152x2048',
      outputImageSizeConformed: true,
      cloudflareUpscaled: true,
      cloudflareUpscaleTargetWidth: 1152,
      cloudflareUpscaleTargetHeight: 2048,
      width: 1152,
      height: 2048
    });
    expect(uploadedStoragePaths).toHaveLength(3);
    expect(removedStoragePaths).toHaveLength(2);
  });

  it('fails closed without generic model rescue and refunds all 100 credits when Tuzi dual-reference restoration fails', async () => {
    process.env.TUZI_API_KEY = 'sk-tuzi';
    process.env.TUZI_IMAGE_CHANNEL_ORDER = 'default';
    process.env.TUZI_DISABLED_IMAGE_CHANNELS =
      'official_discount,official,openai_original';
    installCloudflareDenoiseGuideTransformMock();

    const sanitized = sanitizeImageGenerateInput({
      prompt: buildCloudDenoiseRestorationPrompt('standard'),
      model: 'nano-banana-2',
      aspectRatio: 'auto',
      imageSize: '1024x1536',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 1,
      referenceImageIds: ['source-ref'],
      referenceMode: 'image_reference',
      appSlug: 'gpt-image-2-denoiser',
      appOperation: 'gpt-image-2-denoise',
      sourceApp: 'gpt-image-2-denoiser'
    });
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;

    let providerCall = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith('https://refs.test/')) {
          return new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: { 'content-type': 'image/png' }
          });
        }
        expect(url).toContain('/v1/images/generations');
        const requestBody = JSON.parse(String(init?.body || '{}'));
        expect(requestBody).toMatchObject({
          model: 'gemini-3.1-flash-image-preview',
          image: [
            'https://refs.test/source-ref.png',
            expect.stringMatching(/^https:\/\/refs\.test\/denoise-user\//u)
          ]
        });
        providerCall += 1;
        return new Response(
          JSON.stringify({
            error: {
              message: 'invalid JSON request body'
            }
          }),
          { status: 400, headers: { 'content-type': 'application/json' } }
        );
      })
    );

    const {
      sb,
      insertedAttempts,
      insertedGenerations,
      uploadedStoragePaths,
      removedStoragePaths
    } = createImageGenerateSupabaseMock({
      references: [{ id: 'source-ref' }]
    });
    const result = await executeImageGenerationJob({
      request: new Request('https://webtomind.test/api/image/task'),
      userId: 'denoise-user',
      sanitizedInput: {
        ...sanitized.value,
        provider: 'tuzi',
        sourceApp: undefined
      },
      sb: sb as never,
      options: {
        mode: 'queued',
        taskId: 'denoise-task-stage-two-failure',
        cloudDenoiseTask: true,
        pipelineDeadlineMs: 300_000,
        prepaidCredit: {
          consumed: 100,
          creditType: 'media'
        }
      }
    });

    expect(result.ok).toBe(false);
    expect(result.failureDetails).toMatchObject({
      category: 'provider_http',
      provider: 'tuzi',
      model: 'gemini-3.1-flash-image-preview'
    });
    expect(result.failureReason).toContain('invalid JSON request body');
    expect(result.refundFailed).toBe(false);
    expect(providerCall).toBe(1);
    expect(insertedAttempts).toHaveLength(1);
    expect(insertedGenerations).toHaveLength(0);
    expect(uploadedStoragePaths).toHaveLength(1);
    expect(removedStoragePaths).toHaveLength(1);
    expect(sb.rpc).toHaveBeenCalledWith(
      'refund_gpt_image_2_denoise_credits_v3',
      expect.objectContaining({
        p_user_id: 'denoise-user',
        p_amount: 100,
        p_credit_type: 'media',
        p_source: 'denoise_task:denoise-task-stage-two-failure:refund'
      })
    );
  });

  it('refunds all 100 prepaid denoise credits when reference resolution fails before provider execution', async () => {
    const sanitized = sanitizeImageGenerateInput({
      prompt: 'Preserve the image and remove generation noise.',
      model: 'nano-banana-2',
      aspectRatio: 'auto',
      imageSize: 'auto',
      quality: 'high',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 1,
      referenceImageIds: ['missing-ref'],
      referenceMode: 'image_reference',
      editInstruction: 'Preserve composition and remove noise.',
      editMode: 'context_locked',
      appSlug: 'gpt-image-2-denoiser',
      appOperation: 'gpt-image-2-denoise',
      sourceApp: 'gpt-image-2-denoiser'
    });
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;

    const { sb } = createImageGenerateSupabaseMock({
      references: [{ id: 'missing-ref' }],
      referenceSignedUrlError: 'object not found'
    });
    const result = await executeImageGenerationJob({
      request: new Request('https://webtomind.test/api/image/task', {
        method: 'GET'
      }),
      userId: 'denoise-user',
      sanitizedInput: {
        ...sanitized.value,
        appSlug: 'gpt-image-2-denoiser',
        appOperation: 'gpt-image-2-denoise',
        sourceApp: 'gpt-image-2-denoiser'
      },
      sb: sb as never,
      options: {
        mode: 'queued',
        taskId: 'denoise-task-failure',
        prepaidCredit: {
          consumed: 100,
          creditType: 'media',
          creditBreakdown: {
            daily: 0,
            subscription: 0,
            bonus: 0,
            media: 100,
            promoMedia: 0
          }
        }
      }
    });

    expect(result.ok).toBe(false);
    expect(result.refundFailed).toBe(false);
    expect(result.diagnostics?.billing).toMatchObject({
      chargedCredits: 100,
      consumedCredits: 0,
      refundedCredits: 100,
      creditType: 'media',
      refundFailed: false,
      prepaid: true
    });
    expect(sb.rpc).toHaveBeenCalledWith(
      'refund_gpt_image_2_denoise_credits_v3',
      {
        p_user_id: 'denoise-user',
        p_amount: 100,
        p_credit_type: 'media',
        p_source: 'denoise_task:denoise-task-failure:refund',
        p_metadata: expect.objectContaining({
          taskId: 'denoise-task-failure',
          appOperation: 'gpt-image-2-denoise',
          billingPhase: 'generation_failure_refund',
          creditBreakdown: expect.objectContaining({ media: 100 })
        })
      }
    );
  });

  it('uses gpt-image-2 as the default Tuzi image model', () => {
    delete process.env.TUZI_IMAGE_MODEL;
    delete process.env.TUZI_IMAGE_FALLBACK_MODELS;
    delete process.env.TUZI_FALLBACK_IMAGE_MODEL;

    expect(getTuziImageModelCandidates()).toEqual(['gpt-image-2']);
  });

  it('deduplicates explicit fallback model lists', () => {
    process.env.TUZI_IMAGE_MODEL = 'gpt-image-2-vip';
    process.env.TUZI_IMAGE_FALLBACK_MODELS =
      'gpt-image-2-vip, gpt-image-2, gpt-image-2';

    expect(getTuziImageModelCandidates()).toEqual(['gpt-image-2']);
  });

  it('normalizes unavailable gpt-image-2-vip overrides back to gpt-image-2', () => {
    process.env.TUZI_IMAGE_MODEL = 'gpt-image-2';
    process.env.TUZI_IMAGE_FALLBACK_MODELS = 'gpt-image-2-vip';
    delete process.env.TUZI_FALLBACK_IMAGE_MODEL;

    expect(getTuziImageModelCandidates()).toEqual(['gpt-image-2']);
  });

  it('does not silently substitute GPT Image 2 for a selected non-GPT model', () => {
    process.env.TUZI_IMAGE_MODEL = 'gpt-image-2';
    process.env.TUZI_IMAGE_FALLBACK_MODELS = 'gpt-image-2';

    expect(getTuziImageModelCandidates('seedream-5-lite')).toEqual([
      'seedream-5-lite'
    ]);
    expect(getTuziImageModelCandidates('wan-image-2-7-pro')).toEqual([
      'wan-image-2-7-pro'
    ]);
  });

  it('gates GPT Image 2.5 Tuzi routes and preserves each exact upstream model id', () => {
    process.env.TUZI_API_KEY = 'sk-default';

    expect(getTuziImageAttemptPlanSummary('gpt-image-2.5')).toEqual([]);

    process.env.TUZI_GPT_IMAGE_25_ENABLED = 'true';
    expect(getTuziImageAttemptPlanSummary('gpt-image-2.5')).toEqual([
      { model: 'gpt-image-2.5', channel: 'default' }
    ]);
    expect(getTuziSingleImageRescueAttemptPlanCount('gpt-image-2.5')).toBe(1);
    expect(getTuziSingleImageRescueDiagnostics('gpt-image-2.5')).toMatchObject({
      attemptPlanCount: 1
    });
  });

  it('uses the configured Chaojitudou legacy alias for logical GPT Image 2.5 without an allowlist', () => {
    process.env.OPENAI_COMPAT_IMAGE_ENABLED = 'true';
    process.env.OPENAI_COMPAT_IMAGE_BASE_URL = 'https://api.chaojitudou.com/v1';
    process.env.OPENAI_COMPAT_IMAGE_API_KEY = 'chao-key';
    process.env.OPENAI_COMPAT_IMAGE_MODEL = 'gpt-image-2';

    const gptImage25Input = {
      imageCount: 1,
      imageSize: '1024x1024',
      model: 'gpt-image-2.5' as const
    };
    expect(getImageProviderFallbackChain('tuzi', gptImage25Input)).toEqual([
      'openai'
    ]);
    expect(getOpenAICompatibleImageModel(gptImage25Input as never)).toBe(
      'gpt-image-2'
    );

    for (const unsupportedAlias of [
      'codex-gpt-image-2',
      'pro-codex-gpt-image-2'
    ]) {
      process.env.OPENAI_COMPAT_IMAGE_MODEL = unsupportedAlias;
      expect(getImageProviderFallbackChain('tuzi', gptImage25Input)).toEqual(
        []
      );
    }
  });

  it('persists logical GPT Image 2.5 while Chaojitudou attempts retain the provider alias', async () => {
    process.env.OPENAI_COMPAT_IMAGE_ENABLED = 'true';
    process.env.OPENAI_COMPAT_IMAGE_BASE_URL = 'https://api.chaojitudou.com/v1';
    process.env.OPENAI_COMPAT_IMAGE_API_KEY = 'chao-key';
    process.env.OPENAI_COMPAT_IMAGE_MODEL = 'gpt-image-2';

    const fetchMock = createChaojitudouAsyncTaskFetchMock(() =>
      makePngBase64(1024, 1024)
    );
    vi.stubGlobal('fetch', fetchMock);

    const sanitized = sanitizeImageGenerateInputRaw({
      prompt: '生成一张产品图',
      model: 'gpt-image-2',
      aspectRatio: '1:1',
      imageSize: '1024x1024',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 1
    });
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;
    expect(sanitized.value.model).toBe('gpt-image-2.5');

    const { sb, insertedAttempts, insertedGenerations } =
      createImageGenerateSupabaseMock({});
    const result = await executeImageGenerationJob({
      request: new Request('https://webtomind.test/api/image/generate', {
        method: 'POST'
      }),
      userId: 'user-chao-logical-gpt-image-25',
      sanitizedInput: sanitized.value,
      sb: sb as never,
      options: { skipCreditCharge: true }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload?.images[0]).toMatchObject({
      provider: 'openai',
      model: 'gpt-image-2.5',
      modelLabel: 'GPT Image 2.5'
    });
    expect(insertedGenerations[0]).toMatchObject({
      provider_model: 'gpt-image-2.5',
      model_label: 'GPT Image 2.5',
      metadata: expect.objectContaining({ requestedModel: 'gpt-image-2.5' })
    });
    expect(insertedAttempts[0]).toMatchObject({
      provider: 'openai',
      model: 'gpt-image-2',
      status: 'succeeded'
    });
  });

  it('defaults new image requests to GPT Image 2.5', () => {
    const result = sanitizeImageGenerateInputRaw({
      prompt: '生成一张商业海报',
      aspectRatio: '1:1',
      imageSize: '1024x1024',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      model: 'gpt-image-2.5',
      provider: 'tuzi'
    });
  });

  it('passes the selected GPT Image 2.5 id and multi-image count to Tuzi', () => {
    const result = sanitizeImageGenerateInput({
      prompt: '用两张参考图编辑并输出 3 张方案',
      model: 'gpt-image-2.5',
      aspectRatio: '1:1',
      imageSize: '1024x1024',
      quality: 'high',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 3,
      referenceImageIds: ['ref-1', 'ref-2']
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      model: 'gpt-image-2.5',
      provider: 'tuzi',
      imageCount: 3,
      referenceImageIds: ['ref-1', 'ref-2']
    });
    expect(
      buildTuziImageGenerationRequestBody(
        'gpt-image-2.5',
        'provider prompt',
        result.value
      )
    ).toMatchObject({
      model: 'gpt-image-2.5',
      n: 3
    });
    expect(
      estimateImageGenerationCreditCost({
        model: result.value.model,
        imageSize: result.value.imageSize
      }).modelMultiplier
    ).toBe(1);
  });

  it.each(['gpt-image-2.5-flare', 'GPT Image 2.5 Sunburst'])(
    'rejects unverified named GPT Image 2.5 model %s instead of mapping it to GPT Image 2',
    (model) => {
      const request = {
        prompt: '生成一张商业海报',
        model,
        aspectRatio: '1:1',
        imageSize: '1024x1024',
        quality: 'auto',
        outputFormat: 'png',
        promptMode: 'custom',
        imageCount: 1
      };
      const result = sanitizeImageGenerateInput(request);
      expect(result).toMatchObject({
        ok: false,
        status: 400,
        body: { error: 'unsupported model' }
      });
      expect(parseQueuedImageGenerationRequest(request)).toBeNull();
    }
  );

  it('skips noisy Tuzi official discount fallback by default', () => {
    process.env.TUZI_API_KEY = 'sk-default';
    process.env.TUZI_OFFICIAL_DISCOUNT_API_KEY = 'sk-official-discount';
    process.env.TUZI_OFFICIAL_API_KEY = 'sk-official';
    delete process.env.TUZI_IMAGE_MODEL;
    delete process.env.TUZI_IMAGE_FALLBACK_MODELS;
    delete process.env.TUZI_FALLBACK_IMAGE_MODEL;
    delete process.env.TUZI_OFFICIAL_DISCOUNT_IMAGE_MODEL;
    delete process.env.TUZI_OFFICIAL_IMAGE_MODEL;

    expect(getTuziImageAttemptPlanSummary()).toEqual([
      { model: 'gpt-image-2', channel: 'default' },
      { model: 'gpt-image-2', channel: 'official' }
    ]);
  });

  it('can explicitly enable Tuzi official discount fallback', () => {
    process.env.TUZI_API_KEY = 'sk-default';
    process.env.TUZI_OFFICIAL_DISCOUNT_API_KEY = 'sk-official-discount';
    process.env.TUZI_OFFICIAL_API_KEY = 'sk-official';
    process.env.TUZI_ENABLE_OFFICIAL_DISCOUNT_FALLBACK = 'true';
    delete process.env.TUZI_IMAGE_MODEL;
    delete process.env.TUZI_IMAGE_FALLBACK_MODELS;
    delete process.env.TUZI_FALLBACK_IMAGE_MODEL;

    expect(getTuziImageAttemptPlanSummary()).toEqual([
      { model: 'gpt-image-2', channel: 'default' },
      { model: 'gpt-image-2', channel: 'official_discount' },
      { model: 'gpt-image-2', channel: 'official' }
    ]);
  });

  it('uses requested first-class Tuzi model api ids in attempt plans', () => {
    process.env.TUZI_API_KEY = 'sk-default';
    process.env.TUZI_IMAGE_API_MODEL_MIDJOURNEY_V7 = 'mj-v7-custom';
    delete process.env.TUZI_OFFICIAL_DISCOUNT_API_KEY;
    delete process.env.TUZI_OFFICIAL_API_KEY;
    delete process.env.TUZI_IMAGE_MODEL;
    delete process.env.TUZI_IMAGE_FALLBACK_MODELS;
    delete process.env.TUZI_FALLBACK_IMAGE_MODEL;

    expect(getTuziImageAttemptPlanSummary('midjourney-v7')).toEqual([
      { model: 'mj-v7-custom', channel: 'default' }
    ]);
  });

  it('uses a unified Tuzi channel connection across all image groups', () => {
    process.env.TUZI_CHANNEL_CONNECTION =
      '{"_type":"newapi_channel_conn","key":"sk-unified","url":"https://api.tu-zi.com"}';
    delete process.env.TUZI_API_KEY;
    delete process.env.TUZI_OFFICIAL_DISCOUNT_API_KEY;
    delete process.env.TUZI_OFFICIAL_API_KEY;
    delete process.env.TUZI_OPENAI_ORIGINAL_API_KEY;
    delete process.env.TUZI_IMAGE_MODEL;
    delete process.env.TUZI_IMAGE_FALLBACK_MODELS;
    delete process.env.TUZI_FALLBACK_IMAGE_MODEL;
    delete process.env.TUZI_DISABLED_IMAGE_CHANNELS;
    delete process.env.TUZI_ENABLE_OFFICIAL_DISCOUNT_FALLBACK;

    expect(getTuziImageAttemptPlanSummary()).toEqual([
      { model: 'gpt-image-2', channel: 'default' },
      { model: 'gpt-image-2', channel: 'official_discount' },
      { model: 'gpt-image-2', channel: 'official' },
      { model: 'gpt-image-2', channel: 'openai_original' }
    ]);
  });

  it('treats a NewAPI JSON TUZI_API_KEY as a unified Tuzi channel connection', () => {
    process.env.TUZI_API_KEY =
      '{"_type":"newapi_channel_conn","key":"sk-unified","url":"https://api.tu-zi.com"}';
    delete process.env.TUZI_CHANNEL_CONNECTION;
    delete process.env.TUZI_NEWAPI_CHANNEL_CONNECTION;
    delete process.env.TUZI_IMAGE_CHANNEL_CONNECTION;
    delete process.env.TUZI_OFFICIAL_DISCOUNT_API_KEY;
    delete process.env.TUZI_OFFICIAL_API_KEY;
    delete process.env.TUZI_OPENAI_ORIGINAL_API_KEY;
    delete process.env.TUZI_IMAGE_MODEL;
    delete process.env.TUZI_IMAGE_FALLBACK_MODELS;
    delete process.env.TUZI_FALLBACK_IMAGE_MODEL;
    delete process.env.TUZI_DISABLED_IMAGE_CHANNELS;
    delete process.env.TUZI_ENABLE_OFFICIAL_DISCOUNT_FALLBACK;

    expect(getTuziImageAttemptPlanSummary()).toEqual([
      { model: 'gpt-image-2', channel: 'default' },
      { model: 'gpt-image-2', channel: 'official_discount' },
      { model: 'gpt-image-2', channel: 'official' },
      { model: 'gpt-image-2', channel: 'openai_original' }
    ]);
  });

  it('keeps the low-cost default Tuzi group first when custom channel order is set', () => {
    process.env.TUZI_CHANNEL_CONNECTION =
      '{"_type":"newapi_channel_conn","key":"sk-unified","url":"https://api.tu-zi.com"}';
    process.env.TUZI_IMAGE_CHANNEL_ORDER =
      'default, official_discount, official, openai_original';

    expect(getTuziImageAttemptPlanSummary()[0]).toEqual({
      model: 'gpt-image-2',
      channel: 'default'
    });
  });

  it('keeps default Tuzi channel first for GPT Image 2 multi-image requests', () => {
    process.env.TUZI_CHANNEL_CONNECTION =
      '{"_type":"newapi_channel_conn","key":"sk-unified","url":"https://api.tu-zi.com"}';
    process.env.TUZI_IMAGE_CHANNEL_ORDER =
      'default, official_discount, official, openai_original';

    expect(
      getTuziImageAttemptPlanSummary('gpt-image-2', { imageCount: 2 })
    ).toEqual([
      { model: 'gpt-image-2', channel: 'default' },
      { model: 'gpt-image-2', channel: 'official_discount' },
      { model: 'gpt-image-2', channel: 'official' },
      { model: 'gpt-image-2', channel: 'openai_original' }
    ]);
  });

  it('locks GPT Image 2 4K Tuzi attempt plans to the OpenAI original group', () => {
    process.env.TUZI_CHANNEL_CONNECTION =
      '{"_type":"newapi_channel_conn","key":"sk-unified","url":"https://api.tu-zi.com"}';
    process.env.TUZI_IMAGE_CHANNEL_ORDER =
      'default, official_discount, official, openai_original';

    expect(
      getTuziImageAttemptPlanSummary('gpt-image-2', {
        imageCount: 10,
        imageSize: '3840x2160'
      })
    ).toEqual([{ model: 'gpt-image-2', channel: 'openai_original' }]);
  });

  it('can lock a supplemental multi-image attempt to the original Tuzi channel', () => {
    process.env.TUZI_CHANNEL_CONNECTION =
      '{"_type":"newapi_channel_conn","key":"sk-unified","url":"https://api.tu-zi.com"}';
    process.env.TUZI_IMAGE_CHANNEL_ORDER =
      'default, official_discount, official, openai_original';

    expect(
      getTuziImageAttemptPlanSummary('gpt-image-2', {
        imageCount: 1,
        lockedTuziAttempt: {
          model: 'gpt-image-2',
          channel: 'official'
        }
      })
    ).toEqual([{ model: 'gpt-image-2', channel: 'official' }]);
  });

  it('can disable the official channel while keeping the default channel', () => {
    process.env.TUZI_API_KEY = 'sk-default';
    process.env.TUZI_OFFICIAL_DISCOUNT_API_KEY = 'sk-official-discount';
    process.env.TUZI_OFFICIAL_API_KEY = 'sk-official';
    process.env.TUZI_DISABLED_IMAGE_CHANNELS = 'official';
    delete process.env.TUZI_IMAGE_MODEL;
    delete process.env.TUZI_IMAGE_FALLBACK_MODELS;
    delete process.env.TUZI_FALLBACK_IMAGE_MODEL;

    expect(getTuziImageAttemptPlanSummary()).toEqual([
      { model: 'gpt-image-2', channel: 'default' }
    ]);
  });

  it('ignores unavailable Tuzi official model overrides', () => {
    process.env.TUZI_API_KEY = 'sk-default';
    process.env.TUZI_OFFICIAL_DISCOUNT_API_KEY = 'sk-official-discount';
    process.env.TUZI_OFFICIAL_API_KEY = 'sk-official';
    process.env.TUZI_OFFICIAL_DISCOUNT_IMAGE_MODEL = 'gpt-image-2-vip';
    process.env.TUZI_OFFICIAL_IMAGE_MODEL = 'gpt-image-2-vip';
    delete process.env.TUZI_IMAGE_MODEL;
    delete process.env.TUZI_IMAGE_FALLBACK_MODELS;
    delete process.env.TUZI_FALLBACK_IMAGE_MODEL;

    expect(getTuziImageAttemptPlanSummary()).toEqual([
      { model: 'gpt-image-2', channel: 'default' },
      { model: 'gpt-image-2', channel: 'official' }
    ]);
  });

  it('parses Tuzi channel connection JSON env values', () => {
    const parsed = parseTuziChannelConnectionConfig(
      '{"_type":"newapi_channel_conn","key":" sk-official ","url":"https://api.tu-zi.com/","group":" 绘画 "}'
    );

    expect(parsed).toEqual({
      apiKey: 'sk-official',
      apiBaseUrl: 'https://api.tu-zi.com/',
      group: '绘画'
    });
  });

  it('uses the key from Tuzi official channel connection JSON', () => {
    process.env.TUZI_API_KEY = 'sk-default';
    process.env.TUZI_OFFICIAL_DISCOUNT_API_KEY =
      '{"_type":"newapi_channel_conn","key":"sk-official-discount","url":"https://api.tu-zi.com"}';
    process.env.TUZI_OFFICIAL_API_KEY =
      '{"_type":"newapi_channel_conn","key":"sk-official","url":"https://api.tu-zi.com"}';
    delete process.env.TUZI_IMAGE_MODEL;
    delete process.env.TUZI_IMAGE_FALLBACK_MODELS;
    delete process.env.TUZI_FALLBACK_IMAGE_MODEL;
    delete process.env.TUZI_OFFICIAL_DISCOUNT_IMAGE_MODEL;
    delete process.env.TUZI_OFFICIAL_IMAGE_MODEL;

    expect(getTuziImageAttemptPlanSummary()).toEqual([
      { model: 'gpt-image-2', channel: 'default' },
      { model: 'gpt-image-2', channel: 'official' }
    ]);
  });

  it('keeps queued Tuzi timeout budget intact when channel fallback is enabled', () => {
    expect(
      getTuziModelTimeoutMs(
        {
          mode: 'queued',
          tuziVipTimeoutMs: 260000,
          pipelineDeadlineMs: 280000
        },
        2
      )
    ).toBe(235000);

    expect(
      getTuziModelTimeoutMs(
        {
          mode: 'queued',
          tuziVipTimeoutMs: 260000,
          pipelineDeadlineMs: 280000
        },
        3
      )
    ).toBe(235000);
  });

  it('scales queued Tuzi timeout budget with multi-image requests', () => {
    expect(
      getTuziModelTimeoutMs(
        {
          mode: 'queued',
          tuziVipTimeoutMs: 260000,
          pipelineDeadlineMs: 280000
        },
        4,
        2
      )
    ).toBe(235000);

    expect(
      getTuziModelTimeoutMs(
        {
          mode: 'queued',
          tuziVipTimeoutMs: 260000,
          pipelineDeadlineMs: 280000
        },
        4,
        4
      )
    ).toBe(235000);
  });

  it('falls back to another Tuzi channel once after a queued timeout', async () => {
    process.env.GPT_IMAGE_2_FORCE_TUZI_PRIMARY = 'true';
    process.env.TUZI_API_KEY = 'sk-default';
    process.env.TUZI_OFFICIAL_API_KEY = 'sk-official';
    process.env.TUZI_IMAGE_CHANNEL_ORDER = 'default,official';
    process.env.TUZI_DISABLE_IMAGE_GROUP = 'true';

    const fetchMock = vi.fn(async () => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      throw error;
    });
    vi.stubGlobal('fetch', fetchMock);

    const sanitized = sanitizeImageGenerateInput({
      prompt: 'A slow editorial product render',
      model: 'gpt-image-2',
      aspectRatio: '1:1',
      imageSize: '1024x1024',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 1
    });
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;

    const { sb, insertedAttempts } = createImageGenerateSupabaseMock({});
    const result = await executeImageGenerationJob({
      request: new Request('https://webtomind.test/api/image/generate', {
        method: 'POST'
      }),
      userId: 'user-tuzi-timeout-no-fallback',
      sb: sb as never,
      sanitizedInput: sanitized.value,
      options: {
        skipCreditCharge: true,
        mode: 'queued',
        taskId: 'task-tuzi-timeout-no-fallback',
        pipelineDeadlineMs: 25000
      }
    });

    expect(result.ok).toBe(false);
    // 队列模式超时允许换通道重试一次
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(insertedAttempts).toHaveLength(2);
    expect(insertedAttempts[0]).toMatchObject({
      provider: 'tuzi',
      channel: 'default',
      status: 'failed',
      error_category: 'provider_timeout',
      task_id: 'task-tuzi-timeout-no-fallback'
    });
    expect(insertedAttempts[1]).toMatchObject({
      provider: 'tuzi',
      channel: 'official',
      status: 'failed',
      error_category: 'provider_timeout',
      task_id: 'task-tuzi-timeout-no-fallback'
    });
  });

  it('uses the image-specific Tuzi base URL for provider requests', async () => {
    process.env.GPT_IMAGE_2_FORCE_TUZI_PRIMARY = 'true';
    process.env.TUZI_API_KEY = 'sk-default';
    process.env.TUZI_IMAGE_API_BASE_URL = 'https://apius.tu-zi.com/';
    process.env.TUZI_IMAGE_CHANNEL_ORDER = 'default';
    process.env.TUZI_DISABLE_IMAGE_GROUP = 'true';

    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [{ b64_json: makePngBase64(1024, 1024) }]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    );
    vi.stubGlobal('fetch', fetchMock);

    const sanitized = sanitizeImageGenerateInput({
      prompt: 'A simple production routing test',
      model: 'gpt-image-2',
      aspectRatio: '1:1',
      imageSize: '1024x1024',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 1
    });
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;

    const { sb } = createImageGenerateSupabaseMock({});
    const result = await executeImageGenerationJob({
      request: new Request('https://webtomind.test/api/image/generate', {
        method: 'POST'
      }),
      userId: 'user-tuzi-image-base-url',
      sb: sb as never,
      sanitizedInput: sanitized.value,
      options: { skipCreditCharge: true, disableProviderFallback: true }
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl] = fetchMock.mock.calls[0] as unknown as [string];
    expect(requestUrl).toBe('https://apius.tu-zi.com/v1/images/generations');
  });

  it('sends default-channel reference images through generations JSON', async () => {
    process.env.GPT_IMAGE_2_FORCE_TUZI_PRIMARY = 'true';
    process.env.TUZI_API_KEY = 'sk-default';
    process.env.TUZI_IMAGE_API_BASE_URL = 'https://tuzi-default.test';
    process.env.TUZI_IMAGE_CHANNEL_ORDER = 'default';
    process.env.TUZI_DISABLE_IMAGE_GROUP = 'true';

    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [{ b64_json: makePngBase64(1024, 1024) }]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    );
    vi.stubGlobal('fetch', fetchMock);

    const sanitized = sanitizeImageGenerateInput({
      prompt: 'Faithfully redraw the reference image',
      model: 'gpt-image-2',
      aspectRatio: 'auto',
      imageSize: 'auto',
      quality: 'high',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 1,
      referenceImageIds: ['reference-1'],
      referenceMode: 'image_reference'
    });
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;

    const { sb } = createImageGenerateSupabaseMock({
      references: [{ id: 'reference-1' }]
    });
    const result = await executeImageGenerationJob({
      request: new Request('https://webtomind.test/api/image/task'),
      userId: 'user-tuzi-default-reference',
      sb: sb as never,
      sanitizedInput: sanitized.value,
      options: { skipCreditCharge: true, disableProviderFallback: true }
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit
    ];
    expect(url).toBe('https://tuzi-default.test/v1/images/generations');
    expect(new Headers(init.headers).get('content-type')).toBe(
      'application/json'
    );
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'gpt-image-2',
      image: ['https://refs.test/reference-1.png'],
      n: 1
    });
  });

  it('keeps official-channel reference images on compatible edits', async () => {
    process.env.GPT_IMAGE_2_FORCE_TUZI_PRIMARY = 'true';
    process.env.TUZI_OFFICIAL_API_KEY = 'sk-official';
    process.env.TUZI_IMAGE_API_BASE_URL = 'https://tuzi-official.test';
    process.env.TUZI_IMAGE_CHANNEL_ORDER = 'official';
    process.env.TUZI_DISABLE_IMAGE_GROUP = 'true';

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/png' }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ b64_json: makePngBase64(1024, 1024) }]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    const sanitized = sanitizeImageGenerateInput({
      prompt: 'Faithfully redraw the reference image',
      model: 'gpt-image-2',
      aspectRatio: 'auto',
      imageSize: 'auto',
      quality: 'high',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 1,
      referenceImageIds: ['reference-1'],
      referenceMode: 'image_reference'
    });
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;

    const { sb } = createImageGenerateSupabaseMock({
      references: [{ id: 'reference-1' }]
    });
    const result = await executeImageGenerationJob({
      request: new Request('https://webtomind.test/api/image/task'),
      userId: 'user-tuzi-official-reference',
      sb: sb as never,
      sanitizedInput: sanitized.value,
      options: { skipCreditCharge: true, disableProviderFallback: true }
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://refs.test/reference-1.png'
    );
    const [url, init] = fetchMock.mock.calls[1] as unknown as [
      string,
      RequestInit
    ];
    expect(url).toBe('https://tuzi-official.test/v1/images/edits');
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('adds Cloudflare AI Gateway runtime auth only for the gateway host', async () => {
    process.env.GPT_IMAGE_2_FORCE_TUZI_PRIMARY = 'true';
    process.env.TUZI_API_KEY = 'sk-default';
    process.env.TUZI_IMAGE_API_BASE_URL =
      'https://gateway.ai.cloudflare.com/v1/account/gateway/custom-tuzi-image';
    process.env.CLOUDFLARE_AI_GATEWAY_RUN_TOKEN = 'gateway-run-token';
    process.env.TUZI_IMAGE_CHANNEL_ORDER = 'default';
    process.env.TUZI_DISABLE_IMAGE_GROUP = 'true';

    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [{ b64_json: makePngBase64(1024, 1024) }]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    );
    vi.stubGlobal('fetch', fetchMock);

    const sanitized = sanitizeImageGenerateInput({
      prompt: 'Authenticated gateway request',
      model: 'gpt-image-2',
      aspectRatio: '1:1',
      imageSize: '1024x1024',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 1
    });
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;

    const { sb } = createImageGenerateSupabaseMock({});
    const result = await executeImageGenerationJob({
      request: new Request('https://webtomind.test/api/image/generate', {
        method: 'POST'
      }),
      userId: 'user-cloudflare-gateway-auth',
      sb: sb as never,
      sanitizedInput: sanitized.value,
      options: { skipCreditCharge: true, disableProviderFallback: true }
    });

    expect(result.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit
    ];
    expect(new Headers(init.headers).get('cf-aig-authorization')).toBe(
      'Bearer gateway-run-token'
    );
  });

  it('falls back from Tuzi to OpenAI-compatible only for retryable provider failures', async () => {
    process.env.GPT_IMAGE_2_FORCE_TUZI_PRIMARY = 'true';
    process.env.TUZI_API_KEY = 'sk-default';
    process.env.TUZI_IMAGE_CHANNEL_ORDER = 'default';
    process.env.TUZI_DISABLE_IMAGE_GROUP = 'true';
    process.env.TUZI_ENABLE_OPENAI_COMPAT_FALLBACK = 'true';
    process.env.OPENAI_COMPAT_IMAGE_ENABLED = 'true';
    process.env.OPENAI_COMPAT_IMAGE_BASE_URL =
      'https://openai-fallback.test/v1';
    process.env.OPENAI_COMPAT_IMAGE_API_KEY = 'sk-openai-fallback';
    process.env.OPENAI_COMPAT_IMAGE_MODEL = 'gpt-image-2';
    process.env.OPENAI_COMPAT_IMAGE_DISABLE_CODEX_FALLBACK = 'true';

    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith('https://api.tu-zi.com/')) {
        return new Response(
          JSON.stringify({ error: { message: 'upstream unavailable' } }),
          { status: 503, headers: { 'content-type': 'application/json' } }
        );
      }
      if (url.startsWith('https://openai-fallback.test/')) {
        return new Response(
          JSON.stringify({
            data: [{ b64_json: makePngBase64(1024, 1024) }]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const sanitized = sanitizeImageGenerateInput({
      prompt: 'A provider failover test',
      model: 'gpt-image-2',
      aspectRatio: '1:1',
      imageSize: '1024x1024',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 1
    });
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;

    const { sb, insertedAttempts } = createImageGenerateSupabaseMock({});
    const result = await executeImageGenerationJob({
      request: new Request('https://webtomind.test/api/image/generate', {
        method: 'POST'
      }),
      userId: 'user-tuzi-openai-fallback',
      sb: sb as never,
      sanitizedInput: sanitized.value,
      options: { skipCreditCharge: true }
    });

    expect(result.ok).toBe(true);
    expect(insertedAttempts).toHaveLength(2);
    expect(insertedAttempts[0]).toMatchObject({
      provider: 'tuzi',
      status: 'failed',
      error_category: 'provider_unavailable'
    });
    expect(insertedAttempts[1]).toMatchObject({
      provider: 'openai',
      status: 'succeeded'
    });
  });

  it('does not rescue a multi-image Tuzi timeout with another Tuzi request', async () => {
    process.env.GPT_IMAGE_2_FORCE_TUZI_PRIMARY = 'true';
    process.env.TUZI_API_KEY = 'sk-default';
    process.env.TUZI_IMAGE_CHANNEL_ORDER = 'default';
    process.env.TUZI_DISABLE_IMAGE_GROUP = 'true';

    const fetchMock = vi.fn(async () => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      throw error;
    });
    vi.stubGlobal('fetch', fetchMock);

    const sanitized = sanitizeImageGenerateInput({
      prompt: 'Two slow editorial product renders',
      model: 'gpt-image-2',
      aspectRatio: '1:1',
      imageSize: '1024x1024',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 2
    });
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;

    const { sb, insertedAttempts } = createImageGenerateSupabaseMock({});
    const result = await executeImageGenerationJob({
      request: new Request('https://webtomind.test/api/image/generate', {
        method: 'POST'
      }),
      userId: 'user-tuzi-timeout-no-rescue',
      sb: sb as never,
      sanitizedInput: sanitized.value,
      options: {
        skipCreditCharge: true,
        mode: 'queued',
        taskId: 'task-tuzi-timeout-no-rescue',
        pipelineDeadlineMs: 70000
      }
    });

    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(insertedAttempts).toHaveLength(1);
    expect(insertedAttempts[0]).toMatchObject({
      provider: 'tuzi',
      channel: 'default',
      status: 'failed',
      error_category: 'provider_timeout',
      task_id: 'task-tuzi-timeout-no-rescue'
    });
  });

  it('does not force provider size when UI image size is auto and the prompt has no ratio', () => {
    const result = sanitizeImageGenerateInput({
      prompt: '一只在草地上晒太阳的橘猫',
      model: 'gpt-image-2',
      aspectRatio: 'auto',
      imageSize: 'auto',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(getKrillProviderImageSize(result.value)).toBeUndefined();
    expect(getTuziProviderImageSize(result.value)).toBe('auto');
  });

  it('maps orientation words in the prompt to a default ratio when Auto', () => {
    const result = sanitizeImageGenerateInput({
      prompt: '生成一张竖版写真',
      model: 'gpt-image-2',
      aspectRatio: 'auto',
      imageSize: 'auto',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.aspectRatio).toBe('3:4');
    expect(getTuziProviderImageSize(result.value)).toBe('1152x1536');
  });

  it('uses exact valid source dimensions and a safe ratio fallback for redraws', () => {
    expect(getImageSizeForSourceDimensions(1728, 2304)).toBe('1728x2304');
    expect(getImageSizeForSourceDimensions(256, 256)).toBe('1024x1024');
    expect(getImageSizeForSourceDimensions(1000, 750)).toBe('1536x1152');
  });

  it('uses default aspect-ratio size instead of Tuzi fast downgrade for custom prompt ratio hints', () => {
    const result = sanitizeImageGenerateInput({
      prompt: '生成一张 9:16 竖版写真',
      model: 'gpt-image-2',
      aspectRatio: 'auto',
      imageSize: 'auto',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(getKrillProviderImageSize(result.value)).toBe('1152x2048');
    expect(getTuziProviderImageSize(result.value)).toBe('1152x2048');
  });

  it('keeps the selected UI image size for custom prompts when it is explicit', () => {
    const result = sanitizeImageGenerateInput({
      prompt: '生成一张 9:16 竖版写真，2K 质感',
      model: 'gpt-image-2',
      aspectRatio: '9:16',
      imageSize: '2160x3840',
      quality: 'medium',
      outputFormat: 'png',
      promptMode: 'custom'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(getTuziProviderImageSize(result.value)).toBe('2160x3840');
  });

  it('keeps GPT Image 2 high-quality 4K requests enabled', () => {
    const result = sanitizeImageGenerateInput({
      prompt: '生成一张 9:16 竖版写真，4K 质感',
      model: 'gpt-image-2',
      aspectRatio: '9:16',
      imageSize: '2160x3840',
      quality: 'high',
      outputFormat: 'png',
      promptMode: 'custom'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.provider).toBe('tuzi');
    expect(result.value.quality).toBe('high');
    expect(getKrillProviderImageSize(result.value)).toBe('2160x3840');
  });

  it('rejects invalid quality instead of silently falling back to auto', () => {
    const result = sanitizeImageGenerateInput({
      prompt: '生成一张室内人像',
      model: 'gpt-image-2',
      aspectRatio: '2:3',
      imageSize: '1024x1536',
      quality: 'ultra',
      outputFormat: 'png',
      promptMode: 'custom'
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.body.error).toBe('invalid quality');
  });

  it('rejects invalid output format instead of silently falling back to png', () => {
    const result = sanitizeImageGenerateInput({
      prompt: '生成一张室内人像',
      model: 'gpt-image-2',
      aspectRatio: '2:3',
      imageSize: '1024x1536',
      quality: 'auto',
      outputFormat: 'gif',
      promptMode: 'custom'
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.body.error).toBe('invalid outputFormat');
  });

  it('keeps GPT Image 2 medium-quality 4K requests unchanged and tracks task metadata', () => {
    const result = sanitizeImageGenerateInput({
      prompt: '生成一张 9:16 竖版写真，4K 质感',
      model: 'gpt-image-2',
      aspectRatio: '9:16',
      imageSize: '2160x3840',
      quality: 'medium',
      outputFormat: 'png',
      promptMode: 'custom'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.quality).toBe('medium');

    const metadata = getImageGenerationCreditMetadata(result.value, {
      mode: 'queued',
      taskId: 'task-test-123'
    });

    expect(metadata.taskId).toBe('task-test-123');
    expect(metadata.mode).toBe('queued');
    expect(metadata.quality).toBe('medium');
    expect(metadata.imageSize).toBe('2160x3840');
  });

  it('uses resolved reference dimensions in the actual credit metadata', () => {
    const result = sanitizeImageGenerateInput({
      prompt: '把主体放进参考图场景中',
      model: 'gpt-image-2',
      aspectRatio: '1:1',
      imageSize: '1024x1024',
      quality: 'auto',
      outputFormat: 'png',
      referenceImageIds: ['reference-small'],
      promptMode: 'custom'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const metadata = getImageGenerationCreditMetadata({
      ...result.value,
      referenceImageSizes: [{ width: 512, height: 512 }]
    });

    expect(metadata.dynamicCredits).toBe(65);
    expect(metadata.unitDynamicCredits).toBe(65);
    expect(metadata.billingReferenceAdjustment).toBe(5);
  });

  it('splits inline negative prompt sections from custom prompts', () => {
    const result = sanitizeImageGenerateInput({
      prompt: '生成一张室内人像。\n\n负面提示词：低清晰度，坏手',
      model: 'gpt-image-2',
      aspectRatio: '2:3',
      imageSize: 'auto',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.prompt).toBe('生成一张室内人像。');
    expect(result.value.negativePrompt).toBe('低清晰度，坏手');
  });

  it('splits common inline negative prompt labels without the ci suffix', () => {
    const result = sanitizeImageGenerateInput({
      prompt: '生成一张室内人像。\n\n负面提示：低清晰度，坏手',
      model: 'gpt-image-2',
      aspectRatio: '2:3',
      imageSize: 'auto',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.prompt).toBe('生成一张室内人像。');
    expect(result.value.negativePrompt).toBe('低清晰度，坏手');
  });

  it('splits plain inline negative labels from any prompt mode', () => {
    const result = sanitizeImageGenerateInput({
      prompt: '生成一张室内人像。\n\n负面：低清晰度，坏手',
      model: 'gpt-image-2',
      aspectRatio: '2:3',
      imageSize: 'auto',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'composed'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.prompt).toBe('生成一张室内人像。');
    expect(result.value.negativePrompt).toBe('低清晰度，坏手');
    expect(buildGenerationPrompt(result.value)).toContain(
      'Avoid: 低清晰度，坏手'
    );
  });

  it('passes parsed negative constraints into custom provider prompts', () => {
    const result = sanitizeImageGenerateInput({
      prompt: '生成一张室内人像。\n\nNegative: low quality, extra fingers',
      model: 'gpt-image-2',
      aspectRatio: '2:3',
      imageSize: 'auto',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(buildGenerationPrompt(result.value)).toContain(
      'Avoid: low quality, extra fingers'
    );
  });

  it('adds safety framing for high-risk image prompts', () => {
    const result = sanitizeImageGenerateInput({
      prompt: '海边泳装写真，透明游泳圈，强调身材比例',
      model: 'gpt-image-2',
      aspectRatio: '9:16',
      imageSize: 'auto',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(getImagePromptSafetyGuidance(result.value)).toContain(
      'Safety framing'
    );
    expect(buildGenerationPrompt(result.value)).toContain('opaque clothing');
  });

  it('promotes character groups into reference-image generation metadata', () => {
    const result = sanitizeImageGenerateInput({
      prompt: '让两个角色在咖啡馆对话',
      model: 'nano-banana',
      aspectRatio: '2:3',
      imageSize: '1024x1536',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      referenceImageIds: ['manual-ref'],
      characterCardIds: ['card-a'],
      characterReferenceGroups: [
        {
          characterCardId: 'card-a',
          label: 'Character A - Alice',
          referenceImageIds: ['ref-a1', 'ref-a2']
        },
        {
          characterCardId: 'card-b',
          label: 'Character B - Bob',
          referenceImageIds: ['ref-b1', 'ref-b2']
        }
      ]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.referenceMode).toBe('character_consistency');
    expect(result.value.characterCardIds).toEqual(['card-a', 'card-b']);
    expect(result.value.referenceImageIds).toEqual([
      'manual-ref',
      'ref-a1',
      'ref-a2',
      'ref-b1'
    ]);
    expect(result.value.characterReferenceGroups).toHaveLength(2);
  });

  it('deduplicates and truncates manual references plus official character groups', () => {
    const result = sanitizeImageGenerateInput({
      prompt: '让官方角色组和手动参考图保持一致',
      model: 'nano-banana',
      aspectRatio: '1:1',
      imageSize: '1024x1024',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      referenceImageIds: ['manual-1', 'shared-ref', 'manual-1', 'manual-2'],
      characterReferenceGroups: [
        {
          characterCardId: 'official-card-a',
          label: '官方角色组 A',
          referenceImageIds: ['shared-ref', 'official-a-1', 'official-a-2']
        },
        {
          characterCardId: 'official-card-b',
          label: '官方角色组 B',
          referenceImageIds: ['official-b-1', 'official-b-2']
        }
      ]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.referenceMode).toBe('character_consistency');
    expect(result.value.referenceImageIds).toEqual([
      'manual-1',
      'shared-ref',
      'manual-2',
      'official-a-1'
    ]);
    expect(result.value.referenceImageIds).toHaveLength(4);
    expect(result.value.characterCardIds).toEqual([
      'official-card-a',
      'official-card-b'
    ]);
  });

  it('keeps new Tuzi image models as first-class model ids and billing metadata', () => {
    process.env.TUZI_IMAGE_API_MODEL_NANO_BANANA_PRO = 'custom-nano-pro';
    const result = sanitizeImageGenerateInput({
      prompt: '生成一张商业产品海报',
      model: 'nano-banana-pro',
      aspectRatio: '1:1',
      imageSize: '2048x2048',
      quality: 'high',
      outputFormat: 'png',
      promptMode: 'custom'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.model).toBe('nano-banana-pro');
    expect(result.value.modelLabel).toBe('Nano Banana Pro');
    expect(result.value.provider).toBe('tuzi');

    const metadata = getImageGenerationCreditMetadata(result.value, {
      mode: 'sync'
    });
    expect(metadata.requestedApiModel).toBe('custom-nano-pro');
    expect(metadata.billingModelMultiplier).toBe(1.8);
    expect(metadata.billingModelAdjustment).toBeGreaterThan(0);
  });

  it('builds Seedream 5.0 Pro single-image bodies and rejects multi-image', () => {
    const rejected = sanitizeImageGenerateInput({
      prompt: '生成 3 张商业海报',
      model: 'seedream-5-pro',
      aspectRatio: '1:1',
      imageSize: '1024x1024',
      quality: 'high',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 3
    });
    expect(rejected.ok).toBe(false);
    if (rejected.ok) return;
    expect(rejected.body.error).toBe('model does not support multiple images');

    const oversized = sanitizeImageGenerateInput({
      prompt: '生成一张商业海报',
      model: 'seedream-5-pro',
      aspectRatio: '1:1',
      imageSize: '2560x2560',
      quality: 'high',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 1
    });
    expect(oversized.ok).toBe(false);
    if (oversized.ok) return;
    expect(oversized.body.error).toBe('invalid imageSize');
    expect(String(oversized.body.message)).toContain('921600-4624220');

    const result = sanitizeImageGenerateInput({
      prompt: '生成一张商业海报',
      model: 'seedream-5-pro',
      aspectRatio: '1:1',
      imageSize: '1024x1024',
      quality: 'high',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 1
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(
      buildTuziImageGenerationRequestBody(
        'seedream-5-0-pro',
        'provider prompt',
        result.value
      )
    ).toEqual({
      model: 'seedream-5-0-pro',
      prompt: 'provider prompt',
      group: 'default',
      size: '1024x1024',
      quality: 'high',
      output_format: 'png',
      n: 1
    });
  });

  it('builds Tuzi generation bodies with model, size, quality, format and image count', () => {
    const result = sanitizeImageGenerateInput({
      prompt: '生成 3 张 9:16 商业海报',
      model: 'wan-image-2-7-pro',
      aspectRatio: '9:16',
      imageSize: '1152x2048',
      quality: 'medium',
      outputFormat: 'webp',
      promptMode: 'custom',
      imageCount: 3
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(
      buildTuziImageGenerationRequestBody(
        'wan-image-2.7-pro',
        'provider prompt',
        result.value
      )
    ).toEqual({
      model: 'wan-image-2.7-pro',
      prompt: 'provider prompt',
      group: 'default',
      size: '1152x2048',
      quality: 'medium',
      output_format: 'webp',
      output_compression: 85,
      n: 3
    });
  });

  it('passes size=auto explicitly when no concrete Tuzi size is selected', () => {
    const result = sanitizeImageGenerateInput({
      prompt: '生成一张抽象商业海报',
      model: 'gpt-image-2',
      aspectRatio: 'auto',
      imageSize: 'auto',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      buildTuziImageGenerationRequestBody(
        'gpt-image-2',
        'provider prompt',
        result.value
      )
    ).toMatchObject({ group: 'default', size: 'auto' });
  });

  it('allows overriding the Tuzi image generation group through env', () => {
    process.env.TUZI_IMAGE_GROUP = '实验绘画';
    const result = sanitizeImageGenerateInput({
      prompt: '生成一张 1:1 商业海报',
      model: 'wan-image-2-7-pro',
      aspectRatio: '1:1',
      imageSize: '1024x1024',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 1
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(
      buildTuziImageGenerationRequestBody(
        'wan-image-2.7-pro',
        'provider prompt',
        result.value
      )
    ).toMatchObject({
      group: '实验绘画'
    });
  });

  it('can disable the Tuzi image generation group through env', () => {
    process.env.TUZI_IMAGE_GROUP = 'off';
    const result = sanitizeImageGenerateInput({
      prompt: '生成一张 1:1 商业海报',
      model: 'wan-image-2-7-pro',
      aspectRatio: '1:1',
      imageSize: '1024x1024',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 1
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(
      buildTuziImageGenerationRequestBody(
        'wan-image-2.7-pro',
        'provider prompt',
        result.value
      )
    ).not.toHaveProperty('group');
  });

  it('rejects reference images for Tuzi models that do not support them', () => {
    const result = sanitizeImageGenerateInput({
      prompt: '生成一张高审美概念视觉',
      model: 'midjourney-v7',
      aspectRatio: '3:2',
      imageSize: '1536x1024',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      referenceImageIds: ['ref-1']
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.body.error).toBe(
      'model does not support reference images yet'
    );
  });

  it('applies model multipliers to image credit estimates without changing size tier', () => {
    const estimate = estimateImageGenerationCreditCost({
      model: 'midjourney-niji-v7',
      imageSize: '1024x1536',
      quality: 'auto'
    });

    expect(estimate.tier).toBe('base');
    expect(estimate.baseCost).toBe(60);
    expect(estimate.modelMultiplier).toBe(2.2);
    expect(estimate.cost).toBe(132);
    expect(estimate.modelAdjustment).toBe(72);
  });

  it('keeps explicit imageCount ahead of prompt count hints', () => {
    const result = sanitizeImageGenerateInput({
      prompt: '生成多张不同构图的室内人像',
      model: 'gpt-image-2',
      aspectRatio: '2:3',
      imageSize: '1024x1536',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 4
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.imageCount).toBe(4);
  });

  it('attempts supplemental generation only for partial multi-image results', () => {
    expect(
      shouldAttemptSupplementalImageGeneration({
        requestedImageCount: 2,
        generatedImageCount: 1,
        supplementAttempt: 0
      })
    ).toBe(true);
    expect(
      shouldAttemptSupplementalImageGeneration({
        requestedImageCount: 2,
        generatedImageCount: 1,
        supplementAttempt: 1
      })
    ).toBe(true);
    expect(
      shouldAttemptSupplementalImageGeneration({
        requestedImageCount: 2,
        generatedImageCount: 2,
        supplementAttempt: 0
      })
    ).toBe(false);
    expect(
      shouldAttemptSupplementalImageGeneration({
        requestedImageCount: 1,
        generatedImageCount: 1,
        supplementAttempt: 0
      })
    ).toBe(false);
    expect(
      shouldAttemptSupplementalImageGeneration({
        requestedImageCount: 4,
        generatedImageCount: 1,
        supplementAttempt: 2
      })
    ).toBe(true);
    expect(
      shouldAttemptSupplementalImageGeneration({
        requestedImageCount: 4,
        generatedImageCount: 3,
        supplementAttempt: 3
      })
    ).toBe(false);
  });

  it('allows supplemental generation in strict multi-image mode', () => {
    expect(isStrictBatchConsistencyEnabled(1)).toBe(false);
    expect(isStrictBatchConsistencyEnabled(2)).toBe(true);

    expect(
      shouldAttemptSupplementalImageGeneration({
        requestedImageCount: 2,
        generatedImageCount: 1,
        supplementAttempt: 0,
        strictBatchConsistency: true
      })
    ).toBe(true);

    expect(
      shouldAttemptSupplementalImageGeneration({
        requestedImageCount: 4,
        generatedImageCount: 2,
        supplementAttempt: 0,
        strictBatchConsistency: true
      })
    ).toBe(true);
  });

  it('uses Tuzi rescue for strict multi-image batches when Tuzi is available', () => {
    expect(getSingleImageRescueProviderChain('openai')).toEqual(['openai']);

    process.env.TUZI_API_KEY = 'sk-tuzi';

    const ordinary = sanitizeImageGenerateInput({
      prompt: '生成 2 张产品海报',
      model: 'gpt-image-2',
      aspectRatio: '3:4',
      imageSize: '1536x2048',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 2
    });
    expect(ordinary.ok).toBe(true);
    if (!ordinary.ok) return;
    expect(getSingleImageRescueProviderChain('openai', ordinary.value)).toEqual(
      ['tuzi', 'openai']
    );

    const heavy = sanitizeImageGenerateInput({
      prompt: '生成 4 张产品海报',
      model: 'gpt-image-2',
      aspectRatio: '3:4',
      imageSize: '1536x2048',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      imageCount: 4
    });
    expect(heavy.ok).toBe(true);
    if (!heavy.ok) return;
    expect(getSingleImageRescueProviderChain('openai', heavy.value)).toEqual([
      'tuzi',
      'openai'
    ]);
    expect(getSingleImageRescueProviderChain('tuzi')).toEqual(['tuzi']);

    expect(
      shouldAttemptSingleImageRescue({
        requestedImageCount: 2,
        failureDetails: {
          code: 'OPENAI_COMPAT_TIMEOUT',
          category: 'provider_timeout',
          retryable: true,
          provider: 'openai',
          model: 'gpt-image-2'
        }
      })
    ).toBe(true);
    expect(
      shouldAttemptSingleImageRescue({
        requestedImageCount: 2,
        failureDetails: {
          code: 'OPENAI_COMPAT_PROVIDER_UNAVAILABLE',
          category: 'provider_unavailable',
          retryable: true,
          provider: 'openai',
          model: 'gpt-image-2'
        }
      })
    ).toBe(true);
    expect(
      shouldAttemptSingleImageRescue({
        requestedProvider: 'tuzi',
        requestedImageCount: 2,
        failureDetails: {
          code: 'PROVIDER_TIMEOUT',
          category: 'provider_timeout',
          retryable: true,
          provider: 'Tuzi',
          model: 'gpt-image-2'
        }
      })
    ).toBe(false);
    expect(
      shouldAttemptSingleImageRescue({
        requestedImageCount: 1,
        failureDetails: {
          code: 'OPENAI_COMPAT_TIMEOUT',
          category: 'provider_timeout',
          retryable: true
        }
      })
    ).toBe(false);
    expect(
      shouldAttemptSingleImageRescue({
        requestedImageCount: 2,
        failureDetails: {
          code: 'OPENAI_COMPAT_POLICY',
          category: 'provider_policy',
          retryable: false
        }
      })
    ).toBe(false);
    expect(
      shouldAttemptSingleImageRescue({
        requestedImageCount: 2,
        failureDetails: {
          code: 'INVALID_IMAGE_REQUEST',
          category: 'invalid_request',
          retryable: false
        }
      })
    ).toBe(false);
  });

  it('keeps reference-based editor context without duplicating the source generation', () => {
    const result = sanitizeImageGenerateInput({ prompt: 'Only edit the marked door', model: 'nano-banana-2', referenceImageIds: ['editor-reference'], editMode: 'context_locked', editInstruction: 'Blue door' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.editMode).toBe('context_locked');
    expect(result.value.referenceImageIds).toEqual(['editor-reference']);
    expect(result.value.sourceGenerationId).toBeUndefined();
  });

  it('keeps context-locked edit metadata in sanitized requests', () => {
    const result = sanitizeImageGenerateInput({
      prompt: 'Context-locked local image edit. Only change the background.',
      model: 'nano-banana',
      aspectRatio: '2:3',
      imageSize: '1024x1536',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom',
      sourceGenerationId: 'generation-source-123',
      editInstruction: '只把背景换成咖啡馆',
      editMode: 'context_locked'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sourceGenerationId).toBe('generation-source-123');
    expect(result.value.editInstruction).toBe('只把背景换成咖啡馆');
    expect(result.value.editMode).toBe('context_locked');
    expect(result.value.referenceMode).toBe('image_reference');
  });

  it('rejects prompts over the gpt-image-2 compatible 5000 character limit', () => {
    const result = sanitizeImageGenerateInput({
      prompt: 'a'.repeat(5001),
      model: 'gpt-image-2',
      aspectRatio: '1:1',
      imageSize: 'auto',
      quality: 'auto',
      outputFormat: 'png',
      promptMode: 'custom'
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.body.error).toContain('max 5000');
  });
});
