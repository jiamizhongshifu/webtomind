import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LinkProps } from 'react-router-dom';
import { clsx } from 'clsx';
import type { ButtonSize, ButtonVariant } from './Button';
import { createRippleHandlers } from './Ripple';

export interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  ripple?: boolean;
}

export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      leadingIcon,
      trailingIcon,
      ripple = true,
      className,
      children,
      onKeyDown,
      onPointerDown,
      ...props
    },
    ref
  ) => {
    const rippleHandlers = createRippleHandlers<HTMLAnchorElement>({
      disabled: !ripple,
      onKeyDown,
      onPointerDown
    });

    return (
      <Link
        ref={ref}
        className={clsx(
          'ui-button',
          ripple && 'ui-ripple-surface',
          `ui-button--${variant}`,
          `ui-button--${size}`,
          className
        )}
        {...rippleHandlers}
        {...props}
      >
        {leadingIcon ? (
          <span className="ui-button__icon" aria-hidden="true">
            {leadingIcon}
          </span>
        ) : null}
        <span className="ui-button__label">{children}</span>
        {trailingIcon ? (
          <span className="ui-button__icon" aria-hidden="true">
            {trailingIcon}
          </span>
        ) : null}
      </Link>
    );
  }
);

ButtonLink.displayName = 'ButtonLink';
