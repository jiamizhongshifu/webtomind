import {
  CheckCircle2,
  ImagePlus,
  LoaderCircle,
  Plus,
  Trash2,
  XCircle
} from 'lucide-react';
import { useRef, type ChangeEvent, type DragEvent } from 'react';
import { formatBytes } from '@/web/lib/image-tools';
import type {
  ImageUpscaleQueueItem,
  ImageUpscaleQueueStatus
} from '@/web/hooks/useImageUpscaleQueue';

const STATUS_LABELS: Record<ImageUpscaleQueueStatus, string> = {
  queued: '等待',
  processing: '处理中',
  success: '完成',
  error: '失败'
};

function QueueStatusIcon({ status }: { status: ImageUpscaleQueueStatus }) {
  if (status === 'processing')
    return <LoaderCircle className="spin" aria-hidden="true" />;
  if (status === 'success') return <CheckCircle2 aria-hidden="true" />;
  if (status === 'error') return <XCircle aria-hidden="true" />;
  return null;
}

export function ImageUpscaleQueue({
  items,
  selectedId,
  isAdding,
  disabled,
  error,
  maxItems,
  onAddFiles,
  onSelect,
  onRemove,
  onClear
}: {
  items: ImageUpscaleQueueItem[];
  selectedId: string | null;
  isAdding: boolean;
  disabled: boolean;
  error: string;
  maxItems: number;
  onAddFiles: (files: File[]) => Promise<void>;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const acceptFiles = (files: FileList | null) => {
    if (!files || disabled) return;
    void onAddFiles(Array.from(files));
  };
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    acceptFiles(event.target.files);
    event.target.value = '';
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    acceptFiles(event.dataTransfer.files);
  };

  return (
    <>
      <input
        ref={inputRef}
        className="image-tool-file-input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={onChange}
      />
      {items.length === 0 ? (
        <div
          className="image-tool-dropzone image-upscale-dropzone"
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
          onClick={() => !disabled && inputRef.current?.click()}
          onKeyDown={(event) => {
            if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
        >
          {isAdding ? (
            <LoaderCircle className="spin" aria-hidden="true" />
          ) : (
            <ImagePlus aria-hidden="true" />
          )}
          <strong>{isAdding ? '正在读取图片…' : '拖放多张图片到这里'}</strong>
          <span>JPEG / PNG / WebP · 最多 {maxItems} 张</span>
        </div>
      ) : (
        <>
          <div className="image-upscale-queue-toolbar">
            <strong>
              批量队列 <span>{items.length}</span>
            </strong>
            <div>
              <button
                type="button"
                disabled={disabled || isAdding || items.length >= maxItems}
                onClick={() => inputRef.current?.click()}
              >
                <Plus aria-hidden="true" />
                添加
              </button>
              <button type="button" disabled={disabled} onClick={onClear}>
                清空
              </button>
            </div>
          </div>
          <div className="image-upscale-queue" aria-label="图片放大批量队列">
            {items.map((item, index) => (
              <article
                className={`image-upscale-queue-item${
                  (selectedId || items[0]?.id) === item.id ? ' active' : ''
                }`}
                key={item.id}
              >
                <button
                  className="image-upscale-queue-select"
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-label={`查看 ${item.source.file.name}`}
                >
                  <img src={item.source.url} alt="" />
                  <span className="image-upscale-queue-copy">
                    <strong>
                      {index + 1}. {item.source.file.name}
                    </strong>
                    <small>
                      {item.source.width} × {item.source.height} ·{' '}
                      {formatBytes(item.source.file.size)}
                    </small>
                    <small className={`status ${item.status}`}>
                      <QueueStatusIcon status={item.status} />
                      {STATUS_LABELS[item.status]}
                      {item.status === 'processing'
                        ? ` ${Math.round(item.progress)}%`
                        : ''}
                    </small>
                  </span>
                </button>
                <button
                  className="image-upscale-queue-remove"
                  type="button"
                  disabled={disabled}
                  onClick={() => onRemove(item.id)}
                  aria-label={`移除 ${item.source.file.name}`}
                >
                  <Trash2 aria-hidden="true" />
                </button>
                {item.status === 'processing' ? (
                  <span
                    className="image-upscale-queue-progress"
                    aria-hidden="true"
                  >
                    <i style={{ width: `${item.progress}%` }} />
                  </span>
                ) : null}
              </article>
            ))}
          </div>
        </>
      )}
      {error ? (
        <p className="image-tool-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
