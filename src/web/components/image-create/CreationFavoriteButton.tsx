import { Heart, Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/radix/button';

export function CreationFavoriteButton({
  favorite,
  loading = false,
  disabled = false,
  favoriteLabel = '加入收藏',
  unfavoriteLabel = '取消收藏',
  onClick
}: {
  favorite: boolean;
  loading?: boolean;
  disabled?: boolean;
  favoriteLabel?: string;
  unfavoriteLabel?: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="creator-preview-add-project creator-preview-header-favorite"
      aria-pressed={favorite}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading ? (
        <Loader2 data-icon="inline-start" className="creator-spin-icon" />
      ) : (
        <Heart
          data-icon="inline-start"
          fill={favorite ? 'currentColor' : 'none'}
        />
      )}
      {favorite ? unfavoriteLabel : favoriteLabel}
    </Button>
  );
}
