import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ApiQuickstart } from '../web/pages/api-marketplace/ApiQuickstart';
import { buildApiQuickstart } from '../web/pages/api-marketplace/quickstart';
import {
  getApiMarketplaceModels,
  type ApiMarketplaceModel
} from '../services/api-marketplace';
const location = vi.hoisted(() => ({ search: '?model=image-model' }));
vi.mock('react-router-dom', () => ({ useLocation: () => location }));
vi.mock('../services/api-marketplace', () => ({
  getApiMarketplaceModels: vi.fn()
}));
const image: ApiMarketplaceModel = {
  id: 'image-model',
  name: 'Image Model',
  description: '',
  tags: [],
  endpoints: ['image'],
  requestEndpoints: ['/images/generations'],
  pricingMode: 'request',
  customer: {
    modelRatio: null,
    completionRatio: null,
    modelPrice: 0.1,
    currency: 'USD'
  },
  pricing: {
    inputPerMillion: null,
    outputPerMillion: null,
    requestPrice: 0.1,
    unit: 'request'
  }
};
const chat = {
  ...image,
  id: 'chat-model',
  name: 'Chat Model',
  requestEndpoints: ['/chat/completions']
};
beforeEach(() => {
  vi.clearAllMocks();
  location.search = '?model=image-model';
  vi.mocked(getApiMarketplaceModels).mockResolvedValue({
    models: [image, chat],
    total: 2,
    currency: 'USD'
  });
});
describe('API first request', () => {
  it('preserves selection, copies the complete image request, and switches endpoints', async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    render(<ApiQuickstart baseUrl="https://example.com/v1" copy={copy} />);
    await screen.findByText(/单次请求报价/);
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe(
      'image-model'
    );
    fireEvent.click(screen.getByRole('button', { name: '复制 Python 示例' }));
    expect(copy).toHaveBeenCalledWith(
      expect.stringContaining('client.images.generate'),
      'Python 示例已复制。'
    );
    expect(copy.mock.calls[0][0]).toContain('os.environ["WEBTOMIND_API_KEY"]');
    expect(copy.mock.calls[0][0]).toContain('max_retries=0');
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'chat-model' }
    });
    fireEvent.click(screen.getByRole('button', { name: '复制 Python 示例' }));
    expect(copy).toHaveBeenLastCalledWith(
      expect.stringContaining('client.chat.completions.create'),
      'Python 示例已复制。'
    );
  });
  it('does not silently replace a missing model', async () => {
    location.search = '?model=removed';
    render(<ApiQuickstart baseUrl="https://example.com/v1" copy={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '所选模型已下架'
    );
    expect(
      screen.queryByRole('button', { name: '复制 Python 示例' })
    ).toBeNull();
  });
  it('recovers a catalog load failure without reloading the wallet', async () => {
    vi.mocked(getApiMarketplaceModels).mockRejectedValueOnce(
      new Error('offline')
    );
    render(<ApiQuickstart baseUrl="https://example.com/v1" copy={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '重新加载' }));
    expect(
      await screen.findByRole('button', { name: '复制 Python 示例' })
    ).toBeTruthy();
  });
  it('does not guess a request for undeclared or unsupported paths', () => {
    expect(
      buildApiQuickstart({ ...image, requestEndpoints: undefined }, 'url')
    ).toBeNull();
    expect(
      buildApiQuickstart(
        { ...image, requestEndpoints: ['/vendor/video'] },
        'url'
      )
    ).toBeNull();
  });
  it('quotes model IDs safely inside Python', () => {
    expect(
      buildApiQuickstart({ ...image, id: 'model"\\\n' }, 'url')?.code
    ).toContain('MODEL = "model\\"\\\\\\n"');
  });
});
