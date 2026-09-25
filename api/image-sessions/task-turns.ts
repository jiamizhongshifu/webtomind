import type { SupabaseClient } from '@supabase/supabase-js';

type ImageTaskStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

interface ImageTaskRow {
  id: string;
  user_id: string;
  status: ImageTaskStatus;
  request_payload: Record<string, unknown> | null;
  result_payload: Record<string, unknown> | null;
  generation_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImageTaskTurnRow {
  id: string;
  session_id: string;
  user_id: string;
  prompt: string;
  negative_prompt: string | null;
  status: 'pending' | 'running' | 'partial' | 'succeeded' | 'failed';
  context: Record<string, unknown>;
  generation_ids: string[];
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface ExistingImageTurnRow {
  id: string;
  prompt: string;
  status: ImageTaskTurnRow['status'];
  context: Record<string, unknown> | null;
  generation_ids: string[] | null;
  created_at: string;
  updated_at: string;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function toPositiveInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.floor(parsed);
}

function toBoundedString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export function toImageSessionErrorMessage(value: unknown): string {
  return toBoundedString(value, 1200).replace(/^[A-Z][A-Z0-9_]+:\s*/, '');
}

function getGenerationIds(task: ImageTaskRow): string[] {
  const result = toRecord(task.result_payload);
  const images = Array.isArray(result.images) ? result.images : [];
  const ids = images
    .map((image) => toBoundedString(toRecord(image).generationId, 120))
    .filter(Boolean);
  const topLevelId = toBoundedString(result.generationId, 120);
  const taskGenerationId = toBoundedString(task.generation_id, 120);
  return Array.from(
    new Set([
      ...ids,
      ...(topLevelId ? [topLevelId] : []),
      ...(taskGenerationId ? [taskGenerationId] : [])
    ])
  ).slice(0, 8);
}

function getTurnStatus(
  task: ImageTaskRow,
  generationIds: string[]
): ImageTaskTurnRow['status'] {
  if (task.status === 'queued') return 'pending';
  if (task.status === 'running') return 'running';
  if (task.status === 'failed' || task.status === 'cancelled') return 'failed';

  const request = toRecord(task.request_payload);
  const result = toRecord(task.result_payload);
  const requested =
    toPositiveInteger(result.requestedImageCount) ||
    toPositiveInteger(request.imageCount) ||
    1;
  const actual =
    toPositiveInteger(result.actualImageCount) ||
    toPositiveInteger(result.imageCount) ||
    generationIds.length;
  return actual < requested ? 'partial' : 'succeeded';
}

export function buildImageTaskTurnRow(
  task: ImageTaskRow,
  expectedSessionId?: string
): ImageTaskTurnRow | null {
  const request = toRecord(task.request_payload);
  const rawContext = toRecord(request.creationContext);
  const sessionId = toBoundedString(rawContext.sessionId, 80);
  if (!sessionId || (expectedSessionId && sessionId !== expectedSessionId)) {
    return null;
  }

  const generationIds = getGenerationIds(task);
  const status = getTurnStatus(task, generationIds);
  return {
    // A generation task maps to exactly one session turn. Reusing the task UUID
    // makes reconciliation idempotent without requiring a schema migration.
    id: task.id,
    session_id: sessionId,
    user_id: task.user_id,
    prompt: toBoundedString(request.prompt, 12000),
    negative_prompt: toBoundedString(request.negativePrompt, 6000) || null,
    status,
    context: {
      ...rawContext,
      sessionId,
      taskId: task.id,
      referenceAssetIds: Array.isArray(rawContext.referenceAssetIds)
        ? rawContext.referenceAssetIds
            .map((id) => toBoundedString(id, 120))
            .filter(Boolean)
            .slice(0, 8)
        : []
    },
    generation_ids: generationIds,
    error_message:
      status === 'failed'
        ? toImageSessionErrorMessage(task.error_message) ||
          (task.status === 'cancelled' ? '任务已取消' : '图片生成失败')
        : null,
    created_at: task.created_at,
    updated_at: task.updated_at
  };
}

function haveSameGenerationIds(
  left: string[],
  right: string[] | null
): boolean {
  const normalizedRight = Array.isArray(right) ? right : [];
  return (
    left.length === normalizedRight.length &&
    left.every((id, index) => id === normalizedRight[index])
  );
}

export function resolveImageTaskTurnRows(
  taskTurns: ImageTaskTurnRow[],
  existingTurns: ExistingImageTurnRow[]
): ImageTaskTurnRow[] {
  const claimedTurnIds = new Set<string>();
  return taskTurns.map((taskTurn) => {
    const taskId = taskTurn.id;
    const directMatch = existingTurns.find((turn) => {
      const context = toRecord(turn.context);
      return turn.id === taskId || context.taskId === taskId;
    });
    const legacyMatch =
      directMatch ||
      existingTurns
        .filter((turn) => {
          const context = toRecord(turn.context);
          const timeDistance = Math.abs(
            new Date(turn.updated_at).getTime() -
              new Date(taskTurn.updated_at).getTime()
          );
          return (
            !claimedTurnIds.has(turn.id) &&
            !context.taskId &&
            turn.prompt === taskTurn.prompt &&
            turn.status === taskTurn.status &&
            haveSameGenerationIds(
              taskTurn.generation_ids,
              turn.generation_ids
            ) &&
            timeDistance <= 10 * 60 * 1000
          );
        })
        .sort(
          (left, right) =>
            Math.abs(
              new Date(left.updated_at).getTime() -
                new Date(taskTurn.updated_at).getTime()
            ) -
            Math.abs(
              new Date(right.updated_at).getTime() -
                new Date(taskTurn.updated_at).getTime()
            )
        )[0];

    if (!legacyMatch) return taskTurn;
    claimedTurnIds.add(legacyMatch.id);
    return {
      ...taskTurn,
      id: legacyMatch.id,
      context: {
        ...taskTurn.context,
        taskId
      }
    };
  });
}

export async function reconcileImageSessionTaskTurns({
  database,
  userId,
  sessionId
}: {
  database: SupabaseClient;
  userId: string;
  sessionId: string;
}): Promise<void> {
  const { data: tasks, error: taskError } = await database
    .from('image_generation_tasks')
    .select(
      'id,user_id,status,request_payload,result_payload,generation_id,error_message,created_at,updated_at'
    )
    .eq('user_id', userId)
    .contains('request_payload', {
      creationContext: { sessionId }
    })
    .order('created_at', { ascending: true })
    .limit(100);

  if (taskError) {
    throw new Error(`Image session task lookup failed: ${taskError.message}`);
  }

  const taskTurns = ((tasks || []) as ImageTaskRow[])
    .map((task) => buildImageTaskTurnRow(task, sessionId))
    .filter((turn): turn is ImageTaskTurnRow => Boolean(turn));
  if (taskTurns.length === 0) return;

  const { data: existingTurns, error: existingTurnError } = await database
    .from('image_creation_turns')
    .select('id,prompt,status,context,generation_ids,created_at,updated_at')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (existingTurnError) {
    throw new Error(
      `Existing image session turn lookup failed: ${existingTurnError.message}`
    );
  }

  const turns = resolveImageTaskTurnRows(
    taskTurns,
    (existingTurns || []) as ExistingImageTurnRow[]
  );

  const { error: turnError } = await database
    .from('image_creation_turns')
    .upsert(turns, { onConflict: 'id' });
  if (turnError) {
    throw new Error(
      `Image session turn reconciliation failed: ${turnError.message}`
    );
  }

  const lastTurnAt = turns.reduce(
    (latest, turn) =>
      new Date(turn.updated_at).getTime() > new Date(latest).getTime()
        ? turn.updated_at
        : latest,
    turns[0].updated_at
  );
  const { error: sessionError } = await database
    .from('image_creation_sessions')
    .update({ last_turn_at: lastTurnAt })
    .eq('id', sessionId)
    .eq('user_id', userId);
  if (sessionError) {
    throw new Error(
      `Image session timestamp reconciliation failed: ${sessionError.message}`
    );
  }
}
