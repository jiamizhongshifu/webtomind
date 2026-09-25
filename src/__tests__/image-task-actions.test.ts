import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleCancelImageTaskRequest } from '../../api/image/cloudflare-task-actions';

function makeQuery(result: unknown, calls: unknown[] = []) {
  const query: Record<string, unknown> = {
    update: vi.fn((payload: unknown) => {
      calls.push({ method: 'update', payload });
      return query;
    }),
    select: vi.fn((columns?: string) => {
      calls.push({ method: 'select', columns });
      return query;
    }),
    eq: vi.fn((column: string, value: unknown) => {
      calls.push({ method: 'eq', column, value });
      return query;
    }),
    maybeSingle: vi.fn(async () => result),
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject)
  };
  return query;
}

describe('Cloudflare image task actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks queued tasks as cancelled and refunds prepaid credits', async () => {
    const queryCalls: unknown[] = [];
    const queuedTask = {
      id: 'task-123',
      user_id: 'user-123',
      status: 'queued',
      request_payload: {
        prepaidCredit: {
          consumed: 320,
          creditType: 'mixed',
          creditBreakdown: { daily: 100, subscription: 120, bonus: 100 }
        }
      },
      refund_failed: null
    };
    const cancelledTask = {
      ...queuedTask,
      status: 'cancelled',
      result_payload: {
        success: true,
        cancelled: true,
        cancelledTaskStatus: 'queued',
        interruptMode: 'queue'
      }
    };
    const sb = {
      from: vi
        .fn()
        .mockReturnValueOnce(
          makeQuery({ data: queuedTask, error: null }, queryCalls)
        )
        .mockReturnValueOnce(
          makeQuery({ data: cancelledTask, error: null }, queryCalls)
        )
        .mockReturnValueOnce(
          makeQuery({ data: null, error: null }, queryCalls)
        ),
      rpc: vi.fn().mockResolvedValue({
        data: { success: true, refunded: 320 },
        error: null
      })
    };
    const response = await handleCancelImageTaskRequest({
      sb: sb as never,
      userId: 'user-123',
      taskId: 'task-123',
      corsHeaders: {}
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      taskId: 'task-123',
      status: 'cancelled',
      refunded: 320,
      refundFailed: false
    });
    expect(sb.rpc).toHaveBeenCalledWith('refund_generation_credit', {
      p_user_id: 'user-123',
      p_amount: 320,
      p_credit_type: 'mixed',
      p_source: 'image_task:task-123:queue_cancel_refund',
      p_metadata: expect.objectContaining({
        billingDomain: 'image_task',
        billingPhase: 'queue_cancel_refund',
        idempotency_key: 'image_task:task-123:queue_cancel_refund',
        taskId: 'task-123',
        cancelledTaskStatus: 'queued',
        creditBreakdown: { daily: 100, subscription: 120, bonus: 100 }
      })
    });
    expect(queryCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'update',
          payload: expect.objectContaining({ status: 'cancelled' })
        }),
        expect.objectContaining({
          method: 'eq',
          column: 'status',
          value: 'queued'
        })
      ])
    );
  });

  it('marks running tasks as soft-cancelled and refunds prepaid credits', async () => {
    const queryCalls: unknown[] = [];
    const runningTask = {
      id: 'task-456',
      user_id: 'user-123',
      status: 'running',
      request_payload: {
        prepaidCredit: {
          consumed: 800,
          creditType: 'subscription'
        }
      },
      refund_failed: null
    };
    const cancelledTask = {
      ...runningTask,
      status: 'cancelled',
      result_payload: {
        success: true,
        cancelled: true,
        cancelledTaskStatus: 'running',
        interruptMode: 'soft'
      }
    };
    const sb = {
      from: vi
        .fn()
        .mockReturnValueOnce(
          makeQuery({ data: runningTask, error: null }, queryCalls)
        )
        .mockReturnValueOnce(
          makeQuery({ data: cancelledTask, error: null }, queryCalls)
        )
        .mockReturnValueOnce(
          makeQuery({ data: null, error: null }, queryCalls)
        ),
      rpc: vi.fn().mockResolvedValue({
        data: { success: true, refunded: 800 },
        error: null
      })
    };

    const response = await handleCancelImageTaskRequest({
      sb: sb as never,
      userId: 'user-123',
      taskId: 'task-456',
      corsHeaders: {}
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      taskId: 'task-456',
      status: 'cancelled',
      refunded: 800,
      refundFailed: false,
      cancelledTaskStatus: 'running',
      interruptMode: 'soft'
    });
    expect(sb.rpc).toHaveBeenCalledWith('refund_generation_credit', {
      p_user_id: 'user-123',
      p_amount: 800,
      p_credit_type: 'subscription',
      p_source: 'image_task:task-456:queue_cancel_refund',
      p_metadata: expect.objectContaining({
        billingPhase: 'queue_cancel_refund',
        cancelledTaskStatus: 'running',
        taskId: 'task-456'
      })
    });
    expect(queryCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'eq',
          column: 'status',
          value: 'running'
        }),
        expect.objectContaining({
          method: 'update',
          payload: expect.objectContaining({
            status: 'cancelled',
            error_message: '用户中止正在进行的生图任务',
            result_payload: expect.objectContaining({
              cancelledTaskStatus: 'running',
              interruptMode: 'soft'
            })
          })
        })
      ])
    );
  });

  it('falls back to the legacy image refund RPC when the unified refund RPC is unavailable', async () => {
    const queuedTask = {
      id: 'task-fallback',
      user_id: 'user-123',
      status: 'queued',
      request_payload: {
        prepaidCredit: {
          consumed: 240,
          creditType: 'media',
          creditBreakdown: { media: 240 }
        }
      },
      refund_failed: null
    };
    const cancelledTask = {
      ...queuedTask,
      status: 'cancelled',
      result_payload: {
        success: true,
        cancelled: true,
        cancelledTaskStatus: 'queued',
        interruptMode: 'queue'
      }
    };
    const sb = {
      from: vi
        .fn()
        .mockReturnValueOnce(makeQuery({ data: queuedTask, error: null }))
        .mockReturnValueOnce(makeQuery({ data: cancelledTask, error: null }))
        .mockReturnValueOnce(makeQuery({ data: null, error: null })),
      rpc: vi
        .fn()
        .mockResolvedValueOnce({
          data: null,
          error: { message: 'function refund_generation_credit not found' }
        })
        .mockResolvedValueOnce({
          data: { success: true, refunded: 240 },
          error: null
        })
    };

    const response = await handleCancelImageTaskRequest({
      sb: sb as never,
      userId: 'user-123',
      taskId: 'task-fallback',
      corsHeaders: {}
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      refunded: 240,
      refundFailed: false
    });
    expect(sb.rpc).toHaveBeenNthCalledWith(
      1,
      'refund_generation_credit',
      expect.objectContaining({
        p_credit_type: 'media',
        p_source: 'image_task:task-fallback:queue_cancel_refund'
      })
    );
    expect(sb.rpc).toHaveBeenNthCalledWith(
      2,
      'refund_image_generation_credit',
      expect.objectContaining({
        p_credit_type: 'media'
      })
    );
  });

  it('treats an already cancelled task as an idempotent success without refunding again', async () => {
    const cancelledTask = {
      id: 'task-123',
      user_id: 'user-123',
      status: 'cancelled',
      request_payload: {
        prepaidCredit: { consumed: 320, creditType: 'bonus' }
      },
      refund_failed: false
    };
    const sb = {
      from: vi
        .fn()
        .mockReturnValueOnce(makeQuery({ data: cancelledTask, error: null })),
      rpc: vi.fn()
    };
    const response = await handleCancelImageTaskRequest({
      sb: sb as never,
      userId: 'user-123',
      taskId: 'task-123',
      corsHeaders: {}
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      taskId: 'task-123',
      status: 'cancelled',
      refundFailed: false
    });
    expect(sb.rpc).not.toHaveBeenCalled();
  });
});
