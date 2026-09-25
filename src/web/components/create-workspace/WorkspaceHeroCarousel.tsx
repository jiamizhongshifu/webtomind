import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';
import useEmblaCarousel from 'embla-carousel-react';
import { IconButton } from '@/shared/ui';
import { imageFetchPriority } from '@/shared/ui/imageAttributes';

export interface WorkspaceHeroSlide {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  imageUrl?: string;
  videoUrl?: string;
  href: string;
  cta: string;
  tone: 'clay' | 'ink' | 'sage';
}

export function WorkspaceHeroCarousel({
  slides
}: {
  slides: WorkspaceHeroSlide[];
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: slides.length > 1,
    align: 'start'
  });
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateControls = useCallback(() => {
    if (!emblaApi) return;
    setCanPrev(emblaApi.canScrollPrev());
    setCanNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    updateControls();
    emblaApi.on('select', updateControls);
    emblaApi.on('reInit', updateControls);
    return () => {
      emblaApi.off('select', updateControls);
      emblaApi.off('reInit', updateControls);
    };
  }, [emblaApi, updateControls]);

  if (slides.length === 0) return null;
  return (
    <section
      className="create-v2-hero"
      aria-roledescription="carousel"
      aria-label="创作功能推荐"
    >
      <div className="embla embla--hero" ref={emblaRef}>
        <div className="embla__container">
          {slides.map((slide) => (
            <div
              key={slide.id}
              className={`embla__slide create-v2-hero-media is-${slide.tone}`}
            >
              <Link
                to={slide.href}
                className="create-v2-hero-media-link"
                aria-label={slide.title}
              >
                {slide.videoUrl ? (
                  <video
                    key={slide.videoUrl}
                    src={slide.videoUrl}
                    muted
                    loop
                    autoPlay
                    playsInline
                    preload="metadata"
                  />
                ) : slide.imageUrl ? (
                  <img
                    src={slide.imageUrl}
                    alt=""
                    decoding="async"
                    {...imageFetchPriority('high')}
                  />
                ) : null}
                <span className="create-v2-hero-scrim" aria-hidden="true" />
                <span className="create-v2-hero-copy">
                  <span className="create-v2-hero-eyebrow">
                    {slide.eyebrow}
                  </span>
                  <strong className="create-v2-hero-title">
                    {slide.title}
                  </strong>
                  <span className="create-v2-hero-description">
                    {slide.description}
                  </span>
                  <span className="create-v2-hero-cta">
                    {slide.cta}
                    <ArrowUpRight aria-hidden="true" />
                  </span>
                </span>
              </Link>
            </div>
          ))}
        </div>
      </div>
      {slides.length > 1 ? (
        <div className="create-v2-hero-controls">
          <IconButton
            label="上一个推荐"
            variant="ghost"
            size="md"
            disabled={!canPrev}
            icon={<ChevronLeft />}
            onClick={() => emblaApi?.scrollPrev()}
          />
          <IconButton
            label="下一个推荐"
            variant="ghost"
            size="md"
            disabled={!canNext}
            icon={<ChevronRight />}
            onClick={() => emblaApi?.scrollNext()}
          />
        </div>
      ) : null}
    </section>
  );
}
