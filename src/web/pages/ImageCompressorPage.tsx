import { Gauge } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Slider } from '@/shared/ui/radix/slider';
import { getLocalizedCreateAppContent } from '@/shared/create-apps';
import {
  EmptyResult,
  ImageToolShell,
  ImageUploadField,
  ResultActions,
  ToolStatus,
  useImageToolUpload,
  type ToolRunState
} from '@/web/components/image-tools/ImageToolShell';
import {
  createImageToolResultIdentity,
  downloadBlob,
  formatBytes,
  getExtension,
  stripImageExtension,
  type ImageToolOutputFormat
} from '@/web/lib/image-tools';
import { applySeo } from '@/web/lib/seo';
import { useRouteLocale } from '@/web/lib/route-locale';

type WorkerResponse = {
  id: string;
  success: boolean;
  blob?: Blob;
  width?: number;
  height?: number;
  quality?: number;
  targetMet?: boolean;
  targetBytes?: number;
  mimeType?: ImageToolOutputFormat;
  error?: string;
};

export function ImageCompressorPage() {
  const { locale, isZh } = useRouteLocale();
  const tool = getLocalizedCreateAppContent('image-compressor', locale)!;
  const upload = useImageToolUpload();
  const setUploadError = upload.setError;
  const workerRef = useRef<Worker | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const [format, setFormat] = useState<ImageToolOutputFormat>('image/webp');
  const [quality, setQuality] = useState(0.82);
  const [mode, setMode] = useState<'quality' | 'target'>('quality');
  const [maxLongEdge, setMaxLongEdge] = useState(0);
  const [targetKb, setTargetKb] = useState(500);
  const [state, setState] = useState<ToolRunState>('idle');
  const [result, setResult] = useState<{
    identity: string;
    blob: Blob;
    url: string;
    width: number;
    height: number;
    quality: number;
    outputFormat: ImageToolOutputFormat;
    sourceName: string;
    sourceBytes: number;
    mode: 'quality' | 'target';
    targetBytes?: number;
    targetMet?: boolean;
  } | null>(null);
  const resultIdentity = createImageToolResultIdentity(upload.source, [
    upload.revision,
    format,
    quality,
    mode,
    maxLongEdge,
    targetKb
  ]);
  const resultIdentityRef = useRef(resultIdentity);
  resultIdentityRef.current = resultIdentity;
  const currentResult = result?.identity === resultIdentity ? result : null;

  useEffect(
    () =>
      applySeo({
        title: isZh
          ? '免费在线图片压缩工具：WebP、JPEG、PNG | WebToMind'
          : 'Free Online Image Compressor: WebP, JPEG, PNG | WebToMind',
        description: tool.description,
        htmlLang: isZh ? 'zh-CN' : 'en'
      }),
    [isZh, tool.description]
  );
  useEffect(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    setResult((previous) =>
      previous?.identity === resultIdentity ? previous : null
    );
    setUploadError('');
    setState('idle');
  }, [resultIdentity, setUploadError]);
  useEffect(
    () => () => {
      if (result?.url) URL.revokeObjectURL(result.url);
    },
    [result?.url]
  );
  useEffect(
    () => () => {
      workerRef.current?.terminate();
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    },
    []
  );

  const run = () => {
    const source = upload.source;
    if (!source) return;
    const runIdentity = resultIdentity;
    setState('processing');
    upload.setError('');
    const worker = new Worker(
      new URL('../../workers/image-compress.worker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;
    const id = crypto.randomUUID();
    const finishWorker = () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
    timeoutRef.current = window.setTimeout(() => {
      finishWorker();
      upload.setError('压缩超过 60 秒，已停止处理。请缩小图片后重试。');
      setState('error');
    }, 60_000);
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id) return;
      finishWorker();
      if (!event.data.success || !event.data.blob) {
        upload.setError(event.data.error || '压缩失败，请重试。');
        setState('error');
        return;
      }
      if (resultIdentityRef.current !== runIdentity) return;
      const next = {
        identity: runIdentity,
        blob: event.data.blob,
        url: URL.createObjectURL(event.data.blob),
        width: event.data.width || source.width,
        height: event.data.height || source.height,
        quality: event.data.quality ?? quality,
        outputFormat: event.data.mimeType || format,
        sourceName: source.file.name,
        sourceBytes: source.file.size,
        mode,
        targetBytes: event.data.targetBytes,
        targetMet: event.data.targetMet
      };
      setResult(next);
      setState('success');
    };
    worker.onerror = () => {
      finishWorker();
      upload.setError('压缩 Worker 启动失败，请刷新页面重试。');
      setState('error');
    };
    worker.onmessageerror = () => {
      finishWorker();
      upload.setError('压缩 Worker 返回了无法读取的结果，请重试。');
      setState('error');
    };
    worker.postMessage({
      id,
      file: source.file,
      outputType: format,
      quality,
      maxLongEdge: maxLongEdge || undefined,
      targetBytes:
        mode === 'target' && format !== 'image/png'
          ? Math.max(20, targetKb) * 1024
          : undefined
    });
  };

  const savings = currentResult
    ? Math.round(
        (1 - currentResult.blob.size / currentResult.sourceBytes) * 100
      )
    : 0;

  return (
    <ImageToolShell
      tool={tool}
      controls={
        <>
          <section className="image-tool-control-section">
            <h2>1. 上传图片</h2>
            <ImageUploadField upload={upload} />
          </section>
          <section className="image-tool-control-section">
            <h2>2. 压缩设置</h2>
            <div className="image-tool-field">
              <label htmlFor="compress-format">输出格式</label>
              <select
                id="compress-format"
                value={format}
                disabled={state === 'processing'}
                onChange={(event) => {
                  const next = event.target.value as ImageToolOutputFormat;
                  setFormat(next);
                  if (next === 'image/png') setMode('quality');
                }}
              >
                <option value="image/webp">WebP</option>
                <option value="image/avif">AVIF · 高压缩</option>
                <option value="image/jpeg">JPEG</option>
                <option value="image/png">PNG · 无损</option>
              </select>
            </div>
            {format !== 'image/png' ? (
              <>
                <div className="image-tool-choice-grid">
                  <button
                    className={`image-tool-choice${mode === 'quality' ? ' active' : ''}`}
                    type="button"
                    disabled={state === 'processing'}
                    onClick={() => setMode('quality')}
                  >
                    质量优先
                  </button>
                  <button
                    className={`image-tool-choice${mode === 'target' ? ' active' : ''}`}
                    type="button"
                    disabled={state === 'processing'}
                    onClick={() => setMode('target')}
                  >
                    目标大小
                  </button>
                </div>
                {mode === 'quality' ? (
                  <label className="image-tool-field">
                    <span>质量 {Math.round(quality * 100)}%</span>
                    <Slider
                      min={0.2}
                      max={0.98}
                      step={0.01}
                      value={[quality]}
                      disabled={state === 'processing'}
                      aria-label="质量"
                      thumbAriaLabel="质量"
                      onValueChange={(value) => setQuality(value[0])}
                    />
                  </label>
                ) : (
                  <label className="image-tool-field">
                    <span>目标上限（KB）</span>
                    <input
                      type="number"
                      min={20}
                      max={20480}
                      value={targetKb}
                      disabled={state === 'processing'}
                      onChange={(event) =>
                        setTargetKb(Number(event.target.value))
                      }
                    />
                  </label>
                )}
              </>
            ) : (
              <p>PNG 使用无损编码；如需进一步减小体积，请设置最长边。</p>
            )}
            <div className="image-tool-field">
              <label htmlFor="compress-edge">最长边</label>
              <select
                id="compress-edge"
                value={maxLongEdge}
                disabled={state === 'processing'}
                onChange={(event) => setMaxLongEdge(Number(event.target.value))}
              >
                <option value={0}>保持原尺寸</option>
                <option value={4096}>4096 px</option>
                <option value={2560}>2560 px</option>
                <option value={2048}>2048 px</option>
                <option value={1600}>1600 px</option>
                <option value={1200}>1200 px</option>
              </select>
            </div>
            <button
              className="image-tool-primary-button image-tool-run-button"
              type="button"
              disabled={!upload.source || state === 'processing'}
              onClick={run}
            >
              <Gauge aria-hidden="true" />
              开始压缩
            </button>
            {state === 'processing' ? (
              <button
                className="image-tool-secondary-button image-tool-run-button"
                type="button"
                onClick={() => {
                  workerRef.current?.terminate();
                  workerRef.current = null;
                  if (timeoutRef.current)
                    window.clearTimeout(timeoutRef.current);
                  timeoutRef.current = null;
                  setState('idle');
                }}
              >
                取消处理
              </button>
            ) : null}
            <ToolStatus
              state={state}
              engine="OffscreenCanvas Worker"
              message={
                state === 'success' &&
                currentResult?.mode === 'target' &&
                currentResult.targetMet === false
                  ? `未达到目标大小；当前最小结果为 ${formatBytes(currentResult.blob.size)}。`
                  : state === 'success' && savings <= 0
                    ? '结果没有更小，请调整格式、质量或尺寸。'
                    : '压缩在浏览器后台线程中完成。'
              }
            />
          </section>
        </>
      }
      result={
        currentResult ? (
          <>
            <div className="image-tool-result-header">
              <h2>
                {currentResult.mode === 'target' &&
                currentResult.targetMet === false
                  ? '未达到目标大小'
                  : savings > 0
                    ? `体积减少 ${savings}%`
                    : '结果未小于原图'}
              </h2>
              <p>
                {currentResult.mode === 'target' &&
                currentResult.targetMet === false
                  ? `目标 ${formatBytes(currentResult.targetBytes || 0)}，已输出当前可达到的最小结果。`
                  : '只有真实字节数变小时才计为压缩成功。'}
              </p>
            </div>
            <div className="image-tool-metrics">
              <div className="image-tool-metric">
                <span>原图</span>
                <strong>{formatBytes(currentResult.sourceBytes)}</strong>
              </div>
              <div className="image-tool-metric">
                <span>结果</span>
                <strong>{formatBytes(currentResult.blob.size)}</strong>
              </div>
              <div className="image-tool-metric">
                <span>尺寸</span>
                <strong>
                  {currentResult.width} × {currentResult.height}
                </strong>
              </div>
            </div>
            <div className="image-tool-preview-stage">
              <img src={currentResult.url} alt="压缩结果" />
            </div>
            <ResultActions
              onDownload={() =>
                downloadBlob(
                  currentResult.blob,
                  `${stripImageExtension(currentResult.sourceName)}-compressed.${getExtension(currentResult.outputFormat)}`
                )
              }
              onReset={() => setResult(null)}
            />
          </>
        ) : (
          <EmptyResult>
            上传图片并设置压缩目标，结果会显示真实体积变化。
          </EmptyResult>
        )
      }
    />
  );
}
