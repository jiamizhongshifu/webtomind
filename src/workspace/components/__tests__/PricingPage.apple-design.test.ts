import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const pricingPageSource = readFileSync(
  join(process.cwd(), 'src/workspace/components/PricingPage.tsx'),
  'utf8'
);
const presentationSource = readFileSync(
  join(process.cwd(), 'src/workspace/components/PricingPresentation.tsx'),
  'utf8'
);
const creatorWorkspaceStyles = readFileSync(
  join(process.cwd(), 'src/web/styles/create-workspace-v2.css'),
  'utf8'
);
const pricingStyles = [
  'PricingPage.css',
  'PricingPagePlans.css',
  'PricingPageDetails.css',
  'PricingPageResponsive.css'
]
  .map((fileName) =>
    readFileSync(
      join(process.cwd(), 'src/workspace/components', fileName),
      'utf8'
    )
  )
  .join('\n');

describe('PricingPage Apple design contract', () => {
  it('keeps visual hooks semantic and separate from checkout behavior', () => {
    expect(pricingPageSource).toContain('pricing-navigation');
    expect(pricingPageSource).toContain('pricing-krea-title');
    expect(pricingPageSource).toContain('pricing-plan-price-row');
    expect(pricingPageSource).toContain('pricing-plan-action');
    expect(pricingPageSource).toContain('pricing-trust-card');
    expect(presentationSource).toContain('data-method="alipay"');
    expect(presentationSource).toContain('pricing-faq-item');
  });

  it('uses scoped materials, optical typography, and immediate press feedback', () => {
    expect(pricingStyles).toContain('--pricing-canvas: #f5f5f7');
    expect(pricingStyles).toContain('backdrop-filter: blur(24px)');
    expect(pricingStyles).toContain('font-optical-sizing: auto');
    expect(pricingStyles).toMatch(
      /\.pricing-plan-price[\s\S]*font-variant-numeric: tabular-nums/
    );
    expect(pricingStyles).toMatch(
      /\.pricing-billing-choice:active[\s\S]*transform: scale\(0\.96\)/
    );
    expect(pricingStyles).toMatch(
      /\.pricing-plan-action button[\s\S]*min-height: 50px/
    );
  });

  it('provides motion, transparency, contrast, and mobile fallbacks', () => {
    expect(pricingStyles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(pricingStyles).toContain(
      '@media (prefers-reduced-transparency: reduce)'
    );
    expect(pricingStyles).toContain('@media (prefers-contrast: more)');
    expect(pricingStyles).toMatch(
      /@media \(max-width: 639px\)[\s\S]*\.pricing-payment-method-switch[\s\S]*width: 100%/
    );
    expect(pricingStyles).toMatch(
      /@container pricing-page \(max-width: 820px\)[\s\S]*\.pricing-plan-grid[\s\S]*grid-template-columns: 1fr/
    );
  });

  it('keeps the creator-shell route visually synchronized with the shared surface', () => {
    expect(pricingStyles).toMatch(
      /\.create-pricing-embedded \.pricing-product-os[\s\S]*min-height: 100dvh/
    );
    expect(pricingStyles).toMatch(
      /@container pricing-page \(min-width: 640px\) and \(max-width: 820px\)[\s\S]*\.create-pricing-embedded \.pricing-plan-grid[\s\S]*repeat\(2/
    );
    expect(creatorWorkspaceStyles).toContain(
      '.create-pricing-page.create-workspace-v2'
    );
    expect(creatorWorkspaceStyles).not.toContain(
      '.create-pricing-embedded .pricing-krea-plan-card'
    );
    expect(creatorWorkspaceStyles).not.toContain(
      'linear-gradient(180deg, #38140c'
    );
  });
});
