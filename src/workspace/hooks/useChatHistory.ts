import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createLogger } from '@/utils/logger';
import { startTimer, endTimer } from '@/utils/perf-monitor';
import {
  getAllConversations,
  getConversation,
  saveConversation,
  updateConversation,
  deleteConversation as deleteConversationApi,
  type StoredMessage
} from '@/services/workspace-api';
import type { ConversationListItem } from '@/services/workspace-api';
import type { ChatConversation } from '@/services/database';
import type { UnifiedMessage, UnifiedContentBlock } from '@/types/unified-chat';
import { uploadDataUrlFile } from '@/services/image-storage';
import { cleanupInterruptedGeneratingStates } from '../utils/chat-helpers';

const log = createLogger('useChatHistory');
const PRELOAD_COUNT = 5;
const CONV_CACHE_TTL = 30 * 60 * 1000;
const CONV_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const INLINE_MEDIA_RETRY_COOLDOWN_MS = 5 * 60 * 1000;
const CHAT_HISTORY_REQUEST_TIMEOUT_MS = 8000;
const AUTO_SAVE_DEBOUNCE_MS = 2500;

export interface UseChatHistoryProps {
  currentProjectId: string | null | undefined;
  enabled?: boolean;
  unifiedMessages: UnifiedMessage[];
  setUnifiedMessages: React.Dispatch<React.SetStateAction<UnifiedMessage[]>>;
  resetSession: () => void;
  isExtensionEnv: () => boolean;
  setScrollToBottomTrigger: React.Dispatch<React.SetStateAction<number>>;
  onAutoSaveError?: (error: unknown) => void;
}

function getBlockPersistenceSignature(block: UnifiedContentBlock): string {
  const status =
    'status' in block && typeof block.status === 'string'
      ? block.status
      : 'none';
  const textLength =
    'content' in block && typeof block.content === 'string'
      ? block.content.length
      : 0;
  const imageFlag =
    'imageUrl' in block && typeof block.imageUrl === 'string' && block.imageUrl
      ? 'img'
      : 'noimg';
  const tasksSignature =
    'tasks' in block && Array.isArray(block.tasks)
      ? block.tasks
          .map((task) => {
            const taskImageFlag =
              'imageUrl' in task &&
              typeof task.imageUrl === 'string' &&
              task.imageUrl
                ? 'img'
                : 'noimg';
            const errorLength =
              'errorMessage' in task && typeof task.errorMessage === 'string'
                ? task.errorMessage.length
                : 0;
            return [task.status, taskImageFlag, errorLength].join(':');
          })
          .join(',')
      : '';

  return [block.type, status, textLength, imageFlag, tasksSignature].join(':');
}

function getMessagePersistenceSignature(messages: UnifiedMessage[]): string {
  return messages
    .map((message) => {
      const messageImageFlag = message.imageUrl ? 'img' : 'noimg';
      const blockSignature = (message.blocks || [])
        .map(getBlockPersistenceSignature)
        .join('|');
      return [message.id, message.role, messageImageFlag, blockSignature].join(
        '~'
      );
    })
    .join('||');
}

function getInlineMediaCacheKey(dataUrl: string): string {
  return [dataUrl.slice(0, 64), dataUrl.length, dataUrl.slice(-32)].join(':');
}

function isInlineMediaUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:');
}

function addInlineMediaCacheKey(value: unknown, collector: Set<string>): void {
  if (isInlineMediaUrl(value)) {
    collector.add(getInlineMediaCacheKey(value));
  }
}

function collectInlineMediaCacheKeysFromMessage(
  message: UnifiedMessage,
  collector: Set<string>
): void {
  addInlineMediaCacheKey(message.imageUrl, collector);
  addInlineMediaCacheKey(message.thumbnailUrl, collector);

  message.imageReferences?.forEach((imageRef) => {
    addInlineMediaCacheKey(imageRef.thumbnailUrl, collector);
  });

  (message.blocks || []).forEach((block) => {
    if ('imageUrl' in block) {
      addInlineMediaCacheKey(block.imageUrl, collector);
    }
    if ('thumbnailUrl' in block) {
      addInlineMediaCacheKey(block.thumbnailUrl, collector);
    }
    if (block.type === 'batch_image') {
      block.tasks.forEach((task) => {
        addInlineMediaCacheKey(task.imageUrl, collector);
        addInlineMediaCacheKey(task.thumbnailUrl, collector);
      });
    }
  });
}

function getInlineMediaSignatureForMessage(message: UnifiedMessage): string {
  const cacheKeys = new Set<string>();
  collectInlineMediaCacheKeysFromMessage(message, cacheKeys);
  return Array.from(cacheKeys).sort().join('|');
}

function getInlineMediaSignature(messages: UnifiedMessage[]): string {
  const cacheKeys = new Set<string>();
  messages.forEach((message) =>
    collectInlineMediaCacheKeysFromMessage(message, cacheKeys)
  );
  return Array.from(cacheKeys).sort().join('|');
}

function collectInlineMediaCacheKeys(messages: UnifiedMessage[]): Set<string> {
  const cacheKeys = new Set<string>();
  messages.forEach((message) =>
    collectInlineMediaCacheKeysFromMessage(message, cacheKeys)
  );
  return cacheKeys;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function pruneInlineMediaCacheMaps(
  messages: UnifiedMessage[],
  uploadedMediaCache: Map<string, string>,
  failedMediaCache: Map<string, number>
): void {
  const activeCacheKeys = collectInlineMediaCacheKeys(messages);
  for (const cacheKey of uploadedMediaCache.keys()) {
    if (!activeCacheKeys.has(cacheKey)) {
      uploadedMediaCache.delete(cacheKey);
    }
  }
  for (const cacheKey of failedMediaCache.keys()) {
    if (!activeCacheKeys.has(cacheKey)) {
      failedMediaCache.delete(cacheKey);
    }
  }
}

function pruneProcessedMessageMediaCache(
  messages: UnifiedMessage[],
  processedMessageMediaRef: Map<string, string>
): void {
  const activeMessageIds = new Set(messages.map((message) => message.id));
  for (const messageId of processedMessageMediaRef.keys()) {
    if (!activeMessageIds.has(messageId)) {
      processedMessageMediaRef.delete(messageId);
    }
  }
}

async function persistInlineMediaUrl(
  value: string | undefined,
  uploadedMediaCache: Map<string, string>,
  failedMediaCache: Map<string, number>
): Promise<string | undefined> {
  if (!isInlineMediaUrl(value)) {
    return value;
  }

  const cacheKey = getInlineMediaCacheKey(value);
  const cachedUrl = uploadedMediaCache.get(cacheKey);
  if (cachedUrl) {
    return cachedUrl;
  }

  const lastFailedAt = failedMediaCache.get(cacheKey);
  if (
    typeof lastFailedAt === 'number' &&
    Date.now() - lastFailedAt < INLINE_MEDIA_RETRY_COOLDOWN_MS
  ) {
    return value;
  }

  try {
    const uploadedUrl = await uploadDataUrlFile(value);
    if (uploadedUrl !== value) {
      uploadedMediaCache.set(cacheKey, uploadedUrl);
      failedMediaCache.delete(cacheKey);
      return uploadedUrl;
    }
    failedMediaCache.set(cacheKey, Date.now());
    return value;
  } catch (error) {
    failedMediaCache.set(cacheKey, Date.now());
    log.warn(
      '[ChatHistory] Failed to persist inline media before conversation save:',
      error
    );
    return value;
  }
}

async function persistMessageMedia(
  message: UnifiedMessage,
  uploadedMediaCache: Map<string, string>,
  failedMediaCache: Map<string, number>
): Promise<UnifiedMessage> {
  const nextMessage: UnifiedMessage = {
    ...message,
    imageUrl: await persistInlineMediaUrl(
      message.imageUrl,
      uploadedMediaCache,
      failedMediaCache
    ),
    thumbnailUrl: await persistInlineMediaUrl(
      message.thumbnailUrl,
      uploadedMediaCache,
      failedMediaCache
    )
  };

  if (message.imageReferences?.length) {
    nextMessage.imageReferences = await Promise.all(
      message.imageReferences.map(async (imageRef) => ({
        ...imageRef,
        thumbnailUrl: await persistInlineMediaUrl(
          imageRef.thumbnailUrl,
          uploadedMediaCache,
          failedMediaCache
        )
      }))
    );
  }

  nextMessage.blocks = await Promise.all(
    (message.blocks || []).map(async (block) => {
      if (block.type === 'image') {
        return {
          ...block,
          imageUrl:
            (await persistInlineMediaUrl(
              block.imageUrl,
              uploadedMediaCache,
              failedMediaCache
            )) || block.imageUrl,
          thumbnailUrl: await persistInlineMediaUrl(
            block.thumbnailUrl,
            uploadedMediaCache,
            failedMediaCache
          )
        };
      }

      if (block.type === 'batch_image') {
        return {
          ...block,
          tasks: await Promise.all(
            block.tasks.map(async (task) => ({
              ...task,
              imageUrl: await persistInlineMediaUrl(
                task.imageUrl,
                uploadedMediaCache,
                failedMediaCache
              ),
              thumbnailUrl: await persistInlineMediaUrl(
                task.thumbnailUrl,
                uploadedMediaCache,
                failedMediaCache
              )
            }))
          )
        };
      }

      return block;
    })
  );

  return nextMessage;
}

async function persistConversationMedia(
  messages: UnifiedMessage[],
  uploadedMediaCache: Map<string, string>,
  failedMediaCache: Map<string, number>,
  processedMessageMediaRef: Map<string, string>
): Promise<UnifiedMessage[]> {
  return Promise.all(
    messages.map(async (message) => {
      const inlineSignature = getInlineMediaSignatureForMessage(message);
      if (!inlineSignature) {
        processedMessageMediaRef.delete(message.id);
        return message;
      }

      if (processedMessageMediaRef.get(message.id) === inlineSignature) {
        return message;
      }

      const persistedMessage = await persistMessageMedia(
        message,
        uploadedMediaCache,
        failedMediaCache
      );
      processedMessageMediaRef.set(
        message.id,
        getInlineMediaSignatureForMessage(persistedMessage)
      );
      return persistedMessage;
    })
  );
}
export function useChatHistory({
  currentProjectId,
  enabled = true,
  unifiedMessages,
  setUnifiedMessages,
  resetSession,
  isExtensionEnv,
  setScrollToBottomTrigger,
  onAutoSaveError
}: UseChatHistoryProps) {
  // Conversation history state
  const [viewMode, setViewMode] = useState<'chat' | 'history'>('chat');
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(null);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  // In-memory conversation cache
  const conversationCacheRef = useRef<Map<string, UnifiedMessage[]>>(new Map());

  const isSwitchingConversationRef = useRef(false);
  const lastInitProjectIdRef = useRef<string | null | undefined>(undefined);
  const isRestoredFromCacheRef = useRef(false);
  const unifiedMessagesRef = useRef<UnifiedMessage[]>([]);
  const currentConversationIdRef = useRef<string | null>(null);
  const prevMsgCountRef = useRef(0);
  const uploadedMediaCacheRef = useRef<Map<string, string>>(new Map());
  const failedMediaCacheRef = useRef<Map<string, number>>(new Map());
  const processedMessageMediaRef = useRef<Map<string, string>>(new Map());
  const lastSavedPersistenceSignatureRef = useRef<string>('');
  const lastProcessedInlineMediaSignatureRef = useRef<string>('');
  const inlineMediaSignatureRef = useRef('');
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef(false);

  // Conversation cache keys
  const CONV_LIST_CACHE_KEY = `webtomind_conversations_cache_${currentProjectId || 'default'}`;
  const LAST_CONV_CACHE_KEY = `webtomind_last_conversation_cache_${currentProjectId || 'default'}`;

  useEffect(() => {
    unifiedMessagesRef.current = unifiedMessages;
  }, [unifiedMessages]);
  // Keep current conversation id in a ref
  useEffect(() => {
    currentConversationIdRef.current = currentConversationId;
  }, [currentConversationId]);

  // Background preload recent conversations
  const preloadRecentConversations = useCallback(async (ids: string[]) => {
    const preloadIds = ids.slice(0, PRELOAD_COUNT);
    if (preloadIds.length === 0) return;

    log.info(
      `[ChatHistory] Starting preload for ${preloadIds.length} conversations`
    );
    startTimer('preloadConversations');

    await Promise.allSettled(
      preloadIds.map(async (id) => {
        if (conversationCacheRef.current.has(id)) return;
        try {
          const data = await getConversation(id);
          const loadedMessages: UnifiedMessage[] = (data.messages || []).map(
            (m: StoredMessage) => {
              if (m.blocks && m.blocks.length > 0) {
                return {
                  id: m.id,
                  role: m.role,
                  blocks: m.blocks as UnifiedContentBlock[],
                  timestamp: m.timestamp,
                  sourceMode: 'ask' as const,
                  imageUrl: m.imageUrl,
                  references: m.references as UnifiedMessage['references'],
                  imageReferences:
                    m.imageReferences as UnifiedMessage['imageReferences'],
                  shortcut: m.shortcut as UnifiedMessage['shortcut']
                };
              }
              const blocks: UnifiedContentBlock[] = [];
              if (typeof m.content === 'string' && m.content.trim()) {
                blocks.push({ type: 'text', content: m.content });
              }
              if (m.imageUrl) {
                blocks.push({
                  type: 'image',
                  imageUrl: m.imageUrl,
                  status: 'done'
                });
              }
              if (blocks.length === 0) {
                blocks.push({ type: 'text', content: '' });
              }
              return {
                id: m.id,
                role: m.role,
                blocks,
                timestamp: m.timestamp,
                sourceMode: 'ask' as const,
                imageUrl: m.imageUrl,
                references: m.references as UnifiedMessage['references'],
                imageReferences:
                  m.imageReferences as UnifiedMessage['imageReferences'],
                shortcut: m.shortcut as UnifiedMessage['shortcut']
              };
            }
          );
          const cleanedMessages =
            cleanupInterruptedGeneratingStates(loadedMessages);
          conversationCacheRef.current.set(id, cleanedMessages);
        } catch (err) {
          log.warn('[ChatHistory] Preload failed for:', id, err);
        }
      })
    );
    endTimer('preloadConversations');
  }, []);

  const saveCurrentConversation = useCallback(
    async (options: { skipCacheUpdate?: boolean; title?: string } = {}) => {
      if (saveInFlightRef.current) {
        pendingSaveRef.current = true;
        return;
      }

      const msgs = unifiedMessagesRef.current;
      const cachedMessages = msgs.map((m) => {
        const { ...clonedObj } = m;
        return clonedObj;
      });

      if (!options.skipCacheUpdate && cachedMessages.length > 0) {
        try {
          localStorage.setItem(
            LAST_CONV_CACHE_KEY,
            JSON.stringify({
              id: currentConversationIdRef.current,
              messages: cachedMessages,
              timestamp: Date.now(),
              isTemporary: !currentConversationIdRef.current
            })
          );
        } catch {
          // Ignore local cache persistence failures.
        }
      }

      if (isSwitchingConversationRef.current) return;
      if (msgs.length === 0) return;
      if (isExtensionEnv()) return;

      saveInFlightRef.current = true;
      try {
        const firstUserMessage = msgs.find((m) => m.role === 'user');
        let autoTitle = 'New Chat';
        if (options.title) {
          autoTitle = options.title;
        } else if (firstUserMessage && firstUserMessage.blocks) {
          const textBlock = firstUserMessage.blocks.find(
            (b) => b.type === 'text'
          ) as { type: 'text'; content: string } | undefined;
          if (textBlock && textBlock.content) {
            const text = textBlock.content.trim();
            autoTitle = text.length > 20 ? text.substring(0, 20) + '...' : text;
          }
        }

        const convId = currentConversationIdRef.current;
        let savedId = convId;
        const shouldPersistInlineMedia =
          inlineMediaSignatureRef.current.length > 0 &&
          inlineMediaSignatureRef.current !==
            lastProcessedInlineMediaSignatureRef.current;
        const persistedMessages = shouldPersistInlineMedia
          ? await persistConversationMedia(
              cachedMessages,
              uploadedMediaCacheRef.current,
              failedMediaCacheRef.current,
              processedMessageMediaRef.current
            )
          : cachedMessages;
        const cachedSignature = getMessagePersistenceSignature(cachedMessages);
        const persistedSignature =
          getMessagePersistenceSignature(persistedMessages);
        if (persistedSignature !== cachedSignature) {
          unifiedMessagesRef.current = persistedMessages;
          setUnifiedMessages(persistedMessages);
          if (currentConversationIdRef.current) {
            conversationCacheRef.current.set(
              currentConversationIdRef.current,
              persistedMessages
            );
          }
        }

        if (
          savedId &&
          !options.title &&
          !shouldPersistInlineMedia &&
          persistedSignature === lastSavedPersistenceSignatureRef.current
        ) {
          return;
        }

        if (savedId) {
          await updateConversation(savedId, {
            title: options.title || autoTitle,
            messages: persistedMessages as unknown as StoredMessage[]
          });
        } else {
          const savedData = await saveConversation({
            title: autoTitle,
            messages: persistedMessages as unknown as StoredMessage[],
            project_id: currentProjectId || undefined
          });
          savedId = savedData.id;
        }

        if (!convId && savedId) {
          setCurrentConversationId(savedId);
          if (!options.skipCacheUpdate) {
            try {
              localStorage.setItem(
                LAST_CONV_CACHE_KEY,
                JSON.stringify({
                  id: savedId,
                  messages: persistedMessages,
                  timestamp: Date.now(),
                  isTemporary: false
                })
              );
            } catch {
              // Ignore local cache persistence failures.
            }
          }

          setConversations((prev) => {
            const exists = prev.some((c) => c.id === savedId);
            if (exists) {
              return prev.map((c) =>
                c.id === savedId
                  ? {
                      ...c,
                      title: autoTitle,
                      messageCount: msgs.length,
                      updatedAt: Date.now()
                    }
                  : c
              );
            }
            return [
              {
                id: savedId,
                title: autoTitle,
                messages: [],
                messageCount: msgs.length,
                createdAt: Date.now(),
                updatedAt: Date.now()
              },
              ...prev
            ];
          });
        } else if (convId) {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === convId
                ? {
                    ...c,
                    messageCount: msgs.length,
                    updatedAt: Date.now(),
                    title: options.title || c.title
                  }
                : c
            )
          );
        }

        lastSavedPersistenceSignatureRef.current = persistedSignature;
        lastProcessedInlineMediaSignatureRef.current =
          getInlineMediaSignature(persistedMessages);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          log.error('[ChatHistory] Save conversation failed:', error);
          onAutoSaveError?.(error);
        }
      } finally {
        saveInFlightRef.current = false;
        if (pendingSaveRef.current) {
          pendingSaveRef.current = false;
          setTimeout(() => {
            void saveCurrentConversation();
          }, AUTO_SAVE_DEBOUNCE_MS);
        }
      }
    },
    [
      LAST_CONV_CACHE_KEY,
      currentProjectId,
      isExtensionEnv,
      onAutoSaveError,
      setUnifiedMessages
    ]
  );

  const messagePersistenceSignature = useMemo(
    () => getMessagePersistenceSignature(unifiedMessages),
    [unifiedMessages]
  );
  const inlineMediaSignature = useMemo(
    () => getInlineMediaSignature(unifiedMessages),
    [unifiedMessages]
  );

  useEffect(() => {
    inlineMediaSignatureRef.current = inlineMediaSignature;
    pruneProcessedMessageMediaCache(
      unifiedMessages,
      processedMessageMediaRef.current
    );
    pruneInlineMediaCacheMaps(
      unifiedMessages,
      uploadedMediaCacheRef.current,
      failedMediaCacheRef.current
    );
  }, [inlineMediaSignature, unifiedMessages]);

  useEffect(() => {
    if (
      unifiedMessages.length > prevMsgCountRef.current &&
      prevMsgCountRef.current > 0
    ) {
      if (!isRestoredFromCacheRef.current) {
        setScrollToBottomTrigger((prev) => prev + 1);
      } else {
        isRestoredFromCacheRef.current = false;
      }
    }
    prevMsgCountRef.current = unifiedMessages.length;

    if (
      unifiedMessages.length > 0 &&
      !isSwitchingConversationRef.current &&
      messagePersistenceSignature !== lastSavedPersistenceSignatureRef.current
    ) {
      // Debounced auto-save
      const timer = setTimeout(() => {
        saveCurrentConversation();
      }, AUTO_SAVE_DEBOUNCE_MS);
      return () => clearTimeout(timer);
    }
  }, [
    messagePersistenceSignature,
    unifiedMessages.length,
    saveCurrentConversation,
    setScrollToBottomTrigger
  ]);

  const handleNewConversation = useCallback(async () => {
    if (unifiedMessagesRef.current.length > 0) {
      isSwitchingConversationRef.current = true;
      try {
        await saveCurrentConversation({ skipCacheUpdate: true });
      } catch (err) {
        log.error(
          '[ChatHistory] Failed to save conversation before creating new:',
          err
        );
      } finally {
        isSwitchingConversationRef.current = false;
      }
    }

    try {
      localStorage.removeItem(LAST_CONV_CACHE_KEY);
    } catch {
      // Ignore local cache cleanup failures.
    }

    resetSession();
    setCurrentConversationId(null);
    setUnifiedMessages([]);
    setViewMode('chat');
  }, [
    resetSession,
    setUnifiedMessages,
    LAST_CONV_CACHE_KEY,
    saveCurrentConversation
  ]);

  const setSelectedConversationIdInternal = useCallback(
    async (id: string) => {
      if (
        unifiedMessagesRef.current.length > 0 &&
        currentConversationIdRef.current !== id
      ) {
        isSwitchingConversationRef.current = true;
        try {
          await saveCurrentConversation({ skipCacheUpdate: true });
        } catch (err) {
          log.error(
            '[ChatHistory] Failed to save current before switching:',
            err
          );
        } finally {
          isSwitchingConversationRef.current = false;
        }
      }

      resetSession();
      setIsLoadingConversation(true);
      setViewMode('chat');
      isRestoredFromCacheRef.current = true;
      setCurrentConversationId(id);

      try {
        if (conversationCacheRef.current.has(id)) {
          const cachedMsgs = conversationCacheRef.current.get(id)!;
          setUnifiedMessages(cachedMsgs);
          prevMsgCountRef.current = cachedMsgs.length;
          setScrollToBottomTrigger((prev) => prev + 1);
          setIsLoadingConversation(false);

          localStorage.setItem(
            LAST_CONV_CACHE_KEY,
            JSON.stringify({
              id,
              messages: cachedMsgs,
              timestamp: Date.now()
            })
          );
          return;
        }

        const freshData = await withTimeout(
          getConversation(id),
          CHAT_HISTORY_REQUEST_TIMEOUT_MS,
          'load conversation'
        );
        const freshMessages: UnifiedMessage[] = (freshData.messages || []).map(
          (m: StoredMessage) => {
            if (m.blocks && m.blocks.length > 0) {
              return {
                id: m.id,
                role: m.role,
                blocks: m.blocks as UnifiedContentBlock[],
                timestamp: m.timestamp,
                sourceMode: 'ask' as const,
                imageUrl: m.imageUrl,
                references: m.references as UnifiedMessage['references'],
                imageReferences:
                  m.imageReferences as UnifiedMessage['imageReferences'],
                shortcut: m.shortcut as UnifiedMessage['shortcut']
              };
            }
            const blocks: UnifiedContentBlock[] = [];
            if (typeof m.content === 'string' && m.content.trim()) {
              blocks.push({ type: 'text', content: m.content });
            }
            if (m.imageUrl) {
              blocks.push({
                type: 'image',
                imageUrl: m.imageUrl,
                status: 'done'
              });
            }
            if (blocks.length === 0) {
              blocks.push({ type: 'text', content: '' });
            }
            return {
              id: m.id,
              role: m.role,
              blocks,
              timestamp: m.timestamp,
              sourceMode: 'ask' as const,
              imageUrl: m.imageUrl,
              references: m.references as UnifiedMessage['references'],
              imageReferences:
                m.imageReferences as UnifiedMessage['imageReferences'],
              shortcut: m.shortcut as UnifiedMessage['shortcut']
            };
          }
        );

        const cleanedMsgs = cleanupInterruptedGeneratingStates(freshMessages);
        setUnifiedMessages(cleanedMsgs);
        prevMsgCountRef.current = cleanedMsgs.length;
        setScrollToBottomTrigger((prev) => prev + 1);

        conversationCacheRef.current.set(id, cleanedMsgs);
        try {
          localStorage.setItem(
            LAST_CONV_CACHE_KEY,
            JSON.stringify({
              id,
              messages: cleanedMsgs,
              timestamp: Date.now()
            })
          );
        } catch {
          // Ignore local cache persistence failures.
        }
      } catch (error) {
        log.error('[ChatHistory] Load conversation failed:', error);
      } finally {
        setIsLoadingConversation(false);
      }
    },
    [
      resetSession,
      setUnifiedMessages,
      LAST_CONV_CACHE_KEY,
      saveCurrentConversation,
      setScrollToBottomTrigger
    ]
  );

  const handleSelectConversation = useCallback(
    async (id: string) => {
      await setSelectedConversationIdInternal(id);
    },
    [setSelectedConversationIdInternal]
  );

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      try {
        await deleteConversationApi(id);
        const updated = conversations.filter((c) => c.id !== id);
        setConversations(updated);

        try {
          localStorage.setItem(
            CONV_LIST_CACHE_KEY,
            JSON.stringify({
              conversations: updated,
              timestamp: Date.now()
            })
          );
        } catch {
          // Ignore local cache persistence failures.
        }

        conversationCacheRef.current.delete(id);

        if (currentConversationIdRef.current === id || updated.length === 0) {
          try {
            localStorage.removeItem(LAST_CONV_CACHE_KEY);
          } catch {
            // Ignore local cache cleanup failures.
          }

          setCurrentConversationId(null);
          resetSession();
          setUnifiedMessages([]);
        }
      } catch (error) {
        log.error('[ChatHistory] Delete conversation failed:', error);
      }
    },
    [
      conversations,
      CONV_LIST_CACHE_KEY,
      resetSession,
      setUnifiedMessages,
      LAST_CONV_CACHE_KEY
    ]
  );

  const handleShowHistory = useCallback(() => {
    setViewMode('history');
  }, []);

  const initializeChat = useCallback(async () => {
    setIsInitializing(true);
    try {
      let cachedConversations: ChatConversation[] | null = null;
      let staleCachedConversations: ChatConversation[] | null = null;
      let cachedLastConv: {
        id: string | null;
        messages: UnifiedMessage[];
      } | null = null;

      try {
        const cachedList = localStorage.getItem(CONV_LIST_CACHE_KEY);
        if (cachedList) {
          const { conversations: cached, timestamp } = JSON.parse(cachedList);
          const age = Date.now() - timestamp;
          const recentCached = (cached as ChatConversation[]).filter(
            (c) => Date.now() - c.updatedAt < CONV_RETENTION_MS
          );
          if (age < CONV_CACHE_TTL) {
            cachedConversations = recentCached;
          } else if (recentCached.length > 0) {
            staleCachedConversations = recentCached;
          }
        }

        const cachedLast = localStorage.getItem(LAST_CONV_CACHE_KEY);
        if (cachedLast) {
          const { id, messages, timestamp, isTemporary } =
            JSON.parse(cachedLast);
          const age = Date.now() - timestamp;
          if (age < CONV_CACHE_TTL) {
            cachedLastConv = {
              id: isTemporary ? null : id,
              messages
            };
          }
        }
      } catch {
        // Ignore malformed/invalid cache payloads.
      }

      if (cachedConversations) {
        setConversations(cachedConversations);
      }

      if (
        cachedLastConv &&
        cachedLastConv.id &&
        !currentConversationIdRef.current &&
        unifiedMessagesRef.current.length === 0
      ) {
        const freshId = cachedLastConv.id;
        setSelectedConversationIdInternal(freshId!);
      } else if (cachedLastConv && !cachedLastConv.id) {
        log.info('[ChatHistory] Skipped restoring temporary conversation');
      }

      if (!cachedConversations) {
        let data: ConversationListItem[] = [];
        try {
          data = await withTimeout(
            getAllConversations(currentProjectId || undefined),
            CHAT_HISTORY_REQUEST_TIMEOUT_MS,
            'load conversation list'
          );
        } catch (error) {
          if (staleCachedConversations && staleCachedConversations.length > 0) {
            setConversations(staleCachedConversations);
            data = staleCachedConversations.map((c) => ({
              id: c.id,
              title: c.title,
              messageCount: c.messageCount ?? 0,
              projectId: c.projectId,
              createdAt: c.createdAt,
              updatedAt: c.updatedAt
            }));
          } else {
            throw error;
          }
        }

        const mapped: ChatConversation[] = data.map((c) => ({
          ...c,
          messages: []
        }));
        setConversations(mapped);

        try {
          localStorage.setItem(
            CONV_LIST_CACHE_KEY,
            JSON.stringify({
              conversations: mapped,
              timestamp: Date.now()
            })
          );
        } catch {
          // Ignore local cache persistence failures.
        }

        if (mapped.length > 1) {
          const ids = mapped.slice(1).map((c) => c.id);
          preloadRecentConversations(ids);
        }

        if (
          mapped.length > 0 &&
          !currentConversationIdRef.current &&
          unifiedMessagesRef.current.length === 0 &&
          !cachedLastConv
        ) {
          setSelectedConversationIdInternal(mapped[0].id);
        }
      }
    } catch (err) {
      log.error('[ChatHistory] initializeChat error', err);
    } finally {
      setIsInitializing(false);
    }
  }, [
    CONV_LIST_CACHE_KEY,
    LAST_CONV_CACHE_KEY,
    currentProjectId,
    preloadRecentConversations,
    setSelectedConversationIdInternal
  ]);

  useEffect(() => {
    if (!enabled) {
      lastInitProjectIdRef.current = undefined;
      setIsInitializing(true);
      return;
    }
    if (lastInitProjectIdRef.current === currentProjectId) {
      return;
    }
    lastInitProjectIdRef.current = currentProjectId;
    resetSession();
    setCurrentConversationId(null);
    setConversations([]);
    conversationCacheRef.current.clear();
    uploadedMediaCacheRef.current.clear();
    failedMediaCacheRef.current.clear();
    processedMessageMediaRef.current.clear();
    lastSavedPersistenceSignatureRef.current = '';
    startTimer('initializeChat');
    initializeChat().finally(() => endTimer('initializeChat'));
  }, [currentProjectId, enabled, resetSession, initializeChat]);

  return {
    viewMode,
    setViewMode,
    conversations,
    currentConversationId,
    isLoadingConversation,
    isInitializing,
    handleNewConversation,
    handleSelectConversation,
    handleDeleteConversation,
    handleShowHistory,
    saveCurrentConversation,
    conversationCacheRef
  };
}
