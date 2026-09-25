import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ShortcutListHarnessPage } from '../ShortcutListHarnessPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        'shortcutList.loading': '加载中...',
        'shortcutList.newShortcut': '新建技能',
        'shortcutList.empty': '暂无技能',
        'shortcutList.unnamed': '未命名'
      };
      return labels[key] ?? key;
    }
  })
}));

describe('ShortcutListHarnessPage', () => {
  it('renders selectable shortcut rows and creates a new shortcut', () => {
    render(<ShortcutListHarnessPage />);

    expect(screen.getByText('Shortcut List')).toBeInTheDocument();
    expect(screen.getByText('研究材料整理')).toBeInTheDocument();
    expect(screen.getByText('生成小红书标题')).toBeInTheDocument();
    expect(screen.getByText('暂无技能')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '生成小红书标题' }));
    expect(screen.getByTestId('harness-status')).toHaveTextContent(
      'selected:shortcut-2'
    );

    fireEvent.click(screen.getAllByRole('button', { name: '新建技能' })[0]);
    expect(screen.getByTestId('harness-status')).toHaveTextContent('created');
    expect(screen.getByText('新建技能 3')).toBeInTheDocument();
  });

  it('shows shadcn skeleton loading state', () => {
    render(<ShortcutListHarnessPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle loading' }));

    expect(screen.getAllByLabelText('加载中...')).toHaveLength(2);
  });
});
