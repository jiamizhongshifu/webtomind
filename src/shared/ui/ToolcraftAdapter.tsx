import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode
} from 'react';
import { clsx } from 'clsx';

export interface ToolcraftPanelProps {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function ToolcraftPanel({
  title,
  eyebrow,
  description,
  actions,
  children,
  className,
  contentClassName
}: ToolcraftPanelProps) {
  return (
    <section className={clsx('ui-toolcraft-panel', className)}>
      <header className="ui-toolcraft-panel__header">
        <div className="ui-toolcraft-panel__title-block">
          {eyebrow ? (
            <span className="ui-toolcraft-panel__eyebrow">{eyebrow}</span>
          ) : null}
          <h2>{title}</h2>
          {description ? (
            <p className="ui-toolcraft-panel__description">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="ui-toolcraft-panel__actions">{actions}</div>
        ) : null}
      </header>
      <div className={clsx('ui-toolcraft-panel__content', contentClassName)}>
        {children}
      </div>
    </section>
  );
}

export interface ToolcraftControlSectionProps {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function ToolcraftControlSection({
  title,
  children,
  className
}: ToolcraftControlSectionProps) {
  return (
    <div className={clsx('ui-toolcraft-control-section', className)}>
      {title ? <strong>{title}</strong> : null}
      {children}
    </div>
  );
}

export interface ToolcraftSegmentedOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  indicatorColor?: string;
  disabled?: boolean;
}

export interface ToolcraftSegmentedControlProps {
  label: ReactNode;
  value: string;
  options: readonly ToolcraftSegmentedOption[];
  onValueChange: (value: string) => void;
  className?: string;
  compact?: boolean;
}

export function ToolcraftSegmentedControl({
  label,
  value,
  options,
  onValueChange,
  className,
  compact = false
}: ToolcraftSegmentedControlProps) {
  return (
    <div
      className={clsx(
        'ui-toolcraft-segmented-field',
        compact && 'ui-toolcraft-segmented-field--compact',
        className
      )}
    >
      <span className="ui-toolcraft-control-label">{label}</span>
      <div className="ui-toolcraft-segmented" role="radiogroup" aria-label={String(label)}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={option.disabled}
              className={clsx(
                'ui-toolcraft-segmented__item',
                selected && 'ui-toolcraft-segmented__item--selected'
              )}
              onClick={() => onValueChange(option.value)}
            >
              {option.indicatorColor ? (
                <span
                  className="ui-toolcraft-segmented__dot"
                  style={{ backgroundColor: option.indicatorColor }}
                  aria-hidden="true"
                />
              ) : null}
              <span className="ui-toolcraft-segmented__text">
                <strong>{option.label}</strong>
                {option.description ? <small>{option.description}</small> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface ToolcraftSliderControlProps {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onValueChange: (value: number) => void;
  className?: string;
}

export function ToolcraftSliderControl({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onValueChange,
  className
}: ToolcraftSliderControlProps) {
  return (
    <label className={clsx('ui-toolcraft-slider', className)}>
      <span className="ui-toolcraft-slider__head">
        <span className="ui-toolcraft-control-label">{label}</span>
        <output>{`${value}${unit}`}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onValueChange(Number(event.target.value))}
      />
    </label>
  );
}

export interface ToolcraftFloatingToolbarProps
  extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function ToolcraftFloatingToolbar({
  children,
  className,
  ...props
}: ToolcraftFloatingToolbarProps) {
  return (
    <div className={clsx('ui-toolcraft-floating-toolbar', className)} {...props}>
      {children}
    </div>
  );
}

export type ToolcraftActionButtonTone =
  | 'neutral'
  | 'accent'
  | 'warning'
  | 'selected';

export interface ToolcraftActionButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
  tone?: ToolcraftActionButtonTone;
  square?: boolean;
}

export const ToolcraftActionButton = forwardRef<
  HTMLButtonElement,
  ToolcraftActionButtonProps
>(
  (
    {
      icon,
      tone = 'neutral',
      square = false,
      className,
      children,
      type = 'button',
      ...props
    },
    ref
  ) => (
    <button
      ref={ref}
      type={type}
      className={clsx(
        'ui-toolcraft-action',
        `ui-toolcraft-action--${tone}`,
        square && 'ui-toolcraft-action--square',
        className
      )}
      {...props}
    >
      {icon ? (
        <span className="ui-toolcraft-action__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children ? (
        <span className="ui-toolcraft-action__label">{children}</span>
      ) : null}
    </button>
  )
);

ToolcraftActionButton.displayName = 'ToolcraftActionButton';
