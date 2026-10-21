import { useEffect, useRef, useState } from 'react';

/** Load and loop visible cards automatically; pause offscreen or in hidden tabs. */
export function SkillVideoPreview({
  src,
  poster,
  name,
  isZh
}: {
  src: string;
  poster: string;
  name: string;
  isZh: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    let visible = false;
    let disposed = false;
    const syncPlayback = () => {
      if (!visible || document.hidden) {
        el.pause();
        return;
      }
      setFailed(false);
      el.muted = true;
      if (el.getAttribute('src') !== src) el.src = src;
      else if (el.error) el.load();
      void el
        .play()
        .then(() => {
          if (disposed || !visible || document.hidden) el.pause();
        })
        .catch(() => {
          if (!disposed && visible && !document.hidden) setFailed(true);
        });
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncPlayback();
    });
    if (root.current) observer.observe(root.current);
    document.addEventListener('visibilitychange', syncPlayback);
    return () => {
      disposed = true;
      el.pause();
      observer.disconnect();
      document.removeEventListener('visibilitychange', syncPlayback);
    };
  }, [src]);
  return (
    <div ref={root} className="skill-video-preview">
      <video
        ref={video}
        poster={poster}
        preload="none"
        autoPlay
        muted
        loop
        playsInline
        aria-label={isZh ? `${name} 功能演示` : `${name} demo`}
        onError={() => setFailed(true)}
      />
      {failed ? (
        <span className="skill-preview-error" role="status">
          {isZh
            ? '视频暂不可用，请查看详情'
            : 'Preview unavailable. Open details.'}
        </span>
      ) : null}
    </div>
  );
}
