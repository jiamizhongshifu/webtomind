import { createClient, type SupabaseClient } from '@supabase/supabase-js';
let auth: Promise<SupabaseClient> | undefined;
export let redirectsReady = false;
export function client() {
  if (!auth)
    auth = fetch('/api/siskill/auth-config', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw Error('AUTH_UNAVAILABLE');
        const config = await r.json();
        if (
          !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(config.url) ||
          typeof config.anonKey !== 'string'
        )
          throw Error('AUTH_UNAVAILABLE');
        redirectsReady = config.redirectsReady === true;
        return createClient(config.url, config.anonKey, {
          auth: {
            storageKey: 'siskill.auth',
            flowType: 'pkce',
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        });
      })
      .catch((e) => {
        auth = undefined;
        throw e;
      });
  return auth;
}
