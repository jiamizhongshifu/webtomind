import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  QueryClient,
  QueryClientProvider
} from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LIKED_OFFICIAL_CHARACTER_STORAGE_KEY,
  OFFICIAL_CHARACTER_PRESETS
} from '@/web/data/official-character-presets';
import { CreateCharactersPage } from '../CreateCharactersPage';

const {
  createImageCharacterMock,
  deleteImageCharacterMock,
  enqueueVisualImageTaskMock,
  getVisualImageHistoryResultMock,
  importGenerationAsReferenceMock,
  listImageCharactersMock,
  listImageReferencesMock,
  uploadImageReferenceMock
} = vi.hoisted(() => ({
  createImageCharacterMock: vi.fn(),
  deleteImageCharacterMock: vi.fn(),
  enqueueVisualImageTaskMock: vi.fn(),
  getVisualImageHistoryResultMock: vi.fn(),
  importGenerationAsReferenceMock: vi.fn(),
  listImageCharactersMock: vi.fn(),
  listImageReferencesMock: vi.fn(),
  uploadImageReferenceMock: vi.fn()
}));

vi.mock('@/services/agent-api', () => ({
  createImageCharacter: createImageCharacterMock,
  deleteImageCharacter: deleteImageCharacterMock,
  enqueueVisualImageTask: enqueueVisualImageTaskMock,
  getVisualImageHistoryResult: getVisualImageHistoryResultMock,
  importGenerationAsReference: importGenerationAsReferenceMock,
  listImageCharacters: listImageCharactersMock,
  listImageReferences: listImageReferencesMock,
  uploadImageReference: uploadImageReferenceMock
}));

vi.mock('@/services/reward-task-events', () => ({
  completeRewardTaskOnce: vi.fn(),
  REWARD_TASK_IDENTIFIERS: {
    useReferenceImage: 'use-reference-image'
  }
}));

vi.mock('../../components/image-create/CreateWorkspaceFrame', () => ({
  CreateWorkspaceFrame: ({
    children,
    className
  }: {
    children: ReactNode;
    className?: string;
  }) => <main className={className}>{children}</main>
}));

vi.mock('../../components/image-create/DeepFeaturePaywallModal', () => ({
  DeepFeaturePaywallModal: () => null
}));

vi.mock('../../components/image-create/useMembershipStatus', () => ({
  useMembershipStatus: () => ({
    loading: false,
    isMember: true
  })
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true
  })
}));

vi.mock('../../lib/seo', () => ({
  applySeo: () => () => {}
}));

function RouteStateProbe() {
  const location = useLocation();
  return (
    <output data-testid="route-state">
      {JSON.stringify(location.state || {})}
    </output>
  );
}

const testQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false }
  }
});

function renderPage() {
  return render(
    <QueryClientProvider client={testQueryClient}>
      <MemoryRouter initialEntries={['/zh-CN/create/characters']}>
        <Routes>
          <Route
            path="/zh-CN/create/characters"
            element={<CreateCharactersPage />}
          />
          <Route path="/zh-CN/image" element={<RouteStateProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function selectCharacterLibraryTab(name: RegExp) {
  const tab = screen.getByRole('tab', { name });
  fireEvent.pointerDown(tab, { button: 0, ctrlKey: false });
  fireEvent.click(tab);
}

describe('CreateCharactersPage', () => {
  beforeEach(() => {
    localStorage.clear();
    createImageCharacterMock.mockReset();
    deleteImageCharacterMock.mockReset();
    enqueueVisualImageTaskMock.mockReset();
    getVisualImageHistoryResultMock.mockReset();
    importGenerationAsReferenceMock.mockReset();
    uploadImageReferenceMock.mockReset();
    listImageReferencesMock.mockResolvedValue([]);
    getVisualImageHistoryResultMock.mockResolvedValue({
      items: [],
      total: 0
    });
    listImageCharactersMock.mockResolvedValue([
      {
        id: 'user-character-1',
        name: 'Saved Hero',
        description: 'User saved character',
        referenceImageIds: ['reference-user-1'],
        references: [
          {
            id: 'reference-user-1',
            role: 'character',
            label: 'Saved Hero',
            thumbnailUrl: '/saved-hero.webp'
          }
        ]
      }
    ]);
  });

  it('uses generated raster images for official character presets', () => {
    expect(OFFICIAL_CHARACTER_PRESETS.length).toBeGreaterThanOrEqual(18);
    expect(
      OFFICIAL_CHARACTER_PRESETS.every(
        (preset) => !String(preset.imageUrl).toLowerCase().includes('.svg')
      )
    ).toBe(true);
  });

  it('does not mount an entry paywall before the user chooses a gated action', async () => {
    renderPage();

    expect(await screen.findByText('Soft Elf Girl')).toBeInTheDocument();
    expect(
      document.querySelector('.deep-feature-paywall-backdrop')
    ).toBeNull();
  });

  it('scopes Discover, My, and Liked to official, user, and liked official characters', async () => {
    localStorage.setItem(
      LIKED_OFFICIAL_CHARACTER_STORAGE_KEY,
      JSON.stringify(['retro-cafe-server'])
    );

    renderPage();

    expect(await screen.findByText('Soft Elf Girl')).toBeInTheDocument();
    await waitFor(() => expect(listImageCharactersMock).toHaveBeenCalled());
    expect(screen.queryByText('Saved Hero')).not.toBeInTheDocument();

    selectCharacterLibraryTab(/我的角色/);
    expect(await screen.findByText('Saved Hero')).toBeInTheDocument();
    expect(screen.queryByText('Soft Elf Girl')).not.toBeInTheDocument();

    selectCharacterLibraryTab(/喜欢/);
    expect(await screen.findByText('Retro Cafe Server')).toBeInTheDocument();
    expect(screen.queryByText('Soft Elf Girl')).not.toBeInTheDocument();
    expect(screen.queryByText('Saved Hero')).not.toBeInTheDocument();
  });

  it('shows full official preset detail and sends only the prompt to image creation', async () => {
    renderPage();

    fireEvent.click(
      await screen.findByLabelText('查看 Soft Elf Girl 的角色提示词')
    );

    expect(
      screen.getByText('柔和精灵少女，适合幻想人像、角色设定和系列封面。')
    ).toBeInTheDocument();
    expect(
      screen.getByText(/柔和精灵少女角色设定，浅金色长发/)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /用于图像创作/ }));

    const state = JSON.parse(
      screen.getByTestId('route-state').textContent || '{}'
    );
    expect(state).toEqual({
      promptCasePrompt: expect.stringContaining('柔和精灵少女角色设定'),
      promptCaseTitle: 'Soft Elf Girl'
    });
    expect(createImageCharacterMock).not.toHaveBeenCalled();
  });

  it('requires a generated preview reference before saving a prompt-created character', async () => {
    enqueueVisualImageTaskMock.mockResolvedValue({
      taskId: 'task-character-preview-1'
    });
    getVisualImageHistoryResultMock.mockResolvedValue({
      total: 1,
      items: [
        {
          id: 'generation-preview-1',
          imageUrl: '/preview.png',
          previewUrl: '/preview.png',
          thumbnailUrl: '/preview.png',
          prompt: 'Generated character preview',
          model: 'gpt-image-2',
          modelLabel: 'GPT Image 2',
          provider: 'tuzi',
          createdAt: '2026-06-18T10:00:00.000Z'
        }
      ]
    });
    importGenerationAsReferenceMock.mockResolvedValue({
      id: 'reference-preview-1',
      role: 'character',
      label: 'Prompt Hero',
      thumbnailUrl: '/preview.png'
    });
    createImageCharacterMock.mockResolvedValue({
      id: 'character-created-1',
      name: 'Prompt Hero',
      description: 'silver-haired sci-fi courier',
      referenceImageIds: ['reference-preview-1'],
      references: [
        {
          id: 'reference-preview-1',
          role: 'character',
          label: 'Prompt Hero',
          thumbnailUrl: '/preview.png'
        }
      ]
    });

    renderPage();

    fireEvent.click(
      (await screen.findAllByRole('radio', { name: /从文字设定创建角色/ }))[0]
    );
    fireEvent.change(screen.getByPlaceholderText('例如：Cyber Courier'), {
      target: { value: 'Prompt Hero' }
    });
    fireEvent.change(
      screen.getByPlaceholderText('描述外貌、发型、服装、气质、色彩和稳定特征。'),
      {
        target: { value: 'silver-haired sci-fi courier' }
      }
    );

    fireEvent.click(screen.getByRole('button', { name: /保存角色/ }));
    expect(
      await screen.findByText('请先生成或选择 1 张角色预览图，再保存为角色卡。')
    ).toBeInTheDocument();
    expect(createImageCharacterMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /生成角色预览/ }));
    await waitFor(() =>
      expect(enqueueVisualImageTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-image-2',
          aspectRatio: '1:1',
          sourceApp: 'create-characters',
          appOperation: 'character_prompt_preview',
          prompt: expect.stringContaining('silver-haired sci-fi courier')
        })
      )
    );

    fireEvent.click(screen.getByRole('button', { name: /生成历史/ }));
    fireEvent.click(await screen.findByRole('button', { name: /GPT Image 2/ }));
    await waitFor(() =>
      expect(importGenerationAsReferenceMock).toHaveBeenCalledWith(
        expect.objectContaining({
          generationId: 'generation-preview-1',
          role: 'character',
          label: 'Prompt Hero'
        })
      )
    );

    fireEvent.click(screen.getByRole('button', { name: /保存角色/ }));
    await waitFor(() =>
      expect(createImageCharacterMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Prompt Hero',
          description: 'silver-haired sci-fi courier',
          referenceImageIds: ['reference-preview-1']
        })
      )
    );
  });
});
