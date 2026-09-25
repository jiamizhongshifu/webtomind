import { Sparkles } from 'lucide-react';
import type { ImageStudioStarterCase } from './useImageStudioStarterCases';
import { getOptimizedPromptCaseImageUrl } from '@/utils/prompt-case';

interface RecipePresetGalleryProps {
  cases: ImageStudioStarterCase[];
  loading?: boolean;
  activeRecipeId?: string;
  onPreview: (prompt: string | null) => void;
  onCommit: (recipe: ImageStudioStarterCase) => void;
}

export function RecipePresetGallery({
  cases,
  loading = false,
  activeRecipeId,
  onPreview,
  onCommit
}: RecipePresetGalleryProps) {
  return (
    <section
      className="recipe-preset-gallery"
      aria-labelledby="recipe-preset-title"
      aria-describedby="recipe-preset-description"
    >
      <header>
        <span className="recipe-preset-heading-icon" aria-hidden="true">
          <Sparkles />
        </span>
        <div>
          <span className="recipe-preset-eyebrow">从一句描述开始</span>
          <h2 id="recipe-preset-title">创作你的第一张图</h2>
          <p id="recipe-preset-description">
            {loading || cases.length > 0
              ? '在下方描述画面，或先选一个示例作为起点。'
              : '在下方描述画面，我们会把它变成可继续修改的商业图。'}
          </p>
        </div>
      </header>
      {loading || cases.length > 0 ? (
        <div
          className="recipe-preset-track"
          aria-label="创作示例"
          aria-busy={loading}
        >
          {loading
            ? Array.from({ length: 4 }, (_, index) => (
                <span
                  key={`starter-case-skeleton-${index}`}
                  className="recipe-preset-card recipe-preset-skeleton"
                  aria-hidden="true"
                />
              ))
            : cases.map((recipe, index) => (
                <button
                  key={recipe.id}
                  type="button"
                  className="recipe-preset-card"
                  data-active={activeRecipeId === recipe.id ? 'true' : 'false'}
                  aria-pressed={activeRecipeId === recipe.id}
                  aria-label={`应用案例：${recipe.title}`}
                  onMouseEnter={() => onPreview(recipe.prompt)}
                  onMouseLeave={() => onPreview(null)}
                  onFocus={() => onPreview(recipe.prompt)}
                  onBlur={() => onPreview(null)}
                  onClick={() => onCommit(recipe)}
                >
                  <span className="recipe-preset-media" aria-hidden="true">
                    {recipe.imageUrls.slice(0, 1).map((imageUrl) => (
                      <img
                        key={imageUrl}
                        src={getOptimizedPromptCaseImageUrl(imageUrl, {
                          width: 320,
                          quality: 72
                        })}
                        alt=""
                        loading={index === 0 ? 'eager' : 'lazy'}
                        {...{
                          fetchpriority: index === 0 ? 'high' : 'auto'
                        }}
                        decoding="async"
                      />
                    ))}
                  </span>
                  <span className="recipe-preset-copy">
                    <strong>{recipe.title}</strong>
                    <small>{recipe.subtitle}</small>
                  </span>
                  {activeRecipeId === recipe.id ? (
                    <span className="recipe-preset-applied">已应用</span>
                  ) : null}
                </button>
              ))}
        </div>
      ) : null}
    </section>
  );
}
