import { createClient } from '@supabase/supabase-js';
import { getCorsHeadersForRequest } from '../../utils/auth';

export const config = { runtime: 'edge' };

const EVENT_COLUMNS = {
  view: 'view_count',
  copy: 'copy_count',
  generate: 'generate_count'
} as const;

type PromptCaseEvent = keyof typeof EVENT_COLUMNS;

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

function isPromptCaseEvent(value: unknown): value is PromptCaseEvent {
  return typeof value === 'string' && value in EVENT_COLUMNS;
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse({ error: 'Supabase is not configured' }, corsHeaders, 503);
  }

  const input = (await request.json().catch(() => ({}))) as {
    id?: unknown;
    event?: unknown;
  };
  const id = typeof input.id === 'string' ? input.id.trim() : '';
  if (!id || !isPromptCaseEvent(input.event)) {
    return jsonResponse({ error: 'id and event are required' }, corsHeaders, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { error } = await supabase.rpc('increment_prompt_case_event', {
    case_id: id,
    event_name: input.event
  });

  if (error) {
    console.error('[PromptCaseEvent] increment failed:', error);
    return jsonResponse({ error: 'Failed to record event' }, corsHeaders, 500);
  }

  return jsonResponse({ ok: true, column: EVENT_COLUMNS[input.event] }, corsHeaders);
}
