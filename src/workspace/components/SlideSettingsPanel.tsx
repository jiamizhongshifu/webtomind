/**
 * PPT/幻灯片生成设置面板
 * 用于配置幻灯片生成的风格和数量
 *
 * 风格参考: baoyu-skills slide-deck
 */
import { X, Presentation } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// 幻灯片设置类型
export interface SlideSettings {
  style: string; // 'blueprint' | 'notion' | 'corporate' | 'minimal' | ...
  slideCount: number; // 默认 10
  language: string; // 'auto' | 'zh' | 'en'
}

// 默认设置
export const DEFAULT_SLIDE_SETTINGS: SlideSettings = {
  style: 'blueprint',
  slideCount: 10,
  language: 'auto'
};

// 风格选项 - 基于 baoyu-skills slide-deck
export const SLIDE_STYLE_OPTIONS = [
  {
    value: 'blueprint',
    icon: '📐',
    description: '技术蓝图风格，网格纹理，工程精度'
  },
  { value: 'notion', icon: '📊', description: 'SaaS 仪表盘美学，卡片式布局' },
  {
    value: 'corporate',
    icon: '💼',
    description: '海军蓝/金色配色，专业商务风格'
  },
  {
    value: 'minimal',
    icon: '⚪',
    description: '极简风格，大量留白，单一强调色'
  },
  {
    value: 'sketch-notes',
    icon: '✏️',
    description: '手绘风格，柔和笔触，温暖感'
  },
  { value: 'chalkboard', icon: '🖍️', description: '黑板粉笔风格，教育感' },
  {
    value: 'bold-editorial',
    icon: '📰',
    description: '杂志社论风格，粗体排版'
  },
  {
    value: 'dark-atmospheric',
    icon: '🌙',
    description: '电影级暗色调，发光效果'
  },
  {
    value: 'watercolor',
    icon: '🎨',
    description: '柔和手绘水彩纹理，自然温暖'
  },
  {
    value: 'pixel-art',
    icon: '👾',
    description: '复古 8-bit 像素风，怀旧游戏感'
  },
  {
    value: 'scientific',
    icon: '🔬',
    description: '学术图表，生物通路，精确标注'
  },
  { value: 'vintage', icon: '📜', description: '做旧纸张美学，历史文档风格' }
] as const;

// 幻灯片数量选项
const SLIDE_COUNT_OPTIONS = [5, 8, 10, 12, 15, 20];

// 语言选项
const LANGUAGE_OPTIONS = [
  { value: 'auto', label: '自动检测' },
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' }
];

interface SlideSettingsPanelProps {
  settings: SlideSettings;
  onChange: (settings: SlideSettings) => void;
  onClose: () => void;
}

export function SlideSettingsPanel({
  settings,
  onChange,
  onClose
}: SlideSettingsPanelProps) {
  const { t } = useTranslation('settings');

  const handleStyleChange = (value: string) => {
    onChange({ ...settings, style: value });
  };

  const handleSlideCountChange = (value: number) => {
    onChange({ ...settings, slideCount: value });
  };

  const handleLanguageChange = (value: string) => {
    onChange({ ...settings, language: value });
  };

  const selectedStyle = SLIDE_STYLE_OPTIONS.find(
    (s) => s.value === settings.style
  );

  return (
    <div className="absolute bottom-full left-0 mb-2 bg-slate-800 rounded-xl shadow-xl border border-slate-700 p-4 min-w-[360px] max-w-[400px] z-50">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-white">
          <Presentation className="w-4 h-4" />
          <span className="font-medium">
            {t('slideSettings.title', 'PPT 设置')}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-muted-foreground hover:text-white hover:bg-slate-700 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 幻灯片风格 */}
      <div className="mb-4">
        <label className="block text-sm text-emerald-400 mb-2">
          {t('slideSettings.style', '风格')}
        </label>
        <div className="grid grid-cols-3 gap-2 max-h-[200px] overflow-y-auto pr-1">
          {SLIDE_STYLE_OPTIONS.map((style) => (
            <button
              key={style.value}
              type="button"
              onClick={() => handleStyleChange(style.value)}
              className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-all ${
                settings.style === style.value
                  ? 'border-emerald-500 bg-emerald-500/20'
                  : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
              }`}
              title={style.description}
            >
              <span className="text-xl">{style.icon}</span>
              <span className="text-xs text-slate-300 text-center leading-tight">
                {t(`slideSettings.styles.${style.value}`, style.value)}
              </span>
            </button>
          ))}
        </div>
        {/* 选中风格的描述 */}
        {selectedStyle && (
          <p className="mt-2 text-xs text-muted-foreground italic">
            {selectedStyle.description}
          </p>
        )}
      </div>

      {/* 幻灯片数量 */}
      <div className="mb-4">
        <label className="block text-sm text-emerald-400 mb-2">
          {t('slideSettings.slideCount', '幻灯片数量')}
        </label>
        <div className="flex gap-2 flex-wrap">
          {SLIDE_COUNT_OPTIONS.map((count) => (
            <button
              key={count}
              type="button"
              onClick={() => handleSlideCountChange(count)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                settings.slideCount === count
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {count} 页
            </button>
          ))}
        </div>
      </div>

      {/* 输出语言 */}
      <div>
        <label className="block text-sm text-emerald-400 mb-2">
          {t('slideSettings.language', '输出语言')}
        </label>
        <div className="relative">
          <select
            value={settings.language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="w-full px-3 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 appearance-none cursor-pointer"
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <svg
            className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

/**
 * 将幻灯片设置转换为 prompt 指令
 * @param settings 幻灯片设置
 * @returns 要追加到 prompt 的指令文本
 */
export function slideSettingsToPromptSuffix(settings: SlideSettings): string {
  const parts: string[] = [];

  // 风格
  const styleLabels: Record<string, string> = {
    blueprint: '技术蓝图风格',
    notion: 'Notion SaaS风格',
    corporate: '商务专业风格',
    minimal: '极简风格',
    'sketch-notes': '手绘笔记风格',
    chalkboard: '黑板粉笔风格',
    'bold-editorial': '杂志社论风格',
    'dark-atmospheric': '暗黑氛围风格',
    watercolor: '水彩画风格',
    'pixel-art': '像素艺术风格',
    scientific: '学术科学风格',
    vintage: '复古风格'
  };
  parts.push(`风格: ${styleLabels[settings.style] || settings.style}`);

  // 数量
  parts.push(`生成 ${settings.slideCount} 页幻灯片`);

  // 语言
  if (settings.language !== 'auto') {
    parts.push(`使用${settings.language === 'zh' ? '中文' : '英文'}输出`);
  }

  return parts.join('，');
}
