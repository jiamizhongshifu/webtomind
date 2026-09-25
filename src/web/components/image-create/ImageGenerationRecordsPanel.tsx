import { useTranslation } from 'react-i18next';
import type {
  VisualImageHistoryItem,
  VisualVideoGenerationItem
} from '@/services/agent-api';
import {
  GenerationRecordsRail,
  type GenerationRecordTask,
  type VisualGenerationHistoryItem
} from './GenerationRecordsRail';
import {
  PromptCasesPanel,
  type PromptCasesPanelProps
} from './PromptCasesPanel';

interface ImageGenerationRecordsPanelProps {
  showGenerationRecords: boolean;
  tasks: GenerationRecordTask[];
  historyItems: VisualGenerationHistoryItem[];
  historyTotal: number;
  activeGenerationId: string | null;
  dateLocale: string;
  promptCasesProps: PromptCasesPanelProps;
  onPreview: (item: VisualImageHistoryItem) => void;
  onPreviewVideo?: (item: VisualVideoGenerationItem) => void;
  onRegenerate: (item: VisualImageHistoryItem) => void;
  onFavorite: (item: VisualImageHistoryItem) => void;
  onDownload: (item: VisualImageHistoryItem) => void;
  onViewMoreHistory: () => void;
}

function isImageHistoryItem(
  item: VisualGenerationHistoryItem
): item is VisualImageHistoryItem {
  return 'imageUrl' in item && typeof item.imageUrl === 'string';
}

function isVideoHistoryItem(
  item: VisualGenerationHistoryItem
): item is VisualVideoGenerationItem {
  return 'videoUrl' in item && typeof item.videoUrl === 'string';
}

export function ImageGenerationRecordsPanel({
  showGenerationRecords,
  tasks,
  historyItems,
  historyTotal,
  activeGenerationId,
  dateLocale,
  promptCasesProps,
  onPreview,
  onPreviewVideo,
  onRegenerate,
  onFavorite,
  onDownload,
  onViewMoreHistory
}: ImageGenerationRecordsPanelProps) {
  const { t } = useTranslation('imageCreate');

  return (
    <aside
      className="creator-case-rail"
      aria-label={
        showGenerationRecords
          ? (t('historyRail.title') as string)
          : 'Prompt Cases'
      }
    >
      {showGenerationRecords ? (
        <GenerationRecordsRail
          tasks={tasks}
          historyItems={historyItems}
          historyTotal={historyTotal}
          activeGenerationId={activeGenerationId}
          dateLocale={dateLocale}
          onPreview={(item) => {
            if (isImageHistoryItem(item)) onPreview(item);
            if (isVideoHistoryItem(item)) onPreviewVideo?.(item);
          }}
          onRegenerate={(item) => {
            if (isImageHistoryItem(item)) onRegenerate(item);
          }}
          onFavorite={(item) => {
            if (isImageHistoryItem(item)) onFavorite(item);
          }}
          onDownload={onDownload}
          onViewMoreHistory={onViewMoreHistory}
        />
      ) : (
        <PromptCasesPanel {...promptCasesProps} />
      )}
    </aside>
  );
}
