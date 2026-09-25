import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ElementType,
  type HTMLAttributes,
  type ReactNode
} from 'react';
import { clsx } from 'clsx';

export type NavigationVariant =
  | 'plain'
  | 'marketing'
  | 'product'
  | 'mobile'
  | 'rail';

export type NavigationDensity = 'compact' | 'normal' | 'spacious';

export interface NavigationProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  variant?: NavigationVariant;
  orientation?: 'horizontal' | 'vertical';
  density?: NavigationDensity;
}

export const Navigation = forwardRef<HTMLElement, NavigationProps>(
  (
    {
      as,
      variant = 'plain',
      orientation = 'horizontal',
      density = 'normal',
      className,
      ...props
    },
    ref
  ) => {
    const Component = as || 'nav';

    return (
      <Component
        ref={ref}
        className={clsx(
          'ui-navigation',
          `ui-navigation--${variant}`,
          `ui-navigation--${orientation}`,
          `ui-navigation--${density}`,
          className
        )}
        {...props}
      />
    );
  }
);

Navigation.displayName = 'Navigation';

export interface NavigationListProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
}

export const NavigationList = forwardRef<HTMLElement, NavigationListProps>(
  ({ as, className, ...props }, ref) => {
    const Component = as || 'div';

    return (
      <Component
        ref={ref}
        className={clsx('ui-navigation-list', className)}
        {...props}
      />
    );
  }
);

NavigationList.displayName = 'NavigationList';

export interface NavigationLinkProps
  extends AnchorHTMLAttributes<HTMLAnchorElement> {
  as?: ElementType;
  to?: string;
  isActive?: boolean;
  icon?: ReactNode;
  badge?: ReactNode;
  ariaCurrent?: 'page' | 'step' | 'location' | 'date' | 'time' | true | false;
}

export const NavigationLink = forwardRef<HTMLElement, NavigationLinkProps>(
  (
    {
      as,
      className,
      children,
      isActive = false,
      icon,
      badge,
      ariaCurrent = 'page',
      ...props
    },
    ref
  ) => {
    const Component = as || 'a';
    const currentValue =
      isActive && ariaCurrent !== false ? ariaCurrent : undefined;

    return (
      <Component
        ref={ref}
        className={clsx(
          'ui-navigation-link',
          isActive && 'active',
          isActive && 'ui-navigation-link--active',
          className
        )}
        aria-current={currentValue}
        {...props}
      >
        {icon && (
          <span className="ui-navigation-link__icon" aria-hidden="true">
            {icon}
          </span>
        )}
        {children}
        {badge && <span className="ui-navigation-link__badge">{badge}</span>}
      </Component>
    );
  }
);

NavigationLink.displayName = 'NavigationLink';
