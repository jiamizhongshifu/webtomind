import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode
} from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ApiModelsPage from '../ApiModelsPage';
import { getApiMarketplaceModels } from '@/services/api-marketplace';

vi.mock('../../components/create-workspace/CreateWorkspaceShell', () => ({
  CreateWorkspaceShell: ({
    children,
    className
  }: {
    children: ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>
}));

vi.mock('@/shared/ui', () => ({
  Button: ({
    children,
    leadingIcon: _leadingIcon,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    leadingIcon?: ReactNode;
  }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  ButtonLink: ({
    children,
    trailingIcon: _trailingIcon,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    trailingIcon?: ReactNode;
  }) => <a {...props}>{children}</a>
}));

vi.mock('@/services/api-marketplace', () => ({
  getApiMarketplaceModels: vi.fn()
}));

const mockedGetApiMarketplaceModels = vi.mocked(getApiMarketplaceModels);

const model = {
  id: 'deepseek-v3-all',
  name: 'deepseek-v3-all',
  description: 'General model',
  tags: ['文本'],
  pricingMode: 'token' as const,
  provider: 'DeepSeek',
  groups: ['default'],
  customer: {
    modelRatio: 0.5265,
    completionRatio: 5.2,
    modelPrice: null,
    currency: 'USD'
  },
  pricing: {
    inputPerMillion: 1.3689,
    outputPerMillion: 7.1183,
    requestPrice: null,
    unit: 'tokens_1m' as const
  },
  endpoints: ['openai']
};

function renderModelsPage(path = '/zh-CN/models') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ApiModelsPage />
    </MemoryRouter>
  );
}

describe('ApiModelsPage model-name copy feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetApiMarketplaceModels.mockResolvedValue({
      models: [model],
      total: 1,
      currency: 'USD'
    });
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true
    });
  });

  it('shows a success toast after copying a catalog model name', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });

    renderModelsPage();

    const copyButton = await screen.findByRole('button', {
      name: '复制模型名称 deepseek-v3-all'
    });
    fireEvent.click(copyButton);

    expect(writeText).toHaveBeenCalledWith('deepseek-v3-all');
    expect(
      await screen.findByRole('status', { name: '模型名称已复制' })
    ).toBeTruthy();
  });

  it('shows an error alert when the catalog copy operation fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });

    renderModelsPage();

    const copyButton = await screen.findByRole('button', {
      name: '复制模型名称 deepseek-v3-all'
    });
    fireEvent.click(copyButton);

    expect(
      await screen.findByRole('alert', {
        name: '复制失败，请检查浏览器权限后重试。'
      })
    ).toBeTruthy();
  });

  it('shows the same success toast from the status monitor copy action', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });
    mockedGetApiMarketplaceModels.mockResolvedValue({
      models: [
        {
          ...model,
          status: {
            label: '优秀',
            color: '#22c55e',
            errorRate: 0,
            checkedAt: '2026-08-26T00:00:00.000Z',
            totalCount: 10,
            errorCount: 0,
            avgResponseTimeMs: 84.5
          }
        }
      ],
      total: 1,
      currency: 'USD',
      statusMeta: { checkIntervalSeconds: 300 }
    });

    renderModelsPage('/zh-CN/models?tab=status');

    const copyButton = await screen.findByRole('button', {
      name: '复制模型名称 deepseek-v3-all'
    });
    fireEvent.click(copyButton);

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('deepseek-v3-all')
    );
    expect(
      await screen.findByRole('status', { name: '模型名称已复制' })
    ).toBeTruthy();
  });
});
