import { Copy, Sparkles } from 'lucide-react';
import type { VisualMoodboard } from '@/shared/create-workspace-v2';
import { Button, IconButton, Textarea } from '@/shared/ui';

interface MoodboardDetailSummaryProps {
  board: VisualMoodboard;
  isEnglish: boolean;
  guidelinesDraft: string;
  savingGuidelines: boolean;
  analyzing?: boolean;
  onGuidelinesChange: (value: string) => void;
  onSaveGuidelines: () => void;
}

export function MoodboardDetailSummary({
  board,
  isEnglish,
  guidelinesDraft,
  savingGuidelines,
  analyzing = false,
  onGuidelinesChange,
  onSaveGuidelines
}: MoodboardDetailSummaryProps) {
  const profile =
    board.tasteProfile ||
    (isEnglish
      ? 'Analyze this moodboard to turn its shared visual language into reusable creation guidance.'
      : '分析这个情绪板，把参考图共同的视觉语言转化为可复用的创作指导。');

  return (
    <section
      className={`moodboard-detail-summary${analyzing ? ' is-analyzing' : ''}`}
      aria-label="Taste profile"
      aria-busy={analyzing}
    >
      <article>
        <h2>{isEnglish ? 'Taste profile' : '风格画像'}</h2>
        {analyzing ? (
          <div className="moodboard-analysis-skeleton" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
        ) : (
          <p>{profile}</p>
        )}
      </article>
      <article>
        <header>
          <h2>{isEnglish ? 'Keywords' : '关键词'}</h2>
          {board.keywords.length > 0 ? (
            <IconButton
              label={isEnglish ? 'Copy keywords' : '复制关键词'}
              variant="ghost"
              size="sm"
              icon={<Copy />}
              onClick={() =>
                void navigator.clipboard.writeText(board.keywords.join(', '))
              }
            />
          ) : null}
        </header>
        {analyzing ? (
          <div
            className="moodboard-analysis-keyword-skeleton"
            aria-hidden="true"
          >
            <span />
            <span />
            <span />
            <span />
          </div>
        ) : board.keywords.length > 0 ? (
          <div className="moodboard-detail-keywords">
            {board.keywords.map((keyword) => (
              <span key={keyword}>{keyword}</span>
            ))}
          </div>
        ) : (
          <p>{isEnglish ? 'No keywords yet.' : '分析后会生成关键词。'}</p>
        )}
      </article>
      <article>
        <h2>{isEnglish ? 'Guidelines' : '生成指导'}</h2>
        {analyzing ? (
          <div className="moodboard-analysis-skeleton" aria-hidden="true">
            <span />
            <span />
          </div>
        ) : board.isOwner ? (
          <div className="moodboard-detail-guidelines-editor">
            <Textarea
              value={guidelinesDraft}
              rows={5}
              maxLength={3600}
              placeholder={
                isEnglish
                  ? 'One reusable generation rule per line'
                  : '每行填写一条可复用的生成规则'
              }
              aria-label={isEnglish ? 'Generation guidelines' : '生成指导'}
              onChange={(event) => onGuidelinesChange(event.target.value)}
            />
            <Button
              variant="ghost"
              size="sm"
              disabled={savingGuidelines}
              onClick={onSaveGuidelines}
            >
              {savingGuidelines
                ? isEnglish
                  ? 'Saving…'
                  : '保存中…'
                : isEnglish
                  ? 'Save guidelines'
                  : '保存指导'}
            </Button>
          </div>
        ) : board.guidelines.length > 0 ? (
          <ul>
            {board.guidelines.map((guideline) => (
              <li key={guideline}>{guideline}</li>
            ))}
          </ul>
        ) : (
          <p>
            {board.isOfficial
              ? isEnglish
                ? 'Guidelines belong to your personal copy. Add this preset to your moodboards to write your own instructions.'
                : '生成指导属于用户自己的创作指令。把预设添加到你的情绪板后，即可自行填写。'
              : isEnglish
                ? 'Add instructions that should remain stable across generations.'
                : '每行填写一条需要在创作中保持稳定的视觉规则。'}
          </p>
        )}
      </article>
      <span className="moodboard-detail-analysis-state">
        <Sparkles />
        {analyzing
          ? isEnglish
            ? 'Analyzing moodboard'
            : '正在分析情绪板'
          : board.analysisStatus === 'ready'
            ? isEnglish
              ? 'Analyzed'
              : '已分析'
            : isEnglish
              ? 'Analysis available'
              : '可进行分析'}
      </span>
    </section>
  );
}
