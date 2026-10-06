import { describe, expect, it, vi } from 'vitest';
import { recoverFailedGenerationRefunds } from '../../api/credits/refund-recovery';
const task = {
  id: 'task-1',
  user_id: 'user-1',
  status: 'failed',
  updated_at: '2026-10-01T00:00:00Z',
  request_payload: {
    prepaidCredit: {
      consumed: 80,
      creditType: 'media',
      creditBreakdown: { media: 80 }
    }
  },
  result_payload: { errorDetails: { code: 'TIMEOUT' } }
};
function mock({
  kind = 'image',
  row = task,
  refunds = [] as unknown[],
  rpcResult = { success: true, refunded: 80 } as unknown,
  rpcError = null as unknown,
  ledgerError = null as unknown,
  updateError = null as unknown
} = {}) {
  const updates: unknown[] = [];
  const rpc = vi.fn().mockResolvedValue({ data: rpcResult, error: rpcError });
  const from = vi.fn((table: string) => {
    const q: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const name of ['select', 'eq', 'lt', 'order'])
      q[name] = vi.fn(() => q);
    q.update = vi.fn((value) => {
      updates.push(value);
      return q;
    });
    q.limit = vi
      .fn()
      .mockResolvedValue(
        table === 'credit_transactions'
          ? { data: refunds, error: ledgerError }
          : {
              data: table === `${kind}_generation_tasks` ? [row] : [],
              error: null
            }
      );
    q.maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { id: row.id }, error: updateError });
    return q;
  });
  return { db: { from, rpc } as never, rpc, updates };
}
const now = new Date('2026-10-07T00:00:00Z');
describe('bounded refund recovery', () => {
  it.each(['image', 'video'])(
    'reuses the original %s key and amount, preserving the error payload',
    async (kind) => {
      const m = mock({ kind });
      expect((await recoverFailedGenerationRefunds(m.db, now)).recovered).toBe(
        1
      );
      expect(m.rpc).toHaveBeenCalledWith(
        'refund_generation_credit',
        expect.objectContaining({
          p_amount: 80,
          p_source: `${kind}_task:task-1:refund`,
          p_metadata: expect.objectContaining({
            idempotency_key: `${kind}_task:task-1:${kind === 'image' ? 'generation_failure_refund' : 'refund'}`,
            creditBreakdown: { media: 80 }
          })
        })
      );
      expect(m.updates[0]).toMatchObject({
        refund_failed: false,
        result_payload: { errorDetails: { code: 'TIMEOUT' }, refunded: 80 }
      });
    }
  );
  it('clears a lost response flag using the ledger, without issuing a second refund', async () => {
    const m = mock({
      refunds: [
        {
          amount: 80,
          metadata: {
            idempotency_key: 'image_task:task-1:generation_failure_refund'
          }
        }
      ]
    });
    expect((await recoverFailedGenerationRefunds(m.db, now)).recovered).toBe(1);
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it.each([null, { success: false }, { success: true, refunded: 40 }])(
    'keeps the failure flag for an unconfirmed refund %j',
    async (rpcResult) => {
      const m = mock({ rpcResult });
      expect(
        (await recoverFailedGenerationRefunds(m.db, now)).errors
      ).toContain('image: refund unconfirmed');
      expect(m.updates).toEqual([]);
    }
  );
  it('does not issue money when the ledger lookup fails', async () => {
    const m = mock({ ledgerError: { message: 'offline' } });
    await recoverFailedGenerationRefunds(m.db, now);
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it('defers partial refunds and unknown phases to manual reconciliation', async () => {
    const m = mock({
      refunds: [
        {
          amount: 40,
          metadata: {
            idempotency_key: 'image_task:task-1:partial_generation_refund'
          }
        }
      ]
    });
    expect((await recoverFailedGenerationRefunds(m.db, now)).deferred).toBe(1);
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it('rejects damaged prepaid breakdowns', async () => {
    const m = mock({
      row: {
        ...task,
        request_payload: {
          prepaidCredit: {
            consumed: 80,
            creditType: 'media',
            creditBreakdown: { media: 40 }
          }
        }
      }
    });
    expect((await recoverFailedGenerationRefunds(m.db, now)).deferred).toBe(1);
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it('uses the dedicated denoise RPC and original key', async () => {
    const m = mock({
      row: {
        ...task,
        request_payload: {
          ...task.request_payload,
          appOperation: 'gpt-image-2-denoise'
        }
      } as typeof task
    });
    await recoverFailedGenerationRefunds(m.db, now);
    expect(m.rpc).toHaveBeenCalledWith(
      'refund_gpt_image_2_denoise_credits_v3',
      expect.objectContaining({ p_source: 'denoise_task:task-1:refund' })
    );
  });
  it('reports a flag-write failure without claiming recovery', async () => {
    const m = mock({ updateError: { message: 'offline' } });
    const result = await recoverFailedGenerationRefunds(m.db, now);
    expect(result.recovered).toBe(0);
    expect(result.errors).toContain('image: refund flag update failed');
  });
});
