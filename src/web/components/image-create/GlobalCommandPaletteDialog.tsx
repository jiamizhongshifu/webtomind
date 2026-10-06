import { Command } from 'cmdk';
import {
  Compass,
  Image,
  LayoutGrid,
  PenTool,
  Scissors,
  Sparkles,
  Video
} from 'lucide-react';

interface GlobalCommandPaletteDialogProps {
  localePrefix: '' | '/zh-CN' | '/en-US';
  onNavigate: (href: string) => void;
}

interface CommandItem {
  id: string;
  label: string;
  hint: string;
  href: string;
  keywords?: string[];
  icon?: React.ReactNode;
}

// 命令面板的内容（含 cmdk）在首次按下 ⌘K / Ctrl+K 时才加载。
export function GlobalCommandPaletteDialog({
  localePrefix,
  onNavigate
}: GlobalCommandPaletteDialogProps) {
  const items: CommandItem[] = [
    {
      id: 'nav-inspiration',
      label: '灵感',
      hint: 'Inspiration',
      href: `${localePrefix}/create`,
      keywords: ['discovery', '灵感'],
      icon: <Sparkles aria-hidden="true" />
    },
    {
      id: 'nav-image',
      label: '图像创作',
      hint: 'Image creation',
      href: `${localePrefix}/image`,
      keywords: ['image', '图片', '生成'],
      icon: <Image aria-hidden="true" />
    },
    {
      id: 'nav-video',
      label: '视频创作',
      hint: 'Video creation',
      href: `${localePrefix}/video`,
      keywords: ['video', '视频'],
      icon: <Video aria-hidden="true" />
    },
    {
      id: 'nav-moodboards',
      label: '情绪板',
      hint: 'Moodboards',
      href: `${localePrefix}/moodboards`,
      keywords: ['board', '情绪板', 'mood'],
      icon: <LayoutGrid aria-hidden="true" />
    },
    {
      id: 'nav-gallery',
      label: '资产库',
      hint: 'Gallery',
      href: `${localePrefix}/gallery`,
      keywords: ['gallery', '资产', '图库'],
      icon: <Image aria-hidden="true" />
    },
    {
      id: 'nav-prompts',
      label: '提示词库',
      hint: 'Prompt library',
      href: `${localePrefix}/prompts`,
      keywords: ['prompt', '提示词'],
      icon: <PenTool aria-hidden="true" />
    },
    {
      id: 'nav-editor',
      label: '图片编辑',
      hint: 'Image editor',
      href: `${localePrefix}/tools/image-editor`,
      keywords: ['editor', '编辑', 'crop', 'mask'],
      icon: <Scissors aria-hidden="true" />
    },
    {
      id: 'nav-apps',
      label: '应用',
      hint: 'Apps & tools',
      href: `${localePrefix}/apps`,
      keywords: ['app', '工具', 'upscaler', 'watermark', '压缩'],
      icon: <LayoutGrid aria-hidden="true" />
    },
    {
      id: 'nav-use-cases',
      label: '博客',
      hint: 'Blog',
      href: `${localePrefix}/blog`,
      keywords: ['blog', '博客', 'use cases'],
      icon: <Compass aria-hidden="true" />
    },
    {
      id: 'action-new-image',
      label: '新建图像会话',
      hint: 'New image session',
      href: `${localePrefix}/image?newSession=1`,
      keywords: ['new', '新建', 'session'],
      icon: <Sparkles aria-hidden="true" />
    },
    {
      id: 'action-bg-remover',
      label: '去除背景',
      hint: 'Remove background',
      href: `${localePrefix}/tools/background-remover`,
      keywords: ['background', '抠图', '透明'],
      icon: <Scissors aria-hidden="true" />
    }
  ];

  return (
    <Command label="命令面板">
      <Command.Input placeholder="搜索页面、工具与快捷动作…" />
      <Command.List>
        <Command.Empty>没有匹配结果</Command.Empty>
        <Command.Group heading="导航">
          {items.map((item) => (
            <Command.Item
              key={item.id}
              value={`${item.id} ${item.label} ${item.hint} ${
                item.keywords?.join(' ') || ''
              }`}
              onSelect={() => onNavigate(item.href)}
            >
              {item.icon}
              <span>{item.label}</span>
              <kbd>{item.hint}</kbd>
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command>
  );
}
