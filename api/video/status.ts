import {
  getCorsHeadersForRequest,
  getUserIdFromRequest
} from '../utils/auth.js';
import {
  getArkVideoApiBaseUrl,
  getArkVideoApiKey,
  getArkVideoStatusPath,
  normalizeArkVideoStatusResponse
} from '../../src/shared/ark-video-api.js';

export const config = { runtime: 'edge' };

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

function buildStatusUrl(taskId: string): string {
  return `${getArkVideoApiBaseUrl()}${getArkVideoStatusPath(taskId)}`;
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
  }

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return jsonResponse({ error: 'Unauthorized' }, corsHeaders, 401);
  }

  const url = new URL(request.url);
  const taskId = (
    url.searchParams.get('id') ||
    url.searchParams.get('taskId') ||
    ''
  ).trim();
  if (!taskId) {
    return jsonResponse(
      { error: 'missing task id', message: '请提供要查询的视频任务 ID。' },
      corsHeaders,
      400
    );
  }

  const apiKey = getArkVideoApiKey();
  if (!apiKey) {
    return jsonResponse(
      {
        error: 'VIDEO_PROVIDER_API_KEY_MISSING',
        message: '视频生成服务配置不完整。'
      },
      corsHeaders,
      500
    );
  }

  const response = await fetch(buildStatusUrl(taskId), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return jsonResponse(
      {
        error: 'VIDEO_STATUS_FAILED',
        status: response.status,
        message: '视频任务状态暂时不可用。'
      },
      corsHeaders,
      502
    );
  }

  const task = normalizeArkVideoStatusResponse(data);
  return jsonResponse(
    {
      success: true,
      task: {
        id: task.id,
        status: task.status,
        progress: task.progress,
        videoUrl: task.videoUrl,
        previewImageUrl: task.previewImageUrl,
        errorMessage: task.errorMessage
      }
    },
    corsHeaders
  );
}
