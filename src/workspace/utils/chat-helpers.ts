import type {
  UnifiedMessage,
  TextBlock,
  UnifiedContentBlock
} from '@/types/unified-chat';
import type { Reference } from '@/types';

export const extractTextFromReferences = (refs: Reference[]): string => {
  return refs
    .map((ref) => {
      let content = ref.content || '';

      // 1. 预处理：移除所有 Base64 格式的图片标签，防止干扰 AI 且节省 Token
      // 匹配 <img src="data:image/...;base64,..."> 或类似格式
      content = content.replace(
        /<img[^>]+src=["']data:image\/[^;]+;base64,[^"']+"[^>]*>/gi,
        '[图片内容已剥离]'
      );
      // 匹配 Markdown 格式的图片 ![...](data:image/...;base64,...)
      content = content.replace(
        /!\[.*?\]\(data:image\/[^;]+;base64,[^)]+\)/gi,
        '[图片内容已剥离]'
      );

      // 2. 根据格式提取纯文本
      if (content.trim().startsWith('<')) {
        // HTML 格式
        return content
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      // Markdown 格式
      return content
        .replace(/#{1,6}\s/g, '')
        .replace(/[*_`~]/g, '')
        .replace(/\n+/g, ' ')
        .trim();
    })
    .join('\n\n');
};

import { IMAGE_EDIT_KEYWORDS, IMAGE_EDIT_CONTEXT, NEW_IMAGE_KEYWORDS } from '../constants/chat';
import { createLogger } from '@/utils/logger';

const log = createLogger('chat-helpers');

export type ImageRequestMode =
  | 'fresh_generation'
  | 'reference_guided'
  | 'edit_existing';

export const getMessageText = (msg: UnifiedMessage): string => {
  const textBlock = msg.blocks?.find((b) => b.type === 'text') as
    | TextBlock
    | undefined;
  return textBlock?.content || '';
};

const EXPLICIT_IMAGE_TARGET_CONTEXT =
  /\u8fd9\u5f20|\u4e0a\u4e00\u5f20|\u4e0a\u4e2a\u7248\u672c|\u521a\u624d\u90a3\u5f20|\u4e0a\u4e00\u7248|\u539f\u56fe|\u539f\u6765\u7684\u56fe|\u57fa\u4e8e\u8fd9\u5f20|\u57fa\u4e8e\u4e0a\u4e00\u5f20|\u5728\u8fd9\u5f20\u57fa\u7840\u4e0a|\u5728\u4e0a\u4e00\u5f20\u57fa\u7840\u4e0a|\u4fdd\u6301.*\u4e0d\u53d8/;


function isStructuredJsonPrompt(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return false;
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return (
      !!parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      (
        'prompt' in parsed ||
        'goal' in parsed ||
        'priority' in parsed ||
        'version' in parsed
      )
    );
  } catch {
    return false;
  }
}

export const isLikelyImageEditRequest = (text: string): boolean => {
  if (!text) return false;
  if (NEW_IMAGE_KEYWORDS.test(text)) return false;
  if (isStructuredJsonPrompt(text)) return false;

  const hasEditKeyword = IMAGE_EDIT_KEYWORDS.test(text);
  const hasContextKeyword = IMAGE_EDIT_CONTEXT.test(text) && text.length < 120;
  const hasExplicitTargetContext = EXPLICIT_IMAGE_TARGET_CONTEXT.test(text);

  return hasExplicitTargetContext && (hasEditKeyword || hasContextKeyword);
};

export const resolveImageRequestMode = (options: {
  text: string;
  hasShortcut: boolean;
  hasReferenceImages: boolean;
}): ImageRequestMode => {
  const normalizedText = options.text.trim();

  if (!normalizedText) {
    return options.hasReferenceImages
      ? 'reference_guided'
      : 'fresh_generation';
  }

  if (isStructuredJsonPrompt(normalizedText) || NEW_IMAGE_KEYWORDS.test(normalizedText)) {
    return options.hasReferenceImages
      ? 'reference_guided'
      : 'fresh_generation';
  }

  if (options.hasReferenceImages) {
    return 'reference_guided';
  }

  if (!options.hasShortcut && isLikelyImageEditRequest(normalizedText)) {
    return 'edit_existing';
  }

  return 'fresh_generation';
};

export const cleanupInterruptedGeneratingStates = (
  messages: UnifiedMessage[]
): UnifiedMessage[] => {
  let hasAnyChanges = false;

  const cleanedMessages = messages.map((msg) => {
    if (!msg.blocks || msg.blocks.length === 0) return msg;

    let messageChanged = false;
    const cleanedBlocks = msg.blocks
      .map((block) => {
        // Clear interrupted single-image generation state
        if (block.type === 'image' && block.status === 'generating') {
          messageChanged = true;
          hasAnyChanges = true;
          return {
            ...block,
            status: 'error' as const
          };
        }

        // Clear interrupted batch-image generation state
        if (block.type === 'batch_image' && block.tasks) {
          const hasGeneratingTasks = block.tasks.some(
            (t) => t.status === 'generating' || t.status === 'pending'
          );
          if (hasGeneratingTasks) {
            messageChanged = true;
            hasAnyChanges = true;
            const cleanedTasks = block.tasks.map((task) => {
              if (task.status === 'generating' || task.status === 'pending') {
                return {
                  ...task,
                  status: 'error' as const,
                  errorMessage: task.errorMessage || 'Generation interrupted, please retry'
                };
              }
              return task;
            });
            const completedCount = cleanedTasks.filter(
              (t) => t.status === 'done'
            ).length;
            const failedCount = cleanedTasks.filter(
              (t) => t.status === 'error'
            ).length;
            return {
              ...block,
              tasks: cleanedTasks,
              completedCount,
              failedCount
            };
          }
        }

        if (block.type === 'status') {
          const statusValue = 'status' in block ? block.status : '';
          if (
            statusValue === 'generating' ||
            statusValue === 'analyzing' ||
            statusValue === 'searching' ||
            statusValue === 'executing'
          ) {
            messageChanged = true;
            hasAnyChanges = true;
            return {
              type: 'text' as const,
              content: 'Generation interrupted, please resend the message'
            } as TextBlock;
          }
          return null;
        }

        return block;
      })
      .filter(
        (block): block is NonNullable<typeof block> => block !== null
      ) as UnifiedContentBlock[];

    if (!messageChanged) {
      return msg;
    }

    const finalBlocks =
      cleanedBlocks.length > 0
        ? cleanedBlocks
        : [
            {
              type: 'text' as const,
              content: 'Generation interrupted, please resend the message'
            }
          ];
    return { ...msg, blocks: finalBlocks as UnifiedContentBlock[] };
  });

  if (hasAnyChanges) {
    log.info('[ChatHelpers] Cleaned up interrupted generating states');
  }

  return cleanedMessages;
};
