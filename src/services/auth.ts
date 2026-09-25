/**
 * 插件端认证服务
 * 管理用户登录状态和 Token
 */

import {
  APP_URLS,
  getSupabaseConfig,
  isAllowedWebOrigin
} from '@/utils/constants';
import { loggers, maskEmail, safeLog } from '@/utils/logger';
import {
  broadcastAuthStateChanged,
  isReceiverUnavailableError
} from '@/utils/chrome-helpers';
import { getApiBaseUrl } from '@/utils/env';

const log = loggers.auth;

// 存储键
const AUTH_STORAGE_KEY = 'auth_state';

// 网络请求超时配置（毫秒）
const API_TIMEOUT_MS = 15000; // 15秒

export interface AuthUser {
  id: string;
  email: string;
  username?: string;
  avatar_url?: string;
  member_number?: number;
  member_number_formatted?: string; // "No.0001"
  days_joined?: number;
}

export interface AuthState {
  token: string | null;
  refreshToken: string | null; // Supabase refresh token
  user: AuthUser | null;
  isAuthenticated: boolean;
  lastRefreshTime?: number; // 上次刷新用户信息的时间（毫秒）
}

const defaultAuthState: AuthState = {
  token: null,
  refreshToken: null,
  user: null,
  isAuthenticated: false
};

const LOGIN_DEDUP_WINDOW_MS = 5000;
let lastCommittedLoginToken: string | null = null;
let lastCommittedLoginAt = 0;
let inFlightLoginToken: string | null = null;
let inFlightLoginPromise: Promise<void> | null = null;

const AUTH_STATE_MEMORY_TTL_MS = 5 * 60 * 1000;
let inMemoryAuthState: AuthState | null = null;
let inMemoryAuthStateUpdatedAt = 0;

function getSenderOrigin(sender: chrome.runtime.MessageSender): string | null {
  const senderUrl = sender.url || sender.tab?.url || '';
  if (!senderUrl) return null;

  try {
    return new URL(senderUrl).origin;
  } catch {
    return null;
  }
}

function isTrustedAuthSender(sender: chrome.runtime.MessageSender): boolean {
  const origin = getSenderOrigin(sender);
  if (!origin) return false;
  return isAllowedWebOrigin(origin);
}

function getAuthSyncTabQueryPatterns(): string[] {
  try {
    const baseUrl = new URL(APP_URLS.BASE);
    const host = baseUrl.hostname;
    const hostWithPort = baseUrl.host;
    const protocol = baseUrl.protocol;
    const patterns = new Set<string>([`${protocol}//${hostWithPort}/*`]);

    const isLocalHost =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.endsWith('.localhost');

    if (!isLocalHost) {
      if (host.startsWith('www.')) {
        patterns.add(`${protocol}//${host.slice(4)}/*`);
      } else {
        patterns.add(`${protocol}//www.${host}/*`);
      }
    }

    return Array.from(patterns);
  } catch {
    return ['https://webtomind.com/*', 'https://www.webtomind.com/*'];
  }
}

function cloneAuthState(state: AuthState): AuthState {
  return {
    ...state,
    user: state.user ? { ...state.user } : null
  };
}

function normalizeAuthState(state: AuthState): AuthState {
  if (!state.token || isTokenExpired(state.token)) {
    return {
      ...state,
      token: null,
      isAuthenticated: false
    };
  }

  return state;
}

function setInMemoryAuthState(state: AuthState): void {
  inMemoryAuthState = cloneAuthState(state);
  inMemoryAuthStateUpdatedAt = Date.now();
}

function clearInMemoryAuthState(): void {
  inMemoryAuthState = null;
  inMemoryAuthStateUpdatedAt = 0;
}

/**
 * 获取当前认证状态
 */
export async function getAuthState(options?: {
  forceStorage?: boolean;
}): Promise<AuthState> {
  try {
    const forceStorage = options?.forceStorage === true;
    const now = Date.now();
    if (
      !forceStorage &&
      inMemoryAuthState &&
      now - inMemoryAuthStateUpdatedAt <= AUTH_STATE_MEMORY_TTL_MS
    ) {
      return normalizeAuthState(cloneAuthState(inMemoryAuthState));
    }

    // 优先从 local 读取认证态（更稳定，不受 sync 配额/跨设备冲突影响）
    if (
      typeof chrome !== 'undefined' &&
      chrome.storage &&
      chrome.storage.local
    ) {
      const localResult = await chrome.storage.local.get(AUTH_STORAGE_KEY);
      const localState = localResult[AUTH_STORAGE_KEY] as AuthState | undefined;

      if (localState) {
        const state = normalizeAuthState(localState);
        setInMemoryAuthState(state);
        return cloneAuthState(state);
      }

      // 兼容旧版本：若 local 没有，则回退读取 sync，并迁移到 local
      if (chrome.storage.sync) {
        const syncResult = await chrome.storage.sync.get(AUTH_STORAGE_KEY);
        const syncState = syncResult[AUTH_STORAGE_KEY] as AuthState | undefined;
        const state = normalizeAuthState(syncState || defaultAuthState);
        setInMemoryAuthState(state);

        if (syncState) {
          try {
            await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: state });
          } catch (migrateError) {
            log.warn(
              '[Auth] Migrate auth state to local failed:',
              migrateError
            );
          }
        }

        return cloneAuthState(state);
      }
    }
    const normalizedDefault = normalizeAuthState(defaultAuthState);
    setInMemoryAuthState(normalizedDefault);
    return cloneAuthState(normalizedDefault);
  } catch (error) {
    log.error('[Auth] Get auth state failed:', error);
    clearInMemoryAuthState();
    return cloneAuthState(defaultAuthState);
  }
}

/**
 * 保存认证状态
 */
export async function setAuthState(state: AuthState): Promise<void> {
  try {
    const normalizedState = normalizeAuthState(state);
    setInMemoryAuthState(normalizedState);

    // local 为主存储（关键路径）
    if (
      typeof chrome !== 'undefined' &&
      chrome.storage &&
      chrome.storage.local
    ) {
      await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: normalizedState });
      log.info('[Auth] Auth state saved');

      // sync 仅作兼容备份：失败不阻断主流程
      if (chrome.storage.sync) {
        chrome.storage.sync
          .set({ [AUTH_STORAGE_KEY]: normalizedState })
          .catch((syncError) => {
            log.warn(
              '[Auth] Sync auth state failed (non-blocking):',
              syncError
            );
          });
      }
    }
  } catch (error) {
    clearInMemoryAuthState();
    log.error('[Auth] Save auth state failed:', error);
    throw error;
  }
}

/**
 * 清除认证状态（登出）
 */
export async function clearAuthState(): Promise<void> {
  try {
    clearInMemoryAuthState();

    // local 为主
    if (
      typeof chrome !== 'undefined' &&
      chrome.storage &&
      chrome.storage.local
    ) {
      await chrome.storage.local.remove(AUTH_STORAGE_KEY);
      log.info('[Auth] Auth state cleared');

      // sync 兼容清理：失败不阻断
      if (chrome.storage.sync) {
        chrome.storage.sync.remove(AUTH_STORAGE_KEY).catch((syncError) => {
          log.warn(
            '[Auth] Sync auth state clear failed (non-blocking):',
            syncError
          );
        });
      }
    }
  } catch (error) {
    log.error('[Auth] Clear auth state failed:', error);
    throw error;
  }
}

/**
 * 从 JWT 解析过期时间
 */
function getTokenExpiry(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = parts[1];
    let base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4;
    if (pad) {
      base64 += '='.repeat(4 - pad);
    }
    const jsonStr = atob(base64);
    const data = JSON.parse(jsonStr);

    return data.exp ? data.exp * 1000 : null; // 转换为毫秒
  } catch {
    return null;
  }
}

/**
 * 检查 token 是否已过期或即将过期
 * @param token JWT token
 * @param bufferMs 提前多少毫秒认为即将过期（默认 5 分钟）
 */
export function isTokenExpiringSoon(
  token: string,
  bufferMs: number = 5 * 60 * 1000
): boolean {
  const expiry = getTokenExpiry(token);
  if (!expiry) return true; // 无法解析视为过期

  return Date.now() + bufferMs >= expiry;
}

/**
 * 检查 token 是否已完全过期
 */
export function isTokenExpired(token: string): boolean {
  const expiry = getTokenExpiry(token);
  if (!expiry) return true;

  return Date.now() >= expiry;
}

/**
 * 获取访问令牌
 */
export async function getAccessToken(): Promise<string | null> {
  const state = await getAuthState();
  return state.token;
}

/**
 * 检查是否已认证
 */
export async function isAuthenticated(): Promise<boolean> {
  const state = await getAuthState();
  return state.isAuthenticated && !!state.token;
}

/**
 * 验证 Token 有效性
 */
export async function verifyToken(
  token: string
): Promise<{ valid: boolean; user?: AuthUser }> {
  try {
    // 获取 API 基础 URL（生产环境使用当前域名）
    const API_BASE = getApiBaseUrl();

    const response = await fetch(`${API_BASE}/api/auth/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(API_TIMEOUT_MS)
    });

    const data = await response.json();
    return {
      valid: data.valid,
      user: data.user
    };
  } catch (error) {
    log.error('[Auth] Verify token failed:', error);
    return { valid: false };
  }
}

/**
 * 使用 Token 登录（从 Web 端接收）
 * 注意：Token 来自 Supabase Auth，已经过验证，无需再次验证
 */
export async function loginWithToken(
  token: string,
  user: AuthUser,
  refreshToken?: string
): Promise<void> {
  // Supabase 的 token 已经是经过验证的，直接保存认证状态
  // 不再调用额外的验证端点，避免网络请求失败
  if (!token || !user) {
    throw new Error('Token 或用户信息无效');
  }

  if (
    inFlightLoginPromise &&
    inFlightLoginToken &&
    inFlightLoginToken === token
  ) {
    log.info('[Auth] Dedup login: awaiting in-flight save for same token');
    await inFlightLoginPromise;
    return;
  }

  if (
    lastCommittedLoginToken === token &&
    Date.now() - lastCommittedLoginAt < LOGIN_DEDUP_WINDOW_MS
  ) {
    log.info('[Auth] Dedup login: skip repeated token save in dedup window');
    return;
  }

  log.info(
    '[Auth] Saving auth state for user:',
    safeLog(user.email, maskEmail),
    'refreshToken:',
    refreshToken ? 'present' : 'missing'
  );

  inFlightLoginToken = token;
  inFlightLoginPromise = (async () => {
    // 获取现有状态以保留 refreshToken（如果新的没有提供）
    const existingState = await getAuthState();

    // 保存认证状态
    await setAuthState({
      token,
      refreshToken: refreshToken || existingState.refreshToken || null,
      user: {
        ...user,
        // 如果 user 对象中没有这些字段，尝试从已有状态中保留，
        // 以防止刷新时丢失这些重要信息
        member_number: user.member_number || existingState.user?.member_number,
        member_number_formatted:
          user.member_number_formatted ||
          existingState.user?.member_number_formatted,
        days_joined: user.days_joined || existingState.user?.days_joined
      },
      isAuthenticated: true
    });

    const savedState = await getAuthState();
    if (!savedState.token) {
      log.warn('[Auth] Login token became invalid immediately after save', {
        user: safeLog(user.email, maskEmail)
      });
      throw new Error('登录态写入失败：token 无效');
    }

    lastCommittedLoginToken = token;
    lastCommittedLoginAt = Date.now();

    log.info(
      '[Auth] Login successful, saved refreshToken:',
      refreshToken || existingState.refreshToken ? 'present' : 'missing'
    );
  })();

  try {
    await inFlightLoginPromise;
  } finally {
    inFlightLoginPromise = null;
    inFlightLoginToken = null;
  }
}

/**
 * 登出
 */
export async function logout(): Promise<void> {
  log.info('[Auth] Logging out, clearing state and broadcasting...');
  await clearAuthState();
  await broadcastAuthStateChanged();
}

/**
 * 打开 Web 登录页面
 */
export function openLoginPage(): void {
  // 使用统一的 URL 常量
  chrome.tabs.create({
    url: APP_URLS.LOGIN
  });
}

/**
 * 广播认证状态变更到所有标签页和 popup/sidepanel
 * 使用 chrome.tabs.sendMessage 发送到 content scripts
 * 使用 chrome.runtime.sendMessage 发送到 popup/sidepanel
 */
const AUTH_SYNC_DIAG_KEY = 'auth_sync_diagnostics';

async function appendAuthSyncDiagnostic(
  stage: string,
  extra?: Record<string, unknown>
): Promise<void> {
  try {
    const now = Date.now();
    const existing = await chrome.storage.local.get(AUTH_SYNC_DIAG_KEY);
    const history = Array.isArray(existing[AUTH_SYNC_DIAG_KEY])
      ? (existing[AUTH_SYNC_DIAG_KEY] as Array<Record<string, unknown>>)
      : [];

    history.push({
      stage,
      at: now,
      iso: new Date(now).toISOString(),
      ...extra
    });

    await chrome.storage.local.set({
      [AUTH_SYNC_DIAG_KEY]: history.slice(-60)
    });
  } catch {
    // ignore diagnostics persistence errors
  }
}

// broadcastAuthStateChanged imported from '@/utils/chrome-helpers'

/**
 * 监听来自 Web 页面的认证消息
 */
export function setupAuthListener(): void {
  // 用于去重的变量：记录最近处理的 token（避免重复处理相同的 AUTH_SUCCESS 消息）
  let lastProcessedToken: string | null = null;
  let lastProcessedTime = 0;
  const DEDUP_WINDOW_MS = 5000; // 5秒内的相同 token 视为重复
  let lastLogoutProcessedTime = 0;
  const LOGOUT_DEDUP_WINDOW_MS = 3000;

  // 监听来自 content script 的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 处理登录成功
    if (message.type === 'AUTH_SUCCESS' || message.action === 'AUTH_SUCCESS') {
      void appendAuthSyncDiagnostic('auth_success_received', {
        sender: sender.url || sender.tab?.url || 'unknown',
        hasToken: !!message.token,
        hasRefreshToken: !!message.refreshToken
      });
      if (!isTrustedAuthSender(sender)) {
        log.warn(
          '[Auth] Rejected AUTH_SUCCESS from untrusted sender:',
          sender.url
        );
        sendResponse({ success: false, error: 'Untrusted auth source' });
        return true;
      }

      const currentTime = Date.now();
      const token = message.token;

      // 去重检查：如果在去重窗口内收到相同的 token，跳过处理
      if (
        token === lastProcessedToken &&
        currentTime - lastProcessedTime < DEDUP_WINDOW_MS
      ) {
        log.info(
          '[Auth] Duplicate AUTH_SUCCESS ignored (same token within dedup window)'
        );
        sendResponse({ success: true, deduplicated: true });
        return true;
      }

      // 更新去重状态
      lastProcessedToken = token;
      lastProcessedTime = currentTime;

      log.info(
        '[Auth] Received auth success from web, token size:',
        token?.length,
        'refreshToken:',
        message.refreshToken ? 'present' : 'missing'
      );

      loginWithToken(message.token, message.user, message.refreshToken)
        .then(async () => {
          void appendAuthSyncDiagnostic('auth_success_persisted', {
            sender: sender.url || sender.tab?.url || 'unknown'
          });
          sendResponse({ success: true });
          // 获取完整的用户资料（包括 member_number 和 days_joined）
          await refreshUserInfo();
          // 广播认证状态变更到所有标签页和 popup/sidepanel
          await broadcastAuthStateChanged();
        })
        .catch((error) => {
          void appendAuthSyncDiagnostic('auth_success_failed', {
            sender: sender.url || sender.tab?.url || 'unknown',
            error: error instanceof Error ? error.message : String(error)
          });
          log.error('[Auth] Login failed:', error);
          sendResponse({ success: false, error: error.message });
        });

      return true; // 保持消息通道打开
    }

    // 处理登出
    if (message.type === 'AUTH_LOGOUT' || message.action === 'AUTH_LOGOUT') {
      if (!isTrustedAuthSender(sender)) {
        log.warn(
          '[Auth] Rejected AUTH_LOGOUT from untrusted sender:',
          sender.url
        );
        sendResponse({ success: false, error: 'Untrusted auth source' });
        return true;
      }

      const now = Date.now();
      if (now - lastLogoutProcessedTime < LOGOUT_DEDUP_WINDOW_MS) {
        log.info('[Auth] Duplicate AUTH_LOGOUT ignored (within dedup window)');
        sendResponse({ success: true, deduplicated: true });
        return true;
      }
      lastLogoutProcessedTime = now;

      log.info('[Auth] Received logout from web');

      logout()
        .then(() => {
          sendResponse({ success: true });
        })
        .catch((error) => {
          log.error('[Auth] Logout failed:', error);
          sendResponse({ success: false, error: error.message });
        });

      return true; // 保持消息通道打开
    }

    // 处理主动检查认证状态的请求
    if (message.type === 'CHECK_AUTH_STATE') {
      void appendAuthSyncDiagnostic('check_auth_state_received', {
        sender: sender.url || sender.tab?.url || 'unknown',
        tabId: sender.tab?.id || null
      });
      log.info('[Auth] Received auth state check request from content script');

      // 向发送请求的 tab 页面请求当前的认证状态
      if (sender.tab?.id) {
        chrome.tabs
          .sendMessage(sender.tab.id, {
            type: 'REQUEST_AUTH_STATE'
          })
          .then(() => {
            void appendAuthSyncDiagnostic('request_auth_state_sent', {
              tabId: sender.tab?.id || null
            });
          })
          .catch((error) => {
            void appendAuthSyncDiagnostic('request_auth_state_failed', {
              tabId: sender.tab?.id || null,
              error: error instanceof Error ? error.message : String(error)
            });
            log.info('[Auth] Tab already closed or no listener:', error);
          });
      }

      sendResponse({ success: true });
      return true;
    }
  });
}

// 用于防止并发刷新
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;
// 防抖：记录上次刷新时间，30秒内不重复刷新
let lastRefreshTime = 0;
let lastRefreshSucceeded = false;
const REFRESH_DEBOUNCE_MS = 30 * 1000; // 30秒防抖
const OPEN_WEB_PAGE_COOLDOWN_MS = 10 * 60 * 1000; // 10分钟冷却，避免频繁拉起网页
let lastOpenWebPageTime = 0;
// getValidAccessToken 并发锁：防止多个调用者各自触发 requestTokenRefresh
let validTokenPromise: Promise<string | null> | null = null;
const AUTH_SYNC_TAB_QUERY_PATTERNS = getAuthSyncTabQueryPatterns();
const AUTH_SYNC_TAB_LOAD_WAIT_MS = 2500;
const AUTH_SYNC_TAB_CLOSE_DELAY_MS = 3000;

type SupabaseRefreshResponse = {
  access_token?: string;
  refresh_token?: string;
  user?: {
    id?: string;
    email?: string;
    user_metadata?: {
      username?: string;
      picture?: string;
      avatar_url?: string;
    };
  };
};

// isReceiverUnavailableError imported from '@/utils/chrome-helpers'

function getContentScriptFilePathFromManifest(): string | null {
  const manifest = chrome.runtime.getManifest();
  const contentScripts = manifest.content_scripts ?? [];

  for (const contentScript of contentScripts) {
    const jsFiles = contentScript.js ?? [];
    const loaderFile = jsFiles.find((file) => file.includes('loader'));
    if (loaderFile) return loaderFile;
  }

  for (const contentScript of contentScripts) {
    const firstFile = contentScript.js?.[0];
    if (firstFile) return firstFile;
  }

  return null;
}

async function injectContentScriptForAuthSync(tabId: number): Promise<boolean> {
  try {
    if (!chrome.scripting?.executeScript) {
      return false;
    }

    const contentScriptFilePath = getContentScriptFilePathFromManifest();
    if (!contentScriptFilePath) {
      log.warn(
        '[Auth] Cannot inject for auth sync: content script path missing'
      );
      return false;
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      files: [contentScriptFilePath]
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    return true;
  } catch (error) {
    log.warn('[Auth] Inject content script for auth sync failed', {
      tabId,
      reason: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

/**
 * 请求 Web 端刷新 token
 * 只向打开的 webtomind.com 页面请求，避免与 Web 端并发刷新产生 refresh token 冲突
 * @returns 是否成功刷新
 */
export async function requestTokenRefresh(options?: {
  openWebPageIfMissing?: boolean;
}): Promise<boolean> {
  // 防止并发刷新
  if (isRefreshing && refreshPromise) {
    log.info('[Auth] Token refresh already in progress, waiting...');
    return refreshPromise;
  }

  // 防抖：30秒内不重复刷新
  // 例外：上一次刷新失败且本次允许“打开网页兜底”时，放行一次，避免 silent->fallback 连续调用被防抖吞掉
  const now = Date.now();
  const shouldBypassDebounceForFallback =
    options?.openWebPageIfMissing === true && !lastRefreshSucceeded;
  if (
    !shouldBypassDebounceForFallback &&
    now - lastRefreshTime < REFRESH_DEBOUNCE_MS
  ) {
    log.info(
      '[Auth] Token refresh debounced, last refresh was',
      Math.round((now - lastRefreshTime) / 1000),
      'seconds ago'
    );
    return lastRefreshSucceeded;
  }

  isRefreshing = true;
  lastRefreshTime = now;
  refreshPromise = (async () => {
    try {
      log.info('[Auth] Requesting token refresh from web pages...');
      const shouldOpenWebPage = options?.openWebPageIfMissing ?? false;

      const requestAuthStateFromTabs = async (
        tabs: chrome.tabs.Tab[],
        oldToken: string | null
      ): Promise<boolean> => {
        const diagnostics = {
          tabCount: tabs.length,
          tabIds: tabs.map((tab) => tab.id).filter((id): id is number => !!id),
          requestSent: 0,
          requestSendFailed: 0,
          requestRetried: 0,
          requestRetryFailed: 0,
          sendFailures: [] as Array<{ tabId: number; reason: string }>,
          authMessagesReceived: 0,
          duplicateTokenMessages: 0
        };

        log.info('[Auth] Requesting auth state from tabs:', {
          tabCount: diagnostics.tabCount,
          tabIds: diagnostics.tabIds
        });

        return await new Promise<boolean>((resolve) => {
          let resolved = false;
          const startTime = Date.now();
          const timeout = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              log.warn('[Auth] Token refresh timeout from web auth sync', {
                waitedMs: Date.now() - startTime,
                ...diagnostics
              });
              chrome.runtime.onMessage.removeListener(authListener);
              resolve(false);
            }
          }, 8000);

          const authListener = (
            message: unknown,
            sender: chrome.runtime.MessageSender
          ) => {
            diagnostics.authMessagesReceived += 1;
            if (!message || typeof message !== 'object') {
              return;
            }

            const payload = message as {
              type?: string;
              action?: string;
              token?: string;
              user?: AuthUser;
              refreshToken?: string;
            };
            const isAuthMessage =
              payload.type === 'AUTH_SUCCESS' ||
              payload.action === 'AUTH_SUCCESS';
            if (isAuthMessage && payload.token && !resolved) {
              if (!isTrustedAuthSender(sender)) {
                log.warn(
                  '[Auth] Ignored AUTH_SUCCESS in refresh flow from untrusted sender',
                  {
                    sender: sender.url || sender.tab?.url || 'unknown'
                  }
                );
                return;
              }

              if (payload.token === oldToken) {
                diagnostics.duplicateTokenMessages += 1;
                log.info(
                  '[Auth] Received same token from web, ignored for refresh',
                  {
                    sender: sender.url || sender.tab?.url || 'unknown',
                    ...diagnostics
                  }
                );
                return;
              }

              resolved = true;
              clearTimeout(timeout);
              chrome.runtime.onMessage.removeListener(authListener);

              loginWithToken(
                payload.token,
                payload.user as AuthUser,
                payload.refreshToken
              )
                .then(() => {
                  log.info('[Auth] Token refreshed successfully via web', {
                    sender: sender.url || sender.tab?.url || 'unknown',
                    elapsedMs: Date.now() - startTime,
                    ...diagnostics
                  });
                  resolve(true);
                })
                .catch((err) => {
                  log.error('[Auth] Failed to save refreshed token:', err, {
                    sender: sender.url || sender.tab?.url || 'unknown',
                    elapsedMs: Date.now() - startTime,
                    ...diagnostics
                  });
                  resolve(false);
                });
            }
          };

          chrome.runtime.onMessage.addListener(authListener);

          tabs.forEach((tab) => {
            if (!tab.id) return;
            chrome.tabs
              .sendMessage(tab.id, { type: 'REQUEST_AUTH_STATE' })
              .then(() => {
                diagnostics.requestSent += 1;
              })
              .catch((error) => {
                diagnostics.requestSendFailed += 1;
                const reason =
                  error instanceof Error ? error.message : String(error);
                diagnostics.sendFailures.push({
                  tabId: tab.id as number,
                  reason
                });
                log.info('[Auth] REQUEST_AUTH_STATE send failed on tab', {
                  tabId: tab.id,
                  reason
                });

                if (!isReceiverUnavailableError(error)) {
                  return;
                }

                void (async () => {
                  const injected = await injectContentScriptForAuthSync(
                    tab.id as number
                  );
                  if (!injected) {
                    diagnostics.requestRetryFailed += 1;
                    return;
                  }

                  try {
                    await chrome.tabs.sendMessage(tab.id as number, {
                      type: 'REQUEST_AUTH_STATE'
                    });
                    diagnostics.requestRetried += 1;
                    diagnostics.requestSent += 1;
                    log.info(
                      '[Auth] REQUEST_AUTH_STATE retry success after injection',
                      {
                        tabId: tab.id
                      }
                    );
                  } catch (retryError) {
                    diagnostics.requestRetryFailed += 1;
                    const retryReason =
                      retryError instanceof Error
                        ? retryError.message
                        : String(retryError);
                    diagnostics.sendFailures.push({
                      tabId: tab.id as number,
                      reason: `retry:${retryReason}`
                    });
                    log.warn(
                      '[Auth] REQUEST_AUTH_STATE retry failed after injection',
                      {
                        tabId: tab.id,
                        reason: retryReason
                      }
                    );
                  }
                })();
              });
          });
        });
      };

      const tryOpenWebPageAndSync = async (
        oldToken: string | null
      ): Promise<boolean> => {
        const now = Date.now();
        if (now - lastOpenWebPageTime < OPEN_WEB_PAGE_COOLDOWN_MS) {
          log.warn(
            '[Auth] Skip opening web page due to cooldown, waiting for manual sync'
          );
          return false;
        }

        // 先检查是否已有匹配的标签页（可能由其他调用者刚刚创建）
        const existingTabs = await chrome.tabs.query({
          url: AUTH_SYNC_TAB_QUERY_PATTERNS
        });

        let createdTabId: number | undefined;
        if (existingTabs.length > 0) {
          log.info(
            '[Auth] Found existing webtomind.com tab(s), skipping tab creation',
            {
              tabCount: existingTabs.length
            }
          );
        } else {
          log.warn('[Auth] Opening web page to recover auth sync');
          const createdTab = await chrome.tabs.create({
            url: APP_URLS.WORKSPACE,
            active: false
          });
          createdTabId = createdTab.id;
          await new Promise((resolve) =>
            setTimeout(resolve, AUTH_SYNC_TAB_LOAD_WAIT_MS)
          );
        }

        lastOpenWebPageTime = now;

        const refreshedTabs = await chrome.tabs.query({
          url: AUTH_SYNC_TAB_QUERY_PATTERNS
        });

        if (refreshedTabs.length === 0) {
          log.warn('[Auth] Opened web page but no sync tab detected');
          return false;
        }

        log.info('[Auth] Web page opened, requesting auth state sync');
        const result = await requestAuthStateFromTabs(refreshedTabs, oldToken);

        if (createdTabId) {
          setTimeout(() => {
            chrome.tabs.remove(createdTabId).catch(() => {
              // 标签页可能已被用户关闭，忽略
            });
          }, AUTH_SYNC_TAB_CLOSE_DELAY_MS);
        }

        return result;
      };

      const tryDirectRefreshWithStoredToken = async (): Promise<boolean> => {
        const currentState = await getAuthState({ forceStorage: true });
        const refreshToken = currentState.refreshToken;
        if (!refreshToken) {
          log.warn('[Auth] Direct refresh skipped: no stored refresh token');
          return false;
        }

        const supabaseConfig = await getSupabaseConfig();
        if (!supabaseConfig?.url || !supabaseConfig?.anonKey) {
          log.warn('[Auth] Direct refresh skipped: missing Supabase config');
          return false;
        }

        try {
          const response = await fetch(
            `${supabaseConfig.url}/auth/v1/token?grant_type=refresh_token`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: supabaseConfig.anonKey
              },
              body: JSON.stringify({
                refresh_token: refreshToken
              }),
              signal: AbortSignal.timeout(API_TIMEOUT_MS)
            }
          );

          if (!response.ok) {
            const responseText = await response.text().catch(() => '');
            log.warn('[Auth] Direct refresh failed:', {
              status: response.status,
              body: responseText.slice(0, 200)
            });
            return false;
          }

          const refreshed = (await response.json()) as SupabaseRefreshResponse;
          if (!refreshed.access_token) {
            log.warn(
              '[Auth] Direct refresh failed: missing access token in response'
            );
            return false;
          }

          const refreshedUser = refreshed.user;
          const userId = refreshedUser?.id || currentState.user?.id;
          const email = refreshedUser?.email || currentState.user?.email;
          if (!userId || !email) {
            log.warn('[Auth] Direct refresh failed: missing user identity');
            return false;
          }

          const avatarUrl =
            refreshedUser?.user_metadata?.picture ||
            refreshedUser?.user_metadata?.avatar_url ||
            currentState.user?.avatar_url;

          await loginWithToken(
            refreshed.access_token,
            {
              id: userId,
              email,
              username:
                refreshedUser?.user_metadata?.username ||
                currentState.user?.username,
              avatar_url: avatarUrl,
              member_number: currentState.user?.member_number,
              member_number_formatted:
                currentState.user?.member_number_formatted,
              days_joined: currentState.user?.days_joined
            },
            refreshed.refresh_token || refreshToken
          );

          log.info('[Auth] Token refreshed successfully via direct refresh');
          return true;
        } catch (error) {
          log.warn('[Auth] Direct refresh request failed:', error);
          return false;
        }
      };

      // 查找所有 webtomind.com 的标签页
      const tabs = await chrome.tabs.query({
        url: AUTH_SYNC_TAB_QUERY_PATTERNS
      });

      // 获取现有 token 用于比较
      const oldState = await getAuthState({ forceStorage: true });
      const oldToken = oldState.token;

      // 如果有打开的 Web 页面，优先从 Web 页面获取
      if (tabs.length > 0) {
        log.info('[Auth] Found', tabs.length, 'webtomind.com tabs');
        const refreshResult = await requestAuthStateFromTabs(tabs, oldToken);

        // 如果从 web 获取成功，直接返回
        if (refreshResult) {
          lastRefreshSucceeded = true;
          return true;
        }

        if (shouldOpenWebPage) {
          const openedSyncResult = await tryOpenWebPageAndSync(oldToken);
          if (openedSyncResult) {
            lastRefreshSucceeded = true;
            return true;
          }
        }
      } else {
        if (!shouldOpenWebPage) {
          log.warn(
            '[Auth] No webtomind.com tabs found, skip opening page in background refresh mode',
            {
              hasRefreshToken: !!oldState.refreshToken,
              hasUser: !!oldState.user,
              isAuthenticated: oldState.isAuthenticated,
              hadAccessToken: !!oldToken
            }
          );
          const directRefreshResult = await tryDirectRefreshWithStoredToken();
          if (!directRefreshResult) {
            log.warn(
              '[Auth] Background refresh failed without web tab; inspect refresh token persistence',
              {
                hasRefreshToken: !!oldState.refreshToken,
                hasUser: !!oldState.user,
                isAuthenticated: oldState.isAuthenticated
              }
            );
          }
          lastRefreshSucceeded = directRefreshResult;
          return directRefreshResult;
        }

        const openedSyncResult = await tryOpenWebPageAndSync(oldToken);
        if (openedSyncResult) {
          lastRefreshSucceeded = true;
          return true;
        }
      }

      const directRefreshResult = await tryDirectRefreshWithStoredToken();
      if (directRefreshResult) {
        lastRefreshSucceeded = true;
        return true;
      }

      log.warn('[Auth] Token refresh failed via web sync and direct refresh');
      lastRefreshSucceeded = false;
      return false;
    } catch (error) {
      log.error('[Auth] Token refresh failed:', error);
      lastRefreshSucceeded = false;
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * 获取有效的 token，如果即将过期则尝试刷新
 * @returns 有效的 token 或 null
 */
export async function getValidAccessToken(): Promise<string | null> {
  // 并发锁：多个调用者共享同一次恢复流程，防止各自触发 requestTokenRefresh 导致重复开标签页
  if (validTokenPromise) {
    log.info('[Auth] getValidAccessToken already in progress, waiting...');
    return validTokenPromise;
  }

  validTokenPromise = _getValidAccessTokenImpl();
  try {
    return await validTokenPromise;
  } finally {
    validTokenPromise = null;
  }
}

async function _getValidAccessTokenImpl(): Promise<string | null> {
  const state = await getAuthState();
  const token = state.token;

  if (!token) {
    if (state.refreshToken || state.user || state.isAuthenticated) {
      log.info(
        '[Auth] Access token missing, attempting silent session recovery'
      );

      const refreshed = await requestTokenRefresh({
        openWebPageIfMissing: false
      });
      if (refreshed) {
        const recoveredState = await getAuthState();
        if (recoveredState.token) {
          return recoveredState.token;
        }
      }

      log.warn(
        '[Auth] Silent session recovery failed, attempting web sync fallback'
      );
      const recovered = await requestTokenRefresh({
        openWebPageIfMissing: true
      });

      if (recovered) {
        const recoveredState = await getAuthState();
        if (recoveredState.token) {
          return recoveredState.token;
        }
      }
    }
    return null;
  }

  // 检查 token 是否即将过期（2分钟内）
  if (isTokenExpiringSoon(token, 2 * 60 * 1000)) {
    log.info('[Auth] Token is expiring soon, attempting refresh...');

    // 默认仅静默刷新：不自动打开 web 页面，避免插件使用中突然打断。
    const refreshed = await requestTokenRefresh({
      openWebPageIfMissing: false
    });
    if (refreshed) {
      // 获取刷新后的 token
      const newState = await getAuthState();
      return newState.token;
    }

    // 刷新失败，但如果 token 还没完全过期，继续使用
    if (!isTokenExpired(token)) {
      log.warn(
        '[Auth] Refresh failed but token still valid, using existing token'
      );
      return token;
    }

    log.warn('[Auth] Token expired and refresh failed');

    // token 已过期时，做一次兜底恢复：允许静默拉起 web 页面同步最新会话
    const recovered = await requestTokenRefresh({ openWebPageIfMissing: true });
    if (recovered) {
      const recoveredState = await getAuthState();
      if (recoveredState.token) {
        log.info('[Auth] Recovered token via fallback web sync');
        return recoveredState.token;
      }
    }

    // 状态机收口：刷新失败且 token 已过期时，立刻切换到未登录态，
    // 避免前端继续显示”已登录”并产生连续 401。
    await setAuthState({
      ...state,
      token: null,
      isAuthenticated: false
    });

    return null;
  }

  return token;
}

/**
 * 刷新用户信息
 * 策略：1小时内只允许刷新一次，除非没有用户信息
 * 注意：此函数不会在 401 时立即清除登录状态，而是返回 null 并保留现有状态
 * 只有在用户主动登出或 Web 端明确发送 AUTH_LOGOUT 时才清除状态
 */
export async function refreshUserInfo(force = false): Promise<AuthUser | null> {
  let state = await getAuthState();

  if (!state.token) {
    return null;
  }

  // 1小时节流 (3600000ms)
  const THROTTLE_THRESHOLD = 3600000;
  const now = Date.now();
  if (
    !force &&
    state.user &&
    state.lastRefreshTime &&
    now - state.lastRefreshTime < THROTTLE_THRESHOLD
  ) {
    log.info('[Auth] Skipping user info refresh (throttled)');
    return state.user;
  }

  // 内部函数：尝试获取用户信息
  const tryFetchUserInfo = async (token: string): Promise<Response> => {
    // 生产环境使用当前域名，避免 CORS
    const API_BASE =
      typeof window !== 'undefined' && window.location.hostname !== 'localhost'
        ? window.location.origin
        : 'https://webtomind.com';
    return await fetch(`${API_BASE}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      signal: AbortSignal.timeout(API_TIMEOUT_MS)
    });
  };

  try {
    let response = await tryFetchUserInfo(state.token);

    // 如果遇到 401，尝试刷新 token 后重试
    if (response.status === 401) {
      // 尝试获取错误详情
      const errorBody = await response.text();
      log.info('[Auth] Token expired (401), error details:', errorBody);
      log.info('[Auth] Attempting token refresh...');

      const refreshed = await requestTokenRefresh();
      if (refreshed) {
        // 给 storage 一点同步时间
        await new Promise((resolve) => setTimeout(resolve, 100));
        // 获取刷新后的 token
        state = await getAuthState();
        if (state.token) {
          log.info('[Auth] Token refreshed, retrying request...');
          response = await tryFetchUserInfo(state.token);

          // 如果仍然失败，记录详细错误
          if (!response.ok) {
            const retryErrorBody = await response.clone().text();
            log.error(
              '[Auth] Retry failed, status:',
              response.status,
              'error:',
              retryErrorBody
            );
          }
        }
      }

      // 如果刷新失败或重试后仍然 401，且我们已有用户信息，先保留现有的用户信息
      if (!response.ok) {
        log.warn(
          '[Auth] Token refresh failed or still invalid (401), using existing user info if available'
        );
        return state.user;
      }
    }

    if (!response.ok) {
      log.error('[Auth] Failed to fetch user info:', response.status);
      return state.user; // 返回现有用户信息作为兜底
    }

    const data = await response.json();
    const newUser = data.user || data; // 处理不同的 API 响应格式

    // 更新存储的用户信息和刷新时间
    await setAuthState({
      ...state,
      user: {
        ...state.user,
        ...newUser
      },
      lastRefreshTime: now
    });

    log.info('[Auth] User info refreshed successfully');
    return data.user;
  } catch (error) {
    log.error('[Auth] Refresh user info failed:', error);
    return state.user;
  }
}
