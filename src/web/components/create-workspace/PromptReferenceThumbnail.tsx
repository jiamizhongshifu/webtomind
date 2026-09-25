import { AtSign, AudioLines, Image as ImageIcon, Video, X } from 'lucide-react';
import './prompt-reference-thumbnail.css';

interface PromptReferenceThumbnailProps {
  label: string;
  previewUrl?: string;
  mediaType?: 'image' | 'video' | 'audio';
  kind?: string;
  mentionLabel?: string;
  removeLabel?: string;
  onMention: () => void;
  onRemove: () => void;
}

export function PromptReferenceThumbnail({
  label,
  previewUrl,
  mediaType = 'image',
  kind = 'reference',
  mentionLabel = `@${label}`,
  removeLabel = `取消${label}`,
  onMention,
  onRemove
}: PromptReferenceThumbnailProps) {
  return (
    <article className="creation-prompt-reference" data-slot={kind}>
      {previewUrl && mediaType === 'image' ? (
        <img
          src={previewUrl}
          alt={label}
          loading="eager"
          decoding="async"
          referrerPolicy="no-referrer"
        />
      ) : previewUrl && mediaType === 'video' ? (
        <video
          src={previewUrl}
          muted
          playsInline
          preload="metadata"
          aria-label={label}
        />
      ) : (
        <span className="creation-prompt-reference-fallback" aria-hidden="true">
          {mediaType === 'audio' ? (
            <AudioLines />
          ) : mediaType === 'video' ? (
            <Video />
          ) : (
            <ImageIcon />
          )}
        </span>
      )}
      <span className="creation-prompt-reference-label">{label}</span>
      <div className="creation-prompt-reference-actions">
        <button
          type="button"
          onClick={onMention}
          aria-label={mentionLabel}
          title={mentionLabel}
        >
          <AtSign aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          title={removeLabel}
        >
          <X aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}
