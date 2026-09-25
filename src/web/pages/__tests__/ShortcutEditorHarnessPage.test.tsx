import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ShortcutEditorHarnessPage } from '../ShortcutEditorHarnessPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const labels: Record<string, string> = {
        'shortcutEditor.newShortcut': '新建技能',
        'shortcutEditor.deleteShortcut': '删除技能',
        'shortcutEditor.name': '名称',
        'shortcutEditor.namePlaceholder': '输入技能名称',
        'shortcutEditor.prompt': '指令',
        'shortcutEditor.promptPlaceholder': '输入指令内容（提示词）...',
        'shortcutEditor.removeReference': '移除引用',
        'shortcutEditor.addReference': '添加引用',
        'shortcutEditor.description': '描述',
        'shortcutEditor.descriptionHint': '（仅自己可见）',
        'shortcutEditor.descriptionPlaceholder': '为这个技能添加备注...',
        'shortcutEditor.confirmDelete': '确认删除',
        'shortcutEditor.confirmDeleteMessage': `确定要删除技能「${options?.name || ''}」吗？此操作无法撤销。`,
        'shortcutEditor.cancel': '取消',
        'shortcutEditor.delete': '删除',
        'shortcutEditor.noTitle': '无标题',
        'referenceSelector.title': '选择引用内容',
        'referenceSelector.noContent': '暂无可添加的内容',
        'referenceSelector.noTitle': '无标题',
        'referenceSelector.image': '图片',
        'referenceSelector.cancel': '取消',
        'referenceSelector.confirm': '确认添加'
      };
      return labels[key] ?? key;
    },
    i18n: { language: 'zh-CN' }
  })
}));

describe('ShortcutEditorHarnessPage', () => {
  it('renders shadcn-backed shortcut fields and preserves debounced updates', async () => {
    render(<ShortcutEditorHarnessPage />);

    expect(screen.getByText('ISOLATED PREVIEW HARNESS')).toBeInTheDocument();
    expect(screen.getByLabelText('名称')).toHaveValue('研究材料整理');
    expect(screen.getByLabelText('指令')).toHaveValue(
      '请把输入材料整理为：核心观点、关键证据、可执行后续动作。输出要短，先给结论。'
    );
    expect(screen.getByLabelText('描述')).toHaveValue(
      '适合处理长文档和会议纪要。'
    );
    expect(screen.getByText('增长实验记录')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('名称'), {
      target: { value: '新的整理技能' }
    });

    await waitFor(() => {
      expect(screen.getByTestId('harness-status')).toHaveTextContent(
        'updated:name'
      );
    }, { timeout: 1500 });
  });

  it('confirms deletion through AlertDialog', async () => {
    render(<ShortcutEditorHarnessPage />);

    fireEvent.click(screen.getByRole('button', { name: '删除技能' }));

    expect(
      screen.getByRole('alertdialog', { name: '确认删除' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('确定要删除技能「研究材料整理」吗？此操作无法撤销。')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '删除' }));

    await waitFor(() => {
      expect(screen.getByTestId('harness-status')).toHaveTextContent(
        'deleted'
      );
    });
  });

  it('adds an available reference through the shadcn Dialog and Checkbox flow', async () => {
    render(<ShortcutEditorHarnessPage />);

    fireEvent.click(screen.getByRole('button', { name: '添加引用' }));

    expect(
      screen.getByRole('dialog', { name: '选择引用内容' })
    ).toBeInTheDocument();
    expect(screen.getByText('访谈纪要')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: '访谈纪要' }));
    fireEvent.click(screen.getByRole('button', { name: '确认添加 (1)' }));

    await waitFor(() => {
      expect(screen.getByTestId('harness-status')).toHaveTextContent(
        'updated:references'
      );
    }, { timeout: 1500 });
  });
});
