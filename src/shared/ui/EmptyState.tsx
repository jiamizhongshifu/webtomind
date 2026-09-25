import type { ReactNode } from 'react';
import { clsx } from 'clsx';

export type EmptyStateTone = 'neutral' | 'success' | 'warning' | 'danger' | 'glass';

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  tone?: EmptyStateTone;
  className?: string;
}

export function EmptyState({ title, description, icon, action, tone = 'neutral', className }: EmptyStateProps) {
  return (
    <section className={clsx('ui-empty-state', `ui-empty-state--${tone}`, className)}>
      {icon ? <div className="ui-empty-state__icon" aria-hidden="true">{icon}</div> : null}
      <div className="ui-empty-state__copy">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="ui-empty-state__action">{action}</div> : null}
    </section>
  );
}
