export interface TuziChannelConnection {
  apiKey: string;
  apiBaseUrl?: string;
  group?: string;
}

export function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === 'string' ? parsed.trim() : trimmed;
    } catch {
      return trimmed.slice(1, -1).trim();
    }
  }
  return trimmed;
}

export function isTuziNewApiChannelConnectionConfig(
  rawValue?: string
): boolean {
  const value = stripWrappingQuotes(rawValue || '');
  if (!value.startsWith('{')) return false;
  try {
    const parsed = JSON.parse(value) as { _type?: unknown };
    return parsed._type === 'newapi_channel_conn';
  } catch {
    return false;
  }
}

export function parseTuziChannelConnectionConfig(
  rawValue?: string
): TuziChannelConnection {
  const value = stripWrappingQuotes(rawValue || '');
  if (!value) return { apiKey: '' };

  if (value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value) as {
        key?: unknown;
        apiKey?: unknown;
        url?: unknown;
        baseUrl?: unknown;
        group?: unknown;
      };
      const apiKey =
        typeof parsed.key === 'string'
          ? parsed.key.trim()
          : typeof parsed.apiKey === 'string'
            ? parsed.apiKey.trim()
            : '';
      const apiBaseUrl =
        typeof parsed.url === 'string'
          ? parsed.url.trim()
          : typeof parsed.baseUrl === 'string'
            ? parsed.baseUrl.trim()
            : undefined;
      const group =
        typeof parsed.group === 'string' ? parsed.group.trim() : undefined;
      return { apiKey, apiBaseUrl, group };
    } catch {
      return { apiKey: value };
    }
  }

  return { apiKey: value };
}

export function normalizeOpenAICompatibleBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '');
  return /\/v\d+$/.test(normalized) ? normalized : `${normalized}/v1`;
}
