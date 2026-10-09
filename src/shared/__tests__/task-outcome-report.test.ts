import { expect, it, vi } from 'vitest';
import {
  countFirstSuccessUsers,
  loadTaskOutcomeReport
} from '../task-outcome-report';
it('uses exact task counts including policy failures and keeps cancelled tasks separate', async () => {
  const from = vi.fn(() => {
    const q = {
      select: vi.fn(),
      gte: vi.fn(),
      eq: vi.fn((_key: string, status: string) =>
        Promise.resolve({
          count: { succeeded: 60, failed: 40, cancelled: 7 }[status],
          error: null
        })
      )
    };
    q.select.mockReturnValue(q);
    q.gte.mockReturnValue(q);
    return q;
  });
  const result = await loadTaskOutcomeReport({ from } as never, '2026-10-01');
  expect(result.image).toEqual({
    succeeded: 60,
    failed: 40,
    cancelled: 7,
    successRate: 0.6
  });
  expect(from).toHaveBeenCalledWith('image_generation_tasks');
});
it('paginates first-success events separately from noisy SEO events and deduplicates users', async () => {
  const range = vi
    .fn()
    .mockResolvedValueOnce({
      data: Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        user_id: `u${i}`
      })),
      error: null
    })
    .mockResolvedValueOnce({
      data: [
        { id: 1001, user_id: 'u0' },
        { id: 1002, user_id: 'u1000' }
      ],
      error: null
    });
  const q = {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    range
  };
  for (const method of ['select', 'eq', 'gte', 'or', 'order'] as const)
    q[method].mockReturnValue(q);
  expect(
    await countFirstSuccessUsers({ from: () => q } as never, '2026-10-01')
  ).toBe(1001);
  expect(range).toHaveBeenNthCalledWith(2, 1000, 1999);
  expect(q.eq).toHaveBeenCalledWith('event_name', 'first_generation_succeeded');
});
it('fails visibly when canonical counts are unavailable', async () => {
  const q = {
    select: () => q,
    gte: () => q,
    eq: async () => ({ error: { message: 'offline' }, count: null })
  };
  await expect(
    loadTaskOutcomeReport({ from: () => q } as never, '2026-10-01')
  ).rejects.toThrow('unavailable');
});
