import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const policyConsumers = [
  'src/workspace/components/SettingsPage.tsx',
  'src/workspace/components/WorkbenchTopbar.tsx',
  'src/workspace/App.tsx'
];

describe('free credit UI policy contract', () => {
  it('uses the shared free-credit constant instead of the retired 300 fallback', () => {
    for (const relativePath of policyConsumers) {
      const source = readFileSync(resolve(process.cwd(), relativePath), 'utf8');
      expect(source).toContain('FREE_DAILY_CREDITS');
      expect(source).not.toContain('dailyMax || 300');
    }
  });

  it('keeps the settings harness on the current free plan policy', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'src/web/pages/WorkspaceSettingsTopbarHarnessPage.tsx'
      ),
      'utf8'
    );

    expect(source).toContain('dailyMax: FREE_DAILY_CREDITS');
    expect(source).not.toContain('dailyMax: 300');
  });
});
