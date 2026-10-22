/**
 * Public Skill catalog: listing, details, CLI device authorization (RFC 8628)
 * and entitlement-checked installs. Persistence is behind SkillCatalogStore so
 * the rules here are testable without a database.
 */

export const SKILL_AGENTS = [
  'claude-code',
  'codex',
  'cursor',
  'gemini',
  'kimi-code',
  'antigravity',
  'trae'
] as const;
export type SkillAgent = (typeof SKILL_AGENTS)[number];

export const SKILL_OUTPUT_TYPES = ['image', 'slides', 'video', 'web'] as const;
export const SKILL_CATALOG_SORTS = [
  'featured',
  'trending',
  'top_rated',
  'newest'
] as const;
export type SkillCatalogSort = (typeof SKILL_CATALOG_SORTS)[number];

export const CLI_TOKEN_PREFIX = 'wtm_cli_';
export const CLI_SCOPE = 'skills:download';
export const DEVICE_CODE_TTL_SECONDS = 600;
export const DEVICE_POLL_INTERVAL_SECONDS = 5;
export const INSTALL_URL_TTL_SECONDS = 300;
export const DEVICE_CODE_GRANT_TYPE =
  'urn:ietf:params:oauth:grant-type:device_code';

// Excludes vowels and look-alike letters, matching the database check.
const USER_CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ';
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$/;
const USER_CODE_PATTERN = /^[B-DF-HJ-NP-TV-Z]{4}-[B-DF-HJ-NP-TV-Z]{4}$/;

export type SkillCatalogErrorCode =
  | 'INVALID_REQUEST'
  | 'SKILL_NOT_FOUND'
  | 'SKILL_VERSION_NOT_FOUND'
  | 'SKILL_AGENT_UNSUPPORTED'
  | 'SKILL_ENTITLEMENT_REQUIRED'
  | 'CLI_CREDENTIAL_MISSING'
  | 'CLI_CREDENTIAL_INVALID'
  | 'CLI_CREDENTIAL_REVOKED'
  | 'CLI_CREDENTIAL_EXPIRED'
  | 'DEVICE_CODE_NOT_FOUND'
  | 'DEVICE_CODE_EXPIRED'
  | 'AUTH_REQUIRED'
  | 'STORAGE_NOT_CONFIGURED';

const ERROR_STATUS: Record<SkillCatalogErrorCode, number> = {
  INVALID_REQUEST: 400,
  SKILL_NOT_FOUND: 404,
  SKILL_VERSION_NOT_FOUND: 404,
  SKILL_AGENT_UNSUPPORTED: 422,
  SKILL_ENTITLEMENT_REQUIRED: 403,
  CLI_CREDENTIAL_MISSING: 401,
  CLI_CREDENTIAL_INVALID: 401,
  CLI_CREDENTIAL_REVOKED: 401,
  CLI_CREDENTIAL_EXPIRED: 401,
  DEVICE_CODE_NOT_FOUND: 404,
  DEVICE_CODE_EXPIRED: 410,
  AUTH_REQUIRED: 401,
  STORAGE_NOT_CONFIGURED: 503
};

export class SkillCatalogError extends Error {
  readonly status: number;
  constructor(
    readonly code: SkillCatalogErrorCode,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SkillCatalogError';
    this.status = ERROR_STATUS[code];
  }
}

export interface CatalogListFilter {
  query: string | null;
  outputType: string | null;
  scene: string | null;
  tier: 'free' | 'premium' | null;
  sort: SkillCatalogSort;
  limit: number;
  offset: number;
}

export interface CatalogListItem {
  slug: string;
  name: Record<string, string>;
  summary: Record<string, string>;
  outputTypes: string[];
  sceneTags: string[];
  languages: string[];
  tier: 'free' | 'premium';
  isFeatured: boolean;
  installCount: number;
  installs7d: number;
  ratingAvg: number | null;
  ratingCount: number;
  latestVersion: string | null;
  compatibleAgents: string[];
  publishedAt: string | null;
  coverUrl: string | null;
}

export interface SkillVersionRecord {
  id: string;
  version: string;
  status: 'published' | 'yanked' | 'draft';
  r2ObjectKey: string;
  archiveFormat: 'tar.gz';
  sha256: string;
  sizeBytes: number;
  compatibleAgents: string[];
  changelog: Record<string, string>;
  publishedAt: string | null;
}

export interface SkillExampleRecord {
  versionId: string;
  mediaType: string;
  mediaUrl: string;
  posterUrl: string | null;
  title: Record<string, string>;
  description: Record<string, string>;
}

export interface SkillRecord {
  id: string;
  slug: string;
  name: Record<string, string>;
  summary: Record<string, string>;
  description: Record<string, string>;
  outputTypes: string[];
  sceneTags: string[];
  languages: string[];
  tier: 'free' | 'premium';
  installCount: number;
  ratingAvg: number | null;
  ratingCount: number;
  latestVersionId: string | null;
  publishedAt: string | null;
}

export type DevicePollResult =
  | { status: 'issued'; credentialId: string; userId: string; expiresAt: string }
  | { status: 'authorization_pending' }
  | { status: 'slow_down'; interval: number }
  | { status: 'expired_token' }
  | { status: 'access_denied' }
  | { status: 'invalid_grant' };

export type CredentialLookup =
  | { status: 'active'; credentialId: string; userId: string; expiresAt: string }
  | { status: 'invalid' | 'revoked' | 'expired' };

export type SkillAccess =
  | { allowed: true; source: 'free' | 'subscription' | 'lifetime' | 'single_purchase' }
  | { allowed: false; reason: string };

export interface PendingDeviceAuthorization {
  userCode: string;
  clientName: string | null;
  clientVersion: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface SkillCatalogStore {
  listSkills(
    filter: CatalogListFilter
  ): Promise<{ items: CatalogListItem[]; total: number }>;
  getPublishedSkill(slug: string): Promise<SkillRecord | null>;
  listPublishedVersions(skillId: string): Promise<SkillVersionRecord[]>;
  listExamples(versionIds: string[]): Promise<SkillExampleRecord[]>;
  createDeviceAuthorization(input: {
    deviceCodeHash: string;
    userCode: string;
    clientName: string | null;
    clientVersion: string | null;
    expiresAt: string;
    intervalSeconds: number;
  }): Promise<'created' | 'user_code_conflict'>;
  findPendingDeviceAuthorization(
    userCode: string
  ): Promise<PendingDeviceAuthorization | null>;
  decideDeviceAuthorization(
    userCode: string,
    userId: string,
    approve: boolean
  ): Promise<'approved' | 'denied' | 'not_found' | 'expired'>;
  pollDeviceAuthorization(input: {
    deviceCodeHash: string;
    tokenHash: string;
    tokenPrefix: string;
  }): Promise<DevicePollResult>;
  authenticateCredential(tokenHash: string): Promise<CredentialLookup>;
  revokeCredential(credentialId: string, userId: string): Promise<boolean>;
  getSkillAccess(userId: string, skillId: string): Promise<SkillAccess>;
  listActiveEntitlements(userId: string): Promise<
    Array<{ source: string; skillId: string | null; endsAt: string | null }>
  >;
  recordInstall(input: {
    userId: string;
    skillId: string;
    versionId: string;
    agent: SkillAgent | null;
    credentialId: string;
    entitlementSource: string;
  }): Promise<string>;
}

export type DownloadUrlSigner = (input: {
  objectKey: string;
  expiresIn: number;
}) => Promise<string | null>;

// ---------------------------------------------------------------------------
// Crypto helpers (Web Crypto: works in Workers and Node)
// ---------------------------------------------------------------------------

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256Hex(value: string): Promise<string> {
  return toHex(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  );
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generateUserCode(): string {
  // 256 is not a multiple of 20; reject the biased tail.
  const chars: string[] = [];
  while (chars.length < 8) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= 240 || chars.length >= 8) continue;
      chars.push(USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length]);
    }
  }
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

export function normalizeUserCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const compact = value.toUpperCase().replace(/[^A-Z]/g, '');
  if (compact.length !== 8) return null;
  const code = `${compact.slice(0, 4)}-${compact.slice(4)}`;
  return USER_CODE_PATTERN.test(code) ? code : null;
}

export function getBearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

export function isSkillAgent(value: unknown): value is SkillAgent {
  return (
    typeof value === 'string' &&
    (SKILL_AGENTS as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export function parseCatalogFilter(params: URLSearchParams): CatalogListFilter {
  const outputType = params.get('output_type');
  const tier = params.get('tier');
  const sort = params.get('sort') || 'featured';
  const limit = Number(params.get('limit') || 24);
  const offset = Number(params.get('offset') || 0);

  if (
    outputType &&
    !(SKILL_OUTPUT_TYPES as readonly string[]).includes(outputType)
  ) {
    throw new SkillCatalogError('INVALID_REQUEST', 'Unknown output_type');
  }
  if (tier && tier !== 'free' && tier !== 'premium') {
    throw new SkillCatalogError('INVALID_REQUEST', 'Unknown tier');
  }
  if (!(SKILL_CATALOG_SORTS as readonly string[]).includes(sort)) {
    throw new SkillCatalogError('INVALID_REQUEST', 'Unknown sort');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new SkillCatalogError('INVALID_REQUEST', 'limit must be 1-100');
  }
  if (!Number.isInteger(offset) || offset < 0 || offset > 10000) {
    throw new SkillCatalogError('INVALID_REQUEST', 'Invalid offset');
  }

  return {
    query: cleanText(params.get('q'), 100),
    outputType,
    scene: cleanText(params.get('scene'), 60),
    tier: (tier as 'free' | 'premium' | null) || null,
    sort: sort as SkillCatalogSort,
    limit,
    offset
  };
}

export async function getSkillDetail(store: SkillCatalogStore, slug: string) {
  if (!SLUG_PATTERN.test(slug)) {
    throw new SkillCatalogError('SKILL_NOT_FOUND', 'Skill not found');
  }
  const skill = await store.getPublishedSkill(slug);
  if (!skill) throw new SkillCatalogError('SKILL_NOT_FOUND', 'Skill not found');

  const versions = await store.listPublishedVersions(skill.id);
  const latest =
    versions.find((version) => version.id === skill.latestVersionId) ||
    versions[0] ||
    null;
  const examples = latest ? await store.listExamples([latest.id]) : [];

  return {
    slug: skill.slug,
    name: skill.name,
    summary: skill.summary,
    description: skill.description,
    outputTypes: skill.outputTypes,
    sceneTags: skill.sceneTags,
    languages: skill.languages,
    tier: skill.tier,
    installCount: skill.installCount,
    ratingAvg: skill.ratingAvg,
    ratingCount: skill.ratingCount,
    publishedAt: skill.publishedAt,
    latestVersion: latest?.version ?? null,
    compatibleAgents: latest?.compatibleAgents ?? [],
    installCommand: `npx webtomind-cli install ${skill.slug}`,
    versions: versions.map((version) => ({
      version: version.version,
      sha256: version.sha256,
      sizeBytes: version.sizeBytes,
      compatibleAgents: version.compatibleAgents,
      changelog: version.changelog,
      publishedAt: version.publishedAt
    })),
    examples: examples.map((example) => ({
      mediaType: example.mediaType,
      mediaUrl: example.mediaUrl,
      posterUrl: example.posterUrl,
      title: example.title,
      description: example.description
    }))
  };
}

// ---------------------------------------------------------------------------
// Device authorization
// ---------------------------------------------------------------------------

export async function startDeviceAuthorization(
  store: SkillCatalogStore,
  input: { clientName?: unknown; clientVersion?: unknown; appUrl: string },
  now = new Date()
) {
  const deviceCode = randomBase64Url(32);
  const deviceCodeHash = await sha256Hex(deviceCode);
  const expiresAt = new Date(
    now.getTime() + DEVICE_CODE_TTL_SECONDS * 1000
  ).toISOString();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const userCode = generateUserCode();
    const result = await store.createDeviceAuthorization({
      deviceCodeHash,
      userCode,
      clientName: cleanText(input.clientName, 120),
      clientVersion: cleanText(input.clientVersion, 40),
      expiresAt,
      intervalSeconds: DEVICE_POLL_INTERVAL_SECONDS
    });
    if (result === 'user_code_conflict') continue;

    const verificationUri = new URL('/cli/device', input.appUrl).toString();
    const complete = new URL(verificationUri);
    complete.searchParams.set('user_code', userCode);
    return {
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: verificationUri,
      verification_uri_complete: complete.toString(),
      expires_in: DEVICE_CODE_TTL_SECONDS,
      interval: DEVICE_POLL_INTERVAL_SECONDS
    };
  }
  throw new Error('Unable to allocate a unique device user code');
}

export async function describeDeviceAuthorization(
  store: SkillCatalogStore,
  rawUserCode: unknown,
  now = new Date()
) {
  const userCode = normalizeUserCode(rawUserCode);
  if (!userCode) {
    throw new SkillCatalogError('DEVICE_CODE_NOT_FOUND', 'Unknown device code');
  }
  const pending = await store.findPendingDeviceAuthorization(userCode);
  if (!pending) {
    throw new SkillCatalogError('DEVICE_CODE_NOT_FOUND', 'Unknown device code');
  }
  if (new Date(pending.expiresAt).getTime() <= now.getTime()) {
    throw new SkillCatalogError('DEVICE_CODE_EXPIRED', 'Device code expired');
  }
  return { ...pending, scope: CLI_SCOPE };
}

export async function decideDeviceAuthorization(
  store: SkillCatalogStore,
  input: { userId: string; userCode: unknown; action: unknown }
) {
  const userCode = normalizeUserCode(input.userCode);
  if (!userCode) {
    throw new SkillCatalogError('DEVICE_CODE_NOT_FOUND', 'Unknown device code');
  }
  if (input.action !== 'approve' && input.action !== 'deny') {
    throw new SkillCatalogError(
      'INVALID_REQUEST',
      'action must be approve or deny'
    );
  }
  const result = await store.decideDeviceAuthorization(
    userCode,
    input.userId,
    input.action === 'approve'
  );
  if (result === 'not_found') {
    throw new SkillCatalogError('DEVICE_CODE_NOT_FOUND', 'Unknown device code');
  }
  if (result === 'expired') {
    throw new SkillCatalogError('DEVICE_CODE_EXPIRED', 'Device code expired');
  }
  return { status: result };
}

export type DeviceTokenResponse =
  | {
      ok: true;
      body: {
        access_token: string;
        token_type: 'Bearer';
        scope: typeof CLI_SCOPE;
        expires_at: string;
      };
    }
  | {
      ok: false;
      status: number;
      body: { error: string; error_description: string; interval?: number };
    };

/** RFC 8628 section 3.4/3.5 token request. */
export async function exchangeDeviceCode(
  store: SkillCatalogStore,
  input: { grantType: unknown; deviceCode: unknown }
): Promise<DeviceTokenResponse> {
  if (input.grantType !== DEVICE_CODE_GRANT_TYPE) {
    return {
      ok: false,
      status: 400,
      body: {
        error: 'unsupported_grant_type',
        error_description: `grant_type must be ${DEVICE_CODE_GRANT_TYPE}`
      }
    };
  }
  if (typeof input.deviceCode !== 'string' || input.deviceCode.length > 128) {
    return {
      ok: false,
      status: 400,
      body: { error: 'invalid_request', error_description: 'Missing device_code' }
    };
  }

  const token = `${CLI_TOKEN_PREFIX}${randomBase64Url(32)}`;
  const result = await store.pollDeviceAuthorization({
    deviceCodeHash: await sha256Hex(input.deviceCode),
    tokenHash: await sha256Hex(token),
    tokenPrefix: token.slice(0, CLI_TOKEN_PREFIX.length + 4)
  });

  switch (result.status) {
    case 'issued':
      return {
        ok: true,
        body: {
          access_token: token,
          token_type: 'Bearer',
          scope: CLI_SCOPE,
          expires_at: result.expiresAt
        }
      };
    case 'authorization_pending':
      return {
        ok: false,
        status: 400,
        body: {
          error: 'authorization_pending',
          error_description: 'Waiting for browser approval'
        }
      };
    case 'slow_down':
      return {
        ok: false,
        status: 400,
        body: {
          error: 'slow_down',
          error_description: 'Polling too frequently',
          interval: result.interval
        }
      };
    case 'expired_token':
      return {
        ok: false,
        status: 400,
        body: {
          error: 'expired_token',
          error_description: 'The device code expired; run login again'
        }
      };
    case 'access_denied':
      return {
        ok: false,
        status: 400,
        body: {
          error: 'access_denied',
          error_description: 'The request was denied in the browser'
        }
      };
    default:
      return {
        ok: false,
        status: 400,
        body: {
          error: 'invalid_grant',
          error_description: 'Unknown or already used device code'
        }
      };
  }
}

// ---------------------------------------------------------------------------
// CLI credentials
// ---------------------------------------------------------------------------

export async function authenticateCliRequest(
  store: SkillCatalogStore,
  request: Request
): Promise<{ credentialId: string; userId: string; expiresAt: string }> {
  const token = getBearerToken(request);
  if (!token) {
    throw new SkillCatalogError(
      'CLI_CREDENTIAL_MISSING',
      'Run `npx webtomind-cli login` first'
    );
  }
  if (!token.startsWith(CLI_TOKEN_PREFIX) || token.length > 128) {
    throw new SkillCatalogError('CLI_CREDENTIAL_INVALID', 'Invalid CLI credential');
  }
  const result = await store.authenticateCredential(await sha256Hex(token));
  if (result.status === 'active') {
    return {
      credentialId: result.credentialId,
      userId: result.userId,
      expiresAt: result.expiresAt
    };
  }
  if (result.status === 'revoked') {
    throw new SkillCatalogError('CLI_CREDENTIAL_REVOKED', 'CLI credential was revoked; run login again');
  }
  if (result.status === 'expired') {
    throw new SkillCatalogError('CLI_CREDENTIAL_EXPIRED', 'CLI credential expired; run login again');
  }
  throw new SkillCatalogError('CLI_CREDENTIAL_INVALID', 'Invalid CLI credential');
}

export async function describeCliAccount(
  store: SkillCatalogStore,
  credential: { userId: string; expiresAt: string }
) {
  const entitlements = await store.listActiveEntitlements(credential.userId);
  const premium = entitlements.some((entitlement) => !entitlement.skillId);
  return {
    userId: credential.userId,
    scope: CLI_SCOPE,
    credentialExpiresAt: credential.expiresAt,
    premiumAccess: premium,
    entitlements
  };
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

export async function requestSkillInstall(
  deps: { store: SkillCatalogStore; signDownloadUrl: DownloadUrlSigner },
  credential: { credentialId: string; userId: string },
  body: { slug?: unknown; version?: unknown; agent?: unknown }
) {
  const { store, signDownloadUrl } = deps;
  if (typeof body.slug !== 'string' || !SLUG_PATTERN.test(body.slug)) {
    throw new SkillCatalogError('INVALID_REQUEST', 'Invalid skill slug');
  }
  if (
    body.version !== undefined &&
    body.version !== null &&
    (typeof body.version !== 'string' || !VERSION_PATTERN.test(body.version))
  ) {
    throw new SkillCatalogError('INVALID_REQUEST', 'Invalid version');
  }
  if (body.agent !== undefined && body.agent !== null && !isSkillAgent(body.agent)) {
    throw new SkillCatalogError('INVALID_REQUEST', 'Unknown agent', {
      supportedAgents: SKILL_AGENTS
    });
  }
  const agent = (body.agent as SkillAgent | null | undefined) ?? null;

  const skill = await store.getPublishedSkill(body.slug);
  if (!skill) throw new SkillCatalogError('SKILL_NOT_FOUND', 'Skill not found');

  const versions = await store.listPublishedVersions(skill.id);
  const version = body.version
    ? versions.find((candidate) => candidate.version === body.version)
    : versions.find((candidate) => candidate.id === skill.latestVersionId) ||
      versions[0];
  if (!version || version.status !== 'published') {
    throw new SkillCatalogError('SKILL_VERSION_NOT_FOUND', 'Skill version not found');
  }
  if (
    agent &&
    version.compatibleAgents.length > 0 &&
    !version.compatibleAgents.includes(agent)
  ) {
    throw new SkillCatalogError(
      'SKILL_AGENT_UNSUPPORTED',
      `${skill.slug}@${version.version} does not support ${agent}`,
      { compatibleAgents: version.compatibleAgents }
    );
  }

  const access = await store.getSkillAccess(credential.userId, skill.id);
  if (!access.allowed) {
    throw new SkillCatalogError(
      'SKILL_ENTITLEMENT_REQUIRED',
      'This premium Skill requires an active Pro subscription, lifetime access or a purchase',
      { slug: skill.slug, tier: skill.tier, upgradeUrl: '/skills/pricing' }
    );
  }

  const downloadUrl = await signDownloadUrl({
    objectKey: version.r2ObjectKey,
    expiresIn: INSTALL_URL_TTL_SECONDS
  });
  if (!downloadUrl) {
    throw new SkillCatalogError('STORAGE_NOT_CONFIGURED', 'Skill storage is not configured');
  }

  const installId = await store.recordInstall({
    userId: credential.userId,
    skillId: skill.id,
    versionId: version.id,
    agent,
    credentialId: credential.credentialId,
    entitlementSource: access.source
  });

  return {
    installId,
    slug: skill.slug,
    version: version.version,
    archiveFormat: version.archiveFormat,
    sha256: version.sha256,
    sizeBytes: version.sizeBytes,
    downloadUrl,
    expiresIn: INSTALL_URL_TTL_SECONDS,
    entitlementSource: access.source
  };
}
