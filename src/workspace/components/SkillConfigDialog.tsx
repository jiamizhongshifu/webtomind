import { useState, useMemo } from 'react';
import { X, Sparkles, Check, Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/radix/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/shared/ui/radix/dialog';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel
} from '@/shared/ui/radix/field';
import { Input } from '@/shared/ui/radix/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/shared/ui/radix/select';
import { Slider } from '@/shared/ui/radix/slider';
import { Switch } from '@/shared/ui/radix/switch';
import { Textarea } from '@/shared/ui/radix/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/radix/toggle-group';
import type { SkillCatalogItem } from '../utils/skill-catalog';

// 技能参数类型
export type SkillParamType =
  | 'select'
  | 'radio'
  | 'toggle'
  | 'range'
  | 'text'
  | 'textarea'
  | 'visual-picker';

// 参数选项
export interface SkillParamOption {
  value: string;
  label: string;
  description?: string;
  icon?: string;
}

// 技能参数定义
export interface SkillParam {
  key: string;
  label: string;
  type: SkillParamType;
  description?: string;
  options?: SkillParamOption[];
  defaultValue: unknown;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
}

// 技能配置模式
export interface SkillConfigSchema {
  formats?: {
    key: string;
    label: string;
    description: string;
    icon?: string;
  }[];
  params: SkillParam[];
  supportsCustomPrompt: boolean;
  customPromptPlaceholder?: string;
  customPromptExamples?: string[];
}

// 执行配置
export interface SkillExecutionConfig {
  skillId: string;
  format?: string;
  params: Record<string, unknown>;
  customPrompt?: string;
  model?: string;
  runtime?: 'openclaw' | 'legacy';
  targetDocumentId?: string | null;
}

interface SkillConfigDialogProps {
  skill: SkillCatalogItem | null;
  isOpen: boolean;
  onClose: () => void;
  onExecute: (config: SkillExecutionConfig) => void;
}

const WORKFLOW_RUNTIME_SKILL_IDS = new Set([
  'agent-reach',
  'comprehensive_analysis',
  'slide_deck_generation',
  'slide-deck',
  'infographic',
  'builders-daily-brief',
  'notebooklm_learning',
  'topic-decision',
  'video-mindmap',
  'cosmic-engraving',
  'wechat-publisher',
  'exam-quiz'
]);

// 默认技能配置模式（用于没有定义配置的技能）
const getDefaultConfigSchema = (_skill: SkillCatalogItem): SkillConfigSchema => {
  // _skill 参数保留用于未来扩展（基于技能类型提供不同的默认配置）
  return {
    formats: [],
    params: [
      {
        key: 'language',
        label: '输出语言',
        type: 'select',
        defaultValue: 'zh-CN',
        options: [
          { value: 'zh-CN', label: '简体中文' },
          { value: 'en-US', label: 'English' },
          { value: 'ja-JP', label: '日本語' }
        ]
      },
      {
        key: 'length',
        label: '输出长度',
        type: 'radio',
        defaultValue: 'medium',
        options: [
          { value: 'short', label: '简洁', description: '简短输出' },
          { value: 'medium', label: '适中', description: '平衡版本' },
          { value: 'long', label: '详细', description: '详细展开' }
        ]
      }
    ],
    supportsCustomPrompt: true,
    customPromptPlaceholder: '添加额外要求或指导...',
    customPromptExamples: [
      '针对特定受众调整语气',
      '重点关注某个特定方面',
      '使用特定的写作风格'
    ]
  };
};

// 预设技能配置模式
const SKILL_CONFIG_PRESETS: Record<string, SkillConfigSchema> = {
  'article-draft': {
    formats: [
      { key: 'deep_dive', label: '深入探究', description: '深入分析主题，提供详细见解', icon: '🔍' },
      { key: 'summary', label: '摘要', description: '简短概要，快速了解核心思想', icon: '📝' },
      { key: 'review', label: '评论', description: '专家视角的批评性评价', icon: '💭' },
      { key: 'debate', label: '辩论', description: '多角度观点对比分析', icon: '⚖️' }
    ],
    params: [
      {
        key: 'language',
        label: '选择语言',
        type: 'select',
        defaultValue: 'zh-CN',
        options: [
          { value: 'zh-CN', label: '简体中文' },
          { value: 'en-US', label: 'English' },
          { value: 'ja-JP', label: '日本語' }
        ]
      },
      {
        key: 'length',
        label: '篇幅',
        type: 'radio',
        defaultValue: 'medium',
        options: [
          { value: 'short', label: '短', description: '500字以内' },
          { value: 'medium', label: '默认', description: '1000-1500字' },
          { value: 'long', label: '长', description: '2000字以上' }
        ]
      }
    ],
    supportsCustomPrompt: true,
    customPromptPlaceholder: 'AI 在处理时应着重于哪些方面？',
    customPromptExamples: [
      '专注于特定来源（"仅介绍关于意大利的文章"）',
      '专注于特定主题（"仅讨论小说的主角"）',
      '针对特定受众（"向不熟悉生物学的人介绍生物学知识"）'
    ]
  },
  'key-points': {
    formats: [
      { key: 'bullet', label: '要点列表', description: '清晰的关键点罗列', icon: '•' },
      { key: 'hierarchy', label: '层级结构', description: '带层级的结构化观点', icon: '📊' },
      { key: 'table', label: '对比表格', description: '多维度对比呈现', icon: '▦' }
    ],
    params: [
      {
        key: 'language',
        label: '语言',
        type: 'select',
        defaultValue: 'zh-CN',
        options: [
          { value: 'zh-CN', label: '简体中文' },
          { value: 'en-US', label: 'English' }
        ]
      },
      {
        key: 'max_points',
        label: '要点数量',
        type: 'range',
        defaultValue: 5,
        min: 3,
        max: 10,
        step: 1
      }
    ],
    supportsCustomPrompt: true,
    customPromptPlaceholder: '指定需要重点提炼的内容...',
    customPromptExamples: [
      '优先提取数据驱动的结论',
      '关注作者的核心论点',
      '提取可执行的要点'
    ]
  },
  'outline': {
    formats: [
      { key: 'hierarchical', label: '层级大纲', description: '多级标题结构', icon: '├' },
      { key: 'mindmap', label: '思维导图', description: '中心辐射式结构', icon: '🕸️' },
      { key: 'linear', label: '线性大纲', description: '顺序式结构', icon: '→' }
    ],
    params: [
      {
        key: 'language',
        label: '语言',
        type: 'select',
        defaultValue: 'zh-CN',
        options: [
          { value: 'zh-CN', label: '简体中文' },
          { value: 'en-US', label: 'English' }
        ]
      },
      {
        key: 'depth',
        label: '深度',
        type: 'radio',
        defaultValue: 'medium',
        options: [
          { value: 'shallow', label: '浅层', description: '2级结构' },
          { value: 'medium', label: '标准', description: '3级结构' },
          { value: 'deep', label: '深层', description: '4级结构' }
        ]
      }
    ],
    supportsCustomPrompt: true,
    customPromptPlaceholder: '指定大纲的特殊要求...',
    customPromptExamples: [
      '按时间顺序组织',
      '强调因果关系',
      '适合演讲的叙事结构'
    ]
  },
  'publish-polish': {
    formats: [
      { key: 'standard', label: '标准润色', description: '语言流畅度和清晰度提升', icon: '✨' },
      { key: 'professional', label: '专业风格', description: '学术/商务风格优化', icon: '👔' },
      { key: 'casual', label: '轻松风格', description: '口语化、易读性优化', icon: '☕' }
    ],
    params: [
      {
        key: 'language',
        label: '语言',
        type: 'select',
        defaultValue: 'zh-CN',
        options: [
          { value: 'zh-CN', label: '简体中文' },
          { value: 'en-US', label: 'English' }
        ]
      },
      {
        key: 'focus',
        label: '优化重点',
        type: 'radio',
        defaultValue: 'balanced',
        options: [
          { value: 'structure', label: '结构', description: '段落组织和逻辑流' },
          { value: 'language', label: '语言', description: '用词和句式优化' },
          { value: 'balanced', label: '平衡', description: '结构和语言兼顾' }
        ]
      }
    ],
    supportsCustomPrompt: true,
    customPromptPlaceholder: '指定特定的润色要求...',
    customPromptExamples: [
      '使标题更吸引人',
      '增强开头的吸引力',
      '改善段落间的过渡'
    ]
  },
  'agent-reach': {
    formats: [
      { key: 'web_search', label: '全网搜索', description: '使用 Agent-Reach 搜索全网内容', icon: '🌐' },
      { key: 'academic_search', label: '学术搜索', description: '搜索学术论文和期刊', icon: '🎓' },
      { key: 'news_search', label: '新闻搜索', description: '搜索最新新闻报道', icon: '📰' }
    ],
    params: [
      {
        key: 'language',
        label: '语言',
        type: 'select',
        defaultValue: 'zh-CN',
        options: [
          { value: 'zh-CN', label: '简体中文' },
          { value: 'en-US', label: 'English' },
          { value: 'all', label: '全部语言' }
        ]
      },
      {
        key: 'search_depth',
        label: '搜索深度',
        type: 'radio',
        defaultValue: 'standard',
        options: [
          { value: 'quick', label: '快速', description: '返回前10个结果' },
          { value: 'standard', label: '标准', description: '深入分析前20个结果' },
          { value: 'deep', label: '深度', description: '全面分析前50个结果' }
        ]
      },
      {
        key: 'source_filter',
        label: '来源筛选',
        type: 'select',
        defaultValue: 'all',
        options: [
          { value: 'all', label: '全部来源' },
          { value: 'news', label: '新闻网站' },
          { value: 'blog', label: '博客' },
          { value: 'academic', label: '学术' },
          { value: 'official', label: '官方网站' }
        ]
      }
    ],
    supportsCustomPrompt: true,
    customPromptPlaceholder: '指定搜索范围或特殊要求...',
    customPromptExamples: [
      '只搜索中文内容',
      '优先官方来源',
      '排除付费墙内容',
      '专注于特定时间段的内容'
    ]
  },
  notebooklm_learning: {
    formats: [
      { key: 'summary', label: '摘要', description: '生成简洁总结与核心要点', icon: '📝' },
      { key: 'flashcards', label: '闪卡', description: '生成适合记忆和复习的问答卡片', icon: '🗂️' },
      { key: 'mindmap', label: '脑图', description: '生成知识结构与概念关系图', icon: '🕸️' },
      { key: 'quiz', label: '测验', description: '生成可练习的题目与答案', icon: '❓' },
      { key: 'report', label: '报告', description: '生成结构化学习报告', icon: '📄' },
      { key: 'audio', label: '音频概览', description: '生成播客式音频讨论内容', icon: '🎧' },
      { key: 'video', label: '视频概览', description: '生成带讲解的视频摘要', icon: '🎬' },
      { key: 'infographic', label: '信息图', description: '生成可视化信息图表达', icon: '📊' },
      { key: 'slide_deck', label: '演示文稿', description: '生成可下载的演示文稿', icon: '📽️' },
      { key: 'data_table', label: '数据表格', description: '生成结构化数据表格', icon: '📋' }
    ],
    params: [
      {
        key: 'language',
        label: '输出语言',
        type: 'select',
        defaultValue: 'zh-CN',
        options: [
          { value: 'zh-CN', label: '简体中文' },
          { value: 'en-US', label: 'English' }
        ]
      },
      {
        key: 'sourceType',
        label: '来源类型',
        type: 'select',
        defaultValue: 'text',
        options: [
          { value: 'text', label: '文本' },
          { value: 'url', label: '网页链接' },
          { value: 'youtube', label: 'YouTube 视频' },
          { value: 'pdf', label: 'PDF 文档' }
        ]
      },
      {
        key: 'maxItems',
        label: '数量上限',
        type: 'range',
        defaultValue: 10,
        min: 3,
        max: 30,
        step: 1
      },
      {
        key: 'timeout',
        label: '超时时间',
        type: 'range',
        defaultValue: 120,
        min: 60,
        max: 600,
        step: 30
      }
    ],
    supportsCustomPrompt: true,
    customPromptPlaceholder: '输入原文、链接，或补充生成要求...',
    customPromptExamples: [
      '把这篇文章整理成 10 张复习闪卡',
      '基于这个链接生成中文脑图',
      '输出给新手读者，避免术语堆砌'
    ]
  },
  'slide-deck': {
    formats: [
      { key: 'detailed', label: '详细演示文稿', description: '一整套包含全文和详情的演示文稿，非常适合通过邮件发送或单独阅读。', icon: '📑' },
      { key: 'presentation', label: '演示用幻灯片', description: '简洁直观的幻灯片，附带要介绍的重点，为您的演讲提供全程支持。', icon: '🎬' }
    ],
    params: [
      {
        key: 'language',
        label: '选择语言',
        type: 'select',
        defaultValue: 'en-US',
        options: [
          { value: 'en-US', label: 'English' },
          { value: 'zh-CN', label: '简体中文' },
          { value: 'ja-JP', label: '日本語' }
        ]
      },
      {
        key: 'duration',
        label: '时长',
        type: 'radio',
        defaultValue: 'default',
        options: [
          { value: 'short', label: '短' },
          { value: 'default', label: '默认' }
        ]
      }
    ],
    supportsCustomPrompt: true,
    customPromptPlaceholder: '添加一份概略提纲，或指定受众、风格和重点："为新手用户创建一套演示文稿，采用大胆活泼的风格，注重分步说明。"',
    customPromptExamples: [
      '面向投资人的融资路演',
      '技术分享会的架构讲解',
      '团队周报汇总'
    ]
  },
  'infographic': {
    params: [
      {
        key: 'language',
        label: '选择语言',
        type: 'select',
        defaultValue: 'en-US',
        options: [
          { value: 'en-US', label: 'English' },
          { value: 'zh-CN', label: '简体中文' }
        ]
      },
      {
        key: 'orientation',
        label: '选择屏幕方向',
        type: 'radio',
        defaultValue: 'landscape',
        options: [
          { value: 'landscape', label: '横向' },
          { value: 'portrait', label: '纵向' },
          { value: 'square', label: '方形' }
        ]
      },
      {
        key: 'visual_style',
        label: '选择视觉风格',
        type: 'visual-picker',
        defaultValue: 'auto',
        options: [
          { value: 'auto', label: '自动选择', icon: '🔄' },
          { value: 'sketch-notes', label: '手绘笔记', icon: '✏️' },
          { value: 'cute', label: '可爱', icon: '💖' },
          { value: 'professional', label: '专业', icon: '🏢' },
          { value: 'scientific', label: '科学', icon: '🔬' },
          { value: 'anime', label: '动漫', icon: '🎌' },
          { value: 'minimal', label: '极简', icon: '⬜' },
          { value: 'vintage', label: '复古', icon: '📜' }
        ]
      },
      {
        key: 'detail_level',
        label: '详细程度',
        type: 'radio',
        defaultValue: 'standard',
        options: [
          { value: 'brief', label: '简短' },
          { value: 'standard', label: '标准' },
          { value: 'detailed', label: '详细', description: 'BETA 版' }
        ]
      }
    ],
    supportsCustomPrompt: true,
    customPromptPlaceholder: '指定风格、颜色或侧重点："使用蓝色主题，并强调 3 个关键统计数据。"',
    customPromptExamples: [
      '用时间线形式展示发展历程',
      '对比两种方案的优劣',
      '将数据可视化为图表'
    ]
  },
  'builders-daily-brief': {
    formats: [
      { key: 'ai_tools', label: 'AI 工具动态', description: '追踪最新 AI 产品发布、功能更新和技术突破', icon: '🤖' },
      { key: 'indie_hacker', label: '独立开发者', description: '关注独立开发者的产品发布、增长策略和经验分享', icon: '🚀' },
      { key: 'all', label: '综合简报', description: '覆盖 AI 工具、独立开发者、技术趋势的全面简报', icon: '📰' }
    ],
    params: [
      {
        key: 'language',
        label: '语言偏好',
        type: 'select',
        defaultValue: 'zh-CN',
        options: [
          { value: 'zh-CN', label: '简体中文' },
          { value: 'en-US', label: 'English' },
          { value: 'bilingual', label: '双语' }
        ]
      }
    ],
    supportsCustomPrompt: true,
    customPromptPlaceholder: '指定关注的 Builder 或主题："重点关注 Cursor、Bolt 和 v0 的最新动态"',
    customPromptExamples: [
      '关注 AI 编程工具的最新进展',
      '追踪 Sam Altman 和 Andrej Karpathy 的最新观点',
      '总结本周 AI 行业融资和产品发布'
    ]
  },
  'topic-decision': {
    formats: [
      { key: 'ai_tech', label: 'AI/科技', description: '追踪 AI 与科技领域的热门话题和趋势', icon: '🤖' },
      { key: 'side_hustle', label: '副业/搞钱', description: '发现副业机会、变现策略和增长案例', icon: '💰' },
      { key: 'product', label: '产品/设计', description: '产品设计趋势、用户体验案例分析', icon: '🎨' },
      { key: 'all', label: '综合选题', description: '跨领域综合热门选题推荐', icon: '🎯' }
    ],
    params: [
      {
        key: 'language',
        label: '输出语言',
        type: 'select',
        defaultValue: 'zh-CN',
        options: [
          { value: 'zh-CN', label: '简体中文' },
          { value: 'en-US', label: 'English' }
        ]
      }
    ],
    supportsCustomPrompt: true,
    customPromptPlaceholder: '指定赛道或关键词："聚焦 AI 编程工具赛道"',
    customPromptExamples: [
      '聚焦独立开发者出海方向',
      '关注 AIGC 内容创作工具',
      '寻找小红书爆款选题灵感'
    ]
  },
  'video-mindmap': {
    params: [
      {
        key: 'language',
        label: '输出语言',
        type: 'select',
        defaultValue: 'zh-CN',
        options: [
          { value: 'zh-CN', label: '简体中文' },
          { value: 'en-US', label: 'English' }
        ]
      },
      {
        key: 'depth',
        label: '脑图层级',
        type: 'radio',
        defaultValue: '3',
        options: [
          { value: '2', label: '2 层', description: '简洁概览' },
          { value: '3', label: '3 层', description: '标准深度' },
          { value: '4', label: '4 层', description: '详细展开' }
        ]
      }
    ],
    supportsCustomPrompt: true,
    customPromptPlaceholder: '输入视频链接，或指定关注的主题方向',
    customPromptExamples: [
      '重点提取技术架构相关内容',
      '聚焦商业模式和变现策略',
      '提取所有提到的工具和资源'
    ]
  },
  'article-layout': {
    formats: [
      { key: 'wechat', label: '公众号风格', description: '适配微信公众号的排版风格，段落分明、重点突出', icon: '💚' },
      { key: 'xiaohongshu', label: '小红书风格', description: '适配小红书的图文排版，轻松活泼、emoji 点缀', icon: '📕' },
      { key: 'clean', label: '简洁通用', description: '干净简洁的通用排版，适合多平台分发', icon: '✨' }
    ],
    params: [
      {
        key: 'language',
        label: '输出语言',
        type: 'select',
        defaultValue: 'zh-CN',
        options: [
          { value: 'zh-CN', label: '简体中文' },
          { value: 'en-US', label: 'English' }
        ]
      }
    ],
    supportsCustomPrompt: true,
    customPromptPlaceholder: '粘贴文章内容，或指定排版偏好',
    customPromptExamples: [
      '增加小标题和分段，提升可读性',
      '添加适当的 emoji 装饰',
      '优化开头的吸引力'
    ]
  },
  'cosmic-engraving': {
    params: [
      {
        key: 'language',
        label: '输出语言',
        type: 'select',
        defaultValue: 'zh-CN',
        options: [
          { value: 'zh-CN', label: '简体中文' },
          { value: 'en-US', label: 'English' }
        ]
      },
      {
        key: 'aspect_ratio',
        label: '画幅比例',
        type: 'radio',
        defaultValue: '1:1',
        options: [
          { value: '1:1', label: '1:1 方形' },
          { value: '16:9', label: '16:9 横屏' },
          { value: '9:16', label: '9:16 竖屏' }
        ]
      },
      {
        key: 'theme',
        label: '视觉主题',
        type: 'visual-picker',
        defaultValue: 'auto',
        options: [
          { value: 'auto', label: '自动选择', icon: '🔄' },
          { value: 'crystal-ball', label: '水晶球', icon: '🔮' },
          { value: 'quill-pen', label: '羽毛笔', icon: '✒️' },
          { value: 'gears', label: '齿轮', icon: '⚙️' },
          { value: 'compass', label: '指南针', icon: '🧭' },
          { value: 'library', label: '图书馆', icon: '📚' },
          { value: 'telescope', label: '望远镜', icon: '🔭' }
        ]
      }
    ],
    supportsCustomPrompt: true,
    customPromptPlaceholder: '描述配图主题："一个关于 AI 未来的科技感封面"',
    customPromptExamples: [
      '生成一张 AI 主题的公众号封面',
      '创作科技感十足的品牌视觉',
      '设计一张独立开发者主题的配图'
    ]
  },
  'wechat-publisher': {
    params: [
      {
        key: 'theme',
        label: '排版主题',
        type: 'radio',
        defaultValue: 'autumn-warm',
        options: [
          { value: 'autumn-warm', label: '秋日暖色', description: '温暖柔和的色调' },
          { value: 'spring-fresh', label: '春日清新', description: '清爽明亮的风格' },
          { value: 'ocean-calm', label: '海洋沉静', description: '沉稳大气的蓝色调' }
        ]
      }
    ],
    supportsCustomPrompt: false
  },
  'exam-quiz': {
    params: [
      {
        key: 'language',
        label: '输出语言',
        type: 'select',
        defaultValue: 'zh-CN',
        options: [
          { value: 'zh-CN', label: '简体中文' },
          { value: 'en-US', label: 'English' }
        ]
      },
      {
        key: 'question_count',
        label: '题目数量',
        type: 'range',
        defaultValue: 10,
        min: 5,
        max: 30,
        step: 1
      },
      {
        key: 'difficulty',
        label: '难度',
        type: 'radio',
        defaultValue: 'medium',
        options: [
          { value: 'easy', label: '简单', description: '基础概念' },
          { value: 'medium', label: '中等', description: '理解运用' },
          { value: 'hard', label: '困难', description: '综合分析' }
        ]
      }
    ],
    supportsCustomPrompt: true,
    customPromptPlaceholder: '指定考试范围或知识点',
    customPromptExamples: [
      '基于这篇文章的核心概念出题',
      '侧重实际应用场景的题目',
      '包含判断题和选择题'
    ]
  }
};

export function SkillConfigDialog({
  skill,
  isOpen,
  onClose,
  onExecute
}: SkillConfigDialogProps) {
  const configSchema = useMemo(() => {
    if (!skill) return null;

    // 首先检查 skill 自身的 defaultOptions 中是否有配置模式
    const skillOptions = skill.skill?.defaultOptions || {};
    if (skillOptions._configSchema) {
      return skillOptions._configSchema as SkillConfigSchema;
    }

    // 然后检查预设配置
    const presetKey = skill.id.replace(/-/g, '_');
    const presetConfig = SKILL_CONFIG_PRESETS[skill.id] || SKILL_CONFIG_PRESETS[presetKey];
    if (presetConfig) {
      return presetConfig;
    }

    // 返回默认配置
    return getDefaultConfigSchema(skill);
  }, [skill]);

  // 初始化参数值
  const [format, setFormat] = useState<string>('');
  const [paramValues, setParamValues] = useState<Record<string, unknown>>({});
  const [customPrompt, setCustomPrompt] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 当 skill 变化时重置参数
  useState(() => {
    if (!configSchema) return;

    // 设置默认格式
    if (configSchema.formats && configSchema.formats.length > 0) {
      setFormat(configSchema.formats[0].key);
    }

    // 设置默认参数值
    const defaults: Record<string, unknown> = {};
    configSchema.params.forEach((param) => {
      defaults[param.key] = param.defaultValue;
    });
    setParamValues(defaults);
    setCustomPrompt('');
    setShowAdvanced(false);
  });

  if (!isOpen || !skill || !configSchema) return null;

  const handleExecute = async () => {
    setIsExecuting(true);
    try {
      await onExecute({
        skillId: skill.id,
        format: format || undefined,
        params: paramValues,
        customPrompt: customPrompt.trim() || undefined,
        model: 'gpt-5.4',
        runtime: WORKFLOW_RUNTIME_SKILL_IDS.has(skill.id) ? 'openclaw' : 'legacy'
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleParamChange = (key: string, value: unknown) => {
    setParamValues((prev) => ({ ...prev, [key]: value }));
  };

  // 渲染格式选择卡片
  const renderFormatCards = () => {
    if (!configSchema.formats || configSchema.formats.length === 0) return null;

    return (
      <Field>
        <FieldLabel>格式</FieldLabel>
        <ToggleGroup
          type="single"
          value={format}
          onValueChange={(value) => {
            if (value) setFormat(value);
          }}
          className="grid grid-cols-2 items-stretch gap-3"
        >
          {configSchema.formats.map((fmt) => (
            <ToggleGroupItem
              key={fmt.key}
              value={fmt.key}
              aria-label={fmt.label}
              className="h-auto justify-start rounded-2xl border px-4 py-3.5 text-left data-[state=on]:border-ring data-[state=on]:bg-accent data-[state=on]:shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{fmt.label}</div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {fmt.description}
                  </p>
                </div>
                {format === fmt.key && (
                  <div className="flex-shrink-0 text-foreground">
                    <Check data-icon="inline-start" />
                  </div>
                )}
              </div>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
    );
  };

  // 渲染参数字段
  const renderParam = (param: SkillParam) => {
    const value = paramValues[param.key] ?? param.defaultValue;

    switch (param.type) {
      case 'select':
        return (
          <Field key={param.key}>
            <FieldLabel>{param.label}</FieldLabel>
            <Select
              value={String(value)}
              onValueChange={(nextValue) =>
                handleParamChange(param.key, nextValue)
              }
            >
              <SelectTrigger
                aria-label={param.label}
                className="h-11 rounded-2xl bg-background"
              >
                <SelectValue placeholder={param.label} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {param.options?.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {param.description && (
              <FieldDescription>{param.description}</FieldDescription>
            )}
          </Field>
        );

      case 'radio':
        return (
          <Field key={param.key}>
            <FieldLabel>{param.label}</FieldLabel>
            <ToggleGroup
              type="single"
              value={String(value)}
              onValueChange={(nextValue) => {
                if (nextValue) handleParamChange(param.key, nextValue);
              }}
              className="flex items-stretch gap-2"
            >
              {param.options?.map((opt) => (
                <ToggleGroupItem
                  key={opt.value}
                  value={opt.value}
                  aria-label={opt.label}
                  className="h-auto flex-1 flex-col rounded-2xl border px-4 py-3 data-[state=on]:border-ring data-[state=on]:bg-accent"
                >
                  <div className="flex items-center justify-center gap-1 text-sm">
                    {value === opt.value && <Check data-icon="inline-start" />}
                    <span>{opt.label}</span>
                  </div>
                  {opt.description && (
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {opt.description}
                    </div>
                  )}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
        );

      case 'range':
        return (
          <Field key={param.key}>
            <div className="flex items-center justify-between">
              <FieldLabel>{param.label}</FieldLabel>
              <span className="text-xs text-muted-foreground">
                {String(value)}
              </span>
            </div>
            <Slider
              min={param.min}
              max={param.max}
              step={param.step}
              value={[Number(value)]}
              onValueChange={([nextValue]) =>
                handleParamChange(param.key, nextValue)
              }
              aria-label={param.label}
            />
            {param.description && (
              <FieldDescription>{param.description}</FieldDescription>
            )}
          </Field>
        );

      case 'textarea':
        return (
          <Field key={param.key}>
            <FieldLabel>{param.label}</FieldLabel>
            <Textarea
              value={String(value)}
              onChange={(e) => handleParamChange(param.key, e.target.value)}
              rows={3}
              title={param.label}
              aria-label={param.label}
              className="resize-none rounded-2xl bg-background px-4 py-3"
            />
            {param.description && (
              <FieldDescription>{param.description}</FieldDescription>
            )}
          </Field>
        );

      case 'toggle':
        return (
          <Field
            key={param.key}
            orientation="horizontal"
            className="items-center justify-between sm:col-span-2"
          >
            <FieldContent>
              <FieldLabel>{param.label}</FieldLabel>
              {param.description && (
                <FieldDescription>{param.description}</FieldDescription>
              )}
            </FieldContent>
            <Switch
              checked={!!value}
              aria-label={param.label}
              onCheckedChange={(checked) =>
                handleParamChange(param.key, checked)
              }
            />
          </Field>
        );

      case 'visual-picker':
        return (
          <Field key={param.key} className="sm:col-span-2">
            <FieldLabel>{param.label}</FieldLabel>
            <ToggleGroup
              type="single"
              value={String(value)}
              onValueChange={(nextValue) => {
                if (nextValue) handleParamChange(param.key, nextValue);
              }}
              className="-mx-1 flex justify-start gap-3 overflow-x-auto px-1 pb-2"
            >
              {param.options?.map((opt) => (
                <ToggleGroupItem
                  key={opt.value}
                  value={opt.value}
                  aria-label={opt.label}
                  className="h-auto w-24 flex-shrink-0 flex-col rounded-2xl border p-2 text-center data-[state=on]:border-ring data-[state=on]:bg-accent data-[state=on]:shadow-sm"
                >
                  <div className="relative mb-1.5 flex aspect-square w-full items-center justify-center rounded-xl bg-muted text-2xl">
                    {opt.icon || '🎨'}
                    {value === opt.value && (
                      <div className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-[var(--product-action-bg)] text-[var(--product-action-text)]">
                        <Check data-icon="inline-start" />
                      </div>
                    )}
                  </div>
                  <div className="truncate text-xs font-medium">{opt.label}</div>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
        );

      default:
        return (
          <Field key={param.key}>
            <FieldLabel>{param.label}</FieldLabel>
            <Input
              type="text"
              value={String(value)}
              onChange={(e) => handleParamChange(param.key, e.target.value)}
              title={param.label}
              aria-label={param.label}
              className="h-11 rounded-2xl bg-background px-4"
            />
            {param.description && (
              <FieldDescription>{param.description}</FieldDescription>
            )}
          </Field>
        );
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isExecuting) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-3xl border-border p-0 shadow-2xl"
        overlayClassName="bg-slate-900/20 backdrop-blur-sm dark:bg-slate-900/60"
        showCloseButton={false}
      >
        <DialogHeader className="flex-shrink-0 border-b border-border px-8 py-6 text-left">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex size-11 flex-shrink-0 items-center justify-center rounded-2xl bg-accent text-xl shadow-sm">
                {skill.icon || '✨'}
              </div>
              <div className="min-w-0">
                <DialogTitle className="truncate text-xl font-bold">
                  {skill.displayName || skill.name}
                </DialogTitle>
                <DialogDescription className="mt-1">
                  {skill.description || '自定义参数并生成内容'}
                </DialogDescription>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              title="关闭"
              aria-label="关闭"
              disabled={isExecuting}
              className="flex-shrink-0 rounded-xl"
            >
              <X data-icon="inline-start" />
            </Button>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-8 py-6">
          <section className="rounded-2xl border border-violet-200 bg-violet-50/70 p-5 dark:border-violet-900/50 dark:bg-violet-950/20">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              快速生成作品草稿
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
              默认使用当前来源和推荐参数。需要控制语言、篇幅、格式或补充要求时，再展开高级设置。
            </p>
          </section>

          {showAdvanced ? renderFormatCards() : null}

          {showAdvanced && configSchema.params.length > 0 && (
            <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-700 dark:bg-slate-900/40">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  参数配置
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  根据当前任务调整输出语言、长度和重点。
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {configSchema.params.map((param) => {
                  const hasEnabledToggle = configSchema.params.some((p) => p.key === 'enabled' && p.type === 'toggle');
                  const isDisabledByToggle = hasEnabledToggle && param.key !== 'enabled' && !paramValues.enabled;
                  return (
                    <div key={`wrapper-${param.key}`} className={isDisabledByToggle ? 'pointer-events-none grid grid-cols-1 gap-4 opacity-40 sm:col-span-2 sm:grid-cols-2' : 'contents'}>
                      {renderParam(param)}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {showAdvanced && configSchema.supportsCustomPrompt && (
            <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-700 dark:bg-slate-900/40">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-500" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    额外要求
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    可补充语气、受众、写作偏好或重点约束。
                  </p>
                </div>
              </div>
              <Textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder={configSchema.customPromptPlaceholder}
                rows={4}
                className="resize-none rounded-2xl bg-background px-4 py-3"
              />
              {configSchema.customPromptExamples && configSchema.customPromptExamples.length > 0 && (
                <div className="rounded-2xl bg-white/80 px-4 py-3 dark:bg-slate-800/80">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">提示示例：</p>
                  <ul className="mt-2 space-y-2">
                    {configSchema.customPromptExamples.map((example, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300"
                      >
                        <span className="mt-1 text-violet-500">•</span>
                        <span>{example}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          <Button
            type="button"
            variant="link"
            onClick={() => setShowAdvanced((value) => !value)}
            className="h-auto p-0 text-sm font-medium"
          >
            {showAdvanced ? '收起高级设置' : '展开高级设置'}
          </Button>
        </div>

        <DialogFooter className="flex-shrink-0 gap-3 border-t border-border px-8 py-5 sm:space-x-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isExecuting}
            className="rounded-2xl"
          >
            取消
          </Button>
          <Button
            type="button"
            onClick={handleExecute}
            disabled={isExecuting}
            className="rounded-2xl bg-[var(--product-action-bg)] px-6 text-[var(--product-action-text)] hover:bg-[var(--product-action-hover)]"
          >
            {isExecuting ? (
              <>
                <Loader2 data-icon="inline-start" className="animate-spin" />
                执行中...
              </>
            ) : (
              <>生成作品草稿</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
