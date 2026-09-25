import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  PricingBillingSwitch,
  PricingFaqList,
  PricingPlanCreditSummary
} from '../PricingPresentation';

describe('PricingPresentation', () => {
  it('exposes one explicit billing choice at a time', () => {
    const onChange = vi.fn();

    render(
      <PricingBillingSwitch
        mode="monthly"
        monthlyLabel="月付"
        yearlyLabel="年付"
        savingsLabel="省 40%"
        ariaLabel="切换付费周期"
        onChange={onChange}
      />
    );

    expect(screen.getByRole('button', { name: '月付' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: '年付' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );

    fireEvent.click(screen.getByRole('button', { name: '年付' }));
    expect(onChange).toHaveBeenCalledWith('yearly');
  });

  it('keeps FAQ answers available through native details disclosure', () => {
    render(
      <PricingFaqList
        items={[{ question: '积分会过期吗？', answer: '按当前套餐规则结算。' }]}
      />
    );

    const disclosure = screen.getByText('积分会过期吗？').closest('details');
    expect(disclosure).not.toHaveAttribute('open');

    fireEvent.click(screen.getByText('积分会过期吗？'));
    expect(disclosure).toHaveAttribute('open');
    expect(screen.getByText('按当前套餐规则结算。')).toBeInTheDocument();
  });

  it('markets flexible workflow credits without turning the card into an image estimate', () => {
    const { container } = render(
      <PricingPlanCreditSummary
        credits="10,000"
        unit="积分/月"
        badge="完整工作流"
        description="每月刷新，可灵活用于生成、AI 解析与参考图工作流。"
        tone="pro"
      />
    );

    expect(screen.getByText(/10,000/)).toHaveTextContent('10,000 积分/月');
    expect(screen.getByText('完整工作流')).toBeInTheDocument();
    expect(screen.queryByText(/2K/)).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('data-tone', 'pro');
  });
});
