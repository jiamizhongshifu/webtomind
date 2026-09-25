/**
 * 素材缩略图。有 thumbnailUrl 走图片;否则渲染统一占位图形。
 * 库面板网格、大图选择弹窗、画布预览三处共用。
 */

import type { ImagePromptAsset } from '../../data/image-prompt-core';
import { imageFetchPriority } from '@/shared/ui';
import { useEffect, useState } from 'react';

function AssetThumbPlaceholder() {
  return (
    <div
      className="creator-asset-thumb creator-asset-thumb-placeholder"
      aria-hidden="true"
    >
      <svg
        className="creator-thumb-placeholder-icon"
        viewBox="0 0 64 48"
        fill="none"
        aria-hidden="true"
      >
        <rect
          x="9"
          y="7"
          width="46"
          height="34"
          rx="5"
          stroke="currentColor"
          strokeWidth="3"
        />
        <circle cx="24" cy="20" r="4" fill="currentColor" opacity="0.55" />
        <path
          d="M15 36L28 26L37 33L43 28L51 36"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function AssetThumb({ asset }: { asset: ImagePromptAsset }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const thumbnailUrl =
    asset.thumbnailUrl && asset.thumbnailUrl !== failedUrl
      ? asset.thumbnailUrl
      : undefined;

  useEffect(() => {
    setFailedUrl(null);
  }, [asset.id, asset.thumbnailUrl]);

  if (asset.thumbnailEmoji) {
    return (
      <div
        className={`creator-asset-thumb creator-asset-emoji-thumb creator-asset-emoji-thumb-${asset.slot}`}
        aria-hidden="true"
      >
        <span>{asset.thumbnailEmoji}</span>
      </div>
    );
  }

  if (thumbnailUrl) {
    return (
      <div className="creator-asset-thumb creator-asset-image-thumb">
        <img
          src={thumbnailUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailedUrl(thumbnailUrl)}
          {...imageFetchPriority('low')}
        />
      </div>
    );
  }

  return <AssetThumbPlaceholder />;
}
