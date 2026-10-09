import type { SupabaseClient } from '@supabase/supabase-js';

// Task health is independent of analytics delivery. Never substitute a truncated
// conversion-event sample for canonical task outcomes (including policy refusals).
export async function loadTaskOutcomeReport(
  database: SupabaseClient,
  cutoff: string
) {
  const entries = await Promise.all(
    ['image', 'video'].map(async (kind) => {
      const statuses = ['succeeded', 'failed', 'cancelled'] as const;
      const counts = await Promise.all(
        statuses.map(async (status) => {
          const result = await database
            .from(`${kind}_generation_tasks`)
            .select('id', { count: 'exact', head: true })
            .gte('created_at', cutoff)
            .eq('status', status);
          if (result.error || result.count === null)
            throw new Error(`${kind} task count unavailable (${status})`);
          return result.count;
        })
      );
      const [succeeded, failed, cancelled] = counts;
      return [
        kind,
        {
          succeeded,
          failed,
          cancelled,
          successRate:
            succeeded + failed ? succeeded / (succeeded + failed) : null
        }
      ] as const;
    })
  );
  return {
    basis: 'canonical_task_outcomes',
    cohort: 'tasks_created_in_window',
    includesInternalTraffic: true,
    cutoff,
    image: entries[0][1],
    video: entries[1][1]
  };
}

export async function countFirstSuccessUsers(
  database: SupabaseClient,
  cutoff: string
) {
  const users = new Set<string>();
  // Bounded to 50k first-success records. Fail visibly rather than label a sample exact.
  for (let offset = 0; offset < 50_000; offset += 1000) {
    const { data, error } = await database
      .from('conversion_events')
      .select('id,user_id')
      .eq('event_name', 'first_generation_succeeded')
      .gte('occurred_at', cutoff)
      .or(
        'metadata->>traffic_type.is.null,metadata->>traffic_type.neq.internal_test'
      )
      .or(
        'cta_source.is.null,and(cta_source.neq.internal_test,cta_source.neq.codex_release_smoke)'
      )
      .order('id')
      .range(offset, offset + 999);
    if (error || !data) throw new Error('First-success user count unavailable');
    for (const row of data) if (row.user_id) users.add(row.user_id);
    if (data.length < 1000) return users.size;
  }
  throw new Error('First-success user scan exceeded 50k records');
}
