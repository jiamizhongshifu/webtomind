/**
 * Chrome Extension 共享工具函数
 * 消除重复代码，统一 Chrome API 相关的辅助逻辑
 */

import { loggers } from '@/utils/logger';

const log = loggers.background;

type RuntimeMessageOptions = {
  suppressReceiverUnavailableError?: boolean;
  logger?: Pick<typeof log, 'warn' | 'info' | 'error'>;
  context?: string;
};

/**
 * 判断错误是否为"接收端不存在"类型
 * 常见于向没有 content script 的标签页发送消息时
 */
export function isReceiverUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('Receiving end does not exist') ||
    message.includes('Could not establish connection')
  );
}

/**
 * 安全发送 runtime message，避免无接收端时产生未处理 Promise 错误
 */
export async function safeRuntimeSendMessage<TResponse = unknown>(
  message: unknown,
  options: RuntimeMessageOptions = {}
): Promise<TResponse | undefined> {
  const {
    suppressReceiverUnavailableError = true,
    logger = log,
    context = 'runtime.sendMessage'
  } = options;

  try {
    return (await chrome.runtime.sendMessage(message)) as TResponse;
  } catch (error) {
    if (
      suppressReceiverUnavailableError &&
      isReceiverUnavailableError(error)
    ) {
      logger.info(`[ChromeHelpers] ${context} receiver unavailable`);
      return undefined;
    }

    logger.warn(`[ChromeHelpers] ${context} failed:`, error);
    throw error;
  }
}

/**
 * 广播认证状态变更到所有标签页和 popup/sidepanel
 * 使用 chrome.tabs.sendMessage 发送到 content scripts
 * 使用 chrome.runtime.sendMessage 发送到 popup/sidepanel
 */
export async function broadcastAuthStateChanged(): Promise<void> {
  log.info('[ChromeHelpers] Broadcasting AUTH_STATE_CHANGED...');

  try {
    // 1. 广播到所有标签页的 content scripts
    const tabs = await chrome.tabs.query({});
    const sendPromises = tabs.map((tab) => {
      if (tab.id) {
        return chrome.tabs
          .sendMessage(tab.id, { type: 'AUTH_STATE_CHANGED' })
          .catch(() => {
            // 某些标签页可能没有 content script，忽略错误
          });
      }
      return Promise.resolve();
    });

    await Promise.all(sendPromises);
    log.info(
      '[ChromeHelpers] Auth state change broadcasted to',
      tabs.length,
      'tabs'
    );

    // 2. 广播到 popup/sidepanel
    chrome.runtime.sendMessage({ type: 'AUTH_STATE_CHANGED' }).catch(() => {
      // popup/sidepanel 可能没有打开，忽略错误
    });
  } catch (error) {
    log.error('[ChromeHelpers] Failed to broadcast AUTH_STATE_CHANGED:', error);
  }
}
