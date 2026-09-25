import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type RuntimeQueryBackend = 'memory' | 'file' | 'supabase';

export function getRuntimeQueryMode(): RuntimeQueryBackend {
  const mode = (process.env.SKILL_RUNTIME_STORE_MODE || 'memory').trim().toLowerCase();
  if (mode === 'supabase') return 'supabase';
  if (mode === 'file') return 'file';
  return 'memory';
}

export function getRuntimeSupabaseClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export function shouldPreferPersistentQuery(): boolean {
  return getRuntimeQueryMode() === 'supabase';
}
