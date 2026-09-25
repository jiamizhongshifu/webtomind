import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultImagePromptSettings } from '../../../data/image-prompt-core';
import { useImageGeneration } from '../useImageGeneration';

const agentApiMocks = vi.hoisted(() => ({
  cancelVisualImageTask: vi.fn(),
  deleteFailedVisualImageTask: vi.fn(),
  deleteVisualImageHistoryItem: vi.fn(),
  enqueueVisualImageTask: vi.fn(),
  generateVisualImage: vi.fn(),
  getVisualImageHistoryResult: vi.fn(),
  getVisualImageTaskSnapshot: vi.fn(),
  retryVisualImageTask: vi.fn(),
  waitForVisualImageTask: vi.fn()
}));
const translateMock = vi.hoisted(
  () => (key: string, options?: { defaultValue?: string }) =>
    options?.defaultValue || key
);

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: translateMock
  })
}));

vi.mock('@/services/agent-api', () => {
  class VisualImageGenerationError extends Error {
    status?: number;
    errorDetails?: Record<string, unknown>;

    constructor(message: string, options: Record<string, unknown> = {}) {
      super(message);
      Object.assign(this, options);
    }
  }

  return {
    ...agentApiMocks,
    VisualImageGenerationError
  };
});

vi.mock('../../../lib/analytics', () => ({
  trackImageGenerationEvent: vi.fn()
}));

vi.mock('../generationCompleteSound', () => ({
  playGenerationCompleteSound: vi.fn(),
  playGenerationFailedSound: vi.fn(),
  primeGenerationCompleteSound: vi.fn()
}));

describe('useImageGeneration', () => {
  beforeEach(() => {
    localStorage.clear();
    agentApiMocks.enqueueVisualImageTask.mockResolvedValue({
      taskId: 'task-override'
    });
    agentApiMocks.getVisualImageHistoryResult.mockResolvedValue({
      items: [],
      total: 0
    });
    agentApiMocks.getVisualImageTaskSnapshot.mockResolvedValue({
      tasks: []
    });
    const generationResult = {
      generationId: 'generation-1',
      imageUrl: 'https://example.com/generated.png',
      images: [
        {
          generationId: 'generation-1',
          imageUrl: 'https://example.com/generated.png'
        }
      ],
      model: 'gpt-image-2',
      provider: 'test',
      aspectRatio: '9:16',
      imageSize: '1152x2048',
      quality: 'high',
      outputFormat: 'png'
    };
    agentApiMocks.waitForVisualImageTask.mockResolvedValue(generationResult);
    agentApiMocks.generateVisualImage.mockResolvedValue(generationResult);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('publishes an optimistic queued task before the enqueue API resolves', async () => {
    let resolveEnqueue: ((value: { taskId: string }) => void) | undefined;
    agentApiMocks.enqueueVisualImageTask.mockReturnValue(
      new Promise((resolve) => {
        resolveEnqueue = resolve;
      })
    );
    const { result, unmount } = renderHook(() =>
      useImageGeneration({
        isAuthenticated: true,
        onRequireLogin: vi.fn(),
        settings: defaultImagePromptSettings,
        promptMode: 'custom',
        customPromptText: 'instant skeleton prompt',
        customNegativePromptText: '',
        selectedReferenceIds: [],
        compiled: {
          prompt: 'instant skeleton prompt',
          negativePrompt: '',
          selectedAssets: [],
          warnings: []
        },
        setError: vi.fn(),
        setStatusText: vi.fn()
      })
    );

    act(() => {
      void result.current.handleGenerate();
    });

    await waitFor(() => {
      expect(result.current.generationQueue[0]).toEqual(
        expect.objectContaining({
          status: 'queued',
          clientSubmissionPending: true
        })
      );
    });
    expect(agentApiMocks.waitForVisualImageTask).not.toHaveBeenCalled();

    act(() => {
      resolveEnqueue?.({ taskId: 'server-task-1' });
    });
    await waitFor(() => {
      expect(result.current.generationQueue[0]).toEqual(
        expect.objectContaining({
          serverTaskId: 'server-task-1',
          clientSubmissionPending: false
        })
      );
    });
    unmount();
  });

  it('keeps a completed server task until task polling persists it into the session', async () => {
    let resolveTask:
      | ((value: {
          generationId: string;
          imageUrl: string;
          images: Array<{ generationId: string; imageUrl: string }>;
          model: string;
          provider: string;
          aspectRatio: string;
          imageSize: string;
          quality: string;
          outputFormat: string;
        }) => void)
      | undefined;
    agentApiMocks.waitForVisualImageTask.mockReturnValue(
      new Promise((resolve) => {
        resolveTask = resolve;
      })
    );
    const onGenerationSuccess = vi.fn();
    const onRequireLogin = vi.fn();
    const setError = vi.fn();
    const setStatusText = vi.fn();
    const compiled = {
      prompt: 'second session image',
      negativePrompt: '',
      selectedAssets: [],
      warnings: []
    };
    const selectedReferenceIds: string[] = [];
    const { result, unmount } = renderHook(() =>
      useImageGeneration({
        isAuthenticated: true,
        onRequireLogin,
        settings: defaultImagePromptSettings,
        promptMode: 'custom',
        customPromptText: 'second session image',
        customNegativePromptText: '',
        selectedReferenceIds,
        compiled,
        setError,
        setStatusText,
        onGenerationSuccess
      })
    );

    await act(async () => {
      await result.current.handleGenerate();
    });
    await waitFor(() =>
      expect(agentApiMocks.waitForVisualImageTask).toHaveBeenCalledWith(
        'task-override'
      )
    );

    // The active-only snapshot no longer contains a task immediately after
    // completion. It must not delete the local item before its task-id poll
    // delivers the terminal payload.
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
    });
    expect(result.current.generationQueue[0]).toEqual(
      expect.objectContaining({
        serverTaskId: 'task-override',
        status: 'running'
      })
    );

    act(() => {
      resolveTask?.({
        generationId: 'generation-second',
        imageUrl: 'https://example.com/second.png',
        images: [
          {
            generationId: 'generation-second',
            imageUrl: 'https://example.com/second.png'
          }
        ],
        model: 'gpt-image-2',
        provider: 'test',
        aspectRatio: '1:1',
        imageSize: '1024x1024',
        quality: 'auto',
        outputFormat: 'png'
      });
    });

    await waitFor(() => expect(onGenerationSuccess).toHaveBeenCalledTimes(1));
    expect(result.current.generationQueue[0]).toEqual(
      expect.objectContaining({
        status: 'succeeded',
        imageUrl: 'https://example.com/second.png'
      })
    );
    unmount();
  });

  it('uses prompt overrides for the queued generation request', async () => {
    const setError = vi.fn();
    const setStatusText = vi.fn();
    const onRequireLogin = vi.fn();

    const { result, unmount } = renderHook(() =>
      useImageGeneration({
        isAuthenticated: true,
        onRequireLogin,
        settings: {
          ...defaultImagePromptSettings,
          model: 'gpt-image-2',
          aspectRatio: '9:16',
          imageSize: '1152x2048',
          quality: 'high',
          outputFormat: 'png',
          imageCount: 2
        },
        promptMode: 'custom',
        customPromptText: 'original prompt',
        customNegativePromptText: 'original negative prompt',
        selectedReferenceIds: ['reference-1', 'reference-2'],
        selectedCharacterCardIds: ['character-card-1'],
        characterReferenceGroups: [
          {
            characterCardId: 'character-card-1',
            referenceImageIds: ['reference-1'],
            label: 'Official preset'
          }
        ],
        compiled: {
          prompt: 'compiled prompt',
          negativePrompt: 'compiled negative prompt',
          selectedAssets: [],
          warnings: []
        },
        recipeAssetIds: ['character-refined-model'],
        setError,
        setStatusText
      })
    );

    void result.current.handleGenerate({
      promptOverride: '  optimized prompt  ',
      negativePromptOverride: '  optimized negative prompt  '
    });

    await waitFor(() =>
      expect(agentApiMocks.enqueueVisualImageTask).toHaveBeenCalledTimes(1)
    );

    expect(agentApiMocks.enqueueVisualImageTask).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'optimized prompt',
        negativePrompt: 'optimized negative prompt',
        model: 'gpt-image-2',
        aspectRatio: '9:16',
        imageSize: '1152x2048',
        quality: 'high',
        outputFormat: 'png',
        imageCount: 2,
        assetIds: ['character-refined-model'],
        promptMode: 'custom',
        referenceImageIds: ['reference-1', 'reference-2'],
        referenceMode: 'character_consistency',
        characterCardIds: ['character-card-1'],
        characterReferenceGroups: [
          {
            characterCardId: 'character-card-1',
            referenceImageIds: ['reference-1'],
            label: 'Official preset'
          }
        ]
      })
    );
    expect(onRequireLogin).not.toHaveBeenCalled();
    expect(setError).toHaveBeenCalledWith('');
    unmount();
  });

  it('does not submit compiled negative prompts unless the user entered one', async () => {
    const setError = vi.fn();
    const setStatusText = vi.fn();
    const onRequireLogin = vi.fn();

    const { result, unmount } = renderHook(() =>
      useImageGeneration({
        isAuthenticated: true,
        onRequireLogin,
        settings: {
          ...defaultImagePromptSettings,
          model: 'gpt-image-2',
          aspectRatio: '9:16',
          imageSize: '1152x2048',
          quality: 'high',
          outputFormat: 'png',
          imageCount: 1
        },
        promptMode: 'composed',
        customPromptText: '',
        customNegativePromptText: '',
        selectedReferenceIds: [],
        selectedCharacterCardIds: [],
        characterReferenceGroups: [],
        compiled: {
          prompt: 'compiled prompt',
          negativePrompt: 'compiled fallback negative prompt',
          selectedAssets: [],
          warnings: []
        },
        setError,
        setStatusText
      })
    );

    void result.current.handleGenerate();

    await waitFor(() =>
      expect(agentApiMocks.enqueueVisualImageTask).toHaveBeenCalledTimes(1)
    );

    expect(agentApiMocks.enqueueVisualImageTask).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'compiled prompt',
        negativePrompt: undefined,
        promptMode: 'composed'
      })
    );
    expect(onRequireLogin).not.toHaveBeenCalled();

    unmount();
  });

  it('ignores stale negative prompt state in composed mode', async () => {
    const setError = vi.fn();
    const setStatusText = vi.fn();
    const onRequireLogin = vi.fn();

    const { result, unmount } = renderHook(() =>
      useImageGeneration({
        isAuthenticated: true,
        onRequireLogin,
        settings: {
          ...defaultImagePromptSettings,
          model: 'gpt-image-2',
          aspectRatio: '9:16',
          imageSize: '1152x2048',
          quality: 'high',
          outputFormat: 'png',
          imageCount: 1
        },
        promptMode: 'composed',
        customPromptText: '',
        customNegativePromptText: '  user negative prompt  ',
        selectedReferenceIds: [],
        selectedCharacterCardIds: [],
        characterReferenceGroups: [],
        compiled: {
          prompt: 'compiled prompt',
          negativePrompt: 'compiled fallback negative prompt',
          selectedAssets: [],
          warnings: []
        },
        setError,
        setStatusText
      })
    );

    void result.current.handleGenerate();

    await waitFor(() =>
      expect(agentApiMocks.enqueueVisualImageTask).toHaveBeenCalledTimes(1)
    );

    expect(agentApiMocks.enqueueVisualImageTask).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'compiled prompt',
        negativePrompt: undefined,
        promptMode: 'composed'
      })
    );

    unmount();
  });

  it('lets an empty negative prompt override suppress stale editor state', async () => {
    const setError = vi.fn();
    const setStatusText = vi.fn();
    const onRequireLogin = vi.fn();

    const { result, unmount } = renderHook(() =>
      useImageGeneration({
        isAuthenticated: true,
        onRequireLogin,
        settings: {
          ...defaultImagePromptSettings,
          model: 'gpt-image-2',
          aspectRatio: '9:16',
          imageSize: '1152x2048',
          quality: 'high',
          outputFormat: 'png',
          imageCount: 1
        },
        promptMode: 'custom',
        customPromptText: 'custom prompt',
        customNegativePromptText: 'stale imported negative prompt',
        selectedReferenceIds: [],
        selectedCharacterCardIds: [],
        characterReferenceGroups: [],
        compiled: {
          prompt: 'compiled prompt',
          negativePrompt: 'compiled fallback negative prompt',
          selectedAssets: [],
          warnings: []
        },
        setError,
        setStatusText
      })
    );

    void result.current.handleGenerate({
      negativePromptOverride: ''
    });

    await waitFor(() =>
      expect(agentApiMocks.enqueueVisualImageTask).toHaveBeenCalledTimes(1)
    );

    expect(agentApiMocks.enqueueVisualImageTask).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'custom prompt',
        negativePrompt: undefined,
        promptMode: 'custom'
      })
    );

    unmount();
  });

  it('restores active work without announcing cross-device task sync', async () => {
    const setError = vi.fn();
    const setStatusText = vi.fn();
    let resolveRestoredTask:
      | ((value: {
          generationId: string;
          imageUrl: string;
          images: Array<{ generationId: string; imageUrl: string }>;
          model: string;
          provider: string;
          aspectRatio: string;
          imageSize: string;
          quality: string;
          outputFormat: string;
        }) => void)
      | undefined;
    agentApiMocks.waitForVisualImageTask.mockReturnValue(
      new Promise((resolve) => {
        resolveRestoredTask = resolve;
      })
    );
    const request = {
      prompt: 'restored prompt',
      model: 'gpt-image-2',
      aspectRatio: '1:1',
      imageSize: '1024x1024',
      quality: 'auto',
      outputFormat: 'png',
      imageCount: 1,
      assetIds: [],
      promptMode: 'custom' as const,
      referenceImageIds: [],
      referenceMode: 'none' as const,
      characterCardIds: [],
      characterReferenceGroups: []
    };
    agentApiMocks.getVisualImageTaskSnapshot.mockResolvedValue({
      tasks: [
        {
          taskId: 'restored-task',
          status: 'running',
          request,
          createdAt: '2026-07-14T01:00:00.000Z',
          startedAt: '2026-07-14T01:00:01.000Z'
        }
      ]
    });
    const { result, unmount } = renderHook(() =>
      useImageGeneration({
        isAuthenticated: true,
        onRequireLogin: vi.fn(),
        settings: defaultImagePromptSettings,
        promptMode: 'custom',
        customPromptText: 'restored prompt',
        customNegativePromptText: '',
        selectedReferenceIds: [],
        compiled: {
          prompt: 'restored prompt',
          negativePrompt: '',
          selectedAssets: [],
          warnings: []
        },
        setError,
        setStatusText
      })
    );

    await waitFor(() =>
      expect(result.current.generationQueue[0]).toEqual(
        expect.objectContaining({ serverTaskId: 'restored-task' })
      )
    );
    expect(setStatusText).not.toHaveBeenCalled();

    act(() => {
      resolveRestoredTask?.({
        generationId: 'restored-generation',
        imageUrl: 'https://example.com/restored.png',
        images: [
          {
            generationId: 'restored-generation',
            imageUrl: 'https://example.com/restored.png'
          }
        ],
        model: 'gpt-image-2',
        provider: 'test',
        aspectRatio: '1:1',
        imageSize: '1024x1024',
        quality: 'auto',
        outputFormat: 'png'
      });
    });
    await waitFor(() =>
      expect(result.current.generationQueue[0]).toEqual(
        expect.objectContaining({ status: 'succeeded' })
      )
    );

    unmount();
  });
});
