import { SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '../utils/vercel-types';
import {
  getErrorMessage,
  getSupabaseAdmin,
  jsonResponse,
  sendWebResponse,
  toWebRequest
} from './generate.js';
import {
  claimImageTask,
  runImageTask,
  type ImageGenerationTaskRecord,
  type ImageTaskStatus
} from './task-runner.js';

export const config = {
  runtime: 'nodejs',
  maxDuration: 300
};

function isAuthorizedDrainRequest(request: Request): boolean {
  const secret = process.env.IMAGE_DRAIN_SECRET || process.env.CRON_SECRET;
  if (secret) {
    const authHeader = request.headers.get('Authorization') || '';
    const tokenHeader = request.headers.get('x-image-drain-secret') || '';
    return authHeader === `Bearer ${secret}` || tokenHeader === secret;
  }

  const userAgent = request.headers.get('user-agent') || '';
  return process.env.VERCEL !== '1' || /vercel-cron/i.test(userAgent);
}

function isLegacyVercelImageExecutionDisabled(): boolean {
  return (
    process.env.VERCEL === '1' &&
    process.env.WEBTOMIND_ENABLE_LEGACY_IMAGE_EXECUTION !== 'true'
  );
}

function getDrainBatchSize(): number {
  const configured = Number(process.env.IMAGE_DRAIN_BATCH_SIZE || 5);
  if (!Number.isFinite(configured)) return 5;
  return Math.max(1, Math.min(16, Math.floor(configured)));
}

function getDrainConcurrency(batchSize: number): number {
  const configured = Number(process.env.IMAGE_DRAIN_CONCURRENCY || batchSize);
  if (!Number.isFinite(configured)) return Math.min(5, batchSize);
  return Math.max(1, Math.min(8, batchSize, Math.floor(configured)));
}

async function findCandidateTask(
  sb: SupabaseClient,
  skippedTaskIds: Set<string> = new Set()
): Promise<ImageGenerationTaskRecord | null> {
  const queued = await sb
    .from('image_generation_tasks')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(Math.max(12, skippedTaskIds.size + 1));
  const queuedCandidate = (queued.data || []).find(
    (task) => !skippedTaskIds.has(task.id)
  );
  if (queuedCandidate) return queuedCandidate as ImageGenerationTaskRecord;

  const stale = await sb
    .from('image_generation_tasks')
    .select('*')
    .eq('status', 'running')
    .lt('locked_until', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (stale.data as ImageGenerationTaskRecord | null) || null;
}

function extractTaskIdsFromQueueMessage(body: unknown): string[] {
  const candidates: unknown[] = [];
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    candidates.push(record.taskId, record.task_id);
    if (Array.isArray(record.taskIds)) candidates.push(...record.taskIds);
    if (Array.isArray(record.task_ids)) candidates.push(...record.task_ids);
  }

  return candidates
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);
}

async function parseQueuedDrainTaskIds(request: Request): Promise<string[]> {
  if (request.method !== 'POST') return [];
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return [];

  let payload: unknown;
  try {
    payload = await request.clone().json();
  } catch {
    return [];
  }

  const taskIds: string[] = [];
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    taskIds.push(...extractTaskIdsFromQueueMessage(record));

    if (Array.isArray(record.messages)) {
      for (const message of record.messages) {
        if (!message || typeof message !== 'object') continue;
        const messageRecord = message as Record<string, unknown>;
        taskIds.push(...extractTaskIdsFromQueueMessage(messageRecord.body));
        taskIds.push(...extractTaskIdsFromQueueMessage(messageRecord));
      }
    }
  }

  return Array.from(new Set(taskIds));
}

async function getCandidateTaskById(
  sb: SupabaseClient,
  taskId: string
): Promise<ImageGenerationTaskRecord | null> {
  const { data, error } = await sb
    .from('image_generation_tasks')
    .select('*')
    .eq('id', taskId)
    .in('status', ['queued', 'running'])
    .maybeSingle();

  if (error) {
    console.warn('[ImageDrain] queued task lookup failed:', {
      taskId,
      message: error.message
    });
    return null;
  }

  return (data as ImageGenerationTaskRecord | null) || null;
}

async function handleImageDrainRequest(request: Request): Promise<Response> {
  const corsHeaders = {
    'Cache-Control': 'no-store'
  };

  if (!['GET', 'POST'].includes(request.method)) {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
  }

  if (!isAuthorizedDrainRequest(request)) {
    return jsonResponse({ error: 'Unauthorized' }, corsHeaders, 401);
  }

  if (isLegacyVercelImageExecutionDisabled()) {
    return jsonResponse(
      {
        success: true,
        disabled: true,
        reason: 'legacy_vercel_image_execution_disabled',
        runtime: 'vercel',
        processedCount: 0,
        claimedCount: 0,
        queuedMessageTaskCount: 0,
        concurrency: 0,
        processed: []
      },
      corsHeaders
    );
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    return jsonResponse({ error: 'Supabase not configured' }, corsHeaders, 500);
  }

  const batchSize = getDrainBatchSize();
  const claimedTasks: ImageGenerationTaskRecord[] = [];
  const skippedTaskIds = new Set<string>();
  const queuedTaskIds = await parseQueuedDrainTaskIds(request);

  for (const taskId of queuedTaskIds.slice(0, batchSize)) {
    const candidate = await getCandidateTaskById(sb, taskId);
    if (!candidate) {
      skippedTaskIds.add(taskId);
      continue;
    }
    const claimed = await claimImageTask({
      sb,
      task: candidate,
      logPrefix: 'ImageDrain'
    });
    if (!claimed) {
      skippedTaskIds.add(candidate.id);
      continue;
    }
    claimedTasks.push(claimed);
    skippedTaskIds.add(claimed.id);
  }

  for (let index = 0; index < batchSize; index += 1) {
    if (claimedTasks.length >= batchSize) break;
    const candidate = await findCandidateTask(sb, skippedTaskIds);
    if (!candidate) break;
    const claimed = await claimImageTask({
      sb,
      task: candidate,
      logPrefix: 'ImageDrain'
    });
    if (!claimed) {
      skippedTaskIds.add(candidate.id);
      continue;
    }
    claimedTasks.push(claimed);
  }

  const processed: Array<{
    taskId: string;
    status: ImageTaskStatus;
    reenqueue?: {
      taskId: string;
      delaySeconds: number;
    };
    error?: string;
  }> = [];
  const concurrency = getDrainConcurrency(claimedTasks.length || batchSize);
  for (let index = 0; index < claimedTasks.length; index += concurrency) {
    const chunk = claimedTasks.slice(index, index + concurrency);
    const results = await Promise.allSettled(
      chunk.map((task) =>
        runImageTask({ sb, task, request, logPrefix: 'ImageDrain' })
      )
    );
    results.forEach((result, resultIndex) => {
      if (result.status === 'fulfilled') {
        processed.push(result.value);
        return;
      }
      processed.push({
        taskId: chunk[resultIndex]?.id || 'unknown',
        status: 'failed',
        error: getErrorMessage(result.reason)
      });
    });
  }
  const reenqueue = processed
    .map((item) => item.reenqueue)
    .filter(
      (
        item
      ): item is {
        taskId: string;
        delaySeconds: number;
      } => Boolean(item)
    );

  return jsonResponse(
    {
      success: true,
      processedCount: processed.length,
      claimedCount: claimedTasks.length,
      queuedMessageTaskCount: queuedTaskIds.length,
      concurrency,
      reenqueue,
      reenqueueCount: reenqueue.length,
      processed
    },
    corsHeaders
  );
}

function isWebRequest(request: Request | VercelRequest): request is Request {
  return typeof (request as Request).headers?.get === 'function';
}

async function handler(request: Request): Promise<Response>;
async function handler(
  request: VercelRequest,
  response: VercelResponse
): Promise<void>;
async function handler(
  request: Request | VercelRequest,
  response?: VercelResponse
): Promise<Response | void> {
  const webResponse = await handleImageDrainRequest(
    isWebRequest(request) ? request : toWebRequest(request)
  );
  if (response) {
    await sendWebResponse(webResponse, response);
    return;
  }
  return webResponse;
}

export default handler;
