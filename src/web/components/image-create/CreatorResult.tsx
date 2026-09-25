/**
 * 生成结果区:状态条 + 结果大图(空态/生成中态)+ 错误 + 最近历史网格。
 *
 * 纯展示:生成态由 useImageGeneration 派生后传入;点击历史项上抛 onSelectHistory
 * (页面据此打开预览弹窗)。
 */

import { useTranslation } from 'react-i18next';
import { Loader2, ImageIcon, X, Grid2X2, ShieldCheck } from 'lucide-react';
import { Button, IconButton, SupportErrorNotice } from '@/shared/ui';
import type { VisualImageHistoryItem } from '@/services/agent-api';
import type { ImageConsistencyCheckResult } from '@/shared/image-reference-types';
import { StaggeredImageGrid } from './StaggeredImageGrid';

export interface CreatorResultProps {
  statusText: string;
  isGenerating: boolean;
  resultImageUrl: string | null;
  resultImageUrls?: string[];
  error: string;
  generationHistory: VisualImageHistoryItem[];
  generationHistoryTotal: number;
  activeGenerationId: string | null;
  canCheckConsistency?: boolean;
  consistencyChecking?: boolean;
  consistencyResult?: ImageConsistencyCheckResult | null;
  onCheckConsistency?: () => void;
  onUseRepairPrompt?: (repairPrompt: string) => void;
  onSelectHistory: (item: VisualImageHistoryItem) => void;
  onViewMoreHistory?: () => void;
  onCloseResult?: () => void;
}

export function CreatorResult({
  statusText,
  isGenerating,
  resultImageUrl,
  resultImageUrls = [],
  error,
  generationHistory,
  generationHistoryTotal,
  activeGenerationId,
  canCheckConsistency = false,
  consistencyChecking = false,
  consistencyResult = null,
  onCheckConsistency,
  onUseRepairPrompt,
  onSelectHistory,
  onViewMoreHistory,
  onCloseResult
}: CreatorResultProps) {
  const { t, i18n } = useTranslation('imageCreate');
  const canCloseResult =
    Boolean(resultImageUrl) && !isGenerating && onCloseResult;
  const displayImageUrls =
    resultImageUrls.length > 0
      ? resultImageUrls
      : resultImageUrl
        ? [resultImageUrl]
        : [];

  return (
    <div className="creator-result">
      <div className="creator-result-head">
        <div className="creator-result-title">
          <span>{t('result.title')}</span>
          {statusText && <small>{statusText}</small>}
        </div>
        {canCloseResult && (
          <IconButton
            type="button"
            variant="outline"
            className="creator-result-close"
            label={t('result.close') as string}
            title={t('result.close') as string}
            onClick={onCloseResult}
            icon={<X />}
          />
        )}
      </div>
      <div
        className={`creator-result-frame ${isGenerating ? 'is-generating' : ''}`}
      >
        {displayImageUrls.length > 0 ? (
          <>
            <div
              className={`creator-result-images ${
                displayImageUrls.length > 1 ? 'multi' : ''
              }`}
            >
              {displayImageUrls.map((url, index) => (
                <img
                  key={`${url}-${index}`}
                  src={url}
                  alt={t('result.altGenerated') as string}
                />
              ))}
            </div>
            {isGenerating && (
              <div
                className="creator-result-overlay"
                role="status"
                aria-live="polite"
              >
                <Loader2 className="creator-spin-icon" size={24} />
                <span>{t('result.overlayHint')}</span>
              </div>
            )}
          </>
        ) : (
          <div className="creator-result-empty">
            {isGenerating ? (
              <Loader2 className="creator-spin-icon" size={28} />
            ) : (
              <ImageIcon size={32} />
            )}
            <span>
              {isGenerating ? t('result.waiting') : t('result.empty')}
            </span>
          </div>
        )}
      </div>
      {(canCheckConsistency || consistencyResult) && (
        <div className="creator-consistency-card">
          <div className="creator-consistency-head">
            <span>
              <ShieldCheck size={15} />
              角色一致性检查
            </span>
            {onCheckConsistency && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onCheckConsistency}
                disabled={consistencyChecking || !canCheckConsistency}
                leadingIcon={
                  consistencyChecking ? <Loader2 className="spin" /> : null
                }
              >
                {consistencyResult ? '重新检查' : '检查'}
              </Button>
            )}
          </div>
          {consistencyResult ? (
            <div className="creator-consistency-body">
              <div className="creator-consistency-score">
                <strong>{Math.round(consistencyResult.score * 100)}%</strong>
                <span>
                  {consistencyResult.verdict === 'pass'
                    ? '通过'
                    : consistencyResult.verdict === 'needs_repair'
                      ? '需要修复'
                      : '建议复核'}
                </span>
              </div>
              {consistencyResult.driftedTraits.length > 0 && (
                <p>
                  漂移点：
                  {consistencyResult.driftedTraits.slice(0, 3).join('、')}
                </p>
              )}
              {consistencyResult.matchedTraits.length > 0 && (
                <p>
                  保持点：
                  {consistencyResult.matchedTraits.slice(0, 3).join('、')}
                </p>
              )}
              {consistencyResult.repairPrompt && onUseRepairPrompt && (
                <Button
                  type="button"
                  className="creator-consistency-repair"
                  onClick={() =>
                    onUseRepairPrompt(consistencyResult.repairPrompt)
                  }
                >
                  使用修复提示词
                </Button>
              )}
            </div>
          ) : (
            <p className="creator-consistency-empty">
              检查角色身份、服装和 A/B 分组是否发生漂移。
            </p>
          )}
        </div>
      )}
      {error && (
        <SupportErrorNotice
          className="creator-error"
          locale={i18n.language.startsWith('en') ? 'en-US' : 'zh-CN'}
          message={error}
        />
      )}
      <div className="creator-history">
        <div className="creator-mini-head">
          <span>{t('history.title')}</span>
          <div className="creator-history-head-actions">
            <strong>{generationHistoryTotal}</strong>
            {generationHistory.length > 0 && onViewMoreHistory && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onViewMoreHistory}
                leadingIcon={<Grid2X2 />}
              >
                {t('history.viewMore')}
              </Button>
            )}
          </div>
        </div>
        {generationHistory.length > 0 ? (
          <StaggeredImageGrid className="creator-history-grid" observeAdditions>
            {generationHistory.map((item) => (
              <Button
                key={item.id}
                type="button"
                variant="ghost"
                size="icon"
                className={activeGenerationId === item.id ? 'active' : ''}
                onClick={() => onSelectHistory(item)}
              >
                <img src={item.imageUrl} alt="" loading="lazy" />
              </Button>
            ))}
          </StaggeredImageGrid>
        ) : (
          <p className="creator-empty-note">{t('history.empty')}</p>
        )}
      </div>
    </div>
  );
}
