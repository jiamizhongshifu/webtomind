import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SkillEditorHarnessPage } from '../SkillEditorHarnessPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      fallbackOrOptions?: string | Record<string, unknown>,
      maybeOptions?: Record<string, unknown>
    ) => {
      const fallback =
        typeof fallbackOrOptions === 'string' ? fallbackOrOptions : undefined;
      const options =
        typeof fallbackOrOptions === 'object'
          ? fallbackOrOptions
          : maybeOptions;
      const labels: Record<string, string> = {
        'skillEditor.name': 'Skill 名称',
        'skillEditor.namePlaceholder': 'Skill 名称',
        'skillEditor.iconPicker': '选择图标',
        'skillEditor.selectIcon': `选择图标 ${options?.icon ?? ''}`,
        'skillEditor.enabled': '启用',
        'skillEditor.save': '保存',
        'skillEditor.delete': '删除',
        'skillEditor.tabSettings': '基本设置',
        'skillEditor.tabReferences': '参考文档',
        'skillEditor.tabScripts': '脚本',
        'skillEditor.description': '描述',
        'skillEditor.descriptionPlaceholder': '简短描述这个 Skill 的功能',
        'skillEditor.triggers': '触发词',
        'skillEditor.removeTrigger': '删除触发词',
        'skillEditor.removeTriggerNamed': `删除触发词 ${options?.trigger ?? ''}`,
        'skillEditor.addTrigger': '添加触发词',
        'skillEditor.triggerPlaceholder': '输入触发词，按回车添加',
        'skillEditor.triggerHint': '当用户输入包含这些词时，会自动激活此 Skill',
        'skillEditor.category': '分类',
        'skillEditor.envVars': '环境变量',
        'skillEditor.envVarsHint': '配置此 Skill 运行时所需的密钥或参数，AI 调用工具时会自动注入',
        'skillEditor.envKey': '变量名',
        'skillEditor.envValueFor': `${options?.key ?? ''} 的值`,
        'skillEditor.envKeyPlaceholder': '变量名',
        'skillEditor.envValuePlaceholder': '输入值',
        'skillEditor.removeEnvVar': '删除变量',
        'skillEditor.removeEnvVarNamed': `删除变量 ${options?.key ?? ''}`,
        'skillEditor.addEnvVar': '添加变量',
        'skillEditor.coreInstructions': '核心指令',
        'skillEditor.instructionsPlaceholder': '在这里编写 Skill 的核心指令（支持 Markdown）...',
        'skillEditor.instructionsHint': '这些指令会在 Skill 激活时添加到 AI 的系统提示中',
        'skillEditor.deleteConfirmTitle': '确认删除',
        'skillEditor.deleteConfirmMessage': '确定要删除这个 Skill 吗？此操作无法撤销。',
        'skillEditor.cancel': '取消'
      };
      return labels[key] ?? fallback ?? key;
    },
    i18n: { language: 'zh-CN' }
  })
}));

describe('SkillEditorHarnessPage', () => {
  it('renders the shadcn-backed editor and saves edited fields', async () => {
    render(<SkillEditorHarnessPage />);

    expect(screen.getByText('ISOLATED PREVIEW HARNESS')).toBeInTheDocument();
    expect(screen.getByLabelText('Skill 名称')).toHaveValue('研究材料整理');
    expect(screen.getByLabelText('描述')).toHaveValue(
      '把长材料压缩成可执行的洞察备忘录。'
    );
    expect(screen.getByRole('tab', { name: '基本设置' })).toHaveAttribute(
      'data-state',
      'active'
    );
    expect(screen.getByRole('switch', { name: '启用' })).toBeChecked();
    expect(screen.getByRole('combobox', { name: '分类' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Skill 名称'), {
      target: { value: '洞察备忘录助手' }
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(screen.getByTestId('harness-status')).toHaveTextContent(
        'updated:displayName'
      );
    });
  });

  it('uses a shadcn popover for icon selection', async () => {
    render(<SkillEditorHarnessPage />);

    fireEvent.click(screen.getByRole('button', { name: '选择图标' }));
    fireEvent.click(screen.getByRole('button', { name: '选择图标 ✨' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '保存' })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(screen.getByTestId('harness-status')).toHaveTextContent(
        'updated:displayName'
      );
    });
  });

  it('confirms deletion through AlertDialog', async () => {
    render(<SkillEditorHarnessPage />);

    fireEvent.click(screen.getByLabelText('删除'));

    const dialog = screen.getByRole('alertdialog', { name: '确认删除' });
    expect(dialog).toBeInTheDocument();
    expect(
      screen.getByText('确定要删除这个 Skill 吗？此操作无法撤销。')
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: '删除' }));

    await waitFor(() => {
      expect(screen.getByTestId('harness-status')).toHaveTextContent(
        'deleted'
      );
    });
  });
});

describe('SkillEditor design-system contracts', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/workspace/components/SkillEditor.tsx'),
    'utf8'
  );

  it('uses shadcn primitives for form controls, tabs, popover, and deletion', () => {
    expect(source).toContain("from '@/shared/ui/radix/alert-dialog'");
    expect(source).toContain("from '@/shared/ui/radix/button'");
    expect(source).toContain("from '@/shared/ui/radix/field'");
    expect(source).toContain("from '@/shared/ui/radix/input'");
    expect(source).toContain("from '@/shared/ui/radix/popover'");
    expect(source).toContain("from '@/shared/ui/radix/select'");
    expect(source).toContain("from '@/shared/ui/radix/switch'");
    expect(source).toContain("from '@/shared/ui/radix/tabs'");
    expect(source).toContain("from '@/shared/ui/radix/textarea'");
    expect(source).toContain('<AlertDialog');
    expect(source).toContain('<Popover');
    expect(source).toContain('<TabsList');
    expect(source).toContain('<SelectGroup>');
    expect(source).not.toContain('<button');
    expect(source).not.toContain('<input');
    expect(source).not.toContain('<select');
    expect(source).not.toContain('<textarea');
    expect(source).not.toContain('fixed inset-0');
    expect(source).not.toContain('role="dialog"');
  });
});
