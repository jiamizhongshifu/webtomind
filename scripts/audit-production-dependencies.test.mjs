import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateAuditReport,
  findImageSizeSignalsInFiles,
  findRscSignalsInFiles,
  shouldInspectAuditSource
} from './audit-production-dependencies.mjs';

const reactRouterRscAdvisory = {
  github_advisory_id: 'GHSA-qwww-vcr4-c8h2',
  module_name: 'react-router',
  severity: 'high',
  title: 'React Router RSC CSRF bypass'
};

const imageSizeIcnsAdvisory = {
  github_advisory_id: 'GHSA-w3rx-r6r6-pgpr',
  module_name: 'image-size',
  severity: 'high',
  title: 'image-size ICNS parser infinite loop'
};

const imageSizeJxlAdvisory = {
  github_advisory_id: 'GHSA-5p2g-fcmc-qvqq',
  module_name: 'image-size',
  severity: 'high',
  title: 'image-size JXL/HEIF parser infinite loop'
};

test('ignores the verified non-applicable React Router RSC advisory', () => {
  const result = evaluateAuditReport({
    advisories: { 1124282: reactRouterRscAdvisory }
  });

  assert.equal(result.ignored.length, 1);
  assert.equal(result.actionable.length, 0);
});

test('blocks the exemption when React Router RSC usage appears', () => {
  const result = evaluateAuditReport(
    { advisories: { 1124282: reactRouterRscAdvisory } },
    {
      rscSignals: [
        'vite.config.web.ts: unstable_reactRouterRSC',
        'src/entry.rsc.tsx: entry.rsc.tsx'
      ]
    }
  );

  assert.equal(result.ignored.length, 0);
  assert.equal(result.actionable.length, 1);
  assert.match(result.actionable[0].reason, /RSC usage guard found/u);
});

test('ignores the verified non-applicable image-size advisories', () => {
  const result = evaluateAuditReport({
    advisories: {
      2000001: imageSizeIcnsAdvisory,
      2000002: imageSizeJxlAdvisory
    }
  });

  assert.equal(result.ignored.length, 2);
  assert.equal(result.actionable.length, 0);
});

test('blocks the image-size exemption when image-size usage appears', () => {
  const result = evaluateAuditReport(
    { advisories: { 2000001: imageSizeIcnsAdvisory } },
    {
      imageSizeSignals: [
        'api/ppt/generate.ts: from \'image-size\''
      ]
    }
  );

  assert.equal(result.ignored.length, 0);
  assert.equal(result.actionable.length, 1);
  assert.match(result.actionable[0].reason, /image-size usage guard found/u);
});

test('detects image-size imports and requires in tracked sources', () => {
  const signals = findImageSizeSignalsInFiles({
    'api/ppt/generate.ts': "import { imageSize } from 'image-size';",
    'server/src/tools/slide-deck.ts':
      "const size = require('image-size');",
    'src/web/lib/generate-pptx.ts': "const s = await import('image-size');"
  });

  assert.equal(signals.length, 3);
});

test('keeps every other moderate-or-higher advisory actionable', () => {
  const result = evaluateAuditReport({
    advisories: {
      1124282: reactRouterRscAdvisory,
      9999999: {
        github_advisory_id: 'GHSA-example-other',
        module_name: 'other-package',
        severity: 'moderate',
        title: 'Another vulnerability'
      }
    }
  });

  assert.equal(result.ignored.length, 1);
  assert.equal(result.actionable.length, 1);
  assert.equal(
    result.actionable[0].advisory.github_advisory_id,
    'GHSA-example-other'
  );
});

test('preserves the moderate audit threshold for low-severity advisories', () => {
  const result = evaluateAuditReport({
    advisories: {
      9999998: {
        github_advisory_id: 'GHSA-example-low',
        module_name: 'low-risk-package',
        severity: 'low',
        title: 'Low-severity vulnerability'
      }
    }
  });

  assert.equal(result.ignored.length, 0);
  assert.equal(result.actionable.length, 0);
});

test('detects framework and data-mode RSC entry points', () => {
  const signals = findRscSignalsInFiles({
    'vite.config.ts':
      'import { unstable_reactRouterRSC } from "@react-router/dev/vite";',
    'src/client.tsx':
      'import { unstable_RSCHydratedRouter } from "react-router";',
    'src/regular.tsx': 'import { BrowserRouter } from "react-router-dom";'
  });

  assert.deepEqual(signals, [
    'vite.config.ts: unstable_reactRouterRSC',
    'src/client.tsx: unstable_RSCHydratedRouter'
  ]);
});

test('does not let the audit guard detect its own rule definitions', () => {
  assert.equal(
    shouldInspectAuditSource('scripts/audit-production-dependencies.mjs'),
    false
  );
  assert.equal(
    shouldInspectAuditSource('scripts/audit-production-dependencies.test.mjs'),
    false
  );
  assert.equal(shouldInspectAuditSource('vite.config.web.ts'), true);
  assert.equal(shouldInspectAuditSource('src/web/main.tsx'), true);
});
