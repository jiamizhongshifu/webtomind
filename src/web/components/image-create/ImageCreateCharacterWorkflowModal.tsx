import type { Ref } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/shared/ui/radix/button';
import type { ImageCreatorRecipe } from '@/services/agent-api';
import type {
  ImageCharacterCard,
  ImageCharacterReferenceGroup,
  ImageConsistencyCheckResult
} from '@/shared/image-reference-types';
import { ReferenceCharacterWorkflowPanel } from './ReferenceCharacterWorkflowPanel';

interface ImageCreateCharacterWorkflowModalProps {
  modalRef: Ref<HTMLElement>;
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
  modalRef,
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
    <div
      className="creator-character-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        ref={modalRef}
        className="creator-character-modal"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
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
      </section>
    </div>
  );
}
