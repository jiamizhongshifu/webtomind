import { useRef, useState } from 'react';
import { pickLocalized, type SkillExample } from '@/services/skill-catalog-api';
import { isVideoExample } from './skillShowcases';

export function SkillPreviewGallery({
  examples,
  locale,
  isZh
}: {
  examples: SkillExample[];
  locale: string;
  isZh: boolean;
}) {
  const [selected, setSelected] = useState(0);
  const [failed, setFailed] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const item = examples[selected] || examples[0];
  if (!item)
    return (
      <div className="skill-gallery-empty">
        {isZh ? '演示正在准备中。' : 'A demonstration is being prepared.'}
      </div>
    );
  const title = pickLocalized(item.title, locale);
  const isVideo = isVideoExample(item);
  return (
    <section
      className="skill-preview-gallery"
      aria-label={isZh ? '案例预览' : 'Preview gallery'}
    >
      <div ref={stage} className="skill-gallery-stage">
        {failed ? (
          <div className="skill-gallery-error" role="status">
            <p>
              {isZh ? '这个预览暂时无法加载。' : 'This preview could not load.'}
            </p>
            <button type="button" onClick={() => setFailed(false)}>
              {isZh ? '重新加载预览' : 'Reload preview'}
            </button>
          </div>
        ) : isVideo ? (
          <video
            key={item.mediaUrl}
            src={item.mediaUrl}
            poster={item.posterUrl || undefined}
            controls
            muted
            playsInline
            preload="metadata"
            onError={() => setFailed(true)}
            aria-label={title}
          />
        ) : (
          <img
            key={item.mediaUrl}
            src={item.mediaUrl}
            alt={title}
            onError={() => setFailed(true)}
          />
        )}
        <button
          className="skill-gallery-expand"
          type="button"
          onClick={() => {
            void stage.current?.requestFullscreen?.().catch(() => {});
          }}
          aria-label={isZh ? '全屏预览' : 'Fullscreen preview'}
        >
          ⛶
        </button>
      </div>
      <p className="skill-gallery-caption">
        {title}
        <span>
          {selected + 1} / {examples.length}
        </span>
      </p>
      <div
        className="skill-gallery-thumbnails"
        role="group"
        aria-label={isZh ? '选择案例' : 'Choose example'}
      >
        {examples.map((example, index) => (
          <button
            key={`${example.mediaUrl}-${index}`}
            type="button"
            aria-pressed={selected === index}
            aria-label={`${isZh ? '查看案例' : 'View example'} ${index + 1}: ${pickLocalized(example.title, locale)}`}
            onClick={() => {
              setSelected(index);
              setFailed(false);
            }}
          >
            {(example.posterUrl || !isVideoExample(example)) && (
              <img
                src={example.posterUrl || example.mediaUrl}
                alt=""
                loading="lazy"
              />
            )}
            <span>
              {isVideoExample(example) ? '▶ Video' : isZh ? '成品' : 'Output'}{' '}
              {index + 1}
            </span>
          </button>
        ))}
      </div>
      {pickLocalized(item.description, locale) ? (
        <p className="skill-muted">{pickLocalized(item.description, locale)}</p>
      ) : null}
    </section>
  );
}
