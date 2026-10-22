/**
 * /api/skill-catalog/* request handlers. Registered explicitly in
 * workers/webtomind.ts.
 *
 * GET  /api/skill-catalog                      catalog list / filter / search
 * GET  /api/skill-catalog/skills/:slug         Skill detail
 * POST /api/skill-catalog/device/code          RFC 8628 device authorization
 * POST /api/skill-catalog/device/token         RFC 8628 token polling
 * GET  /api/skill-catalog/device/verify        approval page lookup (user JWT)
 * POST /api/skill-catalog/device/verify        approve / deny (user JWT)
 * POST /api/skill-catalog/credentials/revoke   revoke a CLI credential
 * GET  /api/skill-catalog/me                   CLI account + entitlements
 * POST /api/skill-catalog/install              entitlement-checked download URL
 */

import { createClient } from '@supabase/supabase-js';
import {
  getCorsHeadersForRequest,
  getRuntimeEnvValue,
  verifyTokenAndGetUserId
} from '../utils/auth';
import { createPrivateR2DownloadUrl } from '../utils/media-storage/r2-s3-storage';
import {
  checkRateLimit,
  createRateLimitHeaders,
  type RateLimitConfig
} from '../utils/rate-limiter';
import {
  SkillCatalogError,
  authenticateCliRequest,
  decideDeviceAuthorization,
  describeCliAccount,
  describeDeviceAuthorization,
  exchangeDeviceCode,
  getBearerToken,
  getSkillDetail,
  parseCatalogFilter,
  requestSkillInstall,
  startDeviceAuthorization,
  type DownloadUrlSigner,
  type SkillCatalogStore
} from './service';
import { createSupabaseSkillCatalogStore } from './supabase-store';
import {
  AGENT_GUIDE_PATH,
  SKILL_GUIDE_PATH,
  renderAgentGuide,
  renderSkillGuide
} from './install-docs';

export const config = {
  runtime: 'edge'
};

export interface SkillCatalogHandlerDeps {
  getStore: () => SkillCatalogStore | null;
  signDownloadUrl: DownloadUrlSigner;
  verifyUserToken: (token: string) => Promise<string | null>;
  appUrl: () => string;
}

const DEVICE_CODE_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000,
  maxRequests: 10,
  keyPrefix: 'skill-device-code'
};
const DEVICE_TOKEN_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000,
  maxRequests: 60,
  keyPrefix: 'skill-device-token'
};
const DEVICE_VERIFY_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000,
  maxRequests: 20,
  keyPrefix: 'skill-device-verify'
};
const INSTALL_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000,
  maxRequests: 60,
  keyPrefix: 'skill-install'
};

const defaultDeps: SkillCatalogHandlerDeps = {
  getStore() {
    const url = getRuntimeEnvValue('SUPABASE_URL');
    const key = getRuntimeEnvValue('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return null;
    return createSupabaseSkillCatalogStore(
      createClient(url, key, { auth: { persistSession: false } })
    );
  },
  signDownloadUrl: ({ objectKey, expiresIn }) =>
    createPrivateR2DownloadUrl({ key: objectKey, expiresIn }),
  verifyUserToken: verifyTokenAndGetUserId,
  appUrl: () => getRuntimeEnvValue('APP_URL') || 'https://webtomind.com'
};

function clientIp(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('Content-Type') || '';
  try {
    if (contentType.includes('application/x-www-form-urlencoded')) {
      return Object.fromEntries(new URLSearchParams(await request.text()));
    }
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    throw new SkillCatalogError('INVALID_REQUEST', 'Invalid JSON body');
  }
}

export function createSkillCatalogHandlers(
  deps: SkillCatalogHandlerDeps = defaultDeps
) {
  function respond(
    request: Request,
    data: unknown,
    status = 200,
    extraHeaders: Record<string, string> = {}
  ) {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...getCorsHeadersForRequest(request),
        ...extraHeaders
      }
    });
  }

  function wrap(
    methods: string[],
    handle: (request: Request, store: SkillCatalogStore) => Promise<Response>,
    rateLimit?: { config: RateLimitConfig; key: (request: Request) => string }
  ) {
    return async (request: Request): Promise<Response> => {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: getCorsHeadersForRequest(request)
        });
      }
      if (!methods.includes(request.method)) {
        return respond(request, { error: 'Method not allowed' }, 405);
      }
      if (rateLimit) {
        const result = checkRateLimit(rateLimit.key(request), rateLimit.config);
        if (!result.allowed) {
          return respond(
            request,
            { error: 'Too many requests', code: 'RATE_LIMITED' },
            429,
            createRateLimitHeaders(result)
          );
        }
      }
      const store = deps.getStore();
      if (!store) {
        return respond(request, { error: 'Database not configured' }, 500);
      }
      try {
        return await handle(request, store);
      } catch (error) {
        if (error instanceof SkillCatalogError) {
          return respond(
            request,
            { error: error.message, code: error.code, ...error.details },
            error.status
          );
        }
        console.error('[SkillCatalog] Request failed:', {
          path: new URL(request.url).pathname,
          message: error instanceof Error ? error.message : 'Unknown error'
        });
        return respond(request, { error: 'Internal error', code: 'INTERNAL' }, 500);
      }
    };
  }

  async function requireUser(request: Request): Promise<string> {
    const token = getBearerToken(request);
    const userId = token ? await deps.verifyUserToken(token) : null;
    if (!userId) {
      throw new SkillCatalogError('AUTH_REQUIRED', 'Sign in to continue');
    }
    return userId;
  }

  const list = wrap(['GET'], async (request, store) => {
    const filter = parseCatalogFilter(new URL(request.url).searchParams);
    const result = await store.listSkills(filter);
    return respond(request, {
      items: result.items,
      total: result.total,
      limit: filter.limit,
      offset: filter.offset
    });
  });

  const detail = wrap(['GET'], async (request, store) => {
    const slug = decodeURIComponent(
      new URL(request.url).pathname.split('/').pop() || ''
    );
    return respond(request, await getSkillDetail(store, slug));
  });

  const deviceCode = wrap(
    ['POST'],
    async (request, store) => {
      const body = await readJson(request);
      return respond(
        request,
        await startDeviceAuthorization(store, {
          clientName: body.client_name,
          clientVersion: body.client_version,
          appUrl: deps.appUrl()
        })
      );
    },
    { config: DEVICE_CODE_RATE_LIMIT, key: clientIp }
  );

  const deviceToken = wrap(
    ['POST'],
    async (request, store) => {
      const body = await readJson(request);
      const result = await exchangeDeviceCode(store, {
        grantType: body.grant_type,
        deviceCode: body.device_code
      });
      return result.ok
        ? respond(request, result.body)
        : respond(request, result.body, result.status);
    },
    { config: DEVICE_TOKEN_RATE_LIMIT, key: clientIp }
  );

  const deviceVerify = wrap(
    ['GET', 'POST'],
    async (request, store) => {
      const userId = await requireUser(request);
      if (request.method === 'GET') {
        const userCode = new URL(request.url).searchParams.get('user_code');
        return respond(request, await describeDeviceAuthorization(store, userCode));
      }
      const body = await readJson(request);
      return respond(
        request,
        await decideDeviceAuthorization(store, {
          userId,
          userCode: body.user_code,
          action: body.action
        })
      );
    },
    { config: DEVICE_VERIFY_RATE_LIMIT, key: clientIp }
  );

  // A CLI token revokes itself; a signed-in web user may revoke any of their
  // own credentials by id.
  const revokeCredential = wrap(['POST'], async (request, store) => {
    const token = getBearerToken(request);
    if (token?.startsWith('wtm_cli_')) {
      const credential = await authenticateCliRequest(store, request);
      await store.revokeCredential(credential.credentialId, credential.userId);
      return respond(request, { revoked: true });
    }
    const userId = await requireUser(request);
    const body = await readJson(request);
    if (typeof body.credential_id !== 'string') {
      throw new SkillCatalogError('INVALID_REQUEST', 'credential_id is required');
    }
    const revoked = await store.revokeCredential(body.credential_id, userId);
    return respond(request, { revoked });
  });

  const me = wrap(['GET'], async (request, store) => {
    const credential = await authenticateCliRequest(store, request);
    return respond(request, await describeCliAccount(store, credential));
  });

  const install = wrap(
    ['POST'],
    async (request, store) => {
      const credential = await authenticateCliRequest(store, request);
      const body = await readJson(request);
      return respond(
        request,
        await requestSkillInstall(
          { store, signDownloadUrl: deps.signDownloadUrl },
          credential,
          body
        )
      );
    },
    {
      config: INSTALL_RATE_LIMIT,
      key: (request) => getBearerToken(request)?.slice(0, 24) || clientIp(request)
    }
  );

  // Markdown install guides for agents. Public and cacheable; no secrets.
  async function installGuide(request: Request): Promise<Response> {
    const markdown = (body: string, status = 200) =>
      new Response(body, {
        status,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Cache-Control': status === 200 ? 'public, max-age=300' : 'no-store',
          'X-Content-Type-Options': 'nosniff'
        }
      });
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return markdown('Method not allowed\n', 405);
    }
    const { pathname } = new URL(request.url);
    const appUrl = deps.appUrl().replace(/\/+$/, '');
    if (pathname === AGENT_GUIDE_PATH) return markdown(renderAgentGuide(appUrl));

    const slug = SKILL_GUIDE_PATH.exec(pathname)?.[1];
    const store = deps.getStore();
    if (!slug || !store) return markdown('# Skill not found\n', 404);
    try {
      return markdown(renderSkillGuide(appUrl, await getSkillDetail(store, slug)));
    } catch (error) {
      if (error instanceof SkillCatalogError && error.code === 'SKILL_NOT_FOUND') {
        return markdown(`# Skill not found\n\nBrowse ${appUrl}/en-US/skills instead.\n`, 404);
      }
      console.error('[SkillCatalog] Install guide failed:', {
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      return markdown('# Temporarily unavailable\n', 503);
    }
  }

  return {
    installGuide,
    list,
    detail,
    deviceCode,
    deviceToken,
    deviceVerify,
    revokeCredential,
    me,
    install
  };
}

export const skillCatalogHandlers = createSkillCatalogHandlers();
export const SKILL_CATALOG_DETAIL_PATH = /^\/api\/skill-catalog\/skills\/[^/]+$/;

export function isSkillInstallGuidePath(pathname: string): boolean {
  return pathname === AGENT_GUIDE_PATH || SKILL_GUIDE_PATH.test(pathname);
}
