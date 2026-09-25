/**
 * 工作台数据缓存服务
 * 使用 IndexedDB 存储，无容量限制，支持大量图片数据
 *
 * 策略：
 * - 缓存中保留完整数据（包括 base64 图片）
 * - IndexedDB 无 5MB 限制，可存储大量数据
 * - 缓存优先 + 后台静默更新
 */

import type { SavedSummary, Shortcut } from './database';
import { DatabaseService } from './database';
import { loggers } from '@/utils/logger';
import { compareSummariesByCreatedAtDescIdAsc } from '@/workspace/utils/visual-summary';

const log = loggers.storage;

// 缓存配置
// 采用分层缓存策略：
// 1. 全局缓存（L1）：存储最近访问的 100 条，用于"全部"视图快速展示
// 2. 项目缓存（L2）：每个项目独立缓存 20 条，项目切换时按需加载
// 3. 内存缓存（L0）：运行时状态，由 React state 管理
const CACHE_CONFIG = {
  ANONYMOUS_USER_ID: 'anonymous',
  // 缓存有效期（毫秒）
  SUMMARIES_TTL: 30 * 60 * 1000, // 30 分钟
  SHORTCUTS_TTL: 60 * 60 * 1000, // 60 分钟
  // 全局缓存的最大项数（全部视图/默认项目）
  MAX_GLOBAL_SUMMARIES: 100,
  // 单个项目缓存的最大项数（独立配额，不占用全局）
  MAX_PROJECT_SUMMARIES: 20,
  // 最大保留的项目特定缓存数量（LRU 淘汰）
  MAX_PROJECT_CACHES: 20,
  // 单条摘要的最大 markdown 长度（用于列表显示优化）
  MAX_MARKDOWN_LENGTH: 8000
};

const CACHE_VERSION = 19; // 升级版本：优化项目缓存策略

// 当前用户ID
let currentUserId: string | null = null;

// 进行中的请求（去重）
type PendingRequestResult = SavedSummary[] | Shortcut[];
const pendingRequests = new Map<string, Promise<PendingRequestResult>>();

// 已删除 ID 黑名单（防止后台刷新恢复已删除的卡片）
// 使用 Set 存储，每个 ID 在删除后的一定时间内会被过滤掉
const deletedIdsBlacklist = new Set<string>();
const BLACKLIST_TTL = 5 * 60 * 1000; // 黑名单保留 5 分钟（原 60 秒太短）
const BLACKLIST_STORAGE_KEY = 'webtomind_deleted_ids';

/**
 * 从 localStorage 加载已删除的 ID 黑名单
 */
function loadDeletedIdsFromStorage(): void {
  try {
    const stored = localStorage.getItem(BLACKLIST_STORAGE_KEY);
    if (stored) {
      const { ids, expiry } = JSON.parse(stored);
      if (expiry > Date.now() && Array.isArray(ids)) {
        ids.forEach((id: string) => deletedIdsBlacklist.add(id));
        log.info(
          `[WorkspaceCache] Loaded ${ids.length} deleted IDs from storage`
        );
      } else {
        // 过期，清理
        localStorage.removeItem(BLACKLIST_STORAGE_KEY);
      }
    }
  } catch (error) {
    log.warn('[WorkspaceCache] Failed to load deleted IDs:', error);
  }
}

/**
 * 保存已删除的 ID 黑名单到 localStorage
 */
function saveDeletedIdsToStorage(): void {
  try {
    if (deletedIdsBlacklist.size === 0) {
      localStorage.removeItem(BLACKLIST_STORAGE_KEY);
      return;
    }
    const data = {
      ids: Array.from(deletedIdsBlacklist),
      expiry: Date.now() + BLACKLIST_TTL
    };
    localStorage.setItem(BLACKLIST_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    log.warn('[WorkspaceCache] Failed to save deleted IDs:', error);
  }
}

// 初始化时加载黑名单
loadDeletedIdsFromStorage();

// 待刷新标记（用于跨标签页通知新内容已保存）
const PENDING_REFRESH_KEY = 'webtomind_pending_refresh';
const PENDING_REFRESH_TTL = 30 * 1000; // 30秒内有效

/**
 * 标记有新内容待刷新（由插件保存成功后调用）
 */
export function markPendingRefresh(
  summaryId: string,
  projectId?: string
): void {
  try {
    const data = {
      summaryId,
      projectId,
      timestamp: Date.now()
    };
    localStorage.setItem(PENDING_REFRESH_KEY, JSON.stringify(data));
    log.info('[WorkspaceCache] Marked pending refresh:', summaryId);
  } catch (error) {
    log.warn('[WorkspaceCache] Failed to mark pending refresh:', error);
  }
}

/**
 * 检查并消费待刷新标记
 * 返回待刷新的信息，如果没有或已过期则返回 null
 */
export function consumePendingRefresh(): {
  summaryId: string;
  projectId?: string;
} | null {
  try {
    const stored = localStorage.getItem(PENDING_REFRESH_KEY);
    if (!stored) return null;

    const data = JSON.parse(stored);
    const isExpired = Date.now() - data.timestamp > PENDING_REFRESH_TTL;

    // 无论是否过期，都清除标记（只消费一次）
    localStorage.removeItem(PENDING_REFRESH_KEY);

    if (isExpired) {
      log.info('[WorkspaceCache] Pending refresh expired, ignoring');
      return null;
    }

    log.info('[WorkspaceCache] Consumed pending refresh:', data.summaryId);
    return { summaryId: data.summaryId, projectId: data.projectId };
  } catch (error) {
    log.warn('[WorkspaceCache] Failed to consume pending refresh:', error);
    localStorage.removeItem(PENDING_REFRESH_KEY);
    return null;
  }
}

/**
 * 添加 ID 到删除黑名单
 */
function addToDeleteBlacklist(id: string): void {
  deletedIdsBlacklist.add(id);
  saveDeletedIdsToStorage();
  // 5 分钟后自动从黑名单移除
  setTimeout(() => {
    deletedIdsBlacklist.delete(id);
    saveDeletedIdsToStorage();
    log.info(`[WorkspaceCache] Removed ${id} from delete blacklist`);
  }, BLACKLIST_TTL);
}

/**
 * 从缓存数据中过滤已删除的 ID（导出供外部使用）
 */
export function filterDeletedItems<T extends { id: string }>(items: T[]): T[] {
  if (deletedIdsBlacklist.size === 0) return items;
  const filtered = items.filter((item) => !deletedIdsBlacklist.has(item.id));
  if (filtered.length !== items.length) {
    log.info(
      `[WorkspaceCache] Filtered ${items.length - filtered.length} deleted items from cache`
    );
  }
  return filtered;
}

// 数据库服务实例
let dbService: DatabaseService | null = null;

/**
 * 获取数据库服务实例
 */
async function getDbService(): Promise<DatabaseService> {
  if (!dbService) {
    dbService = DatabaseService.getInstance();
    await dbService.init();
  }
  return dbService;
}

/**
 * 设置当前用户ID（登录/登出时调用）
 */
export function setCurrentUserId(userId: string | null): void {
  if (currentUserId === userId) return;
  currentUserId = userId;
  log.info('[WorkspaceCache] Current user changed to:', userId || 'anonymous');
}

/**
 * 获取当前用户ID
 */
export function getCurrentUserId(): string {
  return currentUserId || CACHE_CONFIG.ANONYMOUS_USER_ID;
}

/**
 * 获取带用户和项目隔离的缓存键
 */
function getSummariesCacheKey(projectId?: string): string {
  const userId = getCurrentUserId();
  return projectId && projectId !== 'all'
    ? `summaries_${userId}_p_${projectId}`
    : `summaries_${userId}`;
}

function getShortcutsCacheKey(): string {
  return `shortcuts_${getCurrentUserId()}`;
}

/**
 * 检查缓存是否过期
 */
function isCacheExpired(timestamp: number, ttl: number): boolean {
  return Date.now() - timestamp > ttl;
}

/**
 * 截断 markdown 内容，保留摘要部分
 * 注意：会保留图片和视频标签
 */
function truncateMarkdown(markdown: string, maxLength: number): string {
  if (markdown.length <= maxLength) {
    return markdown;
  }

  // 提取所有图片标签（保留前 5 张图片）
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*\/?>/gi;
  const images: string[] = [];
  let match;
  while ((match = imgRegex.exec(markdown)) !== null && images.length < 5) {
    images.push(match[0]);
  }

  // 提取所有视频标签（保留前 3 个视频）
  const videoRegex = /<video[^>]+src=["']([^"']+)["'][^>]*\/?>/gi;
  const videos: string[] = [];
  while ((match = videoRegex.exec(markdown)) !== null && videos.length < 3) {
    videos.push(match[0]);
  }

  // 移除所有图片和视频后截断文本
  const textOnly = markdown
    .replace(/<img[^>]+\/?>/gi, '')
    .replace(/<video[^>]+\/?>/gi, '');
  const truncated = textOnly.slice(0, maxLength);
  let finalText = truncated;

  const lastNewline = truncated.lastIndexOf('\n\n');
  if (lastNewline > maxLength * 0.5) {
    finalText = truncated.slice(0, lastNewline) + '\n\n...';
  } else {
    const lastSentence = truncated.lastIndexOf('。');
    if (lastSentence > maxLength * 0.5) {
      finalText = truncated.slice(0, lastSentence + 1) + '...';
    } else {
      finalText = truncated + '...';
    }
  }

  // 将保留的媒体放在文本前面（视频优先）
  const media = [...videos, ...images];
  return media.length > 0 ? media.join('\n') + '\n\n' + finalText : finalText;
}

/**
 * 检测内容是否是纯媒体（只有图片或视频，几乎没有文字）
 */
function isPureMediaContent(markdown: string): boolean {
  // 移除图片、视频和占位符后检查剩余文本
  const textOnly = markdown
    .replace(/<img[^>]+\/?>/gi, '')
    .replace(/<video[^>]+\/?>/gi, '')
    .replace(/<div[^>]*data-placeholder="true"[^>]*>[^<]*<\/div>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();

  // 如果剩余文本少于 50 个字符，认为是纯媒体内容
  return textOnly.length < 50;
}

/**
 * 创建轻量级缓存版本
 * IndexedDB 版本：保留 base64 图片，但截断过长的 markdown
 * 注意：纯媒体内容不截断，以保留完整的媒体数据用于列表显示
 */
function createCacheableSummary(summary: SavedSummary): SavedSummary {
  let markdown = summary.markdown;

  // 纯媒体内容不截断（保留完整的图片/视频数据用于列表缩略图）
  if (isPureMediaContent(markdown)) {
    return summary;
  }

  // 只截断过长的 markdown（保留图片和视频）
  if (markdown.length > CACHE_CONFIG.MAX_MARKDOWN_LENGTH) {
    markdown = truncateMarkdown(markdown, CACHE_CONFIG.MAX_MARKDOWN_LENGTH);
  }

  return { ...summary, markdown };
}

/**
 * 批量创建轻量级缓存版本
 * @param summaries 原始数据
 * @param isProjectCache 是否是项目缓存（项目缓存使用较小的配额）
 */
function createCacheableSummaries(
  summaries: SavedSummary[],
  isProjectCache = false
): SavedSummary[] {
  const maxItems = isProjectCache
    ? CACHE_CONFIG.MAX_PROJECT_SUMMARIES
    : CACHE_CONFIG.MAX_GLOBAL_SUMMARIES;
  return [...summaries]
    .sort(compareSummariesByCreatedAtDescIdAsc)
    .slice(0, maxItems)
    .map(createCacheableSummary);
}

/**
 * 清除所有工作台缓存
 */
export async function clearAllCache(): Promise<void> {
  try {
    const db = await getDbService();
    await db.clearAllWorkspaceCache();
    await db.clearAllShortcutsCache();
    log.info('[WorkspaceCache] All cache cleared');
  } catch (error) {
    log.warn('[WorkspaceCache] Failed to clear cache:', error);
  }

  // 同时清除旧的 localStorage 缓存（迁移兼容）
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (
      key &&
      (key.startsWith('workspace_summaries_') ||
        key.startsWith('workspace_shortcuts_'))
    ) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

/**
 * 获取总结列表（带缓存）
 */
export async function getCachedSummaries(
  fetchFn: () => Promise<SavedSummary[]>,
  options?: {
    projectId?: string;
    forceRefresh?: boolean;
    onCacheHit?: (data: SavedSummary[]) => void;
    onFreshData?: (data: SavedSummary[]) => void;
  }
): Promise<SavedSummary[]> {
  const {
    projectId,
    forceRefresh = false,
    onCacheHit,
    onFreshData
  } = options || {};
  const cacheKey = getSummariesCacheKey(projectId);
  // 判断是否是项目缓存（有 projectId 且不是 'all'）
  const isProjectCache = !!(projectId && projectId !== 'all');

  // 检查是否有正在进行的相同请求
  if (pendingRequests.has(cacheKey)) {
    log.info('[WorkspaceCache] Summaries request deduplicated:', cacheKey);
    return pendingRequests.get(cacheKey) as Promise<SavedSummary[]>;
  }

  const fetchPromise = (async () => {
    try {
      const db = await getDbService();

      // 尝试从 IndexedDB 读取缓存
      const cache = await db.getWorkspaceCache(cacheKey);

      if (cache && cache.version === CACHE_VERSION) {
        const isExpired = isCacheExpired(
          cache.timestamp,
          CACHE_CONFIG.SUMMARIES_TTL
        );
        const shouldRefresh = isExpired || forceRefresh;

        // 如果缓存为空且需要刷新，等待新鲜数据
        if (cache.data.length === 0 && shouldRefresh) {
          log.info('[WorkspaceCache] Empty cache, waiting for fresh data...');
        } else if (forceRefresh) {
          // 强制刷新时，不返回缓存数据，直接获取新鲜数据
          log.info(
            '[WorkspaceCache] Force refresh requested, skipping cache, fetching fresh data...'
          );
        } else {
          log.info(
            '[WorkspaceCache] Cache hit (IndexedDB), expired:',
            isExpired,
            'count:',
            cache.data.length
          );
          // 过滤已删除的 ID，防止后台刷新恢复已删除的卡片
          const filteredData = filterDeletedItems(cache.data);
          onCacheHit?.(filteredData);

          if (shouldRefresh) {
            // 后台静默刷新
            const cachedCount = cache.data.length;
            fetchFn()
              .then(async (freshData) => {
                // 保护机制：如果服务器返回的数据明显少于缓存数据，跳过更新
                // 这通常是 token 刷新或网络异常导致的
                if (cachedCount > 0 && freshData.length < cachedCount * 0.3) {
                  log.warn(
                    '[WorkspaceCache] Silent refresh skipped - server returned fewer items:',
                    { cached: cachedCount, server: freshData.length }
                  );
                  return;
                }

                // 过滤已删除的 ID
                const filteredFresh = filterDeletedItems(freshData);
                const cacheableData = createCacheableSummaries(
                  filteredFresh,
                  isProjectCache
                );
                await db.setWorkspaceCache({
                  key: cacheKey,
                  data: cacheableData,
                  timestamp: Date.now(),
                  version: CACHE_VERSION
                });
                log.info('[WorkspaceCache] Cache updated silently');
              })
              .catch((err) => {
                log.warn('[WorkspaceCache] Silent refresh failed:', err);
              });
          }
          return filterDeletedItems(cache.data);
        }
      }

      // 无缓存或版本不匹配
      log.info('[WorkspaceCache] No cache, fetching fresh summaries...');
      const data = await fetchFn();
      // 过滤已删除的 ID
      const filteredData = filterDeletedItems(data);
      onFreshData?.(filteredData);

      // 缓存数据 - 只有当返回有效数据时才缓存
      // 防止 API 异常（token 问题、网络问题）返回空数据覆盖缓存
      try {
        if (filteredData.length > 0) {
          const cacheableData = createCacheableSummaries(
            filteredData,
            isProjectCache
          );
          await db.setWorkspaceCache({
            key: cacheKey,
            data: cacheableData,
            timestamp: Date.now(),
            version: CACHE_VERSION
          });
          log.info('[WorkspaceCache] Summaries cached to IndexedDB');

          // 清理旧缓存
          await db.cleanupWorkspaceCache(CACHE_CONFIG.MAX_PROJECT_CACHES);
        } else {
          log.warn(
            '[WorkspaceCache] Skipping cache update - API returned empty data (possible token/network issue)'
          );
        }
      } catch (err) {
        log.warn('[WorkspaceCache] Failed to cache summaries:', err);
      }

      return filteredData;
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, fetchPromise);
  return fetchPromise as Promise<SavedSummary[]>;
}

/**
 * 获取快捷指令列表（带缓存）
 */
export async function getCachedShortcuts(
  fetchFn: () => Promise<Shortcut[]>,
  options?: {
    forceRefresh?: boolean;
    onCacheHit?: (data: Shortcut[]) => void;
    onFreshData?: (data: Shortcut[]) => void;
  }
): Promise<Shortcut[]> {
  const { forceRefresh = false, onCacheHit, onFreshData } = options || {};
  const cacheKey = getShortcutsCacheKey();

  if (pendingRequests.has(cacheKey)) {
    log.info('[WorkspaceCache] Shortcuts request deduplicated:', cacheKey);
    return pendingRequests.get(cacheKey) as Promise<Shortcut[]>;
  }

  const fetchPromise = (async () => {
    try {
      const db = await getDbService();
      const cache = await db.getShortcutsCache(cacheKey);

      if (cache && cache.version === CACHE_VERSION) {
        const isExpired = isCacheExpired(
          cache.timestamp,
          CACHE_CONFIG.SHORTCUTS_TTL
        );
        const shouldRefresh = isExpired || forceRefresh;

        // 如果缓存是空数组，即使未过期也应该尝试获取新数据
        const isEmpty = cache.data.length === 0;

        if (isEmpty && !shouldRefresh) {
          // 空缓存且未过期，但仍然尝试后台刷新
          log.info(
            '[WorkspaceCache] Empty shortcuts cache (not expired), triggering background refresh...'
          );
          onCacheHit?.(cache.data);

          // 后台刷新
          fetchFn()
            .then(async (freshData) => {
              await db.setShortcutsCache({
                key: cacheKey,
                data: freshData,
                timestamp: Date.now(),
                version: CACHE_VERSION
              });
              onFreshData?.(freshData);
              log.info('[WorkspaceCache] Shortcuts cache updated from empty');
            })
            .catch((err) => {
              log.warn('[WorkspaceCache] Background refresh failed:', err);
            });

          return cache.data;
        } else if (isEmpty && shouldRefresh) {
          log.info(
            '[WorkspaceCache] Empty shortcuts cache, waiting for fresh data...'
          );
        } else {
          log.info('[WorkspaceCache] Shortcuts cache hit, expired:', isExpired);
          onCacheHit?.(cache.data);

          if (shouldRefresh) {
            fetchFn()
              .then(async (freshData) => {
                await db.setShortcutsCache({
                  key: cacheKey,
                  data: freshData,
                  timestamp: Date.now(),
                  version: CACHE_VERSION
                });
                onFreshData?.(freshData);
                log.info('[WorkspaceCache] Shortcuts cache updated');
              })
              .catch((err) => {
                log.warn('[WorkspaceCache] Silent refresh failed:', err);
              });
          }
          return cache.data;
        }
      }

      log.info('[WorkspaceCache] No shortcuts cache, fetching...');
      const data = await fetchFn();

      await db.setShortcutsCache({
        key: cacheKey,
        data,
        timestamp: Date.now(),
        version: CACHE_VERSION
      });

      return data;
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, fetchPromise);
  return fetchPromise;
}

/**
 * 更新单条总结的缓存
 */
export async function updateSummaryCache(
  id: string,
  updates: Partial<SavedSummary>,
  projectId?: string
): Promise<void> {
  try {
    const db = await getDbService();
    const keysToUpdate = [getSummariesCacheKey()];
    if (projectId) {
      keysToUpdate.push(getSummariesCacheKey(projectId));
    }

    for (const key of keysToUpdate) {
      const cache = await db.getWorkspaceCache(key);
      // 跳过不存在、为空或版本不匹配的缓存
      if (
        !cache ||
        cache.data.length === 0 ||
        cache.version !== CACHE_VERSION
      ) {
        if (cache && cache.version !== CACHE_VERSION) {
          log.info(
            '[WorkspaceCache] Skipping update for outdated cache:',
            key,
            'version:',
            cache.version
          );
          // 删除过期的缓存
          await db.deleteWorkspaceCache(key);
        }
        continue;
      }

      const updated = cache.data.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      );

      await db.setWorkspaceCache({
        ...cache,
        data: updated,
        timestamp: Date.now()
      });
    }
  } catch (error) {
    log.warn('[WorkspaceCache] Failed to update summary cache:', error);
  }
}

/**
 * 从缓存中删除总结
 */
export async function removeSummaryFromCache(
  id: string,
  _projectId?: string
): Promise<void> {
  // 立即添加到删除黑名单，防止后台刷新恢复
  addToDeleteBlacklist(id);
  log.info(`[WorkspaceCache] Added ${id} to delete blacklist`);

  try {
    const db = await getDbService();
    const userId = getCurrentUserId();
    const allKeys = await db.getAllWorkspaceCacheKeys();

    // 找到所有属于当前用户的缓存
    const userKeys = allKeys.filter((key) => key.includes(userId));

    for (const key of userKeys) {
      const cache = await db.getWorkspaceCache(key);
      if (!cache) continue;

      const beforeCount = cache.data.length;
      const filtered = cache.data.filter((s) => s.id !== id);

      if (beforeCount !== filtered.length) {
        await db.setWorkspaceCache({
          ...cache,
          data: filtered,
          timestamp: Date.now()
        });
        log.info(`[WorkspaceCache] Removed from cache: ${key}`);
      }
    }
  } catch (error) {
    log.warn('[WorkspaceCache] Failed to remove from cache:', error);
  }
}

/**
 * 添加新总结到缓存
 */
export async function addSummaryToCache(
  summary: SavedSummary,
  options: { initializeIfMissing?: boolean } = {}
): Promise<void> {
  try {
    const db = await getDbService();
    const cacheableSummary = createCacheableSummary(summary);

    const keysToUpdate = [getSummariesCacheKey()];
    if (summary.projectId) {
      keysToUpdate.push(getSummariesCacheKey(summary.projectId));
    }

    for (const key of keysToUpdate) {
      const cache = await db.getWorkspaceCache(key);

      if (!cache || cache.data.length === 0) {
        if (options.initializeIfMissing) {
          await db.setWorkspaceCache({
            key,
            data: [cacheableSummary],
            timestamp: Date.now(),
            version: CACHE_VERSION
          });
          log.info('[WorkspaceCache] Initialized cache on add:', key);
          continue;
        }

        // 只有调用方明确要求时才初始化，避免普通后台写入误造缓存。
        log.info('[WorkspaceCache] Skipping add - cache not initialized:', key);
        continue;
      }

      // 判断是项目缓存还是全局缓存
      const isProjectCache = key.includes('_p_');
      const maxItems = isProjectCache
        ? CACHE_CONFIG.MAX_PROJECT_SUMMARIES
        : CACHE_CONFIG.MAX_GLOBAL_SUMMARIES;

      // 避免重复并限制数量
      const filteredData = cache.data.filter((s) => s.id !== summary.id);
      const newData = [cacheableSummary, ...filteredData]
        .sort(compareSummariesByCreatedAtDescIdAsc)
        .slice(0, maxItems);

      await db.setWorkspaceCache({
        ...cache,
        data: newData,
        timestamp: Date.now()
      });
    }

    // 同时更新项目缩略图缓存（用于项目管理页的卡片展示）
    if (summary.projectId) {
      await updateProjectThumbnailsOnAdd(summary.projectId, cacheableSummary);
    }
  } catch (error) {
    log.warn('[WorkspaceCache] Failed to add to cache:', error);
  }
}

/**
 * 添加新 summary 时更新项目缩略图缓存
 */
async function updateProjectThumbnailsOnAdd(
  projectId: string,
  summary: SavedSummary
): Promise<void> {
  try {
    const cache = await loadProjectThumbnailsCache();
    const entry = cache[projectId];

    if (entry) {
      // 已有缓存，将新 summary 添加到最前面
      const filteredSummaries = entry.summaries.filter(
        (s) => s.id !== summary.id
      );
      const newSummaries = [summary, ...filteredSummaries]
        .sort(compareSummariesByCreatedAtDescIdAsc)
        .slice(0, 3);
      cache[projectId] = {
        summaries: newSummaries,
        timestamp: Date.now()
      };
    } else {
      // 没有缓存，创建新的
      cache[projectId] = {
        summaries: [summary],
        timestamp: Date.now()
      };
    }

    await saveProjectThumbnailsCache();
    log.info('[WorkspaceCache] Project thumbnails updated on add:', projectId);
  } catch (error) {
    log.warn(
      '[WorkspaceCache] Failed to update project thumbnails on add:',
      error
    );
  }
}

/**
 * 更新快捷指令缓存
 */
export async function updateShortcutsCache(
  shortcuts: Shortcut[]
): Promise<void> {
  try {
    const db = await getDbService();
    await db.setShortcutsCache({
      key: getShortcutsCacheKey(),
      data: shortcuts,
      timestamp: Date.now(),
      version: CACHE_VERSION
    });
  } catch (error) {
    log.warn('[WorkspaceCache] Failed to update shortcuts cache:', error);
  }
}

/**
 * 使总结缓存失效
 */
export async function invalidateSummariesCache(
  projectId?: string
): Promise<void> {
  try {
    const db = await getDbService();
    const cacheKey = getSummariesCacheKey(projectId);
    await db.deleteWorkspaceCache(cacheKey);
    log.info('[WorkspaceCache] Summaries cache invalidated:', cacheKey);
  } catch (error) {
    log.warn('[WorkspaceCache] Failed to invalidate cache:', error);
  }
}

/**
 * 使快捷指令缓存失效
 */
export async function invalidateShortcutsCache(): Promise<void> {
  try {
    const db = await getDbService();
    await db.deleteShortcutsCache(getShortcutsCacheKey());
    log.info('[WorkspaceCache] Shortcuts cache invalidated');
  } catch (error) {
    log.warn('[WorkspaceCache] Failed to invalidate shortcuts cache:', error);
  }
}

// ============ 项目缩略图缓存 ============
// 用于 BoardsOverview 页面的项目卡片缩略图
// 缓存在 IndexedDB 中，避免每次返回页面都重新加载

const PROJECT_THUMBNAILS_CACHE_KEY = 'project_thumbnails';
const PROJECT_THUMBNAILS_TTL = 24 * 60 * 60 * 1000; // 24 小时，减少项目列表重复请求缩略图

interface ProjectThumbnailsCache {
  [projectId: string]: {
    summaries: SavedSummary[];
    timestamp: number;
  };
}

// 内存缓存（避免频繁读取 IndexedDB）
let projectThumbnailsMemoryCache: ProjectThumbnailsCache | null = null;

/**
 * 获取项目缩略图缓存键
 */
function getProjectThumbnailsCacheKey(): string {
  return `${PROJECT_THUMBNAILS_CACHE_KEY}_${getCurrentUserId()}`;
}

/**
 * 从 IndexedDB 加载项目缩略图缓存到内存
 */
async function loadProjectThumbnailsCache(): Promise<ProjectThumbnailsCache> {
  if (projectThumbnailsMemoryCache) {
    return projectThumbnailsMemoryCache;
  }

  try {
    const db = await getDbService();
    const cache = await db.getWorkspaceCache(getProjectThumbnailsCacheKey());

    if (cache && cache.version === CACHE_VERSION && cache.data.length > 0) {
      // 从序列化格式恢复
      const firstItem = cache.data[0] as unknown as {
        _thumbnailsCache?: string;
      };
      if (firstItem._thumbnailsCache) {
        projectThumbnailsMemoryCache = JSON.parse(firstItem._thumbnailsCache);
        log.info('[WorkspaceCache] Project thumbnails loaded from IndexedDB');
        return projectThumbnailsMemoryCache!;
      }
    }
  } catch (error) {
    log.warn('[WorkspaceCache] Failed to load project thumbnails:', error);
  }

  projectThumbnailsMemoryCache = {};
  return projectThumbnailsMemoryCache;
}

/**
 * 保存项目缩略图缓存到 IndexedDB
 */
async function saveProjectThumbnailsCache(): Promise<void> {
  if (!projectThumbnailsMemoryCache) return;

  try {
    const db = await getDbService();
    // 将对象转换为可序列化的格式存储
    const cacheData = JSON.stringify(projectThumbnailsMemoryCache);
    await db.setWorkspaceCache({
      key: getProjectThumbnailsCacheKey(),
      data: [{ _thumbnailsCache: cacheData }] as unknown as SavedSummary[],
      timestamp: Date.now(),
      version: CACHE_VERSION
    });
  } catch (error) {
    log.warn('[WorkspaceCache] Failed to save project thumbnails:', error);
  }
}

/**
 * 获取项目的缩略图缓存
 */
export async function getProjectThumbnails(
  projectId: string
): Promise<SavedSummary[] | null> {
  const cache = await loadProjectThumbnailsCache();
  const entry = cache[projectId];

  if (!entry) {
    return null;
  }

  // 检查是否过期
  if (Date.now() - entry.timestamp > PROJECT_THUMBNAILS_TTL) {
    log.info('[WorkspaceCache] Project thumbnails expired:', projectId);
    return null;
  }

  log.info(
    '[WorkspaceCache] Project thumbnails cache hit:',
    projectId,
    entry.summaries.length
  );
  return [...entry.summaries].sort(compareSummariesByCreatedAtDescIdAsc);
}

/**
 * 设置项目的缩略图缓存
 */
export async function setProjectThumbnails(
  projectId: string,
  summaries: SavedSummary[]
): Promise<void> {
  const cache = await loadProjectThumbnailsCache();

  // 只缓存前 3 个，并创建轻量级版本
  const thumbnails = [...summaries]
    .sort(compareSummariesByCreatedAtDescIdAsc)
    .slice(0, 3)
    .map(createCacheableSummary);

  cache[projectId] = {
    summaries: thumbnails,
    timestamp: Date.now()
  };

  // 限制缓存的项目数量（最多 50 个项目）
  const projectIds = Object.keys(cache);
  if (projectIds.length > 50) {
    // 按时间戳排序，删除最旧的
    const sorted = projectIds.sort(
      (a, b) => cache[a].timestamp - cache[b].timestamp
    );
    const toDelete = sorted.slice(0, projectIds.length - 50);
    toDelete.forEach((id) => delete cache[id]);
  }

  await saveProjectThumbnailsCache();
  log.info(
    '[WorkspaceCache] Project thumbnails cached:',
    projectId,
    thumbnails.length
  );
}

/**
 * 清除项目缩略图内存缓存（用户切换时调用）
 */
export function clearProjectThumbnailsMemoryCache(): void {
  projectThumbnailsMemoryCache = null;
}

/**
 * 更新项目缩略图缓存中的单个 summary
 */
export async function updateProjectThumbnailSummary(
  summaryId: string,
  updates: Partial<SavedSummary>
): Promise<void> {
  const cache = await loadProjectThumbnailsCache();

  for (const projectId of Object.keys(cache)) {
    const entry = cache[projectId];
    const index = entry.summaries.findIndex((s) => s.id === summaryId);
    if (index !== -1) {
      entry.summaries[index] = { ...entry.summaries[index], ...updates };
      entry.summaries = entry.summaries
        .sort(compareSummariesByCreatedAtDescIdAsc)
        .slice(0, 3);
      entry.timestamp = Date.now();
    }
  }

  await saveProjectThumbnailsCache();
}

/**
 * 从项目缩略图缓存中删除 summary
 */
export async function removeFromProjectThumbnails(
  summaryId: string
): Promise<void> {
  const cache = await loadProjectThumbnailsCache();

  for (const projectId of Object.keys(cache)) {
    const entry = cache[projectId];
    const filtered = entry.summaries.filter((s) => s.id !== summaryId);
    if (filtered.length !== entry.summaries.length) {
      entry.summaries = filtered;
      entry.timestamp = Date.now();
    }
  }

  await saveProjectThumbnailsCache();
}
