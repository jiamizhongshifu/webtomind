import { X } from 'lucide-react';
import { Button } from '@/shared/ui/radix/button';
import { DialogContent, DialogRoot } from '@/shared/ui/DialogPrimitives';
import type { ImageCreatorRecipe } from '@/services/agent-api';
import type {
  ImageCharacterCard,
  ImageCharacterReferenceGroup,
  ImageConsistencyCheckResult
} from '@/shared/image-reference-types';
import { ReferenceCharacterWorkflowPanel } from './ReferenceCharacterWorkflowPanel';

interface ImageCreateCharacterWorkflowModalProps {
  ariaLabel: string;
  title: string;
  hint: string;
  closeLabel: string;
  isAuthenticated: boolean;
  selectedReferenceIds: string[];
  selectedCharacterIds: string[];
  onSelectedReferenceIdsChange: (ids: string[]) => void;
  onSelectedCharacterIdsChange: (ids: string[]) => void;
  onSelectedCharactersChange: (characters: ImageCharacterCard[]) => void;
  onRequireLogin: () => void;
  setError: (message: string) => void;
  setStatusText: (message: string) => void;
  onClose: () => void;
  onCharacterCreated: () => void;
  canCheckConsistency: boolean;
  consistencyChecking: boolean;
  consistencyResult: ImageConsistencyCheckResult | null;
  onCheckConsistency: () => void;
  onUseRepairPrompt: (repairPrompt: string) => void;
  settings: Record<string, unknown>;
  selection: Record<string, unknown>;
  currentCharacterReferenceGroups: ImageCharacterReferenceGroup[];
  currentPrompt: string;
  currentNegativePrompt: string;
  onApplyRecipe: (recipe: ImageCreatorRecipe) => void;
  onRunRecipe: (recipe: ImageCreatorRecipe) => void;
}

export function ImageCreateCharacterWorkflowModal({
  ariaLabel,
  title,
  hint,
  closeLabel,
  isAuthenticated,
  selectedReferenceIds,
  selectedCharacterIds,
  onSelectedReferenceIdsChange,
  onSelectedCharacterIdsChange,
  onSelectedCharactersChange,
  onRequireLogin,
  setError,
  setStatusText,
  onClose,
  onCharacterCreated,
  canCheckConsistency,
  consistencyChecking,
  consistencyResult,
  onCheckConsistency,
  onUseRepairPrompt,
  settings,
  selection,
  currentCharacterReferenceGroups,
  currentPrompt,
  currentNegativePrompt,
  onApplyRecipe,
  onRunRecipe
}: ImageCreateCharacterWorkflowModalProps) {
  return (
    <DialogRoot
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        placement="right"
        aria-label={ariaLabel}
        overlayClassName="!bg-[rgba(20,18,16,0.42)]"
        className="creator-character-modal !h-dvh !max-h-dvh !w-[min(720px,100vw)] !gap-0 !rounded-none !border-y-0 !border-r-0 !p-0 !shadow-none max-sm:!w-screen"
      >
        <div className="creator-character-modal-head">
          <div>
            <span>{title}</span>
            <small>{hint}</small>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onClose}
            aria-label={closeLabel}
          >
            <X />
          </Button>
        </div>
        <ReferenceCharacterWorkflowPanel
          isAuthenticated={isAuthenticated}
          onRequireLogin={onRequireLogin}
          selectedReferenceIds={selectedReferenceIds}
          selectedCharacterIds={selectedCharacterIds}
          onSelectedReferenceIdsChange={onSelectedReferenceIdsChange}
          onSelectedCharacterIdsChange={onSelectedCharacterIdsChange}
          onSelectedCharactersChange={onSelectedCharactersChange}
          setError={setError}
          setStatusText={setStatusText}
          onCharacterCreated={onCharacterCreated}
          canCheckConsistency={canCheckConsistency}
          consistencyChecking={consistencyChecking}
          consistencyResult={consistencyResult}
          onCheckConsistency={onCheckConsistency}
          onUseRepairPrompt={onUseRepairPrompt}
          settings={settings}
          selection={selection}
          currentCharacterReferenceGroups={currentCharacterReferenceGroups}
          currentPrompt={currentPrompt}
          currentNegativePrompt={currentNegativePrompt}
          onApplyRecipe={onApplyRecipe}
          onRunRecipe={onRunRecipe}
        />
      </DialogContent>
    </DialogRoot>
  );
}
