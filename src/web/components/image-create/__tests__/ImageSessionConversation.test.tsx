import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type {
  VisualImageHistoryItem,
  VisualVideoGenerationItem
} from '@/services/agent-api';
import type { ImageCreationTurn } from '@/shared/create-workspace-v2';
import { ImageSessionConversation } from '../ImageSessionConversation';

vi.mock('border-beam', () => ({
  BorderBeam: ({ children }: { children: ReactNode }) => <div>{children}</div>
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'zh-CN' },
    t: (key: string) => {
      const messages: Record<string, string> = {
        'historyRail.status.running': '生成中',
        'historyRail.status.queued': '排队中',
        'progress.thinking': 'Thinking...',
        'progress.viewTaskPrompt': '查看任务 Prompt',
        'progress.editTask': '编辑任务 Prompt',
        'progress.cancelRunning': '中止正在进行的任务',
        'progress.cancelQueued': '取消排队任务',
        'progress.empty': '暂无进行中的任务'
      };
      return messages[key] || key;
    }
  })
}));

const noop = vi.fn();

describe('ImageSessionConversation', () => {
  it('renders ratio-matched image skeletons beside the task prompt', () => {
    render(
      <ImageSessionConversation
        turns={[]}
        progressTasks={[
          {
            key: 'task-1',
            sessionId: 'session-1',
            prompt: 'A horse standing in quiet morning light',
            modelLabel: 'GPT Image 2',
            aspectRatio: '9:16',
            imageCount: 2,
            label: '正在生成图片',
            status: 'running',
            detail: '已等待 28 秒，模型正在接收任务',
            onEdit: noop,
            onCancel: noop
          }
        ]}
        historyById={{}}
        missingIds={[]}
        onPreview={noop}
        onDownload={noop}
        onRegenerate={noop}
        onFavorite={noop}
        onDelete={noop}
        onCopyPrompt={noop}
      />
    );

    expect(
      screen.getByText('A horse standing in quiet morning light')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '复制本次生成提示词' })
    ).toHaveClass('image-session-prompt-scroll');
    const taskModel = screen.getByText('GPT Image 2');
    expect(taskModel).toBeInTheDocument();
    expect(taskModel).toHaveClass('image-session-prompt-model');
    expect(taskModel.closest('.image-session-prompt-footer')).not.toBeNull();
    expect(taskModel.closest('.image-session-prompt-copy-shell')).toBeNull();
    expect(screen.getByText('正在生成图片')).toBeInTheDocument();
    const skeletons = document.querySelectorAll(
      '.image-session-image-skeleton'
    );
    expect(skeletons).toHaveLength(2);
    expect(skeletons[0]).toHaveStyle({ aspectRatio: '9 / 16' });
    expect(
      screen.getByRole('button', { name: '查看任务提示词' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '取消生成任务' })
    ).toBeInTheDocument();
  });

  it('does not render an empty conversation shell without turns or tasks', () => {
    const { container } = render(
      <ImageSessionConversation
        turns={[]}
        historyById={{}}
        missingIds={[]}
        onPreview={noop}
        onDownload={noop}
        onRegenerate={noop}
        onFavorite={noop}
        onDelete={noop}
        onCopyPrompt={noop}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders a recovered failed task instead of an empty first-run state', () => {
    const failedTurn: ImageCreationTurn = {
      id: 'task-timeout-1',
      sessionId: 'session-1',
      prompt: 'A future mecha cockpit portrait',
      status: 'failed',
      context: {
        sessionId: 'session-1',
        taskId: 'task-timeout-1',
        referenceAssetIds: []
      },
      generationIds: [],
      errorMessage: '生成超时（接近函数上限），已触发退款',
      createdAt: '2026-07-24T08:50:34.000Z',
      updatedAt: '2026-07-24T08:55:07.000Z'
    };

    render(
      <ImageSessionConversation
        turns={[failedTurn]}
        historyById={{}}
        missingIds={[]}
        onPreview={noop}
        onDownload={noop}
        onRegenerate={noop}
        onCopyPrompt={noop}
      />
    );

    expect(screen.getByText('生成失败')).toBeInTheDocument();
    expect(screen.getByText('本次生成失败，未产生图片')).toBeInTheDocument();
    expect(screen.getByText(failedTurn.errorMessage || '')).toBeInTheDocument();
  });

  it('offers a retry action for a failed turn and re-initiates generation', () => {
    const failedTurn: ImageCreationTurn = {
      id: 'task-blocked-1',
      sessionId: 'session-1',
      prompt: 'A fashion editorial portrait',
      status: 'failed',
      context: {
        sessionId: 'session-1',
        taskId: 'task-blocked-1',
        referenceAssetIds: ['asset-1']
      },
      generationIds: [],
      errorMessage: '图片生成被安全系统拦截',
      createdAt: '2026-07-24T08:50:34.000Z',
      updatedAt: '2026-07-24T08:55:07.000Z'
    };
    const onRetryTurn = vi.fn();

    render(
      <ImageSessionConversation
        turns={[failedTurn]}
        historyById={{}}
        missingIds={[]}
        onPreview={noop}
        onDownload={noop}
        onRegenerate={noop}
        onRetryTurn={onRetryTurn}
        onCopyPrompt={noop}
      />
    );

    const retryButton = screen.getByRole('button', { name: '重试生成' });
    expect(retryButton).toBeInTheDocument();
    fireEvent.click(retryButton);
    expect(onRetryTurn).toHaveBeenCalledTimes(1);
    expect(onRetryTurn).toHaveBeenCalledWith(failedTurn);
  });

  it('does not offer a retry action when no retry handler is wired', () => {
    const failedTurn: ImageCreationTurn = {
      id: 'task-no-retry-1',
      sessionId: 'session-1',
      prompt: 'A failed portrait',
      status: 'failed',
      context: {
        sessionId: 'session-1',
        taskId: 'task-no-retry-1',
        referenceAssetIds: []
      },
      generationIds: [],
      errorMessage: 'provider timeout',
      createdAt: '2026-07-24T08:50:34.000Z',
      updatedAt: '2026-07-24T08:55:07.000Z'
    };

    render(
      <ImageSessionConversation
        turns={[failedTurn]}
        historyById={{}}
        missingIds={[]}
        onPreview={noop}
        onDownload={noop}
        onRegenerate={noop}
        onCopyPrompt={noop}
      />
    );

    expect(
      screen.queryByRole('button', { name: '重试生成' })
    ).not.toBeInTheDocument();
  });

  it('reuses the same prompt-and-image layout after the result arrives', () => {
    const turn: ImageCreationTurn = {
      id: 'turn-1',
      sessionId: 'session-1',
      prompt: 'A finished horse portrait',
      status: 'succeeded',
      context: { sessionId: 'session-1', referenceAssetIds: [] },
      generationIds: ['generation-1'],
      createdAt: '2026-07-17T10:00:00.000Z',
      updatedAt: '2026-07-17T10:01:00.000Z'
    };
    const image: VisualImageHistoryItem = {
      id: 'generation-1',
      imageUrl: '/generated-horse-original.png',
      thumbnailUrl: '/generated-horse-thumbnail.webp',
      previewUrl: '/generated-horse-preview.webp',
      width: 1080,
      height: 1920,
      prompt: turn.prompt,
      provider: 'openai',
      model: 'gpt-image-2',
      modelLabel: 'GPT Image 2',
      assetIds: [],
      createdAt: '2026-07-17T10:01:00.000Z'
    };

    const onCopyPrompt = vi.fn();
    const onFavorite = vi.fn();
    const onDelete = vi.fn();
    const onRegenerate = vi.fn();
    const onDownload = vi.fn();
    render(
      <ImageSessionConversation
        turns={[turn]}
        historyById={{ 'generation-1': image }}
        missingIds={[]}
        onPreview={noop}
        onDownload={onDownload}
        onRegenerate={onRegenerate}
        onFavorite={onFavorite}
        onDelete={onDelete}
        onCopyPrompt={onCopyPrompt}
      />
    );

    expect(
      screen.getByRole('region', { name: '当前创作会话' })
    ).toHaveAttribute('data-media-type', 'image');
    expect(screen.getByText(turn.prompt)).toBeInTheDocument();
    const promptButton = screen.getByRole('button', {
      name: '复制本次生成提示词'
    });
    expect(promptButton).toHaveClass('image-session-prompt-scroll');
    const resultModel = screen.getByText('GPT Image 2');
    expect(promptButton.parentElement).not.toContainElement(resultModel);
    expect(resultModel.closest('.image-session-prompt-footer')).not.toBeNull();
    fireEvent.click(promptButton);
    expect(onCopyPrompt).toHaveBeenCalledWith(turn.prompt);
    expect(screen.queryByText('复用参数')).not.toBeInTheDocument();
    const result = document.querySelector('.image-session-result-grid figure');
    expect(result).toHaveStyle({ aspectRatio: '1080 / 1920' });
    expect(result?.querySelector('figcaption')).toBeNull();
    expect(
      document.querySelectorAll('.image-session-image-skeleton')
    ).toHaveLength(0);
    expect(screen.getByAltText(turn.prompt)).toHaveAttribute(
      'src',
      '/generated-horse-preview.webp'
    );

    fireEvent.click(screen.getByRole('button', { name: '加入收藏' }));
    expect(onFavorite).toHaveBeenCalledWith(image);

    fireEvent.click(screen.getByRole('button', { name: '更多图片操作' }));
    expect(screen.getByRole('menu', { name: '图片操作' })).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: '预览大图' })
    ).toBeInTheDocument();

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('menuitem', { name: '删除' }));
    expect(confirm).toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalledWith(image);
    confirm.mockRestore();

    fireEvent.click(screen.getByRole('button', { name: '再次生成' }));
    expect(onRegenerate).toHaveBeenCalledWith(image);
    fireEvent.click(screen.getByRole('button', { name: '下载' }));
    expect(onDownload).toHaveBeenCalledWith(image);
  });

  it('turns the first successful result into an inline next-step milestone', () => {
    const turn: ImageCreationTurn = {
      id: 'turn-first-success',
      sessionId: 'session-first-success',
      prompt: 'A useful commercial product visual',
      status: 'succeeded',
      context: {
        sessionId: 'session-first-success',
        referenceAssetIds: []
      },
      generationIds: ['generation-first-success'],
      createdAt: '2026-08-07T10:00:00.000Z',
      updatedAt: '2026-08-07T10:01:00.000Z'
    };
    const image: VisualImageHistoryItem = {
      id: 'generation-first-success',
      imageUrl: '/first-success.png',
      prompt: turn.prompt,
      provider: 'openai',
      model: 'gpt-image-2',
      assetIds: [],
      createdAt: turn.updatedAt
    };
    const onReedit = vi.fn();
    const onActivationAction = vi.fn();

    render(
      <ImageSessionConversation
        turns={[turn]}
        historyById={{ [image.id]: image }}
        missingIds={[]}
        onPreview={noop}
        onDownload={noop}
        onRegenerate={noop}
        onReedit={onReedit}
        onFavorite={noop}
        onCopyPrompt={noop}
        activationMilestone={{
          generationIds: [image.id],
          rewardStatus: 'granted'
        }}
        onActivationAction={onActivationAction}
      />
    );

    expect(
      screen.getByRole('status', { name: '首图创作完成' })
    ).toHaveTextContent('第一张商业图完成');
    expect(screen.getByText('+15 积分已到账')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '继续修改' }));
    expect(onReedit).toHaveBeenCalledWith(image);
    expect(onActivationAction).toHaveBeenCalledWith('continue_editing');
  });

  it('saves the first result to a moodboard from the milestone', () => {
    const turn: ImageCreationTurn = {
      id: 'turn-first-save',
      sessionId: 'session-first-save',
      prompt: 'A useful commercial product visual',
      status: 'succeeded',
      context: {
        sessionId: 'session-first-save',
        referenceAssetIds: []
      },
      generationIds: ['generation-first-save'],
      createdAt: '2026-08-07T10:00:00.000Z',
      updatedAt: '2026-08-07T10:01:00.000Z'
    };
    const image: VisualImageHistoryItem = {
      id: 'generation-first-save',
      imageUrl: '/first-save.png',
      prompt: turn.prompt,
      provider: 'openai',
      model: 'gpt-image-2',
      assetIds: [],
      createdAt: turn.updatedAt
    };
    const onSave = vi.fn();
    const onSelectBoard = vi.fn();

    render(
      <ImageSessionConversation
        turns={[turn]}
        historyById={{ [image.id]: image }}
        missingIds={[]}
        onPreview={noop}
        onDownload={noop}
        onRegenerate={noop}
        onReedit={noop}
        onFavorite={noop}
        onCopyPrompt={noop}
        activationMilestone={{
          generationIds: [image.id],
          rewardStatus: 'granted'
        }}
        moodboardSave={{
          boards: [],
          selectedBoardId: '',
          prefix: '/zh-CN',
          isEnglish: false,
          saved: false,
          saving: false,
          onSelectBoard,
          onSave
        }}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: '保存到选择情绪板' })
    );
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('exposes the same favorite action for a generated video', () => {
    const turn: ImageCreationTurn = {
      id: 'turn-video-1',
      sessionId: 'session-video-1',
      prompt: 'A slow cinematic orbit around a glass bottle',
      status: 'succeeded',
      context: { sessionId: 'session-video-1', referenceAssetIds: [] },
      generationIds: ['video-generation-1'],
      createdAt: '2026-07-23T10:00:00.000Z',
      updatedAt: '2026-07-23T10:01:00.000Z'
    };
    const video: VisualVideoGenerationItem = {
      generationId: 'video-generation-1',
      videoUrl: '/generated-video.mp4',
      posterUrl: '/generated-video.jpg',
      prompt: turn.prompt,
      model: 'seedance-2-0',
      modelLabel: 'Doubao Seedance 2.0',
      aspectRatio: '16:9',
      isFavorite: false,
      createdAt: turn.updatedAt
    };
    const onFavorite = vi.fn();

    render(
      <ImageSessionConversation
        mediaType="video"
        turns={[turn]}
        historyById={{ [video.generationId]: video }}
        missingIds={[]}
        onPreview={noop}
        onDownload={noop}
        onRegenerate={noop}
        onFavorite={onFavorite}
        onCopyPrompt={noop}
      />
    );

    expect(
      screen.getByRole('region', { name: '当前创作会话' })
    ).toHaveAttribute('data-media-type', 'video');
    fireEvent.click(screen.getByRole('button', { name: '加入收藏' }));
    expect(onFavorite).toHaveBeenCalledWith(video);

    fireEvent.click(screen.getByRole('button', { name: '更多视频操作' }));
    expect(screen.getByRole('menu', { name: '视频操作' })).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: '加入收藏' })
    ).toBeInTheDocument();
  });
});
