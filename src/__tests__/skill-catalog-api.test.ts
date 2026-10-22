// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSkillCatalogHandlers } from '../../api/skill-catalog/handlers';
import {
  DEVICE_CODE_GRANT_TYPE,
  sha256Hex,
  type DevicePollResult,
  type DownloadUrlSigner,
  type SkillCatalogStore,
  type SkillVersionRecord
} from '../../api/skill-catalog/service';

const VERSION: SkillVersionRecord = {
  id: 'ver-1',
  version: '1.2.0',
  status: 'published',
  r2ObjectKey: 'skills/launch-deck/1.2.0.tar.gz',
  archiveFormat: 'tar.gz',
  sha256: 'a'.repeat(64),
  sizeBytes: 2048,
  compatibleAgents: ['claude-code', 'codex'],
  changelog: {},
  publishedAt: '2026-10-01T00:00:00Z'
};

function skill(slug: string, tier: 'free' | 'premium') {
  return {
    id: `skill-${slug}`,
    slug,
    name: { en: slug },
    summary: {},
    description: {},
    outputTypes: ['slides'],
    sceneTags: [],
    languages: ['en'],
    tier,
    installCount: 0,
    ratingAvg: null,
    ratingCount: 0,
    latestVersionId: VERSION.id,
    publishedAt: '2026-10-01T00:00:00Z'
  };
}

function createStore(overrides: Partial<SkillCatalogStore> = {}) {
  const skills = {
    'launch-deck': skill('launch-deck', 'premium'),
    'xhs-cover': skill('xhs-cover', 'free')
  };
  const store: SkillCatalogStore = {
    listSkills: vi.fn(async () => ({ items: [], total: 0 })),
    getPublishedSkill: vi.fn(
      async (slug: string) => skills[slug as keyof typeof skills] ?? null
    ),
    listPublishedVersions: vi.fn(async () => [VERSION]),
    listExamples: vi.fn(async () => []),
    createDeviceAuthorization: vi.fn(async () => 'created' as const),
    findPendingDeviceAuthorization: vi.fn(async () => null),
    decideDeviceAuthorization: vi.fn(async () => 'approved' as const),
    pollDeviceAuthorization: vi.fn(
      async (): Promise<DevicePollResult> => ({ status: 'authorization_pending' })
    ),
    authenticateCredential: vi.fn(async () => ({
      status: 'active' as const,
      credentialId: 'cred-1',
      userId: 'user-1',
      expiresAt: '2027-04-01T00:00:00Z'
    })),
    revokeCredential: vi.fn(async () => true),
    getSkillAccess: vi.fn(async (_userId: string, skillId: string) =>
      skillId === 'skill-xhs-cover'
        ? { allowed: true as const, source: 'free' as const }
        : { allowed: false as const, reason: 'entitlement_required' }
    ),
    listActiveEntitlements: vi.fn(async () => []),
    recordInstall: vi.fn(async () => 'install-1'),
    ...overrides
  };
  return store;
}

let store: SkillCatalogStore;
let signDownloadUrl: ReturnType<typeof vi.fn<DownloadUrlSigner>>;
let handlers: ReturnType<typeof createSkillCatalogHandlers>;

beforeEach(() => {
  store = createStore();
  signDownloadUrl = vi.fn<DownloadUrlSigner>(async () => 'https://r2.test/signed?X-Amz-Signature=x');
  handlers = createSkillCatalogHandlers({
    getStore: () => store,
    signDownloadUrl,
    verifyUserToken: async (token) => (token === 'user-jwt' ? 'user-1' : null),
    appUrl: () => 'https://webtomind.test'
  });
});

const post = (path: string, body: unknown, token?: string) =>
  new Request(`https://webtomind.test${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });

describe('install', () => {
  it('rejects a premium Skill without entitlement and records nothing', async () => {
    const response = await handlers.install(
      post('/api/skill-catalog/install', { slug: 'launch-deck' }, 'wtm_cli_token')
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: 'SKILL_ENTITLEMENT_REQUIRED',
      slug: 'launch-deck',
      upgradeUrl: '/skills/pricing'
    });
    expect(signDownloadUrl).not.toHaveBeenCalled();
    expect(store.recordInstall).not.toHaveBeenCalled();
  });

  it('returns a short-lived signed URL and SHA-256 and records the install', async () => {
    const response = await handlers.install(
      post('/api/skill-catalog/install', { slug: 'xhs-cover', agent: 'codex' }, 'wtm_cli_token')
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      slug: 'xhs-cover',
      version: '1.2.0',
      sha256: VERSION.sha256,
      sizeBytes: 2048,
      downloadUrl: 'https://r2.test/signed?X-Amz-Signature=x',
      expiresIn: 300,
      entitlementSource: 'free'
    });
    expect(signDownloadUrl).toHaveBeenCalledWith({
      objectKey: VERSION.r2ObjectKey,
      expiresIn: 300
    });
    expect(store.recordInstall).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        versionId: 'ver-1',
        agent: 'codex',
        credentialId: 'cred-1',
        entitlementSource: 'free'
      })
    );
    expect(store.authenticateCredential).toHaveBeenCalledWith(
      await sha256Hex('wtm_cli_token')
    );
  });

  it('distinguishes missing, revoked and malformed credentials', async () => {
    const missing = await handlers.install(post('/api/skill-catalog/install', { slug: 'xhs-cover' }));
    expect(missing.status).toBe(401);
    expect((await missing.json()).code).toBe('CLI_CREDENTIAL_MISSING');

    const userJwt = await handlers.install(
      post('/api/skill-catalog/install', { slug: 'xhs-cover' }, 'user-jwt')
    );
    expect((await userJwt.json()).code).toBe('CLI_CREDENTIAL_INVALID');

    store.authenticateCredential = vi.fn(async () => ({ status: 'revoked' as const }));
    const revoked = await handlers.install(
      post('/api/skill-catalog/install', { slug: 'xhs-cover' }, 'wtm_cli_token')
    );
    expect(revoked.status).toBe(401);
    expect((await revoked.json()).code).toBe('CLI_CREDENTIAL_REVOKED');
  });

  it('rejects unknown Skills, versions and incompatible agents', async () => {
    const cases: Array<[unknown, number, string]> = [
      [{ slug: 'nope' }, 404, 'SKILL_NOT_FOUND'],
      [{ slug: 'xhs-cover', version: '9.9.9' }, 404, 'SKILL_VERSION_NOT_FOUND'],
      [{ slug: 'xhs-cover', agent: 'trae' }, 422, 'SKILL_AGENT_UNSUPPORTED'],
      [{ slug: 'xhs-cover', agent: 'emacs' }, 400, 'INVALID_REQUEST'],
      [{ slug: '../etc' }, 400, 'INVALID_REQUEST']
    ];
    for (const [body, status, code] of cases) {
      const response = await handlers.install(
        post('/api/skill-catalog/install', body, 'wtm_cli_token')
      );
      expect(response.status).toBe(status);
      expect((await response.json()).code).toBe(code);
    }
  });
});

describe('device authorization', () => {
  it('issues a device code with a verification URL and stores only hashes', async () => {
    const response = await handlers.deviceCode(
      post('/api/skill-catalog/device/code', { client_name: 'webtomind-cli on mac' })
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      verification_uri: 'https://webtomind.test/cli/device',
      expires_in: 600,
      interval: 5
    });
    expect(body.user_code).toMatch(/^[B-DF-HJ-NP-TV-Z]{4}-[B-DF-HJ-NP-TV-Z]{4}$/);
    const stored = vi.mocked(store.createDeviceAuthorization).mock.calls[0][0];
    expect(stored.deviceCodeHash).toBe(await sha256Hex(body.device_code));
    expect(JSON.stringify(stored)).not.toContain(body.device_code);
  });

  it('maps an expired device code to the RFC 8628 expired_token error', async () => {
    store.pollDeviceAuthorization = vi.fn(async () => ({ status: 'expired_token' as const }));
    const response = await handlers.deviceToken(
      post('/api/skill-catalog/device/token', {
        grant_type: DEVICE_CODE_GRANT_TYPE,
        device_code: 'abc'
      })
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('expired_token');
  });

  it('returns a credential once approved and persists only its hash', async () => {
    store.pollDeviceAuthorization = vi.fn(async () => ({
      status: 'issued' as const,
      credentialId: 'cred-2',
      userId: 'user-1',
      expiresAt: '2027-04-16T00:00:00Z'
    }));
    const response = await handlers.deviceToken(
      post('/api/skill-catalog/device/token', {
        grant_type: DEVICE_CODE_GRANT_TYPE,
        device_code: 'abc'
      })
    );
    const body = await response.json();
    expect(body).toMatchObject({ token_type: 'Bearer', scope: 'skills:download' });
    expect(body.access_token).toMatch(/^wtm_cli_/);
    const input = vi.mocked(store.pollDeviceAuthorization).mock.calls[0][0];
    expect(input.tokenHash).toBe(await sha256Hex(body.access_token));
    expect(input.deviceCodeHash).toBe(await sha256Hex('abc'));
  });

  it('rejects unsupported grant types', async () => {
    const response = await handlers.deviceToken(
      post('/api/skill-catalog/device/token', { grant_type: 'password', device_code: 'abc' })
    );
    expect((await response.json()).error).toBe('unsupported_grant_type');
    expect(store.pollDeviceAuthorization).not.toHaveBeenCalled();
  });

  it('requires a signed-in user to approve and reports expired codes', async () => {
    const anonymous = await handlers.deviceVerify(
      post('/api/skill-catalog/device/verify', { user_code: 'BCDF-GHJK', action: 'approve' })
    );
    expect(anonymous.status).toBe(401);

    const approved = await handlers.deviceVerify(
      post('/api/skill-catalog/device/verify', { user_code: 'bcdf ghjk', action: 'approve' }, 'user-jwt')
    );
    expect(await approved.json()).toEqual({ status: 'approved' });
    expect(store.decideDeviceAuthorization).toHaveBeenCalledWith('BCDF-GHJK', 'user-1', true);

    store.decideDeviceAuthorization = vi.fn(async () => 'expired' as const);
    const expired = await handlers.deviceVerify(
      post('/api/skill-catalog/device/verify', { user_code: 'BCDF-GHJK', action: 'approve' }, 'user-jwt')
    );
    expect(expired.status).toBe(410);
    expect((await expired.json()).code).toBe('DEVICE_CODE_EXPIRED');
  });

  it('lets a CLI credential revoke itself', async () => {
    const response = await handlers.revokeCredential(
      post('/api/skill-catalog/credentials/revoke', {}, 'wtm_cli_token')
    );
    expect(await response.json()).toEqual({ revoked: true });
    expect(store.revokeCredential).toHaveBeenCalledWith('cred-1', 'user-1');
  });
});

describe('catalog', () => {
  it('validates filters and returns paginated items', async () => {
    const bad = await handlers.list(
      new Request('https://webtomind.test/api/skill-catalog?sort=random')
    );
    expect(bad.status).toBe(400);

    const ok = await handlers.list(
      new Request('https://webtomind.test/api/skill-catalog?q=cover&output_type=image&tier=free&limit=10')
    );
    expect(ok.status).toBe(200);
    expect(store.listSkills).toHaveBeenCalledWith({
      query: 'cover',
      outputType: 'image',
      scene: null,
      tier: 'free',
      sort: 'featured',
      limit: 10,
      offset: 0
    });
  });

  it('serves details without exposing the R2 object key', async () => {
    const response = await handlers.detail(
      new Request('https://webtomind.test/api/skill-catalog/skills/launch-deck')
    );
    const body = await response.json();
    expect(body).toMatchObject({
      slug: 'launch-deck',
      latestVersion: '1.2.0',
      installCommand: 'npx webtomind-cli install launch-deck'
    });
    expect(JSON.stringify(body)).not.toContain(VERSION.r2ObjectKey);

    const missing = await handlers.detail(
      new Request('https://webtomind.test/api/skill-catalog/skills/missing')
    );
    expect(missing.status).toBe(404);
  });
});

describe('install guides', () => {
  const get = (path: string) => new Request(`https://webtomind.test${path}`);

  it('serves the agent connect guide as Markdown without secrets', async () => {
    const response = await handlers.installGuide(get('/install/agent.md'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/markdown');
    const body = await response.text();
    expect(body).toContain('npx --yes webtomind-cli@latest login');
    expect(body).toContain('https://webtomind.test/cli/device');
    expect(body).toContain('Do not ask the user to create or paste an API key');
  });

  it('lists per-agent commands and the upgrade path for a Pro Skill', async () => {
    const response = await handlers.installGuide(get('/install/skills/launch-deck.md'));
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('`npx --yes webtomind-cli@latest install launch-deck`');
    expect(body).toContain('install launch-deck --agent codex');
    expect(body).not.toContain('--agent cursor');
    expect(body).toContain('SKILL_ENTITLEMENT_REQUIRED');
    expect(body).not.toContain(VERSION.r2ObjectKey);
  });

  it('returns 404 Markdown for unknown Skills', async () => {
    const response = await handlers.installGuide(get('/install/skills/missing-skill.md'));
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
