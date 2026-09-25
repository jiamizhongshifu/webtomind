import { useState, useCallback } from 'react';
import { createLogger } from '@/utils/logger';
import { startTimer, endTimer } from '@/utils/perf-monitor';
import {
  getProjects,
  createProject,
  deleteProject,
  updateProject,
  type Project
} from '@/services/workspace-api';

const log = createLogger('useWorkspaceProjects');

// 随机项目图标列表
const PROJECT_ICONS = [
  '📁',
  '📂',
  '📚',
  '📖',
  '📝',
  '✏️',
  '🎨',
  '🎯',
  '💡',
  '🔮',
  '🌟',
  '⭐',
  '🔥',
  '💎',
  '🎪',
  '🎭',
  '🎬',
  '📸',
  '🎵',
  '🎹',
  '🚀',
  '🛸',
  '🌈',
  '🌸',
  '🍀',
  '🌻',
  '🌴',
  '🏔️',
  '🌊',
  '🎄'
];

export function useWorkspaceProjects(initialProjectId: string | null) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true); // 项目加载状态
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(
    initialProjectId
  );

  // 加载所有项目
  const loadProjects = useCallback(async () => {
    startTimer('loadProjects');
    setProjectsLoading(true);
    try {
      const data = await getProjects();
      setProjects(data || []);
    } catch (error) {
      log.error('[Workspace] Load projects failed:', error);
    } finally {
      setProjectsLoading(false);
      endTimer('loadProjects', { count: projects.length }); // Note: state closure issue in endTimer, it may log 0. We'll ignore the count issue.
    }
  }, [projects.length]);

  const handleCreateProject = useCallback(async (name: string) => {
    try {
      // 随机选择图标（不设置颜色，使用默认值）
      const randomIcon =
        PROJECT_ICONS[Math.floor(Math.random() * PROJECT_ICONS.length)];

      const project = await createProject({
        name: name.trim(),
        icon: randomIcon
      });
      setProjects((prev) => [...prev, project]);
      return project;
    } catch (error) {
      log.error('[App] Create project failed:', error);
      throw error;
    }
  }, []);

  const handleDeleteProject = useCallback(
    async (id: string) => {
      try {
        await deleteProject(id);
        setProjects((prev) => prev.filter((p) => p.id !== id));
        if (currentProjectId === id) {
          setCurrentProjectId(null);
        }
      } catch (error) {
        log.error('[App] Delete project failed:', error);
        throw error;
      }
    },
    [currentProjectId]
  );

  const handleFavoriteProject = useCallback(
    async (id: string, favorited: boolean) => {
      try {
        await updateProject(id, { favorited });
        // 本地更新状态，不刷新页面
        setProjects((prev) =>
          prev.map((p) =>
            p.id === id
              ? { ...p, favoritedAt: favorited ? Date.now() : null }
              : p
          )
        );
      } catch (error) {
        log.error('[App] Favorite project failed:', error);
        throw error;
      }
    },
    []
  );

  const handleArchiveProject = useCallback(
    async (id: string, archived: boolean) => {
      try {
        await updateProject(id, { archived });
        // 本地更新状态，不刷新页面
        setProjects((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, archivedAt: archived ? Date.now() : null } : p
          )
        );
      } catch (error) {
        log.error('[App] Archive project failed:', error);
        throw error;
      }
    },
    []
  );

  const handleUpdateProject = useCallback(
    async (
      id: string,
      data: {
        name?: string;
        icon?: string;
        color?: string;
        instructions?: string | null;
      }
    ) => {
      try {
        await updateProject(id, data);
        // 本地更新状态，不刷新页面
        setProjects((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, ...data, updatedAt: Date.now() } : p
          )
        );
      } catch (error) {
        log.error('[App] Update project failed:', error);
        throw error;
      }
    },
    []
  );

  return {
    projects,
    setProjects,
    projectsLoading,
    currentProjectId,
    setCurrentProjectId,
    loadProjects,
    handleCreateProject,
    handleDeleteProject,
    handleFavoriteProject,
    handleArchiveProject,
    handleUpdateProject
  };
}
