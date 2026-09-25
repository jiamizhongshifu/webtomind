import { beforeEach, describe, expect, it, vi } from 'vitest';
import adminMeHandler from '../../api/admin/me';
import type { SupabaseClient } from '@supabase/supabase-js';

const mockMaybeSingle = vi.fn();

function makeSupabaseMock(): SupabaseClient {
  return {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) })
  } as unknown as SupabaseClient;
}

function makeRequest(): Request {
  return new Request('https://webtomind.test/api/admin/me', { method: 'GET' });
}

describe('fetchAdminRole', () => {
  beforeEach(() => mockMaybeSingle.mockReset());

  it('returns admin info when an admin_users row exists', async () => {
    const { fetchAdminRole } = await import('../../api/utils/auth');
    mockMaybeSingle.mockResolvedValue({ data: { user_id: 'u1', role: 'admin' }, error: null });
    const admin = await fetchAdminRole(makeSupabaseMock(), 'u1');
    expect(admin?.userId).toBe('u1');
    expect(admin?.role).toBe('admin');
  });

  it('returns null when no admin_users row exists', async () => {
    const { fetchAdminRole } = await import('../../api/utils/auth');
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const admin = await fetchAdminRole(makeSupabaseMock(), 'u1');
    expect(admin).toBeNull();
  });
});

describe('admin/me handler', () => {
  it('returns 403 for an anonymous caller', async () => {
    const resp = await adminMeHandler(makeRequest());
    expect(resp.status).toBe(403);
  });
});
