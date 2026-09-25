import { AudioLines, Image as ImageIcon, Video } from 'lucide-react';
import './prompt-reference-thumbnail.css';

interface PromptReferenceUploadSkeletonProps {
  label: string;
  mediaType?: 'image' | 'video' | 'audio';
  statusLabel?: string;
}

export function PromptReferenceUploadSkeleton({
  label,
  mediaType = 'image',
  statusLabel = '上传中'
}: PromptReferenceUploadSkeletonProps) {
  return (
    <article
      className="creation-prompt-reference-upload"
      role="status"
      aria-label={`${label} ${statusLabel}`}
    >
      <span
        className="creation-prompt-reference-upload-icon"
        aria-hidden="true"
      >
        {mediaType === 'audio' ? (
          <AudioLines />
        ) : mediaType === 'video' ? (
          <Video />
        ) : (
          <ImageIcon />
        )}
      </span>
      <span className="creation-prompt-reference-upload-label">
        {statusLabel}
      </span>
    </article>
  );
}
