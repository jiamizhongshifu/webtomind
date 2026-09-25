import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleGuard } from '../LocaleGuard';

const localeState = vi.hoisted(() => ({ locale: 'en-US' }));

vi.mock('@/i18n/config', () => ({
  getInitialLanguageSync: () => localeState.locale
}));

function Harness({ initialPath }: { initialPath: string }) {
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="*"
          element={
            <LocaleGuard>
              <div>guarded-page</div>
            </LocaleGuard>
          }
        />
        <Route path="/en-US/overview" element={<div>en-overview</div>} />
        <Route path="/zh-CN/overview" element={<div>zh-overview</div>} />
        <Route
          path="/en-US/create/image"
          element={<div>en-create-image</div>}
        />
        <Route
          path="/zh-CN/create/image"
          element={<div>zh-create-image</div>}
        />
        <Route
          path="/en-US/create/prompts"
          element={<div>en-create-prompts</div>}
        />
        <Route path="/en-US/prompts" element={<div>en-prompts</div>} />
        <Route path="/en-US/pricing" element={<div>en-pricing</div>} />
        <Route path="/zh-CN/pricing" element={<div>zh-pricing</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localeState.locale = 'en-US';
});

describe('LocaleGuard', () => {
  it('英文用户访问无前缀路径时重定向到 /en-US', async () => {
    render(<Harness initialPath="/create/image?newSession=1" />);
    expect(await screen.findByText('en-create-image')).toBeInTheDocument();
    expect(screen.queryByText('guarded-page')).not.toBeInTheDocument();
  });

  it('中文用户访问无前缀路径时重定向到 /zh-CN', async () => {
    localeState.locale = 'zh-CN';
    render(<Harness initialPath="/create/image" />);
    expect(await screen.findByText('zh-create-image')).toBeInTheDocument();
  });

  it('根路径重定向到本地化 overview', async () => {
    render(<Harness initialPath="/" />);
    expect(await screen.findByText('en-overview')).toBeInTheDocument();
  });

  it('/prompts 重定向到本地化 Prompt 库', async () => {
    render(<Harness initialPath="/prompts" />);
    expect(await screen.findByText('en-prompts')).toBeInTheDocument();
  });

  it('旧工作区路径重定向到本地化定价页', async () => {
    render(<Harness initialPath="/workspace" />);
    expect(await screen.findByText('en-pricing')).toBeInTheDocument();
  });

  it('已有语言前缀的路径保持原样', async () => {
    render(<Harness initialPath="/zh-CN/overview" />);
    expect(await screen.findByText('zh-overview')).toBeInTheDocument();
  });

  it('没有本地化变体的路径保持原样（公开分享、工作区、SEO 别名）', async () => {
    const { unmount } = render(<Harness initialPath="/s/abc123" />);
    expect(await screen.findByText('guarded-page')).toBeInTheDocument();
    unmount();

    const second = render(<Harness initialPath="/boards" />);
    expect(await second.findByText('guarded-page')).toBeInTheDocument();
  });
});
