import {
  Heart,
  Loader2,
  MoreHorizontal,
  PencilLine,
  Wand2
} from 'lucide-react';
import { ActionSheet, Button, IconButton } from '@/shared/ui';
import '../../styles/create-gallery-actions.css';

type GalleryActionCallbacks = {
  onReference: () => void;
  onEdit: () => void;
  onFavorite: () => void;
  favorite: boolean;
  favoriteLoading?: boolean;
  referenceLoading?: boolean;
};

type GalleryCardActionControlsProps = GalleryActionCallbacks & {
  onMore: () => void;
};

export function GalleryCardActionControls({
  onReference,
  onEdit,
  onFavorite,
  favorite,
  favoriteLoading = false,
  onMore,
  referenceLoading = false
}: GalleryCardActionControlsProps) {
  return (
    <>
      <div className="create-gallery-actions">
        <IconButton
          type="button"
          variant="ghost"
          size="sm"
          label="作为参考图"
          icon={
            referenceLoading ? (
              <Loader2 className="creator-spin-icon" />
            ) : (
              <Wand2 />
            )
          }
          onClick={(event) => {
            event.stopPropagation();
            onReference();
          }}
          disabled={referenceLoading}
        />
        <IconButton
          type="button"
          variant="ghost"
          size="sm"
          label="继续编辑"
          icon={<PencilLine />}
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
        />
        <IconButton
          type="button"
          variant="ghost"
          size="sm"
          label={favorite ? '取消收藏' : '加入收藏'}
          icon={
            favoriteLoading ? (
              <Loader2 className="creator-spin-icon" />
            ) : (
              <Heart fill={favorite ? 'currentColor' : 'none'} />
            )
          }
          onClick={(event) => {
            event.stopPropagation();
            onFavorite();
          }}
          disabled={favoriteLoading}
        />
      </div>
      <IconButton
        type="button"
        variant="ghost"
        size="md"
        className="create-gallery-more-button"
        label="更多操作"
        icon={<MoreHorizontal />}
        onClick={(event) => {
          event.stopPropagation();
          onMore();
        }}
      />
    </>
  );
}

type GalleryActionSheetProps = GalleryActionCallbacks & {
  open: boolean;
  onClose: () => void;
};

export function GalleryActionSheet({
  open,
  onClose,
  onReference,
  onEdit,
  onFavorite,
  favorite,
  favoriteLoading = false,
  referenceLoading = false
}: GalleryActionSheetProps) {
  const runAndClose = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <ActionSheet
      open={open}
      title="更多操作"
      ariaLabel="图片资产操作"
      closeLabel="关闭"
      className="create-gallery-action-sheet"
      onClose={onClose}
    >
      <Button
        type="button"
        variant="ghost"
        leadingIcon={
          referenceLoading ? (
            <Loader2 className="creator-spin-icon" />
          ) : (
            <Wand2 />
          )
        }
        onClick={() => runAndClose(onReference)}
        disabled={referenceLoading}
      >
        作为参考图
      </Button>
      <Button
        type="button"
        variant="ghost"
        leadingIcon={<PencilLine />}
        onClick={() => runAndClose(onEdit)}
      >
        继续编辑
      </Button>
      <Button
        type="button"
        variant="ghost"
        leadingIcon={
          favoriteLoading ? (
            <Loader2 className="creator-spin-icon" />
          ) : (
            <Heart fill={favorite ? 'currentColor' : 'none'} />
          )
        }
        onClick={() => runAndClose(onFavorite)}
        disabled={favoriteLoading}
      >
        {favorite ? '取消收藏' : '加入收藏'}
      </Button>
    </ActionSheet>
  );
}
