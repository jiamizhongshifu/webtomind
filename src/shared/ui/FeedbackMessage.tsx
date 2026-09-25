import type { HTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';

export type FeedbackMessageTone = 'neutral' | 'success' | 'warning' | 'error';
export type FeedbackMessageSurface = 'default' | 'web';

export interface FeedbackMessageProps extends HTMLAttributes<HTMLDivElement> {
  tone?: FeedbackMessageTone;
  surface?: FeedbackMessageSurface;
  children: ReactNode;
}

export function FeedbackMessage({
  tone = 'neutral',
  surface = 'default',
  className,
  children,
  ...props
}: FeedbackMessageProps) {
  return (
    <div
      className={clsx(
        'ui-state-block',
        surface === 'web' && 'ui-state-block--web',
        tone !== 'neutral' && `ui-state-block--${tone}`,
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
