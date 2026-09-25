import { useTranslation } from 'react-i18next';
import { ClipboardPaste, Loader2, Sparkles } from 'lucide-react';
import { Button, Textarea } from '@/shared/ui';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/shared/ui/radix/dialog';
import { Field, FieldError } from '@/shared/ui/radix/field';

export interface PromptImportModalProps {
  value: string;
  analyzing: boolean;
  error: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

export function PromptImportModal({
  value,
  analyzing,
  error,
  onChange,
  onCancel,
  onSubmit
}: PromptImportModalProps) {
  const { t } = useTranslation('imageCreate');

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !analyzing) onCancel();
      }}
    >
      <DialogContent
        className="creator-preview creator-prompt-import-modal"
        onEscapeKeyDown={(event) => {
          if (analyzing) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (analyzing) event.preventDefault();
        }}
      >
        <DialogHeader className="creator-preview-head">
          <DialogTitle>{t('upload.promptImportTitle')}</DialogTitle>
        </DialogHeader>
        <div className="creator-prompt-import-body">
          <div className="creator-prompt-import-hint">
            <ClipboardPaste size={18} />
            <p>{t('upload.promptImportHint')}</p>
          </div>
          <Field data-invalid={Boolean(error)}>
            <Textarea
              value={value}
              placeholder={t('upload.promptImportPlaceholder') as string}
              onChange={(event) => onChange(event.target.value)}
              disabled={analyzing}
              aria-invalid={Boolean(error)}
            />
            <FieldError>{error}</FieldError>
          </Field>
          <DialogFooter className="creator-preview-actions creator-upload-actions">
            <Button
              type="button"
              variant="outline"
              className="creator-upload-cancel"
              onClick={onCancel}
              disabled={analyzing}
            >
              {t('upload.cancel')}
            </Button>
            <Button
              className="creator-preview-reedit"
              size="sm"
              onClick={onSubmit}
              disabled={analyzing}
              leadingIcon={
                analyzing ? (
                  <Loader2 className="creator-spin-icon" />
                ) : (
                  <Sparkles />
                )
              }
            >
              {analyzing
                ? t('upload.promptImportAnalyzing')
                : t('upload.promptImportSubmit')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
