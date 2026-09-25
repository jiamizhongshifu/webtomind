import { Images, Search } from 'lucide-react';
import type { DiscoveryImage } from '@/services/create-workspace-v2-api';
import { Button, Dialog, Input } from '@/shared/ui';

interface MoodboardSourcePickerProps {
  open: boolean;
  images: DiscoveryImage[];
  query: string;
  isEnglish: boolean;
  loading: boolean;
  busyImageId?: string;
  personalOnly?: boolean;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onSelect: (image: DiscoveryImage) => void;
  onClose: () => void;
}

export function MoodboardSourcePicker({
  open,
  images,
  query,
  isEnglish,
  loading,
  busyImageId = '',
  personalOnly = false,
  onQueryChange,
  onSearch,
  onSelect,
  onClose
}: MoodboardSourcePickerProps) {
  const visibleImages = personalOnly
    ? images.filter((image) => image.kind === 'gallery')
    : images;

  return (
    <Dialog
      open={open}
      title={
        personalOnly
          ? isEnglish
            ? 'Choose from your assets'
            : '选择我的图片资产'
          : isEnglish
            ? 'Add visual references'
            : '添加视觉参考'
      }
      description={
        personalOnly
          ? isEnglish
            ? 'Choose an image from your own generation history. It will become the first reference in this moodboard.'
            : '从自己的生成记录中选择图片，它会成为这个情绪板的第一张参考图。'
          : isEnglish
            ? 'Search your own generations and the published prompt library. Selecting an image adds it to this moodboard.'
            : '搜索自己的生成记录和已发布的 Prompt 案例；选择图片后会直接加入当前情绪板。'
      }
      closeLabel={isEnglish ? 'Close source picker' : '关闭素材选择器'}
      className="moodboard-source-dialog"
      closeDisabled={Boolean(busyImageId)}
      onClose={onClose}
    >
      <form
        className="moodboard-source-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch();
        }}
      >
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={
            isEnglish
              ? 'Search your images'
              : personalOnly
                ? '搜索我的图片'
                : '搜索提示词、主体或视觉风格'
          }
          aria-label={isEnglish ? 'Search visual sources' : '搜索视觉素材'}
        />
        <Button
          type="submit"
          variant="secondary"
          leadingIcon={<Search />}
          disabled={loading}
        >
          {loading
            ? isEnglish
              ? 'Searching…'
              : '搜索中…'
            : isEnglish
              ? 'Search'
              : '搜索'}
        </Button>
      </form>
      {loading && visibleImages.length === 0 ? (
        <div className="moodboard-source-empty" aria-busy="true">
          {isEnglish ? 'Loading your images…' : '正在加载图片资产…'}
        </div>
      ) : visibleImages.length > 0 ? (
        <div className="moodboard-source-grid">
          {visibleImages.map((image) => (
            <button
              key={`${image.kind}:${image.id}`}
              type="button"
              className="moodboard-source-card"
              disabled={Boolean(busyImageId)}
              aria-label={
                isEnglish ? `Choose ${image.title}` : `选择 ${image.title}`
              }
              onClick={() => onSelect(image)}
            >
              <img
                src={image.imageUrl}
                alt={image.title}
                loading="lazy"
                decoding="async"
              />
              <span>
                <em>
                  {image.kind === 'prompt_case'
                    ? 'Prompt'
                    : isEnglish
                      ? 'Your gallery'
                      : '我的图库'}
                </em>
                <strong>{image.title}</strong>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="moodboard-source-empty">
          <Images />
          <strong>{isEnglish ? 'No matching images' : '没有匹配的图片'}</strong>
          <span>
            {isEnglish
              ? 'Try a broader keyword or upload a local reference instead.'
              : '可以尝试更宽泛的关键词，或直接上传本地参考图。'}
          </span>
        </div>
      )}
    </Dialog>
  );
}
