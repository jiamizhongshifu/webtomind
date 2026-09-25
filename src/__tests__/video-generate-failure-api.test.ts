import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractApiErrorMessage } from '../shared/errors/user-facing-error';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  fetch: vi.fn()
}));
vi.mock('../../api/utils/auth.js', () => ({
  getCorsHeadersForRequest: () => ({}),
  getSupabaseAdmin: mocks.admin,
  getUserIdFromRequest: async () => 'user-1'
}));
vi.mock('../../api/utils/model-rate-limit.js', () => ({
  consumeModelRateLimit: async () => ({ allowed: true }),
  createModelRateLimitResponse: vi.fn()
}));
vi.mock('../../api/utils/model-fetch.js', () => ({
  fetchModelWithTimeout: mocks.fetch
}));
import handler from '../../api/video/generate';

describe('video submission failure feedback', () => {
  beforeEach(() => {
    vi.stubEnv('ARK_VIDEO_GENERATION_ENABLED', 'true');
    vi.stubEnv('ARK_VIDEO_LAUNCH_ENABLED', 'true');
    vi.stubEnv('ARK_API_KEY', 'test-key');
    vi.stubEnv('VIDEO_QUEUE_PROVIDER', 'legacy');
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([true, false])(
    'explains provider rejection with refund success=%s',
    async (refundSucceeded) => {
      const rpc = vi.fn(async (name: string) => ({
        data:
          name === 'consume_credits'
            ? { success: true, consumed: 2432, credit_type: 'subscription' }
            : { success: refundSucceeded },
        error: null
      }));
      const query = {
        insert: vi.fn(() => query),
        select: vi.fn(() => query),
        single: vi.fn(async () => ({ data: { id: 'task-1' }, error: null })),
        update: vi.fn(() => query),
        eq: vi.fn(async () => ({ error: null }))
      };
      mocks.admin.mockReturnValue({ rpc, from: () => query });
      mocks.fetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'InputImageSensitiveContentDetected.PrivacyInformation',
              message:
                'The input image "content[1]" may contain real person. Request id: req-create'
            }
          }),
          { status: 400 }
        )
      );

      const response = await handler(
        new Request('https://webtomind.com/api/video/generate', {
          method: 'POST',
          body: JSON.stringify({
            prompt: 'A cinematic scene',
            model: 'seedance-2-5',
            referenceImageUrls: ['https://example.com/person.png']
          })
        })
      );
      const body = await response.json();
      expect(response.status).toBe(502);
      expect(body).toMatchObject({
        code: 'REFERENCE_IMAGE_REAL_PERSON_REJECTED',
        retryable: false,
        requestId: 'req-create',
        refundFailed: !refundSucceeded
      });
      const visibleMessage = extractApiErrorMessage(body, '视频生成失败');
      expect(visibleMessage).toContain('第 1 张参考图可能包含真人面孔');
      expect(visibleMessage).toContain(
        refundSucceeded ? '积分已自动退回' : '积分退款未完成'
      );
      expect(visibleMessage).toContain('请求编号：req-create');
      expect(visibleMessage).not.toContain('content[1]');
      expect(rpc).toHaveBeenCalledWith(
        'refund_generation_credit',
        expect.objectContaining({ p_amount: 2432 })
      );
    }
  );
});
