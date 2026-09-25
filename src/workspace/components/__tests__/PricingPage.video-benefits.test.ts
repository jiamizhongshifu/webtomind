import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CREATOR_UPGRADE_PLAN_CATALOG } from '@/shared/pricing-catalog';

const pricingSource = readFileSync(
  join(process.cwd(), 'src/workspace/components/PricingPage.tsx'),
  'utf8'
);

describe('PricingPage video generation positioning', () => {
  it('includes video generation in every subscription card tier', () => {
    expect(pricingSource).toContain('feature_freeVideoGeneration');
    expect(pricingSource).toContain('feature_proVideoGeneration');
    expect(pricingSource).toContain('feature_maxVideoGeneration');
    expect(pricingSource).toContain('VIDEO_PLAN_MARKETING_COSTS');
  });

  it('keeps video benefits in shared upgrade surfaces', () => {
    expect(
      CREATOR_UPGRADE_PLAN_CATALOG.pro.benefits['zh-CN'].join(' ')
    ).toContain('25 条 Mini');
    expect(
      CREATOR_UPGRADE_PLAN_CATALOG.max.benefits['zh-CN'].join(' ')
    ).toContain('150 条 Mini');
  });
});
