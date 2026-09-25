import { randomUUID } from 'crypto';
import * as db from '../services/supabase.js';
import { providerFactory } from './provider-factory.js';
import { executeOpenClawTask } from './openclaw-runtime.js';
import { getSkillMap } from '../skills/built-in-skills.js';
import type {
  AgentSkillDefinition,
  SkillPlannerType
} from '../skills/types.js';
import type { ChatContext, StreamChunk } from '../types/api.js';
import type {
  WorkspaceTaskRecord,
  WorkspaceTaskRequest,
  WorkspaceTaskResult,
  WorkspaceTaskStep
} from '../types/workspace-task.js';

export type WorkspaceTaskExecutorKind = 'direct' | 'openclaw';

export interface WorkspaceTaskExecutionInput {
  userId: string;
  task: WorkspaceTaskRequest;
}

export interface WorkspaceTaskExecutionOutput {
  taskRecord: WorkspaceTaskRecord;
  executor: WorkspaceTaskExecutorKind;
}

const skillMap = getSkillMap();

function buildTaskStep(
  id: string,
  title: string,
  kind: string,
  status: WorkspaceTaskStep['status'],
  detail?: string
): WorkspaceTaskStep {
  const now = Date.now();
  return {
    id,
    title,
    kind,
    status,
    startedAt: status === 'running' || status === 'completed' ? now : undefined,
    endedAt: status === 'completed' || status === 'failed' ? now : undefined,
    detail
  };
}

function resolveSkillDefinition(
  task: WorkspaceTaskRequest
): AgentSkillDefinition | undefined {
  if (!task.skillId) {
    return undefined;
  }
  return skillMap.get(task.skillId);
}

function resolvePlannerType(task: WorkspaceTaskRequest): SkillPlannerType {
  const skill = resolveSkillDefinition(task);
  return skill?.metadata.runtime?.planner || 'direct';
}

export function resolveWorkspaceTaskExecutor(
  task: WorkspaceTaskRequest
): WorkspaceTaskExecutorKind {
  const requestedRuntime = task.params.runtime;
  if (requestedRuntime === 'openclaw') {
    return 'openclaw';
  }

  if (task.type === 'search_source') {
    return 'openclaw';
  }

  const planner = resolvePlannerType(task);
  if (planner === 'workflow') {
    return 'openclaw';
  }

  return 'direct';
}

async function buildReferences(task: WorkspaceTaskRequest, userId: string): Promise<string | undefined> {
  const referenceContents = task.context.referenceContents || [];
  const summaryIds = task.context.selectedSummaryIds || [];

  if (referenceContents.length > 0) {
    const content = referenceContents
      .map((item) => `${item.title}\n${item.markdown || ''}`.trim())
      .filter(Boolean)
      .join('\n\n---\n\n');

    if (content) {
      return content;
    }
  }

  if (summaryIds.length === 0) {
    return undefined;
  }

  const chunks = await Promise.all(
    summaryIds.map(async (id) => {
      const summary = await db.getSummaryById(id, userId, task.context.projectId || undefined);
      if (!summary) {
        return null;
      }
      return `${summary.title}\n${summary.markdown || ''}`;
    })
  );

  const content = chunks.filter((item): item is string => !!item).join('\n\n---\n\n');
  return content || undefined;
}

function buildDirectPrompt(task: WorkspaceTaskRequest): string {
  const format = typeof task.params.format === 'string' ? task.params.format.trim() : '';
  const customPrompt =
    typeof task.params.customPrompt === 'string' ? task.params.customPrompt.trim() : '';
  const skillId = task.skillId || task.type;

  if (skillId === 'rewrite') {
    const lines: string[] = [];
    const language = typeof task.params.language === 'string' ? task.params.language.trim() : '';
    const languageLabelMap: Record<string, string> = {
      'zh-CN': '简体中文',
      'en-US': '英文',
      'ja-JP': '日文'
    };
    const languageLabel = language ? languageLabelMap[language] || language : '';

    lines.push('你是一个内容改写助手。');
    lines.push('你将收到一组已经提供好的参考正文。不要向用户索要原文，不要解释限制，不要输出任务说明。');
    lines.push('你的唯一目标是：直接基于已提供的参考正文产出改写结果。');
    lines.push('');
    lines.push('输出要求：');
    lines.push('- 直接输出改写后的正文');
    lines.push('- 保留原文核心信息，不要偏题');
    lines.push('- 语言更清晰、自然、适合发布');
    lines.push('- 不要输出“请把原文发我”“我无法执行”等元话术');
    lines.push('- 如果有多条参考内容，优先融合为一版连贯成稿');

    if (languageLabel) {
      lines.push(`- 输出语言：${languageLabel}`);
    }

    if (format) {
      lines.push(`- 输出格式要求：${format}`);
    }

    if (customPrompt) {
      lines.push(`- 额外要求：${customPrompt}`);
    }

    if (task.context.targetDocumentId) {
      lines.push('- 结果将写入当前文档，请输出可直接落稿的正文');
    }

    lines.push('');
    lines.push('下面开始直接生成改写结果。');
    return lines.join('\n');
  }

  const lines: string[] = [];
  lines.push(`执行技能: ${skillId}`);

  if (format) {
    lines.push(`\n格式: ${format}`);
  }

  if (customPrompt) {
    lines.push(`\n额外要求:\n${customPrompt}`);
  }

  const entries = Object.entries(task.params).filter(
    ([key, value]) =>
      key !== 'customPrompt' &&
      key !== 'runtime' &&
      key !== 'format' &&
      value !== undefined &&
      value !== null &&
      value !== ''
  );

  if (entries.length > 0) {
    lines.push('\n参数设置:');
    for (const [key, value] of entries) {
      lines.push(`- ${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
    }
  }

  if (task.context.targetDocumentId) {
    lines.push('\n目标: 写入现有文档');
  }

  return lines.join('\n');
}

async function executeDirectTask(
  task: WorkspaceTaskRequest,
  userId: string
): Promise<WorkspaceTaskResult> {
  const prompt = buildDirectPrompt(task);
  const references = await buildReferences(task, userId);
  const context: ChatContext = {
    userId,
    projectId: task.context.projectId || undefined,
    references
  };

  const agent = providerFactory.getProvider('auto', prompt);
  let content = '';
  const toolCalls: Array<Record<string, unknown>> = [];
  const toolResults: Array<Record<string, unknown>> = [];

  for await (const chunk of agent.chat(prompt, context, `workspace-task-${randomUUID()}`)) {
    const typedChunk = chunk as StreamChunk;
    if (typedChunk.type === 'text') {
      const data = typedChunk.data as { content?: string };
      content += data.content || '';
      continue;
    }

    if (typedChunk.type === 'tool_call') {
      toolCalls.push(typedChunk.data as Record<string, unknown>);
      continue;
    }

    if (typedChunk.type === 'tool_result') {
      toolResults.push(typedChunk.data as Record<string, unknown>);
      continue;
    }

    if (typedChunk.type === 'error') {
      const data = typedChunk.data as { message?: string };
      throw new Error(data.message || 'direct executor 执行失败');
    }
  }

  return {
    content: content || buildDirectResult(task).content,
    documentId: task.context.targetDocumentId ?? null,
    metadata: {
      executor: 'direct',
      mock: false,
      toolCalls,
      toolResults
    }
  };
}

function buildDirectResult(task: WorkspaceTaskRequest): WorkspaceTaskResult {
  const lines: string[] = [];
  lines.push(`# ${task.skillId || task.type}`);
  lines.push('');
  lines.push('已通过 direct executor 接收任务。');

  if (task.context.selectedSummaryIds?.length) {
    lines.push('');
    lines.push(`- 已选素材数：${task.context.selectedSummaryIds.length}`);
  }

  if (task.params && Object.keys(task.params).length > 0) {
    lines.push('');
    lines.push('## 参数');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(task.params, null, 2));
    lines.push('```');
  }

  return {
    content: lines.join('\n'),
    documentId: task.context.targetDocumentId ?? null,
    metadata: {
      executor: 'direct',
      mock: true
    }
  };
}

function buildOpenClawResult(task: WorkspaceTaskRequest): WorkspaceTaskResult {
  const lines: string[] = [];
  lines.push(`# ${task.skillId || task.type}`);
  lines.push('');
  lines.push('已通过 openclaw executor 接收任务。');
  lines.push('当前仍为受控骨架执行，已完成统一 task 分流。');

  if (task.context.projectId) {
    lines.push('');
    lines.push(`- 项目：${task.context.projectId}`);
  }

  if (task.context.selectedSummaryIds?.length) {
    lines.push(`- 已选素材数：${task.context.selectedSummaryIds.length}`);
  }

  if (task.params && Object.keys(task.params).length > 0) {
    lines.push('');
    lines.push('## 编排输入');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(task.params, null, 2));
    lines.push('```');
  }

  return {
    content: lines.join('\n'),
    documentId: task.context.targetDocumentId ?? null,
    metadata: {
      executor: 'openclaw',
      planner: resolvePlannerType(task),
      mock: true
    }
  };
}

export async function executeWorkspaceTask({
  userId,
  task
}: WorkspaceTaskExecutionInput): Promise<WorkspaceTaskExecutionOutput> {
  const now = Date.now();
  const executor = resolveWorkspaceTaskExecutor(task);

  try {
    const openClawExecution =
      executor === 'openclaw'
        ? await executeOpenClawTask({ userId, task })
        : null;

    const result =
      executor === 'openclaw'
        ? (openClawExecution?.result || buildOpenClawResult(task))
        : await executeDirectTask(task, userId);

    const steps: WorkspaceTaskStep[] =
      executor === 'openclaw'
        ? (openClawExecution?.steps || [
            buildTaskStep('prepare', '准备上下文', 'prepare', 'completed'),
            buildTaskStep('plan', '选择编排执行器', 'plan', 'completed'),
            buildTaskStep('execute', '运行 OpenClaw', 'execute', 'completed'),
            buildTaskStep('finish', '整理结果', 'finalize', 'completed')
          ])
        : [
            buildTaskStep('prepare', '准备任务', 'prepare', 'completed'),
            buildTaskStep('execute', '运行直连执行器', 'execute', 'completed'),
            buildTaskStep('finish', '整理结果', 'finalize', 'completed')
          ];

    return {
      executor,
      taskRecord: {
        id: randomUUID(),
        type: task.type,
        status: 'succeeded',
        skillId: task.skillId,
        toolId: task.toolId,
        params: task.params,
        context: task.context,
        createdAt: now,
        updatedAt: now,
        startedAt: now,
        endedAt: now,
        steps,
        result
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '任务执行失败';
    const failedSteps: WorkspaceTaskStep[] = [
      buildTaskStep('prepare', '准备任务', 'prepare', 'completed'),
      buildTaskStep('execute', executor === 'openclaw' ? '运行 OpenClaw' : '运行直连执行器', 'execute', 'failed', message)
    ];

    return {
      executor,
      taskRecord: {
        id: randomUUID(),
        type: task.type,
        status: 'failed',
        skillId: task.skillId,
        toolId: task.toolId,
        params: task.params,
        context: task.context,
        createdAt: now,
        updatedAt: now,
        startedAt: now,
        endedAt: now,
        error: message,
        steps: failedSteps,
        result: {
          content: '',
          documentId: task.context.targetDocumentId ?? null,
          metadata: {
            executor,
            failed: true,
            error: message
          }
        }
      }
    };
  }
}
