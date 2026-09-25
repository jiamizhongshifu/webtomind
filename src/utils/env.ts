/**
 * 环境检测工具函数
 * 提供统一的环境检测方法
 */

/**
 * 检测是否在 Chrome 扩展环境中
 * @returns true 如果在扩展环境中运行
 */
export function isExtensionEnv(): boolean {
  // Web 构建环境强制返回 false
  if (import.meta.env?.VITE_FORCE_HTTP_API === 'true') {
    return false;
  }
  try {
    return (
      typeof chrome !== 'undefined' &&
      typeof chrome.runtime !== 'undefined' &&
      typeof chrome.runtime.sendMessage === 'function' &&
      typeof chrome.runtime.onMessage !== 'undefined' &&
      !!chrome.runtime.id
    );
  } catch {
    return false;
  }
}

/**
 * 检测是否在开发环境中
 * @returns true 如果在开发环境中运行
 */
export function isDevelopment(): boolean {
  return (
    import.meta.env?.DEV === true || import.meta.env?.MODE === 'development'
  );
}

/**
 * 检测是否在生产环境中
 * @returns true 如果在生产环境中运行
 */
export function isProduction(): boolean {
  return (
    import.meta.env?.PROD === true || import.meta.env?.MODE === 'production'
  );
}

/** Whether a hostname resolves to the current machine's local preview. */
export function isLoopbackHostname(hostname: string): boolean {
  return ['localhost', '127.0.0.1', '::1'].includes(hostname);
}

/**
 * Test-only authentication bypass.
 *
 * The build flag alone is deliberately insufficient: preview builds are
 * occasionally reused by local audit tooling, so the bypass must also be
 * running on a loopback origin. This keeps an accidentally configured
 * production deployment from manufacturing an authenticated E2E identity.
 */
export function isE2EAuthBypassEnabled(
  hostname = typeof window !== 'undefined' ? window.location.hostname : ''
): boolean {
  return (
    import.meta.env?.VITE_E2E_BYPASS_AUTH === '1' &&
    isLoopbackHostname(hostname)
  );
}

/**
 * 获取 API 基础地址
 * @returns API 基础 URL
 */
export function getApiBaseUrl(): string {
  // 优先使用环境变量
  const envApiBase = import.meta.env?.VITE_API_BASE;
  if (envApiBase && envApiBase.length > 0) {
    return envApiBase;
  }

  // Browser previews served by the Worker use same-origin APIs on both local
  // and production hosts. Standalone Vite users can still override this with
  // VITE_API_BASE.
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  // Non-browser fallback for scripts/tests that do not define a base URL.
  return 'http://localhost:3000';
}
