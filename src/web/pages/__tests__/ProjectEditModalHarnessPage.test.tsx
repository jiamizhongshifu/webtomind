import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectEditModalHarnessPage } from '../ProjectEditModalHarnessPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const labels: Record<string, string> = {
        'boards.editProject': '编辑项目',
        'boards.close': '关闭',
        'boards.fields.name': '项目名称',
        'boards.fields.placeholder': '输入项目名称',
        'boards.fields.icon': '图标',
        'boards.projectSettings.instructionsLabel': '指令',
        'boards.projectSettings.instructionsHint':
          '设置此项目的背景信息并自定义 Agent 的回复方式。',
        'boards.projectSettings.memoryLabel': '记忆',
        'boards.projectSettings.memoryDefault': '默认',
        'boards.projectSettings.memoryHint':
          '该项目可以访问外部聊天的记忆,反之亦然。此设置无法更改。',
        'boards.confirm': '确认'
      };
      return labels[key] ?? fallback ?? key;
    }
  })
}));

describe('ProjectEditModalHarnessPage', () => {
  it('renders editable project fields and saves the current project data', async () => {
    render(<ProjectEditModalHarnessPage />);

    expect(screen.getByText('ISOLATED PREVIEW HARNESS')).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: '编辑项目' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('项目名称')).toHaveValue('季度增长复盘');
    expect(screen.getByLabelText('指令')).toHaveValue(
      '# 项目背景\n追踪增长实验、渠道假设和复盘结论。\n\n# 输出风格\n先给结论，再列证据和后续动作。'
    );
    expect(screen.getByLabelText('记忆')).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '确认' }));

    await waitFor(() => {
      expect(screen.getByTestId('harness-status')).toHaveTextContent(
        'saved:季度增长复盘:📊'
      );
    });
  });
});
