import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  disposeIdleImageUpscaleWorker,
  runImageUpscale,
  type ImageUpscaleTarget
} from '../image-upscale';

class ControlledWorker {
  static instances: ControlledWorker[] = [];
  static lastPosted: ControlledWorker;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn((_request: { id: string }) => {
    ControlledWorker.lastPosted = this;
  });
  terminate = vi.fn();

  constructor() {
    ControlledWorker.instances.push(this);
  }

  emit(data: Record<string, unknown>) {
    this.onmessage?.({
      data: { id: this.postMessage.mock.calls.at(-1)![0].id, ...data }
    } as MessageEvent);
  }
}

const drawImage = vi.fn();
const encodedImage = new Blob(['encoded image'], { type: 'image/png' });

function start(target: ImageUpscaleTarget = 2048, allowCanvasFallback = true) {
  const controller = new AbortController();
  const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
  const progress = vi.fn();
  const promise = runImageUpscale({
    source: {
      id: 'source',
      file: new File(['source'], 'source.png', { type: 'image/png' }),
      bitmap: {} as ImageBitmap,
      width: 1000,
      height: 500,
      url: 'blob:source'
    },
    target,
    format: 'image/png',
    canUseAi: true,
    allowCanvasFallback,
    modelUrl: '/models/test.onnx',
    signal: controller.signal,
    onProgress: progress
  });
  const worker = ControlledWorker.lastPosted;
  return { controller, removeListener, progress, promise, worker };
}

function expectCleanedUp(run: ReturnType<typeof start>) {
  expect(run.worker.terminate).toHaveBeenCalledTimes(1);
  expect(run.removeListener).toHaveBeenCalledWith(
    'abort',
    expect.any(Function)
  );
  expect(vi.getTimerCount()).toBe(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  ControlledWorker.instances = [];
  drawImage.mockClear();
  vi.stubGlobal('Worker', ControlledWorker);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
    (callback) => {
      callback(encodedImage);
    }
  );
});

afterEach(() => {
  disposeIdleImageUpscaleWorker();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('runImageUpscale Worker lifecycle', () => {
  it('does not silently replace failed AI with standard resizing', async () => {
    const run = start(2048, false);
    run.worker.emit({ type: 'error', error: 'WebGPU unavailable' });
    await expect(run.promise).rejects.toThrow('普通放大');
    expect(drawImage).not.toHaveBeenCalled();
    expectCleanedUp(run);
  });
  it('finishes through Canvas after 120 seconds without progress', async () => {
    const run = start();
    await vi.advanceTimersByTimeAsync(119_999);
    expect(drawImage).not.toHaveBeenCalled();
    expect(run.worker.terminate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await expect(run.promise).resolves.toMatchObject({
      blob: encodedImage,
      width: 2048,
      height: 1024,
      engine: '标准放大 · Canvas（AI 已降级）',
      message: expect.stringContaining('120 秒没有新进展')
    });
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(run.progress).toHaveBeenLastCalledWith(
      94,
      expect.stringContaining('正在改用标准放大')
    );
    expectCleanedUp(run);
  });

  it.each([
    [2048, 360_000, 6],
    [4096, 720_000, 12]
  ] as const)(
    'keeps the %i deadline despite regular progress',
    async (target, deadline, minutes) => {
      const run = start(target);
      for (let elapsed = 60_000; elapsed < deadline; elapsed += 60_000) {
        await vi.advanceTimersByTimeAsync(60_000);
        run.worker.emit({ type: 'progress', progress: 50, message: 'working' });
        expect(run.worker.terminate).not.toHaveBeenCalled();
      }
      await vi.advanceTimersByTimeAsync(59_999);
      expect(run.worker.terminate).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await expect(run.promise).resolves.toMatchObject({
        width: target,
        height: target / 2,
        engine: '标准放大 · Canvas（AI 已降级）',
        message: expect.stringContaining(`总耗时超过 ${minutes} 分钟`)
      });
      expectCleanedUp(run);
    }
  );

  it('settles an unreadable Worker message through Canvas', async () => {
    const run = start();
    run.worker.onmessageerror?.();
    await expect(run.promise).resolves.toMatchObject({
      engine: '标准放大 · Canvas（AI 已降级）',
      message: expect.stringContaining('无法读取的结果')
    });
    expectCleanedUp(run);
  });

  it('rejects cancellation without starting Canvas fallback', async () => {
    const run = start();
    const rejected = expect(run.promise).rejects.toMatchObject({
      name: 'AbortError'
    });
    run.controller.abort();
    await rejected;
    expect(drawImage).not.toHaveBeenCalled();
    expectCleanedUp(run);
  });

  it('cleans up after an AI result and ignores late progress', async () => {
    const run = start();
    run.worker.emit({
      type: 'result',
      blob: encodedImage,
      width: 2048,
      height: 1024,
      engine: 'AI'
    });
    await expect(run.promise).resolves.toMatchObject({ engine: 'AI' });
    const progressCount = run.progress.mock.calls.length;
    run.worker.emit({ type: 'progress', progress: 99, message: 'late' });
    expect(run.progress).toHaveBeenCalledTimes(progressCount);
    expect(drawImage).not.toHaveBeenCalled();
    expect(run.worker.terminate).not.toHaveBeenCalled();
    const next = start();
    expect(next.worker).toBe(run.worker);
    expect(ControlledWorker.instances).toHaveLength(1);
    next.worker.onmessage?.({
      data: {
        id: next.worker.postMessage.mock.calls.at(-1)![0].id,
        type: 'result',
        blob: encodedImage,
        width: 2048,
        height: 1024,
        engine: 'AI'
      }
    } as MessageEvent);
    await expect(next.promise).resolves.toMatchObject({ engine: 'AI' });
    await vi.advanceTimersByTimeAsync(120_000);
    expectCleanedUp(run);
  });

  it('discards a cancelled reused Worker and keeps parallel jobs isolated', async () => {
    const first = start();
    const parallel = start();
    expect(first.worker).not.toBe(parallel.worker);
    first.worker.emit({
      type: 'result',
      blob: encodedImage,
      width: 2048,
      height: 1024,
      engine: 'AI'
    });
    await first.promise;
    const reused = start();
    expect(reused.worker).toBe(first.worker);
    const cancelled = expect(reused.promise).rejects.toMatchObject({
      name: 'AbortError'
    });
    reused.controller.abort();
    await cancelled;
    expect(first.worker.terminate).toHaveBeenCalledOnce();
    expect(parallel.worker.terminate).not.toHaveBeenCalled();
    parallel.worker.emit({
      type: 'result',
      blob: encodedImage,
      width: 2048,
      height: 1024,
      engine: 'AI'
    });
    await parallel.promise;
    window.dispatchEvent(new Event('pagehide'));
    expect(parallel.worker.terminate).toHaveBeenCalledOnce();
  });
});
