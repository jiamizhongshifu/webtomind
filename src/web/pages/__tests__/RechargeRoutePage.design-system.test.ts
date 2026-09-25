import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(
  join(process.cwd(), 'src/web/pages/RechargeRoutePage.tsx'),
  'utf8'
);
const presentationSource = readFileSync(
  join(process.cwd(), 'src/web/pages/RechargePresentation.tsx'),
  'utf8'
);
const pageStyles = readFileSync(
  join(process.cwd(), 'src/web/pages/RechargePage.css'),
  'utf8'
);
const workspaceRouteSource = readFileSync(
  join(process.cwd(), 'src/web/pages/CreateRechargePage.tsx'),
  'utf8'
);
const mainSource = readFileSync(
  join(process.cwd(), 'src/web/main.tsx'),
  'utf8'
);
const presentationRouteSource = readFileSync(
  join(process.cwd(), 'src/web/lib/pricing-route.ts'),
  'utf8'
);
const compact = (source: string) => source.replace(/\s+/g, ' ');

describe('RechargeRoutePage product and checkout contracts', () => {
  it('fails closed when current package prices cannot be loaded', () => {
    expect(pageSource).not.toContain('fallbackPackages');
    expect(pageSource).not.toMatch(/price:\s*(?:500|2000|6000)\b/);
    expect(pageSource).toContain('packagesError');
    expect(presentationSource).toContain('当前无法确认最新价格');
    expect(presentationSource).toContain('onRetryPackages');
  });

  it('supports card and Alipay checkout with a safe POST redirect', () => {
    expect(presentationSource).toContain(
      "export type RechargePaymentMethod = 'stripe' | 'alipay'"
    );
    expect(pageSource).toContain('paymentProvider: requestedPaymentMethod');
    expect(pageSource).toContain('redirectToCheckout(session)');
    expect(pageSource).not.toContain('window.location.href = session.url');
    expect(pageSource).toContain('paymentProvider: requestedPaymentMethod');
  });

  it('embeds the existing public recharge route in the creator workspace', () => {
    expect(workspaceRouteSource).toContain(
      '<CreateWorkspaceShell className="create-recharge-page">'
    );
    expect(workspaceRouteSource).toContain('<RechargeRoutePage embedded />');
    expect(compact(mainSource)).toContain(
      '<Route path="/zh-CN/recharge" element={<CreateRechargePage />} />'
    );
  });

  it('links plan comparison to the canonical creator workspace pricing URL', () => {
    expect(presentationSource).toContain(
      'to={getWorkspacePricingHref('
    );
    expect(presentationSource).toContain(
      "`?returnTo=${encodeURIComponent(pricingReturnTo)}`"
    );
    expect(pageSource).toContain('returnTo={paywallReturnTo}');
    expect(pageSource).toContain(
      "const paywallReturnTo = collapsePaywallReturnTo("
    );
    expect(presentationRouteSource).toContain(
      "params.set('source', 'creator_sidebar')"
    );
    expect(presentationRouteSource).toContain(
      'return `${localePrefix}/create/pricing?${params.toString()}`'
    );
    expect(compact(mainSource)).toContain(
      'path="/zh-CN/create/pricing" element={<CreateWorkspacePricingRoute />}'
    );
  });

  it('uses Apple-style system tokens with accessible motion and touch fallbacks', () => {
    expect(pageStyles).toContain('--recharge-blue: #0071e3');
    expect(pageStyles).toContain('-apple-system');
    expect(pageStyles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(pageStyles).toContain(
      '@media (prefers-reduced-transparency: reduce)'
    );
    expect(pageStyles).toMatch(
      /\.recharge-pack-button\s*\{[\s\S]*?min-height:\s*50px\s*!important/
    );
    expect(pageStyles).toContain('overflow-x: clip');
  });
});
