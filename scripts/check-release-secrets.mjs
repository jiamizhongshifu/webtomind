#!/usr/bin/env node

// Fail early with an actionable message when a CI release is missing the
// repository secrets required by the Cloudflare release chain. Mirrors the
// exact environment variable names the release scripts already consume so the
// workflow never fails deep inside wrangler/Supabase calls.

import process from 'node:process';

const REQUIRED = [
  {
    name: 'WEBTOMIND_CLOUDFLARE_ACCOUNT_ID',
    hint: 'Cloudflare account id (same value as WEBTOMIND_CLOUDFLARE_ACCOUNT_ID in the local credential store).'
  },
  {
    name: 'WEBTOMIND_CLOUDFLARE_WORKERS_API_TOKEN',
    hint: 'Cloudflare workers API token with Workers Scripts edit + production route write permission.'
  },
  {
    name: 'SUPABASE_URL',
    hint: 'Same value as SUPABASE_URL in .env.local (production project).'
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    hint: 'Same value as SUPABASE_SERVICE_ROLE_KEY in .env.local (production service role key).'
  },
  {
    name: 'WEBTOMIND_RUNTIME_ENV_B64',
    hint: 'base64 of ~/.config/webtomind/runtime-production.env (production build parity: VITE_* flags, Google OAuth, etc.). Generate with: base64 < ~/.config/webtomind/runtime-production.env | tr -d "\\n"'
  }
];

const missing = REQUIRED.filter(
  ({ name }) => !String(process.env[name] || '').trim()
);

if (missing.length > 0) {
  console.error(
    'FAIL GitHub Actions release secrets are not configured. Add them as repository secrets first:'
  );
  for (const { name, hint } of missing) {
    console.error(`  - ${name}: ${hint}`);
  }
  process.exit(1);
}

console.log(
  'PASS release secrets are configured for the Cloudflare release chain.'
);
