/**
 * 性能监控服务
 * 跟踪 API 请求、组件渲染、关键操作的耗时
 */

// 性能指标存储
interface PerfMetric {
  name: string;
  duration: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// 进行中的计时
const activeTimers = new Map<string, number>();

// 性能指标历史（最多保留 100 条）
const metricsHistory: PerfMetric[] = [];
const MAX_HISTORY = 100;

// API 请求统计
interface ApiStats {
  count: number;
  totalDuration: number;
  avgDuration: number;
  slowest: number;
  fastest: number;
}

const apiStats = new Map<string, ApiStats>();

/**
 * 是否启用性能监控
 * 开发环境默认启用，生产环境可通过 localStorage 开启
 */
function isEnabled(): boolean {
  if (typeof window === 'undefined') return false;

  // 生产环境检查 localStorage 开关
  if (!import.meta.env.DEV) {
    return localStorage.getItem('perf_monitor_enabled') === 'true';
  }

  return true;
}

/**
 * 开始计时
 */
export function startTimer(
  name: string,
  metadata?: Record<string, unknown>
): void {
  if (!isEnabled()) return;

  activeTimers.set(name, performance.now());

  if (metadata) {
    console.log(`[Perf] ⏱️ Start: ${name}`, metadata);
  }
}

/**
 * 结束计时并记录
 */
export function endTimer(
  name: string,
  metadata?: Record<string, unknown>
): number {
  if (!isEnabled()) return 0;

  const startTime = activeTimers.get(name);
  if (!startTime) {
    console.warn(`[Perf] Timer not found: ${name}`);
    return 0;
  }

  const duration = performance.now() - startTime;
  activeTimers.delete(name);

  // 记录指标
  const metric: PerfMetric = {
    name,
    duration,
    timestamp: Date.now(),
    metadata
  };

  metricsHistory.push(metric);
  if (metricsHistory.length > MAX_HISTORY) {
    metricsHistory.shift();
  }

  // 根据耗时选择日志颜色
  const color =
    duration > 1000 ? '#EF4444' : duration > 300 ? '#F59E0B' : '#10B981';
  console.log(
    `%c[Perf] ✓ ${name}: ${duration.toFixed(2)}ms`,
    `color: ${color}; font-weight: bold`,
    metadata || ''
  );

  return duration;
}

/**
 * 计时装饰器（用于异步函数）
 */
export function withTiming<T>(
  name: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  if (!isEnabled()) return fn();

  startTimer(name, metadata);
  return fn().finally(() => {
    endTimer(name, metadata);
  });
}

/**
 * 记录 API 请求
 */
export function recordApiRequest(
  endpoint: string,
  duration: number,
  status: number,
  method: string = 'GET'
): void {
  if (!isEnabled()) return;

  // 归一化 endpoint（移除 ID 等动态部分）
  const normalizedEndpoint = endpoint
    .replace(/\/[a-f0-9-]{36}/g, '/:id')
    .replace(/\/\d+/g, '/:id');

  const key = `${method} ${normalizedEndpoint}`;
  const existing = apiStats.get(key) || {
    count: 0,
    totalDuration: 0,
    avgDuration: 0,
    slowest: 0,
    fastest: Infinity
  };

  existing.count += 1;
  existing.totalDuration += duration;
  existing.avgDuration = existing.totalDuration / existing.count;
  existing.slowest = Math.max(existing.slowest, duration);
  existing.fastest = Math.min(existing.fastest, duration);

  apiStats.set(key, existing);

  // 慢请求警告（超过 2 秒）
  if (duration > 2000) {
    console.warn(
      `[Perf] ⚠️ Slow API: ${key} took ${duration.toFixed(0)}ms (status: ${status})`
    );
  }
}

/**
 * 获取 API 统计报告
 */
export function getApiReport(): Record<string, ApiStats> {
  return Object.fromEntries(apiStats);
}

/**
 * 获取性能指标历史
 */
export function getMetricsHistory(): PerfMetric[] {
  return [...metricsHistory];
}

/**
 * 打印性能报告到控制台
 */
export function printReport(): void {
  console.group(
    '%c[Perf] Performance Report',
    'color: #8B5CF6; font-weight: bold'
  );

  // API 统计
  console.log('%cAPI Statistics:', 'color: #3B82F6; font-weight: bold');
  const apiReportData = Array.from(apiStats.entries()).map(
    ([endpoint, stats]) => ({
      endpoint,
      calls: stats.count,
      'avg (ms)': stats.avgDuration.toFixed(2),
      'slowest (ms)': stats.slowest.toFixed(2),
      'fastest (ms)':
        stats.fastest === Infinity ? 'N/A' : stats.fastest.toFixed(2)
    })
  );

  if (apiReportData.length > 0) {
    console.table(apiReportData);
  } else {
    console.log('No API requests recorded');
  }

  // 最近的慢操作
  console.log(
    '%cRecent Slow Operations (>300ms):',
    'color: #F59E0B; font-weight: bold'
  );
  const slowOps = metricsHistory
    .filter((m) => m.duration > 300)
    .slice(-10)
    .map((m) => ({
      name: m.name,
      'duration (ms)': m.duration.toFixed(2),
      time: new Date(m.timestamp).toLocaleTimeString()
    }));

  if (slowOps.length > 0) {
    console.table(slowOps);
  } else {
    console.log('No slow operations detected');
  }

  console.groupEnd();
}

/**
 * 清除所有性能数据
 */
export function clearMetrics(): void {
  activeTimers.clear();
  metricsHistory.length = 0;
  apiStats.clear();
  console.log('[Perf] All metrics cleared');
}

/**
 * 启用/禁用性能监控（生产环境）
 */
export function setEnabled(enabled: boolean): void {
  if (typeof window !== 'undefined') {
    if (enabled) {
      localStorage.setItem('perf_monitor_enabled', 'true');
      console.log('[Perf] Performance monitoring enabled');
    } else {
      localStorage.removeItem('perf_monitor_enabled');
      console.log('[Perf] Performance monitoring disabled');
    }
  }
}

// 导出便捷方法到 window（开发调试用）
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).perfMonitor = {
    printReport,
    getApiReport,
    getMetricsHistory,
    clearMetrics,
    setEnabled
  };
}

export const perfMonitor = {
  startTimer,
  endTimer,
  withTiming,
  recordApiRequest,
  getApiReport,
  getMetricsHistory,
  printReport,
  clearMetrics,
  setEnabled
};

export default perfMonitor;
