/**
 * 建议块组件
 * 显示 AI 的下一步建议，帮助用户进一步探索
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Lightbulb, ArrowRight } from 'lucide-react';

interface SuggestionsBlockProps {
  content: string;
  defaultCollapsed?: boolean;
}

/**
 * 解析建议内容，提取列表项
 */
function parseSuggestions(content: string): string[] {
  const lines = content.split('\n').filter((line) => line.trim());
  const suggestions: string[] = [];

  for (const line of lines) {
    // 匹配列表项：- xxx 或 * xxx 或 数字. xxx
    const match = line.match(/^[-*•]\s*(.+)$/) || line.match(/^\d+\.\s*(.+)$/);
    if (match) {
      suggestions.push(match[1].trim());
    } else if (line.trim()) {
      // 非列表格式的建议也保留
      suggestions.push(line.trim());
    }
  }

  return suggestions;
}

/**
 * 建议块渲染组件
 */
export function SuggestionsBlock({
  content,
  defaultCollapsed = false
}: SuggestionsBlockProps) {
  const { t } = useTranslation('workspace');
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  if (!content) return null;

  const suggestions = parseSuggestions(content);

  return (
    <div className="my-3 rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 overflow-hidden">
      {/* 头部 */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-amber-100/50 transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        {/* 展开/收起图标 */}
        {isCollapsed ? (
          <ChevronRight className="w-4 h-4 text-amber-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-amber-500" />
        )}

        {/* 灯泡图标 */}
        <Lightbulb className="w-4 h-4 text-amber-600" />

        {/* 标题 */}
        <span className="font-medium text-sm text-amber-800">
          {t('messageBlocks.nextSuggestions')}
        </span>

        {/* 建议数量 */}
        <span className="text-xs text-amber-500 bg-amber-100 px-1.5 py-0.5 rounded-full">
          {t('suggestions.count', { count: suggestions.length })}
        </span>

        {/* 折叠时显示第一条预览 */}
        {isCollapsed && suggestions.length > 0 && (
          <span className="text-xs text-amber-500 truncate flex-1 ml-2">
            {suggestions[0].slice(0, 40)}...
          </span>
        )}
      </div>

      {/* 展开内容 */}
      {!isCollapsed && (
        <div className="px-3 py-2 border-t border-amber-200/50">
          <div className="space-y-2.5">
            {suggestions.map((suggestion, index) => (
              <div
                key={index}
                className="flex items-start gap-2 text-sm text-amber-900 hover:bg-amber-100/30 rounded-lg p-1.5 -mx-1.5 transition-colors leading-[1.95]"
              >
                <ArrowRight className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                <span className="flex-1">{suggestion}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default SuggestionsBlock;
