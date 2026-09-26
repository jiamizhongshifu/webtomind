import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Open-source build: there is no built-in admin outside tests. Set
// PROMPT_CASE_ADMIN_EMAILS (comma separated) to grant admin access.
export const DEFAULT_PROMPT_CASE_ADMIN_EMAIL =
  typeof process !== 'undefined' && process.env.NODE_ENV === 'test'
    ? 'admin@example.com'
    : '';
export const PROMPT_CASE_ADMIN_EMAIL = DEFAULT_PROMPT_CASE_ADMIN_EMAIL;

export type PromptCaseAdminAuthResult = {
  ok: boolean;
  status: number;
  email?: string;
  userId?: string;
  error?: string;
};

export function parseBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

export function getPromptCaseAdminEmails(
  value = process.env.PROMPT_CASE_ADMIN_EMAILS
): string[] {
  const emails = (value || DEFAULT_PROMPT_CASE_ADMIN_EMAIL)
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(emails));
}

export function isPromptCaseAdminEmail(email: unknown): boolean {
  if (typeof email !== 'string') return false;
  return getPromptCaseAdminEmails().includes(email.trim().toLowerCase());
}

export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function assertPromptCaseAdmin(
  request: Request,
  allowedEmails = getPromptCaseAdminEmails()
): Promise<PromptCaseAdminAuthResult> {
  const token = parseBearerToken(request);
  if (!token) {
    return { ok: false, status: 401, error: 'Missing Authorization header' };
  }

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { ok: false, status: 500, error: 'Supabase auth is not configured' };
  }

  const supabase = createClient(url, anonKey);
  const {
    data: { user },
    error
  } = await supabase.auth.getUser(token);
  const email = user?.email?.toLowerCase();

  if (error || !email || !allowedEmails.includes(email)) {
    return {
      ok: false,
      status: 403,
      error: 'Prompt case admin access required'
    };
  }

  return { ok: true, status: 200, email, userId: user?.id };
}
