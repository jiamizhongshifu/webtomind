/**
 * 大图素材选择弹窗。按 slot + tag + 搜索过滤,点击卡片选中/取消选中。
 *
 * 纯展示:过滤后的 filteredAssets / selection / 各筛选态由父级(ImageCreatePage)
 * 从 useAssetLibrary + composer 态派生后传入,本组件只渲染 + 把交互上抛。
 */

import { useTranslation } from 'react-i18next';
import { useRef, useState } from 'react';
import {
  X,
  Check,
  Search,
  Plus,
  ClipboardPaste,
  Loader2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  isImagePromptAssetSelected,
  composerImagePromptSlots,
  type ImagePromptAsset,
  type ImagePromptSelection,
  type ImagePromptSlot
} from '../../data/image-prompt-core';
import { AssetThumb } from './AssetThumb';
import { Button } from '@/shared/ui/radix/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@/shared/ui/radix/dialog';
import { Input } from '@/shared/ui/radix/input';
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/radix/tabs';
import { cn } from '@/lib/utils';
import { StaggeredImageGrid } from './StaggeredImageGrid';

export interface AssetPickerProps {
  librarySource: 'public' | 'mine';
  onLibrarySourceChange: (source: 'public' | 'mine') => void;
  assetSource: 'remote' | 'hybrid' | 'local';
  assetLoadError: string;
  isAuthenticated: boolean;
  onRequireLogin: () => void;
  uploadStage: 'idle' | 'uploading' | 'analyzing' | 'confirming' | 'saving';
  onOpenPromptImport: () => void;
  activeSlot: ImagePromptSlot;
  onActiveSlotChange: (slot: ImagePromptSlot) => void;
  getSlotLabel: (slot: ImagePromptSlot) => string;
  query: string;
  onQueryChange: (value: string) => void;
  activeTag: string | null;
  onActiveTagChange: (tag: string | null) => void;
  slotTags: string[];
  filteredAssets: ImagePromptAsset[];
  selection: ImagePromptSelection;
  onSelectAsset: (asset: ImagePromptAsset) => void;
  onClose: () => void;
}

function keepHorizontalControlVisible(button: HTMLButtonElement) {
  button.scrollIntoView({
    block: 'nearest',
    inline: 'center',
    behavior: 'smooth'
  });
}

export function AssetPicker({
  librarySource,
  onLibrarySourceChange,
  assetSource,
  assetLoadError,
  isAuthenticated,
  onRequireLogin,
  uploadStage,
  onOpenPromptImport,
  activeSlot,
  onActiveSlotChange,
  getSlotLabel,
  query,
  onQueryChange,
  activeTag,
  onActiveTagChange,
  slotTags,
  filteredAssets,
  selection,
  onSelectAsset,
  onClose
}: AssetPickerProps) {
  const { t } = useTranslation('imageCreate');
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [slotNavExpanded, setSlotNavExpanded] = useState(false);
  const [tagNavExpanded, setTagNavExpanded] = useState(false);

  const focusAssetGridStart = () => {
    const grid = gridRef.current;
    if (!grid) return;
    grid.scrollTo({ top: 0, behavior: 'smooth' });
    grid.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  const handleSlotSelect = (slot: ImagePromptSlot) => {
    onActiveSlotChange(slot);
    onActiveTagChange(null);
    window.requestAnimationFrame(focusAssetGridStart);
  };

  const handleTagSelect = (
    tag: string | null,
    trigger?: HTMLButtonElement | null
  ) => {
    if (trigger) keepHorizontalControlVisible(trigger);
    onActiveTagChange(tag);
    window.requestAnimationFrame(focusAssetGridStart);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="creator-picker z-[151] !max-w-none gap-0 p-0"
        overlayClassName="creator-picker-backdrop"
        showCloseButton={false}
        aria-label={
          t('picker.title', { slot: getSlotLabel(activeSlot) }) as string
        }
      >
        <div className="creator-picker-head">
          <div>
            <DialogTitle asChild>
              <span>
                {t('picker.title', { slot: getSlotLabel(activeSlot) })}
              </span>
            </DialogTitle>
            <DialogDescription asChild>
              <p>{t('picker.subtitle')}</p>
            </DialogDescription>
          </div>
          <div className="creator-picker-head-actions">
            <Tabs
              value={librarySource}
              onValueChange={(value) => {
                if (value === 'mine' && !isAuthenticated) {
                  onRequireLogin();
                  return;
                }
                onLibrarySourceChange(value as 'public' | 'mine');
              }}
            >
              <TabsList
                className="creator-library-source creator-picker-source"
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
            <div className="creator-library-status creator-picker-status">
              {librarySource === 'public' ? (
                <small title={assetLoadError || undefined}>
                  {t(`library.${assetSource}`)}
                </small>
              ) : (
                <small>{t('library.tabs.mine')}</small>
              )}
              <strong>{filteredAssets.length}</strong>
            </div>
            {librarySource === 'mine' && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="creator-picker-import"
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
                  <Loader2
                    data-icon="inline-start"
                    className="creator-spin-icon"
                  />
                ) : (
                  <ClipboardPaste data-icon="inline-start" />
                )}
                {uploadStage === 'analyzing'
                  ? t('upload.promptImportAnalyzing')
                  : t('upload.promptImportButton')}
              </Button>
            )}
            <div className="creator-search creator-picker-head-search">
              <Search size={16} />
              <Input
                value={query}
                placeholder={
                  t('library.searchPlaceholder', {
                    slot: getSlotLabel(activeSlot)
                  }) as string
                }
                onChange={(event) => onQueryChange(event.target.value)}
              />
            </div>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="creator-picker-close"
            aria-label={t('preview.close') as string}
            onClick={onClose}
          >
            <X data-icon="inline-start" />
          </Button>
        </div>

        <div className="creator-picker-toolbar">
          <div
            className={`creator-picker-slot-nav ${
              slotNavExpanded ? 'expanded' : ''
            }`}
          >
            <Tabs
              value={activeSlot}
              onValueChange={(value) =>
                handleSlotSelect(value as ImagePromptSlot)
              }
            >
              <TabsList
                className="creator-slot-tabs creator-picker-slot-tabs"
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
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="creator-picker-slot-toggle"
              aria-expanded={slotNavExpanded}
              aria-label={
                slotNavExpanded
                  ? (t('picker.collapseSlots') as string)
                  : (t('picker.expandSlots') as string)
              }
              title={
                slotNavExpanded
                  ? (t('picker.collapseSlots') as string)
                  : (t('picker.expandSlots') as string)
              }
              onClick={() => setSlotNavExpanded((expanded) => !expanded)}
            >
              {slotNavExpanded ? (
                <ChevronUp data-icon="inline-start" />
              ) : (
                <ChevronDown data-icon="inline-start" />
              )}
            </Button>
          </div>
        </div>

        <div
          className={`creator-picker-tag-nav ${
            tagNavExpanded ? 'expanded' : ''
          }`}
        >
          <div
            className="creator-picker-tags"
            role="group"
            aria-label={t('library.allTags') as string}
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(activeTag === null && 'active')}
              onClick={(event) => handleTagSelect(null, event.currentTarget)}
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
                onClick={(event) => handleTagSelect(tag, event.currentTarget)}
              >
                {tag}
              </Button>
            ))}
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="creator-picker-tag-toggle"
            aria-expanded={tagNavExpanded}
            aria-label={
              tagNavExpanded
                ? (t('picker.collapseTags') as string)
                : (t('picker.expandTags') as string)
            }
            title={
              tagNavExpanded
                ? (t('picker.collapseTags') as string)
                : (t('picker.expandTags') as string)
            }
            onClick={() => setTagNavExpanded((expanded) => !expanded)}
          >
            {tagNavExpanded ? (
              <ChevronUp data-icon="inline-start" />
            ) : (
              <ChevronDown data-icon="inline-start" />
            )}
          </Button>
        </div>

        <StaggeredImageGrid
          className="creator-picker-grid"
          ref={gridRef}
          observeAdditions
        >
          {filteredAssets.map((asset) => {
            const isSelected = isImagePromptAssetSelected(selection, asset);
            return (
              <Button
                key={asset.id}
                type="button"
                variant="ghost"
                className={cn('creator-picker-card', isSelected && 'selected')}
                onClick={() => onSelectAsset(asset)}
              >
                <AssetThumb asset={asset} />
                <span>{asset.title}</span>
                <small>{asset.subtitle}</small>
                <em>{asset.tags.join(' · ')}</em>
                {isSelected && (
                  <i>
                    <Check size={15} />
                    {t('picker.selected')}
                  </i>
                )}
              </Button>
            );
          })}
          {filteredAssets.length === 0 && (
            <div className="creator-picker-empty">
              <Plus size={22} />
              {t('picker.empty')}
            </div>
          )}
        </StaggeredImageGrid>
      </DialogContent>
    </Dialog>
  );
}
