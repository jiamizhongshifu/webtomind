import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CreateOnboardingModalHarnessPage } from '../CreateOnboardingModalHarnessPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const messages: Record<string, string> = {
        'onboarding.steps.assets.title': '管理创作资产',
        'onboarding.steps.assets.body': '集中整理你的提示词、参考图和生成记录。',
        'onboarding.steps.assets.bullets.0': '保存常用提示词',
        'onboarding.steps.assets.bullets.1': '复用参考图',
        'onboarding.steps.assets.bullets.2': '追踪任务状态',
        'onboarding.steps.prompt.title': '打磨提示词',
        'onboarding.steps.prompt.body': '把想法变成稳定的生成工作流。',
        'onboarding.steps.prompt.bullets.0': '拆分创意目标',
        'onboarding.steps.prompt.bullets.1': '优化风格约束',
        'onboarding.steps.prompt.bullets.2': '保留可复现参数',
        'onboarding.close': '关闭引导',
        'onboarding.next': '下一步',
        'onboarding.start': '开始创作',
        'onboarding.skip': '跳过',
        'onboarding.progress': '引导进度',
        'onboarding.goToStep': `第 ${options?.current ?? 1} / ${options?.total ?? 4} 步`
      };

      return messages[key] || key;
    }
  })
}));

describe('CreateOnboardingModalHarnessPage', () => {
  it('renders the isolated onboarding modal preview and tracks close state', () => {
    render(<CreateOnboardingModalHarnessPage />);

    expect(screen.getByText('ISOLATED PREVIEW HARNESS')).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: '管理创作资产' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(
      screen.getByRole('dialog', { name: '打磨提示词' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '跳过' }));
    expect(screen.getByTestId('harness-status')).toHaveTextContent('closed');
  });
});
