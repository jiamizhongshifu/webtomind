import { forwardRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';
import { clsx } from 'clsx';

export type TextareaSize = 'sm' | 'md' | 'lg';
export type TextareaVariant = 'solid' | 'glass';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  textareaSize?: TextareaSize;
  variant?: TextareaVariant;
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      textareaSize = 'md',
      variant = 'solid',
      invalid = false,
      className,
      'aria-invalid': ariaInvalid,
      ...props
    },
    ref
  ) => (
    <textarea
      ref={ref}
      className={clsx(
        'ui-textarea',
        `ui-textarea--${textareaSize}`,
        `ui-textarea--${variant}`,
        invalid && 'ui-textarea--invalid',
        className
      )}
      aria-invalid={ariaInvalid ?? (invalid || undefined)}
      {...props}
    />
  )
);

Textarea.displayName = 'Textarea';
