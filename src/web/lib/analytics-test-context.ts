export const ANALYTICS_TEST_RUN_STORAGE_KEY = 'webtomind:test-run:v1';

export type AnalyticsTrafficContext = Partial<{
  traffic_type: 'internal_test';
  test_run_id: string;
}>;

export function getAnalyticsTrafficContext(): AnalyticsTrafficContext {
  if (typeof window === 'undefined') return {};
  try {
    const testRunId = window.localStorage
      .getItem(ANALYTICS_TEST_RUN_STORAGE_KEY)
      ?.trim()
      .slice(0, 120);
    return testRunId
      ? { traffic_type: 'internal_test', test_run_id: testRunId }
      : {};
  } catch {
    return {};
  }
}

export function isInternalAnalyticsTestRun(): boolean {
  return getAnalyticsTrafficContext().traffic_type === 'internal_test';
}
