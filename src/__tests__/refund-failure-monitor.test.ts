import { describe, expect, it } from 'vitest';
import {
  buildRefundFailureAlert,
  findRecentRefundFailures
} from '../../api/credits/refund-failure-monitor';

type Filter = [string, string, unknown];

function createSupabaseMock(
  rowsByTable: Record<string, Array<{ id: string }>>,
  errorTable?: string
): { client: never; filters: Record<string, Filter[]> } {
  const filters: Record<string, Filter[]> = {};
  const client = {
    from: (table: string): Record<string, unknown> => {
      filters[table] = [];
      const query: Record<string, unknown> = {};
      const record =
        (op: string) =>
        (column: string, value?: unknown): Record<string, unknown> => {
          filters[table].push([op, column, value]);
          return query;
        };
      query.select = record('select');
      query.eq = record('eq');
      query.gte = record('gte');
      query.lt = record('lt');
      query.order = record('order');
      query.limit = async (): Promise<unknown> =>
        table === errorTable
          ? { data: null, error: { message: 'relation unavailable' } }
          : { data: rowsByTable[table] || [], error: null };
      return query;
    }
  };
  return { client: client as never, filters };
}

const WINDOW_START = new Date('2026-09-25T08:00:00.000Z');
const WINDOW_END = new Date('2026-09-25T08:10:00.000Z');

describe('refund failure monitor', () => {
  it('lists refund-failed image and video tasks inside the cron window', async () => {
    const mock = createSupabaseMock({
      image_generation_tasks: [{ id: 'img-1' }, { id: 'img-2' }],
      video_generation_tasks: [{ id: 'vid-1' }]
    });

    const scan = await findRecentRefundFailures(mock.client, WINDOW_START, WINDOW_END);

    expect(scan.taskIds).toEqual({ image: ['img-1', 'img-2'], video: ['vid-1'] });
    expect(scan.errors).toEqual([]);
    expect(mock.filters.image_generation_tasks).toEqual(
      expect.arrayContaining([
        ['eq', 'refund_failed', true],
        ['gte', 'updated_at', WINDOW_START.toISOString()],
        ['lt', 'updated_at', WINDOW_END.toISOString()]
      ])
    );

    const alert = buildRefundFailureAlert(scan);
    expect(alert?.subject).toContain('图片 2 / 视频 1');
    expect(alert?.text).toContain('img-2');
    expect(alert?.text).toContain('vid-1');
  });

  it('does not alert when no refund failed in the window', async () => {
    const mock = createSupabaseMock({});
    const scan = await findRecentRefundFailures(mock.client, WINDOW_START, WINDOW_END);
    expect(buildRefundFailureAlert(scan)).toBeNull();
  });

  it('keeps scanning the other table when one query fails', async () => {
    const mock = createSupabaseMock(
      { video_generation_tasks: [{ id: 'vid-9' }] },
      'image_generation_tasks'
    );
    const scan = await findRecentRefundFailures(mock.client, WINDOW_START, WINDOW_END);
    expect(scan.errors).toEqual(['image: relation unavailable']);
    expect(scan.taskIds.video).toEqual(['vid-9']);
    expect(buildRefundFailureAlert(scan)?.subject).toContain('视频 1');
  });
});
