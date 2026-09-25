import { RefreshCw, Share2, Sparkles } from 'lucide-react';
import { Button, Select } from '@/shared/ui';
import {
  MOODBOARD_MIN_ANALYSIS_ITEMS,
  type MoodboardVisibility,
  type VisualMoodboard
} from '@/shared/create-workspace-v2';

interface MoodboardAnalysisPanelProps {
  board: VisualMoodboard;
  isEnglish: boolean;
  busy?: string;
  onAnalyze: () => void;
  onVisibilityChange: (visibility: MoodboardVisibility) => void;
  onShare: () => void;
  onRevokeShare: () => void;
}

const STATUS_COPY = {
  idle: { 'zh-CN': '待分析', 'en-US': 'Not analyzed' },
  analyzing: { 'zh-CN': '分析中', 'en-US': 'Analyzing' },
  ready: { 'zh-CN': '已分析', 'en-US': 'Ready' },
  stale: { 'zh-CN': '需要更新', 'en-US': 'Needs refresh' },
  failed: { 'zh-CN': '分析失败', 'en-US': 'Analysis failed' }
} as const;

export function MoodboardAnalysisPanel({
  board,
  isEnglish,
  busy = '',
  onAnalyze,
  onVisibilityChange,
  onShare,
  onRevokeShare
}: MoodboardAnalysisPanelProps) {
  const locale = isEnglish ? 'en-US' : 'zh-CN';
  const analysisPending =
    busy === 'analyzing' || board.analysisStatus === 'analyzing';
  const canAnalyze =
    board.itemCount >= MOODBOARD_MIN_ANALYSIS_ITEMS && !analysisPending;

  return (
    <aside className="moodboard-analysis-panel" aria-live="polite">
      <div className="moodboard-analysis-heading">
        <span>
          <Sparkles /> {isEnglish ? 'Taste profile' : '风格分析'}
        </span>
        <em data-status={board.analysisStatus}>
          {STATUS_COPY[board.analysisStatus][locale]}
        </em>
      </div>

      {board.analysisStatus === 'failed' ? (
        <p className="moodboard-analysis-alert" role="alert">
          {isEnglish
            ? 'The last analysis did not finish. Your references are safe; try again when ready.'
            : '上次分析未完成，参考图不会丢失；可以稍后重新尝试。'}
        </p>
      ) : board.analysisStatus === 'stale' ? (
        <p className="moodboard-analysis-alert">
          {isEnglish
            ? 'References changed after this profile was created. Reanalyze before reusing it.'
            : '参考图已经发生变化。重新分析后，新的视觉语境才会用于生成。'}
        </p>
      ) : null}

      {board.tasteProfile ? (
        <p>{board.tasteProfile}</p>
      ) : (
        <p className="is-muted">
          {isEnglish
            ? 'Add at least four references to analyze their shared visual language.'
            : '添加至少 4 张参考图，分析它们共同的色彩、光线、构图与质感。'}
        </p>
      )}

      {board.keywords.length > 0 ? (
        <div className="moodboard-keywords" aria-label="Keywords">
          {board.keywords.map((keyword) => (
            <span key={keyword}>{keyword}</span>
          ))}
        </div>
      ) : null}

      {board.guidelines.length > 0 ? (
        <div className="moodboard-guidelines">
          <strong>{isEnglish ? 'Generation guidelines' : '生成指导'}</strong>
          <ul>
            {board.guidelines.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {board.isOwner ? (
        <Button
          variant="secondary"
          leadingIcon={
            board.analysisStatus === 'stale' ||
            board.analysisStatus === 'failed' ? (
              <RefreshCw />
            ) : (
              <Sparkles />
            )
          }
          disabled={!canAnalyze}
          onClick={onAnalyze}
        >
          {analysisPending
            ? isEnglish
              ? 'Analyzing…'
              : '分析中…'
            : board.analysisStatus === 'stale' ||
                board.analysisStatus === 'failed'
              ? isEnglish
                ? 'Reanalyze'
                : '重新分析'
              : isEnglish
                ? 'Analyze moodboard'
                : '分析情绪板'}
        </Button>
      ) : null}

      {board.isOwner ? (
        <div className="moodboard-share-controls">
          <strong>{isEnglish ? 'Visibility' : '可见范围'}</strong>
          <Select
            value={board.visibility}
            onChange={(event) =>
              onVisibilityChange(event.target.value as MoodboardVisibility)
            }
            aria-label={
              isEnglish ? 'Moodboard visibility' : '情绪板可见范围'
            }
          >
            <option value="private">{isEnglish ? 'Private' : '私有'}</option>
            <option value="unlisted">
              {isEnglish ? 'Anyone with link' : '链接可见'}
            </option>
            <option value="public">
              {isEnglish ? 'Public discovery' : '公开展示'}
            </option>
          </Select>
          <Button
            variant="secondary"
            leadingIcon={<Share2 />}
            disabled={busy === 'sharing'}
            onClick={onShare}
          >
            {isEnglish ? 'Copy share link' : '复制分享链接'}
          </Button>
          {board.shareToken ? (
            <Button
              variant="ghost"
              disabled={busy === 'revoking'}
              onClick={onRevokeShare}
            >
              {isEnglish ? 'Revoke link' : '撤销分享链接'}
            </Button>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
