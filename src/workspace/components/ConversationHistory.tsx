import React from 'react';
import { ArrowLeft, Trash2, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ChatConversation } from '@/services/database';

interface ConversationHistoryProps {
  conversations: ChatConversation[];
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onBack: () => void;
}

/**
 * 对话历史列表组件
 */
export function ConversationHistory({
  conversations,
  onSelect,
  onDelete,
  onBack
}: ConversationHistoryProps) {
  const { t, i18n } = useTranslation('workspace');

  /**
   * 格式化时间显示
   */
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const locale = i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US';

    // 今天内显示时间
    if (diff < 24 * 60 * 60 * 1000 && date.getDate() === now.getDate()) {
      return date.toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    // 昨天
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear()
    ) {
      return t('conversationHistory.yesterday');
    }

    // 一周内显示星期几
    if (diff < 7 * 24 * 60 * 60 * 1000) {
      const dayKeys = [
        'conversationHistory.sunday',
        'conversationHistory.monday',
        'conversationHistory.tuesday',
        'conversationHistory.wednesday',
        'conversationHistory.thursday',
        'conversationHistory.friday',
        'conversationHistory.saturday'
      ] as const;
      return t(dayKeys[date.getDay()]);
    }

    // 其他显示日期
    return date.toLocaleDateString(locale, {
      month: 'numeric',
      day: 'numeric'
    });
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onDelete(id);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900">
      {/* 头部：返回按钮 + 标题 */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title={t('conversationHistory.back')}
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <h2 className="text-base font-medium text-slate-800 dark:text-slate-200">
          {t('conversationHistory.title')}
        </h2>
        <span className="text-sm text-muted-foreground dark:text-slate-500">
          ({conversations.length})
        </span>
      </header>

      {/* 对话列表 */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground dark:text-slate-500">
            <MessageSquare className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm">{t('conversationHistory.empty')}</p>
          </div>
        ) : (
          <div className="py-2">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className="group flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                {/* 对话图标 */}
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-blue-500" />
                </div>

                {/* 对话信息 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                      {conv.title || t('conversationHistory.newConversation')}
                    </h3>
                    <span className="flex-shrink-0 text-xs text-muted-foreground dark:text-slate-500">
                      {formatTime(conv.updatedAt)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground dark:text-slate-500 mt-0.5">
                    {t('conversationHistory.messageCount', {
                      count: conv.messageCount ?? conv.messages.length
                    })}
                  </p>
                </div>

                {/* 删除按钮 */}
                <button
                  onClick={(e) => handleDelete(e, conv.id)}
                  className="flex-shrink-0 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all"
                  title={t('conversationHistory.delete')}
                >
                  <Trash2 className="w-4 h-4 text-red-400 hover:text-red-500" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
