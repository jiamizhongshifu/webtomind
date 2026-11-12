import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSkillCommerce } from './useSkillCommerce';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: false, user: null })
}));
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/zh-CN/skills', search: '' }),
  useNavigate: () => vi.fn()
}));
vi.mock('@/utils/env', () => ({ getApiBaseUrl: () => 'http://localhost' }));
vi.mock('@/services/workspace-api', () => ({ getAccessToken: vi.fn() }));
vi.mock('@/services/payment-api', () => ({
  createCheckoutSession: vi.fn(), getCheckoutOrderStatus: vi.fn(), redirectToCheckout: vi.fn()
}));

afterEach(() => vi.unstubAllGlobals());

describe('Skill commerce response handling', () => {
  it.each([null, {}, { products: [] }, { products: [], access: {} }])(
    'shows unavailable for malformed responses and recovers on retry: %j', async (body) => {
      const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(body))
        .mockResolvedValueOnce(Response.json({ products: [], access: null }));
      vi.stubGlobal('fetch', fetchMock);
      const { result } = renderHook(() => useSkillCommerce(true));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.unavailable).toBe(true);
      expect(result.current.products).toEqual([]);
      act(() => result.current.reload());
      await waitFor(() => expect(result.current.unavailable).toBe(false));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }
  );
});
