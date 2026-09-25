/**
 * 图片工具函数
 * 提供图片压缩等功能
 */

// 图片压缩配置
export const IMAGE_COMPRESS_CONFIG = {
  maxWidth: 800, // 最大宽度
  maxHeight: 800, // 最大高度
  quality: 0.6, // JPEG 质量 (0-1)
  maxSizeKB: 150 // 目标大小 150KB
};

// Worker 实例（懒加载）
let imageWorker: Worker | null = null;
let workerSupported: boolean | null = null;

// 请求 ID 计数器
let requestIdCounter = 0;

// 等待中的压缩请求
const pendingRequests = new Map<
  string,
  {
    resolve: (result: { data: string; mimeType: string }) => void;
    reject: (error: Error) => void;
  }
>();

/**
 * 检查 Worker 是否可用
 */
function isWorkerSupported(): boolean {
  if (workerSupported !== null) return workerSupported;

  try {
    // 检查基本 Worker 支持
    if (typeof Worker === 'undefined') {
      workerSupported = false;
      return false;
    }

    // 检查 OffscreenCanvas 支持（Worker 中需要）
    if (typeof OffscreenCanvas === 'undefined') {
      workerSupported = false;
      return false;
    }

    workerSupported = true;
    return true;
  } catch {
    workerSupported = false;
    return false;
  }
}

/**
 * 获取或创建 Worker 实例
 */
function getWorker(): Worker | null {
  if (!isWorkerSupported()) return null;

  if (!imageWorker) {
    try {
      // Vite 特定的 Worker 导入方式
      imageWorker = new Worker(
        new URL('../workers/image-compress.worker.ts', import.meta.url),
        { type: 'module' }
      );

      // 设置消息处理
      imageWorker.onmessage = (event) => {
        const { id, success, data, mimeType, error } = event.data;
        const pending = pendingRequests.get(id);

        if (pending) {
          pendingRequests.delete(id);
          if (success && data && mimeType) {
            pending.resolve({ data, mimeType });
          } else {
            // 失败但有原图数据
            if (data && mimeType) {
              pending.resolve({ data, mimeType });
            } else {
              pending.reject(new Error(error || 'Compression failed'));
            }
          }
        }
      };

      imageWorker.onerror = (error) => {
        console.error('[ImageCompress] Worker error:', error);
        // Worker 出错，回退到主线程
        imageWorker?.terminate();
        imageWorker = null;
        workerSupported = false;
      };

    } catch (err) {
      console.error('[ImageCompress] Failed to create worker:', err);
      workerSupported = false;
      return null;
    }
  }

  return imageWorker;
}

/**
 * 使用 Worker 压缩图片
 */
function compressWithWorker(
  base64Data: string,
  mimeType: string
): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const worker = getWorker();

    if (!worker) {
      reject(new Error('Worker not available'));
      return;
    }

    const id = `compress_${++requestIdCounter}`;
    pendingRequests.set(id, { resolve, reject });

    // 设置超时（10秒）
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error('Compression timeout'));
    }, 10000);

    // 修改 resolve 以清除超时
    const originalResolve = resolve;
    pendingRequests.set(id, {
      resolve: (result) => {
        clearTimeout(timeout);
        originalResolve(result);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    });

    worker.postMessage({ id, base64Data, mimeType });
  });
}

/**
 * 主线程压缩（回退方案）
 */
function compressInMainThread(
  base64Data: string,
  mimeType: string
): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve) => {
    const img = new Image();

    img.onload = () => {
      try {
        // 计算缩放比例
        let { width, height } = img;
        const { maxWidth, maxHeight, quality } = IMAGE_COMPRESS_CONFIG;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        // 创建 canvas 进行压缩
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          // 无法创建 context，返回原图
          resolve({ data: base64Data, mimeType });
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // 转为 JPEG 以获得更好的压缩率
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        const compressedBase64 = compressedDataUrl.replace(
          /^data:image\/\w+;base64,/,
          ''
        );

        resolve({ data: compressedBase64, mimeType: 'image/jpeg' });
      } catch (err) {
        console.error('[ImageCompress] Main thread error:', err);
        // 压缩失败，返回原图
        resolve({ data: base64Data, mimeType });
      }
    };

    img.onerror = () => {
      console.error('[ImageCompress] Failed to load image');
      // 加载失败，返回原图
      resolve({ data: base64Data, mimeType });
    };

    // 加载图片
    img.src = `data:${mimeType};base64,${base64Data}`;
  });
}

/**
 * 压缩 base64 图片
 * 优先使用 Web Worker，不支持时回退到主线程
 * 注意：GIF 动图不压缩，保持原样以保留动画效果
 * @param base64Data - 不含 data:image 前缀的纯 base64 数据
 * @param mimeType - 图片 MIME 类型
 * @returns 压缩后的 { data, mimeType }
 */
export async function compressImage(
  base64Data: string,
  mimeType: string
): Promise<{ data: string; mimeType: string }> {
  // GIF 动图不压缩，保持原样以保留动画效果
  if (mimeType === 'image/gif') {
    console.log(
      '[ImageCompress] Skipping GIF compression to preserve animation'
    );
    return { data: base64Data, mimeType };
  }

  // 优先使用 Worker
  if (isWorkerSupported()) {
    try {
      return await compressWithWorker(base64Data, mimeType);
    } catch (err) {
      console.warn(
        '[ImageCompress] Worker failed, falling back to main thread:',
        err
      );
      // Worker 失败，回退到主线程
    }
  }

  // 回退到主线程
  return compressInMainThread(base64Data, mimeType);
}

/**
 * 转义 HTML 特殊字符防止 XSS
 * @param str - 需要转义的字符串
 * @returns 转义后的安全字符串
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * 安全 URL 协议白名单
 */
const SAFE_URL_PROTOCOLS = ['http:', 'https:', 'mailto:'];

/**
 * 验证并清理 URL（防止 XSS）
 * 只允许安全协议和相对路径
 * @param url - 需要验证的 URL
 * @returns 如果安全返回原 URL，否则返回 null
 */
export function sanitizeUrl(url: string): string | null {
  if (!url || typeof url !== 'string') return null;

  const trimmedUrl = url.trim();

  // 允许相对路径
  if (
    trimmedUrl.startsWith('/') ||
    trimmedUrl.startsWith('./') ||
    trimmedUrl.startsWith('../') ||
    trimmedUrl.startsWith('#')
  ) {
    return trimmedUrl;
  }

  // 验证绝对 URL
  try {
    const parsed = new URL(trimmedUrl);
    if (SAFE_URL_PROTOCOLS.includes(parsed.protocol)) {
      return trimmedUrl;
    }
    // 不安全的协议 (javascript:, data:, vbscript: 等)
    console.warn('[sanitizeUrl] Blocked unsafe URL protocol:', parsed.protocol);
    return null;
  } catch {
    // URL 解析失败，可能是格式错误
    console.warn('[sanitizeUrl] Invalid URL format:', trimmedUrl.slice(0, 50));
    return null;
  }
}
