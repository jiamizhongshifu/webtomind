import { useState } from 'react';
import { Button } from '@/shared/ui';
import type {
  MoodboardAnalysisStatus,
  MoodboardVisibility,
  VisualMoodboard
} from '@/shared/create-workspace-v2';
import { MoodboardAnalysisPanel } from '../components/create-workspace/MoodboardAnalysisPanel';
import '../styles/create-workspace-v2.css';

const states: MoodboardAnalysisStatus[] = [
  'idle',
  'analyzing',
  'ready',
  'stale',
  'failed'
];

function mockBoard(status: MoodboardAnalysisStatus): VisualMoodboard {
  const hasProfile = status === 'ready' || status === 'stale';
  return {
    id: 'harness-moodboard',
    name: 'Quiet urban cinema',
    description: 'A reusable visual direction for intimate city stories.',
    visibility: 'unlisted',
    isOfficial: false,
    isOwner: true,
    itemCount: status === 'idle' ? 3 : 6,
    analysisStatus: status,
    tasteProfile: hasProfile
      ? 'Muted cinematic tones, diffused natural light, shallow depth of field, tactile surfaces, and candid framing create an intimate editorial atmosphere.'
      : '',
    keywords: hasProfile
      ? ['35mm film', 'muted color', 'natural light', 'candid framing']
      : [],
    avoids: ['neon cyberpunk', 'hard studio flash'],
    guidelines: hasProfile
      ? [
          'Keep the subject embedded in a believable environment.',
          'Prefer soft daylight and restrained contrast.',
          'Preserve a little visual imperfection and film texture.'
        ]
      : [],
    representativeAssetIds: hasProfile
      ? ['asset-1', 'asset-2', 'asset-3', 'asset-4']
      : [],
    analysisVersion: hasProfile ? 2 : 0,
    shareToken: 'harness-share-token',
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z'
  };
}

export function MoodboardAnalysisHarnessPage() {
  const [status, setStatus] = useState<MoodboardAnalysisStatus>('ready');
  const [visibility, setVisibility] = useState<MoodboardVisibility>('unlisted');
  const [shared, setShared] = useState(true);
  const [lastAction, setLastAction] = useState('No interaction yet');
  const board = {
    ...mockBoard(status),
    visibility,
    shareToken: shared ? 'harness-share-token' : undefined
  };

  return (
    <main className="create-workspace-v2 moodboard-analysis-harness">
      <header>
        <span>ISOLATED COMPONENT PREVIEW</span>
        <h1>Moodboard analysis states</h1>
        <p>
          切换分析、失败、过期和分享状态，集中检查文案层级、长内容滚动、按钮状态与触控尺寸。
        </p>
      </header>

      <nav aria-label="Moodboard analysis harness states">
        {states.map((item) => (
          <Button
            key={item}
            type="button"
            variant={status === item ? 'primary' : 'secondary'}
            aria-pressed={status === item}
            onClick={() => setStatus(item)}
          >
            {item}
          </Button>
        ))}
      </nav>

      <section>
        <MoodboardAnalysisPanel
          board={board}
          isEnglish={false}
          busy={status === 'analyzing' ? 'analyzing' : ''}
          onAnalyze={() => {
            setStatus('analyzing');
            setLastAction('analysis requested');
          }}
          onVisibilityChange={(nextVisibility) => {
            setVisibility(nextVisibility);
            setLastAction(`visibility: ${nextVisibility}`);
          }}
          onShare={() => {
            setShared(true);
            setLastAction('share link copied');
          }}
          onRevokeShare={() => {
            setShared(false);
            setLastAction('share link revoked');
          }}
        />
        <output data-testid="moodboard-analysis-harness-output">
          {lastAction}
        </output>
      </section>
    </main>
  );
}
