import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';
import { createRippleHandlers } from './Ripple';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'glass'
  | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  isLoading?: boolean;
  ripple?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      leadingIcon,
      trailingIcon,
      isLoading = false,
      ripple = true,
      className,
      children,
      disabled,
      type = 'button',
      onKeyDown,
      onPointerDown,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;
    const rippleHandlers = createRippleHandlers<HTMLButtonElement>({
      disabled: !ripple || isDisabled,
      onKeyDown,
      onPointerDown
    });

    return (
      <button
        ref={ref}
        type={type}
        className={clsx(
          'ui-button',
          ripple && 'ui-ripple-surface',
          `ui-button--${variant}`,
          `ui-button--${size}`,
          isLoading && 'ui-button--loading',
          className
        )}
        disabled={isDisabled}
        aria-busy={isLoading || undefined}
        {...rippleHandlers}
        {...props}
      >
        {leadingIcon ? (
          <span className="ui-button__icon" aria-hidden="true">
            {leadingIcon}
          </span>
        ) : null}
        {children !== null && children !== undefined && children !== false ? (
          <span className="ui-button__label">{children}</span>
        ) : null}
        {trailingIcon ? (
          <span className="ui-button__icon" aria-hidden="true">
            {trailingIcon}
          </span>
        ) : null}
      </button>
    );
  }
);

Button.displayName = 'Button';
