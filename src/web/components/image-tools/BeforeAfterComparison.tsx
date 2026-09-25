import { Maximize2, Minus, Plus } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from 'react';
import { ReactCompareSlider, styleFitContainer } from 'react-compare-slider';

interface BeforeAfterComparisonProps {
  beforeSrc: string;
  afterSrc: string;
  beforeAlt: string;
  afterAlt: string;
  aspectRatio: number;
  beforeLabel?: string;
  afterLabel?: string;
  instruction?: string;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

function clampZoom(value: number) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}

// Offsets use viewport fractions so the same image region stays visible on resize.
function usePreviewPanZoom(sourceKey: string) {
  const [view, setView] = useState({ zoom: MIN_ZOOM, x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const stopPan = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    setPanning(false);
    if (drag && frameRef.current?.hasPointerCapture(drag.pointerId)) {
      frameRef.current.releasePointerCapture(drag.pointerId);
    }
  }, []);

  useEffect(() => {
    stopPan();
    setView({ zoom: MIN_ZOOM, x: 0, y: 0 });
  }, [sourceKey, stopPan]);

  const changeZoom = useCallback(
    (next: number | ((current: number) => number)) => {
      stopPan();
      setView((current) => {
        const zoom = clampZoom(
          typeof next === 'function' ? next(current.zoom) : next
        );
        const limit = (zoom - 1) / 2;
        return {
          zoom,
          x: Math.max(-limit, Math.min(limit, current.x)),
          y: Math.max(-limit, Math.min(limit, current.y))
        };
      });
    },
    [stopPan]
  );

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.deltaY) return;
      event.preventDefault();
      changeZoom(
        (current) => current + (event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP)
      );
    };
    frame.addEventListener('wheel', onWheel, { passive: false });
    return () => frame.removeEventListener('wheel', onWheel);
  }, [changeZoom]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      view.zoom <= MIN_ZOOM ||
      event.button !== 0 ||
      !event.isPrimary ||
      dragRef.current
    )
      return;
    // The divider owns its gesture; all other image pixels can start a pan.
    if ((event.target as Element).closest('[role="slider"]')) return;
    const { width, height } = event.currentTarget.getBoundingClientRect();
    if (!width || !height) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      x: view.x,
      y: view.y,
      width,
      height
    };
    setPanning(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const x = drag.x + (event.clientX - drag.clientX) / drag.width;
    const y = drag.y + (event.clientY - drag.clientY) / drag.height;
    setView((current) => {
      const limit = (current.zoom - 1) / 2;
      return {
        ...current,
        x: Math.max(-limit, Math.min(limit, x)),
        y: Math.max(-limit, Math.min(limit, y))
      };
    });
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) stopPan();
  };

  return {
    zoom: view.zoom,
    changeZoom,
    frameProps: {
      ref: frameRef,
      'data-zoomed': view.zoom > MIN_ZOOM,
      'data-panning': panning,
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onLostPointerCapture: onPointerEnd
    },
    style: {
      '--comparison-zoom': String(view.zoom),
      '--comparison-pan-x': `${view.x * 100}%`,
      '--comparison-pan-y': `${view.y * 100}%`
    } as CSSProperties
  };
}

function ZoomControls({
  zoom,
  onZoomChange
}: {
  zoom: number;
  onZoomChange: (zoom: number) => void;
}) {
  return (
    <div className="image-tool-zoom-controls" aria-label="预览缩放">
      <button
        type="button"
        onClick={() => onZoomChange(clampZoom(zoom - ZOOM_STEP))}
        disabled={zoom <= MIN_ZOOM}
        aria-label="缩小预览"
      >
        <Minus aria-hidden="true" />
      </button>
      <output aria-live="polite">{Math.round(zoom * 100)}%</output>
      <button
        type="button"
        onClick={() => onZoomChange(clampZoom(zoom + ZOOM_STEP))}
        disabled={zoom >= MAX_ZOOM}
        aria-label="放大预览"
      >
        <Plus aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onZoomChange(MIN_ZOOM)}
        disabled={zoom === MIN_ZOOM}
        aria-label="适合窗口"
      >
        <Maximize2 aria-hidden="true" />
      </button>
    </div>
  );
}

export function BeforeAfterComparison({
  beforeSrc,
  afterSrc,
  beforeAlt,
  afterAlt,
  aspectRatio,
  beforeLabel = '原图',
  afterLabel = '放大后',
  instruction = '拖动分隔线对比；放大后拖动图像查看各处细节，滚轮或按钮缩放'
}: BeforeAfterComparisonProps) {
  const { zoom, changeZoom, frameProps, style } = usePreviewPanZoom(
    `${beforeSrc}|${afterSrc}`
  );

  const comparisonStyle = {
    '--comparison-aspect': String(aspectRatio),
    ...style,
    maxWidth: `${530 * aspectRatio}px`
  } as CSSProperties;

  return (
    <figure className="image-tool-comparison-frame">
      <div
        className="image-tool-preview-viewport"
        style={{ maxWidth: `${530 * aspectRatio}px` }}
      >
        <div
          {...frameProps}
          className="image-tool-comparison"
          style={comparisonStyle}
        >
          <ReactCompareSlider
            key={`${beforeSrc}|${afterSrc}`}
            className="image-tool-compare-slider"
            itemOne={
              <img
                src={beforeSrc}
                alt={beforeAlt}
                draggable={false}
                style={{ ...styleFitContainer(), objectFit: 'contain' }}
              />
            }
            itemTwo={
              <img
                src={afterSrc}
                alt={afterAlt}
                draggable={false}
                style={{ ...styleFitContainer(), objectFit: 'contain' }}
              />
            }
            defaultPosition={50}
            keyboardIncrement="5%"
            onlyHandleDraggable
          />
          <span className="image-tool-comparison-label before">
            {beforeLabel}
          </span>
          <span className="image-tool-comparison-label after">
            {afterLabel}
          </span>
        </div>
        <ZoomControls zoom={zoom} onZoomChange={changeZoom} />
      </div>
      <figcaption>{instruction}</figcaption>
    </figure>
  );
}

export function ZoomableImagePreview({
  src,
  alt,
  aspectRatio
}: {
  src: string;
  alt: string;
  aspectRatio: number;
}) {
  const { zoom, changeZoom, frameProps, style } = usePreviewPanZoom(src);

  return (
    <figure className="image-tool-comparison-frame">
      <div
        className="image-tool-preview-viewport"
        style={{ maxWidth: `${530 * aspectRatio}px` }}
      >
        <div
          {...frameProps}
          className="image-tool-zoom-preview"
          style={
            {
              '--comparison-aspect': String(aspectRatio),
              ...style,
              maxWidth: `${530 * aspectRatio}px`
            } as CSSProperties
          }
        >
          <img src={src} alt={alt} draggable={false} />
        </div>
        <ZoomControls zoom={zoom} onZoomChange={changeZoom} />
      </div>
      <figcaption>滚轮或按钮缩放；放大后拖动图像查看各处细节</figcaption>
    </figure>
  );
}
