import { useEffect, useRef, type RefObject } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/shared/ui/radix/alert-dialog';
import { buttonVariants } from '@/shared/ui/radix/button';
import { cn } from '@/lib/utils';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText: string;
  cancelText: string;
  danger?: boolean;
  loading?: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmText,
  cancelText,
  danger = false,
  loading = false,
  returnFocusRef,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (isOpen)
      previousFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
  }, [isOpen]);
  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !loading) {
          onCancel();
        }
      }}
    >
      <AlertDialogContent
        className="max-w-sm"
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef?.current ?? previousFocus.current;
          if (target?.isConnected) {
            event.preventDefault();
            target.focus();
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelText}</AlertDialogCancel>
          <AlertDialogAction
            className={cn(
              danger
                ? buttonVariants({ variant: 'destructive' })
                : 'bg-foreground text-background hover:bg-foreground/90'
            )}
            disabled={loading}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
