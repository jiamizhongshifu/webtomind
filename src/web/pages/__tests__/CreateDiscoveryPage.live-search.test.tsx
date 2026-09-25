import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateDiscoveryPage } from '../CreateDiscoveryPage';

const testState = vi.hoisted(() => ({
  describeDiscoveryImage: vi.fn(),
  searchVisualDiscovery: vi.fn(),
  listMoodboards: vi.fn()
}));

vi.mock('@/services/create-workspace-v2-api', () => ({
  addMoodboardItems: vi.fn(),
  copyMoodboardToLibrary: vi.fn(),
  describeDiscoveryImage: testState.describeDiscoveryImage,
  listMoodboards: testState.listMoodboards,
  searchVisualDiscovery: testState.searchVisualDiscovery
}));

vi.mock('@/services/agent-api', () => ({
  getPublicPromptCase: vi.fn()
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, isLoading: false })
}));

vi.mock('../../components/AuthModal', () => ({
  useAuthModal: () => ({ openAuthModal: vi.fn() })
}));

vi.mock('../../components/create-workspace/CreateWorkspaceShell', () => ({
  CreateWorkspaceShell: ({ children }: { children: ReactNode }) => (
    <main>{children}</main>
  )
}));

vi.mock('../../components/create-workspace/WorkspaceHeroCarousel', () => ({
  WorkspaceHeroCarousel: () => <div data-testid="hero" />
}));

vi.mock('../../components/create-workspace/DiscoveryGallery', () => ({
  DiscoveryGallerySkeleton: () => <div role="status">loading</div>,
  DiscoveryImageMasonry: () => <div data-testid="image-results" />,
  DiscoveryImagePreview: () => null,
  DiscoveryLoadMore: () => null,
  DiscoveryMoodboardGrid: () => <div data-testid="moodboard-results" />,
  DiscoveryMoodboardPreview: () => null
}));

vi.mock('../../components/image-create/referenceFileUtils', () => ({
  fileToDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,AAAA')
}));

vi.mock('../../lib/create-workspace-flags', () => ({
  isCreateWorkspaceFeatureEnabled: () => true
}));

function renderDiscoveryPage() {
  return render(
    <MemoryRouter initialEntries={['/zh-CN/create?gallery=images']}>
      <Routes>
        <Route path="/zh-CN/create" element={<CreateDiscoveryPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('CreateDiscoveryPage live visual search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.listMoodboards.mockResolvedValue([]);
    testState.searchVisualDiscovery.mockImplementation((query: string) =>
      Promise.resolve({ query, images: [], moodboards: [] })
    );
    testState.describeDiscoveryImage.mockResolvedValue({
      keywords: ['hidden visual term', 'cinematic orange'],
      searchQuery: 'hidden visual term cinematic orange'
    });
  });

  it('keeps model analysis hidden and live-merges editable user terms', async () => {
    const view = renderDiscoveryPage();

    await waitFor(() =>
      expect(testState.searchVisualDiscovery).toHaveBeenCalledWith(
        '',
        'zh-CN',
        { limit: 24 }
      )
    );
    expect(screen.queryByRole('button', { name: '搜索' })).toBeNull();

    const searchbox = screen.getByRole('searchbox', {
      name: '搜索创作灵感'
    });
    fireEvent.change(searchbox, { target: { value: '杂志封面' } });

    await waitFor(
      () =>
        expect(testState.searchVisualDiscovery).toHaveBeenCalledWith(
          '杂志封面',
          'zh-CN',
          { limit: 24 }
        ),
      { timeout: 1_000 }
    );

    const fileInput =
      view.container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput!, {
      target: {
        files: [new File(['image'], 'reference.png', { type: 'image/png' })]
      }
    });

    await waitFor(() =>
      expect(testState.describeDiscoveryImage).toHaveBeenCalledTimes(1)
    );
    expect(searchbox).toHaveValue('杂志封面');
    expect(screen.queryByText('hidden visual term')).toBeNull();
    expect(screen.queryByText('cinematic orange')).toBeNull();
    expect(screen.queryByText('图片解析完成')).toBeNull();

    await waitFor(
      () =>
        expect(testState.searchVisualDiscovery).toHaveBeenCalledWith(
          'hidden visual term cinematic orange 杂志封面',
          'zh-CN',
          { limit: 24 }
        ),
      { timeout: 1_000 }
    );

    fireEvent.change(searchbox, { target: { value: '杂志封面 柔光' } });
    await waitFor(
      () =>
        expect(testState.searchVisualDiscovery).toHaveBeenCalledWith(
          'hidden visual term cinematic orange 杂志封面 柔光',
          'zh-CN',
          { limit: 24 }
        ),
      { timeout: 1_000 }
    );
  });

  it('removes only the image condition when visual search is cancelled', async () => {
    const view = renderDiscoveryPage();
    const searchbox = screen.getByRole('searchbox', {
      name: '搜索创作灵感'
    });
    fireEvent.change(searchbox, { target: { value: '保留的文字条件' } });

    const fileInput =
      view.container.querySelector<HTMLInputElement>('input[type="file"]');
    fireEvent.change(fileInput!, {
      target: {
        files: [new File(['image'], 'reference.png', { type: 'image/png' })]
      }
    });
    await screen.findByText('已启用图片搜索');

    fireEvent.click(screen.getByRole('button', { name: '取消图片搜索' }));

    expect(searchbox).toHaveValue('保留的文字条件');
    await waitFor(
      () =>
        expect(testState.searchVisualDiscovery).toHaveBeenCalledWith(
          '保留的文字条件',
          'zh-CN',
          { limit: 24 }
        ),
      { timeout: 1_000 }
    );
  });

  it('returns to the top and refreshes related recommendations for each image detail', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const discoveryImage = {
      id: 'detail-image-1',
      kind: 'krea' as const,
      title: '蓝色留白插画',
      imageUrl: '/discovery/detail-image-1.webp',
      prompt: 'minimal blue editorial illustration with wide negative space',
      promptPreview: 'minimal blue editorial illustration',
      promptLocked: false,
      model: 'GPT Image 2',
      href: '/prompts/detail-image-1'
    };

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/zh-CN/create',
            search: '?gallery=images&preview=detail-image-1',
            state: { discoveryImage }
          }
        ]}
      >
        <Routes>
          <Route path="/zh-CN/create" element={<CreateDiscoveryPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalledWith({
        top: 0,
        left: 0,
        behavior: 'auto'
      });
    });
    await waitFor(() => {
      expect(testState.searchVisualDiscovery).toHaveBeenCalledWith(
        discoveryImage.prompt,
        'zh-CN',
        { kind: 'images', limit: 24 }
      );
    });
  });

  it('keeps the upload action beside the search field on mobile', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/web/styles/create-workspace-v2.css'),
      'utf8'
    );

    expect(css).toMatch(
      /\.create-discovery-page \.create-v2-search form button:nth-of-type\(1\) \{\s+grid-column: auto;\s+justify-self: end;/
    );
  });
});
