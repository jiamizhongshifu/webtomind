import { useCallback, useEffect, useRef } from 'react';
import type { ImageToolOutputFormat } from '@/web/lib/image-tools';

type InpaintWorkerResult = {
  blob: Blob;
  engine: string;
};

type InpaintWorkerOptions = {
  file: Blob;
  mask: Blob;
  outputType: Exclude<ImageToolOutputFormat, 'image/jpeg'>;
  radius: number;
  feather: number;
  modelUrl?: string;
};

type InpaintWorkerCallbacks = {
  onProgress: (progress: number, message?: string) => void;
  onFallback: (message: string) => void;
  onSuccess: (result: InpaintWorkerResult) => void;
  onError: (message: string) => void;
};

type WorkerResponse =
  | {
      id: string;
      type: 'progress';
      progress: number;
      message?: string;
    }
  | {
      id: string;
      type: 'result';
      blob: Blob;
      engine: string;
    }
  | { id: string; type: 'error'; error: string };

export function useInpaintWorker(callbacks: InpaintWorkerCallbacks) {
  const callbacksRef = useRef(callbacks);
  const workerRef = useRef<Worker | null>(null);
  const timeoutRef = useRef<number | null>(null);
  callbacksRef.current = callbacks;

  const cancel = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const run = useCallback(
    (options: InpaintWorkerOptions) => {
      cancel();
      const id = crypto.randomUUID();

      const startWorker = (useLama: boolean) => {
        const worker = new Worker(
          new URL('../../workers/image-inpaint.worker.ts', import.meta.url),
          { type: 'module' }
        );
        workerRef.current = worker;
        const finishWorker = () => {
          if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
          worker.terminate();
          if (workerRef.current === worker) workerRef.current = null;
        };

        timeoutRef.current = window.setTimeout(
          () => {
            finishWorker();
            if (useLama) {
              callbacksRef.current.onFallback(
                'LaMa 初始化超时，已自动改用本地边界扩散修复。'
              );
              startWorker(false);
              return;
            }
            callbacksRef.current.onError(
              '局部修复超过 60 秒仍未完成，请缩小蒙版后重试。'
            );
          },
          useLama ? 120_000 : 60_000
        );

        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          if (event.data.id !== id) return;
          if (event.data.type === 'progress') {
            callbacksRef.current.onProgress(
              event.data.progress,
              event.data.message
            );
            return;
          }
          finishWorker();
          if (event.data.type === 'error') {
            callbacksRef.current.onError(event.data.error);
            return;
          }
          callbacksRef.current.onSuccess({
            blob: event.data.blob,
            engine: event.data.engine
          });
        };
        worker.onerror = () => {
          finishWorker();
          callbacksRef.current.onError(
            '局部修复 Worker 启动失败，请刷新页面重试。'
          );
        };
        worker.onmessageerror = () => {
          finishWorker();
          callbacksRef.current.onError(
            '局部修复 Worker 返回了无法读取的结果，请重试。'
          );
        };
        worker.postMessage({
          id,
          file: options.file,
          mask: options.mask,
          outputType: options.outputType,
          radius: options.radius,
          feather: options.feather,
          modelUrl: useLama ? options.modelUrl : undefined
        });
      };

      startWorker(Boolean(options.modelUrl));
    },
    [cancel]
  );

  return { run, cancel };
}
