import { forwardRef } from 'react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';
import type { IconButtonSize, IconButtonVariant } from './IconButton';

export interface IconLinkProps
  extends AnchorHTMLAttributes<HTMLAnchorElement> {
  label: string;
  icon: ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
}

export const IconLink = forwardRef<HTMLAnchorElement, IconLinkProps>(
  (
    {
      label,
      icon,
      variant = 'ghost',
      size = 'md',
      className,
      title,
      ...props
    },
    ref
  ) => (
    <a
      ref={ref}
      className={clsx(
        'ui-icon-button',
        'ui-icon-link',
        `ui-icon-button--${variant}`,
        `ui-icon-button--${size}`,
        className
      )}
      aria-label={label}
      title={title ?? label}
      {...props}
    >
      <span className="ui-icon-button__icon" aria-hidden="true">
        {icon}
      </span>
    </a>
  )
);

IconLink.displayName = 'IconLink';
