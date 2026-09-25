/**
 * 工具调用块组件
 * 显示 Server Agent 的工具调用状态和结果
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Wrench,
  AlertCircle
} from 'lucide-react';

export type ToolCallState =
  | 'pending'
  | 'running'
  | 'completed'
  | 'error'
  | 'cancelled';

export interface ToolCallData {
  id: string;
  name: string;
  params?: Record<string, unknown>;
  status: ToolCallState;
  result?: string | { success: boolean; data?: unknown; error?: string };
  requiresConfirmation?: boolean;
  timestamp: number;
  runId?: string;
  stepId?: number;
  retryFromStepId?: number;
}

interface ToolCallBlockProps {
  toolCall: ToolCallData;
  onConfirm?: () => void;
  onCancel?: () => void;
}

const statusConfig: Record<
  ToolCallState,
  { icon: React.ReactNode; textKey: string; className: string }
> = {
  pending: {
    icon: <Loader2 className="w-4 h-4 animate-spin" />,
    textKey: 'toolCallBlock.pending',
    className: 'text-slate-500 bg-slate-50'
  },
  running: {
    icon: <Loader2 className="w-4 h-4 animate-spin" />,
    textKey: 'toolCallBlock.running',
    className: 'text-blue-600 bg-blue-50'
  },
  completed: {
    icon: <CheckCircle2 className="w-4 h-4" />,
    textKey: 'toolCallBlock.completed',
    className: 'text-green-600 bg-green-50'
  },
  error: {
    icon: <XCircle className="w-4 h-4" />,
    textKey: 'toolCallBlock.error',
    className: 'text-red-600 bg-red-50'
  },
  cancelled: {
    icon: <AlertCircle className="w-4 h-4" />,
    textKey: 'toolCallBlock.cancelled',
    className: 'text-amber-600 bg-amber-50'
  }
};

/**
 * 工具调用块渲染组件
 */
export function ToolCallBlock({
  toolCall,
  onConfirm,
  onCancel
}: ToolCallBlockProps) {
  const { t } = useTranslation('workspace');
  const [isExpanded, setIsExpanded] = useState(false);
  const config = statusConfig[toolCall.status] || statusConfig.pending;

  // 格式化工具名称
  const formatToolName = (name: string) => {
    return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  // 格式化参数显示
  const formatParams = (params?: Record<string, unknown>) => {
    if (!params || Object.keys(params).length === 0) return null;
    return JSON.stringify(params, null, 2);
  };

  // 格式化结果显示
  const formatResult = (
    result?: string | { success: boolean; data?: unknown; error?: string }
  ) => {
    if (!result) return null;
    if (typeof result === 'string') return result;
    // 对象格式的结果
    if (result.error) return `${t('toolCallBlock.errorPrefix')}${result.error}`;
    if (result.data) return JSON.stringify(result.data, null, 2);
    return result.success
      ? t('toolCallBlock.execSuccess')
      : t('toolCallBlock.execFailed');
  };


  const getResultError = (
    result?: string | { success: boolean; data?: unknown; error?: string }
  ): string | undefined => {
    if (!result) return undefined;
    if (typeof result === 'string') return result;
    return result.error;
  };

  const resultError = getResultError(toolCall.result);
  const formatTime = (ts: number): string => {
    return new Date(ts).toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div
      data-testid={`tool-call-block-${toolCall.id}`}
      className={`my-2 rounded-xl border ${config.className.includes('bg-') ? config.className.split(' ').find((c) => c.startsWith('bg-')) : 'bg-slate-50'} border-slate-200 overflow-hidden`}
    >
      {/* 头部 */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-black/5 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* 展开/收起图标 */}
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}

        {/* 工具图标 */}
        <Wrench className="w-4 h-4 text-slate-500" />

        {/* 工具名称 */}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-slate-700 truncate">
            {formatToolName(toolCall.name)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {toolCall.stepId !== undefined
              ? `Step ${toolCall.stepId}`
              : 'Step -'}
            {` · ${formatTime(toolCall.timestamp)}`}
            {toolCall.retryFromStepId !== undefined
              ? ` · from Step ${toolCall.retryFromStepId}`
              : ''}
          </div>
          {toolCall.requiresConfirmation && toolCall.status === 'pending' && (
            <div className="mt-0.5 text-[11px] text-amber-600">
              {t('toolCallBlock.requiresConfirmation')}
            </div>
          )}
          {resultError &&
            (toolCall.status === 'cancelled' || toolCall.status === 'error') && (
              <div
                className={`text-[11px] truncate mt-0.5 ${toolCall.status === 'cancelled' ? 'text-amber-600' : 'text-red-600'}`}
              >
                {resultError}
              </div>
            )}
        </div>

        {/* 状态 */}
        <div
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${config.className}`}
        >
          {config.icon}
          <span>
            {toolCall.status === 'pending' && t('toolCallBlock.pending')}
            {toolCall.status === 'running' && t('toolCallBlock.running')}
            {toolCall.status === 'completed' && t('toolCallBlock.completed')}
            {toolCall.status === 'error' && t('toolCallBlock.error')}
            {toolCall.status === 'cancelled' && t('toolCallBlock.cancelled')}
          </span>
        </div>
      </div>

      {/* 确认按钮（如果需要确认） */}
      {toolCall.requiresConfirmation && toolCall.status === 'pending' && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-slate-200 bg-amber-50">
          <AlertCircle className="w-4 h-4 text-amber-500" />
          <span className="text-sm text-amber-700 flex-1">
            {t('toolCallBlock.requiresConfirmation')}
          </span>
          {onConfirm && (
            <button
              data-testid={`tool-confirm-button-${toolCall.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onConfirm();
              }}
              className="px-3 py-1 text-xs font-medium text-white bg-green-500 hover:bg-green-600 rounded-lg transition-colors"
            >
              {t('toolCallBlock.confirm')}
            </button>
          )}
          {onCancel && (
            <button
              data-testid={`tool-cancel-button-${toolCall.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onCancel();
              }}
              className="px-3 py-1 text-xs font-medium text-slate-600 bg-slate-200 hover:bg-slate-300 rounded-lg transition-colors"
            >
              {t('toolCallBlock.cancel')}
            </button>
          )}
        </div>
      )}

      {/* 展开内容 */}
      {isExpanded && (
        <div className="px-3 py-2 border-t border-slate-200 space-y-2">
          {/* 参数 */}
          {toolCall.params && Object.keys(toolCall.params).length > 0 && (
            <div>
              <div className="text-xs font-medium text-slate-500 mb-1">
                {t('toolCallBlock.params')}
              </div>
              <pre className="text-xs bg-slate-100 rounded p-2 overflow-x-auto text-slate-700">
                {formatParams(toolCall.params)}
              </pre>
            </div>
          )}

          {/* 结果 */}
          {toolCall.result && (
            <div>
              <div className="text-xs font-medium text-slate-500 mb-1">
                {t('toolCallBlock.result')}
              </div>
              <div className="text-sm text-slate-700 bg-slate-100 rounded p-2">
                {formatResult(toolCall.result)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ToolCallBlock;
