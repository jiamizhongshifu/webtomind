import { Download, PackageOpen, Sparkles, Square } from 'lucide-react';
import { zipSync } from 'fflate';
import { useMemo, useRef, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getLocalizedCreateAppContent } from '@/shared/create-apps';
import {
  IMAGE_TOOL_MODELS,
  isPublishedImageToolModel
} from '@/shared/image-tool-models';
import {
  BeforeAfterComparison,
  ZoomableImagePreview
} from '@/web/components/image-tools/BeforeAfterComparison';
import {
  EmptyResult,
  ImageToolShell,
  ToolStatus,
  type ToolRunState
} from '@/web/components/image-tools/ImageToolShell';
import { ImageUpscaleQueue } from '@/web/components/image-tools/ImageUpscaleQueue';
import { useImageUpscaleQueue } from '@/web/hooks/useImageUpscaleQueue';
import {
  calculateLongEdgeSize,
  downloadBlob,
  getExtension,
  stripImageExtension,
  supportsWebGpu,
  type ImageToolOutputFormat
} from '@/web/lib/image-tools';
import {
  runImageUpscale,
  type ImageUpscaleConcurrency,
  type ImageUpscaleTarget
} from '@/web/lib/image-upscale';
import { loadEditorImageBlob } from '@/web/components/image-editor/editor-image-input';
import { applySeo } from '@/web/lib/seo';
import { useRouteLocale } from '@/web/lib/route-locale';

const UPSCALER_MODEL = IMAGE_TOOL_MODELS['real-esrgan-x4plus'];

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function ImageUpscalerPage() {
  const { locale, isZh } = useRouteLocale();
  const location = useLocation();
  const tool = getLocalizedCreateAppContent('image-upscaler', locale)!;
  const queue = useImageUpscaleQueue();
  const [target, setTarget] = useState<ImageUpscaleTarget>(2048);
  const [format, setFormat] =
    useState<Exclude<ImageToolOutputFormat, 'image/jpeg'>>('image/png');
  const [concurrency, setConcurrency] = useState<ImageUpscaleConcurrency>(1);
  const [state, setState] = useState<ToolRunState>('idle');
  const [batchMessage, setBatchMessage] = useState('');
  const [prefillAttempt, setPrefillAttempt] = useState(0);
  const [prefillFailed, setPrefillFailed] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const prefilledRef = useRef('');
  const controllersRef = useRef(new Map<string, AbortController>());
  const runTokenRef = useRef(0);
  const modelReady = isPublishedImageToolModel(UPSCALER_MODEL);
  const canUseAi = supportsWebGpu() && modelReady;
  const selected = queue.selectedItem;
  const outputSize = useMemo(
    () =>
      selected
        ? calculateLongEdgeSize(
            selected.source.width,
            selected.source.height,
            target
          )
        : null,
    [selected, target]
  );
  const counts = useMemo(
    () =>
      queue.items.reduce(
        (result, item) => {
          result[item.status] += 1;
          return result;
        },
        { queued: 0, processing: 0, success: 0, error: 0 }
      ),
    [queue.items]
  );
  const batchProgress = useMemo(() => {
    if (queue.items.length === 0) return 0;
    return (
      queue.items.reduce((sum, item) => {
        if (item.status === 'success' || item.status === 'error')
          return sum + 100;
        return sum + item.progress;
      }, 0) / queue.items.length
    );
  }, [queue.items]);

  useEffect(
    () =>
      applySeo({
        title: isZh
          ? 'AI 图像放大器：在线放大到 2K / 4K | WebToMind'
          : 'AI Image Upscaler: 2K and 4K Online | WebToMind',
        description: tool.description,
        htmlLang: isZh ? 'zh-CN' : 'en'
      }),
    [isZh, tool.description]
  );

  useEffect(
    () => () => {
      controllersRef.current.forEach((controller) => controller.abort());
      controllersRef.current.clear();
    },
    []
  );

  const routeState = location.state as { sourceUrl?: string; generationId?: string } | null;
  const sourceUrl = routeState?.sourceUrl || new URLSearchParams(location.search).get('source') || '';
  const generationId = routeState?.generationId || '';
  const { addFiles, setError: setQueueError } = queue;
  useEffect(() => {
    if (!sourceUrl && !generationId) return;
    const key = `${generationId}|${sourceUrl}`;
    if (prefilledRef.current === key) return;
    const controller = new AbortController();
    setPrefillLoading(true); setPrefillFailed(false);
    void (async () => {
      try {
        const blob = await loadEditorImageBlob(sourceUrl, generationId || undefined);
        if (controller.signal.aborted) return;
        const added = await addFiles([new File([blob], 'image-editor-source.png', { type: blob.type })], controller.signal);
        if (controller.signal.aborted) return;
        if (!added) throw new Error('Original image could not be decoded');
        prefilledRef.current = key;
      } catch {
        if (controller.signal.aborted) return;
        setPrefillFailed(true);
        setQueueError(isZh ? '原图带入失败，请重试。' : 'Could not load the original. Please retry.');
      } finally {
        if (!controller.signal.aborted) setPrefillLoading(false);
      }
    })();
    return () => controller.abort();
  }, [addFiles, generationId, isZh, prefillAttempt, setQueueError, sourceUrl]);

  const invalidateResults = () => {
    if (
      queue.items.some(
        (item) =>
          item.result || item.status === 'success' || item.status === 'error'
      )
    ) {
      queue.resetResults();
      setState('idle');
      setBatchMessage('输出设置已改变，请重新开始处理。');
    }
  };

  const runBatch = async (useAi = canUseAi) => {
    const pending = queue.items.filter(
      (item) => item.status === 'queued' || item.status === 'error'
    );
    if (pending.length === 0) return;
    const runToken = runTokenRef.current + 1;
    runTokenRef.current = runToken;
    let failedCount = 0;
    let cachedCount = 0;
    let cursor = 0;
    setState('processing');
    setBatchMessage(
      `${useAi ? 'AI 放大' : '普通放大'}已启动，共 ${pending.length} 张。`
    );
    queue.setError('');

    const processNext = async () => {
      while (cursor < pending.length && runTokenRef.current === runToken) {
        const item = pending[cursor];
        cursor += 1;
        const controller = new AbortController();
        controllersRef.current.set(item.id, controller);
        queue.updateItem(item.id, {
          status: 'processing',
          progress: 2,
          message: '正在准备处理',
          error: ''
        });
        try {
          const result = await runImageUpscale({
            source: item.source,
            target,
            format,
            canUseAi: useAi,
            modelUrl: UPSCALER_MODEL.route,
            signal: controller.signal,
            onProgress: (progress, message) => {
              if (runTokenRef.current !== runToken) return;
              queue.updateItem(item.id, {
                progress,
                message
              });
            }
          });
          if (runTokenRef.current !== runToken) return;
          if (result.cacheHit) cachedCount += 1;
          queue.updateItem(item.id, (current) => {
            if (current.result) URL.revokeObjectURL(current.result.url);
            return {
              ...current,
              status: 'success',
              progress: 100,
              message: result.message,
              error: '',
              result: {
                ...result,
                url: URL.createObjectURL(result.blob)
              }
            };
          });
        } catch (error) {
          if (runTokenRef.current !== runToken) return;
          if (isAbortError(error)) {
            queue.updateItem(item.id, {
              status: 'queued',
              progress: 0,
              message: '已取消，等待重新处理',
              error: ''
            });
          } else {
            failedCount += 1;
            queue.updateItem(item.id, {
              status: 'error',
              progress: 100,
              message: '处理失败',
              error:
                error instanceof Error ? error.message : '放大失败，请重试。'
            });
          }
        } finally {
          controllersRef.current.delete(item.id);
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, pending.length) }, processNext)
    );
    if (runTokenRef.current !== runToken) return;
    controllersRef.current.clear();
    if (failedCount > 0) {
      setState('error');
      setBatchMessage(
        `${pending.length - failedCount} 张完成，${failedCount} 张失败；可再次开始处理失败项。`
      );
    } else {
      setState('success');
      setBatchMessage(cachedCount > 0
        ? `${pending.length} 张图片已完成，其中 ${cachedCount} 张复用本地放大结果，无需重新计算。`
        : `${pending.length} 张图片已完成${useAi ? ' AI 超分' : '普通放大'}。`);
    }
  };

  const cancelBatch = () => {
    runTokenRef.current += 1;
    controllersRef.current.forEach((controller) => controller.abort());
    controllersRef.current.clear();
    queue.items.forEach((item) => {
      if (item.status === 'processing') {
        queue.updateItem(item.id, {
          status: 'queued',
          progress: 0,
          message: '已取消，等待重新处理',
          error: ''
        });
      }
    });
    setState('idle');
    setBatchMessage('批量处理已取消，未完成的图片仍保留在队列中。');
  };

  const downloadItem = (
    item: NonNullable<typeof queue.selectedItem>,
    position = queue.items.indexOf(item)
  ) => {
    if (!item.result) return;
    const prefix =
      queue.items.length > 1 ? `${String(position + 1).padStart(2, '0')}-` : '';
    downloadBlob(
      item.result.blob,
      `${prefix}${stripImageExtension(item.source.file.name)}-${item.result.target}.${getExtension(item.result.outputFormat)}`
    );
  };

  const downloadAll = async () => {
    const completed = queue.items.filter((item) => item.result);
    if (completed.length === 0) return;
    const files: Record<string, Uint8Array> = {};
    for (const [index, item] of completed.entries()) {
      const result = item.result;
      if (!result) continue;
      const filename = `${String(index + 1).padStart(2, '0')}-${stripImageExtension(item.source.file.name)}-${result.target}.${getExtension(result.outputFormat)}`;
      files[filename] = new Uint8Array(await result.blob.arrayBuffer());
    }
    downloadBlob(
      new Blob([zipSync(files)], { type: 'application/zip' }),
      `webtomind-upscaled-${completed[0]?.result?.target || target}.zip`
    );
  };

  const hasPending = counts.queued + counts.error > 0;
  const engine =
    selected?.result?.engine ||
    (canUseAi ? '智能升格 · Real-ESRGAN WebGPU' : '标准放大 · Canvas');
  const statusMessage =
    selected?.status === 'processing'
      ? selected.message
      : batchMessage ||
        (canUseAi
          ? '首次使用会准备模型，之后优先使用本地缓存；相同图片和设置可复用结果。'
          : modelReady
            ? '当前浏览器不支持 AI 超分，将使用普通放大。'
            : '官方权重尚未通过校验发布，任务会使用标准放大。');

  return (
    <ImageToolShell
      tool={tool}
      controls={
        <>
          <section className="image-tool-control-section">
            <h2>图片</h2>
            <p>拖入图片即可开始，默认输出无损 PNG。</p>
            <ImageUpscaleQueue
              items={queue.items}
              selectedId={queue.selectedId}
              isAdding={queue.isAdding}
              disabled={state === 'processing'}
              error={queue.error}
              maxItems={queue.maxItems}
              onAddFiles={async (files) => { await queue.addFiles(files); }}
              onSelect={queue.setSelectedId}
              onRemove={queue.removeItem}
              onClear={() => {
                queue.clearAll();
                setState('idle');
                setBatchMessage('');
              }}
            />
            {prefillLoading ? <p role="status">{isZh ? '正在读取原图…' : 'Loading original…'}</p> : null}
            {prefillFailed ? <button className="image-tool-secondary-button" type="button" onClick={() => setPrefillAttempt((value) => value + 1)}>{isZh ? '重试带入原图' : 'Retry original'}</button> : null}
          </section>
          <section className="image-tool-control-section">
            <h2>放大至</h2>
            <div className="image-tool-field">
              <span>目标长边</span>
              <div className="image-tool-choice-grid">
                {[2048, 4096].map((value) => (
                  <button
                    className={`image-tool-choice${target === value ? ' active' : ''}`}
                    key={value}
                    type="button"
                    disabled={state === 'processing'}
                    onClick={() => {
                      invalidateResults();
                      setTarget(value as ImageUpscaleTarget);
                    }}
                  >
                    {value === 2048 ? '2K · 2048 px' : '4K · 4096 px'}
                  </button>
                ))}
              </div>
            </div>
            <details className="image-upscale-advanced"><summary>更多设置</summary>
            <div className="image-tool-field">
              <label htmlFor="upscaler-format">输出格式</label>
              <select
                id="upscaler-format"
                value={format}
                disabled={state === 'processing'}
                onChange={(event) => {
                  invalidateResults();
                  setFormat(
                    event.target.value as Exclude<
                      ImageToolOutputFormat,
                      'image/jpeg'
                    >
                  );
                }}
              >
                <option value="image/png">PNG · 无损 / 透明</option>
                <option value="image/webp">WebP · 更小体积</option>
              </select>
            </div>
            {queue.items.length > 1 ? <div className="image-tool-field">
              <span>并行任务</span>
              <div className="image-tool-choice-grid three">
                {([1, 2, 4] as const).map((value) => (
                  <button
                    className={`image-tool-choice${concurrency === value ? ' active' : ''}`}
                    key={value}
                    type="button"
                    disabled={state === 'processing'}
                    onClick={() => setConcurrency(value)}
                    aria-label={`同时处理 ${value} 张图片`}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <small className="image-tool-field-hint">
                默认逐张处理；同时处理多张会占用更多内存。
              </small>
            </div> : null}
            </details>
            <button
              className="image-tool-primary-button image-tool-run-button"
              type="button"
              disabled={!hasPending || prefillLoading || state === 'processing'}
              onClick={() => void runBatch(canUseAi)}
            >
              <Sparkles aria-hidden="true" />
              {state === 'processing'
                ? `正在处理 ${counts.processing} 张…`
                : `${canUseAi ? 'AI 放大' : '普通放大'}${hasPending ? ` ${counts.queued + counts.error} 张` : ''}`}
            </button>
            {state === 'error' && canUseAi ? <button className="image-tool-secondary-button image-tool-run-button" type="button" onClick={() => void runBatch(false)}>改用普通放大（无 AI 细节恢复）</button> : null}
            {state === 'processing' ? (
              <button
                className="image-tool-secondary-button image-tool-run-button"
                type="button"
                onClick={cancelBatch}
              >
                <Square aria-hidden="true" />
                取消处理
              </button>
            ) : null}
            <ToolStatus
              state={state}
              progress={state === 'processing' ? batchProgress : undefined}
              engine={engine}
              message={statusMessage}
            />
          </section>
        </>
      }
      result={
        selected?.result ? (
          <>
            <div className="image-tool-result-header image-upscale-result-header">
              <div>
                <h2>原图 / 放大结果</h2>
                <p>
                  {selected.result.width} × {selected.result.height} ·{' '}
                  {selected.result.engine}
                </p>
              </div>
              <div className="image-upscale-batch-stats" aria-label="批量状态">
                <span>{queue.items.length} 张</span>
                <span>{counts.success} 完成</span>
                {counts.error > 0 ? <span>{counts.error} 失败</span> : null}
              </div>
            </div>
            <div className="image-tool-preview-stage">
              <BeforeAfterComparison
                beforeSrc={selected.source.url}
                afterSrc={selected.result.url}
                beforeAlt="上传的原始图片"
                afterAlt="图像放大结果"
                aspectRatio={selected.result.width / selected.result.height}
              />
            </div>
            <div className="image-tool-result-actions">
              <button
                className="image-tool-primary-button"
                type="button"
                onClick={() => downloadItem(selected)}
              >
                <Download aria-hidden="true" />
                下载当前
              </button>
              {counts.success > 1 ? (
                <button
                  className="image-tool-secondary-button"
                  type="button"
                  onClick={() => void downloadAll()}
                >
                  <PackageOpen aria-hidden="true" />
                  下载全部 ZIP
                </button>
              ) : null}
            </div>
          </>
        ) : selected ? (
          <>
            <div className="image-tool-result-header image-upscale-result-header">
              <div>
                <h2>原图预览</h2>
                <p>
                  {selected.source.width} × {selected.source.height}
                  {outputSize
                    ? ` · 将输出 ${outputSize.width} × ${outputSize.height}`
                    : ''}
                </p>
              </div>
              <div className="image-upscale-batch-stats" aria-label="批量状态">
                <span>{queue.items.length} 张</span>
                <span>{counts.success} 完成</span>
                <span>{counts.queued} 等待</span>
              </div>
            </div>
            <div className="image-tool-preview-stage">
              <ZoomableImagePreview
                src={selected.source.url}
                alt="待放大的原始图片"
                aspectRatio={selected.source.width / selected.source.height}
              />
            </div>
            {selected.status === 'error' ? (
              <p className="image-tool-error image-upscale-result-error">
                {selected.error}
              </p>
            ) : null}
          </>
        ) : (
          <EmptyResult>
            添加一张或多张图片，右侧会显示当前选中图片的预览。
          </EmptyResult>
        )
      }
      footer={
        <p>
          2K / 4K 指输出长边为 2048 / 4096
          像素；队列中的图片均在浏览器本地处理，不会上传。
        </p>
      }
    />
  );
}
