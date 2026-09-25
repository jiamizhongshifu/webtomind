const NETWORK_ERROR_PATTERN =
  /failed to fetch|load failed|network(?: request)? failed|networkerror/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function firstMeaningfulMessage(
  record: Record<string, unknown>,
  keys: string[]
): string {
  for (const key of keys) {
    const value = record[key];
    const message = formatApiErrorMessage(value, '');
    if (message) return message;
  }
  return '';
}

export function formatApiErrorMessage(
  value: unknown,
  fallback: string
): string {
  if (typeof value === 'string') {
    return value.trim() || fallback;
  }
  if (isRecord(value)) {
    const nestedMessage = firstMeaningfulMessage(value, [
      'message',
      'error',
      'details',
      'detail',
      'reason'
    ]);
    if (nestedMessage) return nestedMessage;
    try {
      const serialized = JSON.stringify(value);
      return serialized && serialized !== '{}' ? serialized : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export function extractApiErrorMessage(
  result: unknown,
  fallback: string
): string {
  if (!isRecord(result)) return fallback;

  const summary = firstMeaningfulMessage(result, ['error', 'message']);
  const details = firstMeaningfulMessage(result, [
    'details',
    'detail',
    'reason'
  ]);
  const requestId = firstMeaningfulMessage(result, [
    'requestId',
    'request_id',
    'traceId',
    'trace_id'
  ]);

  const parts = [summary || fallback];
  if (details && details !== summary) {
    parts.push(details);
  }
  let message = parts.join(/[。！？.!?]$/.test(parts[0]) ? '' : '：');
  if (requestId && !message.includes(requestId)) {
    message += `（请求编号：${requestId}）`;
  }
  return message;
}

export function toUserFacingError(
  error: unknown,
  fallback: string,
  locale: 'zh-CN' | 'en-US' = 'zh-CN'
): string {
  const message =
    error instanceof Error
      ? error.message.trim()
      : typeof error === 'string'
        ? error.trim()
        : '';
  if (!message) return fallback;
  if (!NETWORK_ERROR_PATTERN.test(message)) return message;

  return locale === 'en-US'
    ? `${fallback} The server could not be reached. Check your connection or proxy, then retry. (Original error: ${message})`
    : `${fallback} 无法连接服务器，请检查网络或代理后重试。（原始错误：${message}）`;
}
