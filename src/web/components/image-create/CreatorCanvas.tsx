/**
 * 中间画布区:slot 选择板(每个槽位展示已选素材 + 清除)。
 *
 * 纯展示:composer 态(selection/activeSlot/settings 派生的 compiled)
 * 由页面持有传入,本组件只渲染 + 上抛交互。
 */

import { useTranslation } from 'react-i18next';
import {
  FileInput,
  ImageIcon,
  Loader2,
  Maximize2,
  Save,
  Shuffle,
  Trash2,
  X
} from 'lucide-react';
import {
  composerImagePromptSlots,
  getAssetById,
  getSelectedAssetIds,
  isPortraitRandomEligible,
  type ImagePromptAsset,
  type ImagePromptSelection,
  type ImagePromptSlot
} from '../../data/image-prompt-core';
import { Button } from '@/shared/ui/radix/button';
import { BeamCta } from '@/web/components/BeamCta';
import { AssetThumb } from './AssetThumb';
import { WardrobeMaterialPicker } from './WardrobeMaterialPicker';
import {
  isWardrobeMaterialSlot,
  type WardrobeMaterialSelection,
  type WardrobeMaterialSlot
} from '../../data/wardrobe-materials';

export interface CompiledPrompt {
  prompt: string;
  negativePrompt: string;
  selectedAssets: ImagePromptAsset[];
  warnings: string[];
}

export interface CreatorCanvasProps {
  compiled: CompiledPrompt;
  selection: ImagePromptSelection;
  mergedAssets: ImagePromptAsset[];
  activeSlot: ImagePromptSlot;
  onActiveSlotChange: (slot: ImagePromptSlot) => void;
  getSlotLabel: (slot: ImagePromptSlot) => string;
  onClearSlot: (slot: ImagePromptSlot) => void;
  onClearSelection?: () => void;
  onOpenPicker: (slot?: ImagePromptSlot) => void;
  onApplySelectionToPrompt?: () => void;
  emphasizeApplyToPrompt?: boolean;
  onRandomizeSelection?: () => void;
  onRandomizeSlot?: (slot: ImagePromptSlot) => void;
  materialSelection?: WardrobeMaterialSelection;
  onMaterialChange?: (slot: WardrobeMaterialSlot, materialId?: string) => void;
  onImportAsset?: (asset: ImagePromptAsset) => void;
  importingAssetIds?: Set<string>;
}

export function CreatorCanvas({
  compiled,
  selection,
  mergedAssets,
  activeSlot,
  onActiveSlotChange,
  getSlotLabel,
  onClearSlot,
  onClearSelection,
  onOpenPicker,
  onApplySelectionToPrompt,
  emphasizeApplyToPrompt = false,
  onRandomizeSelection,
  onRandomizeSlot,
  materialSelection = {},
  onMaterialChange,
  onImportAsset,
  importingAssetIds
}: CreatorCanvasProps) {
  const { t } = useTranslation('imageCreate');
  const applyToPromptButton = (
    <Button
      type="button"
      variant="outline"
      className={
        emphasizeApplyToPrompt ? 'creator-canvas-apply-emphasized' : undefined
      }
      title={t('canvas.applyToPromptHint') as string}
      aria-label={t('canvas.applyToPrompt') as string}
      disabled={compiled.selectedAssets.length === 0}
      onClick={onApplySelectionToPrompt}
    >
      <FileInput data-icon="inline-start" />
      {t('canvas.applyToPrompt')}
    </Button>
  );

  return (
    <div className="creator-canvas">
      <div className="creator-canvas-head">
        <div>
          <span>{t('canvas.title')}</span>
          <strong>
            {t('canvas.slotCount', {
              count: compiled.selectedAssets.length
            })}
          </strong>
        </div>
        <div className="creator-canvas-actions">
          <Button
            type="button"
            variant="ghost"
            className="creator-canvas-clear"
            title={t('canvas.clearAllHint') as string}
            aria-label={t('canvas.clearAll') as string}
            disabled={compiled.selectedAssets.length === 0}
            onClick={onClearSelection}
          >
            <Trash2 data-icon="inline-start" />
            {t('canvas.clearAll')}
          </Button>
          <Button
            type="button"
            variant="outline"
            title={t('canvas.randomizeHint') as string}
            aria-label={t('canvas.randomize') as string}
            onClick={onRandomizeSelection}
          >
            <Shuffle data-icon="inline-start" />
            {t('canvas.randomize')}
          </Button>
          <Button
            type="button"
            variant="outline"
            title="打开大图选择器，集中查看并选择各分类素材"
            aria-label="打开大图选择器"
            onClick={() => onOpenPicker()}
          >
            <Maximize2 data-icon="inline-start" />
            {t('canvas.openPicker')}
          </Button>
          {emphasizeApplyToPrompt ? (
            <BeamCta
              className="creator-canvas-apply-beam"
              radius={10}
              tone="primary"
            >
              {applyToPromptButton}
            </BeamCta>
          ) : (
            applyToPromptButton
          )}
        </div>
      </div>

      <div className="creator-slot-board">
        {composerImagePromptSlots.map((slot) => {
          // 用 mergedAssets 而非 assets，保证个人库素材也能被槽位 lookup 到
          const selectedSlotAssets = getSelectedAssetIds(selection, slot.id)
            .map((assetId) => getAssetById(assetId, mergedAssets))
            .filter((asset): asset is ImagePromptAsset => Boolean(asset));
          const asset = selectedSlotAssets[0];
          const isActive = activeSlot === slot.id;
          const slotLabel = getSlotLabel(slot.id);
          const isOptional = slot.randomInclusionRate < 1;
          const hasRandomCandidate = mergedAssets.some(
            (candidate) =>
              candidate.slot === slot.id && isPortraitRandomEligible(candidate)
          );
          const canImportAsset =
            Boolean(asset?.id.startsWith('reverse-')) && Boolean(onImportAsset);
          const isImportingAsset =
            Boolean(asset) && Boolean(importingAssetIds?.has(asset!.id));

          return (
            <div key={slot.id} className="creator-slot-shell">
              <Button
                type="button"
                variant="ghost"
                className={`creator-slot ${isActive ? 'active' : ''}`}
                onClick={() => {
                  onActiveSlotChange(slot.id);
                  onOpenPicker(slot.id);
                }}
              >
                <span className="creator-slot-title">
                  <span className="creator-slot-heading">
                    {slotLabel}
                    {isOptional && <em>{t('canvas.optionalSlot')}</em>}
                  </span>
                </span>
                {asset ? (
                  <>
                    <AssetThumb asset={asset} />
                    {selectedSlotAssets.length > 1 && (
                      <span className="creator-slot-count">
                        +{selectedSlotAssets.length - 1}
                      </span>
                    )}
                    <strong>{asset.title}</strong>
                    <small>
                      {selectedSlotAssets.length > 1
                        ? selectedSlotAssets
                            .map((item) => item.title)
                            .join(' / ')
                        : asset.subtitle}
                    </small>
                  </>
                ) : (
                  <span className="creator-empty-slot">
                    <span className="creator-empty-slot-icon">
                      <ImageIcon size={20} />
                    </span>
                    <strong>
                      {t('canvas.emptySlot', { slot: slotLabel })}
                    </strong>
                  </span>
                )}
              </Button>
              {selectedSlotAssets.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  className="creator-slot-clear"
                  aria-label={
                    t('canvas.clearSlot', { slot: slotLabel }) as string
                  }
                  title={t('canvas.clearSlot', { slot: slotLabel }) as string}
                  onClick={() => onClearSlot(slot.id)}
                >
                  <X size={14} />
                </Button>
              )}
              {canImportAsset && asset && (
                <Button
                  type="button"
                  variant="ghost"
                  className="creator-slot-import"
                  aria-label="导入该素材到我的素材"
                  title="把这个反推出的单个素材保存到我的素材库"
                  disabled={isImportingAsset}
                  onClick={() => onImportAsset?.(asset)}
                >
                  {isImportingAsset ? (
                    <Loader2 size={12} className="creator-spin-icon" />
                  ) : (
                    <Save size={12} />
                  )}
                  <em>{isImportingAsset ? '导入中' : '导入'}</em>
                </Button>
              )}
              {isWardrobeMaterialSlot(slot.id) && onMaterialChange && (
                <WardrobeMaterialPicker
                  slot={slot.id}
                  slotLabel={slotLabel}
                  selectedMaterialId={materialSelection[slot.id]}
                  disabled={selectedSlotAssets.length === 0}
                  onChange={onMaterialChange}
                />
              )}
              <Button
                type="button"
                variant="ghost"
                className="creator-slot-randomize"
                aria-label={
                  t('canvas.randomizeSlot', { slot: slotLabel }) as string
                }
                title={
                  t(
                    hasRandomCandidate
                      ? 'canvas.randomizeSlotHint'
                      : 'canvas.randomizeSlotUnavailable',
                    { slot: slotLabel }
                  ) as string
                }
                disabled={!hasRandomCandidate}
                onClick={(event) => {
                  event.stopPropagation();
                  onRandomizeSlot?.(slot.id);
                }}
              >
                <Shuffle size={14} />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
