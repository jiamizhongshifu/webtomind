import {
  AlertCircle,
  CheckCircle2,
  ClipboardPaste,
  CloudOff,
  Download,
  FileCheck2,
  FileUp,
  LoaderCircle,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  SquareDashedMousePointer
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getLocalizedCreateAppContent } from '@/shared/create-apps';
import { ImageToolWorkspaceShell } from '@/web/components/image-tools/ImageToolShell';
import {
  VisibleWatermarkBoxEditor,
  type VisibleWatermarkBox
} from '@/web/components/image-tools/VisibleWatermarkBoxEditor';
import {
  base64ToBlob,
  cleanAiMarksFile,
  formatReportValue,
  getCapabilityMap,
  getMimeTypeForFileName,
  getReportEntries,
  getAiMarksServiceStatus,
  hasCapability,
  inspectAiMarksFile,
  type AiMarksCleanResult,
  type AiMarksInspectResult,
  type AiMarksServiceStatus
} from '@/web/lib/ai-marks-api';
import { downloadBlob } from '@/web/lib/image-tools';
import { getAuthToken } from '@/services/agent-api';
import { applySeo } from '@/web/lib/seo';
import { useRouteLocale } from '@/web/lib/route-locale';

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_COMPLEX_FILE_BYTES = 12 * 1024 * 1024;
const FILE_ACCEPT = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/bmp',
  'image/gif',
  'image/tiff',
  'image/svg+xml',
  'application/pdf',
  'application/epub+zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/vnd.oasis.opendocument.text',
  'video/mp4',
  'video/quicktime',
  'audio/mp4',
  'audio/x-m4a',
  'video/x-m4v',
  'audio/wav',
  'audio/mpeg',
  'text/plain',
  'text/markdown',
  'text/html'
].join(',');

type InputMode = 'file' | 'text';
type BusyAction = 'status' | 'inspect' | 'clean' | null;
type PixelMode = 'none' | 'ctrlregen' | 'diffusion';

const VISIBLE_REPAIR_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'bmp',
  'tif',
  'tiff'
]);

type CleanedAsset = {
  blob: Blob;
  url: string;
  name: string;
  kind: string;
  report?: Record<string, unknown>;
};

function getOutputName(name: string): string {
  const index = name.lastIndexOf('.');
  if (index <= 0) return `${name || 'webtomind-content'}.cleaned`;
  return `${name.slice(0, index)}.cleaned${name.slice(index)}`;
}

function getFileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getInputLimit(name: string): number {
  const extension = name.split('.').pop()?.toLowerCase() || '';
  return new Set([
    'docx',
    'epub',
    'odt',
    'ods',
    'odp',
    'pdf',
    'pptx',
    'xlsx',
    'zip'
  ]).has(extension)
    ? MAX_COMPLEX_FILE_BYTES
    : MAX_FILE_BYTES;
}

function getServiceMessage(
  status: AiMarksServiceStatus | null,
  isZh: boolean
): string {
  if (!status) return isZh ? '正在检查服务…' : 'Checking service…';
  if (status.ok) {
    const version = formatReportValue(status.health?.version);
    return version && version !== '—'
      ? `${isZh ? '服务在线' : 'Service online'} · ${version}`
      : isZh
        ? '服务在线'
        : 'Service online';
  }
  return status.error || (isZh ? '服务不可用' : 'Service unavailable');
}

export function AiMarksRemoverPage() {
  const { locale, isZh } = useRouteLocale();
  const tool = getLocalizedCreateAppContent('ai-mark-remover', locale)!;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<InputMode>('file');
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [status, setStatus] = useState<AiMarksServiceStatus | null>(null);
  const [busy, setBusy] = useState<BusyAction>('status');
  const [inputError, setInputError] = useState('');
  const [actionError, setActionError] = useState('');
  const [inspection, setInspection] = useState<AiMarksInspectResult | null>(
    null
  );
  const [cleaned, setCleaned] = useState<CleanedAsset | null>(null);
  const [stripAllMetadata, setStripAllMetadata] = useState(false);
  const [pixelMode, setPixelMode] = useState<PixelMode>('none');
  const [visibleBoxes, setVisibleBoxes] = useState<VisibleWatermarkBox[]>([]);
  const requestControllerRef = useRef<AbortController | null>(null);

  useEffect(
    () =>
      applySeo({
        title: tool.seoTitle || `${tool.title} | WebToMind`,
        description: tool.seoDescription || tool.description,
        htmlLang: isZh ? 'zh-CN' : 'en'
      }),
    [isZh, tool.description, tool.seoDescription, tool.seoTitle, tool.title]
  );

  const refreshStatus = useCallback(async (signal?: AbortSignal) => {
    setBusy('status');
    const nextStatus = await getAiMarksServiceStatus(signal);
    if (!signal?.aborted) {
      setStatus(nextStatus);
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refreshStatus(controller.signal);
    return () => controller.abort();
  }, [refreshStatus]);

  useEffect(
    () => () => {
      requestControllerRef.current?.abort();
      if (cleaned?.url) URL.revokeObjectURL(cleaned.url);
    },
    [cleaned?.url]
  );

  const hasInput = mode === 'file' ? Boolean(file) : Boolean(pastedText.trim());
  const inputName = mode === 'file' ? file?.name || '' : 'pasted-content.txt';
  const inputBytes =
    mode === 'file' ? file?.size || 0 : new Blob([pastedText]).size;
  const pixelBackends = getCapabilityMap(status, 'pixel_backends');
  const hasPixelBackend =
    hasCapability(status, 'pixel_backends', 'ctrlregen') ||
    hasCapability(status, 'pixel_backends', 'diffusion');
  const canVisibleRemoval = hasCapability(
    status,
    'visible_removal',
    'manual_boxes'
  );
  const isVisibleRepairFile = Boolean(
    file &&
      VISIBLE_REPAIR_EXTENSIONS.has(
        file.name.split('.').pop()?.toLowerCase() || ''
      )
  );

  const reportEntries = useMemo(
    () => getReportEntries(inspection?.report),
    [inspection?.report]
  );
  const cleanedReportEntries = useMemo(
    () => getReportEntries(cleaned?.report),
    [cleaned?.report]
  );

  const resetResults = () => {
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    setInspection(null);
    setCleaned((previous) => {
      if (previous?.url) URL.revokeObjectURL(previous.url);
      return null;
    });
    setActionError('');
    setVisibleBoxes([]);
  };

  const acceptFile = (nextFile: File | undefined) => {
    if (!nextFile) return;
    resetResults();
    const inputLimit = getInputLimit(nextFile.name);
    if (nextFile.size > inputLimit) {
      setFile(null);
      setInputError(
        isZh
          ? `文件超过 ${inputLimit === MAX_COMPLEX_FILE_BYTES ? '12' : '20'} MB，请先压缩后重试。`
          : `Files must be under ${inputLimit === MAX_COMPLEX_FILE_BYTES ? '12' : '20'} MB.`
      );
      return;
    }
    setInputError('');
    setMode('file');
    setFile(nextFile);
  };

  const inspect = async () => {
    if (!hasInput) return;
    if (!getAuthToken()) {
      setActionError(
        isZh
          ? '请先登录后再使用 AI 标记清理。'
          : 'Please sign in to use AI marks cleanup.'
      );
      return;
    }
    const inputLimit = getInputLimit(inputName);
    if (inputBytes > inputLimit) {
      setInputError(
        isZh
          ? `内容超过 ${inputLimit === MAX_COMPLEX_FILE_BYTES ? '12' : '20'} MB，请先压缩后重试。`
          : `Content must be under ${inputLimit === MAX_COMPLEX_FILE_BYTES ? '12' : '20'} MB.`
      );
      return;
    }
    if (!status?.ok) {
      setActionError(
        isZh
          ? 'AI 标记服务未连接，暂时不能检查文件。'
          : 'The AI marks service is not connected yet.'
      );
      return;
    }
    setBusy('inspect');
    setActionError('');
    setInspection(null);
    const controller = new AbortController();
    requestControllerRef.current = controller;
    try {
      const nextInspection = await inspectAiMarksFile(
        file,
        pastedText,
        controller.signal
      );
      setInspection(nextInspection);
      if (!nextInspection.ok) {
        setActionError(nextInspection.error || '检查失败。');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setActionError(isZh ? '操作已取消。' : 'Operation cancelled.');
      } else {
        setActionError(error instanceof Error ? error.message : '检查失败。');
      }
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
      setBusy(null);
    }
  };

  const clean = async () => {
    if (!hasInput || !inspection?.ok || !status?.ok) return;
    setBusy('clean');
    setActionError('');
    const controller = new AbortController();
    requestControllerRef.current = controller;
    try {
      const nextResult: AiMarksCleanResult = await cleanAiMarksFile(
        file,
        pastedText,
        {
          keep_non_ai_metadata: !stripAllMetadata,
          strip_all_metadata: stripAllMetadata,
          ...(pixelMode !== 'none' ? { remove_pixel: pixelMode } : {}),
          ...(visibleBoxes.length && canVisibleRemoval
            ? {
                remove_visible: true,
                visible_boxes: visibleBoxes,
                visible_inpaint_method: 'telea' as const
              }
            : {})
        },
        controller.signal
      );
      if (!nextResult.ok || !nextResult.cleaned) {
        setActionError(nextResult.error || '清理失败。');
        return;
      }
      const sourceName = inputName || 'webtomind-content.txt';
      const blob = base64ToBlob(
        nextResult.cleaned,
        getMimeTypeForFileName(sourceName)
      );
      setCleaned({
        blob,
        url: URL.createObjectURL(blob),
        name: getOutputName(sourceName),
        kind: nextResult.kind || 'file',
        report: nextResult.report
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setActionError(isZh ? '操作已取消。' : 'Operation cancelled.');
      } else {
        setActionError(error instanceof Error ? error.message : '清理失败。');
      }
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
      setBusy(null);
    }
  };

  const isImageResult = cleaned
    ? getMimeTypeForFileName(cleaned.name).startsWith('image/')
    : false;
  const hasResidualMarks = Boolean(
    cleaned?.report?.still_has_c2pa === true ||
      cleaned?.report?.still_has_ai_metadata === true
  );

  return (
    <ImageToolWorkspaceShell
      title={tool.title}
      subtitle={tool.description}
      processing={tool.processing}
      className="ai-marks-tool-page"
    >
      <div
        className={`ai-marks-service-banner${status?.ok ? ' online' : ''}`}
        role="status"
        aria-live="polite"
      >
        {status?.ok ? (
          <CheckCircle2 aria-hidden="true" />
        ) : busy === 'status' ? (
          <LoaderCircle className="spin" aria-hidden="true" />
        ) : (
          <CloudOff aria-hidden="true" />
        )}
        <span>{getServiceMessage(status, isZh)}</span>
        <span className="ai-marks-service-detail">
          {status?.ok
            ? isZh
              ? '检查 → 清理 → 下载'
              : 'Inspect → clean → download'
            : isZh
              ? status?.code === 'AI_MARKS_SERVICE_NOT_CONFIGURED'
                ? '需配置 AI 标记服务'
                : '服务未就绪，可重试'
              : status?.code === 'AI_MARKS_SERVICE_NOT_CONFIGURED'
                ? 'Configure the AI marks service'
                : 'Service is not ready; retry'}
        </span>
        {!status?.ok && busy !== 'status' ? (
          <button
            className="ai-marks-status-retry"
            type="button"
            onClick={() => void refreshStatus()}
          >
            {isZh ? '重试' : 'Retry'}
          </button>
        ) : null}
      </div>

      <section className="image-tool-workbench ai-marks-workbench">
        <aside className="image-tool-controls">
          <section className="image-tool-control-section">
            <h2>{isZh ? '1. 选择内容' : '1. Choose content'}</h2>
            <p>
              {isZh
                ? '先检查输入，再决定清理范围。支持图片、文档和文本。'
                : 'Inspect first, then choose the cleanup scope. Images, documents, and text are supported.'}
            </p>
            <div
              className="ai-marks-mode-tabs"
              role="tablist"
              aria-label={isZh ? '输入方式' : 'Input mode'}
            >
              <button
                id="ai-marks-file-tab"
                className={mode === 'file' ? 'active' : ''}
                type="button"
                role="tab"
                aria-selected={mode === 'file'}
                aria-controls="ai-marks-file-panel"
                onClick={() => {
                  setMode('file');
                  setActionError('');
                }}
              >
                <FileUp aria-hidden="true" />
                {isZh ? '上传文件' : 'Upload file'}
              </button>
              <button
                id="ai-marks-text-tab"
                className={mode === 'text' ? 'active' : ''}
                type="button"
                role="tab"
                aria-selected={mode === 'text'}
                aria-controls="ai-marks-text-panel"
                onClick={() => {
                  setMode('text');
                  setActionError('');
                }}
              >
                <ClipboardPaste aria-hidden="true" />
                {isZh ? '粘贴文本' : 'Paste text'}
              </button>
            </div>

            <div
              id={
                mode === 'file' ? 'ai-marks-file-panel' : 'ai-marks-text-panel'
              }
              role="tabpanel"
              aria-labelledby={
                mode === 'file' ? 'ai-marks-file-tab' : 'ai-marks-text-tab'
              }
              tabIndex={0}
            >
              {mode === 'file' ? (
                <>
                  <input
                    ref={inputRef}
                    className="image-tool-file-input"
                    type="file"
                    accept={FILE_ACCEPT}
                    onChange={(event) => {
                      acceptFile(event.target.files?.[0]);
                      event.target.value = '';
                    }}
                  />
                  <div
                    className={`ai-marks-dropzone${file ? ' has-file' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-describedby="ai-marks-file-hint"
                    aria-label={
                      isZh ? '选择需要清理的文件' : 'Choose a file to clean'
                    }
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      acceptFile(event.dataTransfer.files?.[0]);
                    }}
                    onClick={() => inputRef.current?.click()}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        inputRef.current?.click();
                      }
                    }}
                  >
                    {file ? (
                      <>
                        <FileCheck2 aria-hidden="true" />
                        <strong>{file.name}</strong>
                        <span>{getFileSizeLabel(file.size)}</span>
                      </>
                    ) : (
                      <>
                        <FileUp aria-hidden="true" />
                        <strong>
                          {isZh
                            ? '拖放文件到这里，或点击选择'
                            : 'Drop a file here, or click to choose'}
                        </strong>
                        <span id="ai-marks-file-hint">
                          {isZh
                            ? '图片 / 文档 / 音视频 · 普通文件 20 MB，PDF/复杂文档 12 MB'
                            : 'Images, documents, audio/video · 20 MB standard, 12 MB for PDF/complex documents'}
                        </span>
                      </>
                    )}
                  </div>
                  {canVisibleRemoval && isVisibleRepairFile ? (
                    <VisibleWatermarkBoxEditor
                      file={file!}
                      boxes={visibleBoxes}
                      onChange={setVisibleBoxes}
                      isZh={isZh}
                    />
                  ) : null}
                </>
              ) : (
                <textarea
                  id="ai-marks-text-input"
                  className="ai-marks-textarea"
                  aria-label={isZh ? '粘贴需要清理的文本' : 'Text to clean'}
                  value={pastedText}
                  onChange={(event) => {
                    setPastedText(event.target.value);
                    setInputError('');
                    resetResults();
                  }}
                  placeholder={
                    isZh
                      ? '粘贴需要清理的文字、Markdown 或 HTML…'
                      : 'Paste text, Markdown, or HTML to clean…'
                  }
                  rows={9}
                />
              )}
            </div>
            {inputError ? (
              <p className="image-tool-error" role="alert">
                {inputError}
              </p>
            ) : null}
          </section>

          <section className="image-tool-control-section">
            <h2>{isZh ? '2. 清理选项' : '2. Cleanup options'}</h2>
            <div className="ai-marks-option-list">
              <label>
                <input
                  type="checkbox"
                  checked={stripAllMetadata}
                  onChange={(event) =>
                    setStripAllMetadata(event.target.checked)
                  }
                />
                <span>
                  <strong>
                    {isZh ? '移除全部文件元数据' : 'Strip all file metadata'}
                  </strong>
                  <small>
                    {isZh
                      ? '默认只移除 AI 相关标记，保留普通元数据。'
                      : 'Default keeps ordinary metadata and removes AI-related marks.'}
                  </small>
                </span>
              </label>
              {hasPixelBackend ? (
                <label>
                  <input
                    type="checkbox"
                    checked={pixelMode !== 'none'}
                    onChange={(event) => {
                      setPixelMode(
                        event.target.checked
                          ? hasCapability(status, 'pixel_backends', 'ctrlregen')
                            ? 'ctrlregen'
                            : 'diffusion'
                          : 'none'
                      );
                    }}
                  />
                  <span>
                    <strong>
                      {isZh ? '启用像素域修复' : 'Enable pixel-domain removal'}
                    </strong>
                    <small>
                      {isZh
                        ? `后端已配置：${Object.keys(pixelBackends)
                            .filter((key) => pixelBackends[key])
                            .join(' / ')}`
                        : 'Optional heavy backend; may change image pixels.'}
                    </small>
                  </span>
                </label>
              ) : null}
              {canVisibleRemoval && isVisibleRepairFile ? (
                <div className="ai-marks-visible-option-note">
                  <strong>
                    {isZh ? '可见 Logo / 文字修复已就绪' : 'Visible logo/text repair is ready'}
                  </strong>
                  <small>
                    {visibleBoxes.length
                      ? isZh
                        ? '已选择区域，点击“清理并生成结果”会执行像素修复。'
                        : 'Selected areas will be inpainted when you create the result.'
                      : isZh
                        ? '请先在预览图上框选 Logo 或文字区域。'
                        : 'Select logo or text areas on the preview first.'}
                  </small>
                </div>
              ) : null}
            </div>

            <div className="ai-marks-action-stack">
              <button
                className="image-tool-primary-button"
                type="button"
                onClick={() => void inspect()}
                disabled={!hasInput || !status?.ok || busy !== null}
              >
                {busy === 'inspect' ? (
                  <LoaderCircle className="spin" aria-hidden="true" />
                ) : (
                  <ScanSearch aria-hidden="true" />
                )}
                {isZh ? '检查文件' : 'Inspect file'}
              </button>
              <button
                className="image-tool-secondary-button"
                type="button"
                onClick={() => void clean()}
                disabled={!inspection?.ok || !status?.ok || busy !== null}
              >
                {busy === 'clean' ? (
                  <LoaderCircle className="spin" aria-hidden="true" />
                ) : (
                  <ShieldCheck aria-hidden="true" />
                )}
                {isZh ? '清理并生成结果' : 'Clean and create result'}
              </button>
              {busy === 'inspect' || busy === 'clean' ? (
                <button
                  className="image-tool-secondary-button ai-marks-cancel-button"
                  type="button"
                  onClick={() => requestControllerRef.current?.abort()}
                >
                  {isZh ? '取消处理' : 'Cancel'}
                </button>
              ) : null}
            </div>
            <p className="ai-marks-ethics-note">
              {isZh
                ? '文件会发送到配置的服务端处理。仅处理你拥有或获授权的内容；清理元数据不等于证明内容为人工创作。'
                : 'Files are processed by the configured server. Only process content you own or are authorized to edit; cleaning metadata does not prove human authorship.'}
            </p>
          </section>
        </aside>

        <div className="image-tool-result ai-marks-result" aria-live="polite">
          {actionError ? (
            <div className="ai-marks-result-alert" role="alert">
              <AlertCircle aria-hidden="true" />
              <span>{actionError}</span>
            </div>
          ) : null}

          {!inspection && !cleaned ? (
            <div className="ai-marks-empty-result">
              <Sparkles aria-hidden="true" />
              <strong>
                {isZh
                  ? '检查后查看标记报告'
                  : 'Inspect to see the marks report'}
              </strong>
              <p>
                {isZh
                  ? '这里会显示文件类型、可疑标记与服务实际执行的清理动作。'
                  : 'You will see the detected kind, suspicious marks, and the cleanup actions actually performed.'}
              </p>
            </div>
          ) : (
            <>
              {inspection ? (
                <section className="ai-marks-report-card">
                  <div className="ai-marks-report-heading">
                    <div>
                      <p className="ai-marks-kicker">
                        {isZh ? '检查结果' : 'Inspection'}
                      </p>
                      <h2>{inputName || 'pasted-content.txt'}</h2>
                    </div>
                    <span
                      className={`ai-marks-status-chip${inspection.suspicious ? ' suspicious' : ''}`}
                    >
                      {inspection.suspicious
                        ? isZh
                          ? '发现可疑标记'
                          : 'Marks detected'
                        : isZh
                          ? '未发现可疑标记'
                          : 'No marks flagged'}
                    </span>
                  </div>
                  <div className="ai-marks-report-meta">
                    <span>{inspection.kind || 'unknown'}</span>
                    <span>{getFileSizeLabel(inputBytes)}</span>
                  </div>
                  {reportEntries.length ? (
                    <dl className="ai-marks-report-grid">
                      {reportEntries.map(([key, value]) => (
                        <div key={key}>
                          <dt>{key}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </section>
              ) : null}

              {cleaned ? (
                <section className="ai-marks-cleaned-card">
                  <div className="ai-marks-report-heading">
                    <div>
                      <p className="ai-marks-kicker">
                        {hasResidualMarks
                          ? isZh
                            ? '需要复核'
                            : 'Review recommended'
                          : isZh
                            ? '已生成结果'
                            : 'Result ready'}
                      </p>
                      <h2>{cleaned.name}</h2>
                    </div>
                    {hasResidualMarks ? (
                      <AlertCircle aria-hidden="true" />
                    ) : (
                      <CheckCircle2 aria-hidden="true" />
                    )}
                  </div>
                  {hasResidualMarks ? (
                    <div className="ai-marks-result-alert" role="alert">
                      <AlertCircle aria-hidden="true" />
                      <span>
                        {isZh
                          ? '清理后仍检测到部分来源标记。结果已生成，但不能宣称完全移除，请下载前人工复核。'
                          : 'Some source marks were still detected after cleanup. The file is ready, but it is not a guarantee of complete removal; review it before downloading.'}
                      </span>
                    </div>
                  ) : null}
                  {isImageResult ? (
                    <div className="ai-marks-image-preview">
                      <img
                        src={cleaned.url}
                        alt={
                          isZh ? '清理后的图片预览' : 'Cleaned image preview'
                        }
                      />
                    </div>
                  ) : null}
                  {cleanedReportEntries.length ? (
                    <dl className="ai-marks-report-grid">
                      {cleanedReportEntries.map(([key, value]) => (
                        <div key={key}>
                          <dt>{key}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  <div className="image-tool-result-actions">
                    <button
                      className="image-tool-primary-button"
                      type="button"
                      onClick={() => downloadBlob(cleaned.blob, cleaned.name)}
                    >
                      <Download aria-hidden="true" />
                      {isZh ? '下载清理结果' : 'Download cleaned file'}
                    </button>
                    <button
                      className="image-tool-secondary-button"
                      type="button"
                      onClick={resetResults}
                    >
                      {isZh ? '重新检查' : 'Inspect again'}
                    </button>
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>
      </section>

      <section className="image-tool-footer ai-marks-footer">
        <div>
          <h2>{isZh ? '这套工具清理什么？' : 'What this tool cleans'}</h2>
          <p>
            {isZh
              ? '它支持不可见 Unicode、C2PA / EXIF / XMP、常见文档属性，以及对图片中用户框选的可见 Logo / 文字区域进行像素修复。像素域 AI 水印仍只在后端报告可用且经过验证时开放。'
              : 'It supports invisible Unicode, C2PA / EXIF / XMP, common document properties, and pixel repair for user-selected visible logo/text areas. Pixel-domain AI removal is only exposed when a verified backend is available.'}
          </p>
        </div>
        <div className="ai-marks-capability-list">
          <span>
            <ShieldCheck aria-hidden="true" /> Layer A
          </span>
          <span>
            <FileCheck2 aria-hidden="true" /> C2PA / metadata
          </span>
          {hasPixelBackend ? (
            <span>
              <Sparkles aria-hidden="true" /> Pixel backend
            </span>
          ) : null}
          {canVisibleRemoval ? (
            <span>
              <SquareDashedMousePointer aria-hidden="true" /> Visible repair
            </span>
          ) : null}
        </div>
      </section>
    </ImageToolWorkspaceShell>
  );
}
