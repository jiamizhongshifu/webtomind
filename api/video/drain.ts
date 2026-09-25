import type { VercelRequest, VercelResponse } from '../utils/vercel-types';
import { getCorsHeadersForRequest, getSupabaseAdmin } from '../utils/auth.js';
import {
  runVideoGenerationTaskStep,
  type VideoTaskRunnerResult
} from './task-runner.js';

export const config = { runtime: 'nodejs', maxDuration: 60 };

type VideoTaskPhase = 'create' | 'poll';

interface VideoQueueMessage {
  id?: string;
  body?: unknown;
}

function jsonResponse(
  data: unknown,
  corsHeaders: Record<string, string>,
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

function getDrainSecret(): string {
  return process.env.VIDEO_DRAIN_SECRET || process.env.CRON_SECRET || '';
}

function isAuthorized(request: Request): boolean {
  const secret = getDrainSecret();
  if (!secret) return false;
  const authorization = request.headers.get('authorization') || '';
  return (
    authorization === `Bearer ${secret}` ||
    request.headers.get('x-video-drain-secret') === secret
  );
}

function isWebRequest(request: Request | VercelRequest): request is Request {
  return typeof (request as Request).headers?.get === 'function';
}

function toWebRequest(request: VercelRequest): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      value.forEach((item) => headers.append(key, item));
    } else if (typeof value === 'string') {
      headers.set(key, value);
    }
  }

  const protocolHeader = request.headers['x-forwarded-proto'];
  const hostHeader =
    request.headers['x-forwarded-host'] || request.headers.host;
  const protocol = Array.isArray(protocolHeader)
    ? protocolHeader[0]
    : protocolHeader || 'https';
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  const url = `${protocol}://${host || 'webtomind.com'}${request.url || '/api/video/drain'}`;
  const method = request.method || 'GET';
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const body =
    hasBody && request.body !== undefined
      ? typeof request.body === 'string'
        ? request.body
        : JSON.stringify(request.body)
      : undefined;

  return new Request(url, {
    method,
    headers,
    body
  });
}

async function sendWebResponse(
  response: Response,
  vercelResponse: VercelResponse
): Promise<void> {
  response.headers.forEach((value, key) => {
    vercelResponse.setHeader(key, value);
  });
  const body = await response.text();
  vercelResponse.statusCode = response.status;
  vercelResponse.end(body);
}

function extractTaskInput(message: VideoQueueMessage): {
  taskId: string;
  phase: VideoTaskPhase;
} | null {
  const body =
    message.body && typeof message.body === 'object'
      ? (message.body as Record<string, unknown>)
      : {};
  const taskId = typeof body.taskId === 'string' ? body.taskId.trim() : '';
  if (!taskId) return null;
  const phase = body.phase === 'poll' ? 'poll' : 'create';
  return { taskId, phase };
}

async function getRunnableVideoTaskInputs(limit: number): Promise<
  Array<{ taskId: string; phase: VideoTaskPhase }>
> {
  const sb = getSupabaseAdmin();
  if (!sb) return [];

  const now = new Date().toISOString();
  const { data, error } = await sb
    .from('video_generation_tasks')
    .select('id,status,provider_task_id,next_poll_after,locked_until,created_at')
    .in('status', ['queued', 'running'])
    .or(`locked_until.is.null,locked_until.lt.${now}`)
    .order('created_at', { ascending: true })
    .limit(Math.max(1, limit));

  if (error || !Array.isArray(data)) {
    console.error('[VideoDrain] runnable task lookup failed:', error);
    return [];
  }

  return data
    .filter((task) => {
      const nextPollAfter =
        typeof task.next_poll_after === 'string' ? task.next_poll_after : '';
      return !nextPollAfter || nextPollAfter <= now;
    })
    .map((task) => ({
      taskId: task.id,
      phase: task.provider_task_id ? 'poll' : 'create'
    }));
}

async function handleVideoDrainRequest(request: Request): Promise<Response> {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
  }
  if (!isAuthorized(request)) {
    return jsonResponse({ error: 'Unauthorized' }, corsHeaders, 401);
  }

  const body = (await request.json().catch(() => ({}))) as {
    messages?: VideoQueueMessage[];
    taskIds?: string[];
    phase?: VideoTaskPhase;
    requestedBatchSize?: number;
  };
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const taskIds = Array.isArray(body.taskIds)
    ? Array.from(
        new Set(
          body.taskIds
            .map((taskId) => (typeof taskId === 'string' ? taskId.trim() : ''))
            .filter(Boolean)
        )
      )
    : [];
  const requestedBatchSize =
    typeof body.requestedBatchSize === 'number' && body.requestedBatchSize > 0
      ? Math.floor(body.requestedBatchSize)
      : messages.length || taskIds.length;

  const queueInputs = messages
    .slice(0, Math.max(1, requestedBatchSize))
    .map(extractTaskInput)
    .filter((item): item is { taskId: string; phase: VideoTaskPhase } =>
      Boolean(item)
    );
  const manualPhase: VideoTaskPhase = body.phase === 'poll' ? 'poll' : 'create';
  const manualInputs = taskIds
    .slice(0, Math.max(1, requestedBatchSize))
    .map((taskId) => ({
      taskId,
      phase: manualPhase
    }));
  const inputs = [...queueInputs, ...manualInputs];
  if (inputs.length === 0) {
    inputs.push(...(await getRunnableVideoTaskInputs(Math.max(1, requestedBatchSize))));
  }

  const processed: VideoTaskRunnerResult[] = [];
  for (const input of inputs) {
    processed.push(await runVideoGenerationTaskStep(input));
  }

  const reenqueue = processed
    .map((item) => item.reenqueue)
    .filter(
      (
        item
      ): item is {
        taskId: string;
        phase: VideoTaskPhase;
        delaySeconds: number;
      } => Boolean(item)
    );

  return jsonResponse(
    {
      success: true,
      processed,
      processedCount: processed.length,
      reenqueue,
      reenqueueCount: reenqueue.length,
      taskCount: inputs.length,
      queuedMessageCount: queueInputs.length,
      manualTaskCount: manualInputs.length
    },
    corsHeaders
  );
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
  const webResponse = await handleVideoDrainRequest(
    isWebRequest(request) ? request : toWebRequest(request)
  );
  if (response) {
    await sendWebResponse(webResponse, response);
    return;
  }
  return webResponse;
}

export default handler;
