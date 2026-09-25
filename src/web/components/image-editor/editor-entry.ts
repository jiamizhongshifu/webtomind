import type { VisualImageHistoryItem } from '@/services/agent-api';
import type { CreationSessionHistoryItem } from '../image-create/useImageSessionConversation';

export interface ImageEditorEntryState {
  generationId: string;
  imageUrl: string;
  label?: string;
  initialTool?: 'region';
}

/**
 * 从会话结果或资产库图片生成图片编辑器的入口状态。
 * 视频项返回 null；图片项用 generationId 作为编辑参考来源。
 */
export function createImageEditorEntryState(
  item: VisualImageHistoryItem | CreationSessionHistoryItem
): ImageEditorEntryState | null {
  if (!item || typeof item !== 'object') return null;
  if ('videoUrl' in item) return null;
  const generationId = item.id;
  if (!generationId) return null;
  return {
    generationId,
    imageUrl: item.previewUrl || item.imageUrl || item.thumbnailUrl || '',
    label: item.prompt?.slice(0, 40) || undefined
  };
}
