import * as ort from 'onnxruntime-web/all';
import {
  blendDenoisedRgba,
  type DenoisePixelChange
} from '../shared/image-denoise';
import { IMAGE_TOOL_MODELS } from '../shared/image-tool-models';
import { loadImageModel } from '../shared/image-model-cache';

let reusableSession: {
  modelUrl: string;
  session: ort.InferenceSession;
} | null = null;

type RestoreRequest = {
  id: string;
  operation: 'upscale' | 'denoise';
  file: Blob;
  modelUrl: string;
  targetWidth: number;
  targetHeight: number;
  outputType: 'image/png' | 'image/webp';
  strength?: 'light' | 'standard' | 'strong';
};

type RestoreResponse =
  | { id: string; type: 'progress'; progress: number; message: string }
  | {
      id: string;
      type: 'result';
      blob: Blob;
      width: number;
      height: number;
      engine: string;
      pixelChange?: DenoisePixelChange;
    }
  | { id: string; type: 'error'; error: string };

function post(response: RestoreResponse) {
  self.postMessage(response);
}

function tensorFromImageData(image: ImageData): ort.Tensor {
  const pixels = image.width * image.height;
  const data = new Float32Array(pixels * 3);
  for (let index = 0; index < pixels; index += 1) {
    data[index] = image.data[index * 4] / 255;
    data[pixels + index] = image.data[index * 4 + 1] / 255;
    data[pixels * 2 + index] = image.data[index * 4 + 2] / 255;
  }
  return new ort.Tensor('float32', data, [1, 3, image.height, image.width]);
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

function starts(length: number, size: number, overlap: number): number[] {
  if (length <= size) return [0];
  const result: number[] = [];
  for (let value = 0; value < length; value += size - overlap) {
    const start = Math.min(value, length - size);
    if (result.at(-1) !== start) result.push(start);
    if (start === length - size) break;
  }
  return result;
}

async function runModel(request: RestoreRequest) {
  ort.env.wasm.wasmPaths = {
    wasm: IMAGE_TOOL_MODELS['ort-webgpu-runtime'].route,
    mjs: IMAGE_TOOL_MODELS['ort-webgpu-module'].route
  };
  ort.env.wasm.initTimeout = 60_000;
  ort.env.wasm.numThreads = Math.max(
    1,
    Math.min(4, navigator.hardwareConcurrency || 1)
  );
  let bitmap: ImageBitmap | null = null;
  try {
    if (reusableSession?.modelUrl !== request.modelUrl) {
      await reusableSession?.session.release();
      reusableSession = null;
      const modelBytes = await loadImageModel(
        request.modelUrl,
        (percent, message) => {
          post({
            id: request.id,
            type: 'progress',
            progress: 3 + Math.round(percent * 0.21),
            message
          });
        }
      );
      post({
        id: request.id,
        type: 'progress',
        progress: 25,
        message: '正在初始化 WebGPU AI 引擎'
      });
      const session = await ort.InferenceSession.create(modelBytes, {
        executionProviders: ['webgpu'],
        graphOptimizationLevel: 'all'
      });
      reusableSession = { modelUrl: request.modelUrl, session };
    } else {
      post({
        id: request.id,
        type: 'progress',
        progress: 25,
        message: '已复用 AI 引擎，无需重新加载模型'
      });
    }
    const session = reusableSession.session;
    post({
      id: request.id,
      type: 'progress',
      progress: 28,
      message: 'AI 引擎已就绪，正在准备图像'
    });
    bitmap = await createImageBitmap(request.file);
    const scale = request.operation === 'upscale' ? 4 : 1;
    // Preserve every source pixel. Resize the inferred tiles into the final
    // canvas instead of shrinking the input to target / 4 before inference.
    const workWidth = bitmap.width;
    const workHeight = bitmap.height;
    const sourceCanvas = new OffscreenCanvas(workWidth, workHeight);
    const sourceContext = sourceCanvas.getContext('2d', {
      alpha: true,
      willReadFrequently: true
    });
    if (!sourceContext) throw new Error('OffscreenCanvas is unavailable');
    sourceContext.imageSmoothingEnabled = true;
    sourceContext.imageSmoothingQuality = 'high';
    sourceContext.drawImage(bitmap, 0, 0, workWidth, workHeight);
    bitmap.close();
    bitmap = null;

    const tileSize = request.operation === 'upscale' ? 64 : 256;
    const overlap = request.operation === 'upscale' ? 8 : 24;
    const xStarts = starts(workWidth, tileSize, overlap);
    const yStarts = starts(workHeight, tileSize, overlap);
    const outputCanvas = new OffscreenCanvas(
      request.targetWidth,
      request.targetHeight
    );
    const outputContext = outputCanvas.getContext('2d');
    if (!outputContext) throw new Error('Output canvas is unavailable');
    outputContext.imageSmoothingEnabled = true;
    outputContext.imageSmoothingQuality = 'high';
    const outputScaleX = request.targetWidth / workWidth;
    const outputScaleY = request.targetHeight / workHeight;
    let completed = 0;
    const total = xStarts.length * yStarts.length;
    let denoiseAbsoluteDelta = 0;
    let denoiseChangedPixels = 0;
    let denoiseSampledPixels = 0;

    for (const y of yStarts) {
      for (const x of xStarts) {
        const width = Math.min(tileSize, workWidth - x);
        const height = Math.min(tileSize, workHeight - y);
        const inputImage = sourceContext.getImageData(x, y, tileSize, tileSize);
        const input = tensorFromImageData(inputImage);
        const feeds: Record<string, ort.Tensor> = {
          [session.inputNames[0]]: input
        };
        const outputs = await session.run(feeds);
        let image: ImageData;
        try {
          image = imageDataFromTensor(outputs[session.outputNames[0]]);
        } finally {
          input.dispose();
          for (const tensor of Object.values(outputs)) tensor.dispose();
        }
        if (request.operation === 'denoise') {
          const tileChange = blendDenoisedRgba({
            source: inputImage.data,
            denoised: image.data,
            rowWidth: image.width,
            validWidth: width,
            validHeight: height,
            strength: request.strength || 'standard'
          });
          denoiseAbsoluteDelta +=
            tileChange.averageChannelDelta * tileChange.sampledPixels * 3;
          denoiseChangedPixels +=
            (tileChange.changedPixelPercent / 100) * tileChange.sampledPixels;
          denoiseSampledPixels += tileChange.sampledPixels;
        }
        const tileCanvas = new OffscreenCanvas(image.width, image.height);
        const tileContext = tileCanvas.getContext('2d');
        tileContext?.putImageData(image, 0, 0);
        if (!tileContext) throw new Error('Tile canvas is unavailable');
        const feather = overlap * scale;
        tileContext.globalCompositeOperation = 'destination-in';
        if (x > 0) {
          const gradient = tileContext.createLinearGradient(0, 0, feather, 0);
          gradient.addColorStop(0, 'rgba(0,0,0,0)');
          gradient.addColorStop(1, 'rgba(0,0,0,1)');
          tileContext.fillStyle = gradient;
          tileContext.fillRect(0, 0, image.width, image.height);
        }
        if (y > 0) {
          const gradient = tileContext.createLinearGradient(0, 0, 0, feather);
          gradient.addColorStop(0, 'rgba(0,0,0,0)');
          gradient.addColorStop(1, 'rgba(0,0,0,1)');
          tileContext.fillStyle = gradient;
          tileContext.fillRect(0, 0, image.width, image.height);
        }
        tileContext.globalCompositeOperation = 'source-over';
        outputContext.drawImage(
          tileCanvas,
          0,
          0,
          width * scale,
          height * scale,
          x * outputScaleX,
          y * outputScaleY,
          width * outputScaleX,
          height * outputScaleY
        );
        completed += 1;
        post({
          id: request.id,
          type: 'progress',
          progress: 29 + Math.round((completed / total) * 65),
          message: `正在处理分块 ${completed}/${total}`
        });
      }
    }

    outputContext.globalCompositeOperation = 'destination-in';
    outputContext.drawImage(
      sourceCanvas,
      0,
      0,
      outputCanvas.width,
      outputCanvas.height
    );
    outputContext.globalCompositeOperation = 'source-over';

    const blob = await outputCanvas.convertToBlob({
      type: request.outputType,
      quality: 0.94
    });
    post({
      id: request.id,
      type: 'result',
      blob,
      width: request.targetWidth,
      height: request.targetHeight,
      engine:
        request.operation === 'upscale'
          ? 'Real-ESRGAN · WebGPU'
          : 'SCUNet · WebGPU',
      pixelChange:
        request.operation === 'denoise' && denoiseSampledPixels > 0
          ? {
              averageChannelDelta:
                denoiseAbsoluteDelta / (denoiseSampledPixels * 3),
              changedPixelPercent:
                (denoiseChangedPixels / denoiseSampledPixels) * 100,
              sampledPixels: denoiseSampledPixels
            }
          : undefined
    });
  } catch (error) {
    const failed = reusableSession;
    reusableSession = null;
    await failed?.session.release().catch(() => {});
    throw error;
  } finally {
    bitmap?.close();
  }
}

self.onmessage = (event: MessageEvent<RestoreRequest>) => {
  post({
    id: event.data.id,
    type: 'progress',
    progress: 2,
    message: '正在准备本地 AI 任务'
  });
  void runModel(event.data).catch((error) => {
    post({
      id: event.data.id,
      type: 'error',
      error: error instanceof Error ? error.message : 'ONNX inference failed'
    });
  });
};

export {};
