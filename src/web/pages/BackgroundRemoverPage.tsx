import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { getLocalizedCreateAppContent } from '@/shared/create-apps';
import {
  IMAGE_TOOL_MODELS,
  isPublishedImageToolModel
} from '@/shared/image-tool-models';
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
  getExtension,
  stripImageExtension,
  supportsWebGpu,
  type ImageToolOutputFormat
} from '@/web/lib/image-tools';
import { getAuthToken } from '@/services/agent-api';
import { applySeo } from '@/web/lib/seo';
import { useRouteLocale } from '@/web/lib/route-locale';

const BG_REMOVAL_MODEL = IMAGE_TOOL_MODELS.silueta;

export function BackgroundRemoverPage() {
  const { locale, isZh } = useRouteLocale();
  const location = useLocation();
  const tool = getLocalizedCreateAppContent('background-remover', locale)!;
  const upload = useImageToolUpload();
  const [format, setFormat] =
    useState<Exclude<ImageToolOutputFormat, 'image/jpeg'>>('image/png');
  const [state, setState] = useState<ToolRunState>('idle');
  const [progress, setProgress] = useState(0);
  const [workerMessage, setWorkerMessage] = useState('');
  const [result, setResult] = useState<{
    identity: string;
    blob: Blob;
    url: string;
    engine: string;
    sourceName: string;
    outputFormat: Exclude<ImageToolOutputFormat, 'image/jpeg'>;
  } | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const modelReady = isPublishedImageToolModel(BG_REMOVAL_MODEL);
  const canRun = supportsWebGpu() && modelReady;

  useEffect(() => {
    applySeo({
      title: tool.seoTitle || tool.title,
      description: tool.seoDescription || tool.description
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  // 从图片编辑器带入 sourceUrl
  useEffect(() => {
    let cancelled = false;
    const routeState = location.state as {
      sourceUrl?: string;
      sourceReferenceId?: string;
    } | null;
    const sourceUrl =
      routeState?.sourceUrl ||
      new URLSearchParams(location.search).get('source') ||
      '';
    const referenceId = routeState?.sourceReferenceId || '';
    if (!sourceUrl && !referenceId) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        const fetchUrl = referenceId
          ? `/api/image/references/bytes?id=${encodeURIComponent(referenceId)}`
          : sourceUrl;
        const token = getAuthToken();
        const response = await fetch(fetchUrl, {
          signal: controller.signal,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const name =
          stripImageExtension(sourceUrl.split('/').pop() || 'image') + '.png';
        const file = new File([blob], name, { type: blob.type || 'image/png' });
        if (!cancelled) await upload.acceptFile(file);
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === 'AbortError')) {
          return;
        }
        upload.setError(
          isZh
            ? '从图片编辑器带入图片失败，请手动上传。'
            : 'Could not load the image from the editor. Please upload it manually.'
        );
      }
    };
    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker(
      new URL('../../workers/image-bg-removal.worker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;
    return worker;
  }, []);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    },
    []
  );

  const runRemoval = async () => {
    if (!upload.source || state === 'processing') return;
    const source = upload.source;
    setResult((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
    upload.setError('');
    setProgress(4);
    setState('processing');
    const worker = ensureWorker();
    const file = await source.file;

    await new Promise<void>((resolve, reject) => {
      const onMessage = (event: MessageEvent) => {
        const message = event.data;
        if (message.id !== 'bg-removal') return;
        if (message.type === 'progress') {
          setProgress(message.progress);
          if (message.message) setWorkerMessage(message.message);
          return;
        }
        worker.removeEventListener('message', onMessage);
        if (message.type === 'result') {
          const identity = createImageToolResultIdentity(upload.source, [
            format
          ]);
          const outputFormat = format;
          setResult({
            identity,
            blob: message.blob,
            url: URL.createObjectURL(message.blob),
            engine: 'u2net Silueta · ONNX WebGPU',
            sourceName: source.file.name,
            outputFormat
          });
          setProgress(100);
          setState('success');
          resolve();
          return;
        }
        if (message.type === 'error') {
          upload.setError(message.error);
          setState('error');
          reject(new Error(message.error));
        }
      };
      worker.addEventListener('message', onMessage);
      worker.postMessage({
        id: 'bg-removal',
        file,
        modelUrl: BG_REMOVAL_MODEL.route,
        outputType: format
      });
    });
  };

  const controls = (
    <div className="image-tool-controls-inner">
      <ImageUploadField
        upload={upload}
        hint={isZh ? 'JPEG / PNG / WebP' : 'JPEG / PNG / WebP'}
      />
      {upload.source ? (
        <>
          <label className="image-tool-field">
            <span>{isZh ? '输出格式' : 'Output format'}</span>
            <select
              value={format}
              disabled={state === 'processing'}
              onChange={(event) =>
                setFormat(
                  event.target.value as Exclude<
                    ImageToolOutputFormat,
                    'image/jpeg'
                  >
                )
              }
            >
              <option value="image/png">PNG（透明）</option>
              <option value="image/webp">WebP（透明）</option>
            </select>
          </label>
          <button
            type="button"
            className="image-tool-run"
            disabled={state === 'processing' || !canRun}
            onClick={() => void runRemoval()}
          >
            <Sparkles aria-hidden="true" />
            {isZh ? '去除背景' : 'Remove background'}
          </button>
          {!canRun && modelReady ? (
            <p className="image-tool-note">
              {isZh
                ? '当前浏览器不支持 WebGPU，无法本地去除背景。'
                : 'WebGPU is unavailable in this browser; local removal cannot run.'}
            </p>
          ) : null}
        </>
      ) : null}
      <ToolStatus
        state={state}
        progress={progress}
        message={workerMessage}
      />
      {upload.error ? (
        <p className="image-tool-error" role="alert">
          {upload.error}
        </p>
      ) : null}
    </div>
  );

  const resultView = upload.source ? (
    state === 'success' && result ? (
      <ResultActions
        onDownload={() =>
          downloadBlob(
            result.blob,
            `${stripImageExtension(result.sourceName)}-no-bg.${getExtension(
              result.outputFormat
            )}`
          )
        }
        onReset={() => {
          URL.revokeObjectURL(result.url);
          setResult(null);
          setState('idle');
          upload.clear();
        }}
      />
    ) : (
      <div className="image-tool-preview">
        <img src={upload.source.url} alt="" />
      </div>
    )
  ) : (
    <EmptyResult>
      {isZh
        ? '上传图片后，AI 将自动识别主体并移除背景，输出透明 PNG。'
        : 'Upload an image and the AI will isolate the subject and remove the background as a transparent PNG.'}
    </EmptyResult>
  );

  return (
    <ImageToolShell
      tool={tool}
      controls={controls}
      result={resultView}
      footer={
        state === 'success' && result ? (
          <div className="image-tool-result-preview">
            <img src={result.url} alt="" />
          </div>
        ) : null
      }
    />
  );
}
