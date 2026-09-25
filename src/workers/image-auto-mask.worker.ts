import * as ort from 'onnxruntime-web/all';
import { IMAGE_TOOL_MODELS } from '../shared/image-tool-models';

// 移植自 MobileSAM-in-the-Browser（MIT）：编码器按宽 1024 等比缩放，
// 解码器以编码尺寸作为 orig_im_size，点击坐标映射到编码空间。
const ENCODER_SIZE = 1024;

type AutoMaskRequest =
  | {
      id: string;
      type: 'encode';
      file: Blob;
      encoderUrl?: string;
      decoderUrl?: string;
    }
  | {
      id: string;
      type: 'segment';
      point: { x: number; y: number }; // 归一化 0..1，相对原图
      decoderUrl?: string;
    };

type AutoMaskResponse =
  | { id: string; type: 'progress'; progress: number; message?: string }
  | { id: string; type: 'ready' }
  | { id: string; type: 'mask'; blob: Blob; width: number; height: number }
  | { id: string; type: 'error'; error: string };

function post(response: AutoMaskResponse) {
  self.postMessage(response);
}

let encoderSession: ort.InferenceSession | null = null;
let decoderSession: ort.InferenceSession | null = null;
let encoderUrl: string | null = null;
let decoderUrl: string | null = null;
let imageEmbeddings: ort.Tensor | null = null;
let encodedWidth = 0;
let encodedHeight = 0;
let originalWidth = 0;
let originalHeight = 0;

function configureOrt() {
  ort.env.wasm.wasmPaths = {
    wasm: IMAGE_TOOL_MODELS['ort-webgpu-runtime'].route,
    mjs: IMAGE_TOOL_MODELS['ort-webgpu-module'].route
  };
  ort.env.wasm.numThreads = Math.max(
    1,
    Math.min(4, navigator.hardwareConcurrency || 1)
  );
}

async function createSession(url: string): Promise<ort.InferenceSession> {
  configureOrt();
  // worker 内 WebGPU 初始化不稳定（bg-removal 已验证 wasm 可靠），统一用 wasm
  return ort.InferenceSession.create(url, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all'
  });
}

async function ensureEncoder(url: string): Promise<ort.InferenceSession> {
  if (encoderSession && encoderUrl === url) return encoderSession;
  post({
    id: currentRequestId,
    type: 'progress',
    progress: 15,
    message: '正在加载图像编码模型'
  });
  encoderSession = await createSession(url);
  encoderUrl = url;
  return encoderSession;
}

async function ensureDecoder(url: string): Promise<ort.InferenceSession> {
  if (decoderSession && decoderUrl === url) return decoderSession;
  post({
    id: currentRequestId,
    type: 'progress',
    progress: 35,
    message: '正在加载蒙版解码模型'
  });
  decoderSession = await createSession(url);
  decoderUrl = url;
  return decoderSession;
}

function resizeCanvas(
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

function imageTensorFromImageData(image: ImageData): ort.Tensor {
  // MobileSAM 编码器输入：原始 0-255 RGB（×255），CHW
  const pixels = image.width * image.height;
  const data = new Float32Array(pixels * 3);
  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 4;
    data[index] = image.data[offset];
    data[pixels + index] = image.data[offset + 1];
    data[pixels * 2 + index] = image.data[offset + 2];
  }
  return new ort.Tensor('float32', data, [1, 3, image.height, image.width]);
}

async function encode(file: Blob, encoderModelUrl: string) {
  const bitmap = await createImageBitmap(file);
  originalWidth = bitmap.width;
  originalHeight = bitmap.height;
  const scale = ENCODER_SIZE / bitmap.width;
  encodedWidth = ENCODER_SIZE;
  encodedHeight = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = resizeCanvas(bitmap, encodedWidth, encodedHeight);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas context is unavailable');
  const imageData = context.getImageData(0, 0, encodedWidth, encodedHeight);
  bitmap.close();

  const session = await ensureEncoder(encoderModelUrl);
  const results = await session.run({
    input_image: imageTensorFromImageData(imageData)
  });
  imageEmbeddings = results.image_embeddings as ort.Tensor;
  post({ id: currentRequestId, type: 'progress', progress: 60 });
  post({ id: currentRequestId, type: 'ready' });
}

async function segment(point: { x: number; y: number }, decoderModelUrl: string) {
  if (!imageEmbeddings || encodedWidth <= 0 || encodedHeight <= 0) {
    throw new Error('请先完成图像编码');
  }
  const session = await ensureDecoder(decoderModelUrl);
  const pointX = point.x * encodedWidth;
  const pointY = point.y * encodedHeight;
  const pointCoords = new ort.Tensor(
    new Float32Array([pointX, pointY, 0, 0]),
    [1, 2, 2]
  );
  const pointLabels = new ort.Tensor(new Float32Array([1, -1]), [1, 2]);
  const maskInput = new ort.Tensor(
    new Float32Array(256 * 256),
    [1, 1, 256, 256]
  );
  const hasMaskInput = new ort.Tensor(new Float32Array([0]), [1]);
  const originalImageSize = new ort.Tensor(
    new Float32Array([encodedHeight, encodedWidth]),
    [2]
  );

  const results = await session.run({
    image_embeddings: imageEmbeddings,
    point_coords: pointCoords,
    point_labels: pointLabels,
    mask_input: maskInput,
    has_mask_input: hasMaskInput,
    orig_im_size: originalImageSize
  });
  const masks = results.masks as ort.Tensor;
  const values = masks.data as Float32Array;
  const maskWidth = masks.dims[3];
  const maskHeight = masks.dims[2];

  // 蒙版缩放到原图尺寸并输出 PNG
  const maskCanvas = new OffscreenCanvas(maskWidth, maskHeight);
  const maskContext = maskCanvas.getContext('2d', {
    willReadFrequently: true
  });
  if (!maskContext) throw new Error('Mask canvas is unavailable');
  const maskImage = maskContext.createImageData(maskWidth, maskHeight);
  for (let index = 0; index < maskWidth * maskHeight; index += 1) {
    const alpha = Math.round(
      Math.max(0, Math.min(1, values[index])) * 255
    );
    const offset = index * 4;
    maskImage.data[offset] = 76;
    maskImage.data[offset + 1] = 175;
    maskImage.data[offset + 2] = 255;
    maskImage.data[offset + 3] = alpha;
  }
  maskContext.putImageData(maskImage, 0, 0);
  const upscaled = resizeCanvas(maskCanvas, originalWidth, originalHeight);
  const blob = await upscaled.convertToBlob({ type: 'image/png' });
  post({
    id: currentRequestId,
    type: 'mask',
    blob,
    width: originalWidth,
    height: originalHeight
  });
}

let currentRequestId = '';

self.onmessage = async (event: MessageEvent<AutoMaskRequest>) => {
  const request = event.data;
  currentRequestId = request.id;
  try {
    if (request.type === 'encode') {
      await encode(
        request.file,
        request.encoderUrl || IMAGE_TOOL_MODELS['mobile-sam-encoder'].route
      );
    } else if (request.type === 'segment') {
      await segment(
        request.point,
        request.decoderUrl || IMAGE_TOOL_MODELS['mobile-sam-decoder'].route
      );
    }
  } catch (error) {
    post({
      id: currentRequestId,
      type: 'error',
      error: error instanceof Error ? error.message : '自动蒙版失败'
    });
  }
};

export {};
