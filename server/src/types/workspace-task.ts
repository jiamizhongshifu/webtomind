export type WorkspaceTaskType =
  | 'skill'
  | 'text_to_image'
  | 'image_to_image'
  | 'search_source';

export type WorkspaceTaskStatus =
  | 'queued'
  | 'preparing'
  | 'running'
  | 'waiting_confirm'
  | 'writing_back'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type WorkspaceTaskStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed';

export interface WorkspaceTaskContext {
  projectId?: string | null;
  selectedSummaryIds?: string[];
  targetDocumentId?: string | null;
  currentImageIds?: string[];
  referenceContents?: Array<{
    id: string;
    title: string;
    markdown: string;
    url?: string;
  }>;
}

export interface WorkspaceTaskRequest {
  type: WorkspaceTaskType;
  skillId?: string;
  toolId?: string;
  params: Record<string, unknown>;
  context: WorkspaceTaskContext;
}

export interface WorkspaceTaskStep {
  id: string;
  title: string;
  kind: string;
  status: WorkspaceTaskStepStatus;
  startedAt?: number;
  endedAt?: number;
  detail?: string;
}

export interface WorkspaceTaskResult {
  content?: string;
  documentId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface WorkspaceTaskRecord {
  id: string;
  type: WorkspaceTaskType;
  status: WorkspaceTaskStatus;
  skillId?: string;
  toolId?: string;
  params: Record<string, unknown>;
  context: WorkspaceTaskContext;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  endedAt?: number;
  error?: string;
  steps: WorkspaceTaskStep[];
  result?: WorkspaceTaskResult;
}
