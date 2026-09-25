/**
 * 思考块组件
 * 显示 AI 的思考过程，支持折叠/展开
 * 默认收起，使用低调的灰色样式
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface ThinkingBlockProps {
  content: string;
  defaultCollapsed?: boolean;
  isStreaming?: boolean; // 是否正在流式输出中
}

/**
 * 思考块渲染组件
 */
export function ThinkingBlock({
  content,
  defaultCollapsed = true,
  isStreaming = false
}: ThinkingBlockProps) {
  const { t } = useTranslation('workspace');
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  if (!content) return null;

  return (
    <div className="my-1">
      {/* 头部 - 简洁的可点击行 */}
      <div
        className="inline-flex items-center gap-1 cursor-pointer text-muted-foreground hover:text-slate-600 transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        {/* 展开/收起图标 */}
        {isCollapsed ? (
          <ChevronRight className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )}

        {/* 标题 */}
        <span className="text-xs">
          {isStreaming
            ? t('thinkingBlock.thinking')
            : t('thinkingBlock.thinkingProcess')}
        </span>

        {/* 内容预览（折叠时显示） */}
        {isCollapsed && (
          <span className="text-xs text-muted-foreground truncate max-w-[200px]">
            · {content.slice(0, 30)}...
          </span>
        )}
      </div>

      {/* 展开内容 */}
      {!isCollapsed && (
        <div className="mt-1 pl-4 border-l-2 border-slate-200">
          <div className="text-xs text-slate-500 whitespace-pre-wrap leading-[1.95]">
            {content}
            {/* 流式输出时显示光标 */}
            {isStreaming && (
              <span className="inline-block w-1.5 h-3 bg-slate-400 animate-pulse ml-0.5" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ThinkingBlock;
