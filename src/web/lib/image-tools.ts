import {
  blendDenoisedChannel,
  type DenoiseStrength
} from '@/shared/image-denoise';

export const IMAGE_TOOL_MAX_BYTES = 20 * 1024 * 1024;
export const IMAGE_TOOL_MAX_PIXELS = 64_000_000;
export const IMAGE_TOOL_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp'
] as const;

export type ImageToolMime = (typeof IMAGE_TOOL_MIME_TYPES)[number];
export type ImageToolOutputFormat =
  | 'image/png'
  | 'image/webp'
  | 'image/jpeg'
  | 'image/avif';

export interface DecodedImage {
  id: string;
  file: File;
  bitmap: ImageBitmap;
  width: number;
  height: number;
  url: string;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const power = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  const value = bytes / 1024 ** power;
  return `${value >= 10 || power === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[power]}`;
}

export function getExtension(mime: ImageToolOutputFormat): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/avif') return 'avif';
  return 'png';
}

export function hasSupportedImageSignature(
  bytes: Uint8Array,
  mime: string
): boolean {
  if (
    mime === 'image/jpeg' &&
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return true;
  }
  if (
    mime === 'image/png' &&
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return true;
  }
  return (
    mime === 'image/webp' &&
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  );
}

export async function validateImageFile(file: File): Promise<void> {
  if (!IMAGE_TOOL_MIME_TYPES.includes(file.type as ImageToolMime)) {
    throw new Error('仅支持 JPEG、PNG 或 WebP 图片。');
  }
  if (file.size > IMAGE_TOOL_MAX_BYTES) {
    throw new Error('图片超过 20 MB，请先压缩后重试。');
  }
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!hasSupportedImageSignature(header, file.type)) {
    throw new Error('文件内容与图片格式不匹配，请重新导出后上传。');
  }
}

export async function decodeImageFile(file: File): Promise<DecodedImage> {
  await validateImageFile(file);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('图片解码失败，请换一张图片重试。');
  }
  if (bitmap.width * bitmap.height > IMAGE_TOOL_MAX_PIXELS) {
    bitmap.close();
    throw new Error('图片超过 6400 万像素，请缩小尺寸后重试。');
  }
  return {
    id: crypto.randomUUID(),
    file,
    bitmap,
    width: bitmap.width,
    height: bitmap.height,
    url: URL.createObjectURL(file)
  };
}

export function releaseDecodedImage(image: DecodedImage | null): void {
  if (!image) return;
  image.bitmap.close();
  URL.revokeObjectURL(image.url);
}

export function calculateLongEdgeSize(
  width: number,
  height: number,
  longEdge: 2048 | 4096
): { width: number; height: number } {
  const scale = longEdge / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

export function calculateTileStarts(
  length: number,
  tileSize: number,
  overlap: number
): number[] {
  if (length <= tileSize) return [0];
  const stride = Math.max(1, tileSize - overlap);
  const starts: number[] = [];
  for (let value = 0; value < length; value += stride) {
    const start = Math.min(value, length - tileSize);
    if (starts.at(-1) !== start) starts.push(start);
    if (start === length - tileSize) break;
  }
  return starts;
}

export function mixDenoisedChannel(
  original: number,
  denoised: number,
  strength: DenoiseStrength
): number {
  return blendDenoisedChannel(original, denoised, strength);
}

export function isCompressedResultSmaller(
  originalBytes: number,
  resultBytes: number
): boolean {
  return originalBytes > 0 && resultBytes > 0 && resultBytes < originalBytes;
}

export function calculateSplitRects(params: {
  sourceWidth: number;
  sourceHeight: number;
  rows: number;
  columns: number;
  aspectRatio: number | null;
  zoom: number;
  focusX: number;
  focusY: number;
}) {
  const {
    sourceWidth,
    sourceHeight,
    rows,
    columns,
    aspectRatio,
    zoom,
    focusX,
    focusY
  } = params;
  let cropWidth = sourceWidth / Math.max(1, zoom);
  let cropHeight = sourceHeight / Math.max(1, zoom);
  if (aspectRatio) {
    const targetRatio = (columns * aspectRatio) / rows;
    if (cropWidth / cropHeight > targetRatio)
      cropWidth = cropHeight * targetRatio;
    else cropHeight = cropWidth / targetRatio;
  }
  const left = Math.max(
    0,
    Math.min(sourceWidth - cropWidth, (sourceWidth - cropWidth) * focusX)
  );
  const top = Math.max(
    0,
    Math.min(sourceHeight - cropHeight, (sourceHeight - cropHeight) * focusY)
  );
  const rects = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x0 = Math.round(left + (cropWidth * column) / columns);
      const x1 = Math.round(left + (cropWidth * (column + 1)) / columns);
      const y0 = Math.round(top + (cropHeight * row) / rows);
      const y1 = Math.round(top + (cropHeight * (row + 1)) / rows);
      rects.push({
        row,
        column,
        x: x0,
        y: y0,
        width: Math.max(1, x1 - x0),
        height: Math.max(1, y1 - y0)
      });
    }
  }
  return rects;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type: ImageToolOutputFormat,
  quality = 0.9
): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type, quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('图片编码失败。'))),
      type,
      quality
    );
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('图片读取失败。'));
    reader.readAsDataURL(blob);
  });
}

export function supportsWebGpu(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

export function stripImageExtension(filename: string): string {
  return filename.replace(/\.(?:jpe?g|png|webp)$/i, '') || 'webtomind-image';
}

export type ImageToolResultIdentityPart =
  | string
  | number
  | boolean
  | null
  | undefined;

/**
 * Results are only valid for the exact source image and settings that produced
 * them. Keeping this key on every result prevents a later UI selection from
 * relabelling or downloading an older Blob with the wrong metadata.
 */
export function createImageToolResultIdentity(
  source: DecodedImage | null,
  parts: readonly ImageToolResultIdentityPart[]
): string {
  return JSON.stringify([source?.id ?? null, ...parts]);
}
