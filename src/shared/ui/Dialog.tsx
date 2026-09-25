import { useId } from 'react';
import { X } from 'lucide-react';
import { clsx } from 'clsx';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { motionPresets } from '@/design/motion-presets';
import { IconButton } from './IconButton';
import { useOverlayBehavior } from './useOverlayBehavior';

export interface DialogProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
  closeDisabled?: boolean;
  className?: string;
  onClose: () => void;
}

export function Dialog({
  open,
  title,
  description,
  children,
  footer,
  closeLabel = 'Close',
  closeDisabled = false,
  className,
  onClose
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const prefersReducedMotion = useReducedMotion();
  const dialogRef = useOverlayBehavior<HTMLElement>({
    open,
    closeDisabled,
    onClose
  });

  const dialog = (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="ui-dialog-layer"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: motionPresets.reduced.duration }}
        >
          <button
            type="button"
            className="ui-dialog-backdrop"
            aria-label={closeLabel}
            onClick={onClose}
            disabled={closeDisabled}
          />
          <motion.section
            ref={dialogRef}
            className={clsx('ui-dialog', className)}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            initial={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 14, scale: 0.985 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 8, scale: 0.992 }
            }
            transition={
              prefersReducedMotion
                ? { duration: motionPresets.reduced.duration }
                : motionPresets.uiSpring
            }
          >
            <header className="ui-dialog__header">
              <div>
                <h2 id={titleId} className="ui-dialog__title">
                  {title}
                </h2>
                {description ? (
                  <p id={descriptionId} className="ui-dialog__description">
                    {description}
                  </p>
                ) : null}
              </div>
              <IconButton
                type="button"
                variant="ghost"
                label={closeLabel}
                icon={<X />}
                onClick={onClose}
                disabled={closeDisabled}
              />
            </header>
            <div className="ui-dialog__body">{children}</div>
            {footer ? (
              <footer className="ui-dialog__footer">{footer}</footer>
            ) : null}
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') {
    return dialog;
  }

  return createPortal(dialog, document.body);
}
