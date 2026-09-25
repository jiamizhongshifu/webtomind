import { Cloud, ShieldCheck, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getLocalizedCreateAppContent } from '@/shared/create-apps';
import {
  IMAGE_TOOL_MODELS,
  isPublishedImageToolModel
} from '@/shared/image-tool-models';
import type {
  DenoisePixelChange,
  DenoiseStrength
} from '@/shared/image-denoise';
import { GPT_IMAGE_2_DENOISE_CREDIT_COST } from '@/shared/gpt-image-2-denoise';
import { BeforeAfterComparison } from '@/web/components/image-tools/BeforeAfterComparison';
import {
  EmptyResult,
  ImageToolShell,
  ImageUploadField,
  ResultActions,
  ToolStatus,
  useImageToolUpload,
  type ToolRunState
} from '@/web/components/image-tools/ImageToolShell';
import { useAuth } from '@/web/contexts/AuthContext';
import {
  blobToDataUrl,
  createImageToolResultIdentity,
  downloadBlob,
  stripImageExtension,
  supportsWebGpu
} from '@/web/lib/image-tools';
import { applySeo } from '@/web/lib/seo';
import {
  generateGptImage2Denoise,
  uploadImageReference
} from '@/services/agent-api';
import { useRouteLocale } from '@/web/lib/route-locale';

type Strength = DenoiseStrength;
const strengthCopy: Record<Strength, { label: string; blend: string }> = {
  light: { label: '轻度', blend: '35%' },
  standard: { label: '标准', blend: '60%' },
  strong: { label: '强力', blend: '85%' }
};

function getCloudDenoiseErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/PROVIDER_TIMEOUT|timed out/i.test(message)) {
    return '云端双参考降噪等待超时，本次积分已自动退回，请稍后重试。';
  }
  return message || '云端双参考降噪失败，积分会按任务状态自动退回。';
}

export function GptImage2DenoiserPage() {
  const { locale, isZh } = useRouteLocale();
  const tool = getLocalizedCreateAppContent('gpt-image-2-denoiser', locale)!;
  const upload = useImageToolUpload();
  const setUploadError = upload.setError;
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<'local' | 'ai'>('local');
  const [strength, setStrength] = useState<Strength>('standard');
  const [format, setFormat] = useState<'png' | 'webp'>('png');
  const [confirmed, setConfirmed] = useState(false);
  const [state, setState] = useState<ToolRunState>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const workerRef = useRef<Worker | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const [result, setResult] = useState<{
    identity: string;
    url: string;
    blob?: Blob;
    mode: 'local' | 'ai';
    strength: Strength;
    outputFormat: 'png' | 'webp';
    sourceName: string;
    storedInLibrary: boolean;
    pixelChange?: DenoisePixelChange;
  } | null>(null);
  const localReady =
    supportsWebGpu() &&
    isPublishedImageToolModel(IMAGE_TOOL_MODELS['scunet-color-real-psnr']);
  const resultIdentity = createImageToolResultIdentity(upload.source, [
    upload.revision,
    mode,
    strength,
    format
  ]);
  const resultIdentityRef = useRef(resultIdentity);
  resultIdentityRef.current = resultIdentity;
  const currentResult = result?.identity === resultIdentity ? result : null;

  useEffect(
    () =>
      applySeo({
        title: isZh
          ? 'GPT Image 2 噪点清理工具 | WebToMind'
          : 'GPT Image 2 Denoiser | WebToMind',
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
    setProgress(0);
    setProgressMessage('');
  }, [resultIdentity, setUploadError]);
  useEffect(
    () => () => {
      if (result?.blob) URL.revokeObjectURL(result.url);
    },
    [result?.blob, result?.url]
  );
  useEffect(
    () => () => {
      workerRef.current?.terminate();
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    },
    []
  );

  const runLocal = () => {
    const source = upload.source;
    if (!source) return;
    if (!localReady) {
      upload.setError(
        'SCUNet 官方转换权重尚未完成校验发布。请选择云端双参考降噪，或稍后再试。'
      );
      setState('error');
      return;
    }
    setState('processing');
    setProgress(2);
    setProgressMessage('正在启动本地 SCUNet');
    upload.setError('');
    const worker = new Worker(
      new URL('../../workers/image-ai.worker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;
    const id = crypto.randomUUID();
    const runIdentity = resultIdentity;
    const finishWorker = () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
    timeoutRef.current = window.setTimeout(() => {
      finishWorker();
      upload.setError(
        '本地 SCUNet 超过 4 分钟仍未完成，已停止处理。请切换云端双参考降噪或使用尺寸更小的图片。'
      );
      setState('error');
      setProgressMessage('本地处理已超时');
    }, 240_000);
    worker.onmessage = (
      event: MessageEvent<
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
            pixelChange?: DenoisePixelChange;
          }
        | { id: string; type: 'error'; error: string }
      >
    ) => {
      if (event.data.id !== id) return;
      if (event.data.type === 'progress') {
        setProgress(event.data.progress);
        setProgressMessage(event.data.message || '正在本地清理噪点');
        return;
      }
      finishWorker();
      if (event.data.type === 'error') {
        upload.setError(`本地 SCUNet 失败：${event.data.error}`);
        setState('error');
        return;
      }
      if (resultIdentityRef.current !== runIdentity) return;
      if (
        !event.data.pixelChange ||
        event.data.pixelChange.averageChannelDelta <= 0
      ) {
        upload.setError(
          'SCUNet 返回结果与原图没有可测像素差异，已阻止下载无效结果。请重试或切换云端双参考降噪。'
        );
        setState('error');
        return;
      }
      setResult({
        identity: runIdentity,
        blob: event.data.blob,
        url: URL.createObjectURL(event.data.blob),
        mode: 'local',
        strength,
        outputFormat: format,
        sourceName: source.file.name,
        storedInLibrary: false,
        pixelChange: event.data.pixelChange
      });
      setProgress(100);
      setProgressMessage('本地保真清理完成');
      setState('success');
    };
    worker.onerror = () => {
      finishWorker();
      upload.setError('SCUNet Worker 启动失败；请切换云端双参考降噪。');
      setState('error');
    };
    worker.onmessageerror = () => {
      finishWorker();
      upload.setError('SCUNet Worker 返回了无法读取的结果；请重试。');
      setState('error');
    };
    worker.postMessage({
      id,
      operation: 'denoise',
      file: source.file,
      modelUrl: IMAGE_TOOL_MODELS['scunet-color-real-psnr'].route,
      targetWidth: source.width,
      targetHeight: source.height,
      outputType: format === 'png' ? 'image/png' : 'image/webp',
      strength
    });
  };

  const runAi = async () => {
    const source = upload.source;
    if (!source || !confirmed) return;
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`);
      return;
    }
    setState('processing');
    setProgress(4);
    setProgressMessage('正在上传已确认的参考图');
    upload.setError('');
    const runIdentity = resultIdentity;
    try {
      const imageBase64 = await blobToDataUrl(source.file);
      const reference = await uploadImageReference({
        imageBase64,
        mimeType: source.file.type,
        role: 'style',
        label: 'GPT Image 2 噪点清理参考图',
        description: 'sourceApp:gpt-image-2-denoiser',
        sourceApp: 'gpt-image-2-denoiser'
      });
      setProgress(24);
      setProgressMessage('正在生成结构灰模，并以原图 + 灰模进行双参考降噪');
      const generated = await generateGptImage2Denoise({
        referenceId: reference.id,
        strength,
        outputFormat: format,
        sourceWidth: source.width,
        sourceHeight: source.height
      });
      if (!generated.imageUrl) throw new Error('任务完成但没有返回图片。');
      if (resultIdentityRef.current !== runIdentity) return;
      setResult({
        identity: runIdentity,
        url: generated.imageUrl,
        mode: 'ai',
        strength,
        outputFormat: format,
        sourceName: source.file.name,
        storedInLibrary: true
      });
      setProgress(100);
      setProgressMessage('Nano Banana 2 双参考降噪已完成并写入图库');
      setState('success');
    } catch (error) {
      upload.setError(getCloudDenoiseErrorMessage(error));
      setState('error');
    }
  };

  const run = () => {
    if (mode === 'local') runLocal();
    else void runAi();
  };

  return (
    <ImageToolShell
      tool={tool}
      controls={
        <>
          <section className="image-tool-control-section">
            <h2>1. 上传 GPT Image 2 图片</h2>
            <ImageUploadField upload={upload} />
          </section>
          <section className="image-tool-control-section">
            <h2>2. 清理模式</h2>
            <div className="image-tool-choice-grid">
              <button
                className={`image-tool-choice${mode === 'local' ? ' active' : ''}`}
                type="button"
                disabled={state === 'processing'}
                onClick={() => setMode('local')}
              >
                <ShieldCheck size={16} /> 保真清理
              </button>
              <button
                className={`image-tool-choice${mode === 'ai' ? ' active' : ''}`}
                type="button"
                disabled={state === 'processing'}
                onClick={() => setMode('ai')}
              >
                <Cloud size={16} /> 云端双参考降噪
              </button>
            </div>
            <div className="image-tool-choice-grid" style={{ marginTop: 12 }}>
              {(Object.keys(strengthCopy) as Strength[]).map((value) => (
                <button
                  className={`image-tool-choice${strength === value ? ' active' : ''}`}
                  key={value}
                  type="button"
                  disabled={state === 'processing'}
                  onClick={() => setStrength(value)}
                >
                  {strengthCopy[value].label} · {strengthCopy[value].blend}
                </button>
              ))}
            </div>
            <div className="image-tool-field">
              <label htmlFor="denoise-format">输出格式</label>
              <select
                id="denoise-format"
                value={format}
                disabled={state === 'processing'}
                onChange={(event) =>
                  setFormat(event.target.value as 'png' | 'webp')
                }
              >
                <option value="png">PNG</option>
                <option value="webp">WebP</option>
              </select>
            </div>
            {mode === 'ai' ? (
              <label className="image-tool-consent">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={state === 'processing'}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>
                  我知道系统会从原图确定性生成不改变构图的灰阶结构参考，再将原图与结构参考交给
                  Nano Banana 2
                  保真重建；结果可能改变文字或局部细节，提交后固定消耗{' '}
                  {GPT_IMAGE_2_DENOISE_CREDIT_COST} 个积分。
                </span>
              </label>
            ) : null}
            <button
              className="image-tool-primary-button image-tool-run-button"
              type="button"
              disabled={
                !upload.source ||
                state === 'processing' ||
                (mode === 'ai' && !confirmed)
              }
              onClick={run}
            >
              <Sparkles aria-hidden="true" />
              {mode === 'local'
                ? '开始保真清理'
                : isAuthenticated
                  ? `消耗 ${GPT_IMAGE_2_DENOISE_CREDIT_COST} 积分开始云端降噪`
                  : '登录后使用云端降噪'}
            </button>
            {state === 'processing' && mode === 'local' ? (
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
                  setProgress(0);
                  setProgressMessage('已取消本地处理');
                }}
              >
                取消处理
              </button>
            ) : null}
            <ToolStatus
              state={state}
              progress={state === 'processing' ? progress : undefined}
              engine={
                mode === 'local'
                  ? localReady
                    ? 'SCUNet · WebGPU'
                    : 'SCUNet 尚未可用'
                  : 'Nano Banana 2 · 原图主参考降噪'
              }
              message={
                state === 'processing'
                  ? progressMessage
                  : mode === 'local'
                    ? '保持原始尺寸；输出与原图按所选强度混合。'
                    : '灰阶结构参考由原图确定性转换，不参与颜色、材质或设计；Nano Banana 2 仅执行一次保真重建。'
              }
            />
          </section>
        </>
      }
      result={
        currentResult ? (
          <>
            <div className="image-tool-result-header">
              <h2>清理结果</h2>
              <p>
                {currentResult.mode === 'local'
                  ? `保真混合 ${strengthCopy[currentResult.strength].blend} · ${
                      currentResult.pixelChange
                        ? `${currentResult.pixelChange.changedPixelPercent.toFixed(1)}% 采样像素已变化 · 平均通道差 ${currentResult.pixelChange.averageChannelDelta.toFixed(2)}/255`
                        : '本地处理'
                    }`
                  : currentResult.storedInLibrary
                    ? 'Nano Banana 2 双参考降噪 · 已写入你的图库'
                    : '云端双参考降噪结果'}
              </p>
            </div>
            <div className="image-tool-preview-stage">
              <BeforeAfterComparison
                beforeSrc={upload.source!.url}
                afterSrc={currentResult.url}
                beforeAlt="上传的原始 GPT Image 2 图片"
                afterAlt="GPT Image 2 噪点清理结果"
                beforeLabel="原图"
                afterLabel="清理后"
                aspectRatio={upload.source!.width / upload.source!.height}
                instruction="放大查看颗粒与彩噪；左右拖动分隔线比较清理前后"
              />
            </div>
            <ResultActions
              onDownload={() => {
                if (currentResult.blob)
                  downloadBlob(
                    currentResult.blob,
                    `${stripImageExtension(currentResult.sourceName)}-denoised.${currentResult.outputFormat}`
                  );
                else
                  window.open(
                    currentResult.url,
                    '_blank',
                    'noopener,noreferrer'
                  );
              }}
              onReset={() => setResult(null)}
            />
          </>
        ) : (
          <EmptyResult>
            上传图片后选择本地保真清理或云端双参考降噪。
          </EmptyResult>
        )
      }
    />
  );
}
