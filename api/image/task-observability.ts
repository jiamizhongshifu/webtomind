import type { SupabaseClient } from '@supabase/supabase-js';
import { recordConversionEvent } from '../utils/conversion-events.js';
import type {
  ImageGenerationSuccessPayload,
  ImageGenerationTaskDiagnostics
} from './generate.js';

export interface ImageTaskObservabilityRecord {
  id: string;
  user_id: string;
  request_payload: unknown;
}

export interface ImageTaskCompletionDurations {
  queue_wait_ms: number;
  provider_latency_ms: number;
  total_duration_ms: number;
}

export interface ImageTaskTerminalFailure {
  code?: string;
  category?: string;
  provider?: string;
  model?: string;
}

interface RecordImageTaskTerminalEventsInput {
  sb: SupabaseClient;
  task: ImageTaskObservabilityRecord;
  status: 'succeeded' | 'failed';
  durations: ImageTaskCompletionDurations;
  payload?: ImageGenerationSuccessPayload;
  failure?: ImageTaskTerminalFailure;
  diagnostics?: ImageGenerationTaskDiagnostics;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function cleanText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function finiteNonNegative(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function getTaskRequest(task: ImageTaskObservabilityRecord) {
  const outer = asRecord(task.request_payload);
  const nested = asRecord(outer.input);
  return { outer, request: { ...outer, ...nested } };
}

function getImageCount(
  payload: ImageGenerationSuccessPayload | undefined,
  diagnostics: ImageGenerationTaskDiagnostics | undefined,
  status: 'succeeded' | 'failed'
): number {
  if (status === 'failed') return 0;
  const record = asRecord(payload);
  const images = Array.isArray(record.images) ? record.images : [];
  return (
    finiteNonNegative(record.actualImageCount) ??
    finiteNonNegative(record.imageCount) ??
    finiteNonNegative(diagnostics?.final?.imageCount) ??
    images.length
  );
}

function compactRecord(
  record: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  );
}

export function buildImageTaskTerminalMetadata({
  task,
  status,
  durations,
  payload,
  failure,
  diagnostics
}: Omit<RecordImageTaskTerminalEventsInput, 'sb'>): {
  ctaSource?: string;
  anonymousId?: string;
  sessionId?: string;
  metadata: Record<string, unknown>;
} {
  const { outer, request } = getTaskRequest(task);
  const payloadRecord = asRecord(payload);
  const finalDiagnostics = diagnostics?.final;
  const ctaSource =
    cleanText(outer.cta_source) ||
    cleanText(outer.ctaSource) ||
    cleanText(request.cta_source) ||
    cleanText(request.ctaSource);
  const provider =
    cleanText(payloadRecord.provider) ||
    cleanText(failure?.provider) ||
    cleanText(finalDiagnostics?.provider) ||
    cleanText(request.provider);
  const model =
    cleanText(payloadRecord.model) ||
    cleanText(failure?.model) ||
    cleanText(finalDiagnostics?.model) ||
    cleanText(request.model);
  const failureCategory =
    cleanText(failure?.category) ||
    cleanText(finalDiagnostics?.failureCategory);
  const failureCode =
    cleanText(failure?.code) || cleanText(finalDiagnostics?.failureCode);
  const entryContext = compactRecord({
    source_app: cleanText(request.sourceApp) || cleanText(request.source_app),
    app_slug: cleanText(request.appSlug) || cleanText(request.app_slug),
    app_operation:
      cleanText(request.appOperation) || cleanText(request.app_operation),
    prompt_mode:
      cleanText(request.promptMode) || cleanText(request.prompt_mode),
    source_generation_id:
      cleanText(request.sourceGenerationId) ||
      cleanText(request.source_generation_id)
  });
  const creationContext = asRecord(request.creationContext);
  const conversionAttribution = asRecord(creationContext.conversionAttribution);
  const conversionSessionId = cleanText(conversionAttribution.sessionId);
  const conversionCanonicalPath = cleanText(
    conversionAttribution.canonicalPath
  );
  const conversionCaseId = cleanText(conversionAttribution.caseId);
  const conversionSource = cleanText(conversionAttribution.source);
  const seoAttribution =
    conversionSessionId &&
    conversionCanonicalPath?.startsWith('/') &&
    conversionCaseId &&
    conversionSource
      ? compactRecord({
          canonical_path: conversionCanonicalPath,
          case_id: conversionCaseId,
          case_slug: cleanText(conversionAttribution.caseSlug),
          source: conversionSource,
          cluster: cleanText(conversionAttribution.cluster),
          content_id: cleanText(conversionAttribution.contentId),
          cta: cleanText(conversionAttribution.cta),
          captured_at: cleanText(conversionAttribution.capturedAt)
        })
      : undefined;

  return {
    ctaSource,
    anonymousId: conversionSessionId,
    sessionId: conversionSessionId,
    metadata: compactRecord({
      task_id: task.id,
      status,
      provider,
      model,
      failure_category: failureCategory,
      failure_code: failureCode,
      queue_duration_ms: durations.queue_wait_ms,
      provider_duration_ms: durations.provider_latency_ms,
      total_duration_ms: durations.total_duration_ms,
      image_count: getImageCount(payload, diagnostics, status),
      requested_image_count:
        finiteNonNegative(asRecord(payload).requestedImageCount) ??
        finiteNonNegative(diagnostics?.requested.imageCount) ??
        finiteNonNegative(request.imageCount),
      ...(Object.keys(entryContext).length > 0
        ? { entry_context: entryContext }
        : {}),
      ...(seoAttribution ? { seo_attribution: seoAttribution } : {}),
      ...(ctaSource ? { cta_source: ctaSource } : {})
    })
  };
}

export async function recordImageTaskTerminalEvents(
  input: RecordImageTaskTerminalEventsInput
): Promise<void> {
  const eventName =
    input.status === 'succeeded'
      ? 'generation_task_succeeded'
      : 'generation_task_failed';
  const { ctaSource, anonymousId, sessionId, metadata } =
    buildImageTaskTerminalMetadata(input);

  try {
    await recordConversionEvent(input.sb, {
      eventName,
      eventSource: 'image_task_runner',
      userId: input.task.user_id,
      anonymousId,
      sessionId,
      entityType: 'image_generation_task',
      entityId: input.task.id,
      ctaSource,
      idempotencyKey: `${eventName}:${input.task.id}`,
      metadata
    });
  } catch (error) {
    console.warn('[ImageTaskObservability] terminal event failed:', {
      taskId: input.task.id,
      eventName,
      message: error instanceof Error ? error.message : String(error)
    });
  }

  if (input.status !== 'succeeded') return;

  try {
    await recordConversionEvent(input.sb, {
      eventName: 'first_generation_succeeded',
      eventSource: 'image_task_runner',
      userId: input.task.user_id,
      anonymousId,
      sessionId,
      entityType: 'image_generation_task',
      entityId: input.task.id,
      ctaSource,
      idempotencyKey: `first_generation_succeeded:${input.task.user_id}`,
      metadata
    });
  } catch (error) {
    console.warn('[ImageTaskObservability] first success event failed:', {
      taskId: input.task.id,
      userId: input.task.user_id,
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
