import { Wand2 } from 'lucide-react';
import { Button, ButtonLink } from '@/shared/ui';
import { AssetThumb } from './AssetThumb';
import type { ResolvedVisualRecipeAsset } from './assetLibraryResolver';
import { useHorizontalDragScroll } from './useHorizontalDragScroll';

interface VisualRecipeSummaryProps {
  assets: ResolvedVisualRecipeAsset[];
  getSlotLabel: (slot: ResolvedVisualRecipeAsset['slot']) => string;
  label: string;
  createLabel?: string;
  onCreateFromRecipe?: () => void;
  createHref?: string;
  createState?: unknown;
  activeAssetId?: string | null;
  onAssetSelect?: (assetId: string) => void;
}

export function VisualRecipeSummary({
  assets,
  getSlotLabel,
  label,
  createLabel,
  onCreateFromRecipe,
  createHref,
  createState,
  activeAssetId,
  onAssetSelect
}: VisualRecipeSummaryProps) {
  const recipeDragScroll = useHorizontalDragScroll<HTMLDivElement>();

  if (assets.length === 0) return null;

  return (
    <section className="creator-preview-recipe-strip" aria-label={label}>
      <div className="creator-preview-recipe-head">
        <span>{label}</span>
        {createLabel && createHref ? (
          <ButtonLink
            className="creator-preview-recipe-cta"
            size="sm"
            to={createHref}
            state={createState}
            onClick={onCreateFromRecipe}
            leadingIcon={<Wand2 data-icon="inline-start" />}
          >
            {createLabel}
          </ButtonLink>
        ) : createLabel && onCreateFromRecipe ? (
          <Button
            type="button"
            className="creator-preview-recipe-cta"
            size="sm"
            onClick={onCreateFromRecipe}
            leadingIcon={<Wand2 data-icon="inline-start" />}
          >
            {createLabel}
          </Button>
        ) : (
          <small>{assets.length}</small>
        )}
      </div>
      <div
        ref={recipeDragScroll.ref}
        className="creator-preview-recipe-row"
        role="group"
        aria-label={`${label} · ${assets.length}`}
        {...recipeDragScroll.dragScrollProps}
      >
        {assets.map(({ slot, asset }) => {
          const content = (
            <>
              <AssetThumb asset={asset} />
              <span>
                <small>{getSlotLabel(slot)}</small>
                <strong>{asset.title}</strong>
              </span>
            </>
          );

          return onAssetSelect ? (
            <button
              key={`${slot}:${asset.id}`}
              type="button"
              className={
                activeAssetId === asset.id
                  ? 'creator-preview-recipe-chip active'
                  : 'creator-preview-recipe-chip'
              }
              aria-pressed={activeAssetId === asset.id}
              onClick={() => onAssetSelect(asset.id)}
            >
              {content}
            </button>
          ) : (
            <article
              key={`${slot}:${asset.id}`}
              className="creator-preview-recipe-chip is-static"
            >
              {content}
            </article>
          );
        })}
      </div>
    </section>
  );
}
