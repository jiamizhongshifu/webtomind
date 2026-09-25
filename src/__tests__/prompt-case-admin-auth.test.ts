import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assertPromptCaseAdmin,
  getPromptCaseAdminEmails,
  isPromptCaseAdminEmail
} from '../../api/admin/prompt-case-auth';

describe('prompt case admin auth', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to the original admin email when no list is configured', () => {
    expect(getPromptCaseAdminEmails()).toEqual(['admin@example.com']);
    expect(isPromptCaseAdminEmail('admin@example.com')).toBe(true);
  });

  it('parses PROMPT_CASE_ADMIN_EMAILS as a trimmed lowercase allowlist', () => {
    vi.stubEnv(
      'PROMPT_CASE_ADMIN_EMAILS',
      ' Admin@One.com, editor@Two.com ,admin@one.com '
    );

    expect(getPromptCaseAdminEmails()).toEqual([
      'admin@one.com',
      'editor@two.com'
    ]);
    expect(isPromptCaseAdminEmail('EDITOR@two.com')).toBe(true);
    expect(isPromptCaseAdminEmail('admin@example.com')).toBe(false);
  });

  it('rejects requests without a bearer token before reading Supabase config', async () => {
    const result = await assertPromptCaseAdmin(
      new Request('https://webtomind.com/api/admin/prompt-cases')
    );

    expect(result).toEqual({
      ok: false,
      status: 401,
      error: 'Missing Authorization header'
    });
  });

  it('reports missing Supabase auth config before token verification', async () => {
    const result = await assertPromptCaseAdmin(
      new Request('https://webtomind.com/api/admin/prompt-cases', {
        headers: { Authorization: 'Bearer admin-token' }
      })
    );

    expect(result).toEqual({
      ok: false,
      status: 500,
      error: 'Supabase auth is not configured'
    });
  });
});
