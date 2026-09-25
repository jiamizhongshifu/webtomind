import { forwardRef } from 'react';
import type { SelectHTMLAttributes } from 'react';
import { clsx } from 'clsx';

export type SelectSize = 'sm' | 'md' | 'lg';
export type SelectVariant = 'solid' | 'glass';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  selectSize?: SelectSize;
  variant?: SelectVariant;
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ selectSize = 'md', variant = 'solid', invalid = false, className, 'aria-invalid': ariaInvalid, ...props }, ref) => (
    <select
      ref={ref}
      className={clsx(
        'ui-select',
        `ui-select--${selectSize}`,
        `ui-select--${variant}`,
        invalid && 'ui-select--invalid',
        className,
      )}
      aria-invalid={ariaInvalid ?? (invalid || undefined)}
      {...props}
    />
  ),
);

Select.displayName = 'Select';
