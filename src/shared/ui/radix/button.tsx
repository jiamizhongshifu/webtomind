import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';
import { createRippleHandlers } from '@/shared/ui/Ripple';

const buttonVariants = cva(
  'ui-button [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'ui-button--primary',
        danger: 'ui-button--danger',
        glass: 'ui-button--glass',
        // Keep existing consumer names as aliases of the public contract.
        default: 'ui-button--primary',
        destructive: 'ui-button--danger',
        outline: 'ui-button--outline',
        secondary: 'ui-button--secondary',
        ghost: 'ui-button--ghost',
        link: 'ui-button--link'
      },
      size: {
        md: 'ui-button--md',
        default: 'ui-button--md',
        sm: 'ui-button--sm',
        lg: 'ui-button--lg',
        icon: 'ui-button--icon'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  ripple?: boolean;
  isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      ripple = true,
      disabled,
      isLoading = false,
      type = 'button',
      onClick,
      onClickCapture,
      onKeyDown,
      onPointerDown,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;
    const Comp = asChild ? Slot : 'button';
    const rippleHandlers = createRippleHandlers<HTMLButtonElement>({
      disabled: !ripple || isDisabled,
      onKeyDown,
      onPointerDown
    });
    return (
      <Comp
        className={cn(
          buttonVariants({ variant, size, className }),
          ripple && 'ui-ripple-surface',
          isLoading && 'ui-button--loading'
        )}
        ref={ref}
        type={asChild ? undefined : type}
        disabled={asChild ? undefined : isDisabled}
        aria-disabled={asChild && isDisabled ? true : undefined}
        aria-busy={isLoading || undefined}
        onClickCapture={(event) => {
          if (isDisabled) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          onClickCapture?.(event);
        }}
        onClick={(event) => {
          if (isDisabled) {
            event.preventDefault();
            return;
          }
          onClick?.(event);
        }}
        {...rippleHandlers}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
