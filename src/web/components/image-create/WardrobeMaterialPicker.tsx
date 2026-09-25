import { useState, type CSSProperties } from 'react';
import { Check, Layers3, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/radix/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/shared/ui/radix/popover';
import {
  getWardrobeMaterialPreset,
  wardrobeMaterialFamilies,
  wardrobeMaterialPresets,
  type WardrobeMaterialSlot
} from '../../data/wardrobe-materials';

interface WardrobeMaterialPickerProps {
  slot: WardrobeMaterialSlot;
  slotLabel: string;
  selectedMaterialId?: string;
  disabled?: boolean;
  onChange: (slot: WardrobeMaterialSlot, materialId?: string) => void;
}

export function WardrobeMaterialPicker({
  slot,
  slotLabel,
  selectedMaterialId,
  disabled = false,
  onChange
}: WardrobeMaterialPickerProps) {
  const { t, i18n } = useTranslation('imageCreate');
  const [open, setOpen] = useState(false);
  const isEnglish = i18n.language.toLowerCase().startsWith('en');
  const selectedMaterial = getWardrobeMaterialPreset(selectedMaterialId);
  const triggerLabel = selectedMaterial
    ? t('canvas.materialButtonSelected', {
        slot: slotLabel,
        material: isEnglish ? selectedMaterial.labelEn : selectedMaterial.label
      })
    : t('canvas.materialButton', { slot: slotLabel });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="creator-slot-material"
          data-active={selectedMaterial ? 'true' : 'false'}
          aria-label={triggerLabel as string}
          title={triggerLabel as string}
          disabled={disabled}
          onClick={(event) => event.stopPropagation()}
        >
          <Layers3 size={14} />
          {selectedMaterial && <span aria-hidden="true" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="creator-material-popover"
        side="top"
        align="end"
        sideOffset={8}
        collisionPadding={12}
        aria-label={t('canvas.materialTitle', { slot: slotLabel }) as string}
      >
        <div className="creator-material-popover-head">
          <div>
            <strong>{t('canvas.materialTitle', { slot: slotLabel })}</strong>
            <small>{t('canvas.materialDescription')}</small>
          </div>
          <Layers3 size={17} aria-hidden="true" />
        </div>

        <div className="creator-material-options" role="listbox">
          <button
            type="button"
            className={`creator-material-option${!selectedMaterial ? ' selected' : ''}`}
            role="option"
            aria-selected={!selectedMaterial}
            onClick={() => {
              onChange(slot, undefined);
              setOpen(false);
            }}
          >
            <span className="creator-material-reset-swatch">
              <RotateCcw size={14} />
            </span>
            <span>
              <strong>{t('canvas.materialOriginal')}</strong>
              <small>{t('canvas.materialOriginalDescription')}</small>
            </span>
            {!selectedMaterial && <Check size={15} aria-hidden="true" />}
          </button>

          {wardrobeMaterialFamilies.map((family) => (
            <div
              key={family.id}
              className="creator-material-group"
              role="group"
              aria-label={isEnglish ? family.labelEn : family.label}
            >
              <div className="creator-material-group-label" aria-hidden="true">
                {isEnglish ? family.labelEn : family.label}
              </div>
              {wardrobeMaterialPresets
                .filter((material) => material.family === family.id)
                .map((material) => {
                  const selected = material.id === selectedMaterialId;
                  const style = {
                    '--material-swatch-start': material.swatch[0],
                    '--material-swatch-end': material.swatch[1]
                  } as CSSProperties;
                  return (
                    <button
                      key={material.id}
                      type="button"
                      className={`creator-material-option${selected ? ' selected' : ''}`}
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        onChange(slot, material.id);
                        setOpen(false);
                      }}
                    >
                      <span className="creator-material-swatch" style={style} />
                      <span>
                        <strong>
                          {isEnglish ? material.labelEn : material.label}
                        </strong>
                        <small>
                          {isEnglish
                            ? material.descriptionEn
                            : material.description}
                        </small>
                      </span>
                      {selected && <Check size={15} aria-hidden="true" />}
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
