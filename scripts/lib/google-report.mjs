import fs from 'node:fs/promises';
import path from 'node:path';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { loadRuntimeEnv } from './runtime-env.mjs';

export function googleReportClient(
  scope = 'analytics.readonly',
  prefix = 'GA4'
) {
  loadRuntimeEnv();
  const encoded =
    process.env[`${prefix}_SERVICE_ACCOUNT_JSON_B64`] ||
    process.env.GA4_SERVICE_ACCOUNT_JSON_B64;
  const raw = encoded
    ? Buffer.from(encoded, 'base64').toString('utf8')
    : process.env[`${prefix}_SERVICE_ACCOUNT_JSON`] ||
      process.env.GA4_SERVICE_ACCOUNT_JSON;
  let credentials;
  try {
    credentials = raw ? JSON.parse(raw) : undefined;
  } catch {
    throw new Error('Invalid Google service-account JSON (content omitted)');
  }
  return new BetaAnalyticsDataClient({
    ...(credentials ? { credentials } : {}),
    scopes: [`https://www.googleapis.com/auth/${scope}`]
  });
}

export function reportWindow(
  timeZone,
  days = 30,
  lagDays = 1,
  now = new Date()
) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
  const end = new Date(`${today}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() - lagDays);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10)
  };
}

export async function saveGoogleReport(kind, report) {
  const directory = path.resolve(
    'outputs',
    kind,
    report.generatedAt.slice(0, 10)
  );
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const destination = path.join(directory, `${kind}-report.json`);
  const temporary = `${destination}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(report, null, 2), {
    mode: 0o600
  });
  await fs.rename(temporary, destination);
  console.log(`${kind.toUpperCase()} report saved: ${destination}`);
}

export function ga4Rows(report) {
  return (report.rows || []).map((row) =>
    Object.fromEntries([
      ...(report.dimensionHeaders || []).map((header, index) => [
        header.name,
        row.dimensionValues?.[index]?.value || ''
      ]),
      ...(report.metricHeaders || []).map((header, index) => [
        header.name,
        Number(row.metricValues?.[index]?.value || 0)
      ])
    ])
  );
}

export function ga4Quality(totals, notSet, events) {
  const sessions = Number(totals.sessions || 0);
  const starts = Number(
    events.find((row) => row.eventName === 'session_start')?.eventCount || 0
  );
  const views = Number(
    events.find((row) => row.eventName === 'page_view')?.eventCount || 0
  );
  const share = sessions ? Number(notSet.sessions || 0) / sessions : null;
  const ratio = starts ? views / starts : null;
  const blockingReasons = [];
  if (share === null) blockingReasons.push('No sessions available');
  else if (share > 0.05)
    blockingReasons.push('(not set) landing sessions exceed 5%');
  if (ratio === null || ratio < 0.8)
    blockingReasons.push('page_view/session_start below 0.8 or unavailable');
  return {
    status: blockingReasons.length ? 'degraded' : 'usable',
    blockingReasons,
    notSetLandingSessionShare: share,
    pageViewPerSessionStart: ratio,
    thresholds: {
      notSetLandingSessionShare: 0.05,
      minPageViewPerSessionStart: 0.8
    }
  };
}
