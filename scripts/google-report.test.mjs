import test from 'node:test';
import assert from 'node:assert/strict';
import { ga4Quality, reportWindow } from './lib/google-report.mjs';
test('uses calendar days in the source timezone, including DST boundary', () => {
  assert.deepEqual(
    reportWindow(
      'America/Los_Angeles',
      30,
      3,
      new Date('2026-03-09T02:00:00Z')
    ),
    { startDate: '2026-02-04', endDate: '2026-03-05' }
  );
});
test('does not turn missing denominators into a usable report', () => {
  assert.equal(ga4Quality({}, {}, []).status, 'degraded');
  const good = ga4Quality({ sessions: 100 }, { sessions: 4 }, [
    { eventName: 'page_view', eventCount: 180 },
    { eventName: 'session_start', eventCount: 100 }
  ]);
  assert.equal(good.status, 'usable');
  assert.equal(good.notSetLandingSessionShare, 0.04);
  assert.equal(good.pageViewPerSessionStart, 1.8);
});
