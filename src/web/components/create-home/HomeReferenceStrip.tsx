import { Image as ImageIcon, LoaderCircle, X } from 'lucide-react';
import type { ImageReferenceAsset } from '@/shared/image-reference-types';

export type PendingHomeReferenceUpload = {
  id: string;
  fileName: string;
  previewUrl: string;
};

type HomeReferenceStripProps = {
  references: ImageReferenceAsset[];
  pendingUploads: PendingHomeReferenceUpload[];
  uploadingLabel: string;
  stripLabel: string;
  getReferenceLabel: (index: number) => string;
  getRemoveLabel: (index: number) => string;
  onRemove: (referenceId: string) => void;
};

export function HomeReferenceStrip({
  references,
  pendingUploads,
  uploadingLabel,
  stripLabel,
  getReferenceLabel,
  getRemoveLabel,
  onRemove
}: HomeReferenceStripProps) {
  if (references.length === 0 && pendingUploads.length === 0) return null;

  return (
    <div
      className="create-home-prompt-reference-strip"
      aria-label={stripLabel}
      aria-live="polite"
    >
      {references.map((reference, index) => (
        <div
          key={reference.id}
          className="create-home-prompt-reference-item"
          tabIndex={0}
          title={reference.label}
        >
          <span className="create-home-prompt-reference-thumb">
            {reference.thumbnailUrl ? (
              <img
                src={reference.thumbnailUrl}
                alt={reference.label}
                width={46}
                height={46}
                loading="lazy"
                decoding="async"
              />
            ) : (
              <ImageIcon size={18} aria-hidden />
            )}
          </span>
          <span className="create-home-prompt-reference-meta">
            <strong>{getReferenceLabel(index)}</strong>
            <em>@image{index + 1}</em>
          </span>
          <button
            type="button"
            className="create-home-prompt-reference-remove"
            aria-label={getRemoveLabel(index)}
            onClick={() => onRemove(reference.id)}
          >
            <span>
              <X size={15} aria-hidden />
            </span>
          </button>
        </div>
      ))}
      {pendingUploads.map((upload, index) => (
        <div
          key={upload.id}
          className="create-home-prompt-reference-item is-uploading"
          aria-label={`${upload.fileName} ${uploadingLabel}`}
        >
          <span className="create-home-prompt-reference-thumb">
            <img
              src={upload.previewUrl}
              alt={upload.fileName}
              width={46}
              height={46}
            />
            <span className="create-home-prompt-reference-loading" aria-hidden>
              <LoaderCircle size={20} />
            </span>
          </span>
          <span className="create-home-prompt-reference-meta">
            <strong>{getReferenceLabel(references.length + index)}</strong>
            <em>{uploadingLabel}</em>
          </span>
        </div>
      ))}
    </div>
  );
}
