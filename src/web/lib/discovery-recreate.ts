const DISCOVERY_RECREATE_STORAGE_PREFIX = 'webtomind:discovery-recreate:';
const DISCOVERY_RECREATE_TTL_MS = 10 * 60 * 1000;

export interface DiscoveryRecreatePayload {
  prompt: string;
  createdAt: number;
}

function createImportKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createDiscoveryRecreateUrl(
  prefix: string,
  prompt: string
): string {
  const params = new URLSearchParams({
    newSession: '1',
    source: 'discovery_recreate'
  });
  const normalizedPrompt = prompt.trim();

  if (typeof window !== 'undefined') {
    try {
      const key = createImportKey();
      const payload: DiscoveryRecreatePayload = {
        prompt: normalizedPrompt,
        createdAt: Date.now()
      };
      window.localStorage.setItem(
        `${DISCOVERY_RECREATE_STORAGE_PREFIX}${key}`,
        JSON.stringify(payload)
      );
      params.set('recreateKey', key);
      return `${prefix}/image?${params.toString()}`;
    } catch {
      // Fall through to a URL payload when storage is unavailable.
    }
  }

  params.set('prompt', normalizedPrompt);
  return `${prefix}/image?${params.toString()}`;
}

export function consumeDiscoveryRecreatePayload(
  key: string
): DiscoveryRecreatePayload | null {
  if (!key || typeof window === 'undefined') return null;
  const storageKey = `${DISCOVERY_RECREATE_STORAGE_PREFIX}${key}`;
  try {
    const raw = window.localStorage.getItem(storageKey);
    window.localStorage.removeItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DiscoveryRecreatePayload>;
    if (
      typeof parsed.prompt !== 'string' ||
      !parsed.prompt.trim() ||
      typeof parsed.createdAt !== 'number' ||
      Date.now() - parsed.createdAt > DISCOVERY_RECREATE_TTL_MS
    ) {
      return null;
    }
    return { prompt: parsed.prompt.trim(), createdAt: parsed.createdAt };
  } catch {
    return null;
  }
}
