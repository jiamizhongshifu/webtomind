import { Check, Loader2, RefreshCw } from 'lucide-react';
import { ActionSheet, Button } from '@/shared/ui';

type GalleryFilterSheetProps = {
  open: boolean;
  modelFilter: string;
  modelOptions: string[];
  refreshDisabled?: boolean;
  refreshing?: boolean;
  onModelFilterChange: (value: string) => void;
  onRefresh: () => void;
  onClose: () => void;
};

export function GalleryFilterSheet({
  open,
  modelFilter,
  modelOptions,
  refreshDisabled = false,
  refreshing = false,
  onModelFilterChange,
  onRefresh,
  onClose
}: GalleryFilterSheetProps) {
  const selectModel = (value: string) => {
    onModelFilterChange(value);
    onClose();
  };

  return (
    <ActionSheet
      open={open}
      title="筛选资产库"
      description="按生成模型缩小结果范围，或重新载入最新图片与视频。"
      ariaLabel="资产库筛选"
      closeLabel="关闭"
      className="create-gallery-filter-sheet"
      onClose={onClose}
    >
      <div
        className="create-gallery-filter-sheet__models"
        role="group"
        aria-label="模型"
      >
        {[
          { value: 'all', label: '全部模型' },
          ...modelOptions.map((model) => ({ value: model, label: model }))
        ].map((option) => {
          const selected = modelFilter === option.value;
          return (
            <Button
              key={option.value}
              type="button"
              variant="ghost"
              aria-pressed={selected}
              trailingIcon={selected ? <Check /> : undefined}
              onClick={() => selectModel(option.value)}
            >
              {option.label}
            </Button>
          );
        })}
      </div>
      <Button
        type="button"
        variant="outline"
        leadingIcon={
          refreshing ? <Loader2 className="creator-spin-icon" /> : <RefreshCw />
        }
        disabled={refreshDisabled}
        onClick={() => {
          onClose();
          onRefresh();
        }}
      >
        刷新资产库
      </Button>
    </ActionSheet>
  );
}
