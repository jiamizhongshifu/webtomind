import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getImageModelReadiness,
  imageModelReadinessFailure
} from '../../api/image/model-readiness';
import {
  handleImageGenerateRequest,
  executeImageGenerationJob,
  sanitizeImageGenerateInput
} from '../../api/image/generate';

const { db } = vi.hoisted(() => ({ db: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('../../api/utils/auth.js', () => ({
  getUserIdFromRequest: () => 'test-user',
  getCorsHeadersForRequest: () => ({}),
  getSupabaseAdmin: () => db
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db }));
function database(result: { data: unknown; error: unknown }) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'or', 'order'])
    query[method] = vi.fn(() => query);
  query.single = vi.fn(async () => ({
    data: { status: 'running' },
    error: null
  }));
  query.limit = vi.fn(async () => result);
  db.from.mockReturnValue(query);
  return query;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SUPABASE_URL', 'https://fixture.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fixture-key');
});
afterEach(() => vi.unstubAllEnvs());

describe('known image model configuration failures', () => {
  it('holds an unpriced model until a later successful attempt supersedes it', async () => {
    const q = database({
      data: [
        {
          status: 'failed',
          error_message:
            'Model seedream-5-0-pro has not been priced by the administrator yet.'
        }
      ],
      error: null
    });
    expect(await getImageModelReadiness(db as never, 'seedream-5-pro')).toBe(
      'configuration_required'
    );
    expect(q.eq).toHaveBeenCalledWith('model', 'seedream-5-0-pro');
    q.limit.mockResolvedValue({
      data: [{ status: 'succeeded', error_message: null }],
      error: null
    });
    expect(await getImageModelReadiness(db as never, 'seedream-5-pro')).toBe(
      'ready'
    );
  });
  it('does not equate a failed lookup to readiness', async () => {
    database({ data: null, error: { message: 'offline' } });
    expect(await getImageModelReadiness(db as never, 'seedream-5-lite')).toBe(
      'unknown'
    );
    expect(imageModelReadinessFailure('unknown')?.errorDetails.retryable).toBe(
      true
    );
  });
  it.each([true, false])(
    'rejects direct API submission before billing or queue creation (async=%s)',
    async (async) => {
      database({
        data: [{ status: 'failed', error_message: '模型价格尚未由管理员配置' }],
        error: null
      });
      const response = await handleImageGenerateRequest(
        new Request('https://example.test/api/image/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'seedream-5-lite',
            prompt: 'A blue ceramic cup',
            async
          })
        })
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        error: 'IMAGE_MODEL_CONFIGURATION_REQUIRED',
        errorDetails: { category: 'provider_configuration', retryable: false }
      });
      expect(
        db.from.mock.calls.every(
          ([table]) => table === 'image_generation_attempts'
        )
      ).toBe(true);
      expect(db.rpc).not.toHaveBeenCalled();
    }
  );
  it('refunds an already prepaid queued job without calling the provider', async () => {
    database({
      data: [{ status: 'failed', error_message: 'Model has not been priced' }],
      error: null
    });
    db.rpc.mockResolvedValue({
      data: { success: true, refunded: 60 },
      error: null
    });
    const input = sanitizeImageGenerateInput({
      model: 'seedream-5-lite',
      prompt: 'A blue ceramic cup'
    });
    if (!input.ok) throw new Error('invalid fixture');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await executeImageGenerationJob({
        request: new Request('https://example.test/api/image/generate'),
        userId: 'test-user',
        sanitizedInput: input.value,
        sb: db as never,
        options: {
          mode: 'queued',
          taskId: 'test-task',
          prepaidCredit: { consumed: 60, creditType: 'bonus' }
        }
      });
      expect(result.ok).toBe(false);
      expect(result.failureDetails).toMatchObject({
        category: 'provider_configuration',
        retryable: false
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(db.rpc).toHaveBeenCalledWith(
        'refund_generation_credit',
        expect.objectContaining({ p_amount: 60 })
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
