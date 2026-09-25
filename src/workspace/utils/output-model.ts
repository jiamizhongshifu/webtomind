import type {
  StudioDocument,
  StudioDocumentContentType
} from '@/services/workspace-api';

export type WorkspaceOutputStatus =
  | 'draft'
  | 'ready'
  | 'exported'
  | 'published';

export interface WorkspaceOutput {
  id: string;
  projectId: string;
  title: string;
  content: Record<string, unknown>;
  contentType: StudioDocumentContentType;
  status: WorkspaceOutputStatus;
  createdAt: string;
  updatedAt: string;
  source: StudioDocument;
}

export const OUTPUT_STATUS_LABELS: Record<WorkspaceOutputStatus, string> = {
  draft: '草稿',
  ready: '可交付',
  exported: '已导出',
  published: '已发布'
};

export function mapStudioDocumentToOutput(
  document: StudioDocument
): WorkspaceOutput {
  return {
    id: document.id,
    projectId: document.project_id,
    title: document.title || '未命名作品',
    content: document.content,
    contentType: document.content_type || 'text',
    status: document.status === 'published' ? 'published' : 'draft',
    createdAt: document.created_at,
    updatedAt: document.updated_at,
    source: document
  };
}

export function mapStudioDocumentsToOutputs(
  documents: StudioDocument[]
): WorkspaceOutput[] {
  return documents.map(mapStudioDocumentToOutput);
}

export function getOutputStatusLabel(status: WorkspaceOutputStatus): string {
  return OUTPUT_STATUS_LABELS[status];
}
