import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';
import { createRippleHandlers } from './Ripple';

export type IconButtonVariant =
  | 'solid'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'glass'
  | 'media';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  ripple?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      label,
      icon,
      variant = 'ghost',
      size = 'md',
      ripple = true,
      className,
      type = 'button',
      onKeyDown,
      onPointerDown,
      disabled,
      ...props
    },
    ref
  ) => {
    const rippleHandlers = createRippleHandlers<HTMLButtonElement>({
      disabled: !ripple || disabled,
      onKeyDown,
      onPointerDown
    });

    return (
      <button
        ref={ref}
        type={type}
        className={clsx(
          'ui-icon-button',
          ripple && 'ui-ripple-surface',
          `ui-icon-button--${variant}`,
          `ui-icon-button--${size}`,
          className
        )}
        aria-label={label}
        title={props.title ?? label}
        disabled={disabled}
        {...rippleHandlers}
        {...props}
      >
        <span className="ui-icon-button__icon" aria-hidden="true">
          {icon}
        </span>
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';
