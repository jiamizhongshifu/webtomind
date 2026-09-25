/**
 * 图片生成积分成本预估(前端展示用)。
 *
 * ⚠️ 真相源是后端 `api/image/generate.ts` 写入 consume_credits metadata 的
 * `dynamicCredits`。本文件复用同一 shared pricing 公式做前端预估。
 * 定价因子包括尺寸、质量、参考图数量和角色一致性模式，为后续官方
 * OpenAI API 的 token 成本做好分层。
 *
 * 历史教训:价格页、前端预估、后端 dynamicCredits 和 DB 上下限必须同步,
 * 否则会出现购买页承诺张数与生成前实扣不一致。
 *
 * 若将来后端改定价,必须同步改 `src/shared/image-generation-pricing.ts`。
 */

import {
  IMAGE_GENERATION_BASE_CREDIT_COST,
  estimateImageGenerationCreditCost,
  type ImageGenerationReferenceSize
} from '../../shared/image-generation-pricing';

export type ImageGenerationModel =
  | 'gpt-image'
  | 'gemini-image'
  | 'z-image'
  | string;
export type ImageGenerationQuality = 'auto' | 'low' | 'medium' | 'high';

/** 与后端 dynamicCredits 的基础档保持一致 */
export const IMAGE_GENERATION_CREDIT_COST = IMAGE_GENERATION_BASE_CREDIT_COST;

export function estimateImageGenerationCost(
  model?: ImageGenerationModel,
  imageSize?: string,
  quality?: ImageGenerationQuality,
  referenceImageCount = 0,
  referenceMode = 'none',
  referenceImageSizes?: ImageGenerationReferenceSize[]
): number {
  return estimateImageGenerationCreditCost({
    model,
    imageSize,
    quality,
    referenceImageCount,
    referenceMode,
    referenceImageSizes
  }).cost;
}
