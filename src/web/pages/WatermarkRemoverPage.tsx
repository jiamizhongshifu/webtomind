import { Brush, Eraser, SquareDashedMousePointer, Undo2 } from 'lucide-react';
import { Slider } from '@/shared/ui/radix/slider';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from 'react';
import { getLocalizedCreateAppContent } from '@/shared/create-apps';
import {
  IMAGE_TOOL_MODELS,
  isPublishedImageToolModel
} from '@/shared/image-tool-models';
import {
  EmptyResult,
  ImageToolShell,
  ImageUploadField,
  ResultActions,
  ToolStatus,
  useImageToolUpload,
  type ToolRunState
} from '@/web/components/image-tools/ImageToolShell';
import { useInpaintWorker } from '@/web/hooks/useInpaintWorker';
import {
  canvasToBlob,
  createImageToolResultIdentity,
  downloadBlob,
  getExtension,
  stripImageExtension,
  supportsWebGpu,
  type ImageToolOutputFormat
} from '@/web/lib/image-tools';
import { applySeo } from '@/web/lib/seo';
import { useRouteLocale } from '@/web/lib/route-locale';

type Point = { x: number; y: number };
type Mark =
  | { kind: 'brush'; points: Point[]; size: number }
  | { kind: 'rect'; start: Point; end: Point };

export function WatermarkRemoverPage() {
  const { locale, isZh } = useRouteLocale();
  const tool = getLocalizedCreateAppContent('watermark-remover', locale)!;
  const upload = useImageToolUpload();
  const setUploadError = upload.setError;
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const pendingRunRef = useRef<{
    identity: string;
    sourceName: string;
    outputFormat: Exclude<ImageToolOutputFormat, 'image/jpeg'>;
  } | null>(null);
  const [mode, setMode] = useState<'brush' | 'rect'>('brush');
  const [brushSize, setBrushSize] = useState(36);
  const [feather, setFeather] = useState(8);
  const [zoom, setZoom] = useState(1);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [maskRevision, setMaskRevision] = useState(0);
  const [activeMark, setActiveMark] = useState<Mark | null>(null);
  const [keyboardCursor, setKeyboardCursor] = useState<Point>({
    x: 0,
    y: 0
  });
  const [keyboardRectStart, setKeyboardRectStart] = useState<Point | null>(
    null
  );
  const [format, setFormat] =
    useState<Exclude<ImageToolOutputFormat, 'image/jpeg'>>('image/png');
  const [state, setState] = useState<ToolRunState>('idle');
  const [progress, setProgress] = useState(0);
  const [workerMessage, setWorkerMessage] = useState('');
  const [result, setResult] = useState<{
    identity: string;
    blob: Blob;
    url: string;
    engine: string;
    sourceName: string;
    outputFormat: Exclude<ImageToolOutputFormat, 'image/jpeg'>;
  } | null>(null);
  const modelReady = isPublishedImageToolModel(IMAGE_TOOL_MODELS.lama);
  const canUseLama = modelReady && supportsWebGpu();
  const resultIdentity = createImageToolResultIdentity(upload.source, [
    upload.revision,
    maskRevision,
    brushSize,
    feather,
    format
  ]);
  const resultIdentityRef = useRef(resultIdentity);
  resultIdentityRef.current = resultIdentity;
  const currentResult = result?.identity === resultIdentity ? result : null;
  const inpaintWorker = useInpaintWorker({
    onProgress: (nextProgress, message) => {
      setProgress(nextProgress);
      if (message) setWorkerMessage(message);
    },
    onFallback: (message) => {
      setProgress(18);
      setWorkerMessage(message);
    },
    onSuccess: (nextResult) => {
      const pending = pendingRunRef.current;
      if (!pending || resultIdentityRef.current !== pending.identity) return;
      upload.setError('');
      setResult({
        identity: pending.identity,
        blob: nextResult.blob,
        url: URL.createObjectURL(nextResult.blob),
        engine: nextResult.engine,
        sourceName: pending.sourceName,
        outputFormat: pending.outputFormat
      });
      setProgress(100);
      setWorkerMessage('局部修复已完成');
      setState('success');
      pendingRunRef.current = null;
    },
    onError: (message) => {
      upload.setError(message);
      setWorkerMessage('局部修复失败');
      setState('error');
      pendingRunRef.current = null;
    }
  });
  const cancelInpaint = inpaintWorker.cancel;

  useEffect(
    () =>
      applySeo({
        title: isZh
          ? '在线去水印与局部修复工具 | WebToMind'
          : 'Online Watermark Remover and Inpainting Tool | WebToMind',
        description: tool.description,
        htmlLang: isZh ? 'zh-CN' : 'en'
      }),
    [isZh, tool.description]
  );
  useEffect(() => {
    setMarks([]);
    setMaskRevision((value) => value + 1);
    setActiveMark(null);
    setKeyboardRectStart(null);
    setKeyboardCursor({
      x: (upload.source?.width || 0) / 2,
      y: (upload.source?.height || 0) / 2
    });
  }, [upload.source]);
  useEffect(() => {
    cancelInpaint();
    pendingRunRef.current = null;
    setResult((previous) =>
      previous?.identity === resultIdentity ? previous : null
    );
    setUploadError('');
    setState('idle');
    setProgress(0);
    setWorkerMessage('');
  }, [cancelInpaint, resultIdentity, setUploadError]);
  useEffect(
    () => () => {
      if (result?.url) URL.revokeObjectURL(result.url);
    },
    [result?.url]
  );

  const allMarks = useMemo(
    () => (activeMark ? [...marks, activeMark] : marks),
    [activeMark, marks]
  );
  useEffect(() => {
    const canvas = maskRef.current;
    const source = upload.source;
    if (!canvas || !source) return;
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = 'rgba(224,84,54,.8)';
    context.fillStyle = 'rgba(224,84,54,.42)';
    context.lineCap = 'round';
    context.lineJoin = 'round';
    allMarks.forEach((mark) => {
      if (mark.kind === 'rect') {
        context.fillRect(
          mark.start.x,
          mark.start.y,
          mark.end.x - mark.start.x,
          mark.end.y - mark.start.y
        );
        return;
      }
      if (mark.points.length === 1) {
        context.beginPath();
        context.arc(
          mark.points[0].x,
          mark.points[0].y,
          mark.size / 2,
          0,
          Math.PI * 2
        );
        context.fill();
        return;
      }
      context.lineWidth = mark.size;
      context.beginPath();
      context.moveTo(mark.points[0].x, mark.points[0].y);
      mark.points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
      context.stroke();
    });
  }, [allMarks, upload.source]);

  const pointFromEvent = (
    event: ReactPointerEvent<HTMLCanvasElement>
  ): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * event.currentTarget.width,
      y: ((event.clientY - rect.top) / rect.height) * event.currentTarget.height
    };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (state === 'processing') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    setActiveMark(
      mode === 'brush'
        ? { kind: 'brush', points: [point], size: brushSize }
        : { kind: 'rect', start: point, end: point }
    );
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!activeMark || !event.currentTarget.hasPointerCapture(event.pointerId))
      return;
    const point = pointFromEvent(event);
    setActiveMark((current) => {
      if (!current) return null;
      return current.kind === 'brush'
        ? { ...current, points: [...current.points, point] }
        : { ...current, end: point };
    });
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setActiveMark((current) => {
      if (current) {
        setMarks((value) => [...value, current]);
        setMaskRevision((value) => value + 1);
      }
      return null;
    });
  };

  const onMaskKeyDown = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    const source = upload.source;
    if (!source || state === 'processing') return;
    const step = event.shiftKey ? 24 : 6;
    if (
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowRight' ||
      event.key === 'ArrowUp' ||
      event.key === 'ArrowDown'
    ) {
      event.preventDefault();
      setKeyboardCursor((current) => ({
        x: Math.max(
          0,
          Math.min(
            source.width,
            current.x +
              (event.key === 'ArrowLeft'
                ? -step
                : event.key === 'ArrowRight'
                  ? step
                  : 0)
          )
        ),
        y: Math.max(
          0,
          Math.min(
            source.height,
            current.y +
              (event.key === 'ArrowUp'
                ? -step
                : event.key === 'ArrowDown'
                  ? step
                  : 0)
          )
        )
      }));
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (mode === 'brush') {
        setMarks((value) => [
          ...value,
          { kind: 'brush', points: [keyboardCursor], size: brushSize }
        ]);
        setMaskRevision((value) => value + 1);
        return;
      }
      if (!keyboardRectStart) {
        setKeyboardRectStart(keyboardCursor);
      } else {
        setMarks((value) => [
          ...value,
          { kind: 'rect', start: keyboardRectStart, end: keyboardCursor }
        ]);
        setKeyboardRectStart(null);
        setMaskRevision((value) => value + 1);
      }
      return;
    }
    if (event.key === 'Escape') {
      setKeyboardRectStart(null);
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      setMarks((value) => value.slice(0, -1));
      setMaskRevision((value) => value + 1);
    }
  };

  const run = async () => {
    const source = upload.source;
    const maskCanvas = maskRef.current;
    if (!source || !maskCanvas || marks.length === 0) return;
    const runIdentity = resultIdentity;
    setState('processing');
    setProgress(4);
    setWorkerMessage('正在准备蒙版');
    upload.setError('');
    try {
      const mask = await canvasToBlob(maskCanvas, 'image/png');
      pendingRunRef.current = {
        identity: runIdentity,
        sourceName: source.file.name,
        outputFormat: format
      };
      inpaintWorker.run({
        file: source.file,
        mask,
        outputType: format,
        radius: Math.max(4, Math.round(brushSize / 2)),
        feather,
        modelUrl: canUseLama ? IMAGE_TOOL_MODELS.lama.route : undefined
      });
    } catch (error) {
      upload.setError(
        error instanceof Error ? error.message : '局部修复失败，请重试。'
      );
      setState('error');
    }
  };

  return (
    <ImageToolShell
      tool={tool}
      controls={
        <>
          <section className="image-tool-control-section">
            <h2>1. 上传图片</h2>
            <p>仅处理你拥有版权或已获授权的图片。</p>
            <ImageUploadField upload={upload} />
          </section>
          <section className="image-tool-control-section">
            <h2>2. 绘制蒙版</h2>
            <div className="image-tool-choice-grid">
              <button
                className={`image-tool-choice${mode === 'brush' ? ' active' : ''}`}
                type="button"
                disabled={state === 'processing'}
                onClick={() => setMode('brush')}
              >
                <Brush size={16} /> 画笔
              </button>
              <button
                className={`image-tool-choice${mode === 'rect' ? ' active' : ''}`}
                type="button"
                disabled={state === 'processing'}
                onClick={() => setMode('rect')}
              >
                <SquareDashedMousePointer size={16} /> 矩形
              </button>
            </div>
            <label className="image-tool-field">
              <span>画笔大小 {brushSize}px</span>
              <Slider
                min={8}
                max={180}
                value={[brushSize]}
                disabled={state === 'processing'}
                aria-label="画笔大小"
                thumbAriaLabel="画笔大小"
                onValueChange={(value) => setBrushSize(value[0])}
              />
            </label>
            <label className="image-tool-field">
              <span>羽化 {feather}px</span>
              <Slider
                min={0}
                max={40}
                value={[feather]}
                disabled={state === 'processing'}
                aria-label="羽化"
                thumbAriaLabel="羽化"
                onValueChange={(value) => setFeather(value[0])}
              />
            </label>
            <label className="image-tool-field">
              <span>画布缩放 {Math.round(zoom * 100)}%</span>
              <Slider
                min={0.5}
                max={2}
                step={0.05}
                value={[zoom]}
                disabled={state === 'processing'}
                aria-label="画布缩放"
                thumbAriaLabel="画布缩放"
                onValueChange={(value) => setZoom(value[0])}
              />
            </label>
            <div className="image-tool-choice-grid">
              <button
                className="image-tool-secondary-button"
                type="button"
                disabled={!marks.length}
                onClick={() => {
                  setMarks((value) => value.slice(0, -1));
                  setMaskRevision((value) => value + 1);
                }}
              >
                <Undo2 /> 撤销
              </button>
              <button
                className="image-tool-secondary-button"
                type="button"
                disabled={!marks.length}
                onClick={() => {
                  setMarks([]);
                  setMaskRevision((value) => value + 1);
                }}
              >
                <Eraser /> 清空
              </button>
            </div>
            <div className="image-tool-field">
              <label htmlFor="watermark-format">输出格式</label>
              <select
                id="watermark-format"
                value={format}
                disabled={state === 'processing'}
                onChange={(event) =>
                  setFormat(
                    event.target.value as Exclude<
                      ImageToolOutputFormat,
                      'image/jpeg'
                    >
                  )
                }
              >
                <option value="image/png">PNG</option>
                <option value="image/webp">WebP</option>
              </select>
            </div>
            <button
              className="image-tool-primary-button image-tool-run-button"
              type="button"
              disabled={
                !upload.source || !marks.length || state === 'processing'
              }
              onClick={() => void run()}
            >
              处理蒙版区域
            </button>
            {state === 'processing' ? (
              <button
                className="image-tool-secondary-button image-tool-run-button"
                type="button"
                onClick={() => {
                  inpaintWorker.cancel();
                  pendingRunRef.current = null;
                  setState('idle');
                  setProgress(0);
                  setWorkerMessage('已取消局部修复');
                }}
              >
                取消处理
              </button>
            ) : null}
            <ToolStatus
              state={state}
              progress={state === 'processing' ? progress : undefined}
              engine={
                currentResult?.engine ||
                (canUseLama ? 'LaMa · ONNX WebGPU' : '边界扩散纹理填充 Worker')
              }
              message={
                state === 'processing'
                  ? workerMessage
                  : canUseLama
                    ? '仅截取蒙版包围区域及上下文推理；模型失败会明确降级。'
                    : modelReady
                      ? '当前浏览器无 WebGPU，将明确使用邻域纹理填充。'
                      : 'LaMa 官方转换权重未发布，将明确使用邻域纹理填充。'
              }
            />
          </section>
        </>
      }
      result={
        upload.source ? (
          <>
            <div className="image-tool-result-header">
              <h2>{currentResult ? '修复结果' : '标记要移除的区域'}</h2>
              <p>
                {currentResult
                  ? `${currentResult.engine} · 蒙版外像素保持原样`
                  : '蒙版外像素保持原样。画布聚焦后可用方向键移动，空格或回车标记。'}
              </p>
            </div>
            <div className="image-tool-preview-stage">
              {currentResult ? (
                <img src={currentResult.url} alt="局部修复结果" />
              ) : (
                <div
                  className="image-tool-mask-stage"
                  style={{ width: `${zoom * 100}%` }}
                >
                  <img src={upload.source.url} alt="待处理图片" />
                  <canvas
                    ref={maskRef}
                    role="application"
                    tabIndex={0}
                    aria-label={
                      mode === 'brush'
                        ? '水印蒙版画布。方向键移动位置，空格或回车添加画笔点，删除键撤销。'
                        : '水印蒙版画布。方向键移动位置，空格或回车依次设置矩形起点和终点。'
                    }
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    onKeyDown={onMaskKeyDown}
                  />
                </div>
              )}
            </div>
            {currentResult ? (
              <ResultActions
                onDownload={() =>
                  downloadBlob(
                    currentResult.blob,
                    `${stripImageExtension(currentResult.sourceName)}-repaired.${getExtension(currentResult.outputFormat)}`
                  )
                }
                onReset={() => setResult(null)}
              />
            ) : null}
          </>
        ) : (
          <EmptyResult>上传图片后，用画笔或矩形标记水印区域。</EmptyResult>
        )
      }
    />
  );
}
