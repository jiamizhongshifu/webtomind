import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CreditsUpgradePrompt } from '../CreditsUpgradePrompt';
import type { CreditsBalanceResponse } from '@/types/membership';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ isAuthenticated: true, isLoading: false }))
}));

vi.mock('../image-create/useMembershipStatus', () => ({
  useMembershipStatus: vi.fn(() => ({
    loading: false,
    isMember: false,
    isFree: true,
    planId: 'free',
    unavailable: false
  }))
}));

vi.mock('@/services/credits-api', () => ({
  getCreditsBalance: vi.fn(async () => buildCreditsBalance(800)),
  getImageGenerationCost: vi.fn(async () => 60)
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

import { useAuth } from '../../contexts/AuthContext';
import { useMembershipStatus } from '../image-create/useMembershipStatus';
import {
  getCreditsBalance,
  getImageGenerationCost
} from '@/services/credits-api';

const DISMISSED_STORAGE_KEY = 'webtomind:credits-upgrade-prompt-dismissed:v1';

function buildCreditsBalance(total: number): CreditsBalanceResponse {
  return {
    credits: {
      daily: 0,
      dailyMax: 0,
      subscription: 0,
      subscriptionMax: 0,
      subscriptionPeriodStart: null,
      subscriptionPeriodEnd: null,
      bonus: 0,
      referral: 0,
      total,
      lastDailyRefresh: ''
    },
    checkin: { lastDate: null, consecutiveDays: 0, canCheckin: false },
    quota: { dailyImageGen: { used: 0, max: 0 } },
    subscription: null
  };
}

function getTodayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function renderPrompt(route = '/zh-CN/create') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <CreditsUpgradePrompt />
    </MemoryRouter>
  );
}

describe('CreditsUpgradePrompt', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(useMembershipStatus).mockReturnValue({
      loading: false,
      isMember: false,
      isFree: true,
      planId: 'free',
      unavailable: false
    });
    vi.mocked(getCreditsBalance).mockResolvedValue({
      credits: { total: 800 }
    } as never);
    vi.mocked(getImageGenerationCost).mockResolvedValue(60);
  });

  it('shows for authenticated free users', async () => {
    renderPrompt();
    await waitFor(() =>
      expect(
        screen.getByRole('region', { name: 'creditsUpgrade.freeTitle' })
      ).toBeTruthy()
    );
  });

  it('hides for paid members with available credits', async () => {
    vi.mocked(useMembershipStatus).mockReturnValue({
      loading: false,
      isMember: true,
      isFree: false,
      planId: 'pro',
      unavailable: false
    });
    renderPrompt();
    await waitFor(() => {
      expect(screen.queryByRole('region')).toBeNull();
    });
  });

  it('shows for paid members with exhausted credits', async () => {
    vi.mocked(useMembershipStatus).mockReturnValue({
      loading: false,
      isMember: true,
      isFree: false,
      planId: 'pro',
      unavailable: false
    });
    vi.mocked(getCreditsBalance).mockResolvedValue({
      credits: { total: 0 }
    } as never);
    renderPrompt();
    await waitFor(() =>
      expect(
        screen.getByRole('region', { name: 'creditsUpgrade.exhaustedTitle' })
      ).toBeTruthy()
    );
  });

  it('shows for paid members when credits cannot cover the base generation cost', async () => {
    vi.mocked(useMembershipStatus).mockReturnValue({
      loading: false,
      isMember: true,
      isFree: false,
      planId: 'pro',
      unavailable: false
    });
    vi.mocked(getCreditsBalance).mockResolvedValue({
      credits: { total: 50 }
    } as never);
    renderPrompt();
    await waitFor(() =>
      expect(
        screen.getByRole('region', { name: 'creditsUpgrade.exhaustedTitle' })
      ).toBeTruthy()
    );
  });

  it('hides for paid members when credits cover the base generation cost', async () => {
    vi.mocked(useMembershipStatus).mockReturnValue({
      loading: false,
      isMember: true,
      isFree: false,
      planId: 'pro',
      unavailable: false
    });
    vi.mocked(getCreditsBalance).mockResolvedValue({
      credits: { total: 60 }
    } as never);
    renderPrompt();
    await waitFor(() => {
      expect(screen.queryByRole('region')).toBeNull();
    });
  });

  it('hides when membership status is unavailable', async () => {
    vi.mocked(useMembershipStatus).mockReturnValue({
      loading: false,
      isMember: false,
      isFree: true,
      planId: 'free',
      unavailable: true
    });
    renderPrompt();
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('hides while auth is still loading', async () => {
    vi.mocked(useAuth).mockReturnValueOnce({
      isAuthenticated: false,
      isLoading: true
    } as never);
    renderPrompt();
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('dismisses once and remembers dismissal for the rest of the day', async () => {
    const { unmount } = renderPrompt();
    await waitFor(() =>
      expect(
        screen.getByRole('region', { name: 'creditsUpgrade.freeTitle' })
      ).toBeTruthy()
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'creditsUpgrade.dismiss' })
    );
    expect(screen.queryByRole('region')).toBeNull();
    expect(window.localStorage.getItem(DISMISSED_STORAGE_KEY)).toBe(
      getTodayKey()
    );

    unmount();
    renderPrompt();
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('does not show again on the same day after a prior dismissal', async () => {
    window.localStorage.setItem(DISMISSED_STORAGE_KEY, getTodayKey());
    renderPrompt();
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('does not show on the pricing page itself', async () => {
    renderPrompt('/zh-CN/create/pricing');
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('links to the workspace pricing page with a returnTo back to the current page', async () => {
    renderPrompt('/zh-CN/create');
    await waitFor(() =>
      expect(screen.getByRole('link')).toBeTruthy()
    );
    expect(screen.getByRole('link').getAttribute('href')).toBe(
      '/zh-CN/create/pricing?source=credits_upgrade_prompt&returnTo=%2Fzh-CN%2Fcreate'
    );
  });
});
