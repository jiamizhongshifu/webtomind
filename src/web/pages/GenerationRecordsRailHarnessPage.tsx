import { useState } from 'react';
import type {
  VisualImageHistoryItem,
  VisualVideoGenerationItem
} from '@/services/agent-api';
import {
  GenerationRecordsRail,
  type GenerationRecordTask
} from '../components/image-create/GenerationRecordsRail';
import '../styles/image-create.css';
import '../styles/image-create-mobile.css';

const harnessImage =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 720 900%22%3E%3Cdefs%3E%3ClinearGradient id=%22g%22 x1=%220%22 x2=%221%22 y1=%220%22 y2=%221%22%3E%3Cstop stop-color=%22%23141414%22/%3E%3Cstop offset=%221%22 stop-color=%22%23bde579%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width=%22720%22 height=%22900%22 rx=%2248%22 fill=%22url(%23g)%22/%3E%3Ccircle cx=%22542%22 cy=%22162%22 r=%22102%22 fill=%22%23fff%22 opacity=%22.78%22/%3E%3Cpath d=%22M84 706c112-196 244-262 396-198 72 30 124 96 154 198v110H84z%22 fill=%22%23fff%22 opacity=%22.82%22/%3E%3Ctext x=%2276%22 y=%22134%22 font-family=%22Arial%22 font-size=%2264%22 font-weight=%22700%22 fill=%22%23fff%22%3ERAIL%3C/text%3E%3C/svg%3E';

const imageHistory: VisualImageHistoryItem = {
  id: 'rail-image-1',
  prompt: 'Editorial product portrait with clean shadows and wide copy space',
  negativePrompt: '',
  imageUrl: harnessImage,
  previewUrl: harnessImage,
  thumbnailUrl: harnessImage,
  createdAt: '2026-07-06T02:16:00.000Z',
  provider: 'webtomind',
  model: 'gpt-image-2',
  modelLabel: 'GPT Image',
  imageSize: '1024x1536',
  aspectRatio: '2:3',
  quality: 'high',
  outputFormat: 'png',
  requestedImageCount: 2,
  imageCount: 2,
  assetIds: []
};

const imageHistoryPair: VisualImageHistoryItem = {
  ...imageHistory,
  id: 'rail-image-2',
  createdAt: '2026-07-06T02:16:30.000Z'
};

const videoHistory: VisualVideoGenerationItem = {
  generationId: 'rail-video-1',
  prompt: 'A slow product reveal with soft studio light and a controlled pan',
  videoUrl: 'https://example.com/harness-video.mp4',
  posterUrl: harnessImage,
  createdAt: '2026-07-06T02:18:00.000Z',
  provider: 'webtomind',
  model: 'doubao-seedance-2-0-260128',
  modelLabel: 'Seedance',
  aspectRatio: '16:9',
  duration: 5
};

export function GenerationRecordsRailHarnessPage() {
  const [lastAction, setLastAction] = useState('ready');
  const darkMode =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('theme') === 'dark';

  const tasks: GenerationRecordTask[] = [
    {
      key: 'queued',
      label: 'Queued product render',
      status: 'queued',
      detail: 'Waiting for available image worker.',
      onCancel: () => setLastAction('cancel:queued')
    },
    {
      key: 'running',
      label: 'Running editorial set',
      status: 'running',
      progress: { current: 2, total: 4 },
      imageProgress: { current: 2, total: 4 },
      detail: 'Generating multiple compositions.',
      onEdit: () => setLastAction('edit:running'),
      onCancel: () => setLastAction('cancel:running')
    },
    {
      key: 'failed',
      label: 'Failed cover variant',
      status: 'failed',
      detail: 'Provider returned an invalid image payload.',
      retryLabel: 'Retry failed task',
      feedbackOptions: [
        { id: 'bad-style', label: 'Style mismatch' },
        { id: 'bad-quality', label: 'Low quality' }
      ],
      onRetry: () => setLastAction('retry:failed'),
      onDelete: () => setLastAction('delete:failed'),
      onFeedback: (reason) => setLastAction(`feedback:${reason}`)
    },
    {
      key: 'succeeded',
      label: 'Finished poster render',
      status: 'succeeded',
      acknowledgeLabel: 'Acknowledge',
      onAcknowledge: () => setLastAction('ack:succeeded'),
      onDismiss: () => setLastAction('dismiss:succeeded')
    }
  ];

  return (
    <main
      className={`image-create-page${darkMode ? ' dark' : ''}`}
      data-harness="generation-records-rail"
      style={{
        minHeight: '100vh',
        padding: 24,
        background: darkMode ? '#100e0d' : '#f6f3ee',
        color: darkMode ? '#fff7eb' : '#141414',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
      }}
    >
      <p style={{ margin: 0, fontSize: 12, fontWeight: 800 }}>
        ISOLATED PREVIEW HARNESS
      </p>
      <h1 style={{ margin: '8px 0 16px', fontSize: 22 }}>
        Generation Records Rail
      </h1>
      <section style={{ maxWidth: 420 }}>
        <GenerationRecordsRail
          tasks={tasks}
          historyItems={[videoHistory, imageHistory, imageHistoryPair]}
          historyTotal={3}
          activeGenerationId="rail-image-1"
          dateLocale="en-US"
          onPreview={(item) =>
            setLastAction(
              `preview:${'videoUrl' in item ? item.generationId : item.id}`
            )
          }
          onRegenerate={(item) =>
            setLastAction(
              `regenerate:${'videoUrl' in item ? item.generationId : item.id}`
            )
          }
          onFavorite={(item) =>
            setLastAction(
              `favorite:${'videoUrl' in item ? item.generationId : item.id}`
            )
          }
          onDownload={(item) => setLastAction(`download:${item.id}`)}
          onViewMoreHistory={() => setLastAction('collection')}
        />
      </section>
      <pre
        data-testid="generation-records-rail-state"
        style={{
          maxWidth: 420,
          marginTop: 16,
          whiteSpace: 'pre-wrap',
          fontSize: 12
        }}
      >
        {JSON.stringify({ lastAction }, null, 2)}
      </pre>
    </main>
  );
}
