import { loadVisualImageHistoryBlob } from '@/services/agent-api';
import { canvasToBlob } from '@/web/lib/image-tools';
import type { BrushStroke, EditorRegion } from './editor-tools';

/** A preview URL is never a fallback for a known original asset. */
export async function loadEditorImageBlob(url: string, generationId?: string): Promise<Blob> {
  if (generationId) return loadVisualImageHistoryBlob(generationId, 'original');
  // CSP connect-src deliberately excludes data: and blob:. Read local image
  // data directly rather than making a network request for a local asset.
  if (url.startsWith('data:')) {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+)(;base64)?,([\s\S]*)$/.exec(url);
    if (!match) throw new Error('无法读取有效的图片数据。');
    const binary = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
    return new Blob([Uint8Array.from(binary, (value) => value.charCodeAt(0))], { type: match[1] });
  }
  if (url.startsWith('blob:')) {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('本地图片已失效，请重新带入。'));
      element.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法读取本地图片。');
    context.drawImage(img, 0, 0);
    return canvasToBlob(canvas, 'image/png');
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error('原图读取失败，请重试。');
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('无法读取有效的原图。');
  return blob;
}

export function imageBlobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('图片读取失败。'));
    reader.readAsDataURL(blob);
  });
}

/** UI highlights are opaque inside; edit APIs expect transparency inside. */
export async function selectionMaskToEditMask(selection: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(selection);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法创建选区蒙版。');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = 'destination-out';
    context.drawImage(bitmap, 0, 0);
    return canvasToBlob(canvas, 'image/png');
  } finally { bitmap.close(); }
}

export function paintEditorRegion(context: CanvasRenderingContext2D, region: EditorRegion, width: number, height: number) {
  context.save();
  context.scale(width, height);
  if (region.kind === 'brush' && region.points?.length) {
    context.lineWidth = 0.035; // Matches the normalized region brush on the canvas.
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    region.points.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.stroke();
  } else {
    context.fillRect(region.x, region.y, region.width, region.height);
  }
  context.restore();
}

export async function renderEditorImageInputs(blob: Blob, regions: EditorRegion[], strokes: BrushStroke[], filter = 'none', selection?: Blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const { width, height } = bitmap;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器无法创建图片画布。');
    context.filter = filter;
    context.drawImage(bitmap, 0, 0);
    context.filter = 'none';
    const image = await canvasToBlob(canvas, 'image/png');
    let mask: Blob | undefined;
    if (regions.length || selection) {
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = width;
      maskCanvas.height = height;
      const maskContext = maskCanvas.getContext('2d');
      if (!maskContext) throw new Error('无法创建选区蒙版。');
      maskContext.fillStyle = '#ffffff';
      maskContext.fillRect(0, 0, width, height);
      maskContext.globalCompositeOperation = 'destination-out';
      if (selection) {
        const selectionBitmap = await createImageBitmap(selection);
        try {
          maskContext.drawImage(selectionBitmap, 0, 0, width, height);
          context.save(); context.globalAlpha = 0.35;
          context.drawImage(selectionBitmap, 0, 0, width, height); context.restore();
        } finally { selectionBitmap.close(); }
      }
      for (const region of regions) paintEditorRegion(maskContext, region, width, height);
      mask = await canvasToBlob(maskCanvas, 'image/png');
      context.save();
      context.globalAlpha = 0.28;
      context.fillStyle = '#ef4444';
      context.strokeStyle = '#ef4444';
      for (const region of regions) paintEditorRegion(context, region, width, height);
      context.restore();
      context.font = `bold ${Math.max(16, Math.round(width / 45))}px sans-serif`;
      regions.forEach((region, index) => {
        context.fillStyle = '#dc2626';
        context.fillText(String(index + 1), Math.max(4, region.x * width), Math.max(24, region.y * height));
      });
    }
    context.save();
    context.scale(width, height);
    for (const stroke of strokes) {
      context.strokeStyle = stroke.color;
      context.lineWidth = stroke.size / 100 / 8;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.beginPath();
      stroke.points.forEach((point, index) => {
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      });
      context.stroke();
    }
    context.restore();
    return { image, mask, guide: regions.length || strokes.length || selection ? await canvasToBlob(canvas, 'image/png') : undefined };
  } finally {
    bitmap.close();
  }
}
