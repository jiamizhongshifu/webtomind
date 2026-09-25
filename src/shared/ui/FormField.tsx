import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';
import { FieldMessage } from './FieldMessage';

export interface FormFieldProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  helpText?: ReactNode;
  errorText?: ReactNode;
}

export const FormField = forwardRef<HTMLDivElement, FormFieldProps>(
  (
    {
      label,
      htmlFor,
      required = false,
      helpText,
      errorText,
      className,
      children,
      ...props
    },
    ref
  ) => (
    <div ref={ref} className={clsx('ui-form-field', className)} {...props}>
      <label className="ui-label" htmlFor={htmlFor}>
        <span>{label}</span>
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children}
      {errorText ? (
        <FieldMessage tone="error">{errorText}</FieldMessage>
      ) : helpText ? (
        <FieldMessage>{helpText}</FieldMessage>
      ) : null}
    </div>
  )
);

FormField.displayName = 'FormField';
