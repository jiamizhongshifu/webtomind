import { useEffect, useState, type CSSProperties } from 'react';
import { useInView } from 'react-intersection-observer';
import {
  extractDominantImageColor,
  fallbackDiscoveryImageTone
} from '../../lib/discovery-image-presentation';

// 首屏批次错峰：同一帧进入视口的图片按每波 4 张、90ms 间隔挂载，
// 避免刷新时整批图片并发加载造成卡片闪动。
let discoveryImageStagger = 0;

export function DiscoveryMasonryImage({
  imageUrl,
  alt,
  dominantColor,
  width,
  height
}: {
  imageUrl: string;
  alt: string;
  dominantColor?: string;
  width?: number;
  height?: number;
}) {
  const [tone, setTone] = useState(
    () => dominantColor || fallbackDiscoveryImageTone(imageUrl)
  );
  const [loaded, setLoaded] = useState(false);
  // 测试环境（jsdom 无真实布局/网络）同步挂载；生产按视口错峰挂载。
  const [mounted, setMounted] = useState(
    () => import.meta.env.MODE === 'test'
  );
  // 瀑布流分屏加载：进入视口附近才挂载图片，避免刷新时整页图片一次性加载。
  const { ref: inViewRef, inView } = useInView({
    // 激活窗口接近一屏：追加批次时只有即将进入视口的图片挂载，
    // 其余跟随滚动按屏激活，避免一次性大量图片同时加载。
    rootMargin: '200px 0px',
    // 无 IntersectionObserver 的环境（jsdom 测试）视为全部可见。
    fallbackInView: true
  });

  useEffect(() => {
    if (!inView || mounted) return;
    const delay = (discoveryImageStagger++ % 4) * 90;
    const timer = window.setTimeout(() => setMounted(true), delay);
    return () => window.clearTimeout(timer);
  }, [inView, mounted]);

  useEffect(() => {
    setTone(dominantColor || fallbackDiscoveryImageTone(imageUrl));
    setLoaded(false);
  }, [dominantColor, imageUrl]);

  const style = {
    '--discovery-image-tone': tone,
    ...(width && height ? { aspectRatio: `${width} / ${height}` } : {})
  } as CSSProperties;

  return (
    <span
      ref={inViewRef}
      className="discovery-masonry-image"
      style={style}
      data-loaded={loaded ? 'true' : 'false'}
      aria-busy={!loaded}
    >
      <span className="discovery-masonry-image-skeleton" aria-hidden="true" />
      {mounted ? (
        <img
          src={imageUrl}
          alt={alt}
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
          onLoad={(event) => {
            const sampledColor = dominantColor
              ? null
              : extractDominantImageColor(event.currentTarget);
            if (!dominantColor && sampledColor) setTone(sampledColor);
            window.requestAnimationFrame(() => setLoaded(true));
          }}
          onError={() => setLoaded(true)}
        />
      ) : null}
    </span>
  );
}
