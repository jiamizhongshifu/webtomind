import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CreationGenerateButton } from '../CreationGenerateButton';

describe('CreationGenerateButton', () => {
  it('keeps credit estimation available to assistive technology without visual friction', () => {
    render(
      <CreationGenerateButton
        label="生成"
        ariaLabel="生成，预计消耗 3520 积分"
        onClick={vi.fn()}
      />
    );

    expect(
      screen.getByRole('button', {
        name: '生成，预计消耗 3520 积分'
      })
    ).toBeEnabled();
    expect(screen.queryByText('生成')).not.toBeInTheDocument();
    expect(screen.queryByText('预计 3,520 积分')).not.toBeInTheDocument();
  });

  it('uses the same compact action while busy', () => {
    render(
      <CreationGenerateButton
        label="正在提交"
        ariaLabel="正在提交，预计消耗 120 积分"
        busy
        disabled
        onClick={vi.fn()}
      />
    );

    expect(screen.queryByText('正在提交')).not.toBeInTheDocument();
    expect(screen.queryByText('预计 120 积分')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: '正在提交，预计消耗 120 积分'
      })
    ).toHaveAttribute('aria-busy', 'true');
  });

  it('can reveal an action label for the first-value moment', () => {
    render(
      <CreationGenerateButton
        label="生成第一张"
        ariaLabel="生成第一张，预计消耗 60 积分"
        showLabel
        onClick={vi.fn()}
      />
    );

    expect(screen.getByText('生成第一张')).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: '生成第一张，预计消耗 60 积分'
      })
    ).toHaveAccessibleName('生成第一张，预计消耗 60 积分');
  });

  it('merges the total credit estimate into the send button', () => {
    render(
      <CreationGenerateButton
        label="生成"
        ariaLabel="生成，预计每张消耗 100 积分，本次共 400 积分"
        creditEstimate={<span className="creation-credit-estimate is-embedded">400 积分</span>}
        onClick={vi.fn()}
      />
    );

    const button = screen.getByRole('button', {
      name: '生成，预计每张消耗 100 积分，本次共 400 积分'
    });
    expect(button).toHaveClass('has-estimate');
    expect(
      button.querySelector('.creation-generate-button-estimate')
    ).toHaveTextContent('400 积分');
    expect(
      button.querySelector('.creation-generate-button-surface')
    ).not.toBeNull();
  });
});
