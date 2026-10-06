import { describe, expect, it } from 'vitest';
import {
  getPublicModelDescription,
  getPublicRequestEndpoints
} from '../../api/api-marketplace/public-model';
import type { ApiMarketplaceModel } from '../../api/api-marketplace/runtime';
const model = {
  description: '输入图片免费，按成功输出的图片数量计费，0.22元/张',
  pricingMode: 'token',
  customer: { currency: 'USD' },
  pricing: {
    inputPerMillion: 97.5,
    outputPerMillion: 97.5,
    requestPrice: null
  },
  endpointDetails: {
    image: { path: '/v1/images/generations' },
    vendor: { path: '/vendor/video' }
  }
} as unknown as ApiMarketplaceModel;
describe('public model contract', () => {
  it('uses the ledger price instead of contradictory upstream prose', () => {
    expect(getPublicModelDescription(model)).toContain(
      '输入 97.5、输出 97.5 USD / 百万 Token'
    );
    expect(getPublicModelDescription(model)).not.toMatch(/免费|0.22|张/);
  });
  it('retains descriptions without billing claims', () => {
    expect(
      getPublicModelDescription({
        ...model,
        description: '支持图片编辑与高清输出'
      })
    ).toBe('支持图片编辑与高清输出');
  });
  it('uses the normalized request price', () => {
    expect(
      getPublicModelDescription({
        ...model,
        pricingMode: 'request',
        pricing: { ...model.pricing, requestPrice: 0.065 }
      })
    ).toContain('0.065 USD / 次');
  });
  it('only publishes declared paths reachable through the gateway', () => {
    expect(getPublicRequestEndpoints(model)).toEqual(['/images/generations']);
    expect(
      getPublicRequestEndpoints({ ...model, endpointDetails: {} })
    ).toEqual([]);
  });
});
