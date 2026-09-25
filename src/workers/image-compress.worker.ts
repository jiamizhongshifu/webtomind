type OutputType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';

interface CompressRequest {
  id: string;
  file?: Blob;
  outputType?: OutputType;
  quality?: number;
  maxLongEdge?: number;
  targetBytes?: number;
  base64Data?: string;
  mimeType?: string;
}

interface CompressResponse {
  id: string;
  success: boolean;
  blob?: Blob;
  width?: number;
  height?: number;
  quality?: number;
  targetMet?: boolean;
  targetBytes?: number;
  error?: string;
  data?: string;
  mimeType?: string;
}

function fitSize(width: number, height: number, maxLongEdge?: number) {
  if (!maxLongEdge || Math.max(width, height) <= maxLongEdge)
    return { width, height };
  const scale = maxLongEdge / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

async function encodeWithTarget(
  canvas: OffscreenCanvas,
  outputType: OutputType,
  requestedQuality: number,
  targetBytes?: number
): Promise<{ blob: Blob; quality: number }> {
  if (outputType === 'image/png' || !targetBytes) {
    return {
      blob: await canvas.convertToBlob({
        type: outputType,
        quality: requestedQuality
      }),
      quality: requestedQuality
    };
  }

  let low = 0.12;
  let high = Math.max(low, Math.min(0.98, requestedQuality));
  let best = await canvas.convertToBlob({ type: outputType, quality: low });
  let bestQuality = low;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const quality = (low + high) / 2;
    const blob = await canvas.convertToBlob({ type: outputType, quality });
    if (blob.size <= targetBytes) {
      best = blob;
      bestQuality = quality;
      low = quality;
    } else {
      high = quality;
    }
  }
  return { blob: best, quality: bestQuality };
}

function renderCanvas(
  bitmap: ImageBitmap,
  size: { width: number; height: number },
  outputType: OutputType
) {
  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = canvas.getContext('2d', {
    alpha: outputType !== 'image/jpeg'
  });
  if (!context) throw new Error('OffscreenCanvas 2D context is unavailable');
  if (outputType === 'image/jpeg') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size.width, size.height);
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  return canvas;
}

self.onmessage = async (event: MessageEvent<CompressRequest>) => {
  const { id, base64Data, mimeType, maxLongEdge, targetBytes } = event.data;
  const outputType =
    event.data.outputType ||
    (base64Data ? 'image/jpeg' : (mimeType as OutputType | undefined)) ||
    'image/webp';
  const quality = event.data.quality ?? (base64Data ? 0.6 : 0.82);
  try {
    const file =
      event.data.file ||
      (base64Data
        ? await fetch(
            `data:${mimeType || 'image/jpeg'};base64,${base64Data}`
          ).then((response) => response.blob())
        : null);
    if (!file) throw new Error('No image payload was provided');
    const bitmap = await createImageBitmap(file);
    let size = fitSize(
      bitmap.width,
      bitmap.height,
      maxLongEdge ?? (base64Data ? 800 : undefined)
    );
    let canvas = renderCanvas(bitmap, size, outputType);
    let effectiveType = outputType;
    let encoded: { blob: Blob; quality: number };
    try {
      encoded = await encodeWithTarget(
        canvas,
        outputType,
        Math.max(0.12, Math.min(1, quality)),
        targetBytes
      );
    } catch (error) {
      // 当前浏览器不支持 AVIF 编码时回退 WebP（保持功能可用）
      if (outputType === 'image/avif') {
        effectiveType = 'image/webp';
        canvas = renderCanvas(bitmap, size, effectiveType);
        encoded = await encodeWithTarget(
          canvas,
          effectiveType,
          Math.max(0.12, Math.min(1, quality)),
          targetBytes
        );
      } else {
        throw error;
      }
    }

    // If the lowest useful quality cannot reach the requested byte budget,
    // reduce dimensions in bounded steps instead of silently returning a file
    // several times larger than the user's target.
    if (
      targetBytes &&
      effectiveType !== 'image/png' &&
      encoded.blob.size > targetBytes
    ) {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const currentLongEdge = Math.max(size.width, size.height);
        if (currentLongEdge <= 160) break;
        const estimatedScale =
          Math.sqrt(targetBytes / encoded.blob.size) * 0.94;
        const scale = Math.max(0.5, Math.min(0.9, estimatedScale));
        const nextLongEdge = Math.max(
          160,
          Math.min(currentLongEdge - 1, Math.floor(currentLongEdge * scale))
        );
        size = fitSize(bitmap.width, bitmap.height, nextLongEdge);
        canvas = renderCanvas(bitmap, size, effectiveType);
        encoded = await encodeWithTarget(
          canvas,
          effectiveType,
          Math.max(0.12, Math.min(1, quality)),
          targetBytes
        );
        if (encoded.blob.size <= targetBytes) break;
      }
    }
    bitmap.close();
    const response: CompressResponse = {
      id,
      success: true,
      blob: encoded.blob,
      width: size.width,
      height: size.height,
      quality: encoded.quality,
      targetMet: targetBytes ? encoded.blob.size <= targetBytes : undefined,
      targetBytes,
      mimeType: effectiveType
    };
    if (base64Data) {
      const bytes = new Uint8Array(await encoded.blob.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(
          ...bytes.subarray(offset, offset + 0x8000)
        );
      }
      response.data = btoa(binary);
    }
    self.postMessage(response);
  } catch (error) {
    const response: CompressResponse = {
      id,
      success: false,
      error: error instanceof Error ? error.message : 'Image compression failed'
    };
    self.postMessage(response);
  }
};

export {};
