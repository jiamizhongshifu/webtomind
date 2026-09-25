import { useTranslation } from 'react-i18next';
import { Folder } from 'lucide-react';
import type { Project } from '@/services/workspace-api';
import { Button } from '@/shared/ui/radix/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/shared/ui/radix/dialog';

interface HistoryAddToProjectModalProps {
  open: boolean;
  projects: Project[];
  loading: boolean;
  savingId: string | null;
  error: string;
  onClose: () => void;
  onSave: (project: Project) => void;
}

export function HistoryAddToProjectModal({
  open,
  projects,
  loading,
  savingId,
  error,
  onClose,
  onSave
}: HistoryAddToProjectModalProps) {
  const { t } = useTranslation('imageCreate');

  const closeDisabled = Boolean(savingId);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !closeDisabled) onClose();
      }}
    >
      <DialogContent
        className="creator-project-picker gap-0 border-0 p-0"
        onEscapeKeyDown={(event) => {
          if (closeDisabled) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (closeDisabled) event.preventDefault();
        }}
      >
        <DialogHeader className="creator-project-picker-head">
          <div>
            <DialogTitle asChild>
              <h2>{t('preview.addToProject')}</h2>
            </DialogTitle>
            <DialogDescription asChild>
              <p>{t('preview.addToProjectHint')}</p>
            </DialogDescription>
          </div>
        </DialogHeader>
        <div className="creator-project-picker-body">
          {loading ? (
            <div className="creator-project-picker-empty">
              {t('preview.addToProjectLoading')}
            </div>
          ) : projects.length > 0 ? (
            projects.map((project) => (
              <Button
                key={project.id}
                type="button"
                variant="ghost"
                className="creator-project-picker-item"
                disabled={Boolean(savingId)}
                onClick={() => onSave(project)}
              >
                <span className="creator-project-picker-icon">
                  {project.icon || <Folder size={16} aria-hidden="true" />}
                </span>
                <span className="creator-project-picker-copy">
                  <strong>
                    {project.name || t('preview.untitledProject')}
                  </strong>
                  <small>
                    {t('preview.addToProjectCardCount', {
                      count: project.summaryCount || 0
                    })}
                  </small>
                </span>
                {savingId === project.id && (
                  <span className="creator-project-picker-saving">
                    {t('preview.addToProjectSaving')}
                  </span>
                )}
              </Button>
            ))
          ) : (
            <div className="creator-project-picker-empty">
              {t('preview.addToProjectNoProjects')}
            </div>
          )}
          {error && <p className="creator-project-picker-error">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
