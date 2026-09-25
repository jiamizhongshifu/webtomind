/**
 * 主题管理工具
 * 支持浅色、深色、跟随系统三种模式
 */

export type Theme = 'light' | 'dark' | 'system';

const THEME_STORAGE_KEY = 'webtomind_theme';

/**
 * 获取存储的主题设置
 */
export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'light'; // 默认浅色
}

/**
 * 保存主题设置
 */
export function setStoredTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

/**
 * 获取系统偏好的主题
 */
export function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/**
 * 获取实际应用的主题（解析 system 为具体值）
 */
export function getResolvedTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return getSystemTheme();
  }
  return theme;
}

/**
 * 应用主题到 DOM
 */
export function applyTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;

  const resolved = getResolvedTheme(theme);
  const root = document.documentElement;

  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  // 更新 meta theme-color
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute(
      'content',
      resolved === 'dark' ? '#000000' : '#ffffff'
    );
  }
}

/**
 * 初始化主题（在应用启动时调用）
 */
export function initTheme(): Theme {
  const theme = getStoredTheme();
  applyTheme(theme);

  // 监听系统主题变化
  if (typeof window !== 'undefined') {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', () => {
      const currentTheme = getStoredTheme();
      if (currentTheme === 'system') {
        applyTheme('system');
      }
    });
  }

  return theme;
}

/**
 * 切换主题
 */
export function changeTheme(theme: Theme): void {
  setStoredTheme(theme);
  applyTheme(theme);
}
