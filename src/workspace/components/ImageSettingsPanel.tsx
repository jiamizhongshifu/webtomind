/**
 * 图片生成设置面板
 * 用于配置图片生成的分辨率和宽高比
 */
import { useTranslation } from 'react-i18next';

// 图片设置类型
export interface ImageSettings {
  aspectRatio: string; // '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '3:2' | '2:3' | '21:9' | '5:4' | '4:5'
  quality: string; // '1K' | '2K' | '4K'
  style: string | null; // null | 'ghibli' | 'pixar' | 'cartoon' | 'pixel'
  model: string; // 暂时固定为 'nano-banana-pro'
}

// 默认设置
export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  aspectRatio: '1:1',
  quality: '1K',
  style: null,
  model: 'nano-banana-pro'
};

// 分辨率选项
const QUALITY_OPTIONS = ['1K', '2K', '4K'];

// 宽高比选项（按行排列）
const ASPECT_RATIO_OPTIONS = [
  ['21:9', '16:9', '3:2', '4:3'],
  ['5:4', '1:1', '4:5', '3:4'],
  ['2:3', '9:16']
];

// 根据宽高比获取图标方向样式
function getAspectRatioIconStyle(ratio: string): { width: string; height: string } {
  const map: Record<string, { width: string; height: string }> = {
    '21:9': { width: '36px', height: '16px' },
    '16:9': { width: '32px', height: '18px' },
    '3:2': { width: '30px', height: '20px' },
    '4:3': { width: '28px', height: '22px' },
    '5:4': { width: '26px', height: '22px' },
    '1:1': { width: '24px', height: '24px' },
    '4:5': { width: '22px', height: '26px' },
    '3:4': { width: '22px', height: '28px' },
    '2:3': { width: '20px', height: '30px' },
    '9:16': { width: '18px', height: '32px' }
  };
  return map[ratio] || { width: '24px', height: '24px' };
}

interface ImageSettingsPanelProps {
  settings: ImageSettings;
  onChange: (settings: ImageSettings) => void;
  onClose?: () => void;
}

export function ImageSettingsPanel({
  settings,
  onChange
}: ImageSettingsPanelProps) {
  const { t } = useTranslation('settings');

  return (
    <div
      className="absolute bottom-full left-0 mb-2 bg-white rounded-2xl shadow-lg border border-slate-200 p-5 w-[340px] z-50"
      onClick={(e) => e.stopPropagation()}
    >
      {/* 分辨率 */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-slate-700 mb-2.5">
          {t('imageSettings.quality', '分辨率')}
        </label>
        <div className="grid grid-cols-3 gap-2">
          {QUALITY_OPTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onChange({ ...settings, quality: q })}
              className={`py-2 rounded-xl text-sm font-medium transition-all ${
                settings.quality === q
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* 宽高比 */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2.5">
          Size
        </label>
        <div className="flex flex-col gap-2">
          {ASPECT_RATIO_OPTIONS.map((row, rowIdx) => (
            <div key={rowIdx} className="grid grid-cols-4 gap-2">
              {row.map((ratio) => {
                const iconStyle = getAspectRatioIconStyle(ratio);
                return (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => onChange({ ...settings, aspectRatio: ratio })}
                    className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-all ${
                      settings.aspectRatio === ratio
                        ? 'bg-slate-100 border-slate-300'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div
                      className="border-2 border-slate-400 rounded-[3px] flex-shrink-0"
                      style={{ width: iconStyle.width, height: iconStyle.height }}
                    />
                    <span className="text-xs text-slate-500">{ratio}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 将图片设置转换为 prompt 后缀
 * @param settings 图片设置
 * @returns 要追加到 prompt 的文本
 */
export function imageSettingsToPromptSuffix(settings: ImageSettings): string {
  const parts: string[] = [];

  // 宽高比
  if (settings.aspectRatio) {
    parts.push(`宽高比 ${settings.aspectRatio}`);
  }

  // 质量
  if (settings.quality) {
    parts.push(`${settings.quality} 分辨率`);
  }

  // 风格
  if (settings.style) {
    const styleLabels: Record<string, string> = {
      ghibli: '吉卜力风格',
      pixar: '皮克斯风格',
      cartoon: '卡通风格',
      pixel: '像素风格'
    };
    parts.push(styleLabels[settings.style] || settings.style);
  }

  if (parts.length === 0) {
    return '';
  }

  return `，${parts.join('，')}`;
}
