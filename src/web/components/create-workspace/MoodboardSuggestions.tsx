import { Plus, RefreshCw } from 'lucide-react';
import type { DiscoveryImage } from '@/services/create-workspace-v2-api';
import { Button, SearchField } from '@/shared/ui';
import { VisualMasonry } from './VisualMasonry';

interface MoodboardSuggestionsProps {
  images: DiscoveryImage[];
  query: string;
  isEnglish: boolean;
  loading: boolean;
  busy: string;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onRefresh: () => void;
  onAdd: (image: DiscoveryImage) => void;
}

export function MoodboardSuggestions({
  images,
  query,
  isEnglish,
  loading,
  busy,
  onQueryChange,
  onSearch,
  onRefresh,
  onAdd
}: MoodboardSuggestionsProps) {
  return (
    <section className="moodboard-suggestions">
      <header>
        <h2>{isEnglish ? 'Add suggested images' : '添加推荐图片'}</h2>
        <div className="moodboard-suggestions-tools">
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={<RefreshCw />}
            disabled={loading}
            onClick={onRefresh}
          >
            {isEnglish ? 'Refresh' : '刷新'}
          </Button>
          <form
            className="moodboard-suggestions-search"
            onSubmit={(event) => {
              event.preventDefault();
              onSearch();
            }}
          >
            <SearchField
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onClear={() => onQueryChange('')}
              placeholder={
                isEnglish ? 'Search suggested images' : '搜索推荐图片'
              }
              aria-label={
                isEnglish ? 'Search suggested images' : '搜索推荐图片'
              }
            />
          </form>
        </div>
      </header>
      {loading && images.length === 0 ? (
        <div className="moodboard-suggestions-empty" aria-busy="true">
          {isEnglish ? 'Finding visual matches…' : '正在寻找视觉匹配素材…'}
        </div>
      ) : images.length > 0 ? (
        <VisualMasonry
          className="moodboard-suggestions-grid"
          aria-label={isEnglish ? 'Suggested images' : '推荐图片'}
        >
          {images.map((image) => (
            <button
              key={`${image.kind}:${image.id}`}
              type="button"
              disabled={Boolean(busy)}
              aria-label={
                isEnglish ? `Add ${image.title}` : `添加 ${image.title}`
              }
              onClick={() => onAdd(image)}
            >
              <img
                src={image.imageUrl}
                alt={image.title}
                loading="lazy"
                decoding="async"
              />
              <span aria-hidden="true">
                <Plus />
              </span>
            </button>
          ))}
        </VisualMasonry>
      ) : (
        <div className="moodboard-suggestions-empty">
          {isEnglish
            ? 'No matching suggestions. Try a broader visual keyword.'
            : '暂无匹配素材，可以尝试更宽泛的视觉关键词。'}
        </div>
      )}
    </section>
  );
}
