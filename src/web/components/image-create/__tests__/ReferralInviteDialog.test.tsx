import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReferralInviteDialog } from '../ReferralInviteDialog';

const getReferralInviteInfo = vi.fn();
const dialogCss = readFileSync(
  join(
    process.cwd(),
    'src/web/components/image-create/ReferralInviteDialog.css'
  ),
  'utf8'
);

vi.mock('@/services/referral-api', () => ({
  getReferralInviteInfo: () => getReferralInviteInfo()
}));

describe('ReferralInviteDialog', () => {
  beforeEach(() => {
    getReferralInviteInfo.mockReset();
  });

  it('loads the existing referral code and presents both reward stages', async () => {
    getReferralInviteInfo.mockResolvedValue({
      referralCode: 'WTM2026',
      activationRewardCredits: 100,
      subscriptionRewardCredits: 1000
    });

    render(<ReferralInviteDialog open isEnglish={false} onClose={vi.fn()} />);

    expect(screen.getByText('正在加载…')).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByText('http://localhost:3000/?ref=WTM2026')
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/最高赚取 1,100 积分/)).toBeInTheDocument();
    expect(screen.getByText(/你和好友各得 100 积分/)).toBeInTheDocument();
    expect(screen.getByText(/你再得 1,000 积分/)).toBeInTheDocument();
    expect(getReferralInviteInfo).toHaveBeenCalledOnce();
  });

  it('keeps the invitation material theme-aware without changing its actions', () => {
    expect(dialogCss).toMatch(
      /\.referral-invite-dialog\.ui-dialog\s*\{[\s\S]*?--referral-invite-surface:\s*var\(--surface-glass-bg-strong,\s*#fffefb\);[\s\S]*?background:\s*var\(--referral-invite-surface\);/
    );
    expect(dialogCss).toMatch(
      /\.dark\s+\.referral-invite-dialog\.ui-dialog\s*\{[\s\S]*?--referral-invite-control:\s*rgba\(255,\s*247,\s*235,\s*0\.075\);/
    );
    expect(dialogCss).toContain(
      '@media (prefers-reduced-transparency: reduce)'
    );
    expect(dialogCss).toMatch(
      /@media \(max-width:\s*720px\)[\s\S]*?\.referral-invite-link-row\s*\{[\s\S]*?grid-template-columns:\s*1fr;/
    );
    expect(dialogCss).not.toMatch(
      /\.referral-invite-dialog\.ui-dialog\s*\{[^}]*background:\s*#11110f;/
    );
  });
});
