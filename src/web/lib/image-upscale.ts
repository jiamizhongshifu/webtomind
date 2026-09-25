import { withImageCacheLock } from '@/shared/image-model-cache';
import {
  upscaleCacheKey,
  readUpscaleCache,
  writeUpscaleCache
} from './image-upscale-cache';
import type { DecodedImage, ImageToolOutputFormat } from './image-tools';
import { calculateLongEdgeSize, canvasToBlob } from './image-tools';

export type ImageUpscaleTarget = 2048 | 4096;
export type ImageUpscaleConcurrency = 1 | 2 | 4;

export interface ImageUpscaleResult {
  cacheHit?: boolean;
  blob: Blob;
  width: number;
  height: number;
  target: ImageUpscaleTarget;
  outputFormat: Exclude<ImageToolOutputFormat, 'image/jpeg'>;
  engine: string;
  message: string;
}

interface RunImageUpscaleOptions {
  source: DecodedImage;
  target: ImageUpscaleTarget;
  format: Exclude<ImageToolOutputFormat, 'image/jpeg'>;
  canUseAi: boolean;
  /** Explicit opt-in only; an AI failure must not look like AI success. */
  allowCanvasFallback?: boolean;
  modelUrl: string;
  signal: AbortSignal;
  onProgress: (progress: number, message: string) => void;
}

type WorkerResponse =
  | { id: string; type: 'progress'; progress: number; message: string }
  | {
      id: string;
      type: 'result';
      blob: Blob;
      width: number;
      height: number;
      engine: string;
    }
  | { id: string; type: 'error'; error: string };

// Keep at most one healthy idle engine; parallel jobs still own separate Workers.
let idleWorker: { worker: Worker; timer: number } | null = null;
export function disposeIdleImageUpscaleWorker() {
  if (!idleWorker) return;
  window.clearTimeout(idleWorker.timer);
  idleWorker.worker.terminate();
  idleWorker = null;
}
function takeWorker() {
  if (idleWorker) {
    const { worker, timer } = idleWorker;
    window.clearTimeout(timer);
    idleWorker = null;
    return worker;
  }
  return new Worker(
    new URL('../../workers/image-ai.worker.ts', import.meta.url),
    { type: 'module' }
  );
}
function keepWorker(worker: Worker) {
  worker.onmessage = null;
  worker.onmessageerror = null;
  worker.onerror = () => {
    if (idleWorker?.worker === worker) disposeIdleImageUpscaleWorker();
  };
  if (idleWorker) {
    worker.terminate();
    return;
  }
  idleWorker = {
    worker,
    timer: window.setTimeout(disposeIdleImageUpscaleWorker, 120_000)
  };
}
if (typeof window !== 'undefined')
  window.addEventListener('pagehide', disposeIdleImageUpscaleWorker);

function abortError() {
  return new DOMException('处理已取消', 'AbortError');
}

function fallbackReason(error: string): string {
  const normalized = error.toLowerCase();
  if (
    normalized.includes('no available backend') ||
    normalized.includes('webgpu')
  ) {
    return '当前 WebGPU AI 引擎不可用';
  }
  if (
    normalized.includes('fetch') ||
    normalized.includes('download') ||
    normalized.includes('http')
  ) {
    return 'AI 运行组件加载失败';
  }
  if (normalized.includes('memory')) {
    return '浏览器内存不足，AI 引擎无法继续';
  }
  return 'AI 超分运行失败';
}

async function runCanvasUpscale(
  options: RunImageUpscaleOptions,
  reason?: string
): Promise<ImageUpscaleResult> {
  if (options.signal.aborted) throw abortError();
  const outputSize = calculateLongEdgeSize(
    options.source.width,
    options.source.height,
    options.target
  );
  options.onProgress(
    94,
    reason
      ? `${reason}，正在改用标准放大完成输出。`
      : '正在使用浏览器高质量重采样。'
  );
  const canvas = document.createElement('canvas');
  canvas.width = outputSize.width;
  canvas.height = outputSize.height;
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('当前浏览器无法创建图片画布。');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    options.source.bitmap,
    0,
    0,
    outputSize.width,
    outputSize.height
  );
  const blob = await canvasToBlob(canvas, options.format, 0.92);
  if (options.signal.aborted) throw abortError();
  return {
    blob,
    ...outputSize,
    target: options.target,
    outputFormat: options.format,
    engine: reason ? '标准放大 · Canvas（AI 已降级）' : '标准放大 · Canvas',
    message: reason
      ? `${reason}；已完成标准放大，结果不是 AI 超分。`
      : '标准放大已完成。'
  };
}

async function runAiUpscale(
  options: RunImageUpscaleOptions
): Promise<ImageUpscaleResult | string> {
  const outputSize = calculateLongEdgeSize(
    options.source.width,
    options.source.height,
    options.target
  );
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const worker = takeWorker();
    const inactivityTimeoutMs = 120_000;
    const totalDeadlineMs = options.target === 4096 ? 720_000 : 360_000;
    let settled = false;
    let inactivityTimer = window.setTimeout(
      () => finish('AI 引擎 120 秒没有新进展'),
      inactivityTimeoutMs
    );
    const deadlineTimer = window.setTimeout(
      () =>
        finish(
          `AI 超分总耗时超过 ${Math.round(totalDeadlineMs / 60_000)} 分钟`
        ),
      totalDeadlineMs
    );

    const cleanup = (reusable = false) => {
      window.clearTimeout(inactivityTimer);
      window.clearTimeout(deadlineTimer);
      if (reusable) keepWorker(worker);
      else worker.terminate();
      options.signal.removeEventListener('abort', cancel);
    };
    const finish = (value: ImageUpscaleResult | string) => {
      if (settled) return;
      settled = true;
      cleanup(typeof value !== 'string');
      resolve(value);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const cancel = () => fail(abortError());
    const beat = () => {
      window.clearTimeout(inactivityTimer);
      inactivityTimer = window.setTimeout(
        () => finish('AI 引擎 120 秒没有新进展'),
        inactivityTimeoutMs
      );
    };

    options.signal.addEventListener('abort', cancel, { once: true });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id || settled) return;
      if (event.data.type === 'progress') {
        beat();
        options.onProgress(event.data.progress, event.data.message);
        return;
      }
      if (event.data.type === 'error') {
        finish(fallbackReason(event.data.error));
        return;
      }
      finish({
        blob: event.data.blob,
        width: event.data.width,
        height: event.data.height,
        target: options.target,
        outputFormat: options.format,
        engine: event.data.engine,
        message: 'AI 超分已完成。'
      });
    };
    worker.onerror = () => finish('AI Worker 启动失败');
    worker.onmessageerror = () => finish('AI Worker 返回了无法读取的结果');
    if (options.signal.aborted) {
      cancel();
      return;
    }
    try {
      worker.postMessage({
        id,
        operation: 'upscale',
        file: options.source.file,
        modelUrl: options.modelUrl,
        targetWidth: outputSize.width,
        targetHeight: outputSize.height,
        outputType: options.format
      });
    } catch (error) {
      fail(error);
    }
  });
}

export async function runImageUpscale(
  options: RunImageUpscaleOptions
): Promise<ImageUpscaleResult> {
  if (options.signal.aborted) throw abortError();
  options.onProgress(
    2,
    options.canUseAi ? '正在启动本地 AI Worker。' : '正在准备标准放大。'
  );
  if (!options.canUseAi) return runCanvasUpscale(options);
  let cacheKey: string | null = null;
  if (typeof caches !== 'undefined') {
    options.onProgress(1, '正在检查本地放大结果');
    cacheKey = await upscaleCacheKey(
      options.source.file,
      JSON.stringify({
        model: options.modelUrl,
        width: options.source.width,
        height: options.source.height,
        target: options.target,
        format: options.format
      })
    );
    if (options.signal.aborted) throw abortError();
  }
  const execute = async (): Promise<ImageUpscaleResult> => {
    if (options.signal.aborted) throw abortError();
    const cached = cacheKey ? await readUpscaleCache(cacheKey) : null;
    if (options.signal.aborted) throw abortError();
    if (cached) {
      options.onProgress(100, cached.message);
      return cached;
    }
    const aiResult = await runAiUpscale(options);
    if (typeof aiResult !== 'string') {
      if (options.signal.aborted) throw abortError();
      if (cacheKey) await writeUpscaleCache(cacheKey, aiResult);
      if (options.signal.aborted) throw abortError();
      return aiResult;
    }
    if (!options.allowCanvasFallback) {
      throw new Error(`${aiResult}。请重试 AI 放大，或选择普通放大。`);
    }
    return runCanvasUpscale(options, aiResult);
  };
  return cacheKey
    ? withImageCacheLock(`upscale-result:${cacheKey}`, execute, options.signal)
    : execute();
}
