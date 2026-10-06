import {
  isEndpointAllowed,
  getModelAllowedEndpointPaths,
  type ApiMarketplaceModel
} from './runtime';

// Raw provider prose can quote a different currency, group, or billing unit.
// A customer-facing billing claim must come from the same normalized contract
// used by the gateway. Preserve capability descriptions that make no price claim.
export function getPublicModelDescription(
  model: Pick<
    ApiMarketplaceModel,
    'description' | 'pricingMode' | 'customer' | 'pricing'
  >
): string {
  if (
    !/(?:计费|收费|价格|免费|[¥￥$€]|\b(?:free|pricing|billing|price|USD|CNY)\b|\d\s*元)/i.test(
      model.description
    )
  ) {
    return model.description;
  }
  const currency = model.customer.currency;
  if (model.pricingMode === 'request') {
    return `按请求计费：${model.pricing.requestPrice ?? '待确认'} ${currency} / 次。实际扣费见 API 使用记录。`;
  }
  return `按 Token 计费：输入 ${model.pricing.inputPerMillion ?? '待确认'}、输出 ${model.pricing.outputPerMillion ?? '待确认'} ${currency} / 百万 Token。实际扣费见 API 使用记录。`;
}

export function getPublicRequestEndpoints(
  model: ApiMarketplaceModel
): string[] {
  // Do not infer a modality from a model name when the upstream omits paths.
  return [...(getModelAllowedEndpointPaths(model) || [])].filter((path) =>
    isEndpointAllowed('POST', path, model)
  );
}
