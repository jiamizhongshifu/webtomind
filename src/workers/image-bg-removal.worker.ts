import * as ort from 'onnxruntime-web/all';
import { IMAGE_TOOL_MODELS } from '../shared/image-tool-models';

const INPUT_SIZE = 320;
// ImageNet 归一化（u2net/silueta 训练时使用）
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

type BgRemovalRequest = {
  id: string;
  file: Blob;
  modelUrl?: string;
  outputType: 'image/png' | 'image/webp';
};

type BgRemovalResponse =
  | {
      id: string;
      type: 'progress';
      progress: number;
      message?: string;
    }
  | { id: string; type: 'result'; blob: Blob; width: number; height: number }
  | { id: string; type: 'error'; error: string };

function post(response: BgRemovalResponse) {
  self.postMessage(response);
}

function resizeToCanvas(
  source: CanvasImageSource,
  width: number,
  height: number
): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas is unavailable');
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

function imageTensor(image: ImageData): ort.Tensor {
  const pixels = image.width * image.height;
  const data = new Float32Array(pixels * 3);
  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 4;
    data[index] = (image.data[offset] / 255 - MEAN[0]) / STD[0];
    data[pixels + index] = (image.data[offset + 1] / 255 - MEAN[1]) / STD[1];
    data[pixels * 2 + index] =
      (image.data[offset + 2] / 255 - MEAN[2]) / STD[2];
  }
  return new ort.Tensor('float32', data, [1, 3, image.height, image.width]);
}

async function runSilueta(
  modelUrl: string,
  bitmap: ImageBitmap,
  originalWidth: number,
  originalHeight: number
): Promise<ImageData> {
  post({
    id: currentRequestId,
    type: 'progress',
    progress: 20,
    message: '正在按需加载背景去除模型'
  });
  const session = await ensureSession(modelUrl);

  const inputCanvas = resizeToCanvas(bitmap, INPUT_SIZE, INPUT_SIZE);
  const inputContext = inputCanvas.getContext('2d', {
    willReadFrequently: true
  });
  if (!inputContext) throw new Error('Canvas context is unavailable');
  const imageData = inputContext.getImageData(
    0,
    0,
    INPUT_SIZE,
    INPUT_SIZE
  );

  const feeds: Record<string, ort.Tensor> = {
    'input.1': imageTensor(imageData)
  };
  const results = await session.run(feeds);
  const output = Object.values(results)[0];
  const values = output.data as Float32Array;

  // 输出已是 sigmoid 概率（0..1），直接转 alpha → 缩放到原图尺寸
  const maskCanvas = new OffscreenCanvas(originalWidth, originalHeight);
  const maskContext = maskCanvas.getContext('2d', {
    willReadFrequently: true
  });
  if (!maskContext) throw new Error('Mask canvas is unavailable');
  const lowRes = new OffscreenCanvas(INPUT_SIZE, INPUT_SIZE);
  const lowContext = lowRes.getContext('2d', { willReadFrequently: true });
  if (!lowContext) throw new Error('Mask canvas is unavailable');
  const lowImage = lowContext.createImageData(INPUT_SIZE, INPUT_SIZE);
  for (let index = 0; index < values.length; index += 1) {
    const alpha = Math.round(
      Math.max(0, Math.min(1, values[index])) * 255
    );
    const offset = index * 4;
    lowImage.data[offset] = alpha;
    lowImage.data[offset + 1] = alpha;
    lowImage.data[offset + 2] = alpha;
    lowImage.data[offset + 3] = 255;
  }
  lowContext.putImageData(lowImage, 0, 0);
  maskContext.drawImage(lowRes, 0, 0, originalWidth, originalHeight);
  return maskContext.getImageData(0, 0, originalWidth, originalHeight);
}

let currentRequestId = '';

let session: ort.InferenceSession | null = null;
let sessionModelUrl: string | null = null;

async function ensureSession(modelUrl: string): Promise<ort.InferenceSession> {
  if (session && sessionModelUrl === modelUrl) return session;
  ort.env.wasm.wasmPaths = {
    wasm: IMAGE_TOOL_MODELS['ort-webgpu-runtime'].route,
    mjs: IMAGE_TOOL_MODELS['ort-webgpu-module'].route
  };
  ort.env.wasm.numThreads = Math.max(
    1,
    Math.min(4, navigator.hardwareConcurrency || 1)
  );
  session = await ort.InferenceSession.create(modelUrl, {
    // u2net/silueta 含 MaxPool ceil_mode，WebGPU EP 不支持，用 wasm 保证可用
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all'
  });
  sessionModelUrl = modelUrl;
  return session;
}

self.onmessage = async (event: MessageEvent<BgRemovalRequest>) => {
  const { id, file, modelUrl, outputType } = event.data;
  currentRequestId = id;
  try {
    const bitmap = await createImageBitmap(file);
    const width = bitmap.width;
    const height = bitmap.height;
    post({ id, type: 'progress', progress: 10, message: '正在分析图像' });

    const mask = await runSilueta(
      modelUrl || IMAGE_TOOL_MODELS.silueta.route,
      bitmap,
      width,
      height
    );

    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable');
    context.drawImage(bitmap, 0, 0);
    const rgba = context.getImageData(0, 0, width, height);
    for (let index = 0; index < width * height; index += 1) {
      rgba.data[index * 4 + 3] = mask.data[index * 4];
    }
    context.putImageData(rgba, 0, 0);
    bitmap.close();

    const blob = await canvas.convertToBlob({ type: outputType });
    post({ id, type: 'progress', progress: 100 });
    post({ id, type: 'result', blob, width, height });
  } catch (error) {
    post({
      id,
      type: 'error',
      error: error instanceof Error ? error.message : '背景去除失败'
    });
  }
};

export {};
