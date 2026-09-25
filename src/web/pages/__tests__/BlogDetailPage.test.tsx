import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlogDetailPage } from '../BlogDetailPage';

vi.mock('@/services/marketing-api', () => ({
  getPublicBlogPostBySlug: vi.fn().mockResolvedValue(null),
  getPublicBlogPosts: vi.fn().mockResolvedValue([])
}));

vi.mock('../MarketingPageShell', () => ({
  useMarketingLocale: () => ({ locale: 'zh-CN', isZh: true })
}));

vi.mock('@/web/components/image-create/CreateWorkspaceFrame', () => ({
  CreateWorkspaceFrame: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  )
}));

describe('BlogDetailPage', () => {
  afterEach(() => {
    document.getElementById('webtomind-blog-bootstrap')?.remove();
  });

  it('keeps static SEO articles visible after React hydration', async () => {
    const bootstrap = document.createElement('script');
    bootstrap.id = 'webtomind-blog-bootstrap';
    bootstrap.type = 'application/json';
    bootstrap.textContent = JSON.stringify({
      id: 'seo-product-image-ai-guide-zh-CN',
      slug: 'product-image-ai-guide',
      locale: 'zh-CN',
      title: 'AI 商品图生成工作流：从白底图到场景图',
      excerpt: '商品图工作流',
      tag: 'AI 创作指南',
      body_markdown: '先准备商品素材。',
      cover_image: null,
      published_at: '2026-08-10T00:00:00.000Z',
      cta_links: [
        {
          label: '浏览商品图提示词并开始生成',
          href: '/zh-CN/prompts?label=product-commercial&cta_source=seo_blog_product-image-ai-guide_use_template',
          variant: 'primary'
        }
      ]
    });
    document.body.appendChild(bootstrap);

    render(
      <MemoryRouter initialEntries={['/zh-CN/blog/product-image-ai-guide']}>
        <Routes>
          <Route path="/:locale/blog/:slug" element={<BlogDetailPage />} />
          <Route path="/:locale/use-cases" element={<div>blog hub</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'AI 商品图生成工作流：从白底图到场景图'
      })
    ).toBeInTheDocument();
    expect(
      document.querySelector('.marketing-detail-cover-wrap')
    ).not.toBeInTheDocument();
    const cta = screen.getByRole('link', {
      name: '浏览商品图提示词并开始生成'
    });
    expect(cta).toHaveAttribute(
      'href',
      expect.stringContaining(
        'cta_source=seo_blog_product-image-ai-guide_use_template'
      )
    );
    expect(screen.queryByText('blog hub')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: '更多文章' })
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: /阅读 →/ }).every((link) =>
        link.getAttribute('href')?.startsWith('/zh-CN/blog/')
      )
    ).toBe(true);
  });
});
