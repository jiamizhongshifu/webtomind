import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';

export type MediaTileRatio = 'auto' | 'square' | 'portrait' | 'landscape' | 'wide';
export type MediaTileFit = 'cover' | 'contain';

export interface MediaTileProps extends HTMLAttributes<HTMLDivElement> {
  ratio?: MediaTileRatio;
  fit?: MediaTileFit;
  overlay?: ReactNode;
}

export const MediaTile = forwardRef<HTMLDivElement, MediaTileProps>(
  ({ ratio = 'square', fit = 'cover', overlay, className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={clsx('ui-media-tile', `ui-media-tile--${ratio}`, `ui-media-tile--${fit}`, className)}
      {...props}
    >
      {children}
      {overlay ? <div className="ui-media-tile__overlay">{overlay}</div> : null}
    </div>
  ),
);

MediaTile.displayName = 'MediaTile';
