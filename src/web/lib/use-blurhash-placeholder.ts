import { useEffect, useState } from 'react';
import { decode, encode } from 'blurhash';

const CACHE_KEY = 'webtomind:blurhash-placeholders:v1';
const PLACEHOLDER_SIZE = 32;
const CACHE_LIMIT = 300;

function hashSource(source: string): string {
  let hash = 5381;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 33) ^ source.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function readCache(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeCache(entries: Record<string, string>) {
  try {
    const keys = Object.keys(entries);
    const bounded =
      keys.length <= CACHE_LIMIT
        ? entries
        : Object.fromEntries(
            keys.slice(-CACHE_LIMIT).map((key) => [key, entries[key]])
          );
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(bounded));
  } catch {
    // storage may be unavailable in private/embedded contexts
  }
}

const memoryCache = new Map<string, string>();

function encodeFromImage(img: HTMLImageElement): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = PLACEHOLDER_SIZE;
    canvas.height = PLACEHOLDER_SIZE;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return '';
    context.drawImage(img, 0, 0, PLACEHOLDER_SIZE, PLACEHOLDER_SIZE);
    const { data, width, height } = context.getImageData(
      0,
      0,
      PLACEHOLDER_SIZE,
      PLACEHOLDER_SIZE
    );
    const blurhash = encode(data, width, height, 4, 4);
    const decoded = decode(blurhash, PLACEHOLDER_SIZE, PLACEHOLDER_SIZE);
    const placeholderCanvas = document.createElement('canvas');
    placeholderCanvas.width = PLACEHOLDER_SIZE;
    placeholderCanvas.height = PLACEHOLDER_SIZE;
    const placeholderContext = placeholderCanvas.getContext('2d');
    if (!placeholderContext) return '';
    const imageData = placeholderContext.createImageData(
      PLACEHOLDER_SIZE,
      PLACEHOLDER_SIZE
    );
    for (let index = 0; index < decoded.length; index += 1) {
      imageData.data[index * 4] = decoded[index * 3];
      imageData.data[index * 4 + 1] = decoded[index * 3 + 1];
      imageData.data[index * 4 + 2] = decoded[index * 3 + 2];
      imageData.data[index * 4 + 3] = 255;
    }
    placeholderContext.putImageData(imageData, 0, 0);
    return placeholderCanvas.toDataURL();
  } catch {
    // 跨域图片（如无 CORS 头的 R2 签名 URL）会污染画布导致读取失败；
    // 此时不生成占位图，页面正常渲染真实图片，仅缺少占位效果。
    return '';
  }
}

/**
 * 为图片 URL 生成/读取 blurhash 占位图（data URL）。
 * 首次访问时计算并缓存（localStorage + 内存），后续访问即时显示占位，
 * 避免缩略图加载时的空白跳动。
 */
export function useBlurhashPlaceholder(source: string): string {
  const [placeholder, setPlaceholder] = useState(() => {
    if (!source || typeof window === 'undefined') return '';
    const key = hashSource(source);
    const cached = memoryCache.get(key);
    if (cached) return cached;
    return readCache()[key] || '';
  });

  useEffect(() => {
    if (!source || typeof window === 'undefined') return;
    const key = hashSource(source);
    const cached = memoryCache.get(key) || readCache()[key];
    if (cached) {
      setPlaceholder(cached);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      const encoded = encodeFromImage(img);
      if (!encoded) return;
      if (memoryCache.size >= CACHE_LIMIT) {
        const oldest = memoryCache.keys().next().value;
        if (oldest) memoryCache.delete(oldest);
      }
      memoryCache.set(key, encoded);
      const next = { ...readCache(), [key]: encoded };
      writeCache(next);
      setPlaceholder(encoded);
    };
    img.onerror = () => {
      // 跨域加载失败时静默跳过，占位缺失不影响图片本身显示
    };
    img.src = source;
    return () => {
      cancelled = true;
    };
  }, [source]);

  return placeholder;
}
