#!/usr/bin/env node
// Grants premium Skill entitlements to subscriptions that are paid right now
// (see public.backfill_subscription_skill_entitlements). Dry run by default;
// pass --apply to write. Safe to re-run: grants are idempotent per order.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/backfill-skill-entitlements.mjs [--apply] [--user=<uuid>]

import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const apply = process.argv.includes('--apply');
const userId =
  process.argv.find((arg) => arg.startsWith('--user='))?.slice(7) || null;
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});
const { data, error } = await supabase.rpc(
  'backfill_subscription_skill_entitlements',
  { p_apply: apply, p_user_id: userId }
);
if (error) {
  console.error(`Backfill failed: ${error.message}`);
  process.exit(1);
}

const unmatched = Array.isArray(data?.unmatched) ? data.unmatched : [];
console.log(
  JSON.stringify(
    {
      ...data,
      // Report ids only; never print emails or payment details.
      unmatched: unmatched.map((row) => ({
        user_subscription_id: row.user_subscription_id,
        plan_id: row.plan_id,
        payment_provider: row.payment_provider
      }))
    },
    null,
    2
  )
);
if (!apply) console.log('Dry run. Re-run with --apply to write.');
