/**
 * 生成前积分预估 + 余额校验。
 *
 * - 实时按 settings(model/imageSize/quality)估算本次大约消耗(前端预告,后端为真相源)
 * - 登录后拉取余额,并监听 credits-changed 事件(生图成功后会派发)刷新
 * - insufficientCredits:余额已加载且低于预估时为 true,用于置灰生成按钮
 *
 * 从 ImageCreatePage 抽出。
 */

import { useEffect, useState } from 'react';
import {
  getCreditsBalance,
  getImageGenerationCost
} from '@/services/credits-api';
import { detectPromptImageCount } from '@/shared/image-prompt-count';
import { resolveImageGenerationPricingSize } from '@/shared/image-generation-output-params';
import { clampImageCountForModel } from '../../data/image-creator-options';
import { estimateImageGenerationCost } from '../../data/image-generation-cost-table';
import type { ImageGenerationReferenceSize } from '../../../shared/image-generation-pricing';
import type { ImagePromptSettings } from '../../data/image-prompt-core';

export interface UseCreditsEstimateParams {
  isAuthenticated: boolean;
  settings: ImagePromptSettings;
  prompt?: string;
  referenceImageCount?: number;
  referenceMode?: string;
  referenceImageSizes?: ImageGenerationReferenceSize[];
}

export interface UseCreditsEstimateResult {
  estimatedCost: number;
  unitCost: number;
  imageCount: number;
  insufficientCredits: boolean;
  creditsBalance: number | null;
  creditsBalanceLoaded: boolean;
  creditShortfall: number;
}

export function useCreditsEstimate({
  isAuthenticated,
  settings,
  prompt = '',
  referenceImageCount = 0,
  referenceMode = 'none',
  referenceImageSizes
}: UseCreditsEstimateParams): UseCreditsEstimateResult {
  const pricingImageSize = resolveImageGenerationPricingSize({
    imageSize: settings.imageSize,
    prompt,
    promptMode: 'custom'
  });
  const [creditsBalance, setCreditsBalance] = useState<number | null>(null);
  const [creditsBalanceLoaded, setCreditsBalanceLoaded] = useState(false);
  // 真实单价:优先后端 credit_costs(/api/credits/image-cost),失败回退本地常量。
  // 这样定价改动后前端预告自动跟随,不会再出现"前端镜像与 DB 漂移"。
  const [unitCost, setUnitCost] = useState<number>(() =>
    estimateImageGenerationCost(
      settings.model,
      pricingImageSize,
      settings.quality as 'auto' | 'low' | 'medium' | 'high',
      referenceImageCount,
      referenceMode,
      referenceImageSizes
    )
  );

  useEffect(() => {
    let cancelled = false;
    const fallbackCost = estimateImageGenerationCost(
      settings.model,
      pricingImageSize,
      settings.quality as 'auto' | 'low' | 'medium' | 'high',
      referenceImageCount,
      referenceMode,
      referenceImageSizes
    );
    setUnitCost(fallbackCost);
    getImageGenerationCost({
      model: settings.model,
      imageSize: pricingImageSize,
      quality: settings.quality,
      referenceImageCount,
      referenceMode,
      ...(referenceImageSizes && referenceImageSizes.length > 0
        ? { referenceImageSizes }
        : {})
    })
      .then((cost) => {
        if (!cancelled) setUnitCost(cost);
      })
      .catch(() => {
        // 拉取失败保留本地回退值,不阻塞 UI
      });
    return () => {
      cancelled = true;
    };
  }, [
    referenceImageCount,
    referenceImageSizes,
    referenceMode,
    pricingImageSize,
    settings.model,
    settings.quality
  ]);

  useEffect(() => {
    if (!isAuthenticated) {
      setCreditsBalance(null);
      setCreditsBalanceLoaded(false);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      try {
        const data = await getCreditsBalance();
        if (cancelled) return;
        setCreditsBalance(data?.credits?.total ?? null);
        setCreditsBalanceLoaded(true);
      } catch {
        // 拉取失败也不阻塞 UI,只是不显示余额不足提示
        if (!cancelled) setCreditsBalanceLoaded(true);
      }
    };
    void refresh();
    const handler = () => void refresh();
    window.addEventListener('credits-changed', handler);
    return () => {
      cancelled = true;
      window.removeEventListener('credits-changed', handler);
    };
  }, [isAuthenticated]);

  const imageCount = clampImageCountForModel(
    settings.model,
    settings.imageCount,
    detectPromptImageCount(prompt) || 1
  );
  // 后端当前按 imageSize * imageCount 动态计费。这里使用后端返回值,失败时用同公式本地回退。
  const estimatedCost = unitCost * imageCount;

  const insufficientCredits =
    isAuthenticated &&
    creditsBalanceLoaded &&
    creditsBalance !== null &&
    creditsBalance < estimatedCost;

  const creditShortfall =
    insufficientCredits && creditsBalance !== null
      ? Math.max(0, estimatedCost - creditsBalance)
      : 0;

  return {
    estimatedCost,
    unitCost,
    imageCount,
    insufficientCredits,
    creditsBalance,
    creditsBalanceLoaded,
    creditShortfall
  };
}
