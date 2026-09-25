import { RotateCcw, SquareDashedMousePointer } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export type VisibleWatermarkBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PixelBox = { left: number; top: number; right: number; bottom: number };

type Props = {
  file: File;
  boxes: VisibleWatermarkBox[];
  onChange: (boxes: VisibleWatermarkBox[]) => void;
  isZh: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeBox(box: PixelBox, width: number, height: number): VisibleWatermarkBox {
  return {
    x: clamp(box.left / width, 0, 1),
    y: clamp(box.top / height, 0, 1),
    width: clamp((box.right - box.left) / width, 0, 1),
    height: clamp((box.bottom - box.top) / height, 0, 1)
  };
}

function toPixelBox(
  box: VisibleWatermarkBox,
  width: number,
  height: number
): PixelBox {
  return {
    left: box.x * width,
    top: box.y * height,
    right: (box.x + box.width) * width,
    bottom: (box.y + box.height) * height
  };
}

function getPointerPoint(
  event: React.PointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * canvas.width, 0, canvas.width),
    y: clamp(((event.clientY - rect.top) / rect.height) * canvas.height, 0, canvas.height)
  };
}

export function VisibleWatermarkBoxEditor({
  file,
  boxes,
  onChange,
  isZh
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
  const [draft, setDraft] = useState<PixelBox | null>(null);

  useEffect(() => {
    setImage(null);
    setDraft(null);
    const url = URL.createObjectURL(file);
    const nextImage = new Image();
    nextImage.onload = () => {
      const scale = Math.min(1, 960 / nextImage.naturalWidth, 640 / nextImage.naturalHeight);
      setCanvasSize({
        width: Math.max(1, Math.round(nextImage.naturalWidth * scale)),
        height: Math.max(1, Math.round(nextImage.naturalHeight * scale))
      });
      setImage(nextImage);
    };
    nextImage.onerror = () => setImage(null);
    nextImage.src = url;
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    context.lineWidth = Math.max(2, canvas.width / 480);
    for (const box of boxes) {
      const pixelBox = toPixelBox(box, canvas.width, canvas.height);
      context.fillStyle = 'rgba(224, 84, 54, 0.24)';
      context.strokeStyle = '#e05436';
      context.fillRect(
        pixelBox.left,
        pixelBox.top,
        pixelBox.right - pixelBox.left,
        pixelBox.bottom - pixelBox.top
      );
      context.strokeRect(
        pixelBox.left,
        pixelBox.top,
        pixelBox.right - pixelBox.left,
        pixelBox.bottom - pixelBox.top
      );
    }
    if (draft) {
      context.fillStyle = 'rgba(224, 84, 54, 0.18)';
      context.strokeStyle = '#943c27';
      context.setLineDash([6, 4]);
      context.fillRect(
        draft.left,
        draft.top,
        draft.right - draft.left,
        draft.bottom - draft.top
      );
      context.strokeRect(
        draft.left,
        draft.top,
        draft.right - draft.left,
        draft.bottom - draft.top
      );
      context.setLineDash([]);
    }
  }, [boxes, canvasSize, draft, image]);

  const startSelection = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const point = getPointerPoint(event, canvas);
    canvas.setPointerCapture(event.pointerId);
    setDraft({ left: point.x, top: point.y, right: point.x, bottom: point.y });
  };

  const updateSelection = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draft) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const point = getPointerPoint(event, canvas);
    setDraft({
      left: Math.min(draft.left, point.x),
      top: Math.min(draft.top, point.y),
      right: Math.max(draft.left, point.x),
      bottom: Math.max(draft.top, point.y)
    });
  };

  const finishSelection = () => {
    if (!draft) return;
    const width = draft.right - draft.left;
    const height = draft.bottom - draft.top;
    setDraft(null);
    if (width < 8 || height < 8) return;
    onChange([...boxes, normalizeBox(draft, canvasSize.width, canvasSize.height)]);
  };

  return (
    <div className="ai-marks-visible-editor">
      <div className="ai-marks-visible-editor-heading">
        <div>
          <strong>
            <SquareDashedMousePointer aria-hidden="true" />
            {isZh ? '框选可见水印区域' : 'Select visible watermark areas'}
          </strong>
          <small>
            {isZh
              ? '拖动框选 Logo 或文字，支持多个区域；只会修复框内像素。'
              : 'Drag over logos or text. Add multiple areas; only selected pixels are repaired.'}
          </small>
        </div>
        {boxes.length ? (
          <button
            type="button"
            className="ai-marks-visible-clear"
            onClick={() => onChange([])}
          >
            <RotateCcw aria-hidden="true" />
            {isZh ? '清除选区' : 'Clear areas'}
          </button>
        ) : null}
      </div>
      <div className="ai-marks-visible-canvas-wrap">
        {image ? (
          <canvas
            ref={canvasRef}
            className="ai-marks-visible-canvas"
            aria-label={
              isZh ? '框选要移除的可见水印' : 'Select visible watermark areas to remove'
            }
            onPointerDown={startSelection}
            onPointerMove={updateSelection}
            onPointerUp={finishSelection}
            onPointerCancel={finishSelection}
          />
        ) : (
          <span>{isZh ? '图片预览加载失败。' : 'Could not load image preview.'}</span>
        )}
      </div>
      <small className="ai-marks-visible-count">
        {isZh ? `已选择 ${boxes.length} 个区域` : `${boxes.length} area(s) selected`}
      </small>
    </div>
  );
}
