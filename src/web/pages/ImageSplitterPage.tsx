import { Grid3X3 } from 'lucide-react';
import { zipSync } from 'fflate';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Slider } from '@/shared/ui/radix/slider';
import { getLocalizedCreateAppContent } from '@/shared/create-apps';
import {
  EmptyResult,
  ImageToolShell,
  ImageUploadField,
  ToolStatus,
  useImageToolUpload,
  type ToolRunState
} from '@/web/components/image-tools/ImageToolShell';
import {
  calculateSplitRects,
  canvasToBlob,
  createImageToolResultIdentity,
  downloadBlob,
  getExtension,
  stripImageExtension,
  type ImageToolOutputFormat
} from '@/web/lib/image-tools';
import { applySeo } from '@/web/lib/seo';
import { useRouteLocale } from '@/web/lib/route-locale';

const presets = [
  [2, 2],
  [3, 3],
  [3, 4],
  [1, 4],
  [4, 6]
] as const;

export function ImageSplitterPage() {
  const { locale, isZh } = useRouteLocale();
  const tool = getLocalizedCreateAppContent('image-splitter', locale)!;
  const upload = useImageToolUpload();
  const setUploadError = upload.setError;
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const [rows, setRows] = useState(3);
  const [columns, setColumns] = useState(3);
  const [ratio, setRatio] = useState<'original' | '1:1' | '4:5' | '16:9'>(
    'original'
  );
  const [zoom, setZoom] = useState(1);
  const [focusX, setFocusX] = useState(0.5);
  const [focusY, setFocusY] = useState(0.5);
  const [format, setFormat] = useState<ImageToolOutputFormat>('image/png');
  const [state, setState] = useState<ToolRunState>('idle');
  const [result, setResult] = useState<{
    identity: string;
    sourceName: string;
    rows: number;
    columns: number;
    format: ImageToolOutputFormat;
    tiles: Array<{ blob: Blob; name: string; url: string }>;
  } | null>(null);
  const rects = useMemo(
    () =>
      upload.source
        ? calculateSplitRects({
            sourceWidth: upload.source.width,
            sourceHeight: upload.source.height,
            rows,
            columns,
            aspectRatio:
              ratio === 'original'
                ? null
                : ratio === '1:1'
                  ? 1
                  : ratio === '4:5'
                    ? 4 / 5
                    : 16 / 9,
            zoom,
            focusX,
            focusY
          })
        : [],
    [columns, focusX, focusY, ratio, rows, upload.source, zoom]
  );
  const resultIdentity = createImageToolResultIdentity(upload.source, [
    upload.revision,
    rows,
    columns,
    ratio,
    zoom,
    focusX,
    focusY,
    format
  ]);
  const resultIdentityRef = useRef(resultIdentity);
  resultIdentityRef.current = resultIdentity;
  const currentResult = result?.identity === resultIdentity ? result : null;

  useEffect(
    () =>
      applySeo({
        title: isZh
          ? '在线图片分割器：九宫格与自定义切图 | WebToMind'
          : 'Online Image Splitter and Grid Cutter | WebToMind',
        description: tool.description,
        htmlLang: isZh ? 'zh-CN' : 'en'
      }),
    [isZh, tool.description]
  );
  useEffect(() => {
    setResult((previous) => {
      if (!previous || previous.identity === resultIdentity) return previous;
      return null;
    });
    setUploadError('');
    setState('idle');
  }, [resultIdentity, setUploadError]);
  useEffect(
    () => () => {
      result?.tiles.forEach((tile) => URL.revokeObjectURL(tile.url));
    },
    [result]
  );
  useEffect(() => {
    const canvas = previewRef.current;
    const source = upload.source;
    if (!canvas || !source || rects.length === 0) return;
    const crop = {
      x: Math.min(...rects.map((rect) => rect.x)),
      y: Math.min(...rects.map((rect) => rect.y)),
      right: Math.max(...rects.map((rect) => rect.x + rect.width)),
      bottom: Math.max(...rects.map((rect) => rect.y + rect.height))
    };
    canvas.width = Math.min(1100, crop.right - crop.x);
    canvas.height = Math.round(
      (canvas.width * (crop.bottom - crop.y)) / (crop.right - crop.x)
    );
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(
      source.bitmap,
      crop.x,
      crop.y,
      crop.right - crop.x,
      crop.bottom - crop.y,
      0,
      0,
      canvas.width,
      canvas.height
    );
    context.strokeStyle = 'rgba(255,255,255,.95)';
    context.lineWidth = Math.max(1, canvas.width / 500);
    for (let column = 1; column < columns; column += 1) {
      const x = (canvas.width * column) / columns;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, canvas.height);
      context.stroke();
    }
    for (let row = 1; row < rows; row += 1) {
      const y = (canvas.height * row) / rows;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(canvas.width, y);
      context.stroke();
    }
  }, [columns, rects, rows, upload.source]);

  const run = async () => {
    const source = upload.source;
    if (!source) return;
    const runIdentity = resultIdentity;
    setState('processing');
    upload.setError('');
    try {
      const base = stripImageExtension(source.file.name);
      const next = await Promise.all(
        rects.map(async (rect) => {
          const canvas = document.createElement('canvas');
          canvas.width = rect.width;
          canvas.height = rect.height;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('当前浏览器无法创建切片画布。');
          context.drawImage(
            source.bitmap,
            rect.x,
            rect.y,
            rect.width,
            rect.height,
            0,
            0,
            rect.width,
            rect.height
          );
          const blob = await canvasToBlob(canvas, format, 0.92);
          const name = `${base}-r${String(rect.row + 1).padStart(2, '0')}-c${String(rect.column + 1).padStart(2, '0')}.${getExtension(format)}`;
          return { blob, name, url: URL.createObjectURL(blob) };
        })
      );
      if (resultIdentityRef.current !== runIdentity) {
        next.forEach((tile) => URL.revokeObjectURL(tile.url));
        return;
      }
      setResult({
        identity: runIdentity,
        sourceName: source.file.name,
        rows,
        columns,
        format,
        tiles: next
      });
      setState('success');
    } catch (error) {
      upload.setError(
        error instanceof Error ? error.message : '切图失败，请重试。'
      );
      setState('error');
    }
  };

  const downloadZip = async () => {
    if (!currentResult) return;
    const files: Record<string, Uint8Array> = {};
    for (const tile of currentResult.tiles)
      files[tile.name] = new Uint8Array(await tile.blob.arrayBuffer());
    downloadBlob(
      new Blob([zipSync(files)], { type: 'application/zip' }),
      `${stripImageExtension(currentResult.sourceName)}-${currentResult.rows}x${currentResult.columns}.zip`
    );
  };

  return (
    <ImageToolShell
      tool={tool}
      controls={
        <>
          <section className="image-tool-control-section">
            <h2>1. 上传图片</h2>
            <ImageUploadField upload={upload} />
          </section>
          <section className="image-tool-control-section">
            <h2>2. 分割设置</h2>
            <div className="image-tool-choice-grid">
              {presets.map(([nextRows, nextColumns]) => (
                <button
                  className={`image-tool-choice${rows === nextRows && columns === nextColumns ? ' active' : ''}`}
                  key={`${nextRows}x${nextColumns}`}
                  type="button"
                  disabled={state === 'processing'}
                  onClick={() => {
                    setRows(nextRows);
                    setColumns(nextColumns);
                  }}
                >
                  {nextRows} × {nextColumns}
                </button>
              ))}
            </div>
            <div className="image-tool-choice-grid" style={{ marginTop: 12 }}>
              <label className="image-tool-field">
                <span>行数</span>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={rows}
                  disabled={state === 'processing'}
                  onChange={(event) =>
                    setRows(
                      Math.min(8, Math.max(1, Number(event.target.value)))
                    )
                  }
                />
              </label>
              <label className="image-tool-field">
                <span>列数</span>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={columns}
                  disabled={state === 'processing'}
                  onChange={(event) =>
                    setColumns(
                      Math.min(8, Math.max(1, Number(event.target.value)))
                    )
                  }
                />
              </label>
            </div>
            <div className="image-tool-field">
              <label htmlFor="split-ratio">单片比例</label>
              <select
                id="split-ratio"
                value={ratio}
                disabled={state === 'processing'}
                onChange={(event) =>
                  setRatio(event.target.value as typeof ratio)
                }
              >
                <option value="original">保留整体原比例</option>
                <option value="1:1">1:1</option>
                <option value="4:5">4:5</option>
                <option value="16:9">16:9</option>
              </select>
            </div>
            <label className="image-tool-field">
              <span>缩放 {zoom.toFixed(2)}×</span>
              <Slider
                min={1}
                max={3}
                step={0.05}
                value={[zoom]}
                disabled={state === 'processing'}
                aria-label="缩放"
                thumbAriaLabel="缩放"
                onValueChange={(value) => setZoom(value[0])}
              />
            </label>
            <label className="image-tool-field">
              <span>水平焦点 {Math.round(focusX * 100)}%</span>
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={[focusX]}
                disabled={state === 'processing'}
                aria-label="水平焦点"
                thumbAriaLabel="水平焦点"
                onValueChange={(value) => setFocusX(value[0])}
              />
            </label>
            <label className="image-tool-field">
              <span>垂直焦点 {Math.round(focusY * 100)}%</span>
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={[focusY]}
                disabled={state === 'processing'}
                aria-label="垂直焦点"
                thumbAriaLabel="垂直焦点"
                onValueChange={(value) => setFocusY(value[0])}
              />
            </label>
            <div className="image-tool-field">
              <label htmlFor="split-format">格式</label>
              <select
                id="split-format"
                value={format}
                disabled={state === 'processing'}
                onChange={(event) =>
                  setFormat(event.target.value as ImageToolOutputFormat)
                }
              >
                <option value="image/png">PNG</option>
                <option value="image/webp">WebP</option>
              </select>
            </div>
            <button
              className="image-tool-primary-button image-tool-run-button"
              type="button"
              disabled={!upload.source || state === 'processing'}
              onClick={() => void run()}
            >
              <Grid3X3 aria-hidden="true" />
              生成 {rows * columns} 张切片
            </button>
            <ToolStatus
              state={state}
              engine="Canvas · 本地切图"
              message={`${rows} 行 × ${columns} 列`}
            />
          </section>
        </>
      }
      result={
        upload.source ? (
          <>
            <div className="image-tool-result-header">
              <h2>
                {currentResult
                  ? `已生成 ${currentResult.tiles.length} 张切片`
                  : '分割预览'}
              </h2>
              <p>白线表示像素边界；每个源像素只归属于一个切片。</p>
            </div>
            <div className="image-tool-preview-stage">
              {currentResult ? (
                <div
                  className="image-tool-tile-grid"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${Math.min(currentResult.columns, 4)}, minmax(0, 1fr))`,
                    gap: 8
                  }}
                >
                  {currentResult.tiles.map((tile) => (
                    <button
                      className="image-tool-tile"
                      key={tile.name}
                      type="button"
                      onClick={() => downloadBlob(tile.blob, tile.name)}
                    >
                      <img src={tile.url} alt={tile.name} />
                      <span>{tile.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <canvas ref={previewRef} />
              )}
            </div>
            {currentResult ? (
              <div className="image-tool-result-actions">
                <button
                  className="image-tool-primary-button"
                  type="button"
                  onClick={() => void downloadZip()}
                >
                  下载 ZIP
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <EmptyResult>上传图片后即可预览分割边界。</EmptyResult>
        )
      }
    />
  );
}
