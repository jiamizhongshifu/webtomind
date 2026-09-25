import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { Search, X } from 'lucide-react';
import { clsx } from 'clsx';
import { IconButton } from './IconButton';

export interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onClear?: () => void;
  clearLabel?: string;
  wrapperClassName?: string;
}

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(
  ({ className, wrapperClassName, value, onClear, clearLabel = 'Clear search', ...props }, ref) => {
    const canClear = Boolean(onClear && value);

    return (
      <div className={clsx('ui-search-field', wrapperClassName)}>
        <Search className="ui-search-field__icon" aria-hidden="true" />
        <input
          ref={ref}
          type="search"
          className={clsx('ui-input', 'ui-input--md', 'ui-search-field__input', className)}
          value={value}
          {...props}
        />
        {canClear ? (
          <IconButton
            type="button"
            variant="ghost"
            size="sm"
            label={clearLabel}
            icon={<X />}
            className="ui-search-field__clear"
            onClick={onClear}
          />
        ) : null}
      </div>
    );
  },
);

SearchField.displayName = 'SearchField';
