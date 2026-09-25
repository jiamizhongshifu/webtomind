import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { clsx } from 'clsx';

export type SurfaceVariant = 'solid' | 'subtle' | 'raised' | 'glass' | 'overlay';
export type SurfaceDensity = 'compact' | 'normal' | 'spacious';

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SurfaceVariant;
  density?: SurfaceDensity;
}

export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(
  ({ variant = 'solid', density = 'normal', className, ...props }, ref) => (
    <div
      ref={ref}
      className={clsx('ui-surface', `ui-surface--${variant}`, `ui-surface--${density}`, className)}
      {...props}
    />
  ),
);

Surface.displayName = 'Surface';

