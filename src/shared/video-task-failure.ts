import {
  buildArkVideoContent,
  type ArkVideoCreateInput
} from './ark-video-api';

export interface VideoTaskFailureDetails {
  code: string;
  category: string;
  message: string;
  requestId?: string;
  retryable: boolean;
}

const REQUEST_ID_PATTERN = /request[\s_-]*id\s*[:：]\s*([a-z0-9][a-z0-9-]*)/i;
const REAL_PERSON_IMAGE_PATTERN =
  /\b(?:input\s+)?image(?:\s+['"]?content\[\d+\]['"]?)?\s+may\s+contain\s+(?:a\s+)?real\s+person\b/i;

function rejectedImageLabel(
  message: string,
  input?: Partial<ArkVideoCreateInput>
): string {
  const index = message.match(/\bcontent\[(\d+)\]/i)?.[1];
  if (!input || index === undefined) return '输入图片';
  // Use the provider's actual content order; videos/audio can precede frames.
  const content = buildArkVideoContent(input);
  const item = content[Number(index)];
  if (item?.role === 'first_frame') return '首帧图片';
  if (item?.role === 'last_frame') return '尾帧图片';
  if (item?.role === 'reference_image') {
    const number = content
      .slice(0, Number(index) + 1)
      .filter((entry) => entry.role === 'reference_image').length;
    return `第 ${number} 张参考图`;
  }
  return '输入图片';
}

function readFailureMessage(
  errorMessage: unknown,
  resultPayload?: unknown
): string {
  if (typeof errorMessage === 'string' && errorMessage.trim()) {
    return errorMessage.trim();
  }
  if (!resultPayload || typeof resultPayload !== 'object') return '';
  const payload = resultPayload as Record<string, unknown>;
  for (const key of ['message', 'error', 'detail', 'reason']) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function describeVideoTaskFailure(
  errorMessage: unknown,
  resultPayload?: unknown,
  referenceInput?: Partial<ArkVideoCreateInput>
): VideoTaskFailureDetails {
  const rawMessage = readFailureMessage(errorMessage, resultPayload);
  const requestId = rawMessage.match(REQUEST_ID_PATTERN)?.[1];
  const normalized = rawMessage.toLowerCase();

  const code =
    resultPayload && typeof resultPayload === 'object'
      ? (resultPayload as Record<string, unknown>).code
      : undefined;
  if (
    code === 'VIDEO_TASK_DEADLINE' ||
    code === 'VIDEO_CREATE_OUTCOME_UNKNOWN'
  ) {
    return {
      code,
      category:
        code === 'VIDEO_TASK_DEADLINE'
          ? 'pipeline_deadline'
          : 'provider_outcome_unknown',
      message:
        rawMessage ||
        (code === 'VIDEO_TASK_DEADLINE'
          ? '视频任务超过处理时限。'
          : '视频提交结果尚无法确认。'),
      requestId,
      retryable: code !== 'VIDEO_CREATE_OUTCOME_UNKNOWN'
    };
  }
  if (REAL_PERSON_IMAGE_PATTERN.test(rawMessage)) {
    return {
      code: 'REFERENCE_IMAGE_REAL_PERSON_REJECTED',
      category: 'provider_policy',
      message: `Seedance 检测到${rejectedImageLabel(rawMessage, referenceInput)}可能包含真人面孔，拒绝了本次生成。请移除该图片或更换为不含真人面孔的素材后重试；直接重试相同素材可能再次失败。`,
      requestId,
      retryable: false
    };
  }

  if (
    normalized.includes('content policy') ||
    normalized.includes('safety policy') ||
    normalized.includes('moderation') ||
    /内容.{0,8}(?:违规|安全|审核)|安全策略|敏感内容|未通过审核/.test(rawMessage)
  ) {
    return {
      code: 'VIDEO_CONTENT_POLICY_REJECTED',
      category: 'provider_policy',
      message:
        '提示词或参考素材未通过 Seedance 的内容安全检查。请调整相关内容后重试。',
      requestId,
      retryable: false
    };
  }

  if (
    normalized.includes('overload') ||
    normalized.includes('capacity') ||
    normalized.includes('负载已饱和')
  ) {
    return {
      code: 'VIDEO_PROVIDER_CAPACITY_LIMIT',
      category: 'provider_unavailable',
      message: 'Seedance 当前生成容量已满，请稍后重试。',
      requestId,
      retryable: true
    };
  }

  if (
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('超时')
  ) {
    return {
      code: 'VIDEO_PROVIDER_TIMEOUT',
      category: 'provider_timeout',
      message: 'Seedance 请求超时，请稍后重试。',
      requestId,
      retryable: true
    };
  }

  return {
    code: 'VIDEO_PROVIDER_FAILED',
    category: 'provider_unknown',
    message: rawMessage || '视频生成失败，请稍后重试。',
    requestId,
    retryable: true
  };
}
