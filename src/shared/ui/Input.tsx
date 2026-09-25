import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { clsx } from 'clsx';

export type InputSize = 'sm' | 'md' | 'lg';
export type InputVariant = 'solid' | 'glass';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  inputSize?: InputSize;
  variant?: InputVariant;
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ inputSize = 'md', variant = 'solid', invalid = false, className, 'aria-invalid': ariaInvalid, ...props }, ref) => (
    <input
      ref={ref}
      className={clsx(
        'ui-input',
        `ui-input--${inputSize}`,
        `ui-input--${variant}`,
        invalid && 'ui-input--invalid',
        className,
      )}
      aria-invalid={ariaInvalid ?? (invalid || undefined)}
      {...props}
    />
  ),
);

Input.displayName = 'Input';
