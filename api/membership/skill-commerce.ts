import type { SupabaseClient } from '@supabase/supabase-js';
import {
  hasPaidSubscriptionAccess,
  blocksNewSubscriptionCheckout
} from './subscription-policy';

export class SkillCommerceError extends Error {
  constructor(
    readonly code: string,
    readonly status = 409
  ) {
    super(code);
  }
}

export async function readSkillAccess(db: SupabaseClient, userId: string) {
  const [grants, legacy, subscriptions] = await Promise.all([
    db
      .from('skill_entitlements')
      .select('skill_id,source,starts_at,ends_at,status')
      .eq('user_id', userId)
      .eq('status', 'active'),
    db
      .from('user_subscriptions')
      .select('status,current_period_end,subscription_plans(skill_tier_access)')
      .eq('user_id', userId),
    db
      .from('skill_subscriptions')
      .select(
        'id,plan_id,status,current_period_end,stripe_subscription_id,payment_provider,cancel_at_period_end'
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
  ]);
  if (grants.error || legacy.error || subscriptions.error)
    throw new SkillCommerceError('SKILL_ACCESS_UNAVAILABLE', 503);
  const now = Date.now();
  const active = (grants.data || []).filter(
    (e) =>
      Date.parse(e.starts_at) <= now &&
      (!e.ends_at || Date.parse(e.ends_at) > now)
  );
  const legacyPremium = (legacy.data || []).some((s) => {
    const plan = s.subscription_plans as unknown as {
      skill_tier_access?: string;
    } | null;
    return (
      plan?.skill_tier_access === 'premium' && hasPaidSubscriptionAccess(s)
    );
  });
  return {
    premiumAccess: legacyPremium || active.some((e) => e.skill_id === null),
    ownedSkillIds: active
      .filter((e) => e.skill_id)
      .map((e) => e.skill_id as string),
    subscriptions: subscriptions.data || []
  };
}

export async function quoteSkillProduct(
  db: SupabaseClient,
  userId: string,
  productId: string,
  type: 'skill_purchase' | 'skill_subscription',
  cycle: 'monthly' | 'yearly'
) {
  const { data: product, error } = await db
    .from('skill_products')
    .select('*')
    .eq('id', productId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw new SkillCommerceError('SKILL_PRODUCTS_UNAVAILABLE', 503);
  if (
    !product ||
    product.kind !== (type === 'skill_purchase' ? 'single' : 'subscription')
  )
    throw new SkillCommerceError('SKILL_PRODUCT_NOT_FOUND', 404);
  const access = await readSkillAccess(db, userId);
  if (access.premiumAccess)
    throw new SkillCommerceError('SKILL_ACCESS_ALREADY_INCLUDED');
  if (
    type === 'skill_subscription' &&
    access.subscriptions.some((s) => blocksNewSubscriptionCheckout(s))
  )
    throw new SkillCommerceError('ACTIVE_SKILL_SUBSCRIPTION_EXISTS');
  let skillId: string | null = null;
  let version: string | null = null;
  let sha256: string | null = null;
  if (type === 'skill_purchase') {
    const { data: skill, error: skillError } = await db
      .from('skill_catalog')
      .select('id,latest_version_id')
      .eq('slug', product.skill_slug)
      .eq('status', 'published')
      .eq('tier', 'premium')
      .maybeSingle();
    if (skillError)
      throw new SkillCommerceError('SKILL_PRODUCTS_UNAVAILABLE', 503);
    if (!skill?.latest_version_id)
      throw new SkillCommerceError('SKILL_NOT_READY');
    skillId = skill.id;
    if (access.ownedSkillIds.includes(skill.id))
      throw new SkillCommerceError('SKILL_ALREADY_OWNED');
    const { data: release, error: releaseError } = await db
      .from('skill_catalog_versions')
      .select('version,sha256')
      .eq('id', skill.latest_version_id)
      .eq('skill_id', skill.id)
      .eq('status', 'published')
      .maybeSingle();
    if (releaseError || !release)
      throw new SkillCommerceError('SKILL_NOT_READY');
    version = release.version;
    sha256 = release.sha256;
  }
  const annual = type === 'skill_subscription' && cycle === 'yearly';
  const usd = annual ? product.yearly_usd : product.price_usd;
  const cny = annual ? product.yearly_cny : product.price_cny;
  if (![usd, cny].every((n) => Number.isSafeInteger(n) && n > 0))
    throw new SkillCommerceError('SKILL_PRICE_INVALID', 503);
  return {
    usd,
    cny,
    name: product.name,
    snapshot: {
      productId,
      kind: product.kind,
      skillId,
      slug: product.skill_slug,
      version,
      sha256,
      contractVersion: product.contract_version,
      usd,
      cny,
      workspaceCredits: 0,
      scope: 'webtomind-studio'
    }
  };
}
