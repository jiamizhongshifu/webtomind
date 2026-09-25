import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSupabaseAdminMock, getUserIdFromRequestMock } = vi.hoisted(() => ({
  getSupabaseAdminMock: vi.fn(),
  getUserIdFromRequestMock: vi.fn()
}));

vi.mock('../../api/utils/auth.js', () => ({
  getCorsHeadersForRequest: () => ({}),
  getSupabaseAdmin: getSupabaseAdminMock,
  getUserIdFromRequest: getUserIdFromRequestMock
}));

import handler from '../../api/video/task';

describe('video task API failure response', () => {
  beforeEach(() => {
    getUserIdFromRequestMock.mockResolvedValue('user-1');
    getSupabaseAdminMock.mockReset();
  });

  it.each([false, true])(
    'returns the indexed reason and refund failure=%s',
    async (refundFailed) => {
      const task = {
        id: 'task-1',
        user_id: 'user-1',
        status: 'failed',
        provider: 'volcengine_ark',
        provider_task_id: null,
        request_payload: {
          referenceImageUrls: ['https://example.com/person.png']
        },
        result_payload: {
          error: 'VIDEO_PROVIDER_FAILED',
          phase: 'create'
        },
        error_message:
          "The request failed because the input image 'content[1]' may contain real person. Request id: req-123",
        refund_failed: refundFailed,
        generation_id: null,
        created_at: '2026-07-25T06:01:37.703Z',
        updated_at: '2026-07-25T06:01:50.687Z'
      };
      const single = vi.fn().mockResolvedValue({ data: task, error: null });
      const secondEq = vi.fn(() => ({ single }));
      const firstEq = vi.fn(() => ({ eq: secondEq }));
      const select = vi.fn(() => ({ eq: firstEq }));
      getSupabaseAdminMock.mockReturnValue({
        from: vi.fn(() => ({ select }))
      });

      const response = await handler(
        new Request('https://webtomind.com/api/video/task?id=task-1')
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        success: false,
        status: 'failed',
        error:
          'Seedance 检测到第 1 张参考图可能包含真人面孔，拒绝了本次生成。请移除该图片或更换为不含真人面孔的素材后重试；直接重试相同素材可能再次失败。',
        code: 'REFERENCE_IMAGE_REAL_PERSON_REJECTED',
        requestId: 'req-123',
        retryable: false,
        details: refundFailed
          ? '本次积分退款未完成，请联系管理员协助处理。'
          : '本次扣除的积分已自动退回。',
        refundFailed
      });
    }
  );
});
