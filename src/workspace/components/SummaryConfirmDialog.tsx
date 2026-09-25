/**
 * Summary 确认对话框组件
 * 用于 Agent 创建/更新/删除卡片时的用户确认
 */

import React from 'react';
import {
  AlertTriangle,
  Check,
  Edit3,
  FileText,
  Loader2,
  Trash2,
  X
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/radix/alert';
import { Badge } from '@/shared/ui/radix/badge';
import { Button } from '@/shared/ui/radix/button';
import { cn } from '@/lib/utils';

interface SummaryPreview {
  title: string;
  content: string;
  url?: string | null;
  tags: string[];
  projectId: string;
}

interface SummaryUpdateData {
  id: string;
  original: {
    title: string;
    content: string;
    tags: string[];
  };
  updated: {
    title: string;
    content: string;
    tags: string[];
  };
  projectId: string;
}

interface SummaryDeleteData {
  summary: {
    id: string;
    title: string;
    url?: string | null;
    tags: string[];
  };
  projectId: string;
}

export type SummaryConfirmType = 'create' | 'update' | 'delete';

export interface SummaryConfirmDialogProps {
  type: SummaryConfirmType;
  data: SummaryPreview | SummaryUpdateData | SummaryDeleteData;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function SummaryConfirmDialog({
  type,
  data,
  onConfirm,
  onCancel,
  loading = false
}: SummaryConfirmDialogProps): React.ReactElement {
  const getIcon = () => {
    switch (type) {
      case 'create':
        return <FileText className="size-5 text-foreground" />;
      case 'update':
        return <Edit3 className="size-5 text-foreground" />;
      case 'delete':
        return <Trash2 className="size-5 text-destructive" />;
    }
  };

  const getTitle = () => {
    switch (type) {
      case 'create':
        return '创建新卡片';
      case 'update':
        return '更新卡片';
      case 'delete':
        return '删除卡片';
    }
  };

  const getConfirmButtonText = () => {
    if (loading) return '处理中...';
    switch (type) {
      case 'create':
        return '确认创建';
      case 'update':
        return '确认更新';
      case 'delete':
        return '确认删除';
    }
  };

  const renderContent = () => {
    switch (type) {
      case 'create':
        return renderCreatePreview(data as SummaryPreview);
      case 'update':
        return renderUpdatePreview(data as SummaryUpdateData);
      case 'delete':
        return renderDeleteConfirm(data as SummaryDeleteData);
    }
  };

  return (
    <div className="w-full max-w-lg overflow-hidden rounded-lg border bg-background shadow-lg">
      <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-3">
        <div className="flex items-center gap-2">
          {getIcon()}
          <span className="font-medium text-foreground">{getTitle()}</span>
        </div>
        <Button
          disabled={loading}
          onClick={onCancel}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X data-icon="inline-start" />
          <span className="sr-only">关闭</span>
        </Button>
      </div>

      <div className="p-4">{renderContent()}</div>

      <div className="flex justify-end gap-2 border-t bg-muted/50 px-4 py-3">
        <Button
          disabled={loading}
          onClick={onCancel}
          type="button"
          variant="outline"
        >
          取消
        </Button>
        <Button
          className={cn(
            type !== 'delete' &&
              'bg-foreground text-background hover:bg-foreground/90'
          )}
          disabled={loading}
          onClick={onConfirm}
          type="button"
          variant={type === 'delete' ? 'destructive' : 'default'}
        >
          {loading ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <Check data-icon="inline-start" />
          )}
          {getConfirmButtonText()}
        </Button>
      </div>
    </div>
  );
}

function DetailLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-medium text-muted-foreground">{children}</div>
  );
}

function SummaryTextBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1 max-h-32 overflow-y-auto rounded bg-muted p-2 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function renderCreatePreview(data: SummaryPreview): React.ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <DetailLabel>标题</DetailLabel>
        <p className="font-medium text-foreground">{data.title}</p>
      </div>

      {data.url && (
        <div>
          <DetailLabel>来源</DetailLabel>
          <p className="truncate text-sm text-foreground">{data.url}</p>
        </div>
      )}

      {data.tags.length > 0 && (
        <div>
          <DetailLabel>标签</DetailLabel>
          <div className="mt-1 flex flex-wrap gap-1">
            {data.tags.map((tag, i) => (
              <Badge key={i} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div>
        <DetailLabel>内容预览</DetailLabel>
        <SummaryTextBox>
          {data.content.length > 300
            ? data.content.substring(0, 300) + '...'
            : data.content}
        </SummaryTextBox>
      </div>
    </div>
  );
}

function renderUpdatePreview(data: SummaryUpdateData): React.ReactElement {
  const hasChanges = {
    title: data.original.title !== data.updated.title,
    content: data.original.content !== data.updated.content,
    tags:
      JSON.stringify(data.original.tags) !== JSON.stringify(data.updated.tags)
  };

  return (
    <div className="flex flex-col gap-3">
      {hasChanges.title && (
        <div>
          <DetailLabel>标题变更</DetailLabel>
          <div className="mt-1 flex flex-col gap-1">
            <p className="text-sm text-destructive line-through">
              {data.original.title}
            </p>
            <p className="text-sm text-foreground">{data.updated.title}</p>
          </div>
        </div>
      )}

      {hasChanges.tags && (
        <div>
          <DetailLabel>标签变更</DetailLabel>
          <div className="mt-1 flex flex-col gap-1">
            <div className="flex flex-wrap gap-1">
              {data.original.tags.map((tag, i) => (
                <Badge key={i} className="line-through" variant="destructive">
                  {tag}
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {data.updated.tags.map((tag, i) => (
                <Badge key={i} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      {hasChanges.content && (
        <div>
          <DetailLabel>内容已修改</DetailLabel>
          <SummaryTextBox>
            {data.updated.content.length > 300
              ? data.updated.content.substring(0, 300) + '...'
              : data.updated.content}
          </SummaryTextBox>
        </div>
      )}

      {!hasChanges.title && !hasChanges.content && !hasChanges.tags && (
        <p className="text-sm text-muted-foreground">没有检测到变更</p>
      )}
    </div>
  );
}

function renderDeleteConfirm(data: SummaryDeleteData): React.ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <Alert variant="destructive">
        <AlertTriangle className="size-4" />
        <AlertTitle>此操作不可撤销</AlertTitle>
        <AlertDescription>删除后卡片内容将永久丢失</AlertDescription>
      </Alert>

      <div>
        <DetailLabel>即将删除</DetailLabel>
        <p className="mt-1 font-medium text-foreground">{data.summary.title}</p>
      </div>

      {data.summary.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {data.summary.tags.map((tag, i) => (
            <Badge key={i} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export default SummaryConfirmDialog;
