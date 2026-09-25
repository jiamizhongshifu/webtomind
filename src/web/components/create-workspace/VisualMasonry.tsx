import type { HTMLAttributes, PropsWithChildren } from 'react';
import { clsx } from 'clsx';

type VisualMasonryProps = PropsWithChildren<
  HTMLAttributes<HTMLDivElement> & {
    density?: 'compact' | 'comfortable';
  }
>;

/**
 * Shared Krea-style image waterfall used by discovery and moodboard surfaces.
 * Children retain their intrinsic image ratio; page components only provide
 * their own primary action and optional hover control.
 */
export function VisualMasonry({
  children,
  className,
  density = 'compact',
  ...props
}: VisualMasonryProps) {
  return (
    <div
      className={clsx('visual-masonry', className)}
      data-density={density}
      {...props}
    >
      {children}
    </div>
  );
}
