import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IMAGE_TOOL_MODELS,
  isPublishedImageToolModel
} from '@/shared/image-tool-models';
import { getAuthToken } from '@/services/agent-api';
import { loadEditorImageBlob } from '@/web/components/image-editor/editor-image-input';
import { supportsWebGpu } from '@/web/lib/image-tools';

export function useAutoMaskWorker(
  imageUrl: string | undefined,
  referenceId?: string,
  generationId?: string
) {
  const workerRef = useRef<Worker | null>(null);
  const imageUrlRef = useRef(imageUrl);
  const referenceIdRef = useRef(referenceId);
  const generationIdRef = useRef(generationId);
  const pendingRef = useRef<{
    resolve: (blob: Blob) => void;
    reject: (error: Error) => void;
  } | null>(null);
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [message, setMessage] = useState('');
  const [encoded, setEncoded] = useState(false);

  imageUrlRef.current = imageUrl;
  referenceIdRef.current = referenceId;
  generationIdRef.current = generationId;

  const ensureWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker(
      new URL('../../workers/image-auto-mask.worker.ts', import.meta.url),
      { type: 'module' }
    );
    worker.addEventListener('message', (event) => {
      const messageData = event.data;
      if (messageData.type === 'progress') {
        if (messageData.message) setMessage(messageData.message);
        return;
      }
      if (messageData.type === 'ready') {
        setStatus('ready');
        setEncoded(true);
        return;
      }
      if (messageData.type === 'mask') {
        pendingRef.current?.resolve(messageData.blob);
        pendingRef.current = null;
        return;
      }
      if (messageData.type === 'error') {
        setStatus('error');
        setMessage(messageData.error);
        pendingRef.current?.reject(new Error(messageData.error));
        pendingRef.current = null;
      }
    });
    workerRef.current = worker;
    return worker;
  }, []);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    },
    []
  );

  useEffect(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    pendingRef.current?.reject(new Error('图片已更换，请重新选择区域。'));
    pendingRef.current = null;
    setEncoded(false);
    setStatus('idle');
    setMessage('');
  }, [imageUrl, referenceId, generationId]);

  const canRun =
    supportsWebGpu() &&
    isPublishedImageToolModel(IMAGE_TOOL_MODELS['mobile-sam-encoder']) &&
    isPublishedImageToolModel(IMAGE_TOOL_MODELS['mobile-sam-decoder']);

  const encode = useCallback(async () => {
    const url = imageUrlRef.current;
    const refId = referenceIdRef.current;
    const genId = generationIdRef.current;
    if (!url && !refId) return;
    if (!canRun) { setStatus('error'); setMessage('当前浏览器无法使用自动蒙版，请使用框选或绘制区域。'); return; }
    setStatus('loading');
    setMessage('');
    try {
      let file: Blob;
      if (refId) {
        const token = getAuthToken();
        const response = await fetch(`/api/image/references/bytes?id=${encodeURIComponent(refId)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        file = await response.blob();
      } else {
        file = await loadEditorImageBlob(url || '', genId);
      }
      if (imageUrlRef.current !== url || referenceIdRef.current !== refId || generationIdRef.current !== genId) return;
      ensureWorker().postMessage({
        id: 'auto-mask',
        type: 'encode',
        file,
        encoderUrl: IMAGE_TOOL_MODELS['mobile-sam-encoder'].route,
        decoderUrl: IMAGE_TOOL_MODELS['mobile-sam-decoder'].route
      });
    } catch (error) {
      if (imageUrlRef.current !== url || referenceIdRef.current !== refId || generationIdRef.current !== genId) return;
      setStatus('error');
      setMessage(
        error instanceof Error ? error.message : '自动蒙版模型加载失败'
      );
    }
  }, [canRun, ensureWorker]);

  const segment = useCallback(
    (point: { x: number; y: number }): Promise<Blob> => {
      return new Promise((resolve, reject) => {
        if (!encoded || pendingRef.current) {
          reject(new Error(status === 'error' ? message : '选区仍在准备中，请稍候。'));
          return;
        }
        pendingRef.current = { resolve, reject };
        ensureWorker().postMessage({
          id: 'auto-mask',
          type: 'segment',
          point
        });
      });
    },
    [encoded, ensureWorker, message, status]
  );

  return {
    status,
    message,
    encoded,
    canRun,
    encode,
    segment
  };
}
