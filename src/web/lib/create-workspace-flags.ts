import {
  CREATE_WORKSPACE_FEATURE_FLAGS,
  type CreateWorkspaceFeatureFlag
} from '@/shared/create-workspace-v2';
import { isLoopbackHostname } from '@/utils/env';

const STORAGE_KEY = 'webtomind:create-workspace-feature-flags';

export function isCreateWorkspaceOverrideHost(hostname: string): boolean {
  return isLoopbackHostname(hostname);
}

function canReadLocalOverrides(): boolean {
  return (
    import.meta.env.DEV ||
    (typeof window !== 'undefined' &&
      isCreateWorkspaceOverrideHost(window.location.hostname))
  );
}

function isLocalWorkspaceHarness(): boolean {
  return (
    typeof window !== 'undefined' &&
    isCreateWorkspaceOverrideHost(window.location.hostname)
  );
}

function configuredFlags(): Set<string> {
  const configured = String(import.meta.env.VITE_CREATE_WORKSPACE_FLAGS || '')
    .split(',')
    .map((flag) => flag.trim())
    .filter(Boolean);
  // A production-mode Vite preview still needs the complete v2 workspace so
  // visual audits and local walkthroughs do not silently fall back to the old
  // pages. This branch is host-gated and can never activate on production.
  if (import.meta.env.DEV || isLocalWorkspaceHarness()) {
    // 本地默认开启全部 v2 工作台能力，但激活旅程除外：避免验收时导航被
    // 「未完成首张商业图生成」隐藏视频/应用入口。需要验收激活流程时，
    // 可通过 localStorage webtomind:create-workspace-feature-flags 显式加入。
    Object.values(CREATE_WORKSPACE_FEATURE_FLAGS)
      .filter(
        (flag) =>
          flag !== CREATE_WORKSPACE_FEATURE_FLAGS.activationJourneyV1
      )
      .forEach((flag) => configured.push(flag));
  }
  if (typeof window !== 'undefined' && canReadLocalOverrides()) {
    try {
      const stored = JSON.parse(
        window.localStorage.getItem(STORAGE_KEY) || '[]'
      );
      if (Array.isArray(stored)) {
        stored
          .filter((flag): flag is string => typeof flag === 'string')
          .forEach((flag) => configured.push(flag));
      }
    } catch {
      // Invalid internal rollout overrides must not break creation routes.
    }
  }
  return new Set(configured);
}

export function isCreateWorkspaceFeatureEnabled(
  flag: CreateWorkspaceFeatureFlag
): boolean {
  return configuredFlags().has(flag);
}
