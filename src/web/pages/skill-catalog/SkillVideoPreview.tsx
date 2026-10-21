import { useCallback, useEffect, useRef, useState } from 'react';

/** A poster costs one image request. Video bytes are requested only on intent. */
export function SkillVideoPreview({
  src,
  poster,
  name,
  isZh,
  hovered
}: {
  src: string;
  poster: string;
  name: string;
  isZh: boolean;
  hovered: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const wanted = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const stop = useCallback(() => {
    wanted.current = false;
    video.current?.pause();
    setPlaying(false);
  }, []);
  const play = useCallback(async () => {
    const el = video.current;
    if (!el) return;
    wanted.current = true;
    setFailed(false);
    if (el.getAttribute('src') !== src) el.src = src;
    else if (el.error) el.load();
    try {
      await el.play();
      if (!wanted.current) el.pause();
    } catch {
      if (wanted.current) {
        wanted.current = false;
        setFailed(true);
        setPlaying(false);
      }
    }
  }, [src]);
  useEffect(() => {
    if (!hovered) stop();
    else if (!matchMedia('(prefers-reduced-motion: reduce)').matches) void play();
  }, [hovered, play, stop]);
  useEffect(() => {
    const el = video.current;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) stop();
    });
    if (root.current) observer.observe(root.current);
    const hide = () => {
      if (document.hidden) stop();
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      wanted.current = false;
      el?.pause();
      observer.disconnect();
      document.removeEventListener('visibilitychange', hide);
    };
  }, [stop]);
  return (
    <div
      ref={root}
      className={`skill-video-preview ${playing ? 'is-playing' : ''}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) stop();
      }}
    >
      <video
        ref={video}
        poster={poster}
        preload="none"
        muted
        loop
        playsInline
        aria-label={isZh ? `${name} 功能演示` : `${name} demo`}
        onPlaying={() => {
          if (wanted.current) setPlaying(true);
          else video.current?.pause();
        }}
        onPause={() => setPlaying(false)}
        onError={() => {
          stop();
          setFailed(true);
        }}
      />
      <button
        type="button"
        className="skill-preview-toggle"
        aria-label={
          playing
            ? isZh
              ? `暂停 ${name} 演示`
              : `Pause ${name} preview`
            : isZh
              ? `播放 ${name} 演示`
              : `Play ${name} preview`
        }
        aria-pressed={playing}
        onClick={() => {
          if (playing || wanted.current) stop();
          else void play();
        }}
      >
        <span aria-hidden="true">{playing ? 'Ⅱ' : '▶'}</span>{' '}
        {playing ? (isZh ? '暂停' : 'Pause') : isZh ? '预览' : 'Preview'}
      </button>
      {failed ? (
        <span className="skill-preview-error" role="status">
          {isZh
            ? '视频暂不可用，可重试或查看详情'
            : 'Preview unavailable. Retry or open details.'}
        </span>
      ) : null}
    </div>
  );
}
