import type { SavedSummary } from '@/services/database';
import type { Project } from '@/services/workspace-api';

export type WorkflowStage = 'collect' | 'organize' | 'create' | 'deliver';

export interface ProjectWorkflowState {
  stage: WorkflowStage;
  sourceCount: number;
  selectedCount: number;
  outputCount: number;
}

export interface WorkspaceWorkflowOverview {
  sourceCount: number;
  outputCount: number;
  activeProjects: Project[];
  projectsWithSources: number;
  readyProjectCount: number;
  nextAction: {
    title: string;
    description: string;
    action: string;
  };
}

const OUTPUT_TAGS = new Set(['studio-note', 'chat-output']);

export function isOutputSummary(summary: SavedSummary): boolean {
  if (!Array.isArray(summary.tags)) return false;
  return summary.tags.some((tag) => OUTPUT_TAGS.has(tag));
}

export function isSourceSummary(summary: SavedSummary): boolean {
  return !isOutputSummary(summary);
}

export function getProjectSourceSummaries(
  summaries: SavedSummary[],
  projectId: string | null
): SavedSummary[] {
  return summaries.filter((summary) => {
    if (projectId && summary.projectId !== projectId) {
      return false;
    }
    return isSourceSummary(summary);
  });
}

export function getRecommendedSourceSummaries(
  sources: SavedSummary[],
  limit = 6
): SavedSummary[] {
  return [...sources]
    .filter((summary) => !summary.isSaving)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, limit);
}

export function getProjectOutputSummaries(
  summaries: SavedSummary[],
  projectId: string | null
): SavedSummary[] {
  return summaries.filter((summary) => {
    if (projectId && summary.projectId !== projectId) {
      return false;
    }
    return isOutputSummary(summary);
  });
}

export function getWorkflowStage({
  sourceCount,
  selectedCount,
  outputCount
}: {
  sourceCount: number;
  selectedCount: number;
  outputCount: number;
}): WorkflowStage {
  if (outputCount > 0) return 'deliver';
  if (selectedCount > 0) return 'create';
  if (sourceCount > 0) return 'organize';
  return 'collect';
}

export function getProjectWorkflowState({
  summaries,
  projectId,
  selectedCount
}: {
  summaries: SavedSummary[];
  projectId: string | null;
  selectedCount: number;
}): ProjectWorkflowState {
  const sourceCount = getProjectSourceSummaries(summaries, projectId).length;
  const outputCount = getProjectOutputSummaries(summaries, projectId).length;
  return {
    stage: getWorkflowStage({ sourceCount, selectedCount, outputCount }),
    sourceCount,
    selectedCount,
    outputCount
  };
}

export function getWorkspaceWorkflowOverview({
  summaries,
  projects,
  createProjectLabel = '新建项目'
}: {
  summaries: SavedSummary[];
  projects: Project[];
  createProjectLabel?: string;
}): WorkspaceWorkflowOverview {
  const sourceCount = summaries.filter(isSourceSummary).length;
  const outputCount = summaries.length - sourceCount;
  const activeProjects = projects.filter((project) => !project.archivedAt);
  const projectsWithSources = activeProjects.filter(
    (project) => (project.summaryCount || 0) > 0
  ).length;
  const readyProjectCount = activeProjects.filter(
    (project) => (project.summaryCount || 0) >= 3
  ).length;

  let nextAction: WorkspaceWorkflowOverview['nextAction'];
  if (activeProjects.length === 0) {
    nextAction = {
      title: '先建立一个创作项目',
      description: '用项目承载选题、素材和作品，后续的 AI 创作才有上下文。',
      action: createProjectLabel
    };
  } else if (sourceCount === 0) {
    nextAction = {
      title: '把第一批素材放进项目',
      description: '导入网页、视频、图片或文本，让工作台先拥有可处理的来源。',
      action: '进入项目采集'
    };
  } else if (readyProjectCount === 0) {
    nextAction = {
      title: '整理素材，形成创作上下文',
      description: '优先补齐一个项目的关键来源，再进入 Studio 生成作品。',
      action: '整理素材'
    };
  } else {
    nextAction = {
      title: '开始把素材变成作品',
      description: '选择一个素材充足的项目，进入 Studio 生成文章、报告或配图。',
      action: '开始创作'
    };
  }

  return {
    sourceCount,
    outputCount,
    activeProjects,
    projectsWithSources,
    readyProjectCount,
    nextAction
  };
}
