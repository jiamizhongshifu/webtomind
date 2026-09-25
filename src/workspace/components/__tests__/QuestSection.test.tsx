import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuestSection } from '../QuestSection';
import { getAccessToken } from '@/services/workspace-api';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: Record<string, unknown>) =>
      String(options?.defaultValue || _key),
    i18n: { language: 'zh-CN' }
  })
}));

vi.mock('@/services/workspace-api', () => ({
  getAccessToken: vi.fn(() => 'test-token')
}));

vi.mock('@/utils/env', () => ({
  getApiBaseUrl: () => 'https://webtomind.test'
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({ error: vi.fn() })
}));

vi.mock('@/web/lib/analytics', () => ({
  trackEvent: vi.fn()
}));

describe('QuestSection', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tasks: [
            {
              id: 'task-1',
              identifier: 'first_business_image',
              type: 'action',
              title: { 'zh-CN': '首次商业出图' },
              description: { 'zh-CN': '生成第一张可交付的商业图片。' },
              reward_amount: 20,
              icon: 'image',
              action_link: '/create/image',
              is_completed: false
            },
            {
              id: 'task-2',
              identifier: 'save_prompt_case',
              type: 'action',
              title: { 'zh-CN': '保存 Prompt 案例' },
              description: { 'zh-CN': '保存一个可复用的 Prompt 或案例。' },
              reward_amount: 20,
              icon: 'book-open-text',
              action_link: '/create#prompt-cases',
              is_completed: true
            }
          ]
        })
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders starter tasks and preserves completed state', async () => {
    render(<QuestSection />);

    expect(await screen.findByText('首次商业出图')).toBeInTheDocument();
    expect(screen.getByText('保存 Prompt 案例')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByText('+40')).toBeInTheDocument();

    const activeButton = screen.getByRole('button', { name: /Go/ });
    expect(activeButton).toBeEnabled();

    const completedButton = screen.getByRole('button', {
      name: /Completed/
    });
    expect(completedButton).toBeDisabled();
  });

  it('falls back to the public starter checklist when signed out', async () => {
    vi.mocked(getAccessToken).mockReturnValue(null);

    render(<QuestSection />);

    expect(await screen.findByText('完成第一张商业图')).toBeInTheDocument();
    expect(screen.getByText('复用一个 Prompt 案例')).toBeInTheDocument();
    expect(screen.getByText('0/6')).toBeInTheDocument();
    expect(screen.getByText('+60')).toBeInTheDocument();
    expect(
      screen.getByText('登录后会自动同步任务进度，并在完成任务时领取积分奖励。')
    ).toBeInTheDocument();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
