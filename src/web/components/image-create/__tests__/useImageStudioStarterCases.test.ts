import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PromptCase } from '@/services/agent-api';
import {
  defaultImagePromptSelection,
  setImagePromptAssetSelection,
  type ImagePromptAsset
} from '@/web/data/image-prompt-core';
import {
  buildImageStudioStarterCaseCommit,
  mapPromptCaseToImageStudioStarterCase,
  sampleImageStudioStarterCases,
  useImageStudioStarterCases
} from '../useImageStudioStarterCases';

const starterRecipeAsset: ImagePromptAsset = {
  id: 'starter-style',
  slot: 'style',
  title: 'Starter style',
  subtitle: 'Starter style subtitle',
  prompt: 'starter style prompt',
  tags: ['starter'],
  visual: { tone: '#ddd', accent: '#222', shape: 'style' }
};

const { getPublicPromptCaseMock, getPublicPromptCasesMock } = vi.hoisted(
  () => ({
    getPublicPromptCaseMock: vi.fn(),
    getPublicPromptCasesMock: vi.fn()
  })
);

vi.mock('@/services/agent-api', () => ({
  getPublicPromptCase: getPublicPromptCaseMock,
  getPublicPromptCases: getPublicPromptCasesMock
}));

beforeEach(() => {
  getPublicPromptCaseMock.mockReset();
  getPublicPromptCasesMock.mockReset();
  vi.restoreAllMocks();
});

describe('mapPromptCaseToImageStudioStarterCase', () => {
  it('maps a collected prompt case cover and localized prompt into a starter card', () => {
    const result = mapPromptCaseToImageStudioStarterCase(
      {
        id: 'case-one',
        imageUrl: '/collected-case.webp',
        imageUrls: ['/collected-case.webp', '/case-detail.webp'],
        title: 'Fallback title',
        titleZh: '户外梦感',
        category: 'portrait',
        model: 'GPT Image 2',
        prompt: 'fallback prompt',
        promptZh: '收录案例的完整中文提示词'
      } satisfies PromptCase,
      'zh-CN',
      0
    );

    expect(result).toMatchObject({
      id: 'prompt-case-case-one',
      sourceCaseId: 'case-one',
      title: '户外梦感',
      prompt: '收录案例的完整中文提示词',
      imageUrls: ['/collected-case.webp', '/case-detail.webp']
    });
  });

  it('drops cases without an image or usable prompt', () => {
    expect(
      mapPromptCaseToImageStudioStarterCase(
        {
          id: 'empty-case',
          imageUrl: '',
          prompt: ''
        },
        'zh-CN',
        0
      )
    ).toBeNull();
  });

  it('never promotes a truncated preview into a generation prompt', () => {
    expect(
      mapPromptCaseToImageStudioStarterCase(
        {
          id: 'preview-only-case',
          imageUrl: '/preview.webp',
          prompt: '',
          promptPreview: '被截断的展示摘要…'
        },
        'zh-CN',
        0
      )
    ).toBeNull();
  });
});

describe('buildImageStudioStarterCaseCommit', () => {
  it('commits the canonical prompt without enabling or carrying visual recipe selections', () => {
    const caseItem = {
      id: 'starter-case',
      sourceCaseId: 'public-starter-case',
      title: '完整案例',
      subtitle: 'portrait',
      prompt: '服务端返回的完整提示词。',
      selection: setImagePromptAssetSelection(
        defaultImagePromptSelection,
        starterRecipeAsset
      ),
      imageUrls: ['/starter.webp']
    };

    const commit = buildImageStudioStarterCaseCommit(caseItem, 'recipe');

    expect(commit.prompt).toBe(caseItem.prompt);
    expect(commit.conditioningMode).toBe('none');
    expect(commit.selection).toEqual(defaultImagePromptSelection);
    expect(commit.selection).not.toEqual(caseItem.selection);
  });

  it('preserves an explicitly selected moodboard while replacing the prompt', () => {
    const commit = buildImageStudioStarterCaseCommit(
      {
        id: 'moodboard-starter',
        sourceCaseId: 'public-moodboard-starter',
        title: '情绪板案例',
        subtitle: 'portrait',
        prompt: '完整提示词',
        selection: defaultImagePromptSelection,
        imageUrls: ['/moodboard.webp']
      },
      'moodboard'
    );

    expect(commit.conditioningMode).toBe('moodboard');
  });
});

describe('sampleImageStudioStarterCases', () => {
  it('draws four unique cases from the full candidate pool', () => {
    const candidates = ['a', 'b', 'c', 'd', 'e', 'f'];

    const result = sampleImageStudioStarterCases(candidates, 4, () => 0);

    expect(result).toEqual(['b', 'c', 'd', 'e']);
    expect(new Set(result)).toHaveLength(4);
    expect(candidates).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('returns every available case when the pool has fewer than four', () => {
    expect(sampleImageStudioStarterCases(['a', 'b'], 4, () => 0)).toEqual([
      'b',
      'a'
    ]);
  });
});

describe('useImageStudioStarterCases', () => {
  it('keeps one draw stable until a new session changes the refresh key', async () => {
    const candidates: PromptCase[] = ['a', 'b', 'c', 'd', 'e', 'f'].map(
      (id) => ({
        id,
        imageUrl: `/${id}.webp`,
        prompt: `prompt ${id}`,
        title: id
      })
    );
    getPublicPromptCasesMock.mockResolvedValue(candidates);
    getPublicPromptCaseMock.mockImplementation(async (id: string) =>
      candidates.find((item) => item.id === id)
    );
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);

    const { result, rerender } = renderHook(
      ({ refreshKey }: { refreshKey: string }) =>
        useImageStudioStarterCases({
          enabled: true,
          locale: 'zh-CN',
          refreshKey
        }),
      { initialProps: { refreshKey: 'session-one' } }
    );

    await waitFor(() =>
      expect(result.current.cases.map((item) => item.title)).toEqual([
        'b',
        'c',
        'd',
        'e'
      ])
    );

    rerender({ refreshKey: 'session-one' });
    expect(getPublicPromptCasesMock).toHaveBeenCalledTimes(1);
    expect(result.current.cases.map((item) => item.title)).toEqual([
      'b',
      'c',
      'd',
      'e'
    ]);

    random.mockReturnValue(1);
    rerender({ refreshKey: 'session-two' });
    await waitFor(() =>
      expect(result.current.cases.map((item) => item.title)).toEqual([
        'a',
        'b',
        'c',
        'd'
      ])
    );
    expect(getPublicPromptCasesMock).toHaveBeenCalledTimes(2);
    expect(getPublicPromptCaseMock).toHaveBeenCalledWith('b', {
      locale: 'zh-CN',
      includePrompt: true
    });
  });

  it('hydrates sampled cards from the canonical single-case prompt', async () => {
    getPublicPromptCasesMock.mockResolvedValue([
      {
        id: 'case-one',
        imageUrl: '/case-one.webp',
        title: '案例一',
        prompt: '',
        promptPreview: '展示摘要…',
        promptLocked: true
      }
    ]);
    getPublicPromptCaseMock.mockResolvedValue({
      id: 'case-one',
      imageUrl: '/case-one.webp',
      title: '案例一',
      prompt: '完整的案例提示词，不能带省略号。',
      promptZh: '完整的案例提示词，不能带省略号。',
      promptPreview: '展示摘要…',
      promptLocked: false
    });

    const { result } = renderHook(() =>
      useImageStudioStarterCases({
        enabled: true,
        locale: 'zh-CN',
        refreshKey: 'full-prompt'
      })
    );

    await waitFor(() =>
      expect(result.current.cases[0]?.prompt).toBe(
        '完整的案例提示词，不能带省略号。'
      )
    );
    expect(getPublicPromptCaseMock).toHaveBeenCalledWith('case-one', {
      locale: 'zh-CN',
      includePrompt: true
    });
  });

  it('does not select member-only previews that cannot expose full prompts', async () => {
    getPublicPromptCasesMock.mockResolvedValue([
      {
        id: 'locked-case',
        imageUrl: '/locked.webp',
        prompt: '',
        promptPreview: '会员摘要…',
        memberOnly: true
      },
      {
        id: 'public-case',
        imageUrl: '/public.webp',
        prompt: '',
        promptPreview: '公开摘要…',
        memberOnly: false
      }
    ]);
    getPublicPromptCaseMock.mockResolvedValue({
      id: 'public-case',
      imageUrl: '/public.webp',
      prompt: '公开案例的完整提示词',
      memberOnly: false
    });

    const { result } = renderHook(() =>
      useImageStudioStarterCases({
        enabled: true,
        locale: 'zh-CN',
        refreshKey: 'public-only'
      })
    );

    await waitFor(() =>
      expect(result.current.cases[0]?.sourceCaseId).toBe('public-case')
    );
    expect(getPublicPromptCaseMock).not.toHaveBeenCalledWith(
      'locked-case',
      expect.anything()
    );
  });
});
