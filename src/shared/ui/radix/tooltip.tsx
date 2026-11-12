'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

import { cn } from '@/lib/utils';

const HasTooltipProvider = React.createContext(false);
let closeActiveTextTooltip: (() => void) | null = null;
let textTooltipWarmUntil = 0;
function TooltipProvider({
  children,
  delayDuration = 500,
  skipDelayDuration = 300,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <HasTooltipProvider.Provider value={true}>
      <TooltipPrimitive.Provider
        delayDuration={delayDuration}
        skipDelayDuration={skipDelayDuration}
        {...props}
      >
        {children}
      </TooltipPrimitive.Provider>
    </HasTooltipProvider.Provider>
  );
}
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-[var(--z-product-popover)] overflow-hidden rounded-md bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md [animation-duration:var(--motion-fast)] data-[state=delayed-open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };

/** Text-only enhancement: the child's original action is never intercepted. */
export const TextTooltip = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement> & {
    children: React.ReactElement;
    text?: string;
  }
>(function TextTooltip({ children, text, ...triggerProps }, ref) {
  const hasProvider = React.useContext(HasTooltipProvider);
  const [open, setOpen] = React.useState(false);
  const touch = React.useRef(false);
  const triggerElement = React.useRef<HTMLElement | null>(null);
  const [tooltipZ, setTooltipZ] = React.useState<number>();
  const triggerRef = React.useCallback(
    (node: HTMLElement | null) => {
      triggerElement.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref]
  );
  const closeTooltip = React.useCallback(() => setOpen(false), []);
  const changeOpen = React.useCallback(
    (next: boolean) => {
      if (next) {
        let z =
          Number.parseInt(
            getComputedStyle(document.documentElement).getPropertyValue(
              '--z-product-popover'
            ),
            10
          ) || 90;
        for (
          let element = triggerElement.current;
          element;
          element = element.parentElement
        ) {
          const value = Number.parseInt(getComputedStyle(element).zIndex, 10);
          if (Number.isFinite(value)) z = Math.max(z, value + 1);
        }
        setTooltipZ(z);
        if (closeActiveTextTooltip !== closeTooltip) closeActiveTextTooltip?.();
        closeActiveTextTooltip = closeTooltip;
      } else if (closeActiveTextTooltip === closeTooltip) {
        closeActiveTextTooltip = null;
        textTooltipWarmUntil = Date.now() + 300;
      }
      setOpen(next);
    },
    [closeTooltip]
  );
  React.useEffect(
    () => () => {
      if (closeActiveTextTooltip === closeTooltip)
        closeActiveTextTooltip = null;
    },
    [closeTooltip]
  );
  const child = children as React.ReactElement<
    React.HTMLAttributes<HTMLElement> & { disabled?: boolean; href?: string }
  >;
  const plainText =
    typeof child.type === 'string' &&
    !['button', 'a', 'input', 'select', 'textarea'].includes(child.type);
  const trigger = React.cloneElement(child, {
    title: undefined,
    ...(plainText ? { tabIndex: child.props.tabIndex ?? 0 } : {}),
    onPointerEnter: (event: React.PointerEvent<HTMLElement>) => {
      child.props.onPointerEnter?.(event);
      if (
        event.pointerType !== 'touch' &&
        (closeActiveTextTooltip || Date.now() < textTooltipWarmUntil)
      )
        changeOpen(true);
    },
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      touch.current = event.pointerType === 'touch';
      child.props.onPointerDown?.(event);
    },
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      child.props.onClick?.(event);
      if (touch.current) window.setTimeout(() => changeOpen(true), 0);
    }
  });
  if (!text)
    return (
      <Slot {...triggerProps} ref={triggerRef}>
        {children}
      </Slot>
    );
  const content = (
    <Tooltip open={open} onOpenChange={changeOpen}>
      <TooltipTrigger asChild>
        <Slot {...triggerProps} ref={triggerRef}>
          {child.props.disabled ? (
            <span
              tabIndex={0}
              aria-label={text}
              style={{ display: 'inline-flex', maxWidth: '100%' }}
              onClick={() => window.setTimeout(() => changeOpen(true), 0)}
            >
              {trigger}
            </span>
          ) : (
            trigger
          )}
        </Slot>
      </TooltipTrigger>
      <TooltipContent
        collisionPadding={8}
        style={{
          maxWidth: 'calc(100vw - 16px)',
          overflowWrap: 'anywhere',
          zIndex: tooltipZ
        }}
      >
        {text}
      </TooltipContent>
    </Tooltip>
  );
  return hasProvider ? content : <TooltipProvider>{content}</TooltipProvider>;
});
