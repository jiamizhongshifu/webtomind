import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ComfyWorkflowCheckerPage } from '../ComfyWorkflowCheckerPage';

const checkerPageMock = vi.hoisted(() => ({
  navigate: vi.fn(),
  trackEvent: vi.fn()
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => checkerPageMock.navigate
  };
});

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: false
  })
}));

vi.mock('../../lib/seo', () => ({
  applySeo: () => () => {}
}));

vi.mock('../../lib/analytics', () => ({
  trackEvent: checkerPageMock.trackEvent
}));

vi.mock('../MarketingPageShell', () => ({
  MarketingPageShell: ({
    children,
    subtitle,
    title
  }: {
    children: ReactNode;
    subtitle: string;
    title: string;
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {children}
    </main>
  ),
  useMarketingLocale: () => ({
    locale: 'zh-CN',
    isZh: true
  })
}));

describe('ComfyWorkflowCheckerPage', () => {
  it('parses pasted workflow and sends prompt state to /create', () => {
    checkerPageMock.navigate.mockReset();
    checkerPageMock.trackEvent.mockReset();
    render(
      <MemoryRouter initialEntries={['/zh-CN/tools/comfyui-workflow-checker']}>
        <ComfyWorkflowCheckerPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('粘贴 workflow JSON'), {
      target: {
        value: JSON.stringify({
          '1': {
            class_type: 'CheckpointLoaderSimple',
            inputs: { ckpt_name: 'realvisxl.safetensors' }
          },
          '2': {
            class_type: 'CLIPTextEncode',
            inputs: { text: 'cinematic product hero image' }
          },
          '3': {
            class_type: 'CLIPTextEncode',
            inputs: { text: 'low quality' }
          },
          '4': {
            class_type: 'KSampler',
            inputs: {
              positive: ['2', 0],
              negative: ['3', 0]
            }
          }
        })
      }
    });

    fireEvent.click(screen.getByRole('button', { name: '检查 Workflow' }));

    expect(
      screen.getByText('realvisxl.safetensors (checkpoint)')
    ).toBeInTheDocument();
    expect(screen.getByText(/低风险/)).toBeInTheDocument();
    expect(screen.getByText('可直接迁移')).toBeInTheDocument();
    expect(
      screen.getByText('cinematic product hero image')
    ).toBeInTheDocument();
    expect(checkerPageMock.trackEvent).toHaveBeenCalledWith(
      'comfy_check_complete',
      expect.objectContaining({
        workflow_type: 'api',
        risk_level: 'low'
      })
    );

    fireEvent.click(screen.getByRole('button', { name: '用 WebToMind 生成' }));

    expect(checkerPageMock.navigate).toHaveBeenCalledWith('/zh-CN/create', {
      state: {
        source: 'comfyui_checker',
        workflowNegativePrompt: 'low quality',
        workflowPrompt: 'cinematic product hero image'
      }
    });
  });
});
