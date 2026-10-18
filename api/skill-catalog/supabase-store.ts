import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CatalogListItem,
  CredentialLookup,
  DevicePollResult,
  SkillAccess,
  SkillCatalogStore,
  SkillExampleRecord,
  SkillRecord,
  SkillVersionRecord
} from './service';

type Row = Record<string, unknown>;

const asRecord = (value: unknown): Record<string, string> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, string>)
    : {};
const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String) : [];
const asNumber = (value: unknown): number => Number(value ?? 0) || 0;
const asNullableNumber = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);
const asNullableString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

function throwIf(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function mapSkill(row: Row): SkillRecord {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: asRecord(row.name),
    summary: asRecord(row.summary),
    description: asRecord(row.description),
    outputTypes: asStrings(row.output_types),
    sceneTags: asStrings(row.scene_tags),
    languages: asStrings(row.languages),
    tier: row.tier === 'premium' ? 'premium' : 'free',
    installCount: asNumber(row.install_count),
    ratingAvg: asNullableNumber(row.rating_avg),
    ratingCount: asNumber(row.rating_count),
    latestVersionId: asNullableString(row.latest_version_id),
    publishedAt: asNullableString(row.published_at)
  };
}

function mapVersion(row: Row): SkillVersionRecord {
  return {
    id: String(row.id),
    version: String(row.version),
    status: row.status as SkillVersionRecord['status'],
    r2ObjectKey: String(row.r2_object_key),
    archiveFormat: 'tar.gz',
    sha256: String(row.sha256),
    sizeBytes: asNumber(row.size_bytes),
    compatibleAgents: asStrings(row.compatible_agents),
    changelog: asRecord(row.changelog),
    publishedAt: asNullableString(row.published_at)
  };
}

function compareSemverDesc(a: SkillVersionRecord, b: SkillVersionRecord) {
  const parse = (value: string) =>
    value.split('-')[0].split('.').map((part) => Number(part));
  const [left, right] = [parse(a.version), parse(b.version)];
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return right[index] - left[index];
  }
  return (b.publishedAt || '').localeCompare(a.publishedAt || '');
}

export function createSupabaseSkillCatalogStore(
  db: SupabaseClient
): SkillCatalogStore {
  return {
    async listSkills(filter) {
      const { data, error } = await db.rpc('search_skill_catalog', {
        p_query: filter.query,
        p_output_type: filter.outputType,
        p_scene: filter.scene,
        p_tier: filter.tier,
        p_sort: filter.sort,
        p_limit: filter.limit,
        p_offset: filter.offset
      });
      throwIf(error);
      const rows = (data || []) as Row[];
      const items: CatalogListItem[] = rows.map((row) => ({
        slug: String(row.slug),
        name: asRecord(row.name),
        summary: asRecord(row.summary),
        outputTypes: asStrings(row.output_types),
        sceneTags: asStrings(row.scene_tags),
        languages: asStrings(row.languages),
        tier: row.tier === 'premium' ? 'premium' : 'free',
        isFeatured: Boolean(row.is_featured),
        installCount: asNumber(row.install_count),
        installs7d: asNumber(row.installs_7d),
        ratingAvg: asNullableNumber(row.rating_avg),
        ratingCount: asNumber(row.rating_count),
        latestVersion: asNullableString(row.latest_version),
        compatibleAgents: asStrings(row.compatible_agents),
        publishedAt: asNullableString(row.published_at)
      }));
      return { items, total: rows.length ? asNumber(rows[0].total_count) : 0 };
    },

    async getPublishedSkill(slug) {
      const { data, error } = await db
        .from('skill_catalog')
        .select(
          'id,slug,name,summary,description,output_types,scene_tags,languages,tier,install_count,rating_avg,rating_count,latest_version_id,published_at'
        )
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle();
      throwIf(error);
      return data ? mapSkill(data as Row) : null;
    },

    async listPublishedVersions(skillId) {
      const { data, error } = await db
        .from('skill_catalog_versions')
        .select(
          'id,version,status,r2_object_key,archive_format,sha256,size_bytes,compatible_agents,changelog,published_at'
        )
        .eq('skill_id', skillId)
        .eq('status', 'published');
      throwIf(error);
      return ((data || []) as Row[]).map(mapVersion).sort(compareSemverDesc);
    },

    async listExamples(versionIds) {
      if (versionIds.length === 0) return [];
      const { data, error } = await db
        .from('skill_catalog_examples')
        .select('version_id,media_type,media_url,poster_url,title,description')
        .in('version_id', versionIds)
        .order('sort_order', { ascending: true });
      throwIf(error);
      return ((data || []) as Row[]).map(
        (row): SkillExampleRecord => ({
          versionId: String(row.version_id),
          mediaType: String(row.media_type),
          mediaUrl: String(row.media_url),
          posterUrl: asNullableString(row.poster_url),
          title: asRecord(row.title),
          description: asRecord(row.description)
        })
      );
    },

    async createDeviceAuthorization(input) {
      const { error } = await db.from('cli_device_authorizations').insert({
        device_code_hash: input.deviceCodeHash,
        user_code: input.userCode,
        client_name: input.clientName,
        client_version: input.clientVersion,
        expires_at: input.expiresAt,
        interval_seconds: input.intervalSeconds
      });
      if (error?.code === '23505' && error.message.includes('user_code')) {
        return 'user_code_conflict';
      }
      throwIf(error);
      return 'created';
    },

    async findPendingDeviceAuthorization(userCode) {
      const { data, error } = await db
        .from('cli_device_authorizations')
        .select('user_code,client_name,client_version,created_at,expires_at')
        .eq('user_code', userCode)
        .eq('status', 'pending')
        .maybeSingle();
      throwIf(error);
      if (!data) return null;
      const row = data as Row;
      return {
        userCode: String(row.user_code),
        clientName: asNullableString(row.client_name),
        clientVersion: asNullableString(row.client_version),
        createdAt: String(row.created_at),
        expiresAt: String(row.expires_at)
      };
    },

    async decideDeviceAuthorization(userCode, userId, approve) {
      const { data, error } = await db.rpc('decide_cli_device_authorization', {
        p_user_code: userCode,
        p_user_id: userId,
        p_approve: approve
      });
      throwIf(error);
      return data as 'approved' | 'denied' | 'not_found' | 'expired';
    },

    async pollDeviceAuthorization(input) {
      const { data, error } = await db.rpc('poll_cli_device_authorization', {
        p_device_code_hash: input.deviceCodeHash,
        p_token_hash: input.tokenHash,
        p_token_prefix: input.tokenPrefix
      });
      throwIf(error);
      const row = (data || {}) as Row;
      if (row.status === 'issued') {
        return {
          status: 'issued',
          credentialId: String(row.credential_id),
          userId: String(row.user_id),
          expiresAt: String(row.expires_at)
        };
      }
      if (row.status === 'slow_down') {
        return { status: 'slow_down', interval: asNumber(row.interval) || 10 };
      }
      return { status: row.status } as DevicePollResult;
    },

    async authenticateCredential(tokenHash) {
      const { data, error } = await db.rpc('authenticate_cli_credential', {
        p_token_hash: tokenHash
      });
      throwIf(error);
      const row = (data || {}) as Row;
      if (row.status === 'active') {
        return {
          status: 'active',
          credentialId: String(row.credential_id),
          userId: String(row.user_id),
          expiresAt: String(row.expires_at)
        };
      }
      return {
        status:
          row.status === 'revoked' || row.status === 'expired'
            ? row.status
            : 'invalid'
      } as CredentialLookup;
    },

    async revokeCredential(credentialId, userId) {
      const { data, error } = await db
        .from('cli_credentials')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', credentialId)
        .eq('user_id', userId)
        .is('revoked_at', null)
        .select('id');
      throwIf(error);
      return Array.isArray(data) && data.length > 0;
    },

    async getSkillAccess(userId, skillId) {
      const { data, error } = await db.rpc('skill_catalog_user_access', {
        p_user_id: userId,
        p_skill_id: skillId
      });
      throwIf(error);
      const row = (data || {}) as Row;
      return row.allowed === true
        ? ({ allowed: true, source: row.source } as SkillAccess)
        : { allowed: false, reason: String(row.reason || 'entitlement_required') };
    },

    async listActiveEntitlements(userId) {
      const now = new Date().toISOString();
      const { data, error } = await db
        .from('skill_entitlements')
        .select('source,skill_id,ends_at')
        .eq('user_id', userId)
        .eq('status', 'active')
        .lte('starts_at', now)
        .or(`ends_at.is.null,ends_at.gt.${now}`);
      throwIf(error);
      return ((data || []) as Row[]).map((row) => ({
        source: String(row.source),
        skillId: asNullableString(row.skill_id),
        endsAt: asNullableString(row.ends_at)
      }));
    },

    async recordInstall(input) {
      const { data, error } = await db
        .from('skill_installs')
        .insert({
          user_id: input.userId,
          skill_id: input.skillId,
          version_id: input.versionId,
          agent: input.agent,
          credential_id: input.credentialId,
          entitlement_source: input.entitlementSource
        })
        .select('id')
        .single();
      throwIf(error);
      return String((data as Row).id);
    }
  };
}
