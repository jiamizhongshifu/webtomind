import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCreditsBalance } from '@/services/credits-api';
import { CreditsDisplay } from '../CreditsDisplay';

vi.mock('@/services/credits-api', async () => {
  const actual = await vi.importActual<typeof import('@/services/credits-api')>(
    '@/services/credits-api'
  );

  return {
    ...actual,
    getCreditsBalance: vi.fn()
  };
});

describe('CreditsDisplay', () => {
  beforeEach(() => {
    vi.mocked(getCreditsBalance).mockReset();
  });

  it('uses the parent-provided balance without issuing a duplicate request', () => {
    render(
      <CreditsDisplay
        totalCredits={4321}
        labelSuffix="积分"
        trailingLabel="充值"
      />
    );

    expect(screen.getByRole('button')).toHaveTextContent('4.3k');
    expect(screen.getByRole('button')).toHaveTextContent('积分');
    expect(screen.getByRole('button')).toHaveTextContent('充值');
    expect(getCreditsBalance).not.toHaveBeenCalled();
  });
});
