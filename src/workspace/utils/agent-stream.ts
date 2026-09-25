import type {
  UnifiedContentBlock,
  ImageBlock,
  BatchImageBlock,
  BatchImageTaskStatus
} from '@/types/unified-chat';

export interface SmartChatChunkPayload {
  action: string;
  blockType?: 'status' | 'search' | 'text' | 'image' | 'batch_image';
  runId?: string;
  stepId?: number;
  timestamp?: number;
  retryFromStepId?: number;
  done?: boolean;
  status?: string;
  statusMessage?: string;
  query?: string;
  sources?: Array<{ title: string; url: string; snippet?: string }>;
  chunk?: string;
  imageUrl?: string;
  imageStatus?: string;
  batchTasks?: Array<{
    id: string;
    index: number;
    title: string;
    status: BatchImageTaskStatus;
    imageUrl?: string;
    thumbnailUrl?: string;
    errorMessage?: string;
  }>;
  batchTaskId?: string;
  batchTaskStatus?: BatchImageTaskStatus;
  batchTaskImageUrl?: string;
  batchTaskError?: string;
  totalCount?: number;
  completedCount?: number;
  failedCount?: number;
}

function findLastIdx(
  arr: UnifiedContentBlock[],
  predicate: (b: UnifiedContentBlock) => boolean
): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) return i;
  }
  return -1;
}

export function applySmartChatChunkToBlocks(
  blocks: UnifiedContentBlock[],
  message: SmartChatChunkPayload
): { blocks: UnifiedContentBlock[]; imageUrl?: string } {
  const { blockType, done } = message;

  switch (blockType) {
    case 'status': {
      const statusValue = (message.status || 'analyzing') as
        | 'analyzing'
        | 'searching'
        | 'generating'
        | 'executing'
        | 'done';
      const statusBlock = {
        type: 'status' as const,
        status: statusValue,
        message: message.statusMessage || '',
        runId: message.runId,
        stepId: message.stepId,
        timestamp: message.timestamp,
        retryFromStepId: message.retryFromStepId
      };
      const lastIdx = findLastIdx(blocks, (b) => b.type === 'status');
      if (lastIdx >= 0 && !done) {
        const newBlocks = [...blocks];
        newBlocks[lastIdx] = statusBlock;
        return { blocks: newBlocks };
      }
      return { blocks: [...blocks, statusBlock] };
    }

    case 'search': {
      return {
        blocks: [
          ...blocks,
          {
            type: 'search' as const,
            query: message.query || '',
            sources: message.sources || [],
            runId: message.runId,
            stepId: message.stepId,
            timestamp: message.timestamp,
            retryFromStepId: message.retryFromStepId
          }
        ]
      };
    }

    case 'text': {
      const chunk = message.chunk || '';
      const lastTextIdx = findLastIdx(blocks, (b) => b.type === 'text');
      if (lastTextIdx >= 0) {
        const newBlocks = [...blocks];
        const lastText = newBlocks[lastTextIdx] as {
          type: 'text';
          content: string;
        };
        newBlocks[lastTextIdx] = {
          ...lastText,
          content: lastText.content + chunk
        };
        return { blocks: newBlocks };
      }
      return { blocks: [...blocks, { type: 'text' as const, content: chunk }] };
    }

    case 'image': {
      const imageStatusValue = (message.imageStatus || 'generating') as
        | 'generating'
        | 'done'
        | 'error';
      const imageBlock: ImageBlock = {
        type: 'image' as const,
        imageUrl: message.imageUrl || '',
        status: imageStatusValue
      };

      const lastImgIdx = findLastIdx(blocks, (b) => b.type === 'image');
      if (lastImgIdx >= 0) {
        const existing = blocks[lastImgIdx] as ImageBlock;
        if (
          existing.status === imageBlock.status &&
          existing.imageUrl === imageBlock.imageUrl
        ) {
          return { blocks, imageUrl: message.imageUrl };
        }
      }

      let filteredBlocks = blocks;
      if (message.imageStatus === 'done' && lastImgIdx < 0) {
        filteredBlocks = blocks.filter(
          (b) =>
            !(
              b.type === 'status' &&
              'status' in b &&
              b.status === 'generating'
            )
        );
      }

      if (lastImgIdx >= 0) {
        const newBlocks = [...filteredBlocks];
        newBlocks[lastImgIdx] = imageBlock;
        return { blocks: newBlocks, imageUrl: message.imageUrl };
      }
      return {
        blocks: [...filteredBlocks, imageBlock],
        imageUrl: message.imageUrl
      };
    }

    case 'batch_image': {
      const findBatchBlock = (arr: UnifiedContentBlock[]): number => {
        for (let i = arr.length - 1; i >= 0; i--) {
          if (arr[i].type === 'batch_image') return i;
        }
        return -1;
      };

      const batchBlockIdx = findBatchBlock(blocks);

      if (message.batchTasks && message.batchTasks.length > 0) {
        const batchBlock: BatchImageBlock = {
          type: 'batch_image' as const,
          tasks: message.batchTasks,
          totalCount: message.totalCount || message.batchTasks.length,
          completedCount: message.completedCount || 0,
          failedCount: message.failedCount || 0
        };
        if (batchBlockIdx >= 0) {
          const newBlocks = [...blocks];
          newBlocks[batchBlockIdx] = batchBlock;
          return { blocks: newBlocks };
        }
        return { blocks: [...blocks, batchBlock] };
      }

      if (message.batchTaskId && batchBlockIdx >= 0) {
        const existingBatch = blocks[batchBlockIdx] as BatchImageBlock;
        const updatedTasks = existingBatch.tasks.map((task) => {
          if (task.id === message.batchTaskId) {
            return {
              ...task,
              status: message.batchTaskStatus || task.status,
              imageUrl: message.batchTaskImageUrl || task.imageUrl,
              errorMessage: message.batchTaskError || task.errorMessage
            };
          }
          return task;
        });

        const completedCount = updatedTasks.filter(
          (t) => t.status === 'done'
        ).length;
        const failedCount = updatedTasks.filter(
          (t) => t.status === 'error'
        ).length;

        const updatedBatch: BatchImageBlock = {
          ...existingBatch,
          tasks: updatedTasks,
          completedCount,
          failedCount
        };

        const newBlocks = [...blocks];
        newBlocks[batchBlockIdx] = updatedBatch;
        return { blocks: newBlocks };
      }

      return { blocks };
    }

    default:
      return { blocks };
  }
}
