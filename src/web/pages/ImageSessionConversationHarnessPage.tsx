import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type {
  VisualImageHistoryItem,
  VisualVideoGenerationItem
} from '@/services/agent-api';
import type { ImageCreationTurn } from '@/shared/create-workspace-v2';
import harnessResultImage from '../assets/home/cta-landscape.webp';
import { ImageSessionConversation } from '../components/image-create/ImageSessionConversation';
import type { GenerationRecordTask } from '../components/image-create/GenerationRecordsRail';
import '../styles/image-create.css';
import '../styles/image-create-mobile.css';
import '../styles/create-studio-theme.css';

export function ImageSessionConversationHarnessPage() {
  const [searchParams] = useSearchParams();
  const isDark = searchParams.get('theme') === 'dark';
  const mediaType = searchParams.get('media') === 'video' ? 'video' : 'image';
  const failedState = searchParams.get('state') === 'failed';
  const portraitResult = searchParams.get('ratio') === 'portrait';
  const [lastAction, setLastAction] = useState('ready');
  const [favorite, setFavorite] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    return () => document.documentElement.classList.remove('dark');
  }, [isDark]);

  const task: GenerationRecordTask = {
    key: 'session-progress-running',
    sessionId: 'session-harness',
    label: `正在生成${mediaType === 'video' ? '视频' : '图片'}`,
    status: 'running',
    detail: '已等待 28 秒，模型正在接收任务',
    prompt:
      '一匹黑色骏马穿过清晨薄雾中的旷野，低机位广角摄影，鬃毛被风吹起，柔和逆光与克制的电影色彩。',
    modelLabel: 'GPT Image 2',
    aspectRatio: '9:16',
    imageCount: 2,
    imageProgress: { total: 2 },
    onEdit: () => setLastAction('prompt'),
    onCancel: () => setLastAction('cancel')
  };
  const completedTurn: ImageCreationTurn = {
    id: 'turn-harness-completed',
    sessionId: 'session-harness',
    prompt:
      '一匹白马站在清晨薄雾的草地上，写实自然光摄影，柔和逆光，安静而清透的电影色彩。点击这张提示词卡即可复制完整提示词。',
    status: 'succeeded',
    context: { sessionId: 'session-harness', referenceAssetIds: [] },
    generationIds: ['generation-harness'],
    createdAt: '2026-07-17T14:00:00.000Z',
    updatedAt: '2026-07-17T14:01:00.000Z'
  };
  const failedTurn: ImageCreationTurn = {
    id: 'task-harness-timeout',
    sessionId: 'session-harness',
    prompt:
      '未来机甲驾驶舱内的竖版真人时尚肖像，低照度冷蓝环境光，人物面部由柔和暖光勾勒。',
    status: 'failed',
    context: {
      sessionId: 'session-harness',
      taskId: 'task-harness-timeout',
      referenceAssetIds: []
    },
    generationIds: [],
    errorMessage: '生成超时（接近函数上限），已触发退款',
    createdAt: '2026-07-24T08:50:34.000Z',
    updatedAt: '2026-07-24T08:55:07.000Z'
  };
  const completedImage: VisualImageHistoryItem = {
    id: 'generation-harness',
    imageUrl: harnessResultImage,
    thumbnailUrl: `${harnessResultImage}?variant=thumbnail`,
    previewUrl: `${harnessResultImage}?variant=preview`,
    prompt: completedTurn.prompt,
    width: portraitResult ? 800 : 1200,
    height: portraitResult ? 1200 : 800,
    provider: 'openai',
    model: 'gpt-image-2',
    modelLabel: 'GPT Image 2',
    assetIds: [],
    createdAt: completedTurn.updatedAt
  };
  const completedVideo: VisualVideoGenerationItem = {
    generationId: completedTurn.generationIds[0],
    videoUrl: 'data:video/mp4;base64,',
    posterUrl: harnessResultImage,
    prompt: completedTurn.prompt,
    model: 'seedance-2-0',
    modelLabel: 'Doubao Seedance 2.0',
    aspectRatio: '16:9',
    duration: 8,
    isFavorite: false,
    createdAt: completedTurn.updatedAt
  };
  const completedItem =
    mediaType === 'video'
      ? { ...completedVideo, isFavorite: favorite }
      : { ...completedImage, isFavorite: favorite };

  return (
    <main
      className={`image-create-page image-studio-v2${isDark ? ' dark' : ''}`}
      data-harness="image-session-conversation"
      style={{
        minHeight: '100dvh',
        padding: 'clamp(24px, 7vw, 96px) 20px 140px',
        background: isDark ? '#101010' : '#f6f7f9',
        color: isDark ? '#f5f5f5' : '#171a20'
      }}
    >
      <header style={{ width: 'min(1180px, 100%)', margin: '0 auto 24px' }}>
        <small
          style={{
            color: isDark ? 'rgba(255,255,255,.45)' : '#7b8491'
          }}
        >
          SESSION CONVERSATION · {mediaType.toUpperCase()}{' '}
          {failedState ? 'FAILED TASK' : 'RESULT + RUNNING TASK'}
        </small>
        <h1 style={{ margin: '8px 0 0', fontSize: 'clamp(22px, 4vw, 34px)' }}>
          当前创作会话
        </h1>
      </header>
      <ImageSessionConversation
        mediaType={mediaType}
        turns={failedState ? [failedTurn] : [completedTurn]}
        progressTasks={failedState ? [] : [task]}
        historyById={
          failedState
            ? {}
            : {
                ['generationId' in completedItem
                  ? completedItem.generationId
                  : completedItem.id]: completedItem
              }
        }
        missingIds={[]}
        onPreview={() => setLastAction('preview')}
        onDownload={() => setLastAction('download')}
        onRegenerate={() => setLastAction('retry')}
        onReedit={() => setLastAction('edit')}
        onRetryTurn={() => setLastAction('retry-turn')}
        onFavorite={() => {
          setFavorite((current) => !current);
          setLastAction('favorite');
        }}
        onDelete={() => setLastAction('delete')}
        onCopyPrompt={() => {
          setLastAction('copy');
          return true;
        }}
        activationMilestone={
          searchParams.get('activation') === '1' && !failedState
            ? {
                generationIds: [completedTurn.generationIds[0]],
                rewardStatus: 'granted'
              }
            : null
        }
        onActivationAction={(action) => setLastAction(action)}
      />
      <output
        data-testid="image-session-conversation-state"
        style={{
          display: 'block',
          width: 'min(1180px, 100%)',
          margin: '20px auto 0',
          color: isDark ? 'rgba(255,255,255,.45)' : '#7b8491',
          fontSize: 12
        }}
      >
        last action: {lastAction}
      </output>
    </main>
  );
}
