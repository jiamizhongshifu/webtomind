import { Plus, Trash2 } from 'lucide-react';
import type { StudioDocument } from '@/services/workspace-api';

interface StudioDocumentsListProps {
  documents: StudioDocument[];
  activeId: string | null;
  loading: boolean;
  creating: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function StudioDocumentsList({
  documents,
  activeId,
  loading,
  creating,
  onSelect,
  onCreate,
  onDelete
}: StudioDocumentsListProps) {
  return (
    <aside className="w-[260px] min-w-[220px] max-w-[320px] border-r border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/60 flex flex-col">
      <div className="px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          文档
        </div>
        <button
          type="button"
          onClick={onCreate}
          disabled={creating}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-blue-600 text-white disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" />
          新建
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {loading ? (
          <div className="text-xs text-slate-500 px-1 py-2">加载中...</div>
        ) : documents.length === 0 ? (
          <div className="text-xs text-slate-500 px-1 py-2">暂无文档</div>
        ) : (
          documents.map((doc) => {
            const active = doc.id === activeId;
            return (
              <div
                key={doc.id}
                className={`group rounded-lg border transition-colors ${
                  active
                    ? 'border-blue-200 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20'
                    : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(doc.id)}
                  className="w-full text-left px-2.5 py-2"
                >
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                    {doc.title || '未命名草稿'}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {formatTime(doc.updated_at)}
                  </div>
                </button>
                <div className="px-2.5 pb-2">
                  <button
                    type="button"
                    onClick={() => onDelete(doc.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1 text-[11px] text-red-500 hover:text-red-600"
                    title="删除文档"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    删除
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
