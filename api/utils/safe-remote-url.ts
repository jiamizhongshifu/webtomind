import { fetchModelWithTimeout } from './model-fetch';

export function isBlockedRemoteHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) return true;
  if (/^(127\.|0\.|10\.|169\.254\.|192\.168\.)/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  const carrierGradeNat = host.match(/^100\.(\d{1,3})\./);
  if (carrierGradeNat && Number(carrierGradeNat[1]) >= 64 && Number(carrierGradeNat[1]) <= 127) return true;
  if (host.startsWith('::ffff:')) {
    const mapped = host.slice(7);
    // URL serializes IPv4-mapped IPv6 as two hexadecimal words.
    const words = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(mapped);
    if (words) {
      const high = parseInt(words[1], 16);
      const low = parseInt(words[2], 16);
      return isBlockedRemoteHostname(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
    }
    return isBlockedRemoteHostname(mapped);
  }
  if (host.includes(':')) {
    return host === '::' || host === '::1' || host.startsWith('fc') || host.startsWith('fd') || /^fe[89ab][0-9a-f]:/.test(host);
  }
  const ipLike = /^[0-9.]+$/.test(host) || /^0x[0-9a-f.]+$/i.test(host);
  if (!ipLike) return false;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!ipv4) return true;
  return ipv4.slice(1).some((segment) => Number(segment) > 255 || (segment.length > 1 && segment.startsWith('0')));
}

export function validateHttpsRemoteUrl(value: string): URL {
  if (value.length > 4096) throw new Error('Remote URL is too long');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid remote URL');
  }
  if (url.protocol !== 'https:' || isBlockedRemoteHostname(url.hostname)) {
    throw new Error('Untrusted remote URL');
  }
  if (url.username || url.password) throw new Error('Remote URL credentials are not allowed');
  return url;
}

export async function fetchTrustedRemoteWithTimeout(
  value: string,
  init: RequestInit = {},
  timeoutMs = 60_000,
  maxRedirects = 3
): Promise<Response> {
  let current = validateHttpsRemoteUrl(value);
  let headers = new Headers(init.headers);
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await fetchModelWithTimeout(
      current,
      { ...init, headers, redirect: 'manual' },
      { timeoutMs, label: 'trusted remote fetch' }
    );
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    if (!location || redirectCount === maxRedirects) throw new Error('Too many or invalid redirects');
    const next = validateHttpsRemoteUrl(new URL(location, current).toString());
    if (next.origin !== current.origin) {
      headers = new Headers(headers);
      headers.delete('authorization');
      headers.delete('cookie');
    }
    current = next;
  }
  throw new Error('Too many redirects');
}
