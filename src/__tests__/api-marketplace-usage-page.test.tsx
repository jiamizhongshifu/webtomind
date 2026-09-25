import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode
} from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ApiConsolePage from '../web/pages/ApiConsolePage';
import {
  createApiKey,
  getApiCreditPackages,
  getApiKeys,
  getApiUsage,
  getApiWallet
} from '../services/api-marketplace';
import { createCheckoutSession } from '../services/payment-api';

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/api-console' })
}));

vi.mock('../web/components/create-workspace/CreateWorkspaceShell', () => ({
  CreateWorkspaceShell: ({
    children,
    className
  }: {
    children: ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>
}));

vi.mock('@/shared/ui', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  ButtonLink: ({
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
  Dialog: ({
    open,
    title,
    description,
    children,
    footer,
    onClose
  }: {
    open: boolean;
    title: ReactNode;
    description?: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
    onClose: () => void;
  }) =>
    open ? (
      <div role="dialog" aria-label={String(title)}>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
        {children}
        <button type="button" onClick={onClose}>
          关闭 API Key 弹窗
        </button>
        {footer}
      </div>
    ) : null
}));

vi.mock('../services/payment-api', () => ({
  createCheckoutSession: vi.fn(),
  redirectToCheckout: vi.fn()
}));

vi.mock('../services/api-marketplace', () => ({
  createApiKey: vi.fn(),
  getApiCreditPackages: vi.fn(),
  getApiKeys: vi.fn(),
  getApiUsage: vi.fn(),
  getApiWallet: vi.fn(),
  revokeApiKey: vi.fn()
}));

const mockedCreateApiKey = vi.mocked(createApiKey);
const mockedGetApiWallet = vi.mocked(getApiWallet);
const mockedGetApiKeys = vi.mocked(getApiKeys);
const mockedGetApiCreditPackages = vi.mocked(getApiCreditPackages);
const mockedGetApiUsage = vi.mocked(getApiUsage);
const mockedCreateCheckoutSession = vi.mocked(createCheckoutSession);

function mockConsoleBasics() {
  mockedGetApiWallet.mockResolvedValue({
    wallet: {
      user_id: 'user-1',
      balance_cents: 500,
      total_deposited_cents: 500,
      updated_at: '2026-08-25T12:00:00.000Z'
    },
    transactions: []
  });
  mockedGetApiKeys.mockResolvedValue({
    keys: [
      {
        id: 'key-1',
        name: '生产 Key',
        key_prefix: 'sk-wtm_key-1',
        status: 'active',
        total_spent_cents: 7,
        created_at: '2026-08-25T12:00:00.000Z',
        last_used_at: null,
        expires_at: null
      }
    ]
  });
  mockedGetApiCreditPackages.mockResolvedValue({
    packages: [],
    checkoutProviders: ['alipay', 'stripe'],
    pricing: {
      usdToCnyRate: 7.2,
      customAvailable: true,
      customMinUsdCents: 100,
      customMaxUsdCents: 138_800
    }
  });
}

describe('ApiConsolePage usage section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConsoleBasics();
  });

  it('renders usage records with model, key name, tokens and platform charge', async () => {
    mockedGetApiUsage.mockResolvedValue({
      usage: [
        {
          id: 'usage-1',
          key_id: 'key-1',
          request_id: 'req-1',
          status: 'succeeded',
          model: 'gpt-5.6-luna',
          endpoint: '/v1/chat/completions',
          reserved_cents: 10,
          actual_customer_cents: 7,
          input_tokens: 1200,
          output_tokens: 340,
          total_tokens: 1540,
          settled_at: '2026-08-25T12:00:00.000Z',
          created_at: '2026-08-25T12:00:00.000Z'
        }
      ],
      totalSpentCents: 137,
      limit: 50,
      keyId: null
    });

    render(<ApiConsolePage />);

    expect(await screen.findByText('API 使用记录')).toBeTruthy();
    expect(screen.getByText('gpt-5.6-luna')).toBeTruthy();
    expect(screen.getAllByText('生产 Key').length).toBeGreaterThan(1);
    expect(screen.getByText('输入 1,200')).toBeTruthy();
    expect(screen.getByText('输出 340')).toBeTruthy();
    expect(screen.getByText('$0.07')).toBeTruthy();
    expect(screen.getByText('$1.37')).toBeTruthy();
    expect(screen.getByText('成功')).toBeTruthy();
  });

  it('renders account ledger entries with structured labels and signed amounts', async () => {
    mockedGetApiWallet.mockResolvedValue({
      wallet: {
        user_id: 'user-1',
        balance_cents: 493,
        total_deposited_cents: 500,
        updated_at: '2026-08-25T12:00:00.000Z'
      },
      transactions: [
        {
          id: 'tx-1',
          type: 'usage_charge',
          amount_cents: -7,
          balance_after_cents: 493,
          source: 'api_usage_settlement',
          created_at: '2026-08-25T12:00:00.000Z'
        }
      ]
    });
    mockedGetApiUsage.mockResolvedValue({
      usage: [],
      totalSpentCents: 7,
      limit: 50,
      keyId: null
    });

    render(<ApiConsolePage />);

    expect(await screen.findByText('模型调用扣费')).toBeTruthy();
    expect(screen.getByText('按实际模型用量结算')).toBeTruthy();
    expect(screen.getByText('−$0.07')).toBeTruthy();
    expect(screen.queryByText('api_usage_settlement')).toBeNull();
  });

  it('reveals a newly-created key in a modal without funding the key', async () => {
    mockedGetApiUsage.mockResolvedValue({
      usage: [],
      totalSpentCents: 0,
      limit: 50,
      keyId: null
    });
    mockedCreateApiKey.mockResolvedValue({
      key: {
        id: 'key-2',
        name: '新服务',
        key_prefix: 'sk-wtm_key-2',
        status: 'active',
        total_spent_cents: 0,
        created_at: '2026-08-25T13:00:00.000Z',
        last_used_at: null,
        expires_at: null
      },
      secret: 'sk-wtm_secret-only-once'
    });

    render(<ApiConsolePage />);

    fireEvent.change(await screen.findByLabelText('API Key 名称'), {
      target: { value: '新服务' }
    });
    fireEvent.click(screen.getByRole('button', { name: /创建 Key/ }));

    expect(await screen.findByRole('dialog', { name: 'API Key 已创建' })).toBeTruthy();
    expect(screen.getByText('sk-wtm_secret-only-once')).toBeTruthy();
    expect(
      screen.getAllByText('共享账户 API 额度 · 上次使用：尚未使用')
    ).toHaveLength(2);
    expect(screen.queryByText('分配账户余额')).toBeNull();
    expect(screen.queryByText('Key 余额')).toBeNull();
    expect(mockedCreateApiKey).toHaveBeenCalledWith('新服务');
  });

  it('shows a fallback label for keys that were deleted', async () => {
    mockedGetApiUsage.mockResolvedValue({
      usage: [
        {
          id: 'usage-2',
          key_id: 'gone-key',
          request_id: 'req-2',
          status: 'failed',
          model: 'deepseek-v3-all',
          endpoint: '/v1/chat/completions',
          reserved_cents: 10,
          actual_customer_cents: 0,
          input_tokens: 200,
          output_tokens: 0,
          total_tokens: 200,
          settled_at: null,
          created_at: '2026-08-25T11:00:00.000Z'
        }
      ],
      totalSpentCents: 0,
      limit: 50,
      keyId: null
    });

    render(<ApiConsolePage />);

    expect(await screen.findByText('deepseek-v3-all')).toBeTruthy();
    expect(screen.getByText('已删除的 Key')).toBeTruthy();
    expect(screen.getByText('失败')).toBeTruthy();
  });

  it('reloads usage when the key filter changes', async () => {
    mockedGetApiUsage.mockResolvedValue({
      usage: [],
      totalSpentCents: 0,
      limit: 50,
      keyId: null
    });

    render(<ApiConsolePage />);
    await screen.findByText('API 使用记录');

    fireEvent.change(screen.getByLabelText('筛选 Key'), {
      target: { value: 'key-1' }
    });

    await waitFor(() => {
      expect(mockedGetApiUsage).toHaveBeenCalledWith({
        keyId: 'key-1',
        limit: 50
      });
    });
  });

  it('renders the empty state when there are no usage records', async () => {
    mockedGetApiUsage.mockResolvedValue({
      usage: [],
      totalSpentCents: 0,
      limit: 50,
      keyId: null
    });

    render(<ApiConsolePage />);

    expect(
      await screen.findByText('还没有 API 使用记录，调用模型后将在这里显示。')
    ).toBeTruthy();
  });

  it('renders the error state when usage loading fails', async () => {
    mockedGetApiUsage.mockRejectedValue(new Error('boom'));

    render(<ApiConsolePage />);

    expect(
      await screen.findByText('API 使用记录暂时无法加载，请刷新重试。')
    ).toBeTruthy();
    expect(
      screen.queryByText('还没有 API 使用记录，调用模型后将在这里显示。')
    ).toBeNull();
  });

  it('quotes and submits a custom integer USD API recharge', async () => {
    mockedGetApiUsage.mockResolvedValue({
      usage: [],
      totalSpentCents: 0,
      limit: 50,
      keyId: null
    });
    mockedCreateCheckoutSession.mockResolvedValue({
      id: 'order-1',
      url: 'https://checkout.example.test/order-1'
    });

    render(<ApiConsolePage />);

    const amountInput = await screen.findByLabelText('充值美元金额');
    fireEvent.change(amountInput, { target: { value: '5' } });
    expect(await screen.findByText(/预计到账 \$5 API 额度/)).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: '支付宝' }));
    fireEvent.click(
      screen.getByRole('button', { name: '自定义充值 · 支付宝' })
    );
    await waitFor(() => {
      expect(mockedCreateCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'api_credit_package',
          id: 'custom',
          customAmountUsdCents: 500,
          paymentProvider: 'alipay'
        })
      );
    });
  });
});
