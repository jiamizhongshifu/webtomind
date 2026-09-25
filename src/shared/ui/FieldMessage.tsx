import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { clsx } from 'clsx';

export type FieldMessageTone = 'neutral' | 'success' | 'warning' | 'error';

export interface FieldMessageProps extends HTMLAttributes<HTMLParagraphElement> {
  tone?: FieldMessageTone;
}

export const FieldMessage = forwardRef<HTMLParagraphElement, FieldMessageProps>(
  ({ tone = 'neutral', className, children, role, ...props }, ref) => (
    <p
      ref={ref}
      className={clsx(
        'ui-field-message',
        `ui-field-message--${tone}`,
        className
      )}
      role={role ?? (tone === 'error' ? 'alert' : undefined)}
      {...props}
    >
      {children}
    </p>
  )
);

FieldMessage.displayName = 'FieldMessage';
