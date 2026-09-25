import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { createLogger } from '@/utils/logger';
import { FileText, MoreHorizontal, RotateCcw, Trash2, X } from 'lucide-react';

const log = createLogger('TrashPanel');
import {
  getTrashItems,
  restoreTrashItem,
  permanentlyDeleteTrashItem,
  TrashItem,
  Project
} from '@/services/workspace-api';

interface TrashPanelProps {
  projects: Project[];
  onRestore?: (id: string) => void;
}

export const TrashPanel: React.FC<TrashPanelProps> = ({
  projects,
  onRestore
}) => {
  const { t } = useTranslation(['workspace']);
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 加载回收站数据
  useEffect(() => {
    loadTrashItems();
  }, []);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    };
    if (activeMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [activeMenu]);

  const loadTrashItems = async () => {
    try {
      setLoading(true);
      const data = await getTrashItems();
      setItems(data);
    } catch (error) {
      log.error('[Trash] Load failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await restoreTrashItem(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      setActiveMenu(null);
      onRestore?.(id);
    } catch (error) {
      log.error('[Trash] Restore failed:', error);
    }
  };

  const handlePermanentDelete = async (id: string) => {
    try {
      await permanentlyDeleteTrashItem(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      setConfirmDelete(null);
      setActiveMenu(null);
    } catch (error) {
      log.error('[Trash] Permanent delete failed:', error);
    }
  };

  const getProjectName = (projectId?: string) => {
    if (!projectId) return t('trash.noProject');
    const project = projects.find((p) => p.id === projectId);
    return project?.name || t('trash.noProject');
  };

  return (
    <div className="flex-1 p-8 overflow-auto">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-8">
        {t('trash.title')}
      </h1>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground dark:text-slate-500 mt-20">
          <style>{`
            @keyframes flyInPaper {
              0% { transform: translate(-30px, -40px) rotate(-45deg) scale(0.5); opacity: 0; }
              20% { opacity: 1; }
              40% { transform: translate(0, 0) rotate(10deg) scale(1); opacity: 1; }
              60% { transform: translate(0, 5px) rotate(0deg) scale(0.95); opacity: 1; }
              100% { opacity: 0; transform: translate(0, 15px) scale(0.9); }
            }
            @keyframes lidBounce {
              0%, 100% { transform: translateY(0) rotate(0); }
              40% { transform: translateY(-8px) rotate(-5deg); }
              60% { transform: translateY(2px) rotate(2deg); }
            }
            .anim-paper { animation: flyInPaper 4s ease-in-out infinite; transform-origin: center; }
            .anim-lid { animation: lidBounce 4s ease-in-out infinite; transform-origin: left bottom; }
          `}</style>
          <div className="relative w-32 h-32 mb-6">
            <svg className="w-full h-full" viewBox="0 0 100 100" fill="none">
              {/* Back part of bin */}
              <ellipse cx="50" cy="30" rx="25" ry="8" fill="#e2e8f0" />
              <path
                d="M 25 30 L 32 80 C 32 85 40 88 50 88 C 60 88 68 85 68 80 L 75 30"
                fill="#f1f5f9"
              />
              {/* Vertical lines */}
              <line
                x1="40"
                y1="40"
                x2="43"
                y2="78"
                stroke="#cbd5e1"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <line
                x1="50"
                y1="40"
                x2="50"
                y2="78"
                stroke="#cbd5e1"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <line
                x1="60"
                y1="40"
                x2="57"
                y2="78"
                stroke="#cbd5e1"
                strokeWidth="2"
                strokeLinecap="round"
              />

              {/* Flying paper crumple */}
              <g className="anim-paper">
                <path
                  d="M45 15 C 50 10, 60 15, 55 25 C 65 20, 70 30, 60 35 C 65 45, 50 45, 45 35 C 35 40, 35 30, 40 25 C 30 20, 40 10, 45 15 Z"
                  fill="#94a3b8"
                  opacity="0.8"
                />
                <path
                  d="M42 20 L 58 28 M48 18 L 45 32 M55 22 L 48 30"
                  stroke="#f8fafc"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </g>

              {/* Lid */}
              <g className="anim-lid">
                <ellipse
                  cx="50"
                  cy="30"
                  rx="26"
                  ry="9"
                  fill="#cbd5e1"
                  stroke="#94a3b8"
                  strokeWidth="2"
                />
                <path
                  d="M 45 25 L 55 25 Q 58 25 58 22 L 42 22 Q 42 25 45 25 Z"
                  fill="#94a3b8"
                />
              </g>
            </svg>
          </div>
          <p className="text-lg font-medium">{t('trash.empty')}</p>
          <p className="text-sm mt-1">{t('trash.emptyDesc')}</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          {/* 表头 */}
          <div className="grid grid-cols-[1fr_200px_80px] gap-4 px-4 py-3 border-b border-slate-100 dark:border-slate-700 text-sm font-medium text-slate-500">
            <div>{t('trash.columns.name')}</div>
            <div>{t('trash.columns.project')}</div>
            <div>{t('trash.columns.actions')}</div>
          </div>

          {/* 列表 */}
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {items.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[1fr_200px_80px] gap-4 px-4 py-3 items-center hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                {/* 名称 */}
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="w-5 h-5 text-muted-foreground dark:text-slate-500 flex-shrink-0" />
                  <span className="text-sm text-slate-700 dark:text-slate-300 truncate">
                    {item.title}
                  </span>
                </div>

                {/* 项目 */}
                <div className="text-sm text-slate-500 truncate">
                  {getProjectName(item.projectId)}
                </div>

                {/* 操作 */}
                <div
                  className="relative"
                  ref={activeMenu === item.id ? menuRef : null}
                >
                  <button
                    onClick={() =>
                      setActiveMenu(activeMenu === item.id ? null : item.id)
                    }
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600 text-muted-foreground hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  >
                    <MoreHorizontal className="w-5 h-5" />
                  </button>

                  {activeMenu === item.id && (
                    <div className="absolute right-0 top-full mt-1 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1 min-w-[140px] z-50">
                      <button
                        onClick={() => handleRestore(item.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                      >
                        <RotateCcw className="w-4 h-4" />
                        {t('trash.actions.restore')}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(item.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        {t('trash.actions.deletePermanently')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 确认删除弹窗 */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 dark:bg-black/50">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-[400px] max-w-[calc(100vw-2rem)] overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {t('trash.confirmDelete.title')}
              </h3>
              <button
                onClick={() => setConfirmDelete(null)}
                className="p-1 text-muted-foreground hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <p className="text-sm text-slate-500">
                {t('trash.confirmDelete.desc')}
              </p>
            </div>
            <div className="flex justify-end gap-3 p-5 pt-0">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                {t('trash.confirmDelete.cancel')}
              </button>
              <button
                onClick={() => handlePermanentDelete(confirmDelete)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
              >
                {t('trash.confirmDelete.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrashPanel;
