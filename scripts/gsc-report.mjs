#!/usr/bin/env node
import {
  googleReportClient,
  reportWindow,
  saveGoogleReport
} from './lib/google-report.mjs';

async function main() {
  const client = googleReportClient('webmasters.readonly', 'GSC');
  const site = process.env.GSC_SITE_URL || 'sc-domain:webtomind.com';
  // Search Console dates are Pacific time; use finalized data with a three-day lag.
  const window = reportWindow('America/Los_Angeles', 30, 3);
  try {
    const auth = await client.auth.getClient();
    const { data } = await auth.request({
      url: `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
      method: 'POST',
      data: { ...window, type: 'web', dataState: 'final' },
      timeout: 30000
    });
    await saveGoogleReport('gsc', {
      generatedAt: new Date().toISOString(),
      windowDays: 30,
      dateRange: window,
      timeZone: 'America/Los_Angeles',
      site,
      dataState: 'final',
      totals: {
        current: data.rows?.[0] || {
          clicks: 0,
          impressions: 0,
          ctr: 0,
          position: 0
        }
      }
    });
  } finally {
    await client.close();
  }
}
main().catch((error) => {
  console.error(
    '[gsc-report]',
    error.response?.status || error.code || error.message
  );
  process.exitCode = 1;
});
