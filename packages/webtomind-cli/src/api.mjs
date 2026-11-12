import { CliError, EXIT } from './errors.mjs';

export const DEFAULT_API_URL = 'https://webtomind.com';
export const DEVICE_CODE_GRANT_TYPE =
  'urn:ietf:params:oauth:grant-type:device_code';

const AUTH_CODES = new Set([
  'CLI_CREDENTIAL_MISSING',
  'CLI_CREDENTIAL_INVALID',
  'CLI_CREDENTIAL_REVOKED',
  'CLI_CREDENTIAL_EXPIRED'
]);

export function resolveApiUrl(env = process.env) {
  const value = env.WEBTOMIND_API_URL || DEFAULT_API_URL;
  const url = new URL(value);
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !isLocal) {
    throw new CliError('INSECURE_API_URL', 'WEBTOMIND_API_URL must use https');
  }
  return url.origin;
}

/**
 * @param {{ baseUrl: string, token?: string | null, fetchImpl?: typeof fetch, userAgent?: string }} options
 */
export function createApiClient({ baseUrl, token = null, fetchImpl = fetch, userAgent }) {
  async function call(method, path, body, { auth = false, raw = false } = {}) {
    const headers = { Accept: 'application/json' };
    if (userAgent) headers['User-Agent'] = userAgent;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) {
      if (!token) {
        throw new CliError('NOT_LOGGED_IN', 'Not logged in. Run `npx webtomind-cli login`.', {
          exitCode: EXIT.AUTH
        });
      }
      headers.Authorization = `Bearer ${token}`;
    }
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (error) {
      throw new CliError('NETWORK_ERROR', `Cannot reach ${baseUrl}: ${error.message}`);
    }
    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }
    if (raw) return { status: response.status, data };
    if (!response.ok) {
      const code = typeof data.code === 'string' ? data.code : `HTTP_${response.status}`;
      const exitCode = AUTH_CODES.has(code)
        ? EXIT.AUTH
        : code === 'SKILL_ENTITLEMENT_REQUIRED'
          ? EXIT.ENTITLEMENT
          : EXIT.ERROR;
      throw new CliError(code, data.error || `Request failed (${response.status})`, {
        exitCode,
        details: data
      });
    }
    return data;
  }

  return {
    baseUrl,
    deviceCode: (input) => call('POST', '/api/skill-catalog/device/code', input),
    deviceToken: (deviceCode) =>
      call(
        'POST',
        '/api/skill-catalog/device/token',
        { grant_type: DEVICE_CODE_GRANT_TYPE, device_code: deviceCode },
        { raw: true }
      ),
    me: () => call('GET', '/api/skill-catalog/me', undefined, { auth: true }),
    revoke: () =>
      call('POST', '/api/skill-catalog/credentials/revoke', {}, { auth: true }),
    install: (input) =>
      call('POST', '/api/skill-catalog/install', input, { auth: true }),
    catalog: (params = {}) => {
      const query = new URLSearchParams(
        Object.entries(params).filter(([, value]) => value !== undefined && value !== null)
      );
      const suffix = query.toString() ? `?${query}` : '';
      return call('GET', `/api/skill-catalog${suffix}`);
    }
  };
}
