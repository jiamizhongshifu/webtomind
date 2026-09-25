import { getAccessToken } from '@/services/workspace-api';
import { getApiBaseUrl } from '@/utils/env';

export const REWARD_TASK_IDENTIFIERS = {
  generateFirstCommercialImage: 'generate_first_commercial_image',
  savePromptCaseOrPromptAsset: 'save_prompt_case_or_prompt_asset',
  useReferenceImage: 'use_reference_image',
  reuseGalleryGeneration: 'reuse_gallery_generation',
  launchCreateApp: 'launch_create_app',
  createOrOpenBoard: 'create_or_open_board'
} as const;

export type RewardTaskIdentifier =
  (typeof REWARD_TASK_IDENTIFIERS)[keyof typeof REWARD_TASK_IDENTIFIERS];

const completedTaskCache = new Set<string>();

function notifyCreditsChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('credits-changed'));
  window.dispatchEvent(new CustomEvent('CREDITS_CHANGED'));
}

export async function completeRewardTaskOnce(
  identifier: RewardTaskIdentifier
): Promise<boolean> {
  if (completedTaskCache.has(identifier)) return false;
  const token = getAccessToken();
  if (!token) return false;

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/membership/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ identifier })
    });
    const result = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
    };
    if (result.success) {
      completedTaskCache.add(identifier);
      notifyCreditsChanged();
      return true;
    }

    if (/already completed/i.test(result.error || '')) {
      completedTaskCache.add(identifier);
    }
  } catch {
    // 奖励任务是辅助反馈,不能阻断用户主流程。
  }
  return false;
}
