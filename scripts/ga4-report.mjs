#!/usr/bin/env node
import {
  googleReportClient,
  ga4Rows,
  ga4Quality,
  saveGoogleReport
} from './lib/google-report.mjs';

async function main() {
  const client = googleReportClient();
  const property = process.env.GA4_PROPERTY_ID?.replace(/^properties\//, '');
  if (!/^\d+$/.test(property || ''))
    throw new Error('GA4_PROPERTY_ID is required');
  const base = {
    property: `properties/${property}`,
    dateRanges: [{ startDate: '30daysAgo', endDate: 'yesterday' }]
  };
  const run = async (dimensions, metrics, filter) => {
    const [report] = await client.runReport(
      {
        ...base,
        dimensions: dimensions.map((name) => ({ name })),
        metrics: metrics.map((name) => ({ name })),
        ...(filter ? { dimensionFilter: filter } : {}),
        limit: 1000
      },
      { timeout: 30000 }
    );
    return {
      rows: ga4Rows(report),
      rowCount: report.rowCount || 0,
      metadata: report.metadata
    };
  };
  const missingLanding = {
    filter: {
      fieldName: 'landingPagePlusQueryString',
      stringFilter: { matchType: 'EXACT', value: '(not set)' }
    }
  };
  try {
    const [totals, notSet, notSetLandingBySource, events, sources] =
      await Promise.all([
        run(
          [],
          ['totalUsers', 'sessions', 'screenPageViews', 'engagedSessions']
        ),
        run([], ['sessions'], missingLanding),
        run(
          ['sessionSourceMedium'],
          ['sessions', 'screenPageViews'],
          missingLanding
        ),
        run(['eventName'], ['eventCount']),
        run(['sessionSourceMedium'], ['sessions', 'totalUsers'])
      ]);
    await saveGoogleReport('ga4', {
      generatedAt: new Date().toISOString(),
      windowDays: 30,
      dateRange: base.dateRanges[0],
      timeZone: totals.metadata?.timeZone,
      totals: totals.rows[0] || {},
      dataQuality: ga4Quality(
        totals.rows[0] || {},
        notSet.rows[0] || {},
        events.rows
      ),
      data: { notSetLandingBySource, events, sources }
    });
  } finally {
    await client.close();
  }
}
main().catch((error) => {
  console.error('[ga4-report]', error.code || error.message);
  process.exitCode = 1;
});
