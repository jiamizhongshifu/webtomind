import {
  ArrowLeft,
  CheckCircle2,
  Download,
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  RotateCcw,
  X
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode
} from 'react';
import { Link } from 'react-router-dom';
import type { ImageToolDefinition } from '@/shared/create-apps';
import { CreateWorkspaceFrame } from '@/web/components/image-create/CreateWorkspaceFrame';
import {
  decodeImageFile,
  releaseDecodedImage,
  type DecodedImage
} from '@/web/lib/image-tools';
import { useRouteLocale } from '@/web/lib/route-locale';
import '@/web/styles/image-tools.css';

export type ToolRunState = 'idle' | 'processing' | 'success' | 'error';

export function useImageToolUpload() {
  const [source, setSource] = useState<DecodedImage | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const sourceRef = useRef<DecodedImage | null>(null);

  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  useEffect(
    () => () => {
      releaseDecodedImage(sourceRef.current);
    },
    []
  );

  const acceptFile = async (file: File) => {
    setRevision((value) => value + 1);
    setError('');
    try {
      const next = await decodeImageFile(file);
      setSource((previous) => {
        releaseDecodedImage(previous);
        return next;
      });
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : '图片读取失败。'
      );
    }
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void acceptFile(file);
    event.target.value = '';
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) void acceptFile(file);
  };

  const clear = () => {
    setRevision((value) => value + 1);
    setSource((previous) => {
      releaseDecodedImage(previous);
      return null;
    });
    setError('');
  };

  return {
    source,
    revision,
    error,
    setError,
    inputRef,
    onChange,
    onDrop,
    acceptFile,
    clear
  };
}

export function ImageUploadField({
  upload,
  label = '拖放图片到这里，或点击选择',
  hint = 'JPEG / PNG / WebP · 最大 20 MB、6400 万像素'
}: {
  upload: ReturnType<typeof useImageToolUpload>;
  label?: string;
  hint?: string;
}) {
  return (
    <>
      <input
        ref={upload.inputRef}
        className="image-tool-file-input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={upload.onChange}
      />
      <div
        className={`image-tool-dropzone${upload.source ? ' has-source' : ''}`}
        role="button"
        tabIndex={0}
        onDragOver={(event) => event.preventDefault()}
        onDrop={upload.onDrop}
        onClick={() => upload.inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            upload.inputRef.current?.click();
          }
        }}
      >
        {upload.source ? (
          <>
            <img src={upload.source.url} alt="上传图片预览" />
            <div>
              <strong>{upload.source.file.name}</strong>
              <span>
                {upload.source.width} × {upload.source.height}
              </span>
            </div>
          </>
        ) : (
          <>
            <ImagePlus aria-hidden="true" />
            <strong>{label}</strong>
            <span>{hint}</span>
          </>
        )}
      </div>
      {upload.source ? (
        <button
          className="image-tool-text-button"
          type="button"
          onClick={upload.clear}
        >
          <X aria-hidden="true" />
          移除图片
        </button>
      ) : null}
      {upload.error ? (
        <p className="image-tool-error" role="alert">
          {upload.error}
        </p>
      ) : null}
    </>
  );
}

export function ToolStatus({
  state,
  progress,
  engine,
  message
}: {
  state: ToolRunState;
  progress?: number;
  engine?: string;
  message?: string;
}) {
  if (state === 'idle' && !engine) return null;
  return (
    <div className={`image-tool-status ${state}`} aria-live="polite">
      {state === 'processing' ? (
        <LoaderCircle className="spin" aria-hidden="true" />
      ) : state === 'success' ? (
        <CheckCircle2 aria-hidden="true" />
      ) : state === 'error' ? (
        <X aria-hidden="true" />
      ) : (
        <LockKeyhole aria-hidden="true" />
      )}
      <div>
        <strong>
          {engine || (state === 'processing' ? '正在处理' : '本地处理')}
        </strong>
        {message ? <span>{message}</span> : null}
        {typeof progress === 'number' ? (
          <div className="image-tool-progress">
            <i style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ResultActions({
  onDownload,
  onReset,
  disabled
}: {
  onDownload: () => void;
  onReset?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="image-tool-result-actions">
      <button
        className="image-tool-primary-button"
        type="button"
        onClick={onDownload}
        disabled={disabled}
      >
        <Download aria-hidden="true" />
        下载结果
      </button>
      {onReset ? (
        <button
          className="image-tool-secondary-button"
          type="button"
          onClick={onReset}
        >
          <RotateCcw aria-hidden="true" />
          重新处理
        </button>
      ) : null}
    </div>
  );
}

export function ImageToolShell({
  tool,
  controls,
  result,
  footer
}: {
  tool: ImageToolDefinition;
  controls: ReactNode;
  result: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <ImageToolWorkspaceShell
      title={tool.title}
      subtitle={tool.description}
      processing={tool.processing}
    >
      <section className="image-tool-workbench">
        <aside className="image-tool-controls">{controls}</aside>
        <div className="image-tool-result">{result}</div>
      </section>
      {footer ? (
        <section className="image-tool-footer">{footer}</section>
      ) : null}
    </ImageToolWorkspaceShell>
  );
}

export function ImageToolWorkspaceShell({
  title,
  subtitle,
  processing,
  className = '',
  children
}: {
  title: string;
  subtitle: string;
  processing: ImageToolDefinition['processing'];
  className?: string;
  children: ReactNode;
}) {
  const { isZh } = useRouteLocale();
  const prefix = isZh ? '/zh-CN' : '/en-US';

  return (
    <CreateWorkspaceFrame
      className={`image-tool-page image-tool-workspace-route ${className}`.trim()}
    >
      <div className="image-tool-workspace-main">
        <header className="image-tool-workspace-header">
          <div className="image-tool-topline">
            <Link to={`${prefix}/apps`}>
              <ArrowLeft aria-hidden="true" />
              {isZh ? '全部图片工具' : 'All image tools'}
            </Link>
            <span>
              <LockKeyhole aria-hidden="true" />
              {processing === 'local'
                ? isZh
                  ? '本地处理，不上传'
                  : 'Local, no upload'
                : processing === 'service'
                  ? isZh
                    ? '服务清理 · 仅处理授权内容'
                    : 'Service cleanup · authorized content only'
                  : isZh
                    ? '本地优先 · AI 重绘需确认'
                    : 'Local first · redraw requires consent'}
            </span>
          </div>
          <div className="image-tool-workspace-heading">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
        </header>
        {children}
      </div>
    </CreateWorkspaceFrame>
  );
}

export function EmptyResult({ children }: { children: ReactNode }) {
  return (
    <div className="image-tool-empty-result">
      <ImagePlus aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}
