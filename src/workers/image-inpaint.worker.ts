import * as ort from 'onnxruntime-web/all';
import {
  compositeMaskedPixels,
  createInnerFeatherMask,
  expandMaskContext,
  fillMaskedPixelsFromBoundary,
  findMaskBounds,
  type PixelRect
} from '../shared/image-inpaint';
import { IMAGE_TOOL_MODELS } from '../shared/image-tool-models';

const LAMA_INPUT_SIZE = 256;

type InpaintRequest = {
  id: string;
  file: Blob;
  mask: Blob;
  outputType: 'image/png' | 'image/webp';
  radius: number;
  feather: number;
  modelUrl?: string;
};

type InpaintResponse =
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
      width: number;
      height: number;
      engine: string;
    }
  | { id: string; type: 'error'; error: string };

function post(response: InpaintResponse) {
  self.postMessage(response);
}

function imageTensor(image: ImageData): ort.Tensor {
  const pixels = image.width * image.height;
  const data = new Float32Array(pixels * 3);
  for (let index = 0; index < pixels; index += 1) {
    data[index] = image.data[index * 4] / 255;
    data[pixels + index] = image.data[index * 4 + 1] / 255;
    data[pixels * 2 + index] = image.data[index * 4 + 2] / 255;
  }
  return new ort.Tensor('float32', data, [1, 3, image.height, image.width]);
}

function maskTensor(image: ImageData): ort.Tensor {
  const pixels = image.width * image.height;
  const data = new Float32Array(pixels);
  for (let index = 0; index < pixels; index += 1) {
    data[index] = image.data[index * 4] >= 128 ? 1 : 0;
  }
  return new ort.Tensor('float32', data, [1, 1, image.height, image.width]);
}

function imageDataFromTensor(tensor: ort.Tensor): ImageData {
  const dimensions = tensor.dims.map(Number);
  const height = dimensions.at(-2) || 1;
  const width = dimensions.at(-1) || 1;
  const pixels = width * height;
  const source = tensor.data as Float32Array;
  const output = new Uint8ClampedArray(pixels * 4);
  for (let index = 0; index < pixels; index += 1) {
    output[index * 4] = Math.round(
      Math.max(0, Math.min(1, source[index])) * 255
    );
    output[index * 4 + 1] = Math.round(
      Math.max(0, Math.min(1, source[pixels + index])) * 255
    );
    output[index * 4 + 2] = Math.round(
      Math.max(0, Math.min(1, source[pixels * 2 + index])) * 255
    );
    output[index * 4 + 3] = 255;
  }
  return new ImageData(output, width, height);
}

function binaryMaskImage(
  binary: Uint8ClampedArray,
  width: number,
  height: number
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < binary.length; index += 1) {
    const value = binary[index];
    data[index * 4] = value;
    data[index * 4 + 1] = value;
    data[index * 4 + 2] = value;
    data[index * 4 + 3] = 255;
  }
  return new ImageData(data, width, height);
}

function cropToModelCanvas(
  source: OffscreenCanvas,
  rect: PixelRect,
  smoothing: boolean
): OffscreenCanvas {
  const canvas = new OffscreenCanvas(LAMA_INPUT_SIZE, LAMA_INPUT_SIZE);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Model canvas is unavailable');
  context.imageSmoothingEnabled = smoothing;
  context.imageSmoothingQuality = smoothing ? 'high' : 'low';
  context.drawImage(
    source,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    LAMA_INPUT_SIZE,
    LAMA_INPUT_SIZE
  );
  return canvas;
}

async function runLama(
  modelUrl: string,
  sourceCanvas: OffscreenCanvas,
  binaryMask: Uint8ClampedArray,
  bounds: PixelRect,
  padding: number
): Promise<ImageData> {
  post({
    id: currentRequestId,
    type: 'progress',
    progress: 18,
    message: '正在按需加载 LaMa 模型'
  });
  ort.env.wasm.wasmPaths = {
    wasm: IMAGE_TOOL_MODELS['ort-webgpu-runtime'].route,
    mjs: IMAGE_TOOL_MODELS['ort-webgpu-module'].route
  };
  ort.env.wasm.numThreads = Math.max(
    1,
    Math.min(4, navigator.hardwareConcurrency || 1)
  );
  const session = await ort.InferenceSession.create(modelUrl, {
    executionProviders: ['webgpu'],
    graphOptimizationLevel: 'all'
  });
  try {
    const contextRect = expandMaskContext(
      bounds,
      sourceCanvas.width,
      sourceCanvas.height,
      Math.max(32, padding),
      96
    );
    const fullMaskCanvas = new OffscreenCanvas(
      sourceCanvas.width,
      sourceCanvas.height
    );
    const fullMaskContext = fullMaskCanvas.getContext('2d');
    if (!fullMaskContext) throw new Error('Mask canvas is unavailable');
    fullMaskContext.putImageData(
      binaryMaskImage(binaryMask, sourceCanvas.width, sourceCanvas.height),
      0,
      0
    );
    const inputCanvas = cropToModelCanvas(sourceCanvas, contextRect, true);
    const maskCanvas = cropToModelCanvas(fullMaskCanvas, contextRect, false);
    const inputContext = inputCanvas.getContext('2d', {
      willReadFrequently: true
    });
    const maskContext = maskCanvas.getContext('2d', {
      willReadFrequently: true
    });
    if (!inputContext || !maskContext)
      throw new Error('Model input canvas is unavailable');
    post({
      id: currentRequestId,
      type: 'progress',
      progress: 42,
      message: '正在修复蒙版区域'
    });
    const imageInput = imageTensor(
      inputContext.getImageData(0, 0, LAMA_INPUT_SIZE, LAMA_INPUT_SIZE)
    );
    const maskInput = maskTensor(
      maskContext.getImageData(0, 0, LAMA_INPUT_SIZE, LAMA_INPUT_SIZE)
    );
    let outputs: Awaited<ReturnType<typeof session.run>> | null = null;
    try {
      outputs = await session.run({
        [session.inputNames[0]]: imageInput,
        [session.inputNames[1]]: maskInput
      });
      const repairedTile = imageDataFromTensor(
        outputs[session.outputNames[0]]
      );
      const repairedTileCanvas = new OffscreenCanvas(
        LAMA_INPUT_SIZE,
        LAMA_INPUT_SIZE
      );
      repairedTileCanvas.getContext('2d')?.putImageData(repairedTile, 0, 0);
      const repairedCanvas = new OffscreenCanvas(
        sourceCanvas.width,
        sourceCanvas.height
      );
      const repairedContext = repairedCanvas.getContext('2d', {
        willReadFrequently: true
      });
      if (!repairedContext) throw new Error('Repair canvas is unavailable');
      repairedContext.drawImage(sourceCanvas, 0, 0);
      repairedContext.imageSmoothingEnabled = true;
      repairedContext.imageSmoothingQuality = 'high';
      repairedContext.drawImage(
        repairedTileCanvas,
        0,
        0,
        LAMA_INPUT_SIZE,
        LAMA_INPUT_SIZE,
        contextRect.x,
        contextRect.y,
        contextRect.width,
        contextRect.height
      );
      return repairedContext.getImageData(
        0,
        0,
        repairedCanvas.width,
        repairedCanvas.height
      );
    } finally {
      imageInput.dispose();
      maskInput.dispose();
      if (outputs) {
        for (const tensor of Object.values(outputs)) tensor.dispose();
      }
    }
  } finally {
    await session.release();
  }
}

async function runFallback(
  original: ImageData,
  binaryMask: Uint8ClampedArray,
  _radius: number
): Promise<ImageData> {
  const output = fillMaskedPixelsFromBoundary(
    original.data,
    binaryMask,
    original.width,
    original.height,
    (completed, total) => {
      post({
        id: currentRequestId,
        type: 'progress',
        progress: 20 + Math.round((completed / Math.max(1, total)) * 68),
        message: '正在从蒙版边缘扩散周围纹理'
      });
    }
  );
  return new ImageData(
    new Uint8ClampedArray(output),
    original.width,
    original.height
  );
}

let currentRequestId = '';

self.onmessage = async (event: MessageEvent<InpaintRequest>) => {
  const { id, file, mask, outputType, radius, feather, modelUrl } = event.data;
  currentRequestId = id;
  try {
    const [bitmap, maskBitmap] = await Promise.all([
      createImageBitmap(file),
      createImageBitmap(mask)
    ]);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const maskCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const maskContext = maskCanvas.getContext('2d', {
      willReadFrequently: true
    });
    if (!context || !maskContext)
      throw new Error('OffscreenCanvas is unavailable');
    context.drawImage(bitmap, 0, 0);
    maskContext.drawImage(maskBitmap, 0, 0);
    bitmap.close();
    maskBitmap.close();
    const original = context.getImageData(0, 0, canvas.width, canvas.height);
    const maskRgba = maskContext.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    ).data;
    const binaryMask = new Uint8ClampedArray(canvas.width * canvas.height);
    for (let pixel = 0; pixel < binaryMask.length; pixel += 1) {
      binaryMask[pixel] = maskRgba[pixel * 4 + 3] >= 16 ? 255 : 0;
    }
    const bounds = findMaskBounds(binaryMask, canvas.width, canvas.height, 1);
    if (!bounds) throw new Error('请先绘制需要修复的区域。');
    let repaired: ImageData;
    let engine = '边界扩散纹理填充 Worker';
    if (modelUrl) {
      try {
        repaired = await runLama(
          modelUrl,
          canvas,
          binaryMask,
          bounds,
          radius * 2
        );
        engine = 'LaMa · ONNX WebGPU';
      } catch (error) {
        post({
          id,
          type: 'progress',
          progress: 16,
          message: `LaMa 不可用，已切换邻域纹理填充：${
            error instanceof Error ? error.message : '未知错误'
          }`
        });
        repaired = await runFallback(original, binaryMask, radius);
      }
    } else {
      repaired = await runFallback(original, binaryMask, radius);
    }
    const blendMask = createInnerFeatherMask(
      binaryMask,
      canvas.width,
      canvas.height,
      feather
    );
    const composited = compositeMaskedPixels(
      original.data,
      repaired.data,
      blendMask
    );
    const outputPixels = new Uint8ClampedArray(composited.length);
    outputPixels.set(composited);
    context.putImageData(
      new ImageData(outputPixels, canvas.width, canvas.height),
      0,
      0
    );
    const blob = await canvas.convertToBlob({
      type: outputType,
      quality: 0.92
    });
    post({
      id,
      type: 'result',
      blob,
      width: canvas.width,
      height: canvas.height,
      engine
    });
  } catch (error) {
    post({
      id,
      type: 'error',
      error: error instanceof Error ? error.message : 'Inpainting failed'
    });
  } finally {
    currentRequestId = '';
  }
};

export {};
