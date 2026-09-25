import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

type MockSupabase = SupabaseClient & { inserts: () => number };
import {
  classifyPolicyFailureMessage,
  createDailyPolicyFallbackBudget,
  isExplicitPolicyContentMessage
} from '../../api/image/generate/policy-fallback';

function createMockSb({
  count = 0,
  countError = null
}: { count?: number; countError?: { message: string } | null } = {}) {
  let inserts = 0;
  const countQuery = {
    then: (
      resolve: (value: {
        count: number | null;
        error: { message: string } | null;
      }) => void
    ) =>
      resolve({ count, error: countError })
  };
  const insertQuery = {
    then: (resolve: (value: { error: null }) => void) => resolve({ error: null })
  };
  return {
    inserts: () => inserts,
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => countQuery
        })
      }),
      insert: () => {
        inserts += 1;
        return insertQuery;
      },
      upsert: () => {
        inserts += 1;
        return insertQuery;
      }
    })
  } as unknown as MockSupabase;
}

describe('policy failure classification', () => {
  it('classifies explicit content messages as terminal', () => {
    expect(
      classifyPolicyFailureMessage(
        '生成的图片可能违反了关于裸露、色情或情色内容的防护限制。'
      )
    ).toBe('explicit');
    expect(
      classifyPolicyFailureMessage('generated image may violate nudity policy')
    ).toBe('explicit');
    expect(isExplicitPolicyContentMessage('...裸露、色情...')).toBe(true);
  });

  it('classifies output-safety messages as fallback-eligible', () => {
    expect(
      classifyPolicyFailureMessage(
        'The image request was rejected by the upstream safety system.'
      )
    ).toBe('output_safety');
    expect(
      classifyPolicyFailureMessage(
        'The generated images appear to be unsafe. Try modifying the prompts.'
      )
    ).toBe('output_safety');
    expect(isExplicitPolicyContentMessage('rejected by upstream safety')).toBe(
      false
    );
  });

  it('classifies unknown messages as other (fallback-eligible)', () => {
    expect(classifyPolicyFailureMessage('Content was rejected by moderation.')).toBe(
      'output_safety'
    );
    expect(classifyPolicyFailureMessage('some unrelated error')).toBe('other');
  });
});

describe('daily policy fallback budget', () => {
  it('approves below the daily limit and records the audit event', async () => {
    const sb: MockSupabase = createMockSb({ count: 5 });
    const budget = createDailyPolicyFallbackBudget(sb, {
      taskId: 'task-1',
      limit: 10
    });
    const allowed = await budget.consume({
      fromProvider: 'tuzi',
      toProvider: 'krill',
      messageKind: 'output_safety'
    });
    expect(allowed).toBe(true);
    expect(sb.inserts()).toBe(1);
  });

  it('denies when the daily budget is exhausted', async () => {
    const sb: MockSupabase = createMockSb({ count: 10 });
    const budget = createDailyPolicyFallbackBudget(sb, {
      taskId: 'task-2',
      limit: 10
    });
    expect(
      await budget.consume({
        fromProvider: 'tuzi',
        toProvider: 'krill',
        messageKind: 'output_safety'
      })
    ).toBe(false);
    expect(sb.inserts()).toBe(0);
  });

  it('disables fallback entirely when the limit is zero', async () => {
    const sb: MockSupabase = createMockSb({ count: 0 });
    const budget = createDailyPolicyFallbackBudget(sb, {
      taskId: 'task-3',
      limit: 0
    });
    expect(
      await budget.consume({
        fromProvider: 'tuzi',
        toProvider: 'krill',
        messageKind: 'other'
      })
    ).toBe(false);
    expect(sb.inserts()).toBe(0);
  });

  it('fails open when the budget query errors', async () => {
    const sb: MockSupabase = createMockSb({
      count: 0,
      countError: { message: 'db down' }
    });
    const budget = createDailyPolicyFallbackBudget(sb, {
      taskId: 'task-4',
      limit: 10
    });
    expect(
      await budget.consume({
        fromProvider: 'tuzi',
        toProvider: 'krill',
        messageKind: 'output_safety'
      })
    ).toBe(true);
    expect(sb.inserts()).toBe(1);
  });
});
