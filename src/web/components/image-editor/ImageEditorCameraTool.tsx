import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { RotateCcw, Sparkles } from 'lucide-react';
import { CameraWidget } from './CameraWidget';
import type { CameraAngleState } from './editor-tools';
import { Slider } from '@/shared/ui/radix/slider';

interface ImageEditorCameraToolProps {
  isEnglish: boolean;
  camera: CameraAngleState;
  onChange: (next: CameraAngleState) => void;
  onGenerate: () => void;
  thumbnailUrl: string;
  busy: boolean;
}

const ROTATE_COLOR = '#4c9aff';
const VERTICAL_COLOR = '#a78bfa';
const ZOOM_COLOR = '#ff9f43';

export function ImageEditorCameraTool({
  isEnglish,
  camera,
  onChange,
  onGenerate,
  thumbnailUrl,
  busy
}: ImageEditorCameraToolProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<CameraWidget | null>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // 挂载开源 Three.js 相机视角球（移植自 MIT 项目 ComfyUI-qwenmultiangle）
  useEffect(() => {
    if (!viewportRef.current) return;
    try {
      const widget = new CameraWidget({
        container: viewportRef.current,
        initialState: {
          azimuth: camera.rotate,
          elevation: camera.vertical,
          distance: camera.zoom,
          imageUrl: thumbnailUrl || null
        },
        onStateChange: (state) => {
          onChangeRef.current({
            rotate: state.azimuth,
            vertical: state.elevation,
            zoom: state.distance
          });
        }
      });
      widgetRef.current = widget;
      return () => {
        try {
          widget.dispose();
        } catch {
          // 初始化失败的半构造实例无需再次清理。
        }
        widgetRef.current = null;
      };
    } catch (error) {
      console.error('[camera] WebGL 3D 预览不可用，已降级为参数面板：', error);
      setWebglUnavailable(true);
    }
    // 仅在挂载/卸载时初始化；外部 camera 变化由下方 effect 同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 外部状态（滑块/重置）变化时同步到 3D 视角球
  useEffect(() => {
    widgetRef.current?.setState({
      azimuth: camera.rotate,
      elevation: camera.vertical,
      distance: camera.zoom
    });
  }, [camera.rotate, camera.vertical, camera.zoom]);

  // 源图变化时更新 3D 纸板贴图
  useEffect(() => {
    widgetRef.current?.updateImage(thumbnailUrl || null);
  }, [thumbnailUrl]);

  const setValue = (key: keyof CameraAngleState, value: number) => {
    onChange({ ...camera, [key]: value });
  };

  const reset = () => {
    onChange({ rotate: 0, vertical: 0, zoom: 1 });
  };

  const rows = [
    {
      key: 'rotate' as const,
      label: isEnglish ? 'Rotate' : '旋转',
      min: 0,
      max: 360,
      step: 1,
      color: ROTATE_COLOR,
      display: `${Math.round(camera.rotate)}°`
    },
    {
      key: 'vertical' as const,
      label: isEnglish ? 'Vertical' : '垂直',
      min: -90,
      max: 90,
      step: 1,
      color: VERTICAL_COLOR,
      display: `${Math.round(camera.vertical)}°`
    },
    {
      key: 'zoom' as const,
      label: isEnglish ? 'Zoom' : '缩放',
      min: 0.6,
      max: 1.4,
      step: 0.05,
      color: ZOOM_COLOR,
      display: camera.zoom.toFixed(1)
    }
  ];

  return (
    <div className="image-editor-camera-tool">
      {webglUnavailable ? (
        <p
          className="image-editor-camera-fallback"
          role="status"
        >
          {isEnglish
            ? '3D camera preview is not available in this browser. You can still adjust the parameters below and generate.'
            : '当前浏览器不支持 3D 相机预览，仍可直接使用下方参数并生成。'}
        </p>
      ) : (
        <div
          ref={viewportRef}
          className="image-editor-camera-viewport"
          role="img"
          aria-label={isEnglish ? '3D camera orbit preview' : '3D 相机轨道预览'}
        />
      )}

      <div className="image-editor-camera-controls">
        {rows.map((row) => (
          <label key={row.key} className={`image-editor-camera-row is-${row.key}`}>
            <span>
              <i style={{ background: row.color }} />
              {row.label}
            </span>
            <Slider
              min={row.min}
              max={row.max}
              step={row.step}
              value={[camera[row.key]]}
              className="image-editor-camera-slider"
              trackClassName="image-editor-camera-track"
              thumbClassName="image-editor-camera-thumb"
              style={
                {
                  '--cam-slider-color': row.color
                } as CSSProperties
              }
              aria-label={row.label}
              thumbAriaLabel={row.label}
              onValueChange={(next) => setValue(row.key, next[0])}
            />
            <output>{row.display}</output>
          </label>
        ))}
      </div>

      <div className="image-editor-camera-actions">
        <button type="button" className="image-editor-camera-reset" onClick={reset}>
          <RotateCcw aria-hidden="true" />
          {isEnglish ? 'Reset' : '重置'}
        </button>
        <button
          type="button"
          className="image-editor-camera-generate"
          disabled={busy}
          onClick={onGenerate}
        >
          <Sparkles aria-hidden="true" />
          {isEnglish ? 'Generate' : '从新角度生成'}
        </button>
      </div>
    </div>
  );
}
