import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertApiMarketplaceAdmin,
  isApiMarketplaceAdminUserId
} from '../../api/api-marketplace/runtime';
import { assertPromptCaseAdmin } from '../../api/admin/prompt-case-auth';
import { isApiMarketplaceAdminEmail } from '../shared/api-marketplace';

vi.mock('../../api/admin/prompt-case-auth', () => ({
  assertPromptCaseAdmin: vi.fn()
}));

const mockedAssertPromptCaseAdmin = vi.mocked(assertPromptCaseAdmin);

describe('API marketplace launch gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts only the exact administrator email', () => {
    expect(isApiMarketplaceAdminEmail('admin@example.com')).toBe(true);
    expect(isApiMarketplaceAdminEmail('other@example.com')).toBe(false);
    expect(isApiMarketplaceAdminEmail(null)).toBe(false);
  });

  it('narrows the existing admin auth result to the marketplace administrator', async () => {
    mockedAssertPromptCaseAdmin.mockResolvedValue({
      ok: true,
      status: 200,
      email: 'other@example.com',
      userId: 'other-user'
    });

    const result = await assertApiMarketplaceAdmin(
      new Request('https://webtomind.test/api/api-marketplace/catalog')
    );

    expect(result).toMatchObject({
      ok: false,
      status: 403,
      error: 'API marketplace admin access required'
    });
    expect(mockedAssertPromptCaseAdmin).toHaveBeenCalledWith(
      expect.any(Request),
      ['admin@example.com']
    );
  });

  it('accepts any existing user as a gateway key owner (full launch)', async () => {
    const getUserById = vi.fn().mockResolvedValue({
      data: { user: { id: 'admin-user', email: 'admin@example.com' } },
      error: null
    });
    const supabase = { auth: { admin: { getUserById } } } as never;

    await expect(
      isApiMarketplaceAdminUserId(supabase, 'admin-user')
    ).resolves.toBe(true);
    expect(getUserById).toHaveBeenCalledWith('admin-user');
  });

  it('rejects key owners that no longer exist', async () => {
    const getUserById = vi.fn().mockResolvedValue({
      data: { user: null },
      error: null
    });
    const supabase = { auth: { admin: { getUserById } } } as never;

    await expect(
      isApiMarketplaceAdminUserId(supabase, 'ghost-user')
    ).resolves.toBe(false);
  });
});
