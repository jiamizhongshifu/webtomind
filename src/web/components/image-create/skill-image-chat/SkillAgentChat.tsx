import {
  useCallback,
  useMemo
} from 'react';
import {
  AssistantRuntimeProvider,
  MessagePrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type AppendMessage,
  type ExternalStoreMessageConverter,
  type TextMessagePart
} from '@assistant-ui/react';
import { Download } from 'lucide-react';
import {
  extractSkillResultSummary,
  type SkillChatImage,
  type SkillChatMessage
} from './constants';

/**
 * Agent 图像创作（Skill 对话）结果区。
 *
 * 对话渲染采用 GitHub 成熟开源方案 @assistant-ui/react：
 * - useExternalStoreRuntime：将平台自有 SSE 状态桥接进 assistant-ui 运行时
 * - ThreadPrimitive / MessagePrimitive：消息列表、气泡、流式状态、自动滚动
 * 出图仍走平台通道（executeGenerateImage），图片预览/下载复用平台交互。
 */

export interface SkillAgentChatProps {
  messages: SkillChatMessage[];
  /** 正在流式输出的 assistant 文本（未闭合） */
  streamingText: string;
  images: SkillChatImage[];
  running: boolean;
  error?: string;
  /** 通过对话区发起新的生成（当前输入框在外部，预留 Composer 入口） */
  onSend?: (prompt: string) => void;
  /** 取消当前生成 */
  onCancel?: () => void;
  /** 点击生成图打开预览（复用平台出图预览交互） */
  onPreviewImage?: (image: SkillChatImage, index: number) => void;
  /** 下载生成图 */
  onDownloadImage?: (image: SkillChatImage) => void;
}

function extractAppendMessageText(message: AppendMessage): string {
  const content = message.content;
  if (typeof content === 'string') return content;
  return (content as readonly TextMessagePart[])
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

/** 桥接消息：仅承载平台自有对话状态，交由 convertMessage 转换为 assistant-ui 格式 */
interface SkillThreadMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

/** 把平台自有对话状态组装为桥接消息列表（含流式占位消息） */
function buildThreadMessages(
  messages: SkillChatMessage[],
  streamingText: string,
  running: boolean
): SkillThreadMessage[] {
  const result: SkillThreadMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    result.push({
      role: message.role,
      id: `skill-${message.role}-${i}`,
      content: message.content
    });
  }
  if (running) {
    result.push({
      role: 'assistant',
      id: 'skill-assistant-streaming',
      content: streamingText
    });
  }
  return result;
}

/**
 * Agent 图像创作（Skill 对话）结果区：
 * 基于 @assistant-ui/react 渲染用户/Agent 对话 + 平台出图结果。
 * 使用即扣积分，此处不展示积分估算。
 */
function SkillAgentChatInner({
  messages,
  streamingText,
  images,
  running,
  error,
  onSend,
  onCancel,
  onPreviewImage,
  onDownloadImage
}: SkillAgentChatProps) {
  const threadMessages = useMemo(
    () => buildThreadMessages(messages, streamingText, running),
    [messages, streamingText, running]
  );

  const handleNew = useCallback(
    async (message: AppendMessage) => {
      const text = extractAppendMessageText(message).trim();
      if (text) onSend?.(text);
    },
    [onSend]
  );

  const handleCancel = useCallback(async () => {
    onCancel?.();
  }, [onCancel]);

  const convertMessage = useCallback<
    ExternalStoreMessageConverter<SkillThreadMessage>
  >(
    (message, idx) => {
      if (message.role === 'user') {
        return { role: 'user', content: message.content, id: message.id };
      }
      const isStreaming =
        running && idx === threadMessages.length - 1;
      const summary = extractSkillResultSummary(message.content);
      return {
        role: 'assistant',
        content: summary || (isStreaming ? '正在生成图片…' : ''),
        id: message.id
      };
    },
    [running, threadMessages.length]
  );

  const runtime = useExternalStoreRuntime<SkillThreadMessage>({
    messages: threadMessages,
    isRunning: running,
    onNew: handleNew,
    onCancel: handleCancel,
    convertMessage
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="skill-image-chat-result">
        <ThreadPrimitive.Viewport
          className="skill-image-chat-viewport"
          autoScroll
        >
          <ThreadPrimitive.Messages>
            {({ message }) => (
              <MessagePrimitive.Root
                className={`skill-image-chat-bubble is-${message.role}`}
              >
                <span className="skill-image-chat-bubble-role">
                  {message.role === 'user' ? '你' : 'Agent'}
                </span>
                <div className="skill-image-chat-bubble-body whitespace-pre-wrap">
                  <MessagePrimitive.Content />
                </div>
              </MessagePrimitive.Root>
            )}
          </ThreadPrimitive.Messages>

          {images.length > 0 && (
            <div className="skill-image-chat-images">
              {images.map((image, index) => (
                <div key={index} className="skill-image-chat-image">
                  <button
                    type="button"
                    className="skill-image-chat-image-trigger"
                    onClick={() => onPreviewImage?.(image, index)}
                    aria-label={`预览生成图片 ${index + 1}`}
                  >
                    <img
                      src={image.url}
                      alt={`生成图片 ${index + 1}`}
                      loading={index === 0 ? 'eager' : 'lazy'}
                      decoding="async"
                    />
                  </button>
                  {onDownloadImage && (
                    <button
                      type="button"
                      className="skill-image-chat-image-download"
                      onClick={() => onDownloadImage(image)}
                      aria-label={`下载生成图片 ${index + 1}`}
                    >
                      <Download aria-hidden size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </ThreadPrimitive.Viewport>

        {error && (
          <div className="skill-image-chat-error" role="alert">
            {error}
          </div>
        )}
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

/**
 * Agent 图像创作（Skill 对话）结果区入口：
 * 无内容且未在生成时返回 null，避免渲染空对话卡片。
 */
export function SkillAgentChat(props: SkillAgentChatProps) {
  const { messages, streamingText, images, running, error } = props;
  const hasContent =
    messages.length > 0 || Boolean(streamingText) || images.length > 0;

  if (!hasContent && !running && !error) return null;
  return <SkillAgentChatInner {...props} />;
}
