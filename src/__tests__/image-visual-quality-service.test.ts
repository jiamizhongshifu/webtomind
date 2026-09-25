import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildImageVisualQualityPrompt,
  callVisualQualityWithFallback,
  findImageVisualQualitySweepCandidates,
  ImageVisualQualityError,
  normalizeImageVisualQualityResponse,
  runImageVisualQualitySweep,
  shouldScoreImageVisualQualitySweepRow,
  type ImageVisualQualityGenerationRow
} from '../../api/image/quality/service';

const row: ImageVisualQualityGenerationRow = {
  id: 'generation-1',
  user_id: 'user-1',
  image_url: 'https://example.com/image.png',
  prompt:
    'An adult model in a translucent iridescent resin coat, leaning forward in a Japanese courtyard, low-angle wide lens, hard side light.',
  negative_prompt: null,
  provider: 'tuzi',
  provider_model: 'gpt-image-2',
  aspect_ratio: '16:9',
  quality: 'high',
  asset_ids: ['scene-japanese-courtyard', 'material-iridescent-resin'],
  metadata: {
    recipeAudit: {
      selectionSource: 'manual',
      compilerVersion: 'recipe-v2'
    }
  },
  created_at: '2026-07-16T00:00:00.000Z'
};

function completeModelResponse() {
  return {
    confidence: 0.9,
    summary: 'The requested scene and material are visible.',
    dimensions: {
      prompt_coherence: {
        applicable: true,
        score: 90,
        evidence: ['One executable frame']
      },
      subject_scene_adherence: {
        applicable: true,
        score: 80,
        evidence: ['Courtyard is visible']
      },
      wardrobe_material_adherence: {
        applicable: true,
        score: 70,
        evidence: ['Coat is translucent']
      },
      pose_expression_adherence: {
        applicable: true,
        score: 60,
        evidence: ['Subject leans forward']
      },
      framing_camera_adherence: {
        applicable: true,
        score: 80,
        evidence: ['Low viewpoint']
      },
      lighting_style_adherence: {
        applicable: true,
        score: 70,
        evidence: ['Hard side light']
      },
      technical_integrity: {
        applicable: true,
        score: 90,
        evidence: ['No visible anatomy defect']
      }
    },
    findings: [
      {
        dimension: 'wardrobe_material_adherence',
        severity: 'minor',
        evidence: 'Iridescence is weak on the sleeve.',
        suggestion: 'Strengthen spectral highlights on the sleeve.'
      }
    ],
    repairPrompt: 'Preserve the frame and strengthen sleeve iridescence.'
  };
}

describe('image visual quality scoring contract', () => {
  beforeEach(() => {
    delete process.env.IMAGE_VISUAL_QUALITY_AUTO_ENABLED;
    delete process.env.IMAGE_VISUAL_QUALITY_MAX_ATTEMPTS;
    delete process.env.TUZI_TEXT_API_KEY;
    delete process.env.TUZI_TEXT_CHANNEL_CONNECTION;
    delete process.env.TUZI_CHANNEL_CONNECTION;
    delete process.env.TUZI_NEWAPI_CHANNEL_CONNECTION;
    delete process.env.TUZI_API_KEY;
    delete process.env.TUZI_X_DEEPSEARCH_API_KEY;
    delete process.env.TUZI_X_DEEPSEARCH_API_BASE_URL;
    delete process.env.TUZI_OFFICIAL_API_KEY;
    delete process.env.TUZI_OFFICIAL_DISCOUNT_API_KEY;
    delete process.env.TUZI_TEXT_BASE_URL;
    delete process.env.TUZI_API_BASE_URL;
    delete process.env.TUZI_VISION_MODEL;
    delete process.env.CLOUDFLARE_AI_GATEWAY_RUN_TOKEN;
    delete process.env.GEMINI_OFFICIAL_ENABLED;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.IMAGE_VISUAL_QUALITY_MODEL;
    delete process.env.IMAGE_VISUAL_QUALITY_FALLBACK_MODELS;
    delete process.env.IMAGE_VISUAL_QUALITY_MAX_ATTEMPTS;
    delete process.env.IMAGE_VISUAL_QUALITY_AUTO_ENABLED;
    delete process.env.GEMINI_API_KEY;
    delete process.env.TUZI_TEXT_API_KEY;
    delete process.env.TUZI_TEXT_CHANNEL_CONNECTION;
    delete process.env.TUZI_CHANNEL_CONNECTION;
    delete process.env.TUZI_NEWAPI_CHANNEL_CONNECTION;
    delete process.env.TUZI_API_KEY;
    delete process.env.TUZI_X_DEEPSEARCH_API_KEY;
    delete process.env.TUZI_X_DEEPSEARCH_API_BASE_URL;
    delete process.env.TUZI_OFFICIAL_API_KEY;
    delete process.env.TUZI_OFFICIAL_DISCOUNT_API_KEY;
    delete process.env.TUZI_TEXT_BASE_URL;
    delete process.env.TUZI_API_BASE_URL;
    delete process.env.TUZI_VISION_MODEL;
    delete process.env.CLOUDFLARE_AI_GATEWAY_RUN_TOKEN;
    delete process.env.GEMINI_OFFICIAL_ENABLED;
  });

  it('calculates the weighted score on the server and preserves recipe traceability', () => {
    const audit = normalizeImageVisualQualityResponse({
      value: completeModelResponse(),
      model: 'gemini-test',
      row,
      evaluatedAt: '2026-07-16T01:00:00.000Z'
    });

    expect(audit.overallScore).toBe(78);
    expect(audit.grade).toBe('good');
    expect(audit.assetIds).toEqual(row.asset_ids);
    expect(audit.recipeSelectionSource).toBe('manual');
    expect(audit.recipeCompilerVersion).toBe('recipe-v2');
    expect(audit.findings[0]?.dimension).toBe('wardrobe_material_adherence');
  });

  it('excludes explicitly non-applicable dimensions from the denominator', () => {
    const response = completeModelResponse();
    response.dimensions.pose_expression_adherence = {
      applicable: false,
      score: null as unknown as number,
      evidence: []
    };
    const audit = normalizeImageVisualQualityResponse({
      value: response,
      model: 'gemini-test',
      row
    });

    expect(audit.dimensions.pose_expression_adherence).toEqual({
      applicable: false,
      score: null,
      evidence: []
    });
    expect(audit.overallScore).toBe(81);
  });

  it('rejects incomplete model JSON instead of fabricating missing scores', () => {
    const response = completeModelResponse();
    delete (response.dimensions as Partial<typeof response.dimensions>)
      .technical_integrity;

    expect(() =>
      normalizeImageVisualQualityResponse({
        value: response,
        model: 'gemini-test',
        row
      })
    ).toThrowError(ImageVisualQualityError);
  });

  it('builds a rubric that treats creative materials as adherence requirements', () => {
    const prompt = buildImageVisualQualityPrompt(row);

    expect(prompt).toContain('not a beauty contest');
    expect(prompt).toContain('wardrobe_material_adherence');
    expect(prompt).toContain('Do not punish unconventional fashion materials');
    expect(prompt).toContain('scene-japanese-courtyard');
  });

  it('retries a busy primary model and falls back without fabricating a score', async () => {
    process.env.IMAGE_VISUAL_QUALITY_MODEL = 'gemini-primary';
    process.env.IMAGE_VISUAL_QUALITY_FALLBACK_MODELS = 'gemini-fallback';
    process.env.GEMINI_API_KEY = 'test-key';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              message: 'This model is currently experiencing high demand.'
            }
          },
          { status: 503 }
        )
      )
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              message: 'This model is currently experiencing high demand.'
            }
          },
          { status: 503 }
        )
      )
      .mockResolvedValueOnce(
        Response.json({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify(completeModelResponse()) }]
              }
            }
          ]
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await callVisualQualityWithFallback({
      image: { mimeType: 'image/png', base64: 'aW1hZ2U=' },
      prompt: 'score this image'
    });

    expect(result.model).toBe('gemini-fallback');
    expect(result.parsed.summary).toBe(
      'The requested scene and material are visible.'
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('uses Tuzi vision first and does not call official Gemini when disabled', async () => {
    process.env.TUZI_TEXT_API_KEY = 'tuzi-test-key';
    process.env.TUZI_TEXT_BASE_URL = 'https://api.tu-zi.com';
    process.env.TUZI_VISION_MODEL = 'gemini-through-tuzi';
    process.env.GEMINI_API_KEY = 'official-test-key';
    process.env.GEMINI_OFFICIAL_ENABLED = 'false';
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        choices: [
          {
            message: {
              content: [{ text: JSON.stringify(completeModelResponse()) }]
            }
          }
        ]
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await callVisualQualityWithFallback({
      image: { mimeType: 'image/png', base64: 'aW1hZ2U=' },
      prompt: 'score this image'
    });

    expect(result.model).toBe('gemini-through-tuzi');
    expect(result.parsed.summary).toBe(
      'The requested scene and material are visible.'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://api.tu-zi.com/v1/chat/completions'
    );
  });

  it('routes Tuzi vision through the authenticated Cloudflare AI Gateway', async () => {
    process.env.TUZI_API_KEY = JSON.stringify({
      _type: 'newapi_channel_conn',
      key: 'tuzi-test-key',
      url: 'https://ignored-by-explicit-gateway.example.com',
      group: 'default'
    });
    process.env.TUZI_TEXT_BASE_URL =
      'https://gateway.ai.cloudflare.com/v1/account/gateway/custom-tuzi';
    process.env.CLOUDFLARE_AI_GATEWAY_RUN_TOKEN = 'gateway-test-token';
    process.env.TUZI_VISION_MODEL = 'gemini-through-gateway';
    process.env.GEMINI_OFFICIAL_ENABLED = 'false';
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        choices: [
          {
            message: { content: JSON.stringify(completeModelResponse()) }
          }
        ]
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await callVisualQualityWithFallback({
      image: { mimeType: 'image/png', base64: 'aW1hZ2U=' },
      prompt: 'score this image'
    });

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(requestInit.headers).toMatchObject({
      Authorization: 'Bearer tuzi-test-key',
      'cf-aig-authorization': 'Bearer gateway-test-token'
    });
  });

  it('falls back to a distinct Tuzi text-capable connection', async () => {
    process.env.TUZI_API_KEY = JSON.stringify({
      _type: 'newapi_channel_conn',
      key: 'image-only-key',
      group: 'image'
    });
    process.env.TUZI_X_DEEPSEARCH_API_KEY = 'text-capable-key';
    process.env.TUZI_TEXT_BASE_URL = 'https://api.tu-zi.com';
    process.env.TUZI_VISION_MODEL = 'gemini-through-tuzi';
    process.env.GEMINI_OFFICIAL_ENABLED = 'false';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { error: { message: 'No available channel for group image' } },
          { status: 503 }
        )
      )
      .mockResolvedValueOnce(
        Response.json({
          choices: [
            { message: { content: JSON.stringify(completeModelResponse()) } }
          ]
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await callVisualQualityWithFallback({
      image: { mimeType: 'image/png', base64: 'aW1hZ2U=' },
      prompt: 'score this image'
    });

    expect(result.model).toBe('gemini-through-tuzi');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer image-only-key'
    });
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer text-capable-key'
    });
  });

  it('defers active and backoff records while keeping expired failures eligible', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();
    const withState = (
      state: Record<string, unknown>
    ): ImageVisualQualityGenerationRow => ({
      ...row,
      metadata: {
        visualQualityAuditState: {
          evaluatorVersion: 'image-recipe-visual-v1',
          attempts: 1,
          updatedAt: new Date().toISOString(),
          ...state
        }
      }
    });

    expect(
      shouldScoreImageVisualQualitySweepRow(
        withState({ status: 'evaluating', leaseExpiresAt: future })
      )
    ).toBe(false);
    expect(
      shouldScoreImageVisualQualitySweepRow(
        withState({ status: 'failed', nextRetryAt: future })
      )
    ).toBe(false);
    expect(
      shouldScoreImageVisualQualitySweepRow(
        withState({ status: 'failed', nextRetryAt: past })
      )
    ).toBe(true);

    process.env.IMAGE_VISUAL_QUALITY_MAX_ATTEMPTS = '3';
    expect(
      shouldScoreImageVisualQualitySweepRow(
        withState({ status: 'failed', attempts: 3, nextRetryAt: past })
      )
    ).toBe(false);
    expect(
      shouldScoreImageVisualQualitySweepRow(
        withState({ status: 'failed', attempts: 2, nextRetryAt: past })
      )
    ).toBe(true);
  });

  it('keeps the automatic sweep disabled unless explicitly enabled', async () => {
    await expect(runImageVisualQualitySweep()).resolves.toEqual({
      scanned: 0,
      attempted: 0,
      completed: 0,
      failed: 0,
      skippedReason: 'disabled'
    });
  });

  it('paginates past already-scored rows instead of starving older work', async () => {
    const currentAudit = normalizeImageVisualQualityResponse({
      value: completeModelResponse(),
      model: 'gemini-test',
      row
    });
    const rows: ImageVisualQualityGenerationRow[] = [
      {
        ...row,
        id: 'scored-1',
        metadata: { visualQualityAudit: currentAudit }
      },
      {
        ...row,
        id: 'scored-2',
        metadata: { visualQualityAudit: currentAudit }
      },
      { ...row, id: 'pending-older', metadata: {} }
    ];
    const query = {
      select: () => query,
      gte: () => query,
      order: () => query,
      range: async (start: number, end: number) => ({
        data: rows.slice(start, end + 1),
        error: null
      })
    };
    const supabase = {
      from: () => query
    } as unknown as SupabaseClient;

    const result = await findImageVisualQualitySweepCandidates({
      supabase,
      cutoff: new Date('2026-07-16T00:00:00.000Z'),
      limit: 1,
      pageSize: 2,
      maxScanRows: 10
    });

    expect(result.scanned).toBe(3);
    expect(result.candidates.map((item) => item.id)).toEqual(['pending-older']);
  });
});
