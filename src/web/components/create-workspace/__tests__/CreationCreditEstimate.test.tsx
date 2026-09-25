import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CreationCreditEstimate } from '../CreationCreditEstimate';

describe('CreationCreditEstimate', () => {
  it('renders a compact Chinese per-image estimate', () => {
    render(<CreationCreditEstimate credits={120} unit="image" />);

    expect(
      screen.getByRole('note', { name: '预计每张消耗 120 积分' })
    ).toHaveTextContent('120/张');
  });

  it('rounds a video rate upward and localizes the accessible label', () => {
    render(
      <CreationCreditEstimate
        credits={26.1}
        unit="second"
        locale="en-US"
        approximate
      />
    );

    expect(
      screen.getByRole('note', {
        name: 'Approximately 27 credits per second'
      })
    ).toHaveTextContent('~27/sec');
  });

  it('renders the total estimated credits for the whole batch', () => {
    render(<CreationCreditEstimate credits={400} unit="total" />);

    expect(
      screen.getByRole('note', { name: '预计本次共消耗 400 积分' })
    ).toHaveTextContent('400 积分');
  });

  it('formats large totals and localizes the total label', () => {
    render(
      <CreationCreditEstimate credits={1440} unit="total" locale="en-US" />
    );

    expect(
      screen.getByRole('note', { name: 'Estimated 1440 credits total' })
    ).toHaveTextContent('1,440 credits');
  });

  it('renders as a plain decorative span when embedded in the send button', () => {
    const { container } = render(
      <CreationCreditEstimate credits={80} unit="total" embedded />
    );

    const estimate = container.querySelector('.creation-credit-estimate');
    expect(estimate).not.toBeNull();
    expect(estimate?.getAttribute('role')).toBeNull();
    expect(estimate?.getAttribute('aria-label')).toBeNull();
    expect(estimate?.textContent).toContain('80 积分');
    expect(estimate?.classList.contains('is-embedded')).toBe(true);
  });
});
