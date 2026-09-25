import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CreateOnboardingModal } from '../CreateOnboardingModal';

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
        'onboarding.steps.reference.title': '复用参考图',
        'onboarding.steps.reference.body': '保持角色、构图和商品的一致性。',
        'onboarding.steps.reference.bullets.0': '上传参考图',
        'onboarding.steps.reference.bullets.1': '锁定人物特征',
        'onboarding.steps.reference.bullets.2': '比较生成结果',
        'onboarding.steps.tasks.title': '批量推进任务',
        'onboarding.steps.tasks.body': '把灵感组织成持续产出的任务流。',
        'onboarding.steps.tasks.bullets.0': '拆解批量任务',
        'onboarding.steps.tasks.bullets.1': '跟踪进度',
        'onboarding.steps.tasks.bullets.2': '沉淀结果',
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

describe('CreateOnboardingModal', () => {
  it('renders with shadcn dialog semantics and advances steps', () => {
    render(<CreateOnboardingModal open onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '管理创作资产' });
    expect(dialog).toHaveClass('create-onboarding-modal');

    fireEvent.click(screen.getByRole('button', { name: '下一步' }));

    expect(
      screen.getByRole('dialog', { name: '打磨提示词' })
    ).toBeInTheDocument();
  });

  it('supports dot navigation, arrow navigation, and close actions', () => {
    const onClose = vi.fn();
    render(<CreateOnboardingModal open onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '第 3 / 4 步' }));
    expect(
      screen.getByRole('dialog', { name: '复用参考图' })
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'ArrowRight', code: 'ArrowRight' });
    expect(
      screen.getByRole('dialog', { name: '批量推进任务' })
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'ArrowLeft', code: 'ArrowLeft' });
    expect(
      screen.getByRole('dialog', { name: '复用参考图' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '跳过' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('locks document scrolling while visible and restores it on unmount', () => {
    const { unmount } = render(<CreateOnboardingModal open onClose={vi.fn()} />);

    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.scrollbarGutter).toBe('auto');

    unmount();

    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.scrollbarGutter).toBe('');
  });

  it('does not render while closed', () => {
    render(<CreateOnboardingModal open={false} onClose={vi.fn()} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
