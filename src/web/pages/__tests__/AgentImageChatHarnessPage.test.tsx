import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentImageChatHarnessPage } from '../AgentImageChatHarnessPage';

vi.mock('@/services/agent-api', () => ({ getAuthToken: () => 'mock-token' }));

describe('AgentImageChatHarnessPage', () => {
  it('renders credit note, input-bottom skill entry (two portrait modes), and chat controls', () => {
    render(<AgentImageChatHarnessPage />);

    expect(screen.getByText('Agent 图像创作（dev harness）')).toBeInTheDocument();
    expect(screen.getByText(/技能对话 1 积分/)).toBeInTheDocument();
    // 技能入口位于输入框底部：固定女性写真技能，仅两个官方模式
    expect(screen.getByRole('button', { name: /日常写真/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /写真探索/ })).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/描述你想创作的图像/)
    ).toBeInTheDocument();
    // 未选模式时发送按钮展示通用文案
    expect(screen.getByRole('button', { name: /^生成/ })).toBeInTheDocument();
  });

  it('activates a mode, reflects it on the send button, and supports exiting skill mode', () => {
    render(<AgentImageChatHarnessPage />);

    // 选择「日常写真」
    fireEvent.click(screen.getByRole('button', { name: /日常写真/ }));
    expect(
      screen.getByRole('button', { name: /用日常写真生成/ })
    ).toBeInTheDocument();

    // 切换为「写真探索」
    fireEvent.click(screen.getByRole('button', { name: /写真探索/ }));
    expect(
      screen.getByRole('button', { name: /用写真探索生成/ })
    ).toBeInTheDocument();

    // 可退出技能模式，发送按钮恢复通用文案
    fireEvent.click(screen.getByRole('button', { name: /退出技能/ }));
    expect(screen.getByRole('button', { name: /^生成/ })).toBeInTheDocument();
  });
});
