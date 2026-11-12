import { createClient } from '@supabase/supabase-js';
import { getCorsHeadersForRequest } from '../utils/auth';
import { hasStripeCheckoutConfig } from '../utils/stripe-env';
import { hasZpayCheckoutConfig } from '../utils/zpay';
import { readSkillAccess } from './skill-commerce';

export const config = { runtime: 'edge' };

export default async function handler(request: Request) {
  const cors = getCorsHeadersForRequest(request);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        ...cors,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    });
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'GET')
    return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
  if (!url || !key) return json({ error: 'SKILL_PRODUCTS_UNAVAILABLE' }, 503);
  try {
    const db = createClient(url, key, { auth: { persistSession: false } });
    const token = request.headers
      .get('Authorization')
      ?.match(/^Bearer\s+(\S+)$/i)?.[1];
    let access = null;
    if (token) {
      const {
        data: { user },
        error
      } = await db.auth.getUser(token);
      if (error || !user) return json({ error: 'AUTH_REQUIRED' }, 401);
      access = await readSkillAccess(db, user.id);
    }
    const { data, error } = await db
      .from('skill_products')
      .select(
        'id,kind,name,skill_slug,price_usd,price_cny,yearly_usd,yearly_cny,contract_version'
      )
      .eq('is_active', true);
    if (error) throw error;
    // A configured single item must also have a published, installable version.
    const { data: skills, error: catalogError } = await db
      .from('skill_catalog')
      .select('id,slug,latest_version_id')
      .eq('status', 'published')
      .eq('tier', 'premium');
    if (catalogError) throw catalogError;
    const { data: versions, error: versionError } = await db
      .from('skill_catalog_versions')
      .select('id,skill_id')
      .eq('status', 'published');
    if (versionError) throw versionError;
    const published = (skills || []).filter((s) =>
      (versions || []).some(
        (v) => v.id === s.latest_version_id && v.skill_id === s.id
      )
    );
    const providers = [
      ...(hasStripeCheckoutConfig() ? ['stripe'] : []),
      ...(hasZpayCheckoutConfig() ? ['alipay'] : [])
    ];
    return json({
      products: (data || [])
        .filter(
          (p) =>
            p.kind === 'subscription' ||
            published.some((s) => s.slug === p.skill_slug)
        )
        .map((p) => ({
          id: p.id,
          kind: p.kind,
          name: p.name,
          slug: p.skill_slug,
          priceUsd: p.price_usd,
          priceCny: p.price_cny,
          yearlyUsd: p.yearly_usd,
          yearlyCny: p.yearly_cny,
          checkoutProviders: providers,
          checkoutEnabled: providers.length > 0,
          owned: Boolean(
            access?.premiumAccess ||
            (p.kind === 'single' &&
              published.some(
                (s) =>
                  s.slug === p.skill_slug &&
                  access?.ownedSkillIds.includes(s.id)
              ))
          )
        })),
      access: access
        ? {
            premiumAccess: access.premiumAccess,
            subscriptions: access.subscriptions.map((s) => ({
              id: s.id,
              status: s.status,
              endsAt: s.current_period_end,
              prepaid: s.payment_provider === 'zpay',
              cancelAtPeriodEnd: s.cancel_at_period_end
            }))
          }
        : null
    });
  } catch {
    return json({ error: 'SKILL_PRODUCTS_UNAVAILABLE' }, 503);
  }
}
