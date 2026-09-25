import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReactivationBanner } from '../ReactivationBanner';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true })
}));

vi.mock('../image-create/useMembershipStatus', () => ({
  useMembershipStatus: vi.fn(() => ({
    loading: false,
    isMember: false,
    isFree: true,
    planId: 'free'
  }))
}));

import { useMembershipStatus } from '../image-create/useMembershipStatus';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

describe('ReactivationBanner', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('shows for authenticated free users on the create route', () => {
    render(
      <MemoryRouter initialEntries={['/zh-CN/create']}>
        <ReactivationBanner />
      </MemoryRouter>
    );
    expect(
      screen.getByRole('region', { name: 'reactivation.title' })
    ).toBeTruthy();
  });

  it('hides for paid members', () => {
    vi.mocked(useMembershipStatus).mockReturnValueOnce({
      loading: false,
      isMember: true,
      isFree: false,
      planId: 'pro',
      unavailable: false
    });
    render(
      <MemoryRouter initialEntries={['/zh-CN/create']}>
        <ReactivationBanner />
      </MemoryRouter>
    );
    expect(
      screen.queryByRole('region', { name: 'reactivation.title' })
    ).toBeNull();
  });

  it('hides when membership status is unavailable', () => {
    vi.mocked(useMembershipStatus).mockReturnValueOnce({
      loading: false,
      isMember: false,
      isFree: true,
      planId: 'free',
      unavailable: true
    });
    render(
      <MemoryRouter initialEntries={['/zh-CN/create']}>
        <ReactivationBanner />
      </MemoryRouter>
    );
    expect(
      screen.queryByRole('region', { name: 'reactivation.title' })
    ).toBeNull();
  });

  it('remembers dismissal for the session', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/zh-CN/create']}>
        <ReactivationBanner />
      </MemoryRouter>
    );
    screen.getByRole('button', { name: 'reactivation.dismiss' }).click();
    unmount();
    render(
      <MemoryRouter initialEntries={['/zh-CN/create']}>
        <ReactivationBanner />
      </MemoryRouter>
    );
    expect(
      screen.queryByRole('region', { name: 'reactivation.title' })
    ).toBeNull();
  });
});
