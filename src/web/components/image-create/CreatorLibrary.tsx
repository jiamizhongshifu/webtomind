/**
 * 左侧素材库面板:公开/我的切换 + 上传 + 批量缩略图工具条 + slot/tag/搜索筛选 + 素材网格。
 *
 * 按域传整组 hook 结果(library / queue)避免 30+ 散 props;composer 态(activeSlot /
 * selection / selectedActiveAsset)与少量页面级回调单独传入。本组件不持有状态,纯渲染 +
 * 上抛交互。
 */

import { useTranslation } from 'react-i18next';
import {
  Loader2,
  ClipboardPaste,
  Wand2,
  Search,
  Check,
  Pencil,
  Trash2
} from 'lucide-react';
import {
  getSelectedAssetIds,
  isImagePromptAssetSelected,
  composerImagePromptSlots,
  type ImagePromptAsset,
  type ImagePromptSelection,
  type ImagePromptSlot
} from '../../data/image-prompt-core';
import { AssetThumb } from './AssetThumb';
import { StaggeredImageGrid } from './StaggeredImageGrid';
import { Button } from '@/shared/ui/radix/button';
import { Input } from '@/shared/ui/radix/input';
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/radix/tabs';
import { cn } from '@/lib/utils';
import type { UseAssetLibraryResult } from './useAssetLibrary';
import type { UseThumbnailQueueResult } from './useThumbnailQueue';

export interface CreatorLibraryProps {
  library: UseAssetLibraryResult;
  queue: UseThumbnailQueueResult;
  uploadStage: 'idle' | 'uploading' | 'analyzing' | 'confirming' | 'saving';
  uploadError: string;
  onPickUploadFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenPromptImport: () => void;
  uploadInputRef: React.RefObject<HTMLInputElement>;
  activeSlot: ImagePromptSlot;
  onActiveSlotChange: (slot: ImagePromptSlot) => void;
  getSlotLabel: (slot: ImagePromptSlot) => string;
  selection: ImagePromptSelection;
  selectedActiveAsset: ImagePromptAsset | undefined;
  onSelectAsset: (asset: ImagePromptAsset) => void;
  isAuthenticated: boolean;
  onRequireLogin: () => void;
  onOpenEdit: (asset: ImagePromptAsset) => void;
}

export function CreatorLibrary({
  library,
  queue,
  uploadStage,
  uploadError,
  onPickUploadFile,
  onOpenPromptImport,
  uploadInputRef,
  activeSlot,
  onActiveSlotChange,
  getSlotLabel,
  selection,
  selectedActiveAsset,
  onSelectAsset,
  isAuthenticated,
  onRequireLogin,
  onOpenEdit
}: CreatorLibraryProps) {
  const { t } = useTranslation('imageCreate');

  const {
    librarySource,
    setLibrarySource,
    assetSource,
    assetLoadError,
    filteredAssets,
    userAssetsLoaded,
    userAssetsAsPromptAssets,
    query,
    setQuery,
    activeTag,
    setActiveTag,
    slotTags,
    handleDeleteUserAsset
  } = library;

  const {
    batchQueue,
    batchStats,
    batchRunning,
    pendingThumbAssets,
    handleCancelBatch,
    handleRetryFailed,
    handleBatchRegenerate,
    handleRegenerateThumbnail
  } = queue;
  const selectedActiveCount = getSelectedAssetIds(selection, activeSlot).length;

  return (
    <aside className="creator-panel creator-library">
      <div className="creator-panel-head">
        <span>{t('library.title')}</span>
        <div className="creator-library-status">
          {librarySource === 'public' ? (
            <small title={assetLoadError || undefined}>
              {t(`library.${assetSource}`)}
            </small>
          ) : (
            <small>{t('library.tabs.mine')}</small>
          )}
          <strong>{filteredAssets.length}</strong>
        </div>
      </div>

      <Tabs
        value={librarySource}
        onValueChange={(value) => {
          if (value === 'mine' && !isAuthenticated) {
            onRequireLogin();
            return;
          }
          setLibrarySource(value as 'public' | 'mine');
        }}
      >
        <TabsList
          className="creator-library-source"
          aria-label={t('library.title') as string}
        >
          <TabsTrigger
            value="public"
            className={cn(librarySource === 'public' && 'active')}
          >
            {t('library.tabs.public')}
          </TabsTrigger>
          <TabsTrigger
            value="mine"
            className={cn(librarySource === 'mine' && 'active')}
          >
            {t('library.tabs.mine')}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={onPickUploadFile}
      />

      {librarySource === 'mine' && (
        <div className="creator-library-upload-row">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="creator-library-upload secondary"
            title="粘贴完整图片生成提示词，AI 会拆解为可复用的分类素材"
            aria-label="粘贴提示词导入素材"
            disabled={
              !isAuthenticated ||
              uploadStage === 'analyzing' ||
              uploadStage === 'saving'
            }
            onClick={() => {
              if (!isAuthenticated) {
                onRequireLogin();
                return;
              }
              onOpenPromptImport();
            }}
          >
            {uploadStage === 'analyzing' ? (
              <Loader2 data-icon="inline-start" className="creator-spin-icon" />
            ) : (
              <ClipboardPaste data-icon="inline-start" />
            )}
            {uploadStage === 'analyzing'
              ? t('upload.promptImportAnalyzing')
              : t('upload.promptImportButton')}
          </Button>
          {uploadError && (
            <small className="creator-library-upload-error">
              {uploadError}
            </small>
          )}
        </div>
      )}

      {librarySource === 'mine' &&
        isAuthenticated &&
        userAssetsLoaded &&
        (userAssetsAsPromptAssets.length > 0 || batchStats.total > 0) && (
          <div className="creator-mine-batch">
            <div className="creator-mine-batch-summary">
              {batchRunning ? (
                <span className="creator-mine-batch-progress-text">
                  {t('mine.batchProgress', {
                    current:
                      batchStats.done +
                      batchStats.failed +
                      batchStats.processing,
                    total: batchStats.total,
                    done: batchStats.done,
                    failed: batchStats.failed
                  })}
                </span>
              ) : pendingThumbAssets.length > 0 ? (
                <span className="creator-mine-batch-pending-text">
                  {t('mine.batchPending', {
                    count: pendingThumbAssets.length
                  })}
                </span>
              ) : batchStats.failed > 0 ? (
                <span className="creator-mine-batch-pending-text">
                  {t('mine.batchDonePartial', {
                    done: batchStats.done,
                    failed: batchStats.failed
                  })}
                </span>
              ) : batchStats.total > 0 &&
                batchStats.done === batchStats.total ? (
                <span className="creator-mine-batch-done-text">
                  {t('mine.batchDone')}
                </span>
              ) : (
                <span className="creator-mine-batch-done-text">
                  {t('mine.batchAllGenerated')}
                </span>
              )}
            </div>
            <div className="creator-mine-batch-actions">
              {batchRunning ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="creator-mine-batch-cancel"
                  title="停止当前缩略图批量生成队列"
                  aria-label="停止当前缩略图批量生成队列"
                  onClick={handleCancelBatch}
                >
                  {t('mine.batchCancel')}
                </Button>
              ) : batchStats.failed > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="creator-mine-batch-retry"
                  title="重新生成上次失败的素材缩略图"
                  aria-label="重新生成失败的素材缩略图"
                  onClick={handleRetryFailed}
                >
                  <Wand2 data-icon="inline-start" />
                  {t('mine.batchRetryFailed', { count: batchStats.failed })}
                </Button>
              ) : pendingThumbAssets.length > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="creator-mine-batch-run"
                  title="为当前缺少缩略图的个人素材批量生成 AI 缩略图"
                  aria-label="批量生成缺失的 AI 缩略图"
                  onClick={handleBatchRegenerate}
                >
                  <Wand2 data-icon="inline-start" />
                  {t('mine.batchRegenerate', {
                    count: pendingThumbAssets.length
                  })}
                </Button>
              ) : null}
            </div>
            {batchRunning && batchStats.total > 0 && (
              <div
                className="creator-mine-batch-bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={batchStats.total}
                aria-valuenow={batchStats.done + batchStats.failed}
              >
                <span
                  style={{
                    transform: `scaleX(${
                      Math.min(
                        100,
                        ((batchStats.done + batchStats.failed) /
                          batchStats.total) *
                          100
                      ) / 100
                    })`
                  }}
                />
              </div>
            )}
          </div>
        )}

      <Tabs
        value={activeSlot}
        onValueChange={(value) => onActiveSlotChange(value as ImagePromptSlot)}
      >
        <TabsList
          className="creator-slot-tabs"
          aria-label={t('library.title') as string}
        >
          {composerImagePromptSlots.map((slot) => (
            <TabsTrigger
              key={slot.id}
              value={slot.id}
              data-slot-tab={slot.id}
              className={cn(activeSlot === slot.id && 'active')}
            >
              {getSlotLabel(slot.id)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="creator-tag-row">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(activeTag === null && 'active')}
          onClick={() => setActiveTag(null)}
        >
          {t('library.allTags')}
        </Button>
        {slotTags.map((tag) => (
          <Button
            key={tag}
            type="button"
            variant="ghost"
            size="sm"
            className={cn(activeTag === tag && 'active')}
            onClick={() => setActiveTag(tag)}
          >
            {tag}
          </Button>
        ))}
      </div>

      <div className="creator-search">
        <Search size={16} />
        <Input
          value={query}
          placeholder={
            t('library.searchPlaceholder', {
              slot: getSlotLabel(activeSlot)
            }) as string
          }
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {selectedActiveAsset && (
        <div className="creator-active-summary">
          <span>
            {t('canvas.selectedSlot', { slot: getSlotLabel(activeSlot) })}
          </span>
          <strong>
            {selectedActiveAsset.title}
            {selectedActiveCount > 1 ? ` +${selectedActiveCount - 1}` : ''}
          </strong>
        </div>
      )}

      <StaggeredImageGrid className="creator-asset-grid" observeAdditions>
        {filteredAssets.map((asset) => {
          const isSelected = isImagePromptAssetSelected(selection, asset);
          return (
            <div
              key={asset.id}
              className={cn(
                'creator-asset-card-shell',
                isSelected && 'selected'
              )}
            >
              <Button
                type="button"
                variant="ghost"
                className={cn('creator-asset-card', isSelected && 'selected')}
                onClick={() => onSelectAsset(asset)}
              >
                <AssetThumb asset={asset} />
                <span>{asset.title}</span>
                <small>{asset.subtitle}</small>
                {isSelected && (
                  <i aria-label={t('picker.selected') as string}>
                    <Check size={14} />
                  </i>
                )}
                {librarySource === 'mine' && batchQueue[asset.id] && (
                  <span
                    className={`creator-asset-card-queue-badge status-${batchQueue[asset.id].status}`}
                    title={batchQueue[asset.id].error || undefined}
                  >
                    {batchQueue[asset.id].status === 'processing' && (
                      <Loader2 size={11} className="creator-spin-icon" />
                    )}
                    {batchQueue[asset.id].status === 'queued' &&
                      t('mine.queueStatusQueued')}
                    {batchQueue[asset.id].status === 'processing' &&
                      t('mine.queueStatusProcessing')}
                    {batchQueue[asset.id].status === 'done' &&
                      t('mine.queueStatusDone')}
                    {batchQueue[asset.id].status === 'failed' &&
                      t('mine.queueStatusFailed')}
                  </span>
                )}
              </Button>
              {librarySource === 'mine' && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="creator-asset-card-regenerate"
                  aria-label={t('mine.regenerate') as string}
                  title={t('mine.regenerate') as string}
                  aria-busy={batchQueue[asset.id]?.status === 'processing'}
                  onClick={() => handleRegenerateThumbnail(asset)}
                >
                  {batchQueue[asset.id]?.status === 'processing' ? (
                    <Loader2 className="creator-spin-icon" />
                  ) : (
                    <Wand2 />
                  )}
                </Button>
              )}
              {librarySource === 'mine' && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="creator-asset-card-edit"
                  aria-label={t('mine.edit') as string}
                  title={t('mine.edit') as string}
                  onClick={() => onOpenEdit(asset)}
                >
                  <Pencil />
                </Button>
              )}
              {librarySource === 'mine' && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="creator-asset-card-delete"
                  aria-label={t('mine.delete') as string}
                  title={t('mine.delete') as string}
                  onClick={() => void handleDeleteUserAsset(asset.id)}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          );
        })}
        {librarySource === 'mine' &&
          filteredAssets.length === 0 &&
          userAssetsLoaded && (
            <div className="creator-library-empty">
              {isAuthenticated ? t('mine.empty') : t('mine.loginRequired')}
            </div>
          )}
      </StaggeredImageGrid>
    </aside>
  );
}
