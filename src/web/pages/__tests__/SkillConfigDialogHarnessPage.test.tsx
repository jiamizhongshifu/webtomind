import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { SkillConfigDialogHarnessPage } from '../SkillConfigDialogHarnessPage';

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  global.ResizeObserver = ResizeObserverMock;
});

describe('SkillConfigDialogHarnessPage', () => {
  it('renders the shadcn-backed dialog and executes with default config', async () => {
    render(<SkillConfigDialogHarnessPage />);

    expect(
      screen.getByRole('dialog', { name: '内容草稿生成' })
    ).toBeInTheDocument();
    expect(screen.getByText('快速生成作品草稿')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '展开高级设置' }));

    expect(screen.getByText('格式')).toBeInTheDocument();
    expect(screen.getByText('输出语言')).toBeInTheDocument();
    expect(screen.getByText('语气')).toBeInTheDocument();
    expect(screen.getByText('分析深度')).toBeInTheDocument();
    expect(screen.getByText('启用参考材料')).toBeInTheDocument();
    expect(screen.getByText('视觉布局')).toBeInTheDocument();
    expect(screen.getByText('目标读者')).toBeInTheDocument();
    expect(screen.getByText('补充说明')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '生成作品草稿' }));

    await waitFor(() => {
      expect(screen.getByTestId('harness-status')).toHaveTextContent(
        'executed:brief'
      );
    });
  });
});
