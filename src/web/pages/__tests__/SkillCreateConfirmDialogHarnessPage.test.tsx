import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SkillCreateConfirmDialogHarnessPage } from '../SkillCreateConfirmDialogHarnessPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback
  })
}));

describe('SkillCreateConfirmDialogHarnessPage', () => {
  it('renders the isolated skill creation dialog with editable fields', () => {
    render(<SkillCreateConfirmDialogHarnessPage />);

    expect(screen.getByText('ISOLATED PREVIEW HARNESS')).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: '确认创建 Skill' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('显示名称 *')).toHaveValue('研究笔记总结');
    expect(screen.getByLabelText('标识符 *')).toHaveValue(
      'summarize_research_note'
    );
    expect(screen.getByLabelText('核心指令 *')).toHaveValue(
      '请提取资料中的核心观点、关键证据和后续行动，输出为清晰的分节摘要。'
    );
  });
});
