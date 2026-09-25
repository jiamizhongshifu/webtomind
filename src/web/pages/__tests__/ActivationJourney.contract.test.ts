import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

const imagePage = source('src/web/pages/ImageCreatePage.tsx');
const homePage = source('src/web/pages/CreateHomePage.tsx');
const workspaceApp = source('src/workspace/App.tsx');
const authModal = source('src/web/components/AuthModal.tsx');
const discoveryHandoff = source('src/web/lib/discovery-recreate.ts');
const analytics = source('src/web/lib/analytics.ts');
const workspaceFlags = source('src/shared/create-workspace-v2.ts');
const sideNav = source('src/web/components/image-create/CreateSideNav.tsx');
const studioComposer = source(
  'src/web/components/image-create/ImageStudioComposer.tsx'
);
const activationStatus = source('src/web/lib/use-activation-status.ts');
const teachingHints = source('src/web/lib/activation-teaching-hints.ts');
const serverObservability = source('api/image/task-observability.ts');

describe('single activation journey contract', () => {
  it('does not auto-open either legacy onboarding modal in product routes', () => {
    expect(imagePage).not.toContain('CreateOnboardingModal');
    expect(homePage).not.toContain('CreateOnboardingModal');
    expect(workspaceApp).not.toContain('showOnboarding');
    expect(workspaceApp).not.toContain('hasSeenOnboarding');
  });

  it('uses creation discovery as the generic authenticated entry', () => {
    expect(authModal).toContain("navigate(options.redirectTo || '/create'");
    expect(authModal).not.toContain("options.redirectTo || '/boards'");
  });

  it('preserves discovery context without silently spending credits', () => {
    expect(discoveryHandoff).toContain("newSession: '1'");
    expect(discoveryHandoff).toContain("source: 'discovery_recreate'");
    expect(discoveryHandoff).not.toContain("autoGenerate: '1'");
  });

  it('keeps activation measurement split between client steps and durable success', () => {
    expect(analytics).toContain("'activation_context_ready'");
    expect(analytics).toContain("'first_generate_cta_view'");
    expect(analytics).toContain("'first_result_next_action'");
    expect(serverObservability).toContain(
      "eventName: 'first_generation_succeeded'"
    );
    expect(serverObservability).toContain(
      'idempotencyKey: `first_generation_succeeded:${input.task.user_id}`'
    );
  });

  it('ships the journey behind an independent production rollout switch', () => {
    expect(workspaceFlags).toContain(
      "activationJourneyV1: 'activation_journey_v1'"
    );
    expect(sideNav).toContain('CREATE_WORKSPACE_FEATURE_FLAGS.activationJourneyV1');
    expect(sideNav).toContain('hideFutureCreationEntries');
  });

  it('uses the durable membership task as the activation truth', () => {
    expect(activationStatus).toContain('/api/membership/tasks');
    expect(activationStatus).toContain(
      "const ACTIVATION_TASK_IDENTIFIER = 'generate_first_commercial_image'"
    );
    expect(sideNav).toContain('useActivationStatus(user?.id || null)');
    expect(homePage).toContain("banner.id !== 'video-generation'");
  });

  it('keeps behavioral teaching hints versioned and dismissible', () => {
    expect(teachingHints).toContain(
      "const HINTS_STORAGE_KEY = 'webtomind:activation-teaching-hints:v1'"
    );
    expect(teachingHints).toContain(
      "const RETURN_VISIT_STORAGE_KEY = 'webtomind:activation-return-visit:v1'"
    );
  });

  it('surfaces the dynamic total cost inside the merged generate control', () => {
    expect(studioComposer).toContain("label={\n                isProcessing\n                  ? '处理中'\n                  : firstCreationMode\n                    ? '生成第一张'\n                    : '生成'\n              }");
    expect(studioComposer).toContain('<CreationCreditEstimate');
    expect(studioComposer).toContain('unit="total"');
    expect(studioComposer).toContain('${estimatedCost} 积分');
  });
});
