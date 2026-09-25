/**
 * Shared Supabase client used by both web and extension code.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '@/utils/logger';

const log = createLogger('Supabase');

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabase) {
    log.info('[Supabase] Initializing client...', {
      hasUrl: !!SUPABASE_URL,
      hasKey: !!SUPABASE_ANON_KEY,
      urlPrefix: SUPABASE_URL?.substring(0, 30) || 'empty'
    });

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      log.warn('[Supabase] Missing configuration, using placeholder');
      supabase = createClient(
        SUPABASE_URL || 'https://placeholder.supabase.co',
        SUPABASE_ANON_KEY || 'placeholder-key'
      );
    } else {
      try {
        supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storage:
              typeof window !== 'undefined' ? window.localStorage : undefined,
            storageKey: 'webtomind-auth-token'
          }
        });
        log.info('[Supabase] Client created successfully');
      } catch (error) {
        log.error('[Supabase] Failed to create client:', error);
        supabase = createClient(
          'https://placeholder.supabase.co',
          'placeholder-key'
        );
      }
    }
  }

  return supabase;
}

export { supabase };
export default getSupabase;
