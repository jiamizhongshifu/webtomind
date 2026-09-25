import { useCallback, useEffect, useRef, useState } from 'react';
import {
  decodeImageFile,
  releaseDecodedImage,
  type DecodedImage
} from '@/web/lib/image-tools';
import type { ImageUpscaleResult } from '@/web/lib/image-upscale';

export type ImageUpscaleQueueStatus =
  | 'queued'
  | 'processing'
  | 'success'
  | 'error';

export interface ImageUpscaleQueueResult extends ImageUpscaleResult {
  url: string;
}

export interface ImageUpscaleQueueItem {
  id: string;
  source: DecodedImage;
  status: ImageUpscaleQueueStatus;
  progress: number;
  message: string;
  error: string;
  result: ImageUpscaleQueueResult | null;
}

const MAX_QUEUE_ITEMS = 20;
const MAX_QUEUE_PIXELS = 96_000_000;

function releaseQueueItem(item: ImageUpscaleQueueItem) {
  releaseDecodedImage(item.source);
  if (item.result) URL.revokeObjectURL(item.result.url);
}

export function useImageUpscaleQueue() {
  const [items, setItems] = useState<ImageUpscaleQueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const itemsRef = useRef<ImageUpscaleQueueItem[]>([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(
    () => () => {
      itemsRef.current.forEach(releaseQueueItem);
    },
    []
  );

  const addFiles = useCallback(async (files: File[], signal?: AbortSignal) => {
    if (files.length === 0) return 0;
    setError('');
    setIsAdding(true);
    const availableSlots = Math.max(
      0,
      MAX_QUEUE_ITEMS - itemsRef.current.length
    );
    const filesToDecode = files.slice(0, availableSlots);
    const nextItems: ImageUpscaleQueueItem[] = [];
    const failures: string[] = [];
    let totalPixels = itemsRef.current.reduce(
      (sum, item) => sum + item.source.width * item.source.height,
      0
    );

    if (availableSlots === 0) {
      setError(`批量队列最多 ${MAX_QUEUE_ITEMS} 张图片。`);
      setIsAdding(false);
      return 0;
    }

    for (const file of filesToDecode) {
      try {
        const source = await decodeImageFile(file);
        const sourcePixels = source.width * source.height;
        if (totalPixels + sourcePixels > MAX_QUEUE_PIXELS) {
          releaseDecodedImage(source);
          failures.push(`${file.name}：队列总像素超过 9600 万`);
          continue;
        }
        totalPixels += sourcePixels;
        nextItems.push({
          id: crypto.randomUUID(),
          source,
          status: 'queued',
          progress: 0,
          message: '等待处理',
          error: '',
          result: null
        });
      } catch (nextError) {
        failures.push(
          `${file.name}：${nextError instanceof Error ? nextError.message : '读取失败'}`
        );
      }
    }

    if (files.length > filesToDecode.length) {
      failures.push(`队列最多 ${MAX_QUEUE_ITEMS} 张，多余图片未加入`);
    }
    if (signal?.aborted) {
      nextItems.forEach(releaseQueueItem);
      setIsAdding(false);
      return 0;
    }
    if (nextItems.length > 0) {
      setItems((current) => [...current, ...nextItems]);
      setSelectedId((current) => current || nextItems[0].id);
    }
    if (failures.length > 0) setError(failures.join('；'));
    setIsAdding(false);
    return nextItems.length;
  }, []);

  const updateItem = useCallback(
    (
      id: string,
      update:
        | Partial<ImageUpscaleQueueItem>
        | ((item: ImageUpscaleQueueItem) => ImageUpscaleQueueItem)
    ) => {
      setItems((current) =>
        current.map((item) => {
          if (item.id !== id) return item;
          return typeof update === 'function'
            ? update(item)
            : { ...item, ...update };
        })
      );
    },
    []
  );

  const removeItem = useCallback((id: string) => {
    const removed = itemsRef.current.find((item) => item.id === id);
    if (removed) releaseQueueItem(removed);
    const next = itemsRef.current.filter((item) => item.id !== id);
    itemsRef.current = next;
    setItems(next);
    setSelectedId((selected) =>
      selected === id ? (next[0]?.id ?? null) : selected
    );
  }, []);

  const resetResults = useCallback(() => {
    const next = itemsRef.current.map((item) => {
      if (item.result) URL.revokeObjectURL(item.result.url);
      return {
        ...item,
        status: 'queued' as const,
        progress: 0,
        message: '输出设置已改变，等待重新处理',
        error: '',
        result: null
      };
    });
    itemsRef.current = next;
    setItems(next);
  }, []);

  const clearAll = useCallback(() => {
    itemsRef.current.forEach(releaseQueueItem);
    itemsRef.current = [];
    setItems([]);
    setSelectedId(null);
    setError('');
  }, []);

  return {
    items,
    selectedId,
    selectedItem:
      items.find((item) => item.id === selectedId) || items[0] || null,
    setSelectedId,
    error,
    setError,
    isAdding,
    addFiles,
    updateItem,
    removeItem,
    resetResults,
    clearAll,
    maxItems: MAX_QUEUE_ITEMS
  };
}
