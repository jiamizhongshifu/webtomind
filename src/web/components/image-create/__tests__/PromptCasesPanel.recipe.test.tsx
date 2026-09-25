import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PromptCase, PromptCaseDraft } from '@/services/agent-api';
import { PromptCasesPanel } from '../PromptCasesPanel';

const {
  getAdminPromptCaseDraftsMock,
  getAdminPromptCaseMock,
  getAdminPromptCasesMock,
  getPublicPromptCasesMock,
  publishAllAdminPromptCaseDraftsMock,
  trackPromptCaseEventMock
} = vi.hoisted(() => ({
  getAdminPromptCaseDraftsMock: vi.fn(),
  getAdminPromptCaseMock: vi.fn(),
  getAdminPromptCasesMock: vi.fn(),
  getPublicPromptCasesMock: vi.fn(),
  publishAllAdminPromptCaseDraftsMock: vi.fn(),
  trackPromptCaseEventMock: vi.fn()
}));

vi.mock('@/services/agent-api', () => ({
  getPublicPromptCases: getPublicPromptCasesMock,
  getAdminPromptCase: getAdminPromptCaseMock,
  getAdminPromptCases: getAdminPromptCasesMock,
  getAdminPromptCaseDrafts: getAdminPromptCaseDraftsMock,
  getPublicPromptCase: vi.fn(),
  trackPromptCaseEvent: trackPromptCaseEventMock,
  createAdminPromptCase: vi.fn(),
  deleteAdminPromptCase: vi.fn(),
  deleteAdminPromptCaseDraft: vi.fn(),
  extractAdminPromptCaseDraftFromTweet: vi.fn(),
  generateAdminPromptCaseDraftImages: vi.fn(),
  generateAdminPromptCaseDrafts: vi.fn(),
  refreshVisualImageHistoryItem: vi.fn(),
  publishAdminPromptCaseDraft: vi.fn(),
  saveAdminPromptCase: vi.fn(),
  saveAdminPromptCaseDraft: vi.fn(),
  uploadAdminPromptCaseImageFile: vi.fn()
}));

vi.mock('@/services/prompt-case-draft-publish', () => ({
  publishAllAdminPromptCaseDrafts: publishAllAdminPromptCaseDraftsMock
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const messages: Record<string, string> = {
        'promptCases.title': 'Prompt cases',
        'promptCases.subtitle': 'Browse recipes',
        'promptCases.all': 'All',
        'promptCases.usePrompt': 'Use prompt',
        'promptCases.previewTitle': 'Preview',
        'promptCases.previewModalTitle': 'Case preview',
        'promptCases.loadFailed': 'Load failed',
        'promptCases.empty': 'No cases',
        'promptCases.loading': 'Loading',
        'promptCases.loginToViewPrompt': 'Login to view prompt',
        'promptCases.loadMore': 'Load more',
        'promptCases.recreateApplied': 'Applied',
        'promptCases.adminTabs.cases': 'Cases',
        'promptCases.adminTabs.drafts': 'Drafts',
        'promptCases.adminTitle': 'Case management',
        'promptCases.adminAllCases': 'All cases',
        'promptCases.adminFeaturedOnly': 'Featured only',
        'promptCases.adminFilterLabel': 'Case filters',
        'promptCases.newCase': 'New case',
        'promptCases.sort.label': 'Sort',
        'promptCases.sort.default': 'Default sort',
        'promptCases.metrics.views': 'Views',
        'promptCases.metrics.copies': 'Copies',
        'promptCases.metrics.generates': 'Generates',
        'promptCases.metrics.generateRate': 'Generate rate',
        'promptCases.edit': 'Edit',
        'promptCases.delete': 'Delete',
        'promptCases.setFeatured': 'Set featured',
        'promptCases.unsetFeatured': 'Unset featured',
        'promptCases.category.featured': 'Featured',
        'promptCases.category.poster': 'Poster',
        'promptCases.promptPreview': 'Prompt preview',
        'preview.close': 'Close',
        'preview.promptLabel': 'Prompt',
        'preview.copyPrompt': 'Copy prompt',
        'preview.copied': 'Copied'
      };
      return messages[key] || String(options?.defaultValue || key);
    }
  })
}));

vi.mock('@/services/reward-task-events', () => ({
  completeRewardTaskOnce: vi.fn(),
  REWARD_TASK_IDENTIFIERS: {
    savePromptCaseOrPromptAsset: 'save-prompt-case-or-prompt-asset'
  }
}));

vi.mock('../../../../shared/ui', async () => {
  const actual = await vi.importActual<typeof import('../../../../shared/ui')>(
    '../../../../shared/ui'
  );
  return {
    ...actual,
    useOverlayBehavior: () => ({ current: null })
  };
});

vi.mock('../../../hooks/useImagePromptAssetCatalog', async () => {
  const { imagePromptAssetCatalog } =
    await import('../../../data/image-prompt-asset-catalog');
  return {
    useImagePromptAssetCatalog: () => imagePromptAssetCatalog
  };
});

const recipeCase: PromptCase = {
  id: 'case-recipe',
  slug: 'case-recipe',
  title: '海边写真案例',
  imageUrl: 'https://example.com/case-recipe.webp',
  prompt: '海边写真，年轻角色，城市转角替换测试',
  promptPreview: '海边写真，年轻角色',
  model: 'gpt-image-2',
  locale: 'zh-CN',
  category: 'poster',
  visualRecipe: {
    selection: {
      character: 'character-arcane-apprentice',
      background: 'background-city-corner'
    }
  },
  createdAt: '2026-06-18T10:00:00.000Z'
};

const relatedRecipeCase: PromptCase = {
  ...recipeCase,
  id: 'case-related',
  slug: 'case-related',
  title: '同款街角案例',
  imageUrl: 'https://example.com/case-related.webp',
  visualRecipe: {
    selection: {
      background: 'background-city-corner'
    }
  },
  featured: true,
  generateCount: 9
};

const moreRecipeCase: PromptCase = {
  ...recipeCase,
  id: 'case-more',
  slug: 'case-more',
  title: '更多热门案例样张',
  imageUrl: 'https://example.com/case-more.webp',
  visualRecipe: {
    selection: {
      character: 'character-refined-model'
    }
  }
};

function makeDraft(
  id: string,
  overrides: Partial<PromptCaseDraft> = {}
): PromptCaseDraft {
  return {
    id,
    packageSlug: '',
    sourceSkill: 'import',
    title: `Draft ${id}`,
    category: 'portrait',
    tags: [],
    prompt: 'A complete portrait prompt',
    generationSettings: {
      model: 'gpt-image-2',
      imageSize: '1024x1024',
      quality: 'auto',
      imageCount: 1
    },
    imageUrls: [`https://example.com/${id}.webp`],
    memberOnly: true,
    status: 'draft',
    ...overrides
  };
}

function renderPanel(
  onRecreate = vi.fn(),
  options: {
    forceManageOpen?: boolean;
    isPromptCaseAdmin?: boolean;
    path?: string;
    variant?: 'panel' | 'rail' | 'full';
  } = {}
) {
  return {
    onRecreate,
    ...render(
      <MemoryRouter initialEntries={[options.path || '/zh-CN/create/image']}>
        <PromptCasesPanel
          isAuthenticated
          isPromptCaseAdmin={options.isPromptCaseAdmin ?? false}
          onRequireLogin={vi.fn()}
          onRecreate={onRecreate}
          variant={options.variant || 'rail'}
          forceManageOpen={options.forceManageOpen}
        />
      </MemoryRouter>
    )
  };
}

describe('PromptCasesPanel visual recipe actions', () => {
  beforeEach(() => {
    getPublicPromptCasesMock.mockReset();
    getPublicPromptCasesMock.mockResolvedValue([recipeCase]);
    getAdminPromptCaseDraftsMock.mockReset();
    getAdminPromptCaseDraftsMock.mockResolvedValue([]);
    getAdminPromptCasesMock.mockReset();
    getAdminPromptCasesMock.mockResolvedValue({
      cases: [],
      total: 0,
      hasMore: false,
      nextOffset: null
    });
    getAdminPromptCaseMock.mockReset();
    publishAllAdminPromptCaseDraftsMock.mockReset();
    publishAllAdminPromptCaseDraftsMock.mockResolvedValue({
      published: [],
      failures: []
    });
    trackPromptCaseEventMock.mockReset();

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }))
    });

    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    window.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
  });

  it('does not load the formal case list while the admin drafts tab is active', async () => {
    renderPanel(vi.fn(), {
      forceManageOpen: true,
      isPromptCaseAdmin: true,
      path: '/zh-CN/prompts/admin/drafts',
      variant: 'full'
    });

    await waitFor(() => {
      expect(getAdminPromptCaseDraftsMock).toHaveBeenCalledTimes(1);
    });
    expect(getAdminPromptCasesMock).not.toHaveBeenCalled();
  });

  it('passes visual recipe selection and clicked slot into recreate payload', async () => {
    const { onRecreate } = renderPanel();

    const backgroundChip = await screen.findByRole('button', {
      name: /City Corner|城市街角|background-city-corner/i
    });
    fireEvent.click(backgroundChip);

    await waitFor(() => {
      expect(onRecreate).toHaveBeenCalledTimes(1);
    });

    expect(onRecreate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: recipeCase.prompt,
        openAssetSlot: 'background',
        visualRecipeSelection: expect.objectContaining({
          character: 'character-arcane-apprentice',
          background: 'background-city-corner'
        }),
        remixSource: expect.objectContaining({
          id: recipeCase.id,
          source: 'prompt_cases_panel'
        })
      })
    );
  });

  it('shows same-asset cases and more popular cases from the preview recipe', async () => {
    getPublicPromptCasesMock.mockResolvedValue([
      recipeCase,
      relatedRecipeCase,
      moreRecipeCase
    ]);
    renderPanel();

    const caseTitle = await screen.findByText('海边写真案例');
    fireEvent.click(caseTitle.closest('article')!);

    const modal = screen.getByRole('dialog', { name: 'Case preview' });
    expect(within(modal).getByText('按这套配方创作')).toBeInTheDocument();
    expect(within(modal).getByText('更多热门案例')).toBeInTheDocument();
    expect(within(modal).getByText('更多热门案例样张')).toBeInTheDocument();

    const backgroundRecipeChip = within(modal)
      .getByText(/城市街角|City Corner|background-city-corner/i)
      .closest('button');
    expect(backgroundRecipeChip).toBeTruthy();
    fireEvent.click(backgroundRecipeChip!);

    expect(
      within(modal).getByText('使用同款素材的热门案例')
    ).toBeInTheDocument();
    const relatedLink = within(modal).getByRole('link', {
      name: /同款街角案例/
    });
    expect(relatedLink).toHaveAttribute('href', '/zh-CN/prompts/case-related');
  });

  it('keeps the full admin case prompt when a locked public copy has the same id', async () => {
    const publicLockedCase: PromptCase = {
      ...recipeCase,
      prompt: '',
      promptPreview: 'Only public preview',
      promptLocked: true
    };
    const adminFullCase: PromptCase = {
      ...recipeCase,
      prompt: '完整管理员 Prompt，用于后台预览。',
      promptZh: '完整管理员 Prompt，用于后台预览。',
      promptLocked: false
    };
    getPublicPromptCasesMock.mockResolvedValue([publicLockedCase]);
    getAdminPromptCasesMock.mockResolvedValue({
      cases: [adminFullCase],
      total: 1,
      hasMore: false,
      nextOffset: null
    });

    renderPanel(vi.fn(), {
      forceManageOpen: true,
      isPromptCaseAdmin: true,
      path: '/zh-CN/prompts/admin',
      variant: 'full'
    });

    const coverButton = await screen.findByRole('button', {
      name: /海边写真案例/
    });
    fireEvent.click(coverButton);

    const modal = await screen.findByRole('dialog', { name: 'Case preview' });
    expect(
      within(modal).getByText('完整管理员 Prompt，用于后台预览。')
    ).toBeInTheDocument();
    expect(
      within(modal).queryByText('Login to view prompt')
    ).not.toBeInTheDocument();
  });

  it('opens the draft admin tab from its standalone URL', async () => {
    renderPanel(vi.fn(), {
      forceManageOpen: true,
      isPromptCaseAdmin: true,
      path: '/zh-CN/prompts/admin/drafts',
      variant: 'full'
    });

    const draftsTab = await screen.findByRole('tab', { name: 'Drafts' });

    expect(draftsTab).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => {
      expect(getAdminPromptCaseDraftsMock).toHaveBeenCalled();
    });
  });

  it('publishes every complete draft from one confirmed action and keeps incomplete drafts', async () => {
    const readyDraft = makeDraft('ready');
    const incompleteDraft = makeDraft('incomplete', {
      prompt: '',
      imageUrls: []
    });
    getAdminPromptCaseDraftsMock.mockResolvedValue([
      readyDraft,
      incompleteDraft
    ]);
    publishAllAdminPromptCaseDraftsMock.mockResolvedValue({
      published: [
        {
          draftId: readyDraft.id,
          title: readyDraft.title,
          deletedDraftId: readyDraft.id
        }
      ],
      failures: []
    });

    renderPanel(vi.fn(), {
      forceManageOpen: true,
      isPromptCaseAdmin: true,
      path: '/zh-CN/prompts/admin/drafts',
      variant: 'full'
    });

    fireEvent.click(
      await screen.findByRole('button', { name: '发布全部（1）' })
    );
    const dialog = await screen.findByRole('dialog', {
      name: '确认发布全部草稿'
    });
    expect(within(dialog).getByText('可发布')).toBeInTheDocument();
    expect(within(dialog).getByText('信息不完整')).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole('button', { name: '发布全部 1 条' })
    );

    await waitFor(() => {
      expect(publishAllAdminPromptCaseDraftsMock).toHaveBeenCalledWith(
        [readyDraft],
        expect.objectContaining({ concurrency: 3 })
      );
    });
    await waitFor(() => {
      expect(screen.queryByText(readyDraft.title)).not.toBeInTheDocument();
      expect(screen.getByText(incompleteDraft.title)).toBeInTheDocument();
    });
  });
});
