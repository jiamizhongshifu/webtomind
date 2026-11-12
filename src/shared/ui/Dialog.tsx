import { useId, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel
} from './radix/alert-dialog';
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

/** Guard only callers with unsaved form data, never instant-apply filters. */
export function useUnsavedChanges(
  dirty: boolean,
  onClose: () => void,
  busy = false
) {
  const { i18n } = useTranslation();
  const en = i18n?.language?.startsWith('en') ?? false;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const closeTrigger = useRef<HTMLElement | null>(null);
  const [confirmationZ, setConfirmationZ] = useState(200);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
  const requestClose = () => {
    if (busy) return;
    if (dirty) {
      closeTrigger.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      let z = 199;
      for (
        let element = closeTrigger.current;
        element;
        element = element.parentElement
      ) {
        const value = Number.parseInt(
          window.getComputedStyle(element).zIndex,
          10
        );
        if (Number.isFinite(value)) z = Math.max(z, value);
      }
      setConfirmationZ(z + 1);
      setConfirmOpen(true);
    } else onClose();
  };
  const discardConfirmation = (
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent
        style={{ zIndex: confirmationZ }}
        overlayStyle={{ zIndex: confirmationZ }}
        onCloseAutoFocus={(event) => {
          if (closeTrigger.current?.isConnected) {
            event.preventDefault();
            closeTrigger.current.focus({ preventScroll: true });
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {en ? 'Discard unsaved changes?' : '放弃未保存的更改？'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {en
              ? 'Your unsaved changes will be lost.'
              : '未保存的更改将丢失，无法撤销。'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {en ? 'Keep editing' : '继续编辑'}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setConfirmOpen(false);
              onClose();
            }}
          >
            {en ? 'Discard changes' : '放弃更改'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return { requestClose, discardConfirmation };
}
