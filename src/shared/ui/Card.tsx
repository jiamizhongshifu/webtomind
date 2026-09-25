import { forwardRef } from 'react';
import type { ElementType, HTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { createRippleHandlers } from './Ripple';

export type CardVariant = 'flat' | 'raised' | 'media' | 'interactive' | 'glass';
export type CardDensity = 'compact' | 'normal' | 'spacious';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  variant?: CardVariant;
  density?: CardDensity;
  href?: string;
  rel?: string;
  target?: string;
  to?: string;
  type?: 'button' | 'submit' | 'reset';
  ripple?: boolean;
}

export const Card = forwardRef<HTMLElement, CardProps>(
  (
    {
      as: Component = 'div',
      variant = 'flat',
      density = 'normal',
      ripple,
      className,
      onKeyDown,
      onPointerDown,
      ...props
    },
    ref
  ) => {
    const componentTag = typeof Component === 'string' ? Component : undefined;
    const isInteractive =
      ripple ??
      (variant === 'interactive' ||
        componentTag === 'a' ||
        componentTag === 'button' ||
        Boolean(props.href || props.to || props.role === 'button'));
    const rippleHandlers = createRippleHandlers<HTMLElement>({
      disabled: !isInteractive,
      onKeyDown,
      onPointerDown
    });

    return (
      <Component
        ref={ref}
        className={clsx(
          'ui-card',
          isInteractive && 'ui-ripple-surface',
          `ui-card--${variant}`,
          `ui-card--${density}`,
          className
        )}
        {...rippleHandlers}
        {...props}
      />
    );
  }
);

Card.displayName = 'Card';
