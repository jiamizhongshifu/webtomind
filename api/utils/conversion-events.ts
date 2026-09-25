import type { SupabaseClient } from '@supabase/supabase-js';

export interface ConversionEventInput {
  eventName: string;
  eventSource: string;
  userId?: string | null;
  anonymousId?: string | null;
  sessionId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  orderId?: string | null;
  productType?: string | null;
  productId?: string | null;
  ctaSource?: string | null;
  metadata?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
  occurredAt?: string | null;
}

function cleanText(value: string | null | undefined, maxLength: number) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function cleanMetadata(
  metadata: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object') return {};
  return metadata;
}

export async function recordConversionEvent(
  supabase: SupabaseClient,
  input: ConversionEventInput
): Promise<void> {
  const row = {
    event_name: cleanText(input.eventName, 120),
    event_source: cleanText(input.eventSource, 120) || 'unknown',
    user_id: input.userId || null,
    anonymous_id: cleanText(input.anonymousId, 160),
    session_id: cleanText(input.sessionId, 160),
    entity_type: cleanText(input.entityType, 80),
    entity_id: cleanText(input.entityId, 160),
    order_id: input.orderId || null,
    product_type: cleanText(input.productType, 80),
    product_id: cleanText(input.productId, 160),
    cta_source: cleanText(input.ctaSource, 120),
    metadata: cleanMetadata(input.metadata),
    idempotency_key: cleanText(input.idempotencyKey, 240),
    occurred_at: input.occurredAt || new Date().toISOString()
  };

  if (!row.event_name) {
    return;
  }

  const query = row.idempotency_key
    ? supabase
        .from('conversion_events')
        .upsert(row, { onConflict: 'idempotency_key', ignoreDuplicates: true })
    : supabase.from('conversion_events').insert(row);

  const { error } = await query;
  if (error) {
    // Conversion diagnostics should never break checkout or generation.
    console.warn('[ConversionEvents] record failed:', {
      eventName: row.event_name,
      message: error.message
    });
  }
}
