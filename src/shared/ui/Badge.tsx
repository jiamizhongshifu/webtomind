import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { clsx } from 'clsx';

export type BadgeVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'glass';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = 'neutral', size = 'sm', className, ...props }, ref) => (
    <span ref={ref} className={clsx('ui-badge', `ui-badge--${variant}`, `ui-badge--${size}`, className)} {...props} />
  ),
);

Badge.displayName = 'Badge';

