import { describe, expect, it } from 'vitest';
import {
  extractApiErrorMessage,
  toUserFacingError
} from '../user-facing-error';

describe('user-facing errors', () => {
  it('separates complete failure and refund sentences without duplicate punctuation', () => {
    expect(
      extractApiErrorMessage(
        {
          error: '参考图片未通过检查。',
          details: '本次扣除的积分已自动退回。',
          requestId: 'req-video'
        },
        '视频生成失败'
      )
    ).toBe(
      '参考图片未通过检查。本次扣除的积分已自动退回。（请求编号：req-video）'
    );
  });

  it('keeps the API summary, details, and request id', () => {
    expect(
      extractApiErrorMessage(
        {
          error: '提示词优化服务暂时不可用',
          details:
            'gemini_official: location unsupported | tuzi: request timed out',
          requestId: 'req-123'
        },
        '提示词优化失败'
      )
    ).toBe(
      '提示词优化服务暂时不可用：gemini_official: location unsupported | tuzi: request timed out（请求编号：req-123）'
    );
  });

  it('explains browser network failures instead of exposing only Failed to fetch', () => {
    expect(
      toUserFacingError(
        new TypeError('Failed to fetch'),
        '视频生成失败。',
        'zh-CN'
      )
    ).toContain('无法连接服务器');
  });
});
